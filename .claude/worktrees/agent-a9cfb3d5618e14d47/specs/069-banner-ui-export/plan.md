# Implementation Plan: Banner Studio — Export, Embed & UI

**Spec**: 069 — [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)
**Scope**: [`specs/Project-Scope/070-banner-studio.md`](../Project-Scope/070-banner-studio.md)
**Stack**: Express + React/Vite + Tailwind/shadcn (per `stack.md`); reuse the SysAdmin marketing UI patterns.

---

## Approach

This spec is mostly **wiring + UI** on top of SPEC-067/068. Two thin server additions (the export bundle and the public read), then the Banner Studio tab that mirrors `Assets.tsx` as closely as possible so it inherits the existing auth/fetch/layout conventions. Build: **export endpoint → public read → tab shell/list → editor/actions → export panel → (separate) site embed**.

## Export endpoint — extend `src/server/routes/marketingBanners.ts`

`GET /banners/:id/export` (SYSADMIN-gated, same router as SPEC-067). Returns a bundle derived server-side from the banner + its link:
- `pngUrl` — `renderedurl` (the CloudFront PNG).
- `imgUrl` — same bare URL (for email / image-only platforms).
- `redirectUrl` — `${REDIRECT_BASE_URL}/r/${link.code}`.
- `anchorImgSnippet` — `"<a href=\"<redirectUrl>\"><img src=\"<pngUrl>\" width=W height=H alt=\"<title>\" style=\"border:0\"/></a>"` (W/H from the frozen banner dims).
- `width`, `height`.
A 404/handled error if the banner isn't rendered yet (`renderedurl` null).

## Public read — extend `src/server/routes/marketing.ts`

`GET /api/marketing/banners?segment=&slot=` on the existing **public, CORS-allowlisted, rate-limited** marketing router. Returns only `status='published'` banners, each as `{ id, renderedurl, redirectUrl(/r/:code), width, height, slot }` — **no** prompt, brandtokens, status, or other admin fields. Filtered by `segment`/`slot` when provided. This is what the marketing static site consumes.

## Banner Studio tab — `src/client/pages/SysAdmin/marketing/BannerStudio.tsx` (new)

Register `{ label: 'Banners', path: '/sysadmin/marketing/banners' }` in `MarketingTabs.tsx` and a route in `src/client/App.tsx`. Mirror `Assets.tsx`: dark Tailwind shell, `MarketingHeader`, two-column grid, `fetch(..., {credentials:'include'})` with 401→`/login` / 403→`/dashboard`, the "save first, then act" pattern.

- **Left — list:** one card per banner: thumbnail of `renderedurl` (or a "not rendered" placeholder), title, size preset, status badge, and **click count** (from the joined `clickcount`). Filters (status/campaign/segment/preset). "New banner" starts a draft.
- **Right — editor:** title, size-preset `<select>` (the six presets), prompt `<textarea>`, headline/sub/CTA, destination URL, segment + slot, optional brand-colour overrides. Actions: **Save** (POST/PATCH `/banners`), **Generate background** (POST `/banners/:id/generate-bg`, busy state, shows bg in preview), **Render banner** (POST `/banners/:id/render`, preview swaps to the composited PNG), **Publish** (PATCH status), **Delete**. Busy/status line mirrors Assets' upload-status pattern; errors surface inline (fail-open).
- **Preview:** the latest server render (`renderedurl`) in an `<img>` sized to the preset; background or placeholder before first render.
- **Export panel** (when rendered): **Download PNG** (the `pngUrl`), a read-only box with the `anchorImgSnippet` + copy button, the raw `imgUrl` + copy button, and the `redirectUrl` — all from `GET /banners/:id/export`.

## Marketing-site embed — `marketing/site` (separate, site-side)

A small change to `marketing/site/index.html` (and any other landing page): a script that fetches `GET /api/marketing/banners?segment=&slot=` and injects the `<a href="/r/:code"><img src=renderedurl></a>` into a banner slot, then redeploy via the site's `redeploy.ps1`. Kept separate from the app build so it ships independently and doesn't gate the app work.

## Conventions

Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`/`@ts-ignore`); Pino-only; fences written by the orchestrator at `implement`; nothing pushed until the user says push.

## Risks

- **Snippet correctness** — the `anchorImgSnippet` must use absolute URLs (CloudFront image + `REDIRECT_BASE_URL/r/...`) so it works when pasted into a third-party page/email; build and test by pasting into a scratch HTML file.
- **Public-read leakage** — the read endpoint must whitelist output fields explicitly (no prompt/admin data); test that drafts/archived never appear.
- **List N+1 / join** — fetch `clickcount` via the banner-list join (SPEC-067/068), not a per-row call.
