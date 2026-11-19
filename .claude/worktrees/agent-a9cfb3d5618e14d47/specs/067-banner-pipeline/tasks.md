# Task Breakdown: Banner Studio — Pipeline & Data Foundation

**Feature**: Banner Studio — Pipeline & Data Foundation
**Spec**: 067
**Date Generated**: 2026-06-24
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Band | Priority | Status |
|---|------|------|----------|--------|
| 1 | T001 Three Drizzle tables (`marketinglinks`, `marketingbanners`, `marketinglinkclicks`) + `index.ts` exports + migration (direct-pg apply) | Data | high | open |
| 2 | T002 `image-provider.ts` — Gemini Imagen `generateImage()`, `IMAGE_PROVIDER` switch, brand-prompt suffix, fail-open, throttled | Backend | high | open |
| 3 | T003 `banner-brand.ts` tokens + `BANNER_PRESETS` map + `BannerRenderService.ts` (Puppeteer screenshot, `buildBannerHtml`, archetypes) | Backend | high | open |
| 4 | T004 `putBannerObject()` in `marketing-assets-s3.ts` (direct server-side PutObject + versioned `render-<v>` keys) | Backend | high | open |
| 5 | T005 `marketingBanners.ts` admin router — CRUD + `generate-bg` + `render`; create/link a `marketinglinks` row; mount in `app.ts`; shared destination host-allowlist helper | Backend | high | open |
| 6 | T006 Env/docs — `.env.example` adds `IMAGE_PROVIDER`/`IMAGE_MODEL` (+ note `GEMINI_API_KEY` reuse) | — | low | open |

> **Status (2026-06-24):** T001–T006 implemented in-conversation; esbuild server build green. **Migration 0042 applied to the prod DB** (local .env DB == app prod) via direct-pg — 3 tables verified live (banners 23 cols / links 14 / clicks 7 + all indexes). NOT committed/pushed.

> **Build order:** T001 (schema) → T002 (provider) + T003 (render) + T004 (storage) can proceed in parallel once T001 lands → T005 (routes) needs T002/T003/T004 → T006 anytime. No UI in this spec.

> **Process:** authored in-conversation (orchestrator `createSpecs` path unavailable from this session). Implementation routes through `implement` per orchestrator-first; fences written at implement time. Nothing pushed until the user says push.

---

## Task Details

### T001 — Three tables + migration
Create `src/db/schema/marketinglinks.ts`, `src/db/schema/marketingbanners.ts`, `src/db/schema/marketinglinkclicks.ts` with the columns/indexes in the plan (uuidv7 PKs, `companyid` cascade FKs, lowercase no-underscore names). Export all three from `src/db/schema/index.ts`. `npm run db:generate`, then apply via the direct-pg pattern (`pg.Client` + transaction) against the `?sslmode=require` URL. `marketinglinkclicks` is created now but populated in SPEC-068. *(FR-001, FR-004, FR-005, FR-012, FR-014)*

### T002 — Image provider
New `src/server/ai/image-provider.ts` mirroring `src/server/ai/llm-provider.ts` but image-only: `getImageProvider()` (env `IMAGE_PROVIDER`, default `gemini-imagen`), `generateImage(prompt, {width,height}) → { bytes: Buffer } | null`, fail-open (never throws; provider error / content-filter refusal → `null`, Pino-logged). Gemini Imagen via the Google Generative Language endpoint (reuse `GEMINI_API_KEY`); base64 → `Buffer`. Append `BRAND_PROMPT_SUFFIX` to every prompt. Leave an `openai-gpt-image` stub branch (returns `null`, not built). Soft-throttle via the SCOPE-065 helper. *(FR-006, FR-007, FR-008)*

### T003 — Brand tokens + presets + render service
New `src/server/lib/banner-brand.ts` (brand token object: navy `#0f1722`, amber `#c8761b`, system font stack, logo CloudFront URL) and a `BANNER_PRESETS` map (`og|mrec|leaderboard|skyscraper|halfpage|mobile` → `{width,height,layout}`). New `src/server/services/BannerRenderService.ts` patterned on `MarkdownPdfRenderer.ts`: launch headless Chromium, `setViewport({...,deviceScaleFactor:2})`, `setContent(buildBannerHtml(opts),{waitUntil:'networkidle0'})`, await `document.fonts.ready` + logo `img.decode()`, `page.screenshot({type:'png',clip})`, `try/finally close()`. `buildBannerHtml` = AI bg as `background-image:cover` + overlay (headline/sub/logo/CTA) laid out by archetype, brand tokens merged with per-banner `brandtokens`. *(FR-010, FR-011, FR-013)*

### T004 — S3 put helper
Add `putBannerObject({ key, body, contentType })` to `src/server/lib/marketing-assets-s3.ts` — direct `PutObjectCommand` server-side; reuse `publicUrlForKey()` + existing bucket env + `public/` prefix. Keys `public/banners/<id>/bg.png` and `public/banners/<id>/render-<v>.png` (versioned `<v>` so each render gets a new URL — no stale cache). *(FR-012)*

### T005 — Admin banner router
New `src/server/routes/marketingBanners.ts`, mounted in `app.ts` at `/api/sysadmin/marketing/banners` **before** `marketingAdminRoutes`, `authenticateToken` + `requireSysAdmin`, Zod-validated. Endpoints: `GET /banners` (filters status/campaign/segment/preset), `POST /banners` (create draft; freeze width/height/layout from `BANNER_PRESETS`; create+link a `marketinglinks` row with a generated opaque `code`; validate destination host via a shared allowlist helper — also used by SPEC-068 links CRUD), `GET/PATCH/DELETE /banners/:id` (delete leaves the link intact), `POST /banners/:id/generate-bg` (throttled → `generateImage` → `putBannerObject` → `backgroundurl`; fail-open), `POST /banners/:id/render` (→ `BannerRenderService` → `putBannerObject` versioned → `renderedurl`). DB via `src/db/client.ts`. *(FR-001, FR-002, FR-003, FR-005, FR-006, FR-009, FR-010, FR-012, FR-014)*

### T006 — Env/docs
Add `IMAGE_PROVIDER=gemini-imagen` and `IMAGE_MODEL=imagen-3.0-generate-002` to `.env.example` with a note that `GEMINI_API_KEY` is reused (must be set in the App Runner console for prod). *(Open Items)*

---

## Notes

- **Verification (no UI):** exercise via direct API calls — `POST /banners` → row + linked `marketinglinks` with unique `code`; `POST /banners/:id/generate-bg` → `backgroundurl` set, image in S3/CloudFront; `POST /banners/:id/render` → on-brand legible PNG, `renderedurl` set; a second render → distinct URL; a forced generate failure → fail-open handled, nothing partial saved.
- **`marketinglinks`/`marketinglinkclicks`** are created here as the foundation SPEC-068 builds on; their redirect/click behaviour is **not** in this spec.
- **Nothing pushed until the user says push.**
