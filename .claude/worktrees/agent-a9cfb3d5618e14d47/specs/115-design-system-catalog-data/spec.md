# Spec 115: Design System Catalog — Data Model & Deterministic Ingest

**Spec Number**: 115
**Status**: `draft`
**Created**: 2026-07-29
**Scope**: SCOPE-114 (`specs/Project-Scope/114-design-system-catalog.md`)
**Depends On**: SCOPE-062 (`ProjectTheme`, `themeContrastReport`, `themePassesAA`), SCOPE-106 (`themetemplates`)
**Sibling Spec**: SPEC-116 (Studio browse, preview, pick and the extended download bundle) — depends on this one

---

## Overview

Build the data half of SCOPE-114: a global, wxKanban-curated catalog of the 50 design-system analyses in `marketing/AIBM-Design-Systems-Pack/`, plus the deterministic pipeline that ingests them.

This spec delivers a rich token model that can actually hold what the pack captures, a global `designsystems` table, the two nullable carrier columns on `themetemplates` and `projectthemes` that let a picked system survive both hops to the download bundle, and an idempotent seed script that parses, maps, synthesizes and upserts all 50 systems with no AI involvement anywhere.

It deliberately ships no UI. Its exit gate is a seeded database and a passing 50-system test suite, so that SPEC-116 has real rows to render.

## Business Problem

wxKanban's visual starting points are thin: six shadcn presets differing only in hue, AI derivation that produces colour but no type scale or controls, and manual token pickers that demand the design judgement the customer came to the platform lacking. The target customer — a career-changer roughly a year in — can reason about data and logic but cannot invent a coherent visual system from nineteen swatches.

The pack already contains 50 coherent systems captured from real, professionally designed products, but the current model cannot store most of what they hold. `ProjectTheme` has 19 colour tokens, one radius string and one freeform typography string. The pack carries ~14 core semantic colour keys plus a long accent tail, a 10-role type scale with real `fontSize`/`fontWeight`/`lineHeight`/`letterSpacing`, a 7-step radius scale, a 7-step spacing scale, three elevation levels, a prose rationale, a self-contained showcase page — and a `components:` block specifying the actual controls, which has **no home in any shipped model**.

So a customer who picks a look today still has to design every button, input, card and badge themselves. Without a richer store and a repeatable ingest, the assets stay invisible on disk and the controls stay impossible.

Determinism matters as much as fidelity. A non-deterministic pipeline would produce a different catalog on every re-seed, so the same system could silently change appearance between environments. Verified vocabulary consistency across the pack — all 50 files share the same nine top-level frontmatter keys, core colour and typography keys appear in 46 to 50 of 50, and every gap has a declarable fallback — makes a plain parser sufficient and rules out any AI call.

## Actors

- Primary: wxKanban operator who seeds and re-seeds the catalog, and who adds a new design system to the pack and expects one command to publish it.
- Secondary: SPEC-116's Studio surface consuming the seeded rows; the project owner who will later pick a system; the AI implementation agent that will consume the ingested prose analysis as build context.

## Success Metrics

1. All 50 systems ingest cleanly — a table-driven test over the real pack asserts 50 of 50 parse to a complete `DesignSystemTokens` and to a `ProjectTheme` with all 19 tokens populated, with 0 skips and 0 partial rows.
2. Zero silent synthesis failures — every synthesized counterpart mode either passes the existing `themePassesAA` check or is explicitly recorded via `synthesizedmode`; the test asserts the count of unrecorded failures is exactly 0.
3. Re-seeding is byte-stable — running the seed script twice produces 0 changed rows on the second run (idempotent upsert by `slug`), verified by comparing row hashes across 2 consecutive runs.
4. No AI provider is invoked — 0 LLM calls in the ingest path, asserted by the absence of any provider import in the seed script and its dependency tree.
5. No regression in shipped theme surfaces — the existing `theme-tokens` unit suite of 13 tests passes unchanged and `ProjectTheme`'s shape is not modified.
6. Translucent tokens resolve correctly — 100% of `rgba(...)` source values composite to opaque HSL triplets against their own canvas, with unit coverage on both a dark and a light canvas.

## Scope Boundary

This spec covers:

- `src/shared/design-system.ts` — the `DesignSystemTokens` rich model (colors, typography, rounded, spacing, elevation, components), each an open `Record` so per-system extras survive. A **sibling** of `ProjectTheme`, never a replacement.
- `src/shared/designsystemcatalog.ts` — a checked-in curated map of 50 `{ folder, slug, name, tags }` entries authored from each system's own description. This is the mechanism by which the originating brand stays out of the UI.
- `src/db/schema/designsystem.ts` and migration `0057_scope114_design_systems.sql` — the global `designsystems` table, no `companyid`, uuid v7 primary key, UNIQUE on `slug`.
- Migration `0058_scope114_rich_tokens.sql` plus the matching Drizzle edits — nullable `tokens` jsonb and `designsystemslug` varchar(80) added to **both** `themetemplates` and `projectthemes`. Both tiers are required because `execute` resolves from the project tier; omitting the `projectthemes` columns would ship the feature with controls silently missing.
- The frontmatter parser — DESIGN md to `DesignSystemTokens`, prose body to `analysis`, and the webfont href lifted from the showcase `<link>` to `fontimporturl`. Font substitutions the pack declares inline (`"Wise Sans (subst. Inter)"`, `"Graphik Web (→ Inter substitute)"`) are stripped to the loadable stack.
- Colour utilities — `flattenAlpha(color, canvas)` compositing translucent values against their own canvas, and hex to bare HSL triplet conversion matching the `"H S% L%"` form the app already stores.
- `mapToProjectTheme` — a fixed mapping table with declared fallback chains: `canvas`→background, `ink`→foreground, `surface`→card and popover, `primary`/`on-primary`→the primary pair, `surface-alt`→secondary, `canvas-soft`→muted, `ink-muted`→mutedForeground, first `accent-*`→accent, `error`→destructive with a default red for the 41 systems that declare none, `hairline`→border and input, `primary`→ring, `rounded.md`→radius.
- `synthesizeCounterpartMode` — flip canvas lightness to the opposite pole, invert the ink ramp preserving step distances, hold brand hue and shift only its lightness, recompute hairlines as the opposite alpha, then iterate foreground lightness in 2% steps against the shipped `themeContrastReport` until AA passes, falling back to `WXKANBAN_DEFAULT_THEME`'s set for that mode and recording the failure if it cannot converge.
- `scripts/seed-design-systems.ts` — idempotent upsert by `slug` across all 50 systems.
- Unit tests for the parser, colour utilities, mapping and synthesis.

## Out of Scope

- All UI. The Catalog tab, cards, preview dialog and pick flow belong to SPEC-116.
- All API routes. The three catalog GET routes, the pick and carry-across route edits, and the extended bundle renderers belong to SPEC-116.
- Promoting a company's own URL-captured system into the catalog — SCOPE-106 territory, deferred.
- Catalog versioning. Re-seeding overwrites by `slug`; there is no history of prior token values and no notification to companies holding an older copy.
- Rebranding the stored showcase HTML to customer chrome.
- Non-web app types. Every system in the pack is a web design language.
- Shipping font files. Roughly 30 of the 50 name a typeface that is not freely licensed; no font binary is ever bundled, hosted or redistributed.
- Modifying `ProjectTheme`'s shape, the preset registry, or any shipped Studio component.

## Open Questions

1. Should `marketing/AIBM-Design-Systems-Pack/` be committed? It is currently untracked. Committing makes re-seeds reproducible and lets CI run the 50-system parser test; leaving it out keeps ~1.8 MB out of the repo, which matters because kit sync mirrors the filesystem rather than git. Recommendation: commit, and confirm exclusion from both kit allowlists.
2. How ugly is too ugly for a synthesized dark mode? Warm off-white canvases (`#F6F5E8`, `#faf9f5`) invert to muddy browns. The badge plus Studio editability is the accepted mitigation, but if more than a handful land unusable it may be worth hand-authoring dark counterparts for the worst offenders as curated data rather than improving the algorithm.
3. RESOLVED 2026-07-30 — yes, all 10 dark-native systems synthesize a light counterpart. The worry was that a system whose whole identity is darkness might be better served by declining one. The real output answered it: every one yields a genuine light mode, with backgrounds at 97 to 100 percent lightness against near-black foregrounds, and the brand hue is preserved in all 10 cases. Declining would leave the dark-mode toggle inert across a fifth of the catalog. No code change was needed — this is the existing pipeline behaviour.

## Functional Requirements

### FR-001 — Rich token model as a sibling of ProjectTheme

The system MUST define `DesignSystemTokens` in `src/shared/design-system.ts` carrying `colors`, `typography`, `rounded`, `spacing`, `elevation` and `components`, each an open keyed record so that per-system extras are preserved rather than dropped.

**Acceptance Criteria**:
- [ ] `DesignSystemTokens` is exported and carries all six groups
- [ ] `ProjectTheme` in `src/shared/theme-tokens.ts` is unmodified
- [ ] A system declaring an unrecognised key (for example `accent-lavender` or `segmented-pill`) round-trips that key intact

### FR-002 — Curated naming map keeps the brand out of the UI

The system MUST resolve each pack folder to a descriptive name via a checked-in map of 50 entries, and MUST store the originating brand in a separate field that is never rendered.

**Acceptance Criteria**:
- [ ] `src/shared/designsystemcatalog.ts` exports exactly 50 `{ folder, slug, name, tags }` entries
- [ ] Every `slug` is unique and every pack folder is covered
- [ ] `sourcebrand` is populated for traceability and is not part of any user-facing name or slug

### FR-003 — Global catalog table

The system MUST create a `designsystems` table with no tenant column, holding `slug`, `name`, `description`, `sourcebrand`, `nativemode`, `tags`, `tokens`, `theme`, `synthesizedmode`, `analysis`, `showcasehtml`, `fontstack`, `fontimporturl`, `sortorder` and timestamps.

**Acceptance Criteria**:
- [ ] Migration `0057` creates the table with a uuid v7 primary key and UNIQUE `slug`
- [ ] The absence of `companyid` is documented in the schema file as intentional, not a missed tenant predicate
- [ ] Table and column names follow project conventions — plural, lowercase, no underscores for word separation

### FR-004 — Rich tokens carried on both theme tiers

The system MUST add nullable `tokens` jsonb and `designsystemslug` varchar(80) to both `themetemplates` and `projectthemes`, with no backfill and no behaviour change for existing rows.

**Acceptance Criteria**:
- [ ] Migration `0058` alters both tables
- [ ] Existing rows continue to resolve and execute exactly as before with both columns null
- [ ] The schema files record why the project tier needs them — `execute` resolves from `projectthemes`

### FR-005 — Deterministic frontmatter parser

The system MUST parse each DESIGN md into `DesignSystemTokens` plus the prose `analysis`, and MUST lift the loadable webfont from the sibling showcase HTML rather than trusting the declared family.

**Acceptance Criteria**:
- [ ] All 50 files parse without error
- [ ] Declared substitutions such as `"Wise Sans (subst. Inter)"` resolve to the substitute in `fontstack`
- [ ] `fontimporturl` is the showcase `<link>` href, or null when the showcase declares none
- [ ] The intended family is preserved in `tokens` so it can be surfaced in generated documentation

### FR-006 — Translucent values composite before conversion

The system MUST composite `rgba(...)` source values against their own canvas before converting to the bare HSL triplet form `ThemeTokenSet` stores.

**Acceptance Criteria**:
- [ ] `flattenAlpha` is unit-tested against both a dark and a light canvas
- [ ] No emitted `ThemeTokenSet` value contains an alpha channel
- [ ] Every emitted value matches the `"H S% L%"` form used by `src/client/styles/index.css`

### FR-007 — Fixed mapping to the 19 shadcn tokens

The system MUST map the rich colour set onto `ThemeTokenSet` using a fixed table with declared fallback chains, and MUST NOT invoke any AI provider.

**Acceptance Criteria**:
- [ ] All 19 tokens are populated for all 50 systems
- [ ] A missing `error` key yields the documented default red rather than an empty value
- [ ] The seed script's dependency tree imports no LLM provider

### FR-008 — AA-verified counterpart synthesis

The system MUST synthesize the missing mode for every system, verify it with the shipped contrast machinery, and record any failure to converge rather than shipping it silently.

**Acceptance Criteria**:
- [ ] Synthesis reuses `themeContrastReport`/`themePassesAA` rather than adding a second contrast implementation
- [ ] Foreground lightness iterates in 2% steps up to a bounded attempt count
- [ ] Non-convergence falls back to `WXKANBAN_DEFAULT_THEME`'s set for that mode and sets `synthesizedmode`
- [ ] A test asserts 0 unrecorded synthesis failures across all 50 systems

### FR-009 — Idempotent seed script

The system MUST provide `scripts/seed-design-systems.ts` that upserts all 50 systems by `slug` and is safe to re-run.

**Acceptance Criteria**:
- [ ] A second consecutive run changes 0 rows
- [ ] Adding a 51st folder plus its catalog map entry publishes it with no other change
- [ ] After seeding, no runtime code path reads the pack folder

### FR-010 — 50-system regression suite

The system MUST include a table-driven test over the real pack that is the exit gate for this spec.

**Acceptance Criteria**:
- [ ] 50 of 50 systems produce a complete `DesignSystemTokens` and a fully populated `ProjectTheme`
- [ ] The existing 13 `theme-tokens` tests pass unchanged
- [ ] Test failures name the offending folder so a bad pack addition is diagnosable

## Data Requirements

**New table `designsystems`** (global; no tenant column by design):

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | uuid v7 |
| `slug` | varchar(80) NOT NULL | UNIQUE; the upsert key for idempotent re-seeding |
| `name` | varchar(120) NOT NULL | descriptive title, user-visible |
| `description` | text NOT NULL | the pack's `description` prose |
| `sourcebrand` | varchar(80) | internal traceability only; never serialised to a client |
| `nativemode` | varchar(10) NOT NULL | `light` or `dark` |
| `tags` | jsonb `$type<string[]>` NOT NULL | filter facets |
| `tokens` | jsonb `$type<DesignSystemTokens>` NOT NULL | the rich set, verbatim |
| `theme` | jsonb `$type<ProjectTheme>` NOT NULL | derived 19-token light + dark |
| `synthesizedmode` | varchar(10) NOT NULL | `light`, `dark` or `none` |
| `analysis` | text NOT NULL | prose body of the DESIGN md |
| `showcasehtml` | text NOT NULL | approximately 25 KB per row |
| `fontstack` | varchar(255) NOT NULL | resolved CSS font stack |
| `fontimporturl` | varchar(500) | Google Fonts href from the showcase, or null |
| `sortorder` | integer NOT NULL | catalog ordering |
| `createdat` / `updatedat` | timestamp NOT NULL | defaults now |

Approximately 1.9 MB across 50 rows, dominated by `showcasehtml`.

**Altered tables `themetemplates` and `projectthemes`** — the same two nullable additions to each, no backfill:

| Column | Type | Notes |
|--------|------|-------|
| `tokens` | jsonb `$type<DesignSystemTokens>` | the rich set, copied at pick time onto the template and again at apply time onto the project theme; null for looks not sourced from the catalog |
| `designsystemslug` | varchar(80) | provenance; null when hand-built or URL-derived |

Both tiers are required because the artifact chain has two hops and `execute` reads the project tier:

```text
designsystems  →(pick)→  themetemplates  →(snapshot apply)→  projectthemes  →(execute)→  bundle
```

**Migrations** — `0057_scope114_design_systems.sql` and `0058_scope114_rich_tokens.sql`, both in `e:\AI_Development\wxperts\wxKanban\src\db\migrations`, applied to the single shared `wxkanban` RDS instance used by both the app and the hosted MCP.

**Source data** — `marketing/AIBM-Design-Systems-Pack/` is a dev-only ingest input; after seeding the database is the source of truth and production never reads the folder.

## API Routes

This spec adds **no routes**. It is the data and ingest tier only; all three catalog read routes and the pick, carry-across and execute route changes belong to SPEC-116.

The one interface it does expose is the seed entry point, invoked by an operator rather than over HTTP:

| Invocation | Auth | Purpose |
|------------|------|---------|
| `npx tsx scripts/seed-design-systems.ts` | direct DB credentials | Idempotent upsert of all 50 systems by `slug` |

## Frontend Components

This spec adds **no frontend components**. The Catalog tab, cards, preview dialog and pick dialog all belong to SPEC-116. Nothing in `src/client/` is modified.

## Integration Context

This spec must align with three shipped surfaces rather than reinvent them:

- **SCOPE-062** owns `ProjectTheme`, `renderThemeCss`, the preset registry and the `contrastRatio` / `themeContrastReport` / `themePassesAA` AA machinery. Counterpart synthesis reuses that machinery rather than adding a second contrast implementation, and `ProjectTheme`'s shape is not touched.
- **SCOPE-106** owns `themetemplates` and `BusinessChrome`. This spec only adds two nullable columns; no existing behaviour changes.
- **Theme Studio Phase 1** established snapshot-on-pick semantics. The carrier columns exist to make that snapshot carry the rich set, which is why they are duplicated onto `projectthemes` rather than resolved by a foreign key back to the catalog.

The one genuinely new architectural idea is the **global, system-owned table**: every other theme table in the codebase is tenant-scoped, so `designsystems` is the first row set deliberately shared across companies. Reviewers should read the absent `companyid` as intentional, not as a missed tenant predicate.

## Phase

**Current Phase**: implementation
**Priority**: high

## Status

- **Date**: 2026-07-29
- **Phase**: implementation
