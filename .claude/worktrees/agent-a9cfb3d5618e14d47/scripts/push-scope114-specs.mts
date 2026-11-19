// One-off SCOPE-114 spec materializer + DB push.
//
// Generates the kit-canonical sibling artifacts (plan/tasks/tests/quickstart/
// lifecycle/checklist) for SPEC-115 and SPEC-116 from their hand-authored spec.md
// bodies + the task arrays below, then pushes each spec to the wxKanban DB via the
// MCP /call transport (project.create_specs over SSE is a known 409 — see
// reference_mcp_transports_and_claude_registration).
//
// Shapes ported from wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts
// (generatePlanMarkdown / generateTasksMarkdown / generateTestsMarkdown /
// generateQuickstartMarkdown / generateLifecycleJson / generateChecklistMarkdown).
//
// Idempotent: safe to re-run for the same specNumber.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Task = { title: string; description: string; priority: "low" | "medium" | "high" | "critical"; status?: "todo" };

interface SpecDef {
  specNumber: string;
  featureName: string;
  dir: string;
  tasks: Task[];
}

const TODAY = "2026-07-29";
const REPO = "e:/AI_Development/wxperts/wxKanban";

const SPECS: SpecDef[] = [
  {
    specNumber: "115",
    featureName: "Design System Catalog Data And Ingest",
    dir: "specs/115-design-system-catalog-data",
    tasks: [
      {
        title: "Rich token model (src/shared/design-system.ts)",
        description:
          "FR-001. Define DesignSystemTokens carrying colors, typography, rounded, spacing, elevation and components, each an open keyed record so per-system extras (accent-lavender, segmented-pill) survive ingest. Sibling of ProjectTheme — src/shared/theme-tokens.ts must not be modified. Include the per-role type shape (fontFamily, fontSize, fontWeight, lineHeight, letterSpacing) and a control-spec record type. Unit-test that an unrecognised key round-trips intact.",
        priority: "high",
      },
      {
        title: "Curated 50-entry naming map (src/shared/designsystemcatalog.ts)",
        description:
          "FR-002. Checked-in map of exactly 50 { folder, slug, name, tags } entries, one per pack folder, with descriptive names authored from each system's own description prose (e.g. 'Electric Indigo on Near-Black'). Tags cover mode and character (dark/light, minimal, playful, luxury, editorial, product). Assert every slug unique and every folder in marketing/AIBM-Design-Systems-Pack covered. The originating brand belongs in sourcebrand, never in name or slug.",
        priority: "high",
      },
      {
        title: "designsystems table + migration 0057",
        description:
          "FR-003. src/db/schema/designsystem.ts plus 0057_scope114_design_systems.sql in e:/AI_Development/wxperts/wxKanban/src/db/migrations. Global table: NO companyid (document as intentional, not a missed tenant predicate). uuid v7 PK, UNIQUE slug, columns slug/name/description/sourcebrand/nativemode/tags/tokens/theme/synthesizedmode/analysis/showcasehtml/fontstack/fontimporturl/sortorder/createdat/updatedat. Names plural, lowercase, no underscores per project conventions. Register in src/db/schema/index.ts.",
        priority: "high",
      },
      {
        title: "Carrier columns on themetemplates + projectthemes (migration 0058)",
        description:
          "FR-004. 0058_scope114_rich_tokens.sql adds nullable tokens jsonb and designsystemslug varchar(80) to BOTH themetemplates and projectthemes, plus the matching Drizzle edits. No backfill; existing rows must resolve and execute unchanged with both null. Both tiers are load-bearing because execute resolves from projectthemes — omitting the project tier ships the feature with controls silently missing. Record that reason in the schema comments.",
        priority: "high",
      },
      {
        title: "Frontmatter + showcase parser",
        description:
          "FR-005. Parse each DESIGN-*.md into DesignSystemTokens plus the prose analysis, and lift the loadable webfont from the sibling showcase HTML <link href=fonts.googleapis.com...> rather than trusting the declared family. Strip the pack's inline substitution annotations ('Wise Sans (subst. Inter)', 'Graphik Web (-> Inter substitute)') to the substitute for fontstack while preserving the intended family in tokens. fontimporturl is null when the showcase declares none. All 50 must parse without error.",
        priority: "high",
      },
      {
        title: "Colour utilities: flattenAlpha + hex to HSL triplet",
        description:
          "FR-006. flattenAlpha(color, canvas) composites rgba(...) source values against their own canvas before conversion, because ThemeTokenSet stores opaque bare HSL triplets. Add hex to 'H S% L%' conversion matching the form src/client/styles/index.css uses. Unit-test flattenAlpha against both a dark canvas (#08090a) and a light one (#ffffff). Assert no emitted ThemeTokenSet value carries an alpha channel.",
        priority: "high",
      },
      {
        title: "mapToProjectTheme — fixed mapping table",
        description:
          "FR-007. Map the rich colour set onto the 19 shadcn tokens with declared fallback chains: canvas->background, ink->foreground, surface->card+popover, primary/on-primary->primary pair, surface-alt->secondary (fallback canvas-soft), canvas-soft->muted (fallback surface-alt), ink-muted->mutedForeground (fallback ink-faint), first accent-* ->accent (fallback primary-active then primary), error->destructive with a documented default red for the 41 systems declaring none, hairline->border+input (fallback hairline-soft), primary->ring, rounded.md->radius. No AI provider may be imported anywhere in this path.",
        priority: "high",
      },
      {
        title: "synthesizeCounterpartMode with AA verification",
        description:
          "FR-008. Every system is single-mode (40 light, 10 dark) but ProjectTheme needs both. Flip canvas lightness to the opposite pole, invert the ink ramp preserving step distances, hold brand hue and shift only its lightness for legibility, recompute hairlines as the opposite alpha. Then iterate foreground lightness in 2% steps against the SHIPPED themeContrastReport/themePassesAA (do not add a second contrast implementation) up to a bounded attempt count. On non-convergence fall back to WXKANBAN_DEFAULT_THEME's set for that mode and set synthesizedmode. Zero silent failures.",
        priority: "high",
      },
      {
        title: "Idempotent seed script (scripts/seed-design-systems.ts)",
        description:
          "FR-009. Read all 50 folders, run parse -> map -> synthesize, upsert by slug. A second consecutive run must change 0 rows (verify by comparing row hashes across two runs). Adding a 51st folder plus its catalog map entry must publish it with no other change. After seeding the DB is the source of truth — assert no runtime code path reads marketing/AIBM-Design-Systems-Pack. Apply migrations 0057+0058 to the shared wxkanban RDS before first run.",
        priority: "high",
      },
      {
        title: "50-system regression suite (exit gate)",
        description:
          "FR-010. Table-driven test over the real pack: 50 of 50 produce a complete DesignSystemTokens and a ProjectTheme with all 19 tokens populated, 0 skips and 0 partial rows. Assert 0 unrecorded synthesis failures. Assert the seed script's dependency tree imports no LLM provider. Confirm the existing 13 theme-tokens tests pass unchanged. Failures must name the offending folder so a bad pack addition is diagnosable.",
        priority: "critical",
      },
    ],
  },
  {
    specNumber: "116",
    featureName: "Design System Catalog Studio And Bundle",
    dir: "specs/116-design-system-catalog-studio",
    tasks: [
      {
        title: "Catalog read routes (src/server/routes/designSystems.ts)",
        description:
          "FR-001. GET /api/design-systems (list, optional ?mode= ?tag= ?q=), GET /api/design-systems/:slug (detail incl. analysis), GET /api/design-systems/:slug/showcase (stored HTML as text/html). EXPLICIT column selection — never SELECT * — so sourcebrand and showcasehtml cannot leak and the list body stays under 250 KB. All authenticated-member. The catalog is global so no tenant predicate applies, which is precisely why the exclusion needs a contract test rather than a convention. Mount in src/server/app.ts.",
        priority: "high",
      },
      {
        title: "Pick route: copy catalog entry into themetemplates",
        description:
          "FR-002. Extend POST /api/themes/templates to accept designsystemslug, copying the catalog entry's theme and tokens into the new company-owned row with chrome = DEFAULT_BUSINESS_CHROME and blocks = null. The catalog row must be byte-identical before and after a pick, and a later catalog change must not reach an existing copy (snapshot semantics, per Theme Studio Phase 1). Surface the existing UNIQUE (companyid, name) violation as a readable error, not a 500.",
        priority: "high",
      },
      {
        title: "Carry-across on apply-template and template PUT",
        description:
          "FR-003. THE critical correctness task. POST /api/projects/:id/theme/apply-template currently selects only theme, chrome, blocks (src/server/routes/projectTheme.ts ~line 649) — add tokens and designsystemslug to the select AND to both the insert values AND the onConflictDoUpdate set clause, since re-applying to a project that already has a theme takes the update path. Also extend PUT /api/themes/templates/:id to preserve both columns when saving edits rather than dropping what it does not send. Test the update branch specifically.",
        priority: "critical",
      },
      {
        title: "DesignSystemCard component",
        description:
          "FR-004. src/client/components/Themes/DesignSystemCard.tsx — swatch strip drawn from the mapped theme (background/primary/accent/foreground), name, one-line description, mode badge, resolved font and radius chips, an 'approximated - tune in Studio' badge wherever synthesizedmode is set, plus Preview and Use actions. Follow _wxAI/rules/shadcn.md and use shadcn components via the shadcn-ui MCP. Never render sourcebrand.",
        priority: "high",
      },
      {
        title: "DesignSystemCatalog tab body",
        description:
          "FR-004. src/client/components/Themes/DesignSystemCatalog.tsx — mode filter (All/Light/Dark), tag chips, free-text search over name and description, responsive card grid, loading and empty states. Fetch via TanStack Query against the list route. Each filter must independently narrow the grid.",
        priority: "high",
      },
      {
        title: "DesignSystemShowcaseDialog (sandboxed preview)",
        description:
          "FR-005. src/client/components/Themes/DesignSystemShowcaseDialog.tsx — render the stored showcase HTML in an iframe with sandbox=\"\" and referrerpolicy=\"no-referrer\" so it can neither execute scripts nor reach the parent origin. Third-party-authored markup, so the sandbox is a hard requirement not a nicety. The only permitted outbound request is the webfont stylesheet. Dialog must be dismissible and must not leak state between entries.",
        priority: "high",
      },
      {
        title: "UseDesignSystemDialog + ThemeStudioPage third tab",
        description:
          "FR-006. src/client/components/Themes/UseDesignSystemDialog.tsx names the copy (prefilled from the catalog entry) and creates the themetemplates row. Modify src/client/pages/ThemeStudioPage.tsx to register a third Catalog tab beside Look & Chrome and Blocks — NO new nav item, since two confusingly-similar theme nav entries already exist. On success select the new profile in the rail and focus Look & Chrome so the user lands in the editor on their own copy. Reuse the existing per-project snapshot apply path unchanged.",
        priority: "high",
      },
      {
        title: "Extended theme.css + tailwind.theme.ts renderers",
        description:
          "FR-007. Emit today's 19 variables (unchanged in name and form) PLUS radius, spacing, elevation and per-role type custom properties drawn from tokens, plus the webfont @import when fontimporturl is present and cleanly omitted when null. tailwind.theme.ts exposes the same scales through borderRadius, spacing, boxShadow, fontFamily and per-role fontSize/fontWeight/letterSpacing. Colour always comes from theme (always current), never from tokens.",
        priority: "high",
      },
      {
        title: "Control renderers: 6 core files + threshold variants",
        description:
          "FR-008. Emit components/ui/{button,card,input,badge,nav}.tsx from tokens.components. Core controls: text-input, nav-bar, button-primary (all 50), card and badge-pill (46), button-secondary (42). An extra appearing in >=5 of 50 becomes an additional VARIANT on its core component, not a new file — admitting button-dark (19), button-pill (11), button-outline (6); rarer entries (segmented-pill, progress-bar, plan-card-featured) are documented in DESIGN.md and not generated. Colour ONLY via shadcn semantic classes (bg-primary, border-border, text-muted-foreground) exactly as the shipped renderHeaderComponent does; geometry as Tailwind arbitrary values. Assert 0 hex/rgb(/hsl( literals across all 50 systems.",
        priority: "critical",
      },
      {
        title: "DESIGN.md renderer + execute wiring with colour-only fallback",
        description:
          "FR-009 + FR-010. Emit DESIGN.md carrying the ingested analysis prose plus a resolved token table as build context for the implementation agent; name the intended typeface so the customer can license it, ship no font binary, and let sourcebrand appear nowhere. Wire all new renderers into POST /api/projects/:id/theme/execute keeping the existing response contract. A resolved theme with tokens null must still produce today's exact artifact set — no route may error because rich tokens are absent.",
        priority: "high",
      },
      {
        title: "Contract, regex and end-to-end test suite",
        description:
          "Exit gate. Contract: list/detail payloads omit sourcebrand and showcasehtml, serialised list body under 250 KB, showcase route returns text/html, all three routes reject unauthenticated. Regex: 0 colour literals across every emitted control file for all 50 systems; sourcebrand absent from the whole emitted bundle. End-to-end: walk catalog -> themetemplates -> projectthemes -> bundle and assert all 6 control files present with >=1 system-specific variant, proving the rich tokens survived BOTH hops. Regression: Look & Chrome, Blocks, per-project apply and colour-only execute all unchanged.",
        priority: "critical",
      },
    ],
  },
];

// ── kit-canonical generators (ported shapes) ─────────────────────────────────

const slugOf = (name: string) => name.toLowerCase().replace(/\s+/g, "-");

function planMd(s: SpecDef): string {
  const L: string[] = [];
  L.push(`# Plan: ${s.featureName}`, "", `**Spec Number**: ${s.specNumber}`, `**Date**: ${TODAY}`, "");
  L.push("## Implementation Plan", "");
  L.push("### Phase 1: Setup", "- Review spec and data model", "- Identify dependencies", "");
  L.push("### Phase 2: Core Implementation", "- Implement core functionality", "- Write unit tests", "");
  L.push("### Phase 3: Integration", "- Integration testing", "- Documentation", "");
  L.push("## Known Issues", "", "_None at this time._", "");
  return L.join("\n");
}

function tasksMd(s: SpecDef): string {
  const L: string[] = [];
  L.push(`# Task Breakdown: ${s.featureName}`, "");
  L.push(`**Feature**: ${s.featureName}`, `**Spec**: ${s.specNumber}`, `**Date Generated**: ${TODAY}`);
  L.push(`**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)`, "", "---", "");
  // Task cell MUST carry the `T00N:` id prefix — the kit's spec-loader TABLE_ROW_RE is
  // /^\|\s*(\d+)\s*\|\s*(T\d+)[:\s.]+([^|]+?)\s*\|.../ and `findTask` matches on that id.
  // Without it the local `implement` handler cannot resolve a task from tasks.md.
  L.push("## Tasks", "", "| # | Task | Priority | Status |", "|---|------|----------|--------|");
  s.tasks.forEach((t, i) =>
    L.push(`| ${i + 1} | T${String(i + 1).padStart(3, "0")}: ${t.title} | ${t.priority} | ${t.status ?? "todo"} |`),
  );
  L.push("", "## Task Details", "");
  s.tasks.forEach((t, i) => {
    L.push(`### T${String(i + 1).padStart(3, "0")} — ${t.title}`, "", t.description, "");
  });
  return L.join("\n");
}

function testsMd(s: SpecDef): string {
  const L: string[] = [];
  L.push(`# Test Plan: ${s.featureName}`, "");
  L.push(`**Spec Number**: ${s.specNumber}`, `**Date Generated**: ${TODAY}`);
  L.push(`**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)`, "", "---", "");
  L.push("## Test Strategy", "", "| Layer | Framework | Coverage Target |", "|-------|-----------|-----------------|");
  L.push("| Unit | Vitest | Core logic, services, utilities |");
  L.push("| Integration | Vitest + Supertest | API endpoints, DB operations |");
  L.push("| E2E | Playwright | User workflows, critical paths |", "", "---", "", "## Unit Tests", "");
  s.tasks.forEach((t, i) => {
    const n = String(i + 1).padStart(3, "0");
    L.push(`### UT-${n} — ${t.title}`, "", `**Linked Task**: T${n}`, `**Status**: pending`, "");
    L.push("| # | Test Case | Expected | Status |", "|---|-----------|----------|--------|");
    L.push(`| 1 | ${t.title} — happy path | Success response | pending |`);
    L.push(`| 2 | ${t.title} — validation error | Error with details | pending |`);
    L.push(`| 3 | ${t.title} — edge case | Graceful handling | pending |`, "");
  });
  L.push("## Integration Tests", "", "| # | Scenario | Endpoint/Flow | Expected | Status |", "|---|----------|--------------|----------|--------|");
  L.push(`| 1 | Full ${s.featureName} workflow | End-to-end | All steps succeed | pending |`);
  L.push(`| 2 | Error handling | Error paths | Proper error responses | pending |`);
  L.push(`| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |`, "");
  L.push("## E2E Tests", "", "| # | User Story | Steps | Expected | Status |", "|---|-----------|-------|----------|--------|");
  L.push(`| 1 | Primary flow | User completes ${s.featureName} | Success | pending |`);
  L.push(`| 2 | Error recovery | User encounters and recovers from error | Guided recovery | pending |`, "");
  L.push("## Test Automation", "", "```bash", "# Run unit tests", "npm run test", "");
  L.push("# Run integration tests", "npm run test:integration", "", "# Run E2E tests", "npm run test:e2e", "```", "");
  L.push("## Coverage Requirements", "", "- Unit test coverage: >= 80%");
  L.push("- All acceptance criteria from spec must have at least one test");
  L.push("- All API endpoints must have integration tests", "- Critical user flows must have E2E tests", "");
  return L.join("\n");
}

function quickstartMd(s: SpecDef): string {
  return `# Quickstart: ${s.featureName}

**Spec Number**: ${s.specNumber}

## Setup

1. Review the spec: \`specs/${s.specNumber}-${slugOf(s.featureName)}/spec.md\`
2. Review the plan: \`plan.md\`
3. Review tasks: \`tasks.md\`
4. Review tests: \`tests.md\`

## Development

1. Pick a task from \`tasks.md\`
2. Implement the feature
3. Write tests per \`tests.md\`
4. Run tests: \`npm run test\`
5. Mark task done: \`/task-done <task-id>\`

## Verification

1. Run \`/scope-validate ${s.specNumber}\` to check spec quality
2. Run tests to verify implementation
3. Review test coverage against \`tests.md\` requirements
`;
}

function lifecycleJson(s: SpecDef): string {
  return JSON.stringify(
    {
      specNumber: s.specNumber,
      featureName: s.featureName,
      phase: "implementation",
      priority: "high",
      progress: { tasksTotal: s.tasks.length, tasksCompleted: 0, percentage: 0 },
      timeline: { created: `${TODAY}T00:00:00.000Z`, phaseStarted: `${TODAY}T00:00:00.000Z` },
    },
    null,
    2,
  );
}

function checklistMd(s: SpecDef): string {
  return `# Requirements Checklist: ${s.featureName}

**Spec Number**: ${s.specNumber}
**Created**: ${TODAY}

---

## Specification Quality

- [ ] Spec.md reviewed and complete
- [ ] Plan.md has clear implementation phases
- [ ] Tasks.md generated with all work items
- [ ] Tests.md has test cases for all tasks
- [ ] Lifecycle.json tracking initialized

## Implementation Readiness

- [ ] All dependencies identified
- [ ] No blocking issues
- [ ] Ready for implementation phase

## Test Coverage

- [ ] Unit tests defined for all tasks
- [ ] Integration tests defined for workflows
- [ ] E2E tests defined for user stories
`;
}

// ── materialize + push ───────────────────────────────────────────────────────

function envValue(key: string): string {
  const raw = readFileSync(join(REPO, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(`${key} not found in .env`);
}

const MODE = process.argv[2] ?? "files";

for (const s of SPECS) {
  const dir = join(REPO, s.dir);
  mkdirSync(join(dir, "checklists"), { recursive: true });
  const specBody = readFileSync(join(dir, "spec.md"), "utf8");

  if (MODE === "files" || MODE === "both") {
    writeFileSync(join(dir, "plan.md"), planMd(s), "utf8");
    writeFileSync(join(dir, "tasks.md"), tasksMd(s), "utf8");
    writeFileSync(join(dir, "tests.md"), testsMd(s), "utf8");
    writeFileSync(join(dir, "quickstart.md"), quickstartMd(s), "utf8");
    writeFileSync(join(dir, "lifecycle.json"), lifecycleJson(s), "utf8");
    writeFileSync(join(dir, "checklists", "requirements.md"), checklistMd(s), "utf8");
    console.log(`[files] ${s.dir} — wrote 6 sibling artifacts (${s.tasks.length} tasks)`);
  }

  if (MODE === "push" || MODE === "both") {
    const token = envValue("WXKANBAN_API_TOKEN");
    const projectId = envValue("WXKANBAN_PROJECT_ID");
    const res = await fetch("https://mcp.wxperts.com/call", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tool: "project.create_specs",
        args: {
          projectId,
          specNumber: s.specNumber,
          featureName: s.featureName,
          scopeContent: specBody,
          phase: "implementation",
          priority: "high",
          generateLifecycle: true,
          tasks: s.tasks.map((t) => ({ ...t, status: t.status ?? "todo" })),
        },
      }),
    });
    const text = await res.text();
    console.log(`[push] SPEC-${s.specNumber} → HTTP ${res.status}`);
    console.log(text.slice(0, 2500));
  }
}
