import { Router, Response } from "express";
import { z } from "zod";
import { db } from "../../db/client.js";
import { projectthemes } from "../../db/schema/projecttheme.js";
import { companythemeprofiles } from "../../db/schema/companythemeprofile.js";
import { companyprojects } from "../../db/schema/companyproject.js";
import { projectdocuments } from "../../db/schema/projectdocuments.js";
import { eq, and, isNull } from "drizzle-orm";
import {
  parseStackMarkdown,
  renderStackMarkdown,
} from "../../shared/stack-defaults.js";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createLogger } from "../lib/logger.js";
import { v7 as uuidv7 } from "uuid";
import {
  WXKANBAN_DEFAULT_THEME,
  presetsForAppType,
  renderTailwindThemeNotes,
  renderShadcnTheme,
  themeToStackDesignTokens,
  type ProjectTheme,
  type AppType,
} from "../../shared/theme-tokens.js";
import { ProjectDocumentService } from "../services/ProjectDocumentService.js";
import { companies } from "../../db/schema/company.js";
import { generateOnce } from "../ai/llm-provider.js";
import {
  captureSiteStyle,
  captureToPromptContext,
} from "../services/SiteStyleCaptureService.js";
import { capturePageOutline } from "../services/SitePageCaptureService.js";
import { outlineToBlocks, outlineHasStructure, type PageOutline } from "../services/pageBlockMapper.js";
import {
  renderHeaderComponent,
  renderFooterComponent,
  type BusinessChrome,
} from "../../shared/theme-template.js";
import { themetemplates } from "../../db/schema/themetemplate.js";
import { renderBlockCode, PALETTE, type NamedBlock, type BlockNode, type PropValue } from "../../shared/block-model.js";
// SCOPE-114 (SPEC-116 / T008–T010) — the rich bundle renderers.
import { designsystems } from "../../db/schema/designsystem.js";
import type { DesignSystemTokens } from "../../shared/design-system.js";
import type { BrandSchema } from "../../shared/brand-schema.js";
import { buildBrandStylesheet, renderShellContract } from "../../shared/brand-stylesheet.js";
import { renderBrandModesModule, renderBrandTailwindConfig } from "../../shared/brand-tailwind.js";
import {
  renderExtendedThemeCss,
  renderTailwindThemeConfig,
} from "../../shared/design-system-css.js";
import { renderControlFiles } from "../../shared/design-system-controls.js";
import { renderDesignMd } from "../../shared/design-system-doc.js";
import { intendedFontFamily } from "../../ingest/designsystems/parse.js";

// FR-006 — derive a full ProjectTheme via the LLM, ALWAYS fail-open to the
// wxKanban default on any error (never 5xx, never block). Validates the model
// output against projectThemeSchema so a malformed/partial response falls back.
// [SCOPE 062 / T012] BEGIN — `ThemeDeriveService` + derive/gallery, derive/prompt, deriv…
async function deriveThemeViaAI(appType: AppType, context: string): Promise<ProjectTheme> {
  try {
    const systemPrompt =
      "You are a design-systems expert. Output ONLY a compact JSON object — no prose, no markdown fences.";
    const userPrompt =
      `Application type: ${appType}\n${context}\n\n` +
      'Return JSON exactly: {"source":"manual","sourceRef":null,' +
      '"light":{<tokens>},"dark":{<tokens>},"radius":"0.5rem",' +
      '"typography":{"fontFamily":"system-ui, sans-serif","scale":"16px base, 1.25 modular scale"}}\n' +
      "Each token set has these 19 keys, values as BARE HSL triplets like \"222 47% 11%\": " +
      "background, foreground, card, cardForeground, popover, popoverForeground, primary, primaryForeground, " +
      "secondary, secondaryForeground, muted, mutedForeground, accent, accentForeground, destructive, " +
      "destructiveForeground, border, input, ring. Ensure foreground/background and primaryForeground/primary meet WCAG AA.";
    const raw = await generateOnce(userPrompt, { systemPrompt, temperature: 0.5, maxTokens: 1400 });
    const json = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = projectThemeSchema.safeParse(JSON.parse(json));
    if (parsed.success) return parsed.data as ProjectTheme;
  } catch {
    /* fall through to default */
  }
  return WXKANBAN_DEFAULT_THEME;
}
// [SCOPE 062 / T012] END

// [SCOPE 108 / T013] BEGIN — optional, fail-safe LLM refinement of a reconstructed block tree
const VALID_BLOCK_TYPES = new Set<string>(PALETTE);
function coerceBlockNodes(input: unknown, depth = 0): BlockNode[] | null {
  if (!Array.isArray(input) || depth > 6) return null;
  const out: BlockNode[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const type = String(r.type ?? "");
    if (!VALID_BLOCK_TYPES.has(type)) return null;
    const props = r.props && typeof r.props === "object" ? (r.props as Record<string, PropValue>) : {};
    const nodeOut: BlockNode = {
      id: typeof r.id === "string" && r.id ? r.id : `n-${depth}-${out.length}`,
      type: type as BlockNode["type"],
      props,
    };
    if (r.children !== undefined) {
      const kids = coerceBlockNodes(r.children, depth + 1);
      if (kids === null) return null;
      nodeOut.children = kids;
    }
    out.push(nodeOut);
  }
  return out;
}

// Ask the LLM to improve a deterministic reconstruction; validate strictly and fall back to
// the deterministic base on any failure (so the rebuild is never broken by a bad model reply).
async function refineBlocksViaAI(base: BlockNode[], outline: PageOutline): Promise<BlockNode[]> {
  try {
    const systemPrompt =
      "You improve a website reconstruction. Output ONLY a JSON array of block nodes — no prose, no markdown fences.";
    const typeList = [...VALID_BLOCK_TYPES].join(", ");
    const userPrompt =
      `A page was reconstructed from ${outline.url} into this draft block tree (JSON):\n` +
      `${JSON.stringify(base)}\n\n` +
      "Improve the grouping, headings and copy for clarity while staying faithful to the source. " +
      `Use ONLY these node types: ${typeList}. Containers (panel, columns, row, cardgrid) hold a "children" array; ` +
      "text nodes use props.text; buttons use props.label + props.href; images use props.src. " +
      "Return ONLY a JSON array of nodes shaped {id, type, props, children?}.";
    const rawOut = await generateOnce(userPrompt, { systemPrompt, temperature: 0.3, maxTokens: 2000 });
    const json = rawOut.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const coerced = coerceBlockNodes(JSON.parse(json));
    if (coerced && coerced.length) return coerced;
  } catch {
    /* fall through to the deterministic base */
  }
  return base;
}
// [SCOPE 108 / T013] END

// FR-012 back-compat — best-effort seed of the project's ProjectStack "Design
// Tokens" line from the saved theme, so existing stack consumers keep rendering
// (seeded from the theme). Never throws into the request path.
// [SCOPE 062 / T006] BEGIN — Back-compat — seed Stack doc design-tokens line from the th…
async function seedStackTokensFromTheme(
  projectId: string,
  theme: ProjectTheme,
  userId: string,
): Promise<void> {
  try {
    const [stackDoc] = await db
      .select({ content: projectdocuments.content })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectId),
          eq(projectdocuments.doctype, "ProjectStack"),
          isNull(projectdocuments.specid),
        ),
      )
      .limit(1);
    if (!stackDoc?.content) return; // no stack doc yet — nothing to seed
    const data = parseStackMarkdown(stackDoc.content);
    data.tokens = themeToStackDesignTokens(theme);
    await ProjectDocumentService.upsertDocument(
      projectId,
      "ProjectStack",
      "Project Stack & Style",
      renderStackMarkdown(data),
      userId,
    );
  } catch {
    /* best-effort: FR-012 seeding must never block theme save/execute */
  }
}
// [SCOPE 062 / T006] END

const router = Router();
const logger = createLogger("project-theme-routes");

const APP_TYPES: readonly AppType[] = ["web", "desktop", "mobile"];

// [SCOPE 062 / T004] BEGIN — Project theme routes — GET/PUT theme + presets, three-tier …
function parseAppType(raw: unknown): AppType {
  const v = String(raw ?? "web").toLowerCase();
  return (APP_TYPES as readonly string[]).includes(v) ? (v as AppType) : "web";
}
// [SCOPE 062 / T004] END

// A bare HSL triplet, e.g. "222.2 47.4% 11.2%".
const hsl = () => z.string().min(1);

// The 19 semantic shadcn tokens; mirrors ThemeTokenSet in shared/theme-tokens.ts.
const themeTokenSetSchema = z.object({
  background: hsl(),
  foreground: hsl(),
  card: hsl(),
  cardForeground: hsl(),
  popover: hsl(),
  popoverForeground: hsl(),
  primary: hsl(),
  primaryForeground: hsl(),
  secondary: hsl(),
  secondaryForeground: hsl(),
  muted: hsl(),
  mutedForeground: hsl(),
  accent: hsl(),
  accentForeground: hsl(),
  destructive: hsl(),
  destructiveForeground: hsl(),
  border: hsl(),
  input: hsl(),
  ring: hsl(),
});

const projectThemeSchema = z.object({
  source: z.enum(["preset", "gallery-ai", "logo", "prompt", "manual", "url"]),
  sourceRef: z.string().nullable(),
  light: themeTokenSetSchema,
  dark: themeTokenSetSchema,
  radius: z.string().min(1),
  typography: z.object({ fontFamily: z.string().min(1), scale: z.string().min(1) }),
});

// SCOPE-106 — the customer's own header/footer chrome (logo + name + footer line).
// [SCOPE 108 / T008] header/footer are designable Block-Node trees carried on the same
// chrome JSONB (no DDL). Optional + loose (z.custom) — matching `blocksSchema`'s trust of
// client-shaped BlockNodes; without these keys the strict object would strip them on save.
const businessChromeSchema = z.object({
  logoRef: z.string().nullable(),
  appName: z.string(),
  footerLine: z.string(),
  headerNodes: z.array(z.custom<BlockNode>()).optional(),
  footerNodes: z.array(z.custom<BlockNode>()).optional(),
});

// SCOPE-107 — an ordered list of named blocks carried on a project theme / template.
const blocksSchema = z.array(z.object({ name: z.string(), nodes: z.array(z.unknown()) }));

// Tenant guard — the project must belong to the caller's company. Returns true
// when access is allowed (and the project exists), false otherwise.
// [SCOPE 062 / T004] BEGIN — Project theme routes — GET/PUT theme + presets, three-tier …
async function projectInCompany(projectId: string, companyId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: companyprojects.id })
    .from(companyprojects)
    .where(and(eq(companyprojects.id, projectId), eq(companyprojects.companyid, companyId)))
    .limit(1);
  return Boolean(row);
}
// [SCOPE 062 / T004] END

// Three-tier resolution (FR-011): project theme → company default → wxKanban
// built-in default. Never returns null.
// [SCOPE 062 / T004] BEGIN — Project theme routes — GET/PUT theme + presets, three-tier …
async function resolveTheme(
  projectId: string,
  companyId: string,
  appType: AppType,
): Promise<{
  theme: ProjectTheme;
  tier: "project" | "company" | "default";
  tokens: DesignSystemTokens | null;
  designsystemslug: string | null;
  brandschema: BrandSchema | null;
}> {
// [SCOPE 062 / T004] END
  // SCOPE-114 (SPEC-116 / T010): `tokens` and `designsystemslug` MUST be selected here.
  //
  // This is the LAST hop of the carrier chain and the one that was still open. T003 correctly
  // writes both columns onto `projectthemes` in both the insert and the conflict-update
  // branches — but `execute` does not read that table directly, it reads it THROUGH this
  // resolver, and the resolver selected `theme` alone. The rich set therefore arrived intact
  // in the database and was dropped one function short of the renderers, which is precisely
  // the failure the spec warns about: every screen reports success while the bundle silently
  // degrades to colour-only. Selecting them here is what makes the chain end-to-end.
  const [projectRow] = await db
    .select({
      theme: projectthemes.theme,
      tokens: projectthemes.tokens,
      designsystemslug: projectthemes.designsystemslug,
      brandschema: projectthemes.brandschema,
    })
    .from(projectthemes)
    .where(and(eq(projectthemes.projectid, projectId), eq(projectthemes.apptype, appType)))
    .limit(1);
  if (projectRow?.theme) {
    return {
      theme: projectRow.theme,
      tier: "project",
      tokens: projectRow.tokens ?? null,
      designsystemslug: projectRow.designsystemslug ?? null,
      brandschema: projectRow.brandschema ?? null,
    };
  }

  const [companyRow] = await db
    .select({
      theme: companythemeprofiles.theme,
      brandschema: companythemeprofiles.brandschema,
    })
    .from(companythemeprofiles)
    .where(
      and(
        eq(companythemeprofiles.companyid, companyId),
        eq(companythemeprofiles.apptype, appType),
      ),
    )
    .limit(1);
  // SCOPE-129 (SPEC-126 / T009): the company tier now carries a BRAND SCHEMA, though still no
  // rich design-system token set — `companythemeprofiles` has no `tokens` column, so a
  // catalog-sourced look still resolves colour-only at this tier (FR-010, unchanged).
  //
  // The schema is the difference. Company-wide selection is the DESTINATION of the capture
  // flow, so returning null here would mean every project that had not imported the brand
  // individually resolved to bare colours while the interface reported success — the same
  // failure the project tier had one function short of the renderers.
  if (companyRow?.theme) {
    return {
      theme: companyRow.theme,
      tier: "company",
      tokens: null,
      designsystemslug: null,
      brandschema: companyRow.brandschema ?? null,
    };
  }

  return {
    theme: WXKANBAN_DEFAULT_THEME,
    tier: "default",
    tokens: null,
    designsystemslug: null,
    brandschema: null,
  };
}

export { resolveTheme, projectInCompany, projectThemeSchema, businessChromeSchema, parseAppType };

// SCOPE-106 — the project's own business chrome for an app type (null if none set).
// [SCOPE 106 / T008] BEGIN — getProjectChrome (per-project header/footer lookup)
async function getProjectChrome(projectId: string, appType: AppType): Promise<BusinessChrome | null> {
  const [row] = await db
    .select({ chrome: projectthemes.chrome })
    .from(projectthemes)
    .where(and(eq(projectthemes.projectid, projectId), eq(projectthemes.apptype, appType)))
    .limit(1);
  return (row?.chrome as BusinessChrome | null) ?? null;
}
// [SCOPE 106 / T008] END

// SCOPE-107 — the project's own ordered blocks for an app type (null if none set).
// [SCOPE 107 / T006] BEGIN — getProjectBlocks (per-project ordered blocks)
async function getProjectBlocks(projectId: string, appType: AppType): Promise<NamedBlock[] | null> {
  const [row] = await db
    .select({ blocks: projectthemes.blocks })
    .from(projectthemes)
    .where(and(eq(projectthemes.projectid, projectId), eq(projectthemes.apptype, appType)))
    .limit(1);
  return (row?.blocks as NamedBlock[] | null) ?? null;
}
// [SCOPE 107 / T006] END

// GET /api/projects/:id/theme?appType= — the resolved theme for an app type.
router.get(
  "/api/projects/:id/theme",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const projectId = String(req.params.id);
    const appType = parseAppType(req.query.appType);
    try {
      if (!(await projectInCompany(projectId, companyId))) {
        return res.status(404).json({ error: "Project not found" });
      }
      const { theme, tier } = await resolveTheme(projectId, companyId, appType);
      const chrome = await getProjectChrome(projectId, appType);
      const blocks = await getProjectBlocks(projectId, appType);
      return res.json({ theme, appType, tier, chrome, blocks });
    } catch (err) {
      logger.error({ err, projectId, appType }, "Failed to resolve project theme");
      return res.status(500).json({ error: "Failed to resolve theme" });
    }
  },
);

// PUT /api/projects/:id/theme — upsert the structured theme for (project, app type).
// ADMIN-gated and tenant-isolated. Body: { appType, theme }.
router.put(
  "/api/projects/:id/theme",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    const userId = req.userid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const projectId = String(req.params.id);
    const appType = parseAppType(req.body?.appType);
    const parsed = projectThemeSchema.safeParse(req.body?.theme);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid theme payload", details: parsed.error.issues });
    }
    // SCOPE-106: chrome is optional; when the key is absent we preserve any existing
    // chrome (only overwrite when the caller explicitly sends `chrome`).
    const hasChrome = req.body?.chrome !== undefined;
    let chromeValue: BusinessChrome | null = null;
    if (hasChrome && req.body?.chrome !== null) {
      const chromeParsed = businessChromeSchema.safeParse(req.body.chrome);
      if (!chromeParsed.success) {
        return res.status(400).json({ error: "Invalid chrome payload", details: chromeParsed.error.issues });
      }
      chromeValue = chromeParsed.data;
    }
    const hasBlocks = req.body?.blocks !== undefined;
    let blocksValue: NamedBlock[] | null = null;
    if (hasBlocks && req.body?.blocks !== null) {
      const bp = blocksSchema.safeParse(req.body.blocks);
      if (!bp.success) {
        return res.status(400).json({ error: "Invalid blocks payload", details: bp.error.issues });
      }
      blocksValue = bp.data as NamedBlock[];
    }
    try {
      if (!(await projectInCompany(projectId, companyId))) {
        return res.status(404).json({ error: "Project not found" });
      }
      const [row] = await db
        .insert(projectthemes)
        .values({
          id: uuidv7(),
          projectid: projectId,
          apptype: appType,
          theme: parsed.data as ProjectTheme,
          chrome: chromeValue,
          blocks: blocksValue,
          createdbyid: userId ?? null,
        })
        .onConflictDoUpdate({
          target: [projectthemes.projectid, projectthemes.apptype],
          set: {
            theme: parsed.data as ProjectTheme,
            createdbyid: userId ?? null,
            updatedat: new Date(),
            ...(hasChrome ? { chrome: chromeValue } : {}),
            ...(hasBlocks ? { blocks: blocksValue } : {}),
          },
        })
        .returning({ id: projectthemes.id, apptype: projectthemes.apptype, updatedat: projectthemes.updatedat });
      if (userId) await seedStackTokensFromTheme(projectId, parsed.data as ProjectTheme, userId);
      logger.info({ projectId, appType }, "Project theme upserted");
      return res.json({ saved: row });
    } catch (err) {
      logger.error({ err, projectId, appType }, "Failed to save project theme");
      return res.status(500).json({ error: "Failed to save theme" });
    }
  },
);

// GET /api/themes/presets?appType= — curated presets for an app type (web-first).
router.get(
  "/api/themes/presets",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const appType = parseAppType(req.query.appType);
    return res.json({ appType, presets: presetsForAppType(appType) });
  },
);

// POST /api/projects/:id/theme/execute — render the resolved theme to real
// artifacts (theme.css light+dark, Tailwind notes, shadcn theme), persist them as
// a ProjectTheme document beside the stack artifacts (the kit/generation pull it
// like stack.md), and return them for client download. ADMIN-gated, idempotent.
router.post(
  "/api/projects/:id/theme/execute",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    const userId = req.userid;
    if (!companyId || !userId) return res.status(401).json({ error: "Authentication required" });
    const projectId = String(req.params.id);
    const appType = parseAppType(req.body?.appType ?? req.query.appType);
    try {
      if (!(await projectInCompany(projectId, companyId))) {
        return res.status(404).json({ error: "Project not found" });
      }
      const { theme, tier, tokens, designsystemslug, brandschema } = await resolveTheme(
        projectId,
        companyId,
        appType,
      );
      const chrome = await getProjectChrome(projectId, appType);

      // SCOPE-114 (SPEC-116 / T010) — the rich half of the bundle.
      //
      // `fontimporturl`, `analysis`, `name` and `fontstack` live only on the catalog row: they
      // are properties of the CAPTURED SYSTEM, not of the user's theme, so they were
      // deliberately not copied down the carrier chain (copying them would create a second,
      // staleable source for prose that never changes). They are looked up here by slug.
      //
      // A missing lookup is not an error. The slug may name a catalog row that has since been
      // re-seeded away, and FR-010 is explicit that no route may fail because rich context is
      // absent — so the bundle simply degrades toward colour-only.
      const catalogRow = designsystemslug
        ? (
            await db
              .select({
                name: designsystems.name,
                analysis: designsystems.analysis,
                fontstack: designsystems.fontstack,
                fontimporturl: designsystems.fontimporturl,
                synthesizedmode: designsystems.synthesizedmode,
                tokens: designsystems.tokens,
              })
              .from(designsystems)
              .where(eq(designsystems.slug, designsystemslug))
              .limit(1)
          )[0] ?? null
        : null;

      const css = renderExtendedThemeCss(theme, tokens, catalogRow?.fontimporturl ?? null);
      // The human-readable integration notes are unchanged (SCOPE-062 consumers depend on
      // them); `tailwindConfig` is the new machine-usable artifact beside them.
      const tailwind = renderTailwindThemeNotes(theme);
      const tailwindConfig = renderTailwindThemeConfig(theme, tokens);
      const shadcn = renderShadcnTheme(theme, `project-${appType}`);

      const controls = tokens ? renderControlFiles(tokens) : null;
      const designMd = renderDesignMd({
        name: catalogRow?.name ?? "Project Theme",
        analysis: catalogRow?.analysis ?? null,
        fontStack: catalogRow?.fontstack ?? null,
        intendedFont: tokens ? intendedFontFamily(tokens) : null,
        synthesizedMode: catalogRow?.synthesizedmode ?? null,
        theme,
        tokens,
        controls,
      });
      // SCOPE-129 (SPEC-128 / T005): the brand artifacts, built only when the resolved theme
      // carries a schema. Both are null on the colour-only path, so a project with no brand
      // executes to exactly today's artifact set and no existing consumer sees a change.
      const brand = brandschema ? buildBrandStylesheet(brandschema) : null;
      const brandContract = brandschema ? renderShellContract(brandschema) : null;
      const brandTailwind = brandschema ? renderBrandTailwindConfig(brandschema) : null;
      const brandModes = brandschema ? renderBrandModesModule(brandschema) : null;

      // SCOPE-106: emit the customer's own header/footer components beside the theme
      // artifacts (only when the project has chrome — otherwise theme.css only).
      const header = chrome ? renderHeaderComponent(chrome, theme) : null;
      const footer = chrome ? renderFooterComponent(chrome, theme) : null;
      // SCOPE-107: emit each project block as a real component beside the theme/chrome.
      const projectBlocks = await getProjectBlocks(projectId, appType);
      const blockArtifacts = (projectBlocks ?? []).map((b, i) => {
        const nm = (b.name || `Block${i + 1}`).replace(/[^a-zA-Z0-9]/g, "") || `Block${i + 1}`;
        return { name: nm, code: renderBlockCode({ id: `b${i}`, name: nm, nodes: b.nodes }) };
      });
      const body = [
        `# Project Theme — ${appType}`,
        "",
        "## theme.css",
        "",
        "```css",
        css,
        "```",
        "",
        "## Tailwind integration",
        "",
        tailwind,
        "",
        "## shadcn registry theme",
        "",
        "```json",
        shadcn,
        "```",
        "",
        ...(header ? ["## Header.tsx", "", "```tsx", header, "```", ""] : []),
        ...(footer ? ["## Footer.tsx", "", "```tsx", footer, "```", ""] : []),
        ...blockArtifacts.flatMap((b) => [`## ${b.name}.tsx`, "", "```tsx", b.code, "```", ""]),
        // SCOPE-114 (SPEC-116 / T010) — appended AFTER the existing sections so every heading
        // a current consumer looks for keeps its position in the document.
        ...(tokens ? ["## tailwind.theme.ts", "", "```ts", tailwindConfig, "```", ""] : []),
        ...(controls
          ? controls.files.flatMap((f) => [`## ${f.path}`, "", "```tsx", f.code, "```", ""])
          : []),
        "## DESIGN.md",
        "",
        designMd,
        "",
        ...(brand
          ? [
              "## brand.css",
              "",
              "```css",
              brand.css,
              "```",
              "",
              "## Shell contract",
              "",
              brandContract ?? "",
              "",
              "## brand.tailwind.ts",
              "",
              "```ts",
              brandTailwind ?? "",
              "```",
              "",
              "## brand-modes.ts",
              "",
              "```ts",
              brandModes ?? "",
              "```",
              "",
              "## Human test checklist",
              "",
              "These checks need a browser or a person. They are listed rather than counted as",
              "automated, because claiming a check is enforced when it is not produces confidence",
              "nobody earned.",
              "",
              ...brand.humanChecklist.map((c) => `- [ ] ${c}`),
              "",
            ]
          : []),
      ].join("\n");
      const doc = await ProjectDocumentService.upsertDocument(
        projectId,
        "ProjectTheme",
        "Project Theme",
        body,
        userId,
      );
      await seedStackTokensFromTheme(projectId, theme, userId);
      logger.info({ projectId, appType, tier }, "Project theme executed");
      return res.json({
        appType,
        tier,
        // The existing five keys keep their names and meaning — SPEC-116 extends this
        // contract, it does not rewrite it. The new keys are null/empty on the colour-only
        // path so a client can branch on presence rather than on tier.
        artifacts: {
          css,
          tailwind,
          shadcn,
          header,
          footer,
          blocks: blockArtifacts,
          tailwindConfig: tokens ? tailwindConfig : null,
          controls: controls ? controls.files : [],
          design: designMd,
          // SCOPE-129 (SPEC-128 / T005): null on the colour-only path, exactly as the SPEC-116
          // keys above are, so a client branches on presence rather than on tier.
          brandCss: brand ? brand.css : null,
          brandFontHref: brand ? brand.fontHref : null,
          brandShell: brand ? brand.shellExample : null,
          brandContract,
          brandChecklist: brand ? brand.humanChecklist : [],
          brandTailwind,
          brandModes,
        },
        document: doc ? { id: doc.id } : null,
      });
    } catch (err) {
      logger.error({ err, projectId, appType }, "Failed to execute project theme");
      return res.status(500).json({ error: "Failed to execute theme" });
    }
  },
);

// POST /api/themes/derive/gallery — derive a theme from a cited gallery reference.
router.post(
  "/api/themes/derive/gallery",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const appType = parseAppType(req.body?.appType);
    const galleryKey = (req.body?.galleryKey as string | null) ?? null;
    const cited = (req.body?.cited as string | null) ?? null;
    const theme = await deriveThemeViaAI(
      appType,
      `Inspiration gallery: ${galleryKey ?? "n/a"}\nCited reference: ${cited ?? "n/a"}`,
    );
    return res.json({ theme: { ...theme, source: "gallery-ai", sourceRef: cited ?? galleryKey } });
  },
);

// POST /api/themes/derive/prompt — derive a theme from a plain-language prompt.
router.post(
  "/api/themes/derive/prompt",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const appType = parseAppType(req.body?.appType);
    const prompt = String(req.body?.prompt ?? "").trim();
    const theme = await deriveThemeViaAI(appType, `Desired look (designer brief): ${prompt || "professional, accessible"}`);
    return res.json({ theme: { ...theme, source: "prompt", sourceRef: prompt || null } });
  },
);

// POST /api/themes/derive/logo — derive a starting palette from the company logo.
router.post(
  "/api/themes/derive/logo",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const appType = parseAppType(req.body?.appType);
    const [company] = await db
      .select({ logourl: companies.logourl, name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company?.logourl) {
      return res.json({ theme: WXKANBAN_DEFAULT_THEME, note: "No company logo on file" });
    }
    const theme = await deriveThemeViaAI(
      appType,
      `Brand: ${company.name ?? ""}\nLogo URL: ${company.logourl}\nDerive a palette aligned to this brand's likely colors.`,
    );
    return res.json({ theme: { ...theme, source: "logo", sourceRef: company.logourl } });
  },
);

// POST /api/themes/derive/url — borrow a look from a live website (SCOPE-106).
// Captures the site's real styling (headless → static fallback) and maps it onto the
// 19-token theme via the shared deriveThemeViaAI. Fail-open: any capture/AI failure
// returns a safe, complete default theme with HTTP 200 (never 5xx, never blocks), so a
// hostile/unreachable site can't break the flow.
// [SCOPE 106 / T007] BEGIN — POST /api/themes/derive/url (borrow-a-look extraction)
router.post(
  "/api/themes/derive/url",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const appType = parseAppType(req.body?.appType);
    const url = String(req.body?.url ?? "").trim();
    if (!url) {
      return res.json({
        theme: { ...WXKANBAN_DEFAULT_THEME, source: "url", sourceRef: null },
        note: "No URL provided",
      });
    }
    try {
      const capture = await captureSiteStyle(url);
      const theme = await deriveThemeViaAI(appType, captureToPromptContext(capture));
      return res.json({
        theme: { ...theme, source: "url", sourceRef: url },
        method: capture.method,
      });
    } catch (err) {
      logger.warn({ err, url }, "URL style capture failed; failing open to default theme");
      return res.json({
        theme: { ...WXKANBAN_DEFAULT_THEME, source: "url", sourceRef: url },
        note: "Couldn't fully read that site — here's a safe starting point you can edit.",
      });
    }
  },
);
// [SCOPE 106 / T007] END

// POST /api/themes/rebuild/url — Website Page Source: reconstruct a live page's section
// structure into editable, on-brand composer blocks (static parse → deterministic mapper →
// optional AI refine). Optionally also borrows the source's look (FR-008). Fail-open: any
// failure or an unreadable/JS-only page returns { block: null, note } with HTTP 200 so the
// caller leaves the user's canvas untouched (FR-009).
// [SCOPE 108 / T013] BEGIN — POST /api/themes/rebuild/url (structural rebuild)
router.post(
  "/api/themes/rebuild/url",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const url = String(req.body?.url ?? "").trim();
    const borrowLook = req.body?.borrowLook === true;
    const useAI = req.body?.refine === true;
    const appType = parseAppType(req.body?.appType);
    if (!url) return res.json({ block: null, note: "No URL provided" });
    try {
      const outline = await capturePageOutline(url);
      if (!outlineHasStructure(outline)) {
        return res.json({
          block: null,
          note: "Couldn't find a readable page structure (the site may be app-rendered). Your canvas is unchanged — start blank or borrow just the look.",
        });
      }
      let blocks = outlineToBlocks(outline);
      if (useAI) blocks = await refineBlocksViaAI(blocks, outline);
      const block: NamedBlock = { name: (outline.title ?? "Rebuilt page").slice(0, 80) || "Rebuilt page", nodes: blocks };
      const payload: { block: NamedBlock; method: string; theme?: ProjectTheme } = {
        block,
        method: useAI ? "structural+ai" : "structural",
      };
      if (borrowLook) {
        try {
          const capture = await captureSiteStyle(url);
          const theme = await deriveThemeViaAI(appType, captureToPromptContext(capture));
          payload.theme = { ...theme, source: "url", sourceRef: url };
        } catch (err) {
          logger.warn({ err, url }, "borrow-look on rebuild failed; keeping current theme");
        }
      }
      return res.json(payload);
    } catch (err) {
      logger.warn({ err, url }, "page rebuild failed; failing open");
      const message = err instanceof Error ? err.message : "rebuild failed";
      return res.json({ block: null, note: `Couldn't rebuild that page (${message}). Your canvas is unchanged.` });
    }
  },
);
// [SCOPE 108 / T013] END

// POST /api/projects/:id/theme/apply-template — apply a named company template
// (SCOPE-106), inheriting BOTH its tokens and its business chrome onto the project's
// theme for an app type. ADMIN-gated + tenant-isolated (mirrors PUT /theme).
// [SCOPE 106 / T010] BEGIN — apply a company theme template to a project
// Any member may apply a profile to a project (Theme Studio is all-users); still
// tenant-isolated via projectInCompany + companyid. (Relaxed from ADMIN — Theme Studio Phase 1.)
router.post(
  "/api/projects/:id/theme/apply-template",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    const userId = req.userid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const projectId = String(req.params.id);
    const appType = parseAppType(req.body?.appType);
    const templateId = String(req.body?.templateId ?? "");
    if (!templateId) return res.status(400).json({ error: "templateId is required" });
    try {
      if (!(await projectInCompany(projectId, companyId))) {
        return res.status(404).json({ error: "Project not found" });
      }
      // SCOPE-114 (SPEC-116 / T003): `tokens` and `designsystemslug` MUST be selected here and
      // written in BOTH branches below. `theme/execute` resolves from projectthemes, so if the
      // rich token set does not make this hop the download silently degrades to colour-only
      // while every screen still reports success — the worst available failure mode, because
      // the customer makes decisions on the result.
      const [tpl] = await db
        .select({
          theme: themetemplates.theme,
          chrome: themetemplates.chrome,
          blocks: themetemplates.blocks,
          tokens: themetemplates.tokens,
          designsystemslug: themetemplates.designsystemslug,
          brandschema: themetemplates.brandschema,
        })
        .from(themetemplates)
        .where(and(eq(themetemplates.id, templateId), eq(themetemplates.companyid, companyId)))
        .limit(1);
      if (!tpl) return res.status(404).json({ error: "Template not found" });
      const [row] = await db
        .insert(projectthemes)
        .values({
          id: uuidv7(),
          projectid: projectId,
          apptype: appType,
          theme: tpl.theme,
          chrome: tpl.chrome,
          blocks: tpl.blocks,
          tokens: tpl.tokens,
          designsystemslug: tpl.designsystemslug,
          // SCOPE-129 (SPEC-126 / T008): the brand schema makes the same hop as `tokens`,
          // and for the same reason — `theme/execute` resolves from projectthemes.
          brandschema: tpl.brandschema,
          createdbyid: userId ?? null,
        })
        .onConflictDoUpdate({
          target: [projectthemes.projectid, projectthemes.apptype],
          set: {
            theme: tpl.theme,
            chrome: tpl.chrome,
            blocks: tpl.blocks,
            // Re-applying a profile to a project that ALREADY has a theme takes this update
            // path, not the insert. Omitting the two columns here would strand whatever the
            // previous apply left behind — stale tokens from a different design system.
            tokens: tpl.tokens,
            designsystemslug: tpl.designsystemslug,
            // SCOPE-129 (SPEC-126 / T008): the brand schema is set here too. This is the
            // branch that was found silently broken for `tokens`, so it is the branch most
            // worth stating plainly: a second apply must overwrite the schema, not leave the
            // previous brand's modes and rules attached to the new look.
            brandschema: tpl.brandschema,
            createdbyid: userId ?? null,
            updatedat: new Date(),
          },
        })
        .returning({ id: projectthemes.id, apptype: projectthemes.apptype });
      if (userId) await seedStackTokensFromTheme(projectId, tpl.theme, userId);
      logger.info({ projectId, appType, templateId }, "Applied theme template to project");
      return res.json({ applied: row, appType });
    } catch (err) {
      logger.error({ err, projectId, templateId }, "Failed to apply theme template");
      return res.status(500).json({ error: "Failed to apply template" });
    }
  },
);
// [SCOPE 106 / T010] END

// SCOPE-114 Amendment A — apply a curated design system straight to ONE project.
//
// The Studio path is deliberately two steps: pick a catalog entry into the company's profile
// gallery, then apply that profile to a project. That is right when a look is meant to be
// reused. It is friction when someone is theming a single application and has no interest in
// adding a company-wide profile — every experiment would leave a permanent row behind, and the
// gallery would fill with one-off names nobody chose deliberately.
//
// So this route writes the catalog entry directly to (project, appType). Nothing is added to
// `themetemplates`. The look is still fully reusable later if they change their mind: the
// project records `designsystemslug`, and the Studio can pick the same entry into a profile at
// any point.
//
// The theme and tokens are read from the `designsystems` row server-side, exactly as the pick
// route does, so a client cannot post arbitrary colours while naming a curated system.
//
// Chrome is left ALONE on purpose. It is the customer's own logo, app name and footer — it was
// never derived from the borrowed look and must survive a change of look.
router.post(
  "/api/projects/:id/theme/apply-design-system",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    const userId = req.userid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const projectId = String(req.params.id);
    const appType = parseAppType(req.body?.appType);
    const slug = String(req.body?.designsystemslug ?? "");
    if (!slug) return res.status(400).json({ error: "designsystemslug is required" });
    try {
      if (!(await projectInCompany(projectId, companyId))) {
        return res.status(404).json({ error: "Project not found" });
      }
      const [source] = await db
        .select({
          theme: designsystems.theme,
          tokens: designsystems.tokens,
          slug: designsystems.slug,
          name: designsystems.name,
        })
        .from(designsystems)
        .where(eq(designsystems.slug, slug))
        .limit(1);
      if (!source) return res.status(404).json({ error: "Design system not found" });

      const [row] = await db
        .insert(projectthemes)
        .values({
          id: uuidv7(),
          projectid: projectId,
          apptype: appType,
          theme: source.theme,
          tokens: source.tokens,
          designsystemslug: source.slug,
          // SCOPE-129 (SPEC-126 / T008): a curated design system is a LOOK, not a brand — the
          // global catalog carries no schema. Applying one therefore clears any brand schema
          // rather than leaving it set, for the same reason `tokens` is overwritten below: a
          // project must never carry one brand's modes and rules under another brand's look.
          brandschema: null,
          createdbyid: userId ?? null,
        })
        .onConflictDoUpdate({
          target: [projectthemes.projectid, projectthemes.apptype],
          set: {
            theme: source.theme,
            // Same discipline as apply-template: the rich set must be written on BOTH paths.
            // A project already carrying a different system's tokens would otherwise keep them
            // and generate controls that do not match the look now on screen.
            tokens: source.tokens,
            designsystemslug: source.slug,
            // Cleared on the update path too — this is the branch a project with an existing
            // brand actually takes, so omitting it here is precisely how stale modes and rules
            // would survive a change of look.
            brandschema: null,
            createdbyid: userId ?? null,
            updatedat: new Date(),
          },
        })
        .returning({ id: projectthemes.id, apptype: projectthemes.apptype });

      if (userId) await seedStackTokensFromTheme(projectId, source.theme, userId);
      logger.info({ projectId, appType, slug }, "Applied design system to project");
      return res.json({ applied: row, appType, name: source.name });
    } catch (err) {
      logger.error({ err, projectId, slug }, "Failed to apply design system");
      return res.status(500).json({ error: "Failed to apply design system" });
    }
  },
);

export default router;
