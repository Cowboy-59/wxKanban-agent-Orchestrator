 done | done | done | done |# Task Breakdown: Design System Catalog Data And Ingest

**Feature**: Design System Catalog Data And Ingest
**Spec**: 115
**Date Generated**: 2026-07-29
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001: Rich token model (src/shared/design-system.ts) | high | done |
| 2 | T002: Curated 50-entry naming map (src/shared/designsystemcatalog.ts) | high | done |
| 3 | T003: designsystems table + migration 0057 | high | done |
| 4 | T004: Carrier columns on themetemplates + projectthemes (migration 0058) | high | done |
| 5 | T005: Frontmatter + showcase parser | high | done |
| 6 | T006: Colour utilities: flattenAlpha + hex to HSL triplet | high | done |
| 7 | T007: mapToProjectTheme — fixed mapping table | high | done |
| 8 | T008: synthesizeCounterpartMode with AA verification | high | done |
| 9 | T009: Idempotent seed script (scripts/seed-design-systems.ts) | high | done |
| 10 | T010: 50-system regression suite (exit gate) | critical | done |

## Task Details

### T001 — Rich token model (src/shared/design-system.ts)

FR-001. Define DesignSystemTokens carrying colors, typography, rounded, spacing, elevation and components, each an open keyed record so per-system extras (accent-lavender, segmented-pill) survive ingest. Sibling of ProjectTheme — src/shared/theme-tokens.ts must not be modified. Include the per-role type shape (fontFamily, fontSize, fontWeight, lineHeight, letterSpacing) and a control-spec record type. Unit-test that an unrecognised key round-trips intact.

### T002 — Curated 50-entry naming map (src/shared/designsystemcatalog.ts)

FR-002. Checked-in map of exactly 50 { folder, slug, name, tags } entries, one per pack folder, with descriptive names authored from each system's own description prose (e.g. 'Electric Indigo on Near-Black'). Tags cover mode and character (dark/light, minimal, playful, luxury, editorial, product). Assert every slug unique and every folder in marketing/AIBM-Design-Systems-Pack covered. The originating brand belongs in sourcebrand, never in name or slug.

### T003 — designsystems table + migration 0057

FR-003. src/db/schema/designsystem.ts plus 0057_scope114_design_systems.sql in e:/AI_Development/wxperts/wxKanban/src/db/migrations. Global table: NO companyid (document as intentional, not a missed tenant predicate). uuid v7 PK, UNIQUE slug, columns slug/name/description/sourcebrand/nativemode/tags/tokens/theme/synthesizedmode/analysis/showcasehtml/fontstack/fontimporturl/sortorder/createdat/updatedat. Names plural, lowercase, no underscores per project conventions. Register in src/db/schema/index.ts.

### T004 — Carrier columns on themetemplates + projectthemes (migration 0058)

FR-004. 0058_scope114_rich_tokens.sql adds nullable tokens jsonb and designsystemslug varchar(80) to BOTH themetemplates and projectthemes, plus the matching Drizzle edits. No backfill; existing rows must resolve and execute unchanged with both null. Both tiers are load-bearing because execute resolves from projectthemes — omitting the project tier ships the feature with controls silently missing. Record that reason in the schema comments.

### T005 — Frontmatter + showcase parser

FR-005. Parse each DESIGN-*.md into DesignSystemTokens plus the prose analysis, and lift the loadable webfont from the sibling showcase HTML <link href=fonts.googleapis.com...> rather than trusting the declared family. Strip the pack's inline substitution annotations ('Wise Sans (subst. Inter)', 'Graphik Web (-> Inter substitute)') to the substitute for fontstack while preserving the intended family in tokens. fontimporturl is null when the showcase declares none. All 50 must parse without error.

### T006 — Colour utilities: flattenAlpha + hex to HSL triplet

FR-006. flattenAlpha(color, canvas) composites rgba(...) source values against their own canvas before conversion, because ThemeTokenSet stores opaque bare HSL triplets. Add hex to 'H S% L%' conversion matching the form src/client/styles/index.css uses. Unit-test flattenAlpha against both a dark canvas (#08090a) and a light one (#ffffff). Assert no emitted ThemeTokenSet value carries an alpha channel.

### T007 — mapToProjectTheme — fixed mapping table

FR-007. Map the rich colour set onto the 19 shadcn tokens with declared fallback chains: canvas->background, ink->foreground, surface->card+popover, primary/on-primary->primary pair, surface-alt->secondary (fallback canvas-soft), canvas-soft->muted (fallback surface-alt), ink-muted->mutedForeground (fallback ink-faint), first accent-* ->accent (fallback primary-active then primary), error->destructive with a documented default red for the 41 systems declaring none, hairline->border+input (fallback hairline-soft), primary->ring, rounded.md->radius. No AI provider may be imported anywhere in this path.

### T008 — synthesizeCounterpartMode with AA verification

FR-008. Every system is single-mode (40 light, 10 dark) but ProjectTheme needs both. Flip canvas lightness to the opposite pole, invert the ink ramp preserving step distances, hold brand hue and shift only its lightness for legibility, recompute hairlines as the opposite alpha. Then iterate foreground lightness in 2% steps against the SHIPPED themeContrastReport/themePassesAA (do not add a second contrast implementation) up to a bounded attempt count. On non-convergence fall back to WXKANBAN_DEFAULT_THEME's set for that mode and set synthesizedmode. Zero silent failures.

### T009 — Idempotent seed script (scripts/seed-design-systems.ts)

FR-009. Read all 50 folders, run parse -> map -> synthesize, upsert by slug. A second consecutive run must change 0 rows (verify by comparing row hashes across two runs). Adding a 51st folder plus its catalog map entry must publish it with no other change. After seeding the DB is the source of truth — assert no runtime code path reads marketing/AIBM-Design-Systems-Pack. Apply migrations 0057+0058 to the shared wxkanban RDS before first run.

### T010 — 50-system regression suite (exit gate)

FR-010. Table-driven test over the real pack: 50 of 50 produce a complete DesignSystemTokens and a ProjectTheme with all 19 tokens populated, 0 skips and 0 partial rows. Assert 0 unrecorded synthesis failures. Assert the seed script's dependency tree imports no LLM provider. Confirm the existing 13 theme-tokens tests pass unchanged. Failures must name the offending folder so a bad pack addition is diagnosable.
