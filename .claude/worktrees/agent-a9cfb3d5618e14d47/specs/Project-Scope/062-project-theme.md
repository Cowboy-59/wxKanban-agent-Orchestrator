# SCOPE-062: Project Theme (pick / build / execute)

**Scope Number**: SCOPE-062
**Status**: `draft`
**Created**: 2026-06-20
**Last Reviewed**: 2026-06-20 (interactive buildscope — section-by-section, approved through all sections)
**Depends On**: SCOPE-047 (stack-style — reuses its look-and-feel galleries `lookfeel-galleries.ts`, the AI `derive-tokens` route + safe-fallback, the `DesignTokens` model, and the company-profile promote/clear pattern in `companystackprofiles` / `stackProfiles.ts` / `StackProfilesPage.tsx`); SPEC-056 (stack/style generation injection — the stack.md materialization path the theme artifacts ride alongside); the shadcn/Tailwind variable set already defined in `src/client/styles/index.css` + `tailwind.config.js`; `company.logourl`.
**Related Scopes**: SCOPE-047 is the **technical** counterpart — Stack owns the tech dimensions (backend/db/testing/hosting), this scope elevates the **visual** decision (was the Stack "Look & Feel" sub-step) into its own executable surface.
**Source**: `specs/Project-Scope/062-project-theme.md`

---

## Overview

The Stack screen (project creation + per-project tab) frames a project's setup in engineering terms — backend, database, testing, hosting. That framing is right for technical choices but wrong for the *visual* decision a customer most wants to make early: "what should my product look like?" Today that decision is a small "Look & Feel" sub-step buried inside the Stack editor — a cited inspiration link that an AI turns into a coarse, prose-level token description. It can't be previewed, can't be applied, and produces nothing the customer can actually use.

This scope promotes visual identity to a first-class **Theme** experience that sits **alongside** Stack — Stack keeps the tech choices, Theme owns the look. Based on the app type(s) the customer has already chosen, Theme offers three ways to land on a look: pick a curated, ready-to-use **preset**; draw **inspiration** from galleries (Mobbin and the like) and let AI derive a palette; or **build their own** (from their logo, from a text prompt, or by hand). Whichever path they take, they see a **live preview** of real components before committing, and they can **execute** — generate genuine styling artifacts (CSS variables / Tailwind tokens / shadcn theme) that feed the code generated for *their* product. A theme is stored per app type, can be promoted by an admin to a company-wide default, and always resolves to something accessible: project theme → company default → wxKanban built-in default. v1 themes the customer's generated product; rich preset libraries for desktop/mobile and re-skinning wxKanban itself are deferred.

## Business Problem

A customer's first reaction to a generated product is visual, but the kit gives the visual decision the least support. The "look" is a buried sub-step expressed as prose ("16px base, 1.25 modular scale", five hex colors) — there is no preview, no accessibility check, and crucially no *output*: nothing the customer can drop into their codebase. So the most emotionally important early decision is the weakest part of the flow, and the artifact it produces is decorative rather than executable.

Meanwhile the kit already has the **adjacent machinery** — app-type-filtered inspiration galleries, an AI token-derivation route with a safe fallback, a company-wide promote/clear pattern, and a stack-artifact materialization path that the generation pipeline reads. The gap is purely the **elevation and execution** front end: lift visual identity out of Stack into its own surface, give it real sources (presets + galleries + build-your-own), let the customer *see* the result on real components, enforce accessibility, and emit genuine `theme.css` / Tailwind / shadcn artifacts that flow into generation the same way stack.md does. Closing this gap turns a buried prose note into a previewable, accessible, executable theme — reusing the resolution/promote/derive patterns that already exist rather than inventing new ones. It also serves the kit's teaching mission: design tokens, light/dark, and contrast become concrete, learnable artifacts instead of lore.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | The **project creator** (member or admin) choosing a visual identity at project creation or from the Theme tab. |
| **Secondary Actors** | The **company admin** (promotes/clears company-wide defaults); the **generation pipeline** (non-human consumer that reads executed theme artifacts); the AI derive service (gallery/prompt/logo). |
| **Key Value** | The early, emotionally-important visual decision becomes a first-class, previewable, accessible surface that **executes** to real styling artifacts for the customer's product — built almost entirely on existing stack/derive/promote machinery. |
| **Sources** | Three, all app-type-filtered: curated **presets** (swatched cards, web-first), **inspiration galleries + AI-derive** (Mobbin/Dribbble/etc., cite → derive), **build-your-own** (derive-from-logo, AI-from-prompt, manual pickers). |
| **What's captured** | A structured per-(project, app type) theme: `source` + `sourceRef` provenance; a full **light** token set and a full **dark** token set (the 19 semantic shadcn variables in HSL + radius); typography (font family + scale). |
| **Preview** | A live preview rendering real sample shadcn components in the working theme, with an independent light/dark toggle scoped to the preview node. |
| **Accessibility** | WCAG contrast results (foreground-on-background, primary-foreground-on-primary) with a pass/fail badge; shipped presets and the built-in default pass AA. An inaccessible default is a defect. |
| **Execute** | Render real artifacts — `theme.css` (`:root` + `.dark`), Tailwind notes, shadcn theme — downloadable and materialized beside the stack artifacts for the generation pipeline. |
| **Resolution** | project theme (per app type) → company default (per app type) → wxKanban built-in default theme. Never empty. |
| **Scope Boundary** | **IN**: Theme surface (creation step + project tab) split out of Stack; three sources; four build-your-own aids; live preview; contrast checks; per-(project, app type) structured storage; execute to artifacts; company promote/clear; three-tier resolution; backward-compat seeding of the Stack doc's token line. **OUT**: re-skinning wxKanban itself; preset *libraries* for desktop/mobile (token-only there in v1); hot-patching a deployed customer app; choosing the styling *framework* (that stays in Stack). |

---

## User Scenarios

### US1 — Accept a preset (the fast path)

A creator picks "web," opens Theme, clicks a preset card, glances at the live preview, and finishes. No manual decisions; the project has a complete, accessible theme and rendered artifacts.

**Expected:** one preset click yields a full light+dark theme, a `projectthemes` row for (project, web), and a `theme.css` artifact; the preset passes WCAG AA.

### US2 — Inspired by a reference

A creator browses Mobbin, cites one screen they like, and lets AI derive a full light+dark palette, then nudges a color before saving. The AI provider is briefly down on a retry — the derive returns safe defaults instead of erroring.

**Expected:** gallery-derive produces a complete editable theme; an AI failure returns defaults with no 500 and no blocked flow.

### US3 — From our brand / describe it / by hand

A creator with a company logo clicks "derive from logo" for a brand-based starting palette; another types "warm, calm, professional, high-contrast"; a design-literate user sets each token by hand watching contrast badges. All three land on a full, editable theme.

**Expected:** logo-derive, prompt-derive, and manual editing each yield a complete theme; contrast badges update live; manual edits never produce a partial/invalid theme.

### US4 — Standardize the company, then inherit

An admin builds one good theme and promotes it as the company default for web. A new web project with no theme of its own resolves to that default. A non-admin cannot promote.

**Expected:** promote writes one `companythemeprofiles` row for (company, web); a new themeless web project resolves to it; non-admin promote is rejected; clearing it falls through to the wxKanban default.

### US5 — Revise later, per app type

A project ships web + mobile. The owner sets a distinct theme for each from the Theme tab, re-executes, and the updated artifacts flow into the next generation.

**Expected:** distinct (project, web) and (project, mobile) rows persist and reload independently; execute regenerates artifacts for the edited type.

---

## Functional Requirements

### FR-001 — Theme surface (split out of Stack)

A dedicated Theme step MUST appear in project creation alongside the Stack step, and a Theme tab MUST appear on the project detail panel sibling to the Stack tab. The look-and-feel controls MUST be removed from the Stack editor.

**Acceptance Criteria**:

- [ ] Theme is its own step in creation and its own tab on the project
- [ ] The Stack editor no longer contains look-and-feel controls
- [ ] A creator can apply a preset and finish with a complete, accessible theme without a single manual decision

### FR-002 — App-type-keyed sources

The Theme experience MUST key its sources to the project's selected app type(s), filtering presets and galleries to those types via the existing app-type filtering pattern.

**Acceptance Criteria**:

- [ ] Presets and galleries shown are filtered to the project's app type(s)
- [ ] A multi-type project surfaces sources for each of its types

### FR-003 — Curated presets

The customer MUST be able to browse a gallery of ready-made themes (swatched preview cards) and apply one in a single action. Presets are web-first in v1.

**Acceptance Criteria**:

- [ ] Applying a preset yields a full, editable light+dark theme
- [ ] Every shipped preset passes WCAG AA
- [ ] Presets are surfaced for web; desktop/mobile fall back to galleries + build-your-own

### FR-004 — Inspiration galleries + AI-derive

The existing galleries (Mobbin, Dribbble, Land-book, Awwwards) MUST remain available as cited references; selecting one and citing a specific app/page MUST let AI derive a full theme.

**Acceptance Criteria**:

- [ ] A cited gallery reference produces a complete, editable light+dark theme
- [ ] The result is fully editable afterward

### FR-005 — Build-your-own (logo / prompt / manual)

The customer MUST be able to derive a starting palette from the company logo (when one is on file), generate a complete theme from a plain-language prompt, and set every semantic token by hand. Any preset/AI/logo result MUST be fully editable.

**Acceptance Criteria**:

- [ ] Derive-from-logo produces a palette when `company.logourl` exists; absent a logo the option is unavailable, not broken
- [ ] AI-from-prompt yields a complete light+dark theme
- [ ] Manual editing covers all semantic tokens, radius, and typography and never yields a partial/invalid theme

### FR-006 — AI fail-open

Every derivation path (gallery, logo, prompt) MUST fall back to safe default tokens on AI failure and MUST never block the customer or error the flow, mirroring the existing `derive-tokens` route.

**Acceptance Criteria**:

- [ ] With the LLM provider unset/erroring, each derive path returns default tokens
- [ ] No derive failure returns 5xx or blocks the customer

### FR-007 — Live preview

A live preview MUST render real sample components in the working theme and update immediately on any change, with an independent light/dark toggle scoped to the preview (not the surrounding app).

**Acceptance Criteria**:

- [ ] The preview reflects token changes immediately
- [ ] The preview's light/dark toggle is independent of the app's theme
- [ ] The preview renders real shadcn components (buttons, card, input, tabs, badge, typography ramp)

### FR-008 — Accessibility (contrast, first-class)

The Theme UI MUST surface WCAG contrast results for the critical pairs (foreground-on-background, primary-foreground-on-primary) with a pass/fail badge. Shipped presets and the built-in default MUST pass AA.

**Acceptance Criteria**:

- [ ] Contrast badges appear for the critical pairs and update live
- [ ] Every preset and the built-in default pass WCAG AA
- [ ] A failing manual choice is flagged (warned), not silently accepted

### FR-009 — Structured storage (per app type)

A theme MUST be stored as structured data per (project, app type) — one active theme per app type — not as round-tripped prose.

**Acceptance Criteria**:

- [ ] A project can hold distinct themes for web and mobile; each persists and reloads independently
- [ ] Storage is structured JSON (no lossy markdown round-trip)

### FR-010 — Execute to artifacts

Execute MUST produce real artifacts — CSS variables (light + dark), Tailwind tokens, and a shadcn-compatible theme — available to download and persisted for the generation pipeline. Artifacts MUST be materialized alongside the project's stack artifacts.

**Acceptance Criteria**:

- [ ] Execute yields a downloadable `theme.css` whose variables match the saved theme
- [ ] Pasted into a shadcn page, the artifact renders as previewed
- [ ] Artifacts are materialized beside the stack artifacts for the generation pipeline

### FR-011 — Company reuse & three-tier resolution

An admin MUST be able to promote a project's theme to a company-wide default for an app type (at most one per app type) and clear it; the action is tenant-isolated and admin-gated. A project's effective theme MUST resolve: project theme (app type) → company default (app type) → wxKanban built-in default — never empty.

**Acceptance Criteria**:

- [ ] Admin promote writes one company default per (company, app type); non-admins cannot promote
- [ ] A themeless project resolves to the company default; with neither, to the wxKanban built-in default
- [ ] Clearing a company default takes effect immediately (falls through to the wxKanban default)

### FR-012 — Backward compatibility

The Stack document's existing coarse "Design Tokens" line MUST continue to render, seeded from the chosen theme's values, so existing stack consumers are unaffected.

**Acceptance Criteria**:

- [ ] The Stack doc still renders a design-tokens line, seeded from the theme
- [ ] Existing stack consumers see no regression

---

## Technical Sections

### Shared model (`src/shared/theme-tokens.ts`)

New module, the executable layer distinct from the coarse `DesignTokens` in `stack-defaults.ts`:

- `ThemeTokenSet` — the 19 semantic shadcn tokens in HSL (`background, foreground, card/-foreground, popover/-foreground, primary/-foreground, secondary/-foreground, muted/-foreground, accent/-foreground, destructive/-foreground, border, input, ring`) + `radius`.
- `ProjectTheme` — `{ source: 'preset'|'gallery-ai'|'logo'|'prompt'|'manual'; sourceRef: string|null; light: ThemeTokenSet; dark: ThemeTokenSet; typography: { fontFamily, scale } }`.
- Renderers (the "execute" core, paralleling `renderStackMarkdown` but emitting CSS): `renderThemeCss(theme)` → `:root{…}` + `.dark{…}`; `renderTailwindThemeNotes(theme)`; `renderShadcnTheme(theme)`.
- `THEME_PRESETS` registry — curated concrete token sets (seeded from shadcn registry themes via the shadcn MCP `list_themes`/`get_theme`), tagged `bestFor: AppType[]`; `presetsForAppType()` mirrors `galleriesForAppType()`.
- `WXKANBAN_DEFAULT_THEME` — the built-in fallback, packaged from the existing shadcn/wxKanban variable set in `src/client/styles/index.css` (the ultimate resolution tier, must pass AA).
- A contrast utility (WCAG ratio for a token pair) shared by UI badges and tests.

`DesignTokens` is **kept** for the stack.md narrative and seeded (its five colors + typography) from the chosen `ThemeTokenSet` for FR-012.

### Data / Schema

- `src/db/schema/projecttheme.ts` — `projectthemes`: `id` (uuid v7 PK), `projectid` (FK → companyprojects, cascade), `apptype` (varchar 20), `theme` (jsonb — the `ProjectTheme`), `createdbyid` (FK → userprofiles, set null), `createdat`/`updatedat`. **UNIQUE (projectid, apptype)** — one theme per app type.
- `src/db/schema/companythemeprofile.ts` — `companythemeprofiles`, mirroring `companystackprofile.ts`: `id`, `companyid` (FK, cascade), `apptype` (varchar 20), `theme` (jsonb), `createdbyid`, timestamps. **UNIQUE (companyid, apptype)**.
- One generated migration creating both tables, applied via the established `pg.Client` + transaction pattern (app-side UUID v7), not drizzle-kit push (needs a TTY here). See `0032_spec057_companystackprofiles.sql` for the shape.

### Server (`src/server/routes`)

New `src/server/routes/projectTheme.ts`, mounted in the real entrypoint chain `src/server/index.ts → app.ts` (note: `index2.ts` is dead code — routes mounted there 404 in prod). All DB access via `src/db/client.ts` (postgres-js), never `lib/db.ts`.

- `GET /api/projects/:id/theme?appType=` — resolved theme (project → company → wxKanban default).
- `PUT /api/projects/:id/theme` — upsert the structured `ProjectTheme` for (project, app type); ADMIN + access-checked, like the existing stack PUT in `projects.ts`.
- `GET /api/themes/presets?appType=` — curated presets for the app type.
- `POST /api/projects/:id/theme/execute` — render artifacts (`theme.css`/tailwind/shadcn), persist + materialize beside stack artifacts, return for download/preview.
- AI derive (a `ThemeDeriveService` extending the `/api/projects/derive-tokens` pattern, full `ThemeTokenSet`, safe-fallback): `POST /api/themes/derive/gallery`, `POST /api/themes/derive/prompt`, `POST /api/themes/derive/logo` (palette from `company.logourl`). All go through the `LLM_PROVIDER` contract and fall back to defaults on failure.
- Company theme profiles: `GET/POST /api/admin/theme-profiles*` + promote/clear — copy `src/server/routes/stackProfiles.ts` in shape; tenant-isolated by `req.companyid`, ADMIN-gated.

### Client

- `src/client/components/Projects/ThemeStudio.tsx` — the shared Theme surface, reused in two contexts exactly as `StackEditor` is reused by `CreateProjectModal` + `StackTabView`. Left: source switcher (presets / inspiration+AI / build-your-own with logo-derive, prompt box, manual pickers + radius/font). Right: `ThemePreview.tsx`. Footer: execute / save to project / save as company theme (ADMIN).
- `src/client/components/Projects/ThemePreview.tsx` — injects the working `ThemeTokenSet` as scoped CSS variables onto a preview container and renders real components from `src/client/components/ui/`; the scoped light/dark toggle reuses the `.dark`-class mechanism from `src/client/lib/themePreference.ts`.
- `src/client/components/Projects/ThemeTabView.tsx` — the project Theme tab, sibling to `StackTabView.tsx`.
- `src/client/components/Projects/CreateProjectModal.tsx` — add the Theme step.
- `src/client/components/Projects/StackEditor.tsx` — remove the look-and-feel controls (moved to ThemeStudio).
- `src/client/pages/admin/ThemeProfilesPage.tsx` — clone `StackProfilesPage.tsx`.

### Generation hand-off

On execute, write `theme.css` + a short human-readable `theme.md` into the project's artifacts beside the stack artifacts, so the SPEC-056 generation-injection path consumes them the way it reads stack.md. The structured row is the source of truth; the files are derived output. Resolution (project → company → wxKanban default) is evaluated at read time, matching the stack resolution chain.

### Shared types

`ProjectTheme` / `ThemeTokenSet` and the derive/execute request/response DTOs live in `src/shared/theme-tokens.ts` and are exported from the shared types barrel for client + server use.

---

## Success Criteria

1. **The visual decision is first-class.** Theme is its own creation step + project tab; the Stack editor no longer holds look-and-feel controls. *(FR-001)*
2. **Three sources, app-type-aware.** Presets, inspiration+AI-derive, and build-your-own each produce a full editable theme, filtered to the project's app type(s). *(FR-002/003/004/005)*
3. **AI never blocks.** Every derive path returns safe defaults on failure with no 5xx. *(FR-006)*
4. **See before commit.** A live preview renders real components and toggles light/dark independently. *(FR-007)*
5. **Accessible by default.** Contrast badges surface the critical pairs; presets and the built-in default pass AA. *(FR-008)*
6. **It executes.** Execute yields a downloadable `theme.css` matching the saved theme, materialized beside the stack artifacts for generation. *(FR-009/010)*
7. **Company reuse + never-empty resolution.** Admin promote/clear works; resolution falls project → company → wxKanban default. *(FR-011)*
8. **No regression.** The Stack doc's token line still renders, seeded from the theme. *(FR-012)*

---

## Constraints & Notes

### Constraints

- **Reuse, don't reinvent.** Built on SCOPE-047's galleries, `derive-tokens` route + safe-fallback, and the company promote/clear pattern; on the stack-artifact materialization path (SPEC-056); and on the shadcn variable set already in `index.css`. Net-new = the executable `theme-tokens` model + renderers, the two tables, the theme routes + ThemeDeriveService, and the ThemeStudio/preview UI.
- **Executable, not prose.** Themes are structured JSON rendered to real CSS/Tailwind/shadcn — never parsed back out of markdown (the deliberate break from Stack's round-trip).
- **Per app type, never empty.** One theme per (project, app type); resolution always terminates at the wxKanban built-in default.
- **Accessible by default.** Contrast is a first-class acceptance criterion; shipped presets and the default must pass AA.
- **Customer product only.** Theming targets the customer's generated product; it never re-skins the wxKanban app. The wxKanban look is reused only as the *content* of the fallback theme.
- **Correct plumbing.** Routes mounted via `index.ts → app.ts` (not dead `index2.ts`); DB via `src/db/client.ts`; 100% TypeScript (no `any`), Pino-only.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`; fences written by the orchestrator only.

### Out of Scope (v1 / later)

- **Re-skinning wxKanban itself / per-company wxKanban branding** — themes the customer's product only.
- **Preset libraries for desktop/mobile** — token-level theming + AI-derive + build-your-own only in v1; curated preset galleries for those types are a later scope.
- **Hot-patching a deployed customer app** — execute emits artifacts for the generation pipeline; it does not live-theme a running product.
- **Choosing the styling framework** — that stays a Stack dimension; Theme decides the values the framework renders.

### Dependencies

- SCOPE-047 (galleries, derive-tokens, `DesignTokens`, company-profile pattern); SPEC-056 (stack.md materialization/injection path); the shadcn/Tailwind variable set in `src/client/styles/index.css` + `tailwind.config.js`; `company.logourl`; the `LLM_PROVIDER` contract.

### Notes

- **Likely fan-out (decided at `createSpecs`):** ~3 implementation specs — (A) theme model + storage + execute artifacts; (B) Theme Studio UI (preview, presets, manual pickers, contrast, creation-step + project-tab integration); (C) AI derivation + company theme profiles. Folder numbers take the next global SPEC numbers, not 062.
- **Open questions deferred to spec sizing:** exact preset source to seed `THEME_PRESETS` (shadcn registry subset vs tweakcn export); whether `theme.css` also auto-updates the customer's Tailwind font imports.
- **Process note:** authored in-conversation via interactive buildscope (section-by-section, the standing workaround while the orchestrator `buildscope` CLI is broken); implementation routes through `createSpecs` → `implement` per orchestrator-first.
