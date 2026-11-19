# Plan: Landing-Page Docs

**Spec Number**: 044
**Date**: 2026-06-05

## Implementation Plan

### Phase 1: Data & API
- Extend `wxkanbanhelp` schema with `summary`, `videourl`, `posterurl`, `sortorder` (additive migration `0027_*`)
- Add public read endpoints `GET /api/help/docs` and `GET /api/help/docs/:slug` to `help.ts` (published `category='docs'` only)
- Extend the existing admin help CRUD endpoints to accept the new fields and a docs filter (SysAdmin-only)

### Phase 2: Public UI
- Build `DocsIndexPage.tsx` (`/docs`) — ordered list with poster thumbnail + title + summary
- Build `DocsDetailPage.tsx` (`/docs/:slug`) — summary → markdown text → `DocsVideoPlayer`
- Build `DocsVideoPlayer.tsx` — responsive HTML5 `<video>` with `poster`, graceful no-video/no-poster fallback
- Wire both as public routes in `App.tsx`; reuse the existing markdown renderer

### Phase 3: Admin UI + menu + tests
- Build the SysAdmin Docs management screen at `/sysadmin/docs` (list + create/edit form, reorder, publish/draft, delete)
- Rewire the landing-page "Docs" link (desktop + mobile) in `LandingPage.tsx` to `/docs`; remove the `docs.wxkanban.io` reference
- Unit / integration / E2E tests per `tests.md`; verify draft-hiding guardrail

## Known Issues

- **S3 dependency**: the `wxkanban` bucket objects (videos + posters) must be public-read with CORS permitting inline `<video>` playback. Owned internally; must be confirmed before US1 passes end-to-end.

## Dependencies

- Extends Scope 016 (`wxkanbanhelp` table, `help.ts` route, existing admin help endpoints). Migration must remain non-breaking to 016 records and the authenticated help panel.
