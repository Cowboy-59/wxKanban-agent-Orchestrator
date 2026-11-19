# Specification: Banner Studio — Export, Embed & UI

**Spec**: 069
**Feature**: Banner Studio — Export, Embed & UI
**Status**: planned
**Phase**: design → implementation
**Created**: 2026-06-24
**Scope**: [`specs/Project-Scope/070-banner-studio.md`](../Project-Scope/070-banner-studio.md)
**Depends on**: **SPEC-067** (`marketingBanners.ts`, banner rows, `renderedurl`), **SPEC-068** (`marketinglinks.code` → `/r/:code`, `clickcount`); reuse `src/client/pages/SysAdmin/marketing/Assets.tsx` (editor/preview pattern), `MarketingTabs.tsx`, `src/client/App.tsx`; public `src/server/routes/marketing.ts` (CORS-allowlisted marketing read).
**Part of**: SCOPE-070 fan-out — SPEC-067 (pipeline & data) → SPEC-068 (tracking & redirect) → **SPEC-069 (this — export, embed & UI)**

> **Numbering note:** **SPEC-069** (implementation spec) is distinct from **SCOPE-069** (the in-app System Health *scope* doc) — integer collision only.

---

## Summary

The human-facing surfaces that make Banner Studio usable: the **SysAdmin Banner Studio tab** (create/generate/render/publish a banner, preview it, read its click count), the **export panel** (PNG download + copy-paste `<a><img>` snippet wired to `/r/:code` + raw image URL), and the **public on-site read** endpoint that lets the marketing sites render published banners by segment/slot. It binds together the pipeline (SPEC-067) and the tracking (SPEC-068) into the workflow a marketer actually uses.

Reuse-heavy on the client: the tab mirrors `Assets.tsx` (dark Tailwind shell, two-column list/editor, `fetch(credentials:'include')`, 401→login/403→dashboard, save-then-act). The export bundle and public read are thin server additions on top of the SPEC-067/068 data.

The marketing static-site embed itself (editing `marketing/site` HTML + redeploy) is a small **site-side follow-up task**, separated because it touches the S3/CloudFront-deployed site, not the app.

## Requirements (from SCOPE-070)

- **FR-023** — For a rendered banner, SysAdmin can download the PNG.
- **FR-024** — SysAdmin can copy a ready-to-paste `<a><img>` snippet wiring the image to the tracked `/r/:code` link, with width/height/alt set.
- **FR-025** — SysAdmin can copy the raw rendered image URL (email / image-only platforms).
- **FR-026** — A public, CORS-allowlisted endpoint returns only *published* banners for a segment/slot, exposing image URL, redirect URL, dimensions, and slot — no admin fields or prompts.
- **FR-027** — The marketing sites can render a published banner as `<a href="/r/:code"><img></a>` from that endpoint.
- **FR-029** — The Banner Studio tab shows each banner's current click count.

(The editor/generate/render/publish actions are the SPEC-067 endpoints surfaced here; this spec adds no new generation/render logic.)

## Acceptance

SCOPE-070 Success Criteria #3 and #7, plus the usable workflow:

1. The Banner Studio tab lists banners (with click count), opens an editor, and drives create → generate → render → publish against the SPEC-067 endpoints, with the preview = the latest server render. *(workflow, FR-029)*
2. Export yields a working PNG download, an `<a><img>` snippet that loads the image from CloudFront and links to `/r/:code`, and a raw image URL. *(FR-023, FR-024, FR-025)*
3. The public endpoint returns only published banners by segment/slot (no admin fields/prompts); a site-side `<a><img>` embed renders the banner and its click is redirected + counted. *(FR-026, FR-027)*

## Out of Scope (other specs)

- Tables, banner CRUD, generate/render, S3 helper → **SPEC-067**.
- `/r/:code` redirect, click counting, links CRUD, Overview rollup → **SPEC-068**.
- Transitions / animated GIF / on-site crossfade → **Phase 2**.
- Analytics charts / per-click dashboards — the tab shows a **count** only.

## Notes

- **FR-029 plumbing:** the click count comes from `marketinglinks.clickcount` (SPEC-068). The `GET /banners` list payload joins the linked `clickcount` so the tab can display it without a second call (extend the SPEC-067 list select if not already joined).
- **Preview:** Phase 1 preview = the last server render (`renderedurl` in an `<img>` sized to the preset). No separate client-side mock render.
- **Marketing-site embed (T006)** is a separate, site-side change (edit `marketing/site/index.html` to fetch `GET /api/marketing/banners` and render the `<a><img>`, then redeploy via the site's `redeploy.ps1`) — kept out of the app build so it can ship independently.
