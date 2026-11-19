# Implementation Plan: Multi-language help content (Spec 092)

**Spec**: 092 · **Phase**: design · **Created**: 2026-07-09

## Approach

Bolt a translation layer *underneath* the existing help-content system rather than forking it. The `wxkanbanhelp` row remains the canonical English source; a new `helptranslations` table holds the 5 non-English locales. Reads gain a small locale-resolution + per-field-merge helper; writes flow through new admin routes and the existing `SysAdmin/Docs.tsx` editor. AI translation reuses the app's `LLM_PROVIDER` and is always drafts-only and fail-open.

## Stack alignment

Express + Drizzle (Postgres) backend, React + Vite + Tailwind/shadcn client, Pino logging, Vitest tests — the project defaults; no new stack elements. Table/column naming follows project conventions (lowercase, no underscores): `helptranslations`, `helpid`, `ispublished`, `isstale`, `createdat`, `updatedat`.

## Architecture

1. **Data** — `helptranslations` (Drizzle schema in `src/db/schema/`, generated migration). FK `helpid` → `wxkanbanhelp.id` ON DELETE CASCADE; unique (`helpid`, `locale`).
2. **Read model** — a `resolveHelpLocale(req)` helper (precedence: `?locale=` → `user.language` → `Accept-Language` → en-US) and a `mergeHelpTranslation(base, translation)` per-field fallback merge, applied in `routes/help.ts` read handlers.
3. **Translation service** — `HelpTranslationService` (seed one item → 5 locales via `LLM_PROVIDER`, fail-open; used by both the admin seed route and the bulk script).
4. **Admin routes** — seed / save-locale / publish under `routes/sysadmin.ts`.
5. **Editor UI** — locale tabs + Generate-translations + draft/published/stale badges in `SysAdmin/Docs.tsx`.
6. **Staleness** — English save sets `isstale=true` on that item's translations; editor exposes re-seed.
7. **Bulk seed** — `scripts/seed-help-translations.ts` iterating untranslated items.
8. **Client reads** — `DocsIndexPage.tsx` / `DocsDetailPage.tsx` append `?locale=<current app locale>`.

## Sequencing

Foundation first (T001 schema), then the read path (T002–T004) which delivers the visible fix once any translations exist, then the authoring loop (T005–T008), then bulk seed (T009) and tests (T010). T002/T003 are the critical path for the user-visible bug.

## Risks & mitigations

- **Machine-translation quality** → drafts-only + human publish gate.
- **Stale translations after English edits** → `isstale` flag, last-published stays live, non-blocking.
- **AI/provider failure** → fail-open everywhere; English authoring and reads never blocked.
- **Regression on English-only items** → per-field fallback verified by a no-translations regression test.

## Dependencies

Configured `LLM_PROVIDER`; existing `wxkanbanhelp`, `/api/help`, `/api/sysadmin`, and `SysAdmin/Docs.tsx`. No new external service.
