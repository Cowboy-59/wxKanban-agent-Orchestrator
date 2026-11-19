# Task Breakdown: Banner Studio — Export, Embed & UI

**Feature**: Banner Studio — Export, Embed & UI
**Spec**: 069
**Date Generated**: 2026-06-24
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Band | Priority | Status |
|---|------|------|----------|--------|
| 1 | T001 `GET /banners/:id/export` in `marketingBanners.ts` — bundle (pngUrl, imgUrl, redirectUrl, `<a><img>` snippet, w/h) | Backend | high | open |
| 2 | T002 Public `GET /api/marketing/banners?segment=&slot=` in `marketing.ts` — published only, whitelisted fields, CORS-allowlisted | Backend | high | open |
| 3 | T003 `BannerStudio.tsx` shell + `MarketingTabs` entry + `App.tsx` route + left list (thumbnail/status/click count) | Frontend | high | open |
| 4 | T004 Editor + actions (Save/Generate/Render/Publish/Delete) + preview = latest render | Frontend | high | open |
| 5 | T005 Export panel — Download PNG + copy `<a><img>` snippet + copy raw URL + show `/r/:code` | Frontend | high | open |
| 6 | T006 **[site-side, separate]** `marketing/site` embed — fetch public banners + inject `<a><img>`, redeploy | Site | medium | open |

> **Status (2026-06-24):** T001–T005 implemented in-conversation (export endpoint, public `/api/marketing/banners` read, `BannerStudio.tsx` tab + list + editor + generate/render actions + preview + export panel); client (vite) + server (esbuild) builds green. **T006 (marketing-site embed) deferred** — site-side change to `marketing/site` needing a CloudFront redeploy; not done autonomously. NOT committed/pushed.

> **Build order:** T001 + T002 (backend) → T003 (shell/list) → T004 (editor/actions) → T005 (export panel). T006 is site-side and independent (ships separately, doesn't gate the app build). Depends on SPEC-067 (banner endpoints) + SPEC-068 (`/r/:code`, `clickcount`).

> **Process:** authored in-conversation (orchestrator `createSpecs` path unavailable from this session). Implementation routes through `implement`; fences at implement time. Nothing pushed until the user says push.

---

## Task Details

### T001 — Export endpoint
Add `GET /banners/:id/export` to `src/server/routes/marketingBanners.ts` (SYSADMIN-gated). Returns `{ pngUrl: renderedurl, imgUrl: renderedurl, redirectUrl: `${REDIRECT_BASE_URL}/r/${link.code}`, anchorImgSnippet, width, height }`. `anchorImgSnippet` = `<a href="<redirectUrl>"><img src="<pngUrl>" width=W height=H alt="<title>" style="border:0"/></a>` with the frozen banner dims. Handled error if `renderedurl` is null (not yet rendered). *(FR-023, FR-024, FR-025)*

### T002 — Public on-site read
Add `GET /api/marketing/banners?segment=&slot=` to `src/server/routes/marketing.ts` (public, CORS-allowlisted, rate-limited). Return only `status='published'` banners, each `{ id, renderedurl, redirectUrl, width, height, slot }` — explicitly whitelisted fields, **no** prompt/brandtokens/admin data. Filter by `segment`/`slot` when present. *(FR-026, FR-027)*

### T003 — Tab shell + list
New `src/client/pages/SysAdmin/marketing/BannerStudio.tsx`; add `{ label: 'Banners', path: '/sysadmin/marketing/banners' }` to `MarketingTabs.tsx` and a route in `src/client/App.tsx`. Mirror `Assets.tsx`: dark shell, `MarketingHeader`, two-column grid, `fetch(credentials:'include')`, 401→`/login` / 403→`/dashboard`. Left list: card per banner (thumbnail of `renderedurl` or placeholder, title, preset, status badge, **click count** from the joined `clickcount`), filters, "New banner". *(FR-029)*

### T004 — Editor + actions + preview
Right-panel editor: title, size-preset select, prompt textarea, headline/sub/CTA, destination URL, segment/slot, optional colour overrides. Actions (save-first pattern): **Save** (POST/PATCH `/banners`), **Generate background** (POST `/banners/:id/generate-bg`), **Render banner** (POST `/banners/:id/render`), **Publish** (PATCH status), **Delete**. Busy/status line; inline fail-open errors. Preview = latest server render (`renderedurl`) in an `<img>` sized to the preset; bg/placeholder before first render. *(workflow — surfaces SPEC-067 endpoints)*

### T005 — Export panel
When the banner is rendered, show an export panel fed by `GET /banners/:id/export`: a **Download PNG** link (`pngUrl`), a read-only box with the `anchorImgSnippet` + copy-to-clipboard, the raw `imgUrl` + copy, and the `redirectUrl`. *(FR-023, FR-024, FR-025)*

### T006 — Marketing-site embed **[site-side, separate]**
In `marketing/site/index.html` (and other landing pages as needed): a small script that fetches `GET /api/marketing/banners?segment=&slot=` and injects `<a href="/r/:code"><img src=renderedurl></a>` into a banner slot. Redeploy via the site's `redeploy.ps1`. Kept out of the app build so it ships independently. *(FR-027)*

---

## Notes

- **Verification:** in the SysAdmin tab, create → generate → render → publish a banner; preview shows the render; export panel's snippet, pasted into a scratch HTML file, loads the CloudFront image and links to `/r/:code` (which redirects + counts, per SPEC-068); the public endpoint returns the published banner with no admin fields; the list shows the click count.
- **Marketing-site embed (T006)** is the only site-side piece — separate from the app deploy.
- **Nothing pushed until the user says push.**
