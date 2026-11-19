# Implementation Plan: SPEC-106 — Borrow-a-Look Business Template

**Spec**: `specs/106-borrow-look-business-template/spec.md`
**Scope**: SCOPE-106 (`specs/Project-Scope/106-borrow-look-business-template.md`)
**Depends On**: SCOPE-062 (shipped) — theme model, renderers, AA util, Zod schema, derive + fail-open, three-tier resolution, Theme Studio.

## Stack targeting (stack.md)

Node.js + Express (server), React + Vite (client), PostgreSQL + Drizzle (data), Tailwind + shadcn/ui (styling), Vitest + Playwright (testing), Pino logging. All new code is 100% TypeScript (no `any`, no `@ts-ignore`), fenced by the orchestrator, DB access via `src/db/client.ts`, routes mounted via `src/server/index.ts → app.ts`.

## Architecture

The feature is a bounded extension of SCOPE-062. Three seams, isolated so the Chromium risk cannot spread:

1. **Capture seam** — `SiteStyleCaptureService` loads a URL in headless Chromium (reusing the `MarkdownPdfRenderer` launch pattern) and returns a raw style capture. Pure input adapter; throws on failure so callers fail-open. Swappable to a worker later without interface change.
2. **Mapping seam** — the extended `deriveThemeViaAI` turns a raw capture into a validated `ProjectTheme` (19 tokens light+dark, fonts, radius), reusing 062's Zod schema, `themePassesAA` clamp, and fail-open-to-`WXKANBAN_DEFAULT_THEME` contract.
3. **Chrome + template seam** — new `theme-template` shared model + `themetemplates` table + `themeTemplates` routes + the Studio chrome editor and gallery. Chrome renders to real header/footer artifacts at execute time.

Data of record is the DB (`projectthemes`, `themetemplates`); files (`theme.css`, header/footer components) are derived output materialized beside the stack artifacts for the generation pipeline.

## Build sequence

**Phase A — Model + storage (T001–T003)**
Add `"url"` to `ThemeSource`; create `theme-template.ts` (types + renderers); add `themetemplates` table + migration (pg.Client transaction, app-side UUID v7, mirroring `0035_spec062_project_themes.sql`).

**Phase B — Extraction (T004–T007)**
`SiteStyleCaptureService` (headless capture) + optional static fetch-and-parse fallback; extend `deriveThemeViaAI` for URL-capture context; add `POST /api/themes/derive/url` with AA-clamp + fail-open beside the existing derive trio.

**Phase C — Chrome execute + template routes (T008–T010)**
Extend `execute` to render/materialize header+footer artifacts; add `themeTemplates` CRUD routes (member-save, admin-curate, tenant-isolated); add `apply-template` route.

**Phase D — Studio UI (T011–T015)**
From-a-website source, chrome editor panel, widened `ThemePreview` gallery + header/footer, `TemplateGallery` component, Save-as-template action. Wire routes in `app.ts`.

**Phase E — Tests (T016–T018)**
Unit (renderers, mapping, AA-clamp, fail-open), E2E (extract → brand → save → apply), permission + tenant-isolation.

## Key files

- `src/shared/theme-tokens.ts` (extend `ThemeSource`), `src/shared/theme-template.ts` (new)
- `src/db/schema/themetemplate.ts` (new) + `src/db/schema/index.ts`; new migration under `src/db/migrations/`
- `src/server/services/SiteStyleCaptureService.ts` (new); `src/server/services/MarkdownPdfRenderer.ts` (launch pattern reference)
- `src/server/routes/projectTheme.ts` (add `/derive/url`, extend `execute`), `src/server/routes/themeTemplates.ts` (new), `src/server/app.ts` (wire)
- `src/client/components/Projects/ThemeStudio.tsx`, `ThemePreview.tsx`, `TemplateGallery.tsx` (new)

## Risks

- **Chromium on App Runner** (top risk): known-fragile (`libnspr4.so`; Banner/Portfolio avoid server Chromium). Mitigation: capture is an isolated seam with headless → optional static-parse → fail-open; a prod reliability spike (Open Question 1/2) decides the fallback depth and whether capture moves off the web service.
- **AI mapping fidelity**: a real site has many colors; the mapping prompt must pick semantic roles deterministically enough to satisfy Success Metric 1. Mitigation: constrain the prompt to anchor roles (bg/fg/primary/border/radius/fonts) and synthesize the rest, always AA-clamped.

## Verification

See `tests.md` and `quickstart.md`. End-to-end: extract from a live URL, brand with logo+name+footer, save as a company template, start a new project, apply the template, assert inherited tokens+chrome and never-empty resolution; force each failure path and assert 2xx + default theme + preserved chrome.
