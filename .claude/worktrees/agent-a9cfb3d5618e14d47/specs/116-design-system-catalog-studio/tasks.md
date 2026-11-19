# Task Breakdown: Design System Catalog Studio And Bundle

**Feature**: Design System Catalog Studio And Bundle
**Spec**: 116
**Date Generated**: 2026-07-29
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001: Catalog read routes (src/server/routes/designSystems.ts) | high | done |
| 2 | T002: Pick route: copy catalog entry into themetemplates | high | done |
| 3 | T003: Carry-across on apply-template and template PUT | critical | done |
| 4 | T004: DesignSystemCard component | high | done |
| 5 | T005: DesignSystemCatalog tab body | high | done |
| 6 | T006: DesignSystemShowcaseDialog (sandboxed preview) | high | done |
| 7 | T007: UseDesignSystemDialog + ThemeStudioPage third tab | high | done |
| 8 | T008: Extended theme.css + tailwind.theme.ts renderers | high | done |
| 9 | T009: Control renderers: 6 core files + threshold variants | critical | done |
| 10 | T010: DESIGN.md renderer + execute wiring with colour-only fallback | high | done |
| 11 | T011: Contract, regex and end-to-end test suite | critical | done |
| 12 | T012: Apply a curated system directly to one application (Amendment A) | high | done |
| 13 | T013: Test coverage for Amendment A | critical | todo |

## Task Details

### T001 — Catalog read routes (src/server/routes/designSystems.ts)

FR-001. GET /api/design-systems (list, optional ?mode= ?tag= ?q=), GET /api/design-systems/:slug (detail incl. analysis), GET /api/design-systems/:slug/showcase (stored HTML as text/html). EXPLICIT column selection — never SELECT * — so sourcebrand and showcasehtml cannot leak and the list body stays under 250 KB. All authenticated-member. The catalog is global so no tenant predicate applies, which is precisely why the exclusion needs a contract test rather than a convention. Mount in src/server/app.ts.

### T002 — Pick route: copy catalog entry into themetemplates

FR-002. Extend POST /api/themes/templates to accept designsystemslug, copying the catalog entry's theme and tokens into the new company-owned row with chrome = DEFAULT_BUSINESS_CHROME and blocks = null. The catalog row must be byte-identical before and after a pick, and a later catalog change must not reach an existing copy (snapshot semantics, per Theme Studio Phase 1). Surface the existing UNIQUE (companyid, name) violation as a readable error, not a 500.

### T003 — Carry-across on apply-template and template PUT

FR-003. THE critical correctness task. POST /api/projects/:id/theme/apply-template currently selects only theme, chrome, blocks (src/server/routes/projectTheme.ts ~line 649) — add tokens and designsystemslug to the select AND to both the insert values AND the onConflictDoUpdate set clause, since re-applying to a project that already has a theme takes the update path. Also extend PUT /api/themes/templates/:id to preserve both columns when saving edits rather than dropping what it does not send. Test the update branch specifically.

### T004 — DesignSystemCard component

FR-004. src/client/components/Themes/DesignSystemCard.tsx — swatch strip drawn from the mapped theme (background/primary/accent/foreground), name, one-line description, mode badge, resolved font and radius chips, an 'approximated - tune in Studio' badge wherever synthesizedmode is set, plus Preview and Use actions. Follow _wxAI/rules/shadcn.md and use shadcn components via the shadcn-ui MCP. Never render sourcebrand.

### T005 — DesignSystemCatalog tab body

FR-004. src/client/components/Themes/DesignSystemCatalog.tsx — mode filter (All/Light/Dark), tag chips, free-text search over name and description, responsive card grid, loading and empty states. Fetch via TanStack Query against the list route. Each filter must independently narrow the grid.

### T006 — DesignSystemShowcaseDialog (sandboxed preview)

FR-005. src/client/components/Themes/DesignSystemShowcaseDialog.tsx — render the stored showcase HTML in an iframe with sandbox="" and referrerpolicy="no-referrer" so it can neither execute scripts nor reach the parent origin. Third-party-authored markup, so the sandbox is a hard requirement not a nicety. The only permitted outbound request is the webfont stylesheet. Dialog must be dismissible and must not leak state between entries.

### T007 — UseDesignSystemDialog + ThemeStudioPage third tab

FR-006. src/client/components/Themes/UseDesignSystemDialog.tsx names the copy (prefilled from the catalog entry) and creates the themetemplates row. Modify src/client/pages/ThemeStudioPage.tsx to register a third Catalog tab beside Look & Chrome and Blocks — NO new nav item, since two confusingly-similar theme nav entries already exist. On success select the new profile in the rail and focus Look & Chrome so the user lands in the editor on their own copy. Reuse the existing per-project snapshot apply path unchanged.

### T008 — Extended theme.css + tailwind.theme.ts renderers

FR-007. Emit today's 19 variables (unchanged in name and form) PLUS radius, spacing, elevation and per-role type custom properties drawn from tokens, plus the webfont @import when fontimporturl is present and cleanly omitted when null. tailwind.theme.ts exposes the same scales through borderRadius, spacing, boxShadow, fontFamily and per-role fontSize/fontWeight/letterSpacing. Colour always comes from theme (always current), never from tokens.

### T009 — Control renderers: 6 core files + threshold variants

FR-008. Emit components/ui/{button,card,input,badge,nav}.tsx from tokens.components. Core controls: text-input, nav-bar, button-primary (all 50), card and badge-pill (46), button-secondary (42). An extra appearing in >=5 of 50 becomes an additional VARIANT on its core component, not a new file — admitting button-dark (19), button-pill (11), button-outline (6); rarer entries (segmented-pill, progress-bar, plan-card-featured) are documented in DESIGN.md and not generated. Colour ONLY via shadcn semantic classes (bg-primary, border-border, text-muted-foreground) exactly as the shipped renderHeaderComponent does; geometry as Tailwind arbitrary values. Assert 0 hex/rgb(/hsl( literals across all 50 systems.

### T010 — DESIGN.md renderer + execute wiring with colour-only fallback

FR-009 + FR-010. Emit DESIGN.md carrying the ingested analysis prose plus a resolved token table as build context for the implementation agent; name the intended typeface so the customer can license it, ship no font binary, and let sourcebrand appear nowhere. Wire all new renderers into POST /api/projects/:id/theme/execute keeping the existing response contract. A resolved theme with tokens null must still produce today's exact artifact set — no route may error because rich tokens are absent.

### T011 — Contract, regex and end-to-end test suite

Exit gate. Contract: list/detail payloads omit sourcebrand and showcasehtml, serialised list body under 250 KB, showcase route returns text/html, all three routes reject unauthenticated. Regex: 0 colour literals across every emitted control file for all 50 systems; sourcebrand absent from the whole emitted bundle. End-to-end: walk catalog -> themetemplates -> projectthemes -> bundle and assert all 6 control files present with >=1 system-specific variant, proving the rich tokens survived BOTH hops. Regression: Look & Chrome, Blocks, per-project apply and colour-only execute all unchanged.

### T012 — Apply a curated system directly to one application (Amendment A)

SCOPE-114 Amendment A. POST /api/projects/:id/theme/apply-design-system applies a catalog entry to one (project, appType) with NO company profile created; theme and tokens are read server-side from the designsystems row and written on BOTH the insert and onConflictDoUpdate paths; chrome is left untouched. DesignSystemCatalog gains a variant prop (reused, not duplicated) and ThemeTabView gains a Company profiles / Design system catalog switch with appliedSlug from theme.sourceRef. IMPLEMENTED and verified by hand against the live database; confirmed in the browser.

### T013 — Test coverage for Amendment A

FR-012. Amendment A shipped without automated coverage. Assert: the update branch preserves tokens + designsystemslug when a DIFFERENT system is re-applied; no themetemplates row is created by a direct apply; chrome survives; unknown slug returns 404 and unauthenticated returns 401; variant="project" skips the naming dialog and renders the apply action.
