// SCOPE-106 / T009 — Theme Template gallery routes. A company-scoped COLLECTION of
// named look+chrome bundles (unlike companythemeprofiles' one-per-app-type default).
// Any member may save; only an ADMIN may rename/delete. All access is tenant-isolated
// by req.companyid (mirrors stackProfiles.ts / companyThemeProfiles.ts).

import { Router, Response } from "express";
import { z } from "zod";
import { db } from "../../db/client.js";
import { themetemplates } from "../../db/schema/themetemplate.js";
import { designsystems } from "../../db/schema/designsystem.js";
import { eq, and, desc } from "drizzle-orm";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createLogger } from "../lib/logger.js";
import { v7 as uuidv7 } from "uuid";
import { projectThemeSchema, businessChromeSchema } from "./projectTheme.js";
import type { ProjectTheme } from "../../shared/theme-tokens.js";
import { DEFAULT_BUSINESS_CHROME, type BusinessChrome } from "../../shared/theme-template.js";
import type { NamedBlock } from "../../shared/block-model.js";

const router = Router();
const logger = createLogger("theme-template-routes");

const saveTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  theme: projectThemeSchema,
  chrome: businessChromeSchema,
  // SCOPE-107 (FR-009): a template may carry an ordered list of blocks.
  blocks: z.array(z.object({ name: z.string(), nodes: z.array(z.unknown()) })).optional(),
});

// SCOPE-114 (SPEC-116 / T002): picking a curated catalog entry.
//
// A pick sends ONLY a name and a slug — never a theme. The server reads the look and the rich
// token set from the `designsystems` row itself, so a client cannot claim "this is the Linear
// theme" while posting arbitrary colours, and the copy is guaranteed to match the catalog at
// the moment of picking. It is a separate schema rather than an optional field on
// `saveTemplateSchema` because the two payloads genuinely have nothing in common beyond the
// name, and folding them together would make `theme` conditionally required — the kind of
// validation subtlety that quietly permits a malformed body.
const pickTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  designsystemslug: z.string().min(1).max(80),
});

// Postgres unique-violation code (UNIQUE (companyid, name)).
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

// GET /api/themes/templates — list this company's named templates (any member).
router.get(
  "/api/themes/templates",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    try {
      const templates = await db
        .select({
          id: themetemplates.id,
          name: themetemplates.name,
          theme: themetemplates.theme,
          chrome: themetemplates.chrome,
          blocks: themetemplates.blocks,
          createdat: themetemplates.createdat,
          updatedat: themetemplates.updatedat,
        })
        .from(themetemplates)
        .where(eq(themetemplates.companyid, companyId))
        .orderBy(desc(themetemplates.updatedat));
      return res.json({ templates });
    } catch (err) {
      logger.error({ err, companyId }, "Failed to list theme templates");
      return res.status(500).json({ error: "Failed to list templates" });
    }
  },
);

// POST /api/themes/templates — save a new named template (any member).
router.post(
  "/api/themes/templates",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    const userId = req.userid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });

    // SCOPE-114 (SPEC-116 / T002) — pick path. Copies a curated catalog entry into this
    // company's gallery, carrying BOTH the mapped theme and the rich token set. The catalog row
    // is only read, never mutated: picking is a snapshot, so a later change to the catalog must
    // not reach this copy (the same rule Theme Studio Phase 1 established for profiles).
    const pick = pickTemplateSchema.safeParse(req.body);
    if (pick.success) {
      try {
        const [source] = await db
          .select({
            theme: designsystems.theme,
            tokens: designsystems.tokens,
            slug: designsystems.slug,
          })
          .from(designsystems)
          .where(eq(designsystems.slug, pick.data.designsystemslug))
          .limit(1);
        if (!source) return res.status(404).json({ error: "Design system not found" });

        const [row] = await db
          .insert(themetemplates)
          .values({
            id: uuidv7(),
            companyid: companyId,
            name: pick.data.name,
            theme: source.theme,
            chrome: DEFAULT_BUSINESS_CHROME,
            blocks: null,
            tokens: source.tokens,
            designsystemslug: source.slug,
            createdbyid: userId ?? null,
          })
          .returning({ id: themetemplates.id, name: themetemplates.name });
        logger.info(
          { companyId, templateId: row?.id, designsystemslug: source.slug },
          "Design system picked into theme templates",
        );
        return res.status(201).json({ template: row });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return res.status(409).json({ error: "A profile with that name already exists" });
        }
        logger.error({ err, companyId }, "Failed to pick design system");
        return res.status(500).json({ error: "Failed to create profile from design system" });
      }
    }

    const parsed = saveTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid template payload", details: parsed.error.issues });
    }
    try {
      const [row] = await db
        .insert(themetemplates)
        .values({
          id: uuidv7(),
          companyid: companyId,
          name: parsed.data.name,
          theme: parsed.data.theme as ProjectTheme,
          chrome: parsed.data.chrome as BusinessChrome,
          blocks: (parsed.data.blocks as NamedBlock[] | undefined) ?? null,
          createdbyid: userId ?? null,
        })
        .returning({ id: themetemplates.id, name: themetemplates.name });
      logger.info({ companyId, templateId: row?.id }, "Theme template saved");
      return res.status(201).json({ template: row });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: "A template with that name already exists" });
      }
      logger.error({ err, companyId }, "Failed to save theme template");
      return res.status(500).json({ error: "Failed to save template" });
    }
  },
);

// PUT /api/themes/templates/:id — update a profile's content (theme/chrome/blocks).
// Any member may edit a company profile (Theme Studio is all-users); tenant-scoped by
// companyid. Name is optional here (renaming stays on PATCH).
router.put(
  "/api/themes/templates/:id",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const id = String(req.params.id);
    const parsed = saveTemplateSchema.partial({ name: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid template payload", details: parsed.error.issues });
    }
    try {
      // SCOPE-129 (SPEC-126 / T008): `tokens`, `designsystemslug` and `brandschema` are
      // DELIBERATELY absent from this set clause, which is what preserves them across an edit.
      // Editing a profile's colours in the Studio must not discard the brand it was captured
      // from. Do not "complete" this object by adding them — writing `brandschema: null` here
      // would silently strip a tenant's brand the first time anyone adjusted a colour.
      const set: Record<string, unknown> = {
        theme: parsed.data.theme as ProjectTheme,
        chrome: parsed.data.chrome as BusinessChrome,
        blocks: (parsed.data.blocks as NamedBlock[] | undefined) ?? null,
        updatedat: new Date(),
      };
      if (parsed.data.name) set.name = parsed.data.name;
      const [row] = await db
        .update(themetemplates)
        .set(set)
        .where(and(eq(themetemplates.id, id), eq(themetemplates.companyid, companyId)))
        .returning({ id: themetemplates.id, name: themetemplates.name });
      if (!row) return res.status(404).json({ error: "Template not found" });
      logger.info({ companyId, templateId: row.id }, "Theme template content updated");
      return res.json({ template: row });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: "A template with that name already exists" });
      }
      logger.error({ err, companyId, id }, "Failed to update theme template");
      return res.status(500).json({ error: "Failed to update template" });
    }
  },
);

// PATCH /api/themes/templates/:id — rename (ADMIN only).
router.patch(
  "/api/themes/templates/:id",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const id = String(req.params.id);
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    if (name.length > 120) return res.status(400).json({ error: "name too long" });
    try {
      const [row] = await db
        .update(themetemplates)
        .set({ name, updatedat: new Date() })
        .where(and(eq(themetemplates.id, id), eq(themetemplates.companyid, companyId)))
        .returning({ id: themetemplates.id, name: themetemplates.name });
      if (!row) return res.status(404).json({ error: "Template not found" });
      return res.json({ renamed: row });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: "A template with that name already exists" });
      }
      logger.error({ err, companyId, id }, "Failed to rename theme template");
      return res.status(500).json({ error: "Failed to rename template" });
    }
  },
);

// DELETE /api/themes/templates/:id — delete (ADMIN only).
router.delete(
  "/api/themes/templates/:id",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const id = String(req.params.id);
    try {
      const [row] = await db
        .delete(themetemplates)
        .where(and(eq(themetemplates.id, id), eq(themetemplates.companyid, companyId)))
        .returning({ id: themetemplates.id });
      if (!row) return res.status(404).json({ error: "Template not found" });
      return res.json({ deleted: row });
    } catch (err) {
      logger.error({ err, companyId, id }, "Failed to delete theme template");
      return res.status(500).json({ error: "Failed to delete template" });
    }
  },
);

export default router;
