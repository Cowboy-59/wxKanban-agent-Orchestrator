# Task Breakdown: Landing-Page Docs

**Feature**: Landing-Page Docs
**Spec**: 044
**Date Generated**: 2026-06-05
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Extend wxkanbanhelp schema + migration | high | todo |
| 2 | Public docs API endpoints | high | todo |
| 3 | SysAdmin docs CRUD API | medium | todo |
| 4 | DocsIndexPage (public /docs) | high | todo |
| 5 | DocsDetailPage + DocsVideoPlayer | high | todo |
| 6 | SysAdmin Docs management screen | medium | todo |
| 7 | Rewire landing Docs menu + route wiring | medium | todo |

## Task Details

### T001 — Extend wxkanbanhelp schema + migration

Add four columns to `src/db/schema/wxkanbanhelp.ts`: `summary` (text, the
multi-line video overview), `videourl` (varchar, nullable), `posterurl`
(varchar, nullable), `sortorder` (integer, default 0). Generate an additive
migration (`src/db/migrations/0027_*`) that does not alter or drop existing
columns, so Scope 016 help records and the authenticated help panel keep
working. Public docs records are distinguished by `category = 'docs'`. Implements
FR-004.

### T002 — Public docs API endpoints

Add two public (no-auth) endpoints to `src/server/routes/help.ts`:
`GET /api/help/docs` returns published `category='docs'` records ordered by
`sortorder` (id, slug, title, summary, posterurl, sortorder);
`GET /api/help/docs/:slug` returns a single published doc (summary, content,
videourl, posterurl) and 404s on draft/unknown slugs. Both must exclude draft and
non-docs records. Implements FR-001, FR-002, FR-006, FR-008.

### T003 — SysAdmin docs CRUD API

Extend the existing admin help endpoints in `help.ts` (create/update/delete) to
accept and persist the new fields (`summary`, `videourl`, `posterurl`,
`sortorder`) and to filter/list `category='docs'` records. Restrict to SysAdmin.
Support publish/draft toggling and reordering. Implements FR-005, FR-006, FR-008.

### T004 — DocsIndexPage (public /docs)

Build `DocsIndexPage.tsx` rendered at the public route `/docs`. Fetch from
`GET /api/help/docs` and render an ordered list of topics: poster thumbnail (when
present), title, and multi-line summary, each linking to `/docs/:slug`. No auth,
responsive. Implements FR-001.

### T005 — DocsDetailPage + DocsVideoPlayer

Build `DocsDetailPage.tsx` at `/docs/:slug` (public) that fetches
`GET /api/help/docs/:slug` and renders summary → full markdown text (reuse the
app's existing markdown renderer) → `DocsVideoPlayer`. Build `DocsVideoPlayer.tsx`
as a responsive HTML5 `<video>` using `videourl` and `poster=posterurl`, with
graceful fallbacks when either is absent (no broken embed/image). Unknown/unpublished
slug shows not-found. Implements FR-002, FR-003.

### T006 — SysAdmin Docs management screen

Build the SysAdmin Docs management screen at `/sysadmin/docs` (SysAdmin-only,
consistent with existing SysAdmin Companies/Users screens): a list with reorder
and publish/draft controls, plus a create/edit form capturing title, summary,
full text, `videourl`, `posterurl`, `sortorder`, and publish state. Wire to the
T003 CRUD endpoints. Implements FR-005.

### T007 — Rewire landing Docs menu + route wiring

In `LandingPage.tsx`, change the desktop nav and mobile-menu "Docs" links from
`https://docs.wxkanban.io` to the internal `/docs` route (mobile also closes the
menu); remove all `docs.wxkanban.io` references. Register `/docs` and
`/docs/:slug` as public routes in `App.tsx`. Implements FR-007.
