# Spec 116: Design System Catalog — Studio Browse, Pick & Extended Download Bundle

**Spec Number**: 116
**Status**: `draft`
**Created**: 2026-07-29
**Scope**: SCOPE-114 (`specs/Project-Scope/114-design-system-catalog.md`)
**Depends On**: SPEC-115 (rich model, `designsystems` table, seeded rows, carrier columns) — must land first
**Also Depends On**: SCOPE-062 (`renderThemeCss`, execute route), SCOPE-106 (`themetemplates`, chrome renderers), Theme Studio Phase 1 (`/themes` page, snapshot-on-pick)

---

## Overview

Build the surface half of SCOPE-114: make the seeded catalog browsable, previewable and pickable inside the existing Theme Studio, and grow the download bundle so a picked system yields real controls rather than colour alone.

Three catalog read routes, four new client components plus a third tab in `ThemeStudioPage`, the carry-across edits that keep the rich token set alive across both hops of the theme chain, and the bundle renderers that turn a `components:` block into actual shadcn control files.

This is where SCOPE-114 becomes visible to a customer, and where its central promise is either kept or silently broken — the feature can look complete while emitting a colour-only bundle if the carrier columns are not read and written at every hop.

## Business Problem

SPEC-115 leaves 50 professionally coherent design systems sitting in the database with no way to see or use them. Nothing in the product reads the table, so the assets remain as invisible as they were on disk.

Beyond visibility, the harder gap is the controls. A customer who picks a look today gets colour and nothing else — they must still design every button, input, card and badge themselves, which is precisely the design judgement the target customer lacks. The pack's `components:` block specifies those controls, but until the bundle renderers exist there is no path from that specification to a file the customer can use.

There is also a live correctness trap. The theme chain has two hops — catalog to company template on pick, company template to project theme on apply — and `execute` resolves from the project tier. The shipped `apply-template` handler selects only `theme, chrome, blocks`, and `PUT /api/themes/templates/:id` does not know about the new columns. If either is left alone, the rich tokens die in transit and the download quietly degrades to today's colour-only output while every screen still reports success. That is the worst available failure mode, because the customer makes decisions on the result.

Finally, the catalog is the first deliberately global row set among tenant-scoped theme tables, and it holds a `sourcebrand` column that must never reach a client. Read routes therefore need explicit column selection backed by contract tests rather than convention — a `SELECT *` regression would both leak the brand and ship roughly 1.9 MB of showcase HTML per page load.

## Actors

- Primary: Project owner browsing the catalog to choose a visual identity, then downloading the theme and controls for the product wxKanban generates.
- Secondary: Company admin curating which picked looks the team reuses as profiles; the AI implementation agent consuming the emitted `DESIGN.md` as build context; reviewing engineer verifying no brand leaks into responses or artifacts.

## Success Metrics

1. Pick-to-artifacts in at most 4 user actions — pick, name, apply to project, execute — with no manual token editing; an end-to-end test walks catalog to template to project theme to bundle and asserts all 6 control files are present with at least 1 system-specific variant.
2. No colour literals in generated controls — a regex assertion across every emitted control file for all 50 systems finds 0 hex, `rgb(` or `hsl(` literals; all colour resolves through shadcn semantic classes.
3. Browse stays under 250 KB per page load — the list response for all 50 entries excludes `showcasehtml`, `analysis` and `sourcebrand`, asserted by a contract test on both key absence and serialised body size.
4. Trademark surface is zero — `sourcebrand` appears in 0 client-bound response payloads and 0 generated artifact files, asserted by contract test and by a regex sweep of the emitted bundle.
5. Carry-across holds on the update path — re-applying a profile to a project that already has a theme preserves `tokens` and `designsystemslug`, asserted by a test that exercises the `onConflictDoUpdate` branch specifically, not just the insert branch.
6. No regression in shipped theme surfaces — the Studio's Look and Chrome tab, Blocks tab, per-project apply and colour-only execute paths all pass unchanged, and a theme carrying no `tokens` still produces today's bundle.

## Scope Boundary

This spec covers:

- `src/server/routes/designSystems.ts` — `GET /api/design-systems` (list, filterable by `?mode=`, `?tag=`, `?q=`, explicit column selection), `GET /api/design-systems/:slug` (one entry including `analysis`), `GET /api/design-systems/:slug/showcase` (the stored HTML as `text/html` for the preview iframe). All authenticated-member; the catalog is global so no tenant predicate applies, which is exactly why the `sourcebrand` exclusion needs a test.
- `POST /api/themes/templates` — extended to accept `designsystemslug` and copy the catalog entry's `theme` and `tokens` into the new company-owned row.
- `POST /api/projects/:id/theme/apply-template` — extended to select and carry `tokens` and `designsystemslug` onto `projectthemes`, in **both** the insert values and the `onConflictDoUpdate` set clause.
- `PUT /api/themes/templates/:id` — extended to preserve `tokens` and `designsystemslug` when a user saves edits to a catalog-sourced profile, rather than dropping columns it does not send.
- `DesignSystemCatalog` — the Catalog tab body: mode filter, tag chips, free-text search over name and description, card grid, loading and empty states.
- `DesignSystemCard` — swatch strip drawn from the mapped theme, name, description, mode badge, resolved font and radius chips, an "approximated — tune in Studio" badge wherever `synthesizedmode` is set, and Preview plus Use actions.
- `DesignSystemShowcaseDialog` — the stored showcase HTML in an iframe with `sandbox=""` and `referrerpolicy="no-referrer"`; no scripts, no same-origin, Google Fonts the only outbound request.
- `UseDesignSystemDialog` — name the copy, create the `themetemplates` row, then select it in the rail and focus Look and Chrome so the user lands in the editor on their own copy.
- `ThemeStudioPage` — modified to register the third tab and handle post-pick selection.
- Extended `theme.css` rendering — today's 19 variables plus radius, spacing, elevation and per-role type custom properties from `tokens`, plus the webfont import.
- `tailwind.theme.ts` rendering — wiring those into `borderRadius`, `spacing`, `boxShadow`, `fontFamily` and per-role `fontSize`/`fontWeight`/`letterSpacing`.
- Control renderers — `components/ui/{button,card,input,badge,nav}.tsx` for the six core controls, with per-system extras emitted as additional variants on the same component when the extra appears in at least 5 of the 50 systems (admitting `button-dark` at 19, `button-pill` at 11 and `button-outline` at 6). Rarer entries stay in `tokens` and are documented rather than generated. Colour via semantic classes only; geometry as Tailwind arbitrary values.
- `DESIGN.md` rendering — the ingested prose analysis plus a resolved token table, as build context for the implementation agent.
- Execute route wiring, including the colour-only fallback when the resolved theme carries no `tokens`.
- Contract, unit and end-to-end tests for all of the above.

## Out of Scope

- Everything SPEC-115 owns: the rich model, the catalog table, both migrations, the parser, mapping, synthesis, curated name map and seed script.
- Promoting a company's own URL-captured system into the catalog — SCOPE-106 territory, deferred.
- Rebranding the showcase page to customer chrome. Templating 50 hand-authored 25 KB HTML files is the fiddliest possible work for the least certain payoff; the showcase stays a read-only preview.
- Per-user favourites, ratings or usage counts.
- Reaching the catalog from `CreateProjectModal` during project creation. It is the obvious follow-on and worth sequencing explicitly, but keeping this spec to one surface is deliberate.
- Reconciling the two confusingly-similar theme nav items, admin "Theme Profiles" versus "Theme Studio" — known WIP from Theme Studio Phase 1, tracked separately and deliberately not worsened here, since the Catalog is a tab inside an existing page rather than a new nav entry.
- Non-web app types, which continue to resolve through the existing preset path.
- Rendering the originating brand anywhere user-visible, including generated artifacts, filenames and code comments.

## Open Questions

1. Is at least 5 of 50 the right threshold for emitting a control extra as a variant? The spec commits to that default, admitting `button-dark`, `button-pill` and `button-outline` while leaving single-occurrence entries documented but not generated. The number is a judgement call, not a derived one — lower produces richer bundles and more noise, higher loses `button-outline`.
2. Should the catalog be reachable during project creation? `CreateProjectModal` already hosts a Theme step, and picking a coherent system is most valuable at the moment of creation. Deferred here, but it is the obvious next surface.
3. Should the "approximated — tune in Studio" badge also appear on a project that has applied a synthesized look, or only in the catalog? Showing it downstream is more honest but risks reading as a defect on a look the user has already accepted.

## Functional Requirements

### FR-001 — Catalog read routes with explicit column selection

The system MUST expose list, detail and showcase routes for the catalog, and MUST NOT return `sourcebrand` or `showcasehtml` from the list or detail routes.

**Acceptance Criteria**:
- [ ] `GET /api/design-systems` returns all 50 entries filtered by optional `mode`, `tag` and `q`
- [ ] Neither `sourcebrand` nor `showcasehtml` appears in the list or detail payload
- [ ] The serialised list body is under 250 KB
- [ ] `GET /api/design-systems/:slug/showcase` returns the stored HTML with `Content-Type: text/html`
- [ ] All three routes require an authenticated member

### FR-002 — Pick copies a catalog entry into the company gallery

The system MUST create a normal `themetemplates` row when a user picks a catalog entry, copying both `theme` and `tokens` and recording `designsystemslug`, and MUST NOT mutate the catalog row.

**Acceptance Criteria**:
- [ ] `POST /api/themes/templates` accepts `designsystemslug` and populates `theme`, `tokens` and `designsystemslug`
- [ ] `chrome` defaults to `DEFAULT_BUSINESS_CHROME` and `blocks` is null
- [ ] The catalog row is byte-identical before and after a pick
- [ ] A later change to the catalog row does not reach an existing copy

### FR-003 — Rich tokens survive the apply hop

The system MUST carry `tokens` and `designsystemslug` from the template onto `projectthemes` on apply, in both the insert and the conflict-update paths.

**Acceptance Criteria**:
- [ ] `apply-template` selects both columns from the template
- [ ] Both are written in the insert values
- [ ] Both are written in the `onConflictDoUpdate` set clause
- [ ] A test re-applies a profile to a project that already has a theme and asserts both survive
- [ ] `PUT /api/themes/templates/:id` preserves both when saving edits

### FR-004 — Catalog browse surface

The system MUST add a Catalog tab to the Theme Studio presenting all entries as cards with filtering and search.

**Acceptance Criteria**:
- [ ] A third tab appears beside Look and Chrome and Blocks, with no new nav item
- [ ] Cards show a swatch strip from the mapped theme, name, description, mode badge, font and radius
- [ ] An "approximated — tune in Studio" badge shows wherever `synthesizedmode` is set
- [ ] Mode filter, tag chips and free-text search each narrow the grid
- [ ] Loading and empty states are handled

### FR-005 — Sandboxed showcase preview

The system MUST render the stored showcase HTML in an iframe that cannot execute scripts or reach the parent origin.

**Acceptance Criteria**:
- [ ] The iframe carries `sandbox=""` and `referrerpolicy="no-referrer"`
- [ ] The only outbound request is the webfont stylesheet
- [ ] The dialog is dismissible and does not leak state between entries

### FR-006 — Pick flow lands the user in the editor

The system MUST let a user name their copy, then select the new profile and focus the editing tab.

**Acceptance Criteria**:
- [ ] The name field prefills from the catalog entry name
- [ ] A duplicate name surfaces the existing UNIQUE constraint as a readable error, not a 500
- [ ] On success the new profile is selected in the rail and Look and Chrome is focused
- [ ] The existing per-project snapshot apply path is reused unchanged

### FR-007 — Extended theme.css and Tailwind artifacts

The system MUST emit the additional scales from `tokens` alongside today's 19 variables, and MUST include the webfont import.

**Acceptance Criteria**:
- [ ] `theme.css` carries radius, spacing, elevation and per-role type custom properties
- [ ] The webfont is imported when `fontimporturl` is present and omitted cleanly when null
- [ ] `tailwind.theme.ts` exposes the same scales through `borderRadius`, `spacing`, `boxShadow`, `fontFamily` and per-role type keys
- [ ] Today's 19 variables are unchanged in name and form

### FR-008 — Control renderers emit real shadcn files

The system MUST emit the six core controls as shadcn-shaped component files, expressing per-system extras as additional variants rather than additional files, and MUST NOT emit any colour literal.

**Acceptance Criteria**:
- [ ] `components/ui/{button,card,input,badge,nav}.tsx` are emitted
- [ ] An extra appearing in at least 5 of 50 systems becomes a variant on its core component
- [ ] Rarer extras are documented in `DESIGN.md` and not generated
- [ ] 0 hex, `rgb(` or `hsl(` literals across every emitted control file for all 50 systems
- [ ] Geometry comes from `tokens.components` as Tailwind arbitrary values

### FR-009 — DESIGN.md as build context

The system MUST emit the ingested prose analysis plus a resolved token table into the bundle, without naming the originating brand.

**Acceptance Criteria**:
- [ ] `DESIGN.md` contains the analysis prose and a resolved token table
- [ ] The intended typeface is named so the customer can license it, while no font binary is shipped
- [ ] `sourcebrand` appears nowhere in the emitted bundle

### FR-010 — Colour-only fallback preserved

The system MUST continue to produce today's bundle for any theme that carries no rich tokens.

**Acceptance Criteria**:
- [ ] A theme with `tokens` null executes to the pre-existing artifact set
- [ ] No route returns an error because rich tokens are absent
- [ ] Existing execute behaviour for hand-built and URL-derived themes is unchanged

## Data Requirements

This spec creates **no tables and no migrations** — SPEC-115 owns `designsystems` and both carrier migrations. What this spec owns is *reading and writing* those columns correctly at every hop:

| Table | Columns this spec touches | Operation |
|-------|---------------------------|-----------|
| `designsystems` | all except `sourcebrand` and `showcasehtml` on list/detail; `showcasehtml` on the showcase route only | read, explicit column selection |
| `themetemplates` | `theme`, `tokens`, `designsystemslug`, `chrome`, `blocks`, `name` | insert on pick; update on profile save, preserving both carrier columns |
| `projectthemes` | `theme`, `tokens`, `designsystemslug`, `chrome`, `blocks` | insert **and** `onConflictDoUpdate` on apply — both branches must carry the carrier columns |

The failure mode to guard: `tokens` present on `themetemplates` but null on `projectthemes` means `execute` silently emits a colour-only bundle while every screen reports success.

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/design-systems` | authenticated member | List the catalog. Explicit column selection — excludes `showcasehtml`, `analysis`, `sourcebrand`. Supports `?mode=`, `?tag=`, `?q=` |
| GET | `/api/design-systems/:slug` | authenticated member | One entry including `analysis`, still excluding `showcasehtml` and `sourcebrand` |
| GET | `/api/design-systems/:slug/showcase` | authenticated member | The stored showcase HTML as `text/html`, for the sandboxed preview iframe |
| POST | `/api/themes/templates` | any member (existing) | Extended to accept `designsystemslug`, copying the catalog entry's `theme` and `tokens` into the new company-owned row |
| POST | `/api/projects/:id/theme/apply-template` | any member (existing) | Extended to select and carry `tokens` + `designsystemslug` onto `projectthemes` — in both the insert values and the `onConflictDoUpdate` set clause |
| PUT | `/api/themes/templates/:id` | any member (existing) | Must preserve `tokens` + `designsystemslug` when saving edits to a catalog-sourced profile |
| POST | `/api/projects/:id/theme/execute` | ADMIN (existing) | Extended to emit the control files, extended `theme.css`, `tailwind.theme.ts` and `DESIGN.md` when the resolved theme carries `tokens`; falls back to today's colour-only bundle when it does not |
| POST | `/api/projects/:id/theme/apply-design-system` | any member, tenant-isolated | **SCOPE-114 Amendment A.** Apply a catalog entry to one `(project, appType)` with no company profile created. Body `{ appType, designsystemslug }`; `theme` and `tokens` read server-side from the `designsystems` row; written on both the insert and `onConflictDoUpdate` paths; `chrome` untouched |

The catalog is global and read-only, so no tenant predicate applies to the three GET routes — which is exactly why the `sourcebrand` exclusion needs a contract test rather than a convention.

## Frontend Components

| Component | File | Role |
|-----------|------|------|
| `DesignSystemCatalog` | `src/client/components/Themes/DesignSystemCatalog.tsx` | The Catalog tab body — filter row, card grid, empty and loading states |
| `DesignSystemCard` | `src/client/components/Themes/DesignSystemCard.tsx` | One entry: swatch strip from the mapped theme, name, description, mode badge, font and radius chips, approximation badge, Preview and Use actions |
| `DesignSystemShowcaseDialog` | `src/client/components/Themes/DesignSystemShowcaseDialog.tsx` | Sandboxed iframe preview of the stored showcase |
| `UseDesignSystemDialog` | `src/client/components/Themes/UseDesignSystemDialog.tsx` | Name the copy, create the `themetemplates` row, hand focus to Look and Chrome |
| `ThemeStudioPage` | `src/client/pages/ThemeStudioPage.tsx` | **Modified** — third tab registered; on successful pick, selects the new profile in the rail and switches tabs |
| `ThemeTabView` | `src/client/components/Projects/ThemeTabView.tsx` | **Modified (Amendment A)** — `Company profiles` / `Design system catalog` switch, direct apply, and `appliedSlug` derived from `theme.sourceRef` so the live look is marked without a second request |

All five follow `_wxAI/rules/shadcn.md` and use shadcn components via the shadcn-ui MCP. No new nav item is added.

## Integration Context

This spec is almost entirely **wiring**, and must align with four shipped surfaces rather than reinvent them:

- **SPEC-115** must land first. Without seeded rows there is nothing to render and no carrier columns to read or write.
- **SCOPE-062** owns `renderThemeCss` and the execute route. The extended renderers add to that output rather than replacing it, and the 19 existing variables keep their names and form so any consumer of today's `theme.css` is unaffected.
- **SCOPE-106** owns `themetemplates`, `BusinessChrome` and the chrome renderers. The pick path writes an ordinary `themetemplates` row, so apply, edit and execute are already built. The control renderers copy the semantic-class discipline that `renderHeaderComponent` established — colour never appears as a literal.
- **SCOPE-107** owns `themeblocks` and the Block Composer. Untouched; a catalog-sourced template simply starts with `blocks` null.
- **Theme Studio Phase 1** established build-centrally-at-`/themes`, choose-per-project-by-snapshot. The Catalog is a third tab in that page and a third source feeding the same profiles gallery, and copy-on-pick is the same snapshot rule Phase 1 locked. It deliberately does not worsen the known WIP of two confusingly-similar theme nav items, because it adds a tab rather than a nav entry.

### FR-011 — Apply a curated system directly to one application (SCOPE-114 Amendment A)

The system MUST let a user browse the catalog from a project's own Theme tab and apply a curated system directly to that `(project, appType)` pair, without creating a company profile.

**Why this is separate from FR-002.** FR-002's pick is the right shape when a look is meant to be reused across projects. It is friction for someone theming a single application, because every experiment leaves a permanent company-wide profile behind and the gallery fills with one-off names nobody chose to keep.

**Acceptance Criteria**:
- [ ] `POST /api/projects/:id/theme/apply-design-system` accepts `{ appType, designsystemslug }` and applies it to that project only
- [ ] `theme` and `tokens` are read from the `designsystems` row server-side, never accepted from the client
- [ ] `tokens` and `designsystemslug` are written on **both** the insert and the `onConflictDoUpdate` path
- [ ] Re-applying a different system replaces both, leaving no tokens from the previous one
- [ ] No `themetemplates` row is created, updated or read
- [ ] `chrome` is left untouched — logo, app name and footer survive a change of look
- [ ] The Theme tab offers a `Company profiles` / `Design system catalog` switch, and the applied system is marked in the grid
- [ ] `DesignSystemCatalog` is reused via a `variant` prop rather than duplicated

### FR-012 — Test coverage for Amendment A

The system MUST cover the direct-apply path with the same rigour as the profile path. Amendment A shipped implemented and verified by hand against the live database, but is not exercised by the automated suite.

**Acceptance Criteria**:
- [ ] A test asserts the update branch preserves `tokens` and `designsystemslug` when a different system is re-applied
- [ ] A test asserts no `themetemplates` row is created by a direct apply
- [ ] A test asserts `chrome` survives a direct apply
- [ ] A test asserts the route rejects an unknown slug with 404 and an unauthenticated caller with 401
- [ ] A test asserts `variant="project"` skips the naming dialog and renders the apply action

## Phase

**Current Phase**: implementation
**Priority**: high

## Status

- **Date**: 2026-07-29
- **Phase**: implementation
