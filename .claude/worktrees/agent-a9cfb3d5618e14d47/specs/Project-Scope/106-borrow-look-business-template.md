# SCOPE-106: Borrow-a-Look → Business Template

**Scope Number**: SCOPE-106
**Status**: `draft`
**Created**: 2026-07-20
**Last Reviewed**: 2026-07-20 (interactive buildscope — section-by-section, approved through all sections)
**Depends On**: SCOPE-062 (project-theme — already implemented; reuses its `ThemeTokenSet`/`ProjectTheme` model, `renderThemeCss`/Tailwind/shadcn renderers, `themePassesAA`, the Zod `projectThemeSchema`, `deriveThemeViaAI` + fail-open, three-tier `resolveTheme`, execute/materialize path, and the `ThemeStudio`/`ThemePreview` UI); the `@sparticuz/chromium` launch pattern in `src/server/services/MarkdownPdfRenderer.ts`; the `LLM_PROVIDER` dispatch (`generateOnce`); `company.logourl`.
**Related Scopes**: SCOPE-062 is the token-only foundation this extends; SCOPE-047 (stack-style) owns the galleries/derive lineage 062 was built on.
**Source**: `specs/Project-Scope/106-borrow-look-business-template.md`
**Implemented By**: SPEC-106 (single combined implementation spec — `specs/106-borrow-look-business-template/`)

---

## Overview

A customer sees a website they admire — its colors, its control styling — and wants their generated product to feel like that. But they are a business: their product needs *their own* header (logo, business/app name) and *their own* footer, not the admired site's. Today the Theme Studio's "inspiration" path only lets them cite a gallery screen and have AI guess a palette — lossy, and it does nothing about branding. There is no way to faithfully borrow a real site's look, wrap it in their own header/footer, or save that branded look and reuse it across projects.

SCOPE-106 adds three things to the already-shipped SCOPE-062 Theme Studio. First, a **URL source**: point at a live site; a headless browser captures its real rendered styling and AI maps it onto SCOPE-062's 19-token model (fonts + radius included), with 062's WCAG-AA guard and fail-open underneath so a bad grab never yields a broken theme. Second, **business chrome**: the user drops in their own logo, sets the business/app name, and sets a footer line — authored by them, laid on top of the borrowed look (the admired site's own layout is not reconstructed). Third, a **named template gallery**: the bundle of borrowed look + business chrome saves as a named, company-wide template that any project can pick and inherit. The whole thing is shown WYSIWYG in an expanded control gallery before commit, and executes to real artifacts (theme.css + header/footer components) beside the existing stack artifacts for the generation pipeline. As with SCOPE-062, this themes the **customer's generated product** — it never re-skins wxKanban.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | The **project creator** (member or admin) who wants a branded look drawn from a site they like. |
| **Secondary Actors** | The **company admin** (curates the shared template gallery — save/rename/delete); the **generation pipeline** (non-human consumer of executed theme + chrome artifacts); the **AI extraction service** (maps captured styles → tokens). |
| **Key Value** | Turn "a website I like" into a branded, reusable house look — colors *and* our header/footer — in one flow, built almost entirely on SCOPE-062's shipped token/preview/execute/resolution machinery. |
| **Net-new vs. SCOPE-062** | (1) a faithful URL-extraction source; (2) business header/footer chrome as a new artifact type; (3) a named, multi-entry reusable template gallery. Everything else is reused from 062. |
| **What's borrowed vs. authored** | **Borrowed** from the site: color scheme + control styling only. **Authored** by the user: header (logo + business/app name) + footer line. The admired site's layout/header/footer is never reconstructed. |
| **Extraction** | Headless `@sparticuz/chromium` captures computed styles + CSS custom properties + relevant DOM; the LLM maps them to a complete light + dark `ThemeTokenSet` + fonts + radius; clamped to WCAG AA; fail-open to the wxKanban default on any failure. |
| **Template** | A named, company-wide bundle of `{ look: ProjectTheme, chrome: BusinessChrome }`; a collection (many per company), picked and inherited by any project. Any member may save; only an admin may rename/delete. |
| **Scope Boundary** | **IN**: URL source; faithful capture + AI map + AA-guard + fail-open; expanded WYSIWYG control gallery; business chrome authoring (logo + name + footer line); execute chrome to artifacts; named reusable template gallery; pick-and-inherit with never-empty resolution. **OUT**: reconstructing the admired site's own layout/header/footer; rich chrome (nav links, multi-column footers, social icons); per-app-type templates; re-skinning wxKanban; hot-patching a deployed app; choosing the styling framework. |

### Key Entities

| Entity | Kind | Description |
| --- | --- | --- |
| **Theme Template** | New | A named, company-wide bundle of `{ name, theme: ProjectTheme, chrome: BusinessChrome }` — a gallery entry. Many per company; picked and inherited by any project. |
| **Business Chrome** | New | The customer's own header/footer for their product — `{ logoRef, appName, footerLine }`. User-authored, styled by the theme, never derived from the borrowed site. |
| **Website Look Source** | New (concept) | A live URL the user borrows color scheme + control styling from. Recorded as theme provenance (`source: "url"`, `sourceRef: <url>`); contributes tokens only, never layout/chrome. |
| **`themetemplates`** | New (table) | Persistence for Theme Template — `companyid`-scoped, `jsonb` theme + chrome, `UNIQUE (companyid, name)`. A collection, not one-per-app-type. |
| **`ProjectTheme` / `ThemeTokenSet`** | Reused (SCOPE-062) | The 19-token light+dark look (+ fonts + radius) a Theme Template carries. Extended only by adding `"url"` to `ThemeSource`. |
| **`projectthemes`** | Reused (SCOPE-062) | Where applying a template writes the project's effective theme; unchanged by this scope. |

---

## User Scenarios

### US1 — Borrow a look (the happy path)

A creator on a web project opens Theme, picks the new "From a website" source, pastes a URL of a site they like, and waits a few seconds. The Studio renders a full control gallery — buttons, cards, inputs, tabs, badges, a form, the type ramp — in the extracted look. They nudge one accent color and move on.

**Expected:** the URL grab produces a complete, WCAG-AA-passing 19-token theme (light + dark) plus body/heading fonts and radius; the control gallery reflects it immediately; a single manual tweak never yields a partial/invalid theme.

### US2 — Brand it with our chrome

The borrowed look is right, but it's someone else's site. The creator adds their own logo, types their business/app name into the header, and sets a footer line (e.g. "© 2026 Acme Corp — All rights reserved"). The preview's header and footer update live, styled by the borrowed theme.

**Expected:** the header renders the uploaded logo + name and the footer renders the line, both driven by the current tokens; the chrome is the user's own and is never derived from the admired site.

### US3 — Save once, reuse everywhere

Happy with look + chrome, the creator saves the bundle as a named company template ("Acme House Style"). Later, a teammate starting a new web project opens the template gallery, picks "Acme House Style," and the new project inherits both the colors and the header/footer. An admin can rename or delete gallery entries.

**Expected:** saving writes one named, company-wide template (look + chrome); a new project that picks it resolves to those tokens and that chrome; gallery entries are curatable (rename/delete by admin); the gallery can hold many named templates, not just one default.

### US4 — The site won't cooperate (edge/failure)

The pasted URL is unreachable, blocks headless browsers, or the AI extraction errors mid-way.

**Expected:** the flow fails open — it returns a safe, complete, AA-passing starting theme (the wxKanban default, or whatever partial capture succeeded, clamped to AA), shows a plain "couldn't fully read that site — here's a safe starting point you can edit" message, and never returns a 5xx or blocks the creator. Business chrome the user already entered is preserved.

---

## Functional Requirements

### FR-001 — "From a website" source

The Theme Studio MUST offer a new source that accepts a website URL and records it as the theme's provenance (`source: "url"`, `sourceRef: <url>` on the SCOPE-062 `ProjectTheme`).

**Acceptance Criteria**:

- [ ] A "From a website" option appears alongside the existing sources (presets / inspiration / build-your-own)
- [ ] Submitting a URL kicks off extraction and, on success, populates a full editable theme
- [ ] The saved theme records `source:"url"` and the URL as `sourceRef`

### FR-002 — Faithful extraction (headless capture + AI map)

The system MUST load the URL in a headless browser, capture the page's real rendered styling (computed styles, CSS custom properties, and the relevant DOM), and use the LLM (via the `LLM_PROVIDER` dispatch) to map that into a complete SCOPE-062 `ThemeTokenSet` — 19 semantic roles for light and dark — plus body/heading font family and radius.

**Acceptance Criteria**:

- [ ] Extraction of a normal public site yields a complete light + dark 19-token set, fonts, and radius
- [ ] The extracted colors visibly resemble the source site's palette (spot-checked on 2–3 real sites)
- [ ] Output validates against the existing `projectThemeSchema` (no partial/invalid theme)

### FR-003 — AA-guard + fail-open (reuses SCOPE-062)

Every extraction MUST be clamped to pass WCAG AA on the critical pairs, and any failure (unreachable URL, bot-blocked, Chromium crash, AI error/timeout) MUST fail open to a safe, complete starting theme with no 5xx and without blocking the flow. Business chrome already entered MUST be preserved across a failed retry.

**Acceptance Criteria**:

- [ ] The returned theme passes `themePassesAA` (critical pairs), matching 062's guarantee
- [ ] A forced failure on each path (bad URL, Chromium unavailable, AI unset) returns a complete default theme, HTTP 2xx, and a plain "couldn't fully read that site" message
- [ ] Chrome fields the user entered survive an extraction retry

### FR-004 — WYSIWYG control gallery

The Studio preview MUST render a full gallery of real components in the working theme (buttons in each variant, card, input, tabs, badge, a sample form, the typography ramp) with the header and footer shown in place, updating live on any token change, with a light/dark toggle scoped to the preview.

**Acceptance Criteria**:

- [ ] The gallery shows the full component set plus the header/footer, all in the working theme
- [ ] Any token or chrome edit updates the preview immediately
- [ ] The preview's light/dark toggle is independent of the surrounding app

### FR-005 — Business chrome authoring

The user MUST be able to author their own header (a logo and the business/app name) and footer (a footer/legal line), stored as structured data on the theme bundle. Chrome is authored by the user and is never populated from the extracted site.

**Acceptance Criteria**:

- [ ] Header accepts a logo (uploaded or `company.logourl`) and an editable business/app name
- [ ] Footer accepts an editable line; both render in the preview styled by the current tokens
- [ ] Chrome is stored structured (not markdown round-trip) and reloads intact

### FR-006 — Execute chrome to artifacts

Execute MUST emit real header and footer artifacts (styled to the theme) alongside the existing SCOPE-062 `theme.css` / Tailwind / shadcn artifacts, materialized beside the stack artifacts for the generation pipeline.

**Acceptance Criteria**:

- [ ] Execute produces downloadable header + footer component artifacts plus the existing `theme.css`
- [ ] The artifacts are materialized in the project's artifact location beside the stack artifacts
- [ ] The rendered chrome matches what the preview showed

### FR-007 — Named, reusable template gallery

A saved template MUST bundle the look (a `ProjectTheme`) and the business chrome under a user-given name, stored company-wide and holding many entries. Any project member MAY save a template; an admin MAY rename and delete gallery entries. All gallery access is tenant-isolated.

**Acceptance Criteria**:

- [ ] Saving writes one named company template capturing both tokens and chrome
- [ ] The gallery lists multiple named templates for the company; a member can save, only an admin can rename/delete
- [ ] Templates are visible only within the owning company (tenant isolation)

### FR-008 — Pick a template & inherit

A project MUST be able to pick a template from the gallery and inherit both its tokens and its chrome. The effective look still resolves never-empty: project theme → company template/default → wxKanban built-in default.

**Acceptance Criteria**:

- [ ] Picking a template applies its tokens and chrome to the project
- [ ] A project that has picked a template reloads with that look + chrome
- [ ] With no project theme and no template, resolution still falls through to the wxKanban default

---

## Technical Sections

### Shared model (`src/shared/theme-tokens.ts` + new `src/shared/theme-template.ts`)

- Add `"url"` to the existing `ThemeSource` union — the only change to the shipped SCOPE-062 module.
- New `theme-template.ts`: `BusinessChrome = { logoRef: string|null; appName: string; footerLine: string }`; `ThemeTemplate = { id; name; theme: ProjectTheme; chrome: BusinessChrome }`. Renderers `renderHeaderComponent(chrome, theme)` and `renderFooterComponent(chrome, theme)` — the chrome analog of 062's `renderThemeCss`, emitting real header/footer component source styled from the tokens.

### Data / Schema

- `src/db/schema/themetemplate.ts` — `themetemplates`: `id` (uuid v7 PK), `companyid` (FK → companies, cascade), `name` (varchar), `theme` (jsonb — `ProjectTheme`), `chrome` (jsonb — `BusinessChrome`), `createdbyid` (FK → userprofiles, set null), `createdat`/`updatedat`. **UNIQUE (companyid, name)** — many per company, no duplicate names. A collection, not one-per-app-type.
- One generated migration creating the table, applied via the established `pg.Client` + transaction pattern (app-side UUID v7), not drizzle-kit push — same as `0035_spec062_project_themes.sql`.

### Server (`src/server/routes` + `src/server/services`)

- **Capture service** `src/server/services/SiteStyleCaptureService.ts` — reuses the `launchBrowser()` pattern from `MarkdownPdfRenderer.ts` (`@sparticuz/chromium` on App Runner, bundled puppeteer locally). Loads the URL, injects a reader that collects computed styles, CSS custom properties, and the header/nav/footer/main DOM, and returns a raw capture. Throws on any failure so the caller fail-opens.
- **Extraction route** `POST /api/themes/derive/url` in `src/server/routes/projectTheme.ts` — capture → build LLM context → the existing `deriveThemeViaAI` helper (extended to accept URL-capture context) → Zod-validate → AA-clamp → fail-open to `WXKANBAN_DEFAULT_THEME` on any error. Sits beside the existing `/derive/{gallery,prompt,logo}` trio; adds `source:"url"`.
- **Template routes** `src/server/routes/themeTemplates.ts` — `GET /api/themes/templates` (company list), `POST` (save — any member), `PATCH /:id` (rename — admin), `DELETE /:id` (admin), `POST /api/projects/:id/theme/apply-template` (writes the `projectthemes` row + chrome). Tenant-isolated by `req.companyid`, mirroring `stackProfiles.ts` / `companyThemeProfiles.ts`.
- **Execute** — extend the shipped `POST /api/projects/:id/theme/execute` to also render + materialize the header/footer artifacts (via the new renderers) beside `theme.css` when chrome is present.

### Client (`src/client/components/Projects/`)

- `ThemeStudio.tsx` — add the "From a website" source (URL field + Extract), a chrome editor panel (logo upload / `company.logourl` pick, app-name field, footer-line field), a Save as template action, and a template gallery picker.
- `ThemePreview.tsx` — widen to the full control gallery and render the header/footer in place.
- `TemplateGallery.tsx` (new) — lists company templates; pick-to-apply for members; rename/delete for admins.
- New routes wired in `src/server/app.ts` (the real entrypoint chain — never dead `index2.ts`). All DB via `src/db/client.ts`; 100% TS, no `any`; Pino-only.

### Chromium fallback (the top feasibility risk)

Capture runs server-side because a foreign origin's computed styles cannot be read from the browser (cross-origin). App Runner Chromium is known-fragile in this stack (`libnspr4.so` failures; Banner/Portfolio deliberately avoid it). The v1 contract: headless capture → on failure, fail-open to the default theme (FR-003), with an optional lightweight static fetch-and-parse tier as a documented middle fallback before defaulting. If server Chromium proves unusable in prod, the capture service is the isolated seam to move off the App Runner web service later (its interface stays the same).

### Generation hand-off

On execute, write `theme.css` (unchanged from 062) plus the rendered header/footer component artifacts into the project's artifacts beside the stack artifacts, so the SPEC-056 generation-injection path consumes them the way it reads stack.md. The structured rows (`projectthemes` + `themetemplates`) are the source of truth; the files are derived output. Resolution (project → company template/default → wxKanban default) is evaluated at read time, matching the stack resolution chain.

---

## Success Criteria

1. **Faithful borrow.** Extracting from 3 real public sites yields, in each case, a complete AA-passing light + dark 19-token theme plus fonts and radius, whose palette visibly matches the source on spot-check. *(FR-001/002)*
2. **Never breaks.** A forced failure on each path (unreachable URL, Chromium unavailable, AI provider unset) returns a complete default theme with HTTP 2xx and 0 five-hundreds, a plain "couldn't fully read that site" message, and any already-entered chrome preserved. *(FR-003)*
3. **See before commit.** The preview renders the full control gallery plus the header/footer, reflects any token or chrome edit on the next render, and toggles light/dark independently of the app. *(FR-004)*
4. **Our branding, not theirs.** The header shows the user's own logo + business/app name and the footer shows the user's line, both theme-styled; 0 chrome fields are ever populated from the extracted site. *(FR-005)*
5. **It executes.** Execute emits `theme.css` plus header and footer artifacts beside the stack artifacts, and the rendered chrome matches the preview 1:1. *(FR-006)*
6. **Save once, reuse everywhere.** A saved template appears in the company gallery (which holds many entries); a new project that picks it inherits both tokens and chrome; a member can save, only an admin can rename/delete, and templates are visible only within the owning company. *(FR-007/008)*
7. **Never empty.** With no project theme and no template selected, resolution falls through to the wxKanban built-in default — 0 projects ever resolve to an empty look. *(FR-008)*

---

## Constraints & Notes

### Constraints

- **Reuse, don't reinvent.** Built on SCOPE-062's shipped machinery — the `ThemeTokenSet`/`ProjectTheme` model, `renderThemeCss`/Tailwind/shadcn renderers, `themePassesAA`, the Zod `projectThemeSchema`, `deriveThemeViaAI` + fail-open, three-tier `resolveTheme`, execute/materialize, and the `ThemeStudio`/`ThemePreview` UI. Net-new is only: the capture service, the `/derive/url` route, the `themetemplates` table + routes, the chrome renderers, and the Studio additions.
- **Executable, not prose.** Tokens and chrome are structured JSON rendered to real CSS + header/footer components — never parsed back out of markdown.
- **Customer product only.** This themes the customer's generated product; it never re-skins the wxKanban app. The wxKanban look is reused only as the content of the fail-open default.
- **Correct plumbing.** Routes mounted via `index.ts → app.ts` (not dead `index2.ts`); all DB via `src/db/client.ts` (postgres-js), never `lib/db.ts`; 100% TypeScript (no `any`), Pino-only logging.
- **Chromium is the top risk.** Server-side headless capture is fragile on App Runner (`libnspr4.so`; Banner/Portfolio avoid it). The capture service is an isolated seam with a fail-open contract (headless → optional static-parse → wxKanban default) so the risk can't spread; it can be relocated off the web service later without changing its interface.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`; fences written by the orchestrator only.

### Out of Scope (v1 / later)

- **Reconstructing the admired site's own layout/header/footer** — we borrow color + controls only; the user authors their own chrome.
- **Rich chrome** — nav links, multi-column footers, social icons (v1 = logo + name + footer line).
- **Per-app-type templates** — v1 templates are flat and named; app-type-keyed templates are a later refinement (062's per-app-type theme resolution is unchanged).
- **Re-skinning wxKanban itself; hot-patching a deployed customer app; choosing the styling framework** (a Stack decision).

### Dependencies

- SCOPE-062 (theme model, renderers, AA util, Zod schema, derive+fail-open, three-tier resolution, Theme Studio) — already implemented; `MarkdownPdfRenderer`'s `@sparticuz/chromium` launch pattern; the `LLM_PROVIDER` dispatch (`generateOnce`); `company.logourl`.

### Notes

- **Likely fan-out (decided at `createSpecs`):** ~3 implementation specs — (A) URL capture service + `/derive/url` + AA/fail-open; (B) business chrome model + renderers + execute-to-artifacts; (C) template gallery (table + routes + Studio picker + save/curate). Folder numbers take the next global SPEC numbers, not 105.
- **New domain terms** (added to `CONTEXT.md`): **Website Look Source**, **Business Chrome**, **Theme Template**.
- **Process note:** authored in-conversation via interactive buildscope (section-by-section, the standing workaround while the `buildscope` CLI persists nothing); implementation routes through `createSpecs` → `implement` per orchestrator-first.
