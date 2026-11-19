# Implementation Plan: Project Theme (pick / build / execute)

**Feature**: Project Theme
**Spec**: 062 — [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)
**Scope**: SCOPE-062 — `specs/Project-Scope/062-project-theme.md`
**Date**: 2026-06-20

---

## Strategy

One spec folder, three phases. Phase A lands the executable model, storage, and the execute path (no UI yet — verifiable by unit tests + curl). Phase B builds the Theme Studio + preview + contrast and wires it into project creation and the project tab. Phase C adds the AI derive service and the company-profile tier. ~80% of this is **extension of existing SCOPE-047/055/057 machinery**, not net-new.

## Phase A — Model + storage + execute artifacts (T001–T006)

**The central new model** — `src/shared/theme-tokens.ts` (the executable layer, distinct from the coarse `DesignTokens` in `stack-defaults.ts`):
- `ThemeTokenSet` — 19 semantic shadcn tokens in HSL + `radius`.
- `ProjectTheme` — `{ source, sourceRef, light: ThemeTokenSet, dark: ThemeTokenSet, typography }`.
- Renderers paralleling `renderStackMarkdown` but emitting CSS: `renderThemeCss` (`:root` + `.dark`), `renderTailwindThemeNotes`, `renderShadcnTheme`.
- `WXKANBAN_DEFAULT_THEME` packaged from the existing variables in `src/client/styles/index.css` (ultimate fallback; must pass AA).
- A WCAG contrast utility shared by UI badges (Phase B) and tests.
- `THEME_PRESETS` registry + `presetsForAppType()` mirroring `galleriesForAppType()` in `src/shared/lookfeel-galleries.ts`.

**Storage** — two tables mirroring `companystackprofile.ts`:
- `src/db/schema/projecttheme.ts` → `projectthemes` (id uuid v7, projectid FK cascade, apptype varchar20, theme jsonb, createdbyid FK set-null, timestamps), **UNIQUE(projectid, apptype)**.
- `src/db/schema/companythemeprofile.ts` → `companythemeprofiles` (companyid FK, apptype, theme jsonb, …), **UNIQUE(companyid, apptype)**.
- One generated migration applied via the project's `pg.Client` + transaction pattern (app-side UUID v7) — see `src/db/migrations/0032_spec057_companystackprofiles.sql`. Not drizzle-kit push (needs TTY here).

**Routes + execute** — `src/server/routes/projectTheme.ts`, mounted via `src/server/index.ts → app.ts` (never dead `index2.ts`); all DB via `src/db/client.ts` (postgres-js):
- `GET /api/projects/:id/theme?appType=` (resolved: project → company → wxKanban default), `PUT …/theme` (ADMIN + access-checked, like the stack PUT in `projects.ts`), `GET /api/themes/presets?appType=`.
- `POST /api/projects/:id/theme/execute` — render artifacts, persist + materialize beside the stack artifacts (the SPEC-056 path), return for download.
- Back-compat: seed the Stack doc's `DesignTokens` line from the theme (FR-012).

## Phase B — Theme Studio UI (T007–T011)

- `ThemeStudio.tsx` — shared surface reused in two contexts exactly as `StackEditor` is reused by `CreateProjectModal` + `StackTabView`. Left: source switcher (presets / inspiration+AI / build-your-own with logo button, prompt box, manual pickers + radius/font). Right: preview. Footer: execute / save to project / save as company theme (ADMIN).
- `ThemePreview.tsx` — injects the working `ThemeTokenSet` as **scoped** CSS variables on a container and renders real components from `src/client/components/ui/`; the scoped light/dark toggle reuses the `.dark`-class mechanism from `src/client/lib/themePreference.ts`.
- Contrast badges wired from the Phase A utility; manual pickers; integrate the Theme step into `CreateProjectModal.tsx`; add `ThemeTabView.tsx` sibling to `StackTabView.tsx`; **remove** the look-and-feel controls from `StackEditor.tsx`.

## Phase C — AI derivation + company theme profiles (T012–T014)

- `ThemeDeriveService` + `POST /api/themes/derive/{gallery,prompt,logo}` extending the `/api/projects/derive-tokens` pattern to a full `ThemeTokenSet`, through the `LLM_PROVIDER` contract, **fail-open to defaults**. Logo palette from `company.logourl`.
- `GET/POST /api/admin/theme-profiles*` + promote/clear — clone `src/server/routes/stackProfiles.ts` in shape; tenant-isolated by `req.companyid`, ADMIN-gated.
- `src/client/pages/admin/ThemeProfilesPage.tsx` — clone `StackProfilesPage.tsx`.

## Reuse map

| Need | Reuse |
|---|---|
| App-type filtering | `galleriesForAppType()` → twin `presetsForAppType()` (`lookfeel-galleries.ts`) |
| AI derive + safe fallback | `/api/projects/derive-tokens` logic (`projects.ts`) |
| Company promote/clear + admin page | `companystackprofiles` / `stackProfiles.ts` / `StackProfilesPage.tsx` |
| Two-context editor | `StackEditor` ↔ `CreateProjectModal`/`StackTabView` |
| Light/dark for preview | `.dark` class + `data-theme` (`themePreference.ts`) |
| Executable target format | shadcn vars in `index.css` + shadcn MCP `get_theme`/`list_themes` |
| Logo palette | `company.logourl` (`company.ts`) |
| Generation hand-off | SPEC-056 stack.md materialization → add `theme.css` sibling |

## Verification (quickstart)

1. **Unit (Vitest):** `renderThemeCss` emits valid `:root`/`.dark` HSL blocks; structured JSON persists/reloads with no lossy parse; contrast util returns correct WCAG ratios for known pairs; `WXKANBAN_DEFAULT_THEME` + all presets pass AA.
2. **Create-project E2E:** new project → Theme step → apply preset → preview updates → finish → `projectthemes` row for (project, web) + `theme.css` rendered.
3. **Build-your-own:** logo-derive + AI-prompt return full themes; with LLM provider unset, both return defaults, no 500.
4. **Execute:** `POST …/theme/execute` returns `theme.css` matching the saved set; pasted into a shadcn page it renders as previewed.
5. **Resolution:** themeless project → company default; company-cleared → wxKanban default (assert all three tiers).
6. **Company reuse:** admin promote, new same-type project inherits; non-admin promote rejected.
7. **Gates:** `wxkanban-agent auditfences` clean; `npm run check-types` passes (no `any`, Pino-only).

## Constraints

- Executable, not prose: structured JSON → real CSS/Tailwind/shadcn; never parsed back out of markdown.
- Per (project, app type); resolution always terminates at the wxKanban default.
- Accessibility is a first-class AC, not a warning.
- Customer product only — never re-skins wxKanban.
- Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TS (no `any`), Pino-only.
- Orchestrator-first: implement via `implement 062/Tnnn`; fences written by the orchestrator only.
