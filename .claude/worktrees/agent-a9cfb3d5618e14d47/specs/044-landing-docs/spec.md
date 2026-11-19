# Spec 044: Landing-Page Docs

## Overview

A public **Docs** section on the wxKanban landing site, replacing the placeholder
external "Docs" link (`https://docs.wxkanban.io`) with a real, in-app,
logged-out-accessible documentation area. `/docs` lists 10–15 documentation
topics, each with a title and a multi-line summary of the pertinent information
its how-to video covers (plus an optional poster thumbnail). `/docs/:slug` shows
the summary, the full documentation text (markdown), and the how-to video
embedded below the text (AWS S3, public-read) with a poster image before
playback. Content is managed by wxperts SysAdmin via a CRUD screen at
`/sysadmin/docs`. The feature is built on Scope 016's existing `wxkanbanhelp`
records, extended with `summary`, `videourl`, `posterurl`, and `sortorder`, and
surfaced through public, unauthenticated routes (`category = 'docs'`, published
only).

Parent scope: `specs/Project-Scope/044-landing-docs.md`.

## Business Problem

The landing-page "Docs" menu currently points at a dead external placeholder
(`https://docs.wxkanban.io`), so prospects who want to understand how wxKanban
works before signing up hit nothing. wxperts has produced (and will keep
producing) short how-to videos, but there is no public surface to present them
with explanatory text. Prospects bounce instead of self-educating, and wxperts
cannot update public documentation without an external site. This scope gives
wxperts a controllable, in-app public docs surface so prospects can learn from
written docs plus embedded videos with no sign-in.

## Actors

- Primary: A logged-out prospect/visitor (secondarily a brand-new user) who opens the public Docs section to learn how wxKanban works from written documentation and embedded how-to videos before committing.
- Secondary: A wxperts SysAdmin who authors, orders, publishes, and maintains the doc records through the SysAdmin Docs management screen.

## Success Metrics

1. The `/docs` index loads all published docs (10–15 records) in under 2 seconds for a logged-out visitor, with no auth prompt.
2. 100% of draft/unpublished docs are unreachable publicly — absent from the index and returning not-found on direct `:slug` access (verified by automated test).
3. A SysAdmin can publish a new doc and see it live on the public index in the chosen position in under 1 minute, with zero code deploys (content is data).

## Scope Boundary

This scope changes: `src/db/schema/wxkanbanhelp.ts` (4 new columns) and one
additive migration; `src/server/routes/help.ts` (2 public docs endpoints + admin
CRUD extension with the new fields and a docs filter); new public client pages
`DocsIndexPage.tsx`, `DocsDetailPage.tsx`, and `DocsVideoPlayer.tsx`; a SysAdmin
Docs management screen at `/sysadmin/docs`; route wiring in `App.tsx`; and the
landing-page nav (desktop + mobile) "Docs" link in `LandingPage.tsx`.

## Out of Scope

The authenticated in-app contextual help panel (Scope 016 — untouched); video
and poster production/upload (created and uploaded to the `wxkanban` S3 bucket
out of band; this scope stores and renders a URL only); search within docs,
helpful/not-helpful ratings, view analytics, multi-language, and CLI-command
documentation.

## Open Questions

None at this time. The S3 public-read + CORS configuration for the `wxkanban`
bucket is owned internally and tracked as a deployment dependency, not an open
design question.

## Functional Requirements

### FR-001 — Public Docs index (`/docs`)

A logged-out visitor can open `/docs` and see all published `category = 'docs'`
records, ordered by `sortorder`, each showing its title, multi-line video
summary, and (when present) poster thumbnail, linking to its detail page.

**Acceptance Criteria**:
- [ ] Route is public (no auth, no redirect to login)
- [ ] Each item shows title + multi-line summary; poster thumbnail shown when `posterurl` is set, omitted cleanly when absent
- [ ] Items render in ascending `sortorder`; only published docs records appear
- [ ] Each item links to `/docs/:slug`

### FR-002 — Public Docs detail (`/docs/:slug`)

A visitor can open a single doc by slug; it renders summary, full markdown text,
then the video. Unknown or unpublished slugs return not-found.

**Acceptance Criteria**:
- [ ] Public route renders summary → markdown text → video
- [ ] Unknown or unpublished slug returns not-found (no draft content leaks)
- [ ] `slug` is unique and URL-safe

### FR-003 — Embedded S3 video + poster (optional)

The detail page embeds the how-to video from its S3 URL below the text, with a
poster before playback; both video and poster are optional and degrade
gracefully.

**Acceptance Criteria**:
- [ ] When `videourl` is set, an inline HTML5 player loads the S3 (public-read) object and plays in place
- [ ] When `posterurl` is set, it shows before playback (`poster`); when empty, the player default placeholder shows — no broken image
- [ ] When `videourl` is empty, no player renders and text shows cleanly
- [ ] Player is responsive on mobile widths

### FR-004 — Data model extension (`wxkanbanhelp`)

Extend the existing help table additively with the docs fields.

**Acceptance Criteria**:
- [ ] Add `summary` (text), `videourl` (varchar, nullable), `posterurl` (varchar, nullable), `sortorder` (integer, default 0)
- [ ] Public docs records identified via `category = 'docs'`; index/detail queries filter on it
- [ ] Migration is additive and non-breaking to existing Scope 016 records

### FR-005 — SysAdmin Docs management (CRUD)

A wxperts SysAdmin can create, edit, reorder, publish, and delete doc records at
`/sysadmin/docs`.

**Acceptance Criteria**:
- [ ] Form captures title, summary, full text, `videourl`, `posterurl`, `sortorder`, publish state
- [ ] Create/edit persists and reflects on `/docs` immediately on publish
- [ ] Reordering changes the public index order; delete removes/archives so it no longer appears publicly
- [ ] Screen is restricted to SysAdmin only

### FR-006 — Publish/draft visibility

Only published docs are publicly reachable; drafts are hidden everywhere public.

**Acceptance Criteria**:
- [ ] Draft records never appear on `/docs`
- [ ] Draft `:slug` accessed directly returns not-found
- [ ] Toggling publish ↔ draft flips public visibility accordingly

### FR-007 — Landing "Docs" menu rewiring

The landing-page nav (desktop + mobile) points to the internal `/docs` page.

**Acceptance Criteria**:
- [ ] Desktop nav "Docs" routes to `/docs`
- [ ] Mobile menu "Docs" routes to `/docs` and closes the menu
- [ ] No remaining references to `docs.wxkanban.io`

### FR-008 — Public docs API (extend `help.ts`)

Public endpoints serve the index and detail data; SysAdmin CRUD extends the
existing admin help endpoints.

**Acceptance Criteria**:
- [ ] `GET /api/help/docs` returns ordered published docs (id, slug, title, summary, posterurl, sortorder), no auth
- [ ] `GET /api/help/docs/:slug` returns a single published doc (summary, content, videourl, posterurl); 404 on draft/unknown
- [ ] Admin CRUD endpoints handle the new fields and a docs filter, SysAdmin-only

## Phase

**Current Phase**: design
**Priority**: medium

## Status

- **Date**: 2026-06-05
- **Phase**: design
