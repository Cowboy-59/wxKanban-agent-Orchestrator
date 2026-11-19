# Scope 044: Landing-Page Docs (public documentation + how-to videos)

**Status:** Ready for Implementation
**Created:** 2026-06-05
**Short Name:** landing-docs
**Builds on:** Scope 016 (wxKanban Online Help System)

---

## Overview

A public **Docs** section on the wxKanban landing site, replacing the placeholder
external "Docs" link (`https://docs.wxkanban.io`) with a real, in-app,
logged-out-accessible documentation area:

- **`/docs`** — an index of 10–15 documentation topics, each showing its **title**
  and a **multi-line summary of the pertinent information its video covers**,
  ordered by a SysAdmin-defined sort order. An optional poster thumbnail shows
  next to each topic.
- **`/docs/:slug`** — a detail page showing the summary, the full documentation
  **text** (markdown), and the **how-to video embedded below** the text
  (AWS S3, public-read), with a poster image before playback.

Content is managed by wxperts **SysAdmin** through a CRUD screen at
`/sysadmin/docs`. The feature is built on Scope 016's existing `wxkanbanhelp`
records, **extended** with a multi-line `summary`, `videourl`, `posterurl`, and
`sortorder`, and surfaced through public, unauthenticated routes
(`category = 'docs'`, published only).

**Primary Actor:** A prospect / visitor (logged out) — and secondarily a brand-new
user — who wants to learn how wxKanban works from written docs + short how-to
videos before committing.

**Secondary Actor:** A wxperts SysAdmin who authors and maintains the doc records.

**Key Value:** Prospects self-educate directly from the public site (video
summary + documentation text + embedded video) with no sign-in, lowering the
barrier to adoption — and wxperts controls the content instead of pointing at a
dead external link.

### Scope Boundary

**In scope**
- Public `/docs` index and `/docs/:slug` detail pages (no auth)
- Embedded S3 video playback (public-read objects) with poster image
- SysAdmin CRUD to manage doc records (text, summary, video URL, poster URL, order, publish)
- New `wxkanbanhelp` fields: `summary`, `videourl`, `posterurl`, `sortorder`, plus a public-docs marker (`category = 'docs'`)
- Rewiring the landing-page "Docs" menu (desktop + mobile) to the internal page

**Out of scope**
- The authenticated in-app contextual help panel (Scope 016 — untouched)
- Producing / uploading the videos and posters — created and uploaded to S3 out of band; this scope only stores and plays a URL
- Search within docs, helpful/not-helpful ratings, view analytics, multi-language, CLI-command docs

---

## User Scenarios

### US1 — Visitor browses docs and watches a how-to (happy path)

A logged-out visitor on the landing page clicks **Docs** in the nav. They land on
`/docs` and see 10–15 topics, each with a poster thumbnail, a title, and a
multi-line summary of what its video covers. They pick one, which opens
`/docs/:slug`: the summary, the full documentation text, and the how-to video
embedded below. They play the video inline and never sign in.

**Expected:** Index loads publicly (no auth), topics appear in SysAdmin-defined
order, the detail page renders text and plays the S3 video inline.

### US2 — SysAdmin publishes a new doc (authoring path)

A wxperts SysAdmin opens the Docs management screen (`/sysadmin/docs`), clicks
**New**, and enters a title, the multi-line video summary, the full documentation
text, the S3 video URL, the poster URL, and a sort position. They publish. The
new topic immediately appears on the public `/docs` index in the chosen position,
and its detail page plays the video.

**Expected:** Create/edit/publish persists; published docs appear publicly in
order; unpublished/draft docs do **not** appear on `/docs`.

### US3 — Doc with no video, and an unpublished draft (edge cases)

(a) A SysAdmin saves a doc that has text but **no video URL** (video optional).
Its detail page shows the summary and text with **no video player and no broken
embed**. (b) A SysAdmin leaves a doc in **draft**; a visitor browsing `/docs`
never sees it, and hitting its `:slug` URL directly returns not-found rather than
draft content.

**Expected:** Missing video degrades gracefully; draft/unpublished content is
never publicly reachable, by list or by direct URL.

---

## Functional Requirements

### FR-001 — Public Docs index (`/docs`)
A logged-out visitor can open `/docs` and see all published doc records.
- [ ] Route is public (no auth, no redirect to login)
- [ ] Each item shows title + the multi-line video summary
- [ ] When a record has a `posterurl`, the index shows it as a thumbnail next to the title + summary; if absent, the row renders cleanly without it
- [ ] Items render in ascending `sortorder`
- [ ] Only published `category = 'docs'` records appear
- [ ] Each item links to its `/docs/:slug` detail page

### FR-002 — Public Docs detail (`/docs/:slug`)
A visitor can open a single doc by slug.
- [ ] Route is public; renders summary, then full documentation text (markdown), then the video
- [ ] Unknown or unpublished slug returns not-found (no draft content leaks)
- [ ] `slug` is unique and URL-safe

### FR-003 — Embedded S3 video + poster (optional)
The detail page embeds the how-to video from its S3 URL, below the text.
- [ ] When `videourl` is set, an inline HTML5 player loads the S3 (public-read) object and plays without leaving the page
- [ ] When `posterurl` is set, the player shows it before playback (HTML5 `poster`); when empty, the player falls back to its default placeholder — no broken image
- [ ] When `videourl` is empty, no player and no broken embed render — text-only displays cleanly
- [ ] Player is responsive (usable on mobile widths)

### FR-004 — Data model extension (`wxkanbanhelp`)
Extend the existing help table to support public docs.
- [ ] Add `summary` (multi-line text — the video overview)
- [ ] Add `videourl` (nullable)
- [ ] Add `posterurl` (nullable)
- [ ] Add `sortorder` (integer, default 0)
- [ ] A record is identifiable as a public landing-docs entry (`category = 'docs'`); index/detail queries filter on it
- [ ] Migration is additive and non-breaking to existing Scope 016 help records

### FR-005 — SysAdmin Docs management (CRUD)
A wxperts SysAdmin can create, edit, reorder, publish, and delete doc records.
- [ ] Form captures title, summary, full text, `videourl`, `posterurl`, `sortorder`, publish state
- [ ] Create/edit persists and is reflected on `/docs` immediately on publish
- [ ] Reordering changes the public index order
- [ ] Delete removes (or archives) the record so it no longer appears publicly
- [ ] Management screen at `/sysadmin/docs` is restricted to SysAdmin only

### FR-006 — Publish/draft visibility
Only published docs are publicly reachable; drafts are hidden everywhere public.
- [ ] Draft records never appear on `/docs`
- [ ] Draft `:slug` accessed directly returns not-found (does not render)
- [ ] Toggling publish ↔ draft flips public visibility accordingly

### FR-007 — Landing "Docs" menu rewiring
The landing-page nav points to the internal Docs page.
- [ ] Desktop nav "Docs" (currently `https://docs.wxkanban.io`) routes to `/docs`
- [ ] Mobile menu "Docs" routes to `/docs` and closes the menu
- [ ] No remaining references to the external `docs.wxkanban.io` placeholder

### FR-008 — Public docs API (extend `help.ts`)
Public endpoints serve the index and detail data.
- [ ] `GET /api/help/docs` returns the ordered list of published docs (id, slug, title, summary, posterurl, sortorder)
- [ ] `GET /api/help/docs/:slug` returns a single published doc by slug (summary, content, videourl, posterurl)
- [ ] Both exclude draft/non-docs records; no auth required
- [ ] SysAdmin CRUD reuses/extends the existing admin help endpoints with the new fields and a docs filter (SysAdmin-only)

---

## Technical Sections

### Data / Schema
Extend `src/db/schema/wxkanbanhelp.ts` with four columns: `summary` (text),
`videourl` (varchar), `posterurl` (varchar), `sortorder` (integer, default 0).
Public-docs records identified via `category = 'docs'`. One additive migration
(`src/db/migrations/0027_*`), non-breaking to existing Scope 016 records.
UUID v7 primary keys and lowercase / no-underscore naming already hold.

### API Routes (extend `src/server/routes/help.ts`)
- `GET /api/help/docs` — ordered list of published `category='docs'` records. Public.
- `GET /api/help/docs/:slug` — single published doc by slug; 404 on draft/unknown. Public.
- SysAdmin CRUD extends the existing admin help endpoints (`POST` / `PUT` / `DELETE`)
  with the new fields and a docs filter — SysAdmin-only.

### Frontend Components
- `DocsIndexPage.tsx` (route `/docs`) — public; lists topics (poster thumbnail + title + summary).
- `DocsDetailPage.tsx` (route `/docs/:slug`) — public; summary → markdown text → `DocsVideoPlayer`.
- `DocsVideoPlayer.tsx` — responsive HTML5 `<video>` with `poster`; graceful no-video / no-poster fallback. No third-party player library.
- SysAdmin **Docs management** screen at `/sysadmin/docs` — list + create/edit form with the new fields, reorder, publish/draft, delete.
- Wire the two public routes into `App.tsx` as public routes; update the landing nav (desktop + mobile) "Docs" link to `/docs`.
- Markdown rendering reuses the app's existing markdown renderer (same as notes/help).

### wxAI Commands
None. This is product content + UI; records are authored by SysAdmin, not generated.

---

## Success Criteria

1. A logged-out visitor can reach `/docs` from the landing-page "Docs" menu and load the index of all published docs in **under 2 seconds** (10–15 records), with no auth prompt.
2. Each published doc's detail page renders summary + text and plays its embedded S3 video **inline on first click**, with the poster shown before playback; a doc with no video shows text only with no broken embed.
3. **100%** of draft/unpublished docs are unreachable publicly — absent from the index **and** returning not-found on direct `:slug` access (verified by test).
4. A SysAdmin can create a new doc (title, summary, text, video URL, poster URL, order) and see it live on the public `/docs` index in the chosen position **without a deploy** — content is data, not code.
5. Reordering in the SysAdmin manager changes the public index order on next load, and publish ↔ draft reliably flips public visibility.
6. Zero remaining references to the external `docs.wxkanban.io` placeholder; the landing "Docs" link (desktop + mobile) resolves to the internal page.

---

## Constraints & Notes

- **Video/poster assets are out of band.** Videos and poster images are produced and uploaded to AWS S3 separately; this scope stores and renders a **URL only** — no upload UI, transcoding, or S3 management.
- **Specific bucket:** video and poster URLs come from the **`wxkanban`** bucket on AWS S3.
- **S3 objects must be public-read.** The docs page is unauthenticated, so video and poster URLs must be publicly accessible (direct public-read or via CloudFront). No signed/expiring URLs. If a bucket policy / CORS change is needed for inline `<video>` playback, that is a deployment task (owned internally — no external dependency).
- **Built on Scope 016, not a second system.** Reuses the `wxkanbanhelp` table and `help.ts` route; the migration is additive and must not break existing Scope 016 help records or the authenticated in-app help panel.
- **Public content = SysAdmin-owned.** Only wxperts SysAdmin manages docs; these records are global product documentation, not per-Company content, and carry no tenant scoping.
- **Markdown rendering** for the documentation text reuses the app's existing markdown renderer — no new rendering stack.
- **No search / ratings / analytics** on the public docs page in this scope (deliberately deferred; Scope 016 already has them for the authenticated system if ever wanted here).
- **Naming follows conventions:** new columns `summary`, `videourl`, `posterurl`, `sortorder` — lowercase, no underscores.

---

## Next Steps

1. Review this scope document.
2. Run `/scope-validate 044` to check quality.
3. When ready, break down into detailed specs via the pipeline.
