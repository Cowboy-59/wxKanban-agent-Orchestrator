# Task Breakdown: Project Theme (pick / build / execute)

**Feature**: Project Theme
**Spec**: 062
**Date Generated**: 2026-06-20
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Phase | Priority | Status |
|---|------|-------|----------|--------|
| 1  | T001 Shared `theme-tokens` model + CSS/Tailwind/shadcn renderers + contrast util + `WXKANBAN_DEFAULT_THEME` | A | high | done |
| 2  | T002 `THEME_PRESETS` registry + `presetsForAppType()` (web-first, AA-passing) | A | high | done |
| 3  | T003 Schema + migration — `projectthemes` + `companythemeprofiles` | A | high | done |
| 4  | T004 Project theme routes — GET/PUT theme + presets, three-tier resolution | A | high | done |
| 5  | T005 Execute endpoint — render + materialize artifacts beside stack artifacts | A | high | done |
| 6  | T006 Back-compat — seed Stack doc design-tokens line from the theme | A | medium | done |
| 7  | T007 `ThemeStudio` component — three-source switcher, two contexts | B | high | done |
| 8  | T008 `ThemePreview` — scoped CSS vars, real shadcn components, scoped light/dark | B | high | done |
| 9  | T009 WCAG contrast badges wired into pickers + preset/derived sets | B | high | done |
| 10 | T010 Build-your-own manual pickers (colors, radius, typography) | B | medium | done |
| 11 | T011 Integrate Theme step in `CreateProjectModal` + `ThemeTabView`; strip look-feel from `StackEditor` | B | high | done |
| 12 | T012 `ThemeDeriveService` + derive/gallery, derive/prompt, derive/logo (fail-open) | C | high | done |
| 13 | T013 Company theme-profile routes — promote/clear, tenant-isolated, ADMIN-gated | C | medium | done |
| 14 | T014 Admin `ThemeProfilesPage` (clone `StackProfilesPage`) | C | low | done |

---

## Task Details

### Phase A — Model + storage + execute artifacts

#### T001 — Shared `theme-tokens` model + renderers + contrast util + default theme

Create `src/shared/theme-tokens.ts`: `ThemeTokenSet` (the 19 semantic shadcn tokens in HSL + `radius`), `ProjectTheme` (`source`/`sourceRef`/`light`/`dark`/`typography`), and the renderers that make "execute" real — `renderThemeCss` (`:root{…}` + `.dark{…}`), `renderTailwindThemeNotes`, `renderShadcnTheme` — paralleling `renderStackMarkdown` but emitting CSS. Add a WCAG contrast utility (ratio for a token pair) and `WXKANBAN_DEFAULT_THEME`, packaged from the existing variables in `src/client/styles/index.css` as the ultimate fallback (must pass AA). Export from the shared types barrel. Keep the coarse `DesignTokens` in `stack-defaults.ts` intact (T006 seeds it from a theme).

#### T002 — `THEME_PRESETS` registry + `presetsForAppType()`

Define a curated registry of concrete `ProjectTheme` presets (full light+dark token sets), seeded from shadcn registry themes via the shadcn MCP (`list_themes`/`get_theme`), each tagged `bestFor: AppType[]`. Add `presetsForAppType()` mirroring `galleriesForAppType()`. Web-first in v1; every shipped preset must pass WCAG AA (asserted by a T001 contrast test). One maintainable location, like `lookfeel-galleries.ts`.

#### T003 — Schema + migration

Add `src/db/schema/projecttheme.ts` (`projectthemes`: id uuid v7 PK, projectid FK→companyprojects cascade, apptype varchar20, theme jsonb, createdbyid FK→userprofiles set-null, createdat/updatedat; UNIQUE(projectid, apptype)) and `src/db/schema/companythemeprofile.ts` (`companythemeprofiles`, mirroring `companystackprofile.ts`; UNIQUE(companyid, apptype)). Generate one migration and apply it via the established `pg.Client` + transaction pattern (app-side UUID v7) — see `0032_spec057_companystackprofiles.sql`. Not drizzle-kit push.

#### T004 — Project theme routes + three-tier resolution

Add `src/server/routes/projectTheme.ts`, mounted via `src/server/index.ts → app.ts`; DB via `src/db/client.ts`. `GET /api/projects/:id/theme?appType=` returns the resolved theme (project → company default → `WXKANBAN_DEFAULT_THEME`); `PUT /api/projects/:id/theme` upserts the structured `ProjectTheme` for (project, app type), ADMIN + access-checked like the stack PUT in `projects.ts`; `GET /api/themes/presets?appType=` returns curated presets. Validate payloads with Zod against `ProjectTheme`.

#### T005 — Execute endpoint + artifact materialization

`POST /api/projects/:id/theme/execute` renders the saved theme to `theme.css` (light+dark), Tailwind notes, and a shadcn theme; persists and **materializes them beside the project's stack artifacts** (the SPEC-056 path that generation reads), and returns the `theme.css` body for client download. Idempotent; re-execute overwrites the derived artifacts only.

#### T006 — Back-compat: seed Stack doc tokens from theme

When a theme is saved/executed, seed the Stack document's coarse "Design Tokens" line (the `DesignTokens` five colors + typography in `stack-defaults.ts`/`renderStackMarkdown`) from the theme's values, so existing stack consumers keep working unchanged (FR-012). No removal of the stack tokens line.

### Phase B — Theme Studio UI

#### T007 — `ThemeStudio` component (three sources, two contexts)

Build `src/client/components/Projects/ThemeStudio.tsx`, reused by `CreateProjectModal` and the project Theme tab exactly as `StackEditor` is reused today. Left pane: a source switcher with three modes keyed off the project's app type(s) — **Presets** (swatched `THEME_PRESETS` cards), **Inspiration + AI** (the existing galleries, cite → derive), **Build-your-own** (logo-derive button, AI-prompt box, manual pickers). Right pane: `ThemePreview`. Footer: execute (download), save to project, save as company theme (ADMIN). All results editable.

#### T008 — `ThemePreview` (scoped, real components)

Build `src/client/components/Projects/ThemePreview.tsx`: inject the working `ThemeTokenSet` as **scoped** CSS variables onto a preview container (not global `:root`) and render real components from `src/client/components/ui/` (Button variants, Card, Input, Tabs, Badge, a typography ramp). A light/dark toggle scoped to the preview node reuses the `.dark`-class mechanism from `src/client/lib/themePreference.ts` without touching the app's own theme. Updates immediately on any token change.

#### T009 — WCAG contrast badges

Surface contrast results (from the T001 utility) for the critical pairs (foreground-on-background, primary-foreground-on-primary) with pass/fail badges in the Studio, updating live as tokens change. Flag (warn) a failing manual choice; presets and the default must show passing AA.

#### T010 — Build-your-own manual pickers

Add manual controls in the build-your-own mode: color pickers for each semantic token (light + dark), radius, and typography (font family + scale). Edits feed the live preview and contrast badges immediately and always produce a complete, valid `ProjectTheme` (no partial state).

#### T011 — Integrate into creation + project tab; strip look-feel from Stack

Add the Theme step to `src/client/components/Projects/CreateProjectModal.tsx` (after the Stack step) and create `src/client/components/Projects/ThemeTabView.tsx` sibling to `StackTabView.tsx` (loads the resolved theme, edits via `ThemeStudio`, saves via `PUT …/theme`, executes via the execute endpoint). **Remove** the look-and-feel controls from `src/client/components/Projects/StackEditor.tsx` — they now live in `ThemeStudio`.

### Phase C — AI derivation + company theme profiles

#### T012 — `ThemeDeriveService` + derive endpoints (fail-open)

Add a `ThemeDeriveService` extending the existing `/api/projects/derive-tokens` logic to emit a full `ThemeTokenSet` (light + dark), and three endpoints: `POST /api/themes/derive/gallery` (cited reference), `POST /api/themes/derive/prompt` (plain-language description), `POST /api/themes/derive/logo` (palette from `company.logourl`). All go through the `LLM_PROVIDER` contract and **fall back to default tokens on any failure** — never 5xx, never block. Reuse the safe-fallback behavior of the current derive route.

#### T013 — Company theme-profile routes

Add `GET/POST /api/admin/theme-profiles*` + promote/clear, cloning `src/server/routes/stackProfiles.ts` in shape: list the company's ≤1-per-type theme profiles, promote a project's (project, app type) theme to a company default, clear by app type. Tenant-isolated by `req.companyid`; ADMIN-gated. Promote writes/updates `companythemeprofiles`; clear deletes it (resolution then falls through to the wxKanban default).

#### T014 — Admin `ThemeProfilesPage`

Add `src/client/pages/admin/ThemeProfilesPage.tsx`, cloning `StackProfilesPage.tsx`: list current company theme profiles per app type, promote a promotable project's theme, and clear a profile. ADMIN-only (non-admin redirected), wired to the T013 routes.
