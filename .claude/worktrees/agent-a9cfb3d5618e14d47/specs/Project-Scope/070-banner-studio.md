# SCOPE-070: Banner Studio — AI-Composited, Click-Tracked Promotional Banners

**Scope Number**: SCOPE-070
**Status**: `draft`
**Created**: 2026-06-24
**Last Reviewed**: 2026-06-24 (interactive buildscope — section-by-section, approved through all eight sections) · 2026-06-25 (**Amendment B** — Banner Studio v2, approved via interactive buildscope; see Amendments)
**Depends On**: SPEC-046/048 (`marketingassets` + the S3/CloudFront presign lib `src/server/lib/marketing-assets-s3.ts`, public `marketing.ts` routes); SCOPE-064 (`SysAdminMarketingOverviewService`/`getMarketingOverview` — this scope replaces its deferred engagement placeholder; `MarketingTabs`; SES image-embed via `src/server/lib/ses.ts`; the newsletter-unsubscribe HMAC/signed-link precedent); SCOPE-065 (`MarketingAIService` throttle + fail-open pattern; `src/server/ai/llm-provider.ts` provider-abstraction template); Puppeteer reuse from `src/server/services/MarkdownPdfRenderer.ts`.
**Related Scopes**: SCOPE-064/065/066 built and AI-enabled the Marketing hub. This scope adds the first **image-generation** capability and the first **click-tracking** subsystem to the product — engagement/click tracking was explicitly *deferred* in SCOPE-064 and is realized here as first-class tracked links.
**Source**: `specs/Project-Scope/070-banner-studio.md`

---

## Overview

SCOPE-070 adds **Banner Studio** — a SysAdmin tool inside the existing Marketing dashboard that produces its own promotional banner graphics, makes them clickable, and counts the clicks.

A marketer can: (1) **generate** an on-brand background from a text prompt via an AI image model (Gemini Imagen); (2) **compose** a crisp brand overlay on top — headline, sub-line, logo, and a CTA button in our brand colours — and **render** it to a PNG at a chosen standard ad-size preset; (3) **link** the banner to a tracked short URL on our own domain so that clicking it *takes the viewer to us* and **every click is counted**; and (4) **use it two ways** — embedded on our marketing sites, and exported as a downloadable PNG plus a copy-paste `<a><img>` snippet and a raw image URL for email and Facebook.

The AI only ever paints the **background**; all text is a sharp HTML overlay, so banners stay legible and on-brand regardless of the image model. The whole pipeline runs server-side, reusing Puppeteer (the PDF renderer), the marketing S3/CloudFront store, and the SysAdmin marketing auth/tabs already in place.

This is **Phase 1 — static banners**. Image-to-image **transitions** (animated GIF export + on-site CSS crossfade) are designed into the schema but deferred to **Phase 2**.

## Business Problem

wxKanban has no way to produce its own promotional imagery. For the July-5 launch and the ongoing WinDev→AI-dev outreach, marketing needs clickable banner graphics — but today every banner is hand-built in an outside tool, hosted manually, and linked with a plain URL we cannot measure. There is also **no click tracking anywhere in the product** (it was explicitly deferred in SCOPE-064), so we cannot tell which creative actually drives sign-ups.

Banner Studio closes three gaps at once. First, **production speed** — branded creative in minutes, self-service, instead of a hand-built one-off. Second, **measurement** — a tracked redirect on our own domain counts every click and rolls up into the Marketing Overview, so we finally learn which banner works. Third, **on-brand consistency** — the brand layer (logo, colours, copy) is rendered by us as a sharp overlay, so output is legible and consistent even though the background is generative.

The machinery already exists: Puppeteer renders HTML→image (the PDF path), the `marketingassets` S3/CloudFront store holds binaries, the AI provider abstraction (SCOPE-065) is the template for an image provider, and the SysAdmin marketing dashboard/tabs host the UI. The gap is purely a banner pipeline, an image-generation provider, and the click-tracking subsystem.

### Core Design

| Element | Banner Studio |
| --- | --- |
| **Primary Actor** | A SYSADMIN / marketer creating banners — prompt, copy, generate, render, link, export, publish, and read click counts |
| **Secondary Actors** | A **Prospect/Viewer** who clicks a banner and is redirected to us (click counted, privacy-respecting); the **marketing sites** (system actor) that render published banners by segment/slot; the **image model** (Gemini Imagen — paints background only, never an autonomous publisher) |
| **Key Value** | A self-service, on-brand, **measurable** banner pipeline — ship promo creative in minutes and see which creative drives clicks, with a tracked link that works in a banner, a text link, or an email |
| **Storage** | Three new tables — `marketingbanners`, `marketinglinks` (first-class tracked link), `marketinglinkclicks` (events) — plus S3/CloudFront (`public/banners/…`) for the AI background and rendered PNG |
| **Boundary — IN** | AI background generation (Gemini Imagen, brand-steered, throttled, fail-open); brand-overlay render to PNG at six IAB presets; tracked `/r/:code` 302 redirect with UTM + click counting (open-redirect-proof, privacy-respecting); export (PNG download + `<a><img>` snippet + raw URL); public on-site embed by segment/slot; Overview links/clicks rollup; SysAdmin Banner Studio tab |
| **Boundary — OUT** | transitions / animated GIF / multi-frame (Phase 2); AI drawing in-image text; a brand-profile manager; multi-locale variants; non-SysAdmin access; scheduling / A-B rotation / targeting beyond a segment+slot tag; ad-network / auto-posting integrations; the OpenAI image provider (abstraction only); analytics charts / per-click dashboards; a free-form WYSIWYG drag editor |

---

## User Scenarios

### US1 — Create a banner draft

A SYSADMIN opens Marketing → **Banners**, starts a new draft, and fills in title, size preset, prompt, headline, sub-line, CTA text, and the destination URL.

**Expected:** a `marketingbanners` draft is created with width/height frozen from the preset, and a tracked `marketinglinks` row is created/linked for the destination.

### US2 — Generate a background with AI

The SYSADMIN clicks **Generate background**. The server wraps the prompt with the brand-style instruction and calls the image provider (Gemini Imagen), storing the result.

**Expected:** the background is stored and shown in the preview (`backgroundurl` set); the call is throttled and fail-open. Re-rolling regenerates without touching the overlay copy.

### US3 — Render the banner

The SYSADMIN clicks **Render banner**. The overlay (headline/sub/logo/CTA in brand colours) is composited over the background and screenshotted to a PNG at the preset size.

**Expected:** a versioned `renderedurl` is stored, the preview swaps to the composited PNG, and editing text + re-rendering does **not** trigger a new (paid) AI image.

### US4 — Export and paste into Facebook / email

The SYSADMIN opens the export panel and copies the `<a><img>` snippet (or the raw image URL) and pastes it into a Facebook group post or an email.

**Expected:** the image loads from CloudFront and the link points at `/r/:code`; the raw-URL option works where only an image src is accepted.

### US5 — Publish and embed on the marketing site

The SYSADMIN tags a target segment/slot and publishes. The marketing site fetches published banners for that segment/slot and renders them.

**Expected:** the public endpoint returns only published banners (image URL, redirect URL, dimensions, slot) with no admin fields; the site renders `<a href="/r/:code"><img></a>`.

### US6 — Prospect clicks the banner

A viewer clicks a banner; `/r/:code` 302-redirects them to the destination (e.g. `/registration?tier=CONSULTANT`) with UTM appended.

**Expected:** the viewer lands on us with existing query preserved; a `counted=true` click row is recorded and `clickcount` increments; the Overview rollup reflects it.

### US7 — A bot / link-unfurler hits the link

An email scanner, social unfurler, or `HEAD` prefetch hits `/r/:code`.

**Expected:** the hit is stored but classified `bot|preview` with `counted=false`; the human-click counter does not move.

### US8 — AI generation is unavailable or errors

The image key is missing, rate-limited, or the prompt trips a content filter.

**Expected:** fail-open — a handled "couldn't generate, try again" message, no partial/garbage stored, the tab stays fully usable, failure logged (Pino).

### US9 — Open-redirect attempt is blocked

Someone tampers with the redirect URL trying to send `/r/:code` to an arbitrary external host.

**Expected:** impossible — the URL carries only `:code`; the destination is read server-side from the stored link and never from the URL; admin writes are host-allowlisted.

---

## Functional Requirements

### FR-001 — Create a banner

A SYSADMIN MUST be able to create a banner draft with: title, size preset, prompt, headline, sub-line, CTA text, destination URL, and optional brand-colour overrides.

**Acceptance Criteria**:

- [ ] A draft `marketingbanners` row persists with all fields
- [ ] A tracked `marketinglinks` row is created/linked for the destination
- [ ] Width/height are frozen from the preset at create

### FR-002 — List & edit banners

A SYSADMIN MUST be able to list banners (filter by status, campaign, segment, size preset) and open one to edit any field.

**Acceptance Criteria**:

- [ ] List returns filtered banners ordered by most-recently-updated
- [ ] Editing persists; the editor reflects current values

### FR-003 — Delete / archive

A SYSADMIN MUST be able to delete or archive a banner.

**Acceptance Criteria**:

- [ ] Delete/archive removes it from active lists; a deleted banner leaves its tracked link intact (links are first-class)

### FR-004 — Frozen preset dimensions

Choosing a size preset MUST fix the banner's width/height at create from a preset map, so a later preset change cannot silently resize an existing export.

**Acceptance Criteria**:

- [ ] The six presets resolve to correct dimensions (`og` 1200×630, `mrec` 300×250, `leaderboard` 728×90, `skyscraper` 160×600, `halfpage` 300×600, `mobile` 320×50)
- [ ] Stored width/height match the rendered PNG and the export snippet

### FR-005 — Campaign / segment / slot tagging

A banner MAY be linked to a campaign and tagged with a target segment and a named on-site slot.

**Acceptance Criteria**:

- [ ] Campaign association and segment/slot tags persist and filter

### FR-006 — AI background generation

A SYSADMIN MUST be able to generate a background from the banner's prompt; the system calls the configured image provider (default Gemini Imagen) and stores the result.

**Acceptance Criteria**:

- [ ] Generation produces a stored image and sets `backgroundurl`
- [ ] Provider is selected via `IMAGE_PROVIDER` (default `gemini-imagen`), reusing `GEMINI_API_KEY`

### FR-007 — Brand-steered prompt

The generation prompt MUST be automatically wrapped with a fixed brand-style instruction (palette, "no text", reserve negative space for the overlay).

**Acceptance Criteria**:

- [ ] The wrapped prompt is sent; backgrounds skew on-brand and text-free

### FR-008 — Throttled, fail-open generation

Generation MUST be throttled (cost guard) and fail-open: a provider error or content-filter refusal returns a handled result, never a crash.

**Acceptance Criteria**:

- [ ] A forced failure/refusal returns a handled "couldn't generate" message, saves nothing partial, logs it (Pino); the tab stays usable
- [ ] Repeated rapid calls are soft-throttled

### FR-009 — Re-roll background

A SYSADMIN MUST be able to regenerate the background without altering the overlay copy.

**Acceptance Criteria**:

- [ ] Re-roll replaces `backgroundurl`; headline/sub/CTA are untouched

### FR-010 — Composite render

A SYSADMIN MUST be able to render the banner: the overlay (headline/sub/logo/CTA in brand colours) is composited over the current background into a PNG sized to the preset.

**Acceptance Criteria**:

- [ ] Render produces a PNG at exactly the preset dimensions
- [ ] Overlay text and logo are legible at the rendered size

### FR-011 — Generate and render are separate

Render MUST be a separate action from generation, so editing text and re-rendering never triggers a new (paid) AI image.

**Acceptance Criteria**:

- [ ] Render uses the existing `backgroundurl`; no provider call is made on render

### FR-012 — Versioned render storage

The rendered PNG MUST be stored and `renderedurl` updated using a new versioned storage key each render, so caches never serve a stale image.

**Acceptance Criteria**:

- [ ] Two renders of the same banner produce two distinct URLs; the latest is served immediately (no stale cache)

### FR-013 — Layout archetypes

Overlay layout MUST be chosen from fixed archetypes (hero / horizontal / vertical) matched to the preset's shape.

**Acceptance Criteria**:

- [ ] Each preset maps to an appropriate archetype; horizontal units (leaderboard/mobile) and vertical units (skyscraper/halfpage) lay out correctly

### FR-014 — Tracked link entity

Each banner MUST have a tracked link with a short, opaque, non-enumerable code and a stored destination URL.

**Acceptance Criteria**:

- [ ] `code` is unique and non-enumerable; the destination is stored server-side

### FR-015 — Redirect endpoint (open-redirect-proof)

A public endpoint `/r/:code` MUST 302-redirect to the link's destination, read server-side from the stored link and never from the URL.

**Acceptance Criteria**:

- [ ] A valid code 302s to its destination; an unknown code returns a clean 404
- [ ] No URL manipulation can redirect to an arbitrary host

### FR-016 — UTM append (non-destructive)

The redirect MUST append UTM params (source/medium/campaign) only when absent, preserving existing query such as `?tier=`.

**Acceptance Criteria**:

- [ ] `?tier=CONSULTANT` survives; UTM is added only if not already present

### FR-017 — Reusable link

The tracked link MUST be a first-class entity reusable outside a banner image — the same `/r/:code` works in a text link, email CTA, or social post.

**Acceptance Criteria**:

- [ ] A link can exist and be managed independently of any banner

### FR-018 — Destination host allowlist

On admin write, the destination host MUST be validated against an allowlist (defense-in-depth).

**Acceptance Criteria**:

- [ ] A non-allowlisted host is rejected at write time

### FR-019 — Click counting

Every `/r/:code` hit MUST be recorded; a denormalized counter on the link increments for genuine human clicks.

**Acceptance Criteria**:

- [ ] A human click creates a `counted=true` row and increments `clickcount`

### FR-020 — Privacy-respecting click data

Click events MUST store a salted/truncated IP hash, a coarse human/bot/preview class, and referrer — no personal data.

**Acceptance Criteria**:

- [ ] No raw IP or PII is stored; the hash is salted and truncated

### FR-021 — Bot / preview exclusion

Bot/preview/prefetch hits (scanners, unfurlers, `HEAD`) MUST be stored but flagged not-counted.

**Acceptance Criteria**:

- [ ] A bot/`HEAD` hit is stored `counted=false` and does not move the counter

### FR-022 — Fast, batched redirect writes

Click writes MUST be batched/async so the redirect stays fast and does not open a DB connection per click.

**Acceptance Criteria**:

- [ ] The redirect responds without awaiting a per-click insert; writes are batched and flushed (timer + opportunistic + on shutdown)

### FR-023 — PNG download

For any rendered banner, a SYSADMIN MUST be able to download the PNG.

**Acceptance Criteria**:

- [ ] The download yields the current rendered PNG at preset dimensions

### FR-024 — Copy `<a><img>` snippet

A SYSADMIN MUST be able to copy a ready-to-paste `<a><img>` snippet wiring the image to the tracked `/r/:code` link, with width/height/alt set.

**Acceptance Criteria**:

- [ ] The snippet renders the image from CloudFront and links to `/r/:code` when pasted into plain HTML

### FR-025 — Copy raw image URL

A SYSADMIN MUST be able to copy the raw rendered image URL (for email and image-only platforms).

**Acceptance Criteria**:

- [ ] The raw URL loads the image directly

### FR-026 — Public on-site read

A public, CORS-allowlisted endpoint MUST return only *published* banners for a given segment/slot, exposing image URL, redirect URL, dimensions, and slot — no admin fields or prompts.

**Acceptance Criteria**:

- [ ] Only published banners are returned; drafts/archived never leak; no prompts/admin fields in the payload

### FR-027 — Site embed

The marketing sites MUST be able to render a published banner as `<a href="/r/:code"><img></a>` from that endpoint.

**Acceptance Criteria**:

- [ ] A site-side embed renders the banner and its click is redirected + counted

### FR-028 — Overview rollup

The Marketing Overview rollup MUST gain a counter-based links/clicks summary, replacing the SCOPE-064 engagement placeholder.

**Acceptance Criteria**:

- [ ] Overview shows links/clicks from the counter (never `COUNT(*)`); the deferred placeholder is gone

### FR-029 — Per-banner click count in the tab

The Banner Studio tab MUST show each banner's current click count.

**Acceptance Criteria**:

- [ ] Each banner row/card displays its link's `clickcount`

### FR-030 — Multi-frame transitions *(Phase 2)*

A banner MAY hold multiple ordered frames; the system renders each and stitches them into an animated GIF for export.

**Acceptance Criteria**:

- [ ] *(Phase 2)* the `frames` model is present in Phase 1 (empty); GIF stitching ships in Phase 2

### FR-031 — On-site crossfade *(Phase 2)*

On-site embed MAY crossfade frames via CSS; the public payload already carries the frames shape.

**Acceptance Criteria**:

- [ ] *(Phase 2)* the public payload shape accommodates frames in Phase 1; the CSS crossfade ships in Phase 2

---

## Technical Sections

### Image-generation provider (net-new)

New `src/server/ai/image-provider.ts`, a deliberate sibling of the text-only `src/server/ai/llm-provider.ts`: `getImageProvider()` reads `IMAGE_PROVIDER` (default `gemini-imagen`); `generateImage(prompt, {width,height})` returns `{ bytes: Buffer } | null` (fail-open, never throws). Gemini Imagen is reached through the Google Generative Language endpoint family already used for Gemini text, reusing `GEMINI_API_KEY`; the base64 response becomes a `Buffer`. The OpenAI `gpt-image-1` branch is left as a future env-flip (`IMAGE_PROVIDER=openai-gpt-image` + a new key) but is **not implemented** in Phase 1. A baked brand-style prompt prefix/suffix keeps backgrounds on-brand and text-free. Generation is soft-throttled (reuse the SCOPE-065 `checkThrottle` pattern).

### Render service (Puppeteer)

New `src/server/services/BannerRenderService.ts`, patterned on `src/server/services/MarkdownPdfRenderer.ts`: launch headless Chromium (`--no-sandbox --disable-setuid-sandbox`), `setContent(html, {waitUntil:'networkidle0'})`, then `page.screenshot({type:'png', clip})` instead of `page.pdf()`. A `buildBannerHtml(opts)` helper renders the overlay — the AI image as `background-image: cover` on a box sized to the preset, with headline/sub/logo/CTA on top. `setViewport({width,height,deviceScaleFactor:2})` for crisp output. Brand tokens live in a server constant `src/server/lib/banner-brand.ts` (navy `#0f1722`, amber `#c8761b`, system font stack) extracted from `marketing/site/index.html`; per-banner overrides via `brandtokens`. Wait on `document.fonts.ready` and `await img.decode()` for the logo before screenshot.

### Data model — three new tables

Conventions: plural lowercase tables, lowercase no-underscore columns, UUID v7 PKs, `companyid` cascade FKs. Images live in S3/CloudFront; tables hold metadata + public URLs.

- **`marketinglinks`** (first-class tracked link): `id`, `companyid` (FK cascade), `campaignid` (FK set-null), `code` (unique, opaque, non-enumerable), `destinationurl`, `utmsource`/`utmmedium`/`utmcampaign`, `clickcount` (default 0), `assetid` (nullable), `status` (`active|archived`), `createdbyid`, `createdat`/`updatedat`. Indexes: unique(`code`), `companyid`, `campaignid`, `status`.
- **`marketingbanners`**: `id`, `companyid` (FK cascade), `campaignid` (FK set-null), `linkid` (FK→marketinglinks), `title`, `sizepreset` (`og|mrec|leaderboard|skyscraper|halfpage|mobile`), `width`/`height` (frozen), `layout` (`hero|horizontal|vertical`), `prompt`, `headline`, `subhead`, `ctatext`, `brandtokens` (jsonb), `backgroundurl`, `renderedurl` (versioned key), `frames` (jsonb — Phase-2 hook, `[]` in P1), `status` (`draft|published|archived`), `targetsegment` (nullable), `slot` (nullable), `createdbyid`, `createdat`/`updatedat`. Indexes: `campaignid`, `status`, (`targetsegment`,`slot`).
- **`marketinglinkclicks`**: `id`, `linkid` (FK cascade), `clickedat`, `iphash` (salted+truncated), `uaclass` (`human|bot|preview`), `referrer` (nullable), `counted` (bool). Indexes: `linkid`, `clickedat`.

Export all three from `src/db/schema/index.ts`. Migration generated via `npm run db:generate` and applied via the project's direct-pg pattern (drizzle-kit push needs a TTY; kit `dbpush` is broken).

### Storage + serving

Extend `src/server/lib/marketing-assets-s3.ts` with `putBannerObject({ key, body, contentType })` — a direct server-side `PutObjectCommand` (the file already imports the S3 client; today it only presigns). The server holds the rendered bytes, so a direct put avoids the client round-trip. Keys: `public/banners/<id>/bg.png`, `public/banners/<id>/render-<v>.png` (versioned), and (Phase 2) `frame-<n>.png` / `animated.gif`. Reuse `publicUrlForKey()` + the existing `MARKETING_ASSETS_BUCKET/REGION/BASEURL` and the already-allowed `image/png`/`image/gif` types.

### Routes — admin + public

- **Admin** (new `src/server/routes/marketingBanners.ts`, mounted `/api/sysadmin/marketing/banners` **before** the broad `marketingAdmin` mount, `authenticateToken` + `requireSysAdmin`, Zod-validated): `GET/POST/PATCH/DELETE /banners`, `POST /banners/:id/generate-bg` (throttled), `POST /banners/:id/render`, `GET /banners/:id/export`; plus `/links` CRUD (`GET/POST/PATCH/DELETE`).
- **Public redirect (hot path)** (new thin `src/server/routes/redirect.ts`, `GET /r/:code`, no auth/CORS, mounted at root in `app.ts` **before the SPA catch-all**): one indexed lookup → 302 to the stored destination + non-destructive UTM; record the click via the batched async writer; classify bots/previews `counted=false`.
- **Public on-site read** (add to `src/server/routes/marketing.ts`, CORS-allowlisted, rate-limited): `GET /api/marketing/banners?segment=&slot=` → published banners only.
- **Dashboard**: extend `src/server/services/SysAdminMarketingOverviewService.ts` (`getMarketingOverview`) with the counter-based links/clicks rollup.

### Click writer (performance)

`/r/:code` is on the hot path. A single indexed `where code` SELECT precedes the 302; the click insert + counter increment go through an **in-process micro-batch queue** flushed by timer, opportunistically at the next request, and on SIGTERM — App Runner CPU-throttles after the response, so true fire-and-forget is unsafe (the SCOPE-043 lesson encoded in `marketing.ts`). Batching collapses a launch-day click burst into a handful of statements, avoiding a connection storm against the postgres-js pool and the RDS db.t3.small ~200-connection ceiling. Reads use `clickcount`, never `COUNT(*)`; a periodic reconcile can rebuild the counter from `counted=true` rows if it drifts.

### Client

New `src/client/pages/SysAdmin/marketing/BannerStudio.tsx`, mirroring `Assets.tsx` (dark Tailwind shell, `MarketingHeader`, two-column list/editor, `fetch(..., {credentials:'include'})`, 401→`/login` / 403→`/dashboard`, save-then-act). Left: banner list with thumbnail, title, size, status, click count, filters. Right: editor (title, preset, prompt, headline/sub/CTA, destination, segment/slot, colour overrides) with **Generate background**, **Render banner**, **Publish**, **Delete** actions; the preview is the latest server render; an export panel offers PNG download + copyable `<a><img>` snippet + raw URL + the `/r/:code` URL. Register a `{label:'Banners', path:'/sysadmin/marketing/banners'}` tab in `MarketingTabs.tsx` and a route in `src/client/App.tsx`. The marketing static-site embed is a small site-side change (may land as its own follow-up task).

### Environment / infra

- Reuse: `MARKETING_ASSETS_BUCKET/REGION/BASEURL`, `GEMINI_API_KEY`.
- Add: `IMAGE_PROVIDER=gemini-imagen`, `IMAGE_MODEL=imagen-4.0-generate-001` (Amendment A), `IMAGE_EDIT_MODEL=gemini-2.5-flash-image` (Amendment B), `REDIRECT_BASE_URL` (app domain for building `/r/:code`), `IPHASH_SALT`.
- **Confirm `GEMINI_API_KEY` is provisioned in the App Runner console** (wired in code; env lives in AWS, not the repo).
- **Verify Puppeteer/Chromium launches in the deployed container**, not just locally.

### Conventions

Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`/`@ts-ignore`); Pino-only; fences written by the orchestrator at `implement`; nothing pushed until the user says push.

---

## Success Criteria

1. **A banner goes end to end.** A SYSADMIN creates → generates → renders a banner that is on-brand and legible at the chosen preset. *(FR-001, FR-006, FR-010, FR-013)*
2. **Generate and render are decoupled and safe.** Re-rendering text never calls the image model; a forced generation failure is fail-open and logged, saving nothing partial. *(FR-008, FR-009, FR-011)*
3. **Export works where marketing actually posts.** PNG download + an `<a><img>` snippet that loads the image and links to `/r/:code` + a raw image URL. *(FR-023, FR-024, FR-025)*
4. **Clicks take the viewer to us and are counted.** `/r/:code` 302s to the destination with UTM appended (preserving `?tier=`); a `counted=true` row appears, `clickcount` increments, and the Overview reflects it. *(FR-015, FR-016, FR-019, FR-028)*
5. **The link is safe and reusable.** No URL manipulation can redirect to an arbitrary host; the same tracked link works outside a banner. *(FR-015, FR-017, FR-018)*
6. **Bots don't inflate the numbers.** A bot/`HEAD` hit is stored `counted=false` and does not move the counter; click data carries no PII. *(FR-020, FR-021)*
7. **On-site embed renders and tracks.** The public endpoint returns only published banners by segment/slot; a site embed renders and its click is redirected + counted. *(FR-026, FR-027)*
8. **The hot path holds at launch.** The redirect doesn't await per-click inserts; writes are batched, reads use the counter — no connection storm. *(FR-022)*

---

## Constraints & Notes

### Constraints

- **Reuse, don't reinvent.** Puppeteer (the PDF renderer), the `marketing-assets-s3.ts` store, the SCOPE-065 provider/throttle/fail-open pattern, the SysAdmin marketing tabs/auth, and the `Assets.tsx` editor pattern are all reused. The net-new pieces are the image provider, the render service, and the click-tracking subsystem.
- **AI paints background only.** All text is our HTML overlay; the model never draws legible text. The overlay (logo/colours/copy) is the consistent brand layer; a human reviews and re-rolls before publishing.
- **Open-redirect-proof + privacy-respecting.** The redirect destination is read only from the DB; admin writes are host-allowlisted. Click data is a salted/truncated IP hash + coarse UA class, no PII.
- **Hot-path discipline.** Redirect = one indexed lookup → 302; click writes batched/async; counter for reads. Protects the RDS db.t3.small ceiling at the 1k+ launch.
- **Build order: backend pipeline first.** Schema + provider + render + storage + admin routes, then the redirect/click subsystem, then export + on-site read, then the Banner Studio UI. Phase 2 (transitions) is a separate build.
- **Correct plumbing.** Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript; Pino-only; fences by the orchestrator at `implement`; nothing pushed until the user says push.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`.

### Out of Scope (own later scopes)

- Transitions / animated GIF / multi-frame banners (Phase 2 — designed into the `frames` model and public payload, not built now).
- A brand-profile manager (Phase 1 uses one brand token set + per-banner overrides).
- Multi-locale banner variants; non-SysAdmin access.
- Scheduling, auto-publish, A/B rotation, audience targeting beyond a segment+slot tag.
- Ad-network / auto-posting integrations (Facebook/Google Ads) — export only.
- The OpenAI image provider (abstraction allows it; not implemented).
- Analytics charts / per-click dashboards (event rows stored for the future; Phase 1 surfaces only counts).
- A free-form WYSIWYG drag editor (fixed archetypes only).

### Dependencies

- **SCOPE-046/048** — `marketingassets`, the S3/CloudFront presign lib, and the public `marketing.ts` routes.
- **SCOPE-064** — `SysAdminMarketingOverviewService`/`getMarketingOverview` (the engagement placeholder this scope replaces), `MarketingTabs`, SES image embed, and the newsletter-unsubscribe signed-link precedent.
- **SCOPE-065** — `MarketingAIService`/`llm-provider.ts` as the template for the image provider + throttle/fail-open pattern.
- **Puppeteer** — `MarkdownPdfRenderer.ts` proves the dep is used; **must be verified to launch in the deployed container**.
- **`GEMINI_API_KEY` provisioned in the App Runner console** — confirm before go-live.
- New env: `IMAGE_PROVIDER`, `IMAGE_MODEL`, `IMAGE_EDIT_MODEL` (Amendment B), `REDIRECT_BASE_URL`, `IPHASH_SALT`.

### Notes

- **Likely fan-out (decided at `createSpecs`):** probably 3 implementation specs — (a) data model + image provider + render service + admin banner routes + storage; (b) tracked-link / `/r/:code` redirect + click writer + Overview rollup; (c) export + public on-site read + Banner Studio UI. Confirm at `createSpecs`.
- **Numbering:** authored as SCOPE-070 after confirming 067/068/069 are taken (subscription-lifecycle, multiproject-gateway-isolation, system-health).
- **Process note:** authored in-conversation via interactive buildscope (standing workaround while the `buildscope` CLI is broken); implementation routes through `createSpecs` → `implement` per orchestrator-first.
- **Phase 2 follow-up:** transitions add a `sharp` dep for GIF stitching and a CSS crossfade on-site; the `frames` model and public payload shape are already in place from Phase 1.
- **Glossary:** **Banner**, **Tracked link**, and **Click (counted vs. bot/preview)** to be added to `CONTEXT.md` with this scope.

---

## Amendments

### Amendment A — Imagen 4 default + no-store redirect (2026-06-24, shipped)

Post-ship fix (commit `57baaa28`): the image-model default moved to `imagen-4.0-generate-001` — Imagen 3 is not exposed on this Gemini API project and v4 requires the paid plan — and `/r/:code` gained `Cache-Control: no-store`. Documented retroactively; supersedes the original `IMAGE_MODEL=imagen-3.0-generate-002` value (now corrected inline in Environment/infra).

### Amendment B — Banner Studio v2: Rich Overlay + Directable AI Background (2026-06-25, draft)

**Status**: `draft` — approved via interactive buildscope (Sections 1–3), section-by-section.
**Builds on**: Phase 1 (shipped). Keeps v1's generate/render decoupling, tracked links, click counting, export, presets, and throttle/fail-open discipline unchanged. Backward-compatible: existing v1 banners keep rendering.

#### Why

Phase 1 renders a banner as four fixed zones — one logo image, a single-color one-block headline, one sub-line, one CTA — over a one-shot AI background. Real marketing creative (proven by the `unchain-banner.svg` reference: a multi-line headline with an accent line, an eyebrow, a badge, feature bullets, a CTA paired with a plain URL, and a logo mark) needs more expressive freedom, and the background needs to be *directable* rather than a single roll. v2 closes both gaps while keeping v1's core principle intact: **all text stays a crisp overlay; the AI only ever touches the background** (rejected alternative: letting the image model render text/logos — unreliable spelling and cannot render an exact URL or logo).

#### New Functional Requirements — Rich overlay (text/logo freedom)

##### FR-032 — Eyebrow line

A banner MAY carry an optional **eyebrow** label rendered above the headline (small, letter-spaced, its own color), e.g. "WINDEV · WEBDEV · MOBILE".

**Acceptance Criteria**:

- [ ] When `eyebrow` is set it renders above the headline; when null nothing is shown

##### FR-033 — Multi-line headline (author-controlled breaks)

The headline MUST support multiple lines with author-controlled line breaks (not auto-wrap), stored as ordered segments.

**Acceptance Criteria**:

- [ ] Each `headlinesegments` entry renders as its own line, in order

##### FR-034 — Per-line accent color

Any headline line MAY render in the brand accent gradient instead of the default color (per-line, not per-word).

**Acceptance Criteria**:

- [ ] A segment flagged `accent:true` renders in the brand accent gradient; others render in the default headline color

##### FR-035 — Badge / pill

A banner MAY carry an optional brand-colored **badge** pill (e.g. "★ COMING JULY 5TH").

**Acceptance Criteria**:

- [ ] When `badge` is set a styled pill renders; when null nothing is shown

##### FR-036 — Feature bullets

A banner MAY carry an optional **bullets** block — a small label plus N short lines (e.g. "Full conversion:" / "windows · pages · database · classes").

**Acceptance Criteria**:

- [ ] `bulletslabel` + each `bullets[]` line render; absent → nothing shown

##### FR-037 — CTA + secondary URL

The CTA MAY be paired with an optional plain **URL text** shown beside the pill (display only; the click target remains the tracked `/r/:code` link).

**Acceptance Criteria**:

- [ ] `ctaurl` renders beside the CTA pill; clicking the banner still routes through `/r/:code`

##### FR-038 — Logo mark

The overlay MUST place the brand logo mark from `brandtokens.logoUrl` (the unchain mark supplied there).

**Acceptance Criteria**:

- [ ] When a logo URL is present it renders at the layout's logo position; absent → no logo, no broken image

##### FR-039 — Overlay anchor

The text/logo stack's position MUST be selectable via `overlayanchor` (e.g. `left-center`, `left-bottom`, `center`) so the composition can reserve negative space for the background art.

**Acceptance Criteria**:

- [ ] Changing the anchor moves the stack accordingly; a sensible default is applied per archetype when unset

#### New Functional Requirements — Directable AI background (true in-place edit)

##### FR-040 — Direct an edit

A SYSADMIN MUST be able to edit the **current** background in place by giving a free-text instruction; the system calls the image-edit model (`gemini-2.5-flash-image`) with the current image + instruction and stores the result as a new version (not a from-scratch reroll).

**Acceptance Criteria**:

- [ ] An instruction produces an edited image derived from the current background and sets `backgroundurl`
- [ ] Requires an existing background (edit has a base to work from)

##### FR-041 — Background version history

Every generate and edit MUST be retained; a SYSADMIN MUST be able to view the versions and select which one is active.

**Acceptance Criteria**:

- [ ] `bgversions` accumulates `{ url, kind, instruction?, createdat }`; selecting a version sets `backgroundurl`

##### FR-042 — Throttled, fail-open edit

The edit MUST be throttled and fail-open (same pattern as generate): a provider error / refusal returns a handled message, stores nothing partial, logs it (Pino).

**Acceptance Criteria**:

- [ ] A forced edit failure returns a handled message; the tab stays usable; nothing partial is stored

##### FR-043 — Configurable edit model

The edit model MUST be env-configurable via `IMAGE_EDIT_MODEL` (default `gemini-2.5-flash-image`), mirroring `IMAGE_PROVIDER`/`IMAGE_MODEL`.

**Acceptance Criteria**:

- [ ] The model is read from `IMAGE_EDIT_MODEL` with the documented default

#### Data model additions (`marketingbanners`, additive/back-compat)

New nullable/defaulted columns — no new tables; the renderer falls back to the v1 single `headline` when the new fields are absent:

- `eyebrow` (text), `headlinesegments` (jsonb — `[{ text, accent }]`), `badge` (text), `bulletslabel` (text) + `bullets` (jsonb `string[]`), `ctaurl` (text), `overlayanchor` (varchar).
- `bgversions` (jsonb, default `[]`) — `[{ url, kind: 'generate'|'edit', instruction?, createdat }]`; `backgroundurl` remains the active pointer.

Migration via `npm run db:generate`, applied with the direct-pg pattern. App-DB change only.

#### Technical approach

- **Image provider** (`src/server/ai/image-provider.ts`): add `editImage(currentImage, instruction, {width,height})` → `{IMAGE_EDIT_MODEL}:generateContent` with parts `[{text}, {inline_data}]` and `responseModalities:["IMAGE"]`; returns `Buffer | null` (fail-open; brand-safe suffix keeps it text-free). `generateImage` (Imagen) stays for from-scratch.
- **Routes** (`src/server/routes/marketingBanners.ts`): new `POST /:id/edit-bg {instruction}` (throttled; requires existing `backgroundurl`; fetch current bytes → `editImage` → versioned `putBannerObject` → append `bgversions` → set `backgroundurl`); `generate-bg` also appends to `bgversions`; new `POST /:id/background/select {url}` to activate a past version. Create/update Zod schemas gain the new fields.
- **Render** (`src/server/services/BannerRenderService.ts`): `buildBannerHtml` extended for eyebrow, stacked headline lines (accent lines via `background-clip:text`), badge, bullets, CTA + `ctaurl`, logo, honoring `overlayanchor`; v1 fallback when `headlinesegments` is null.
- **Brand tokens** (`src/server/lib/banner-brand.ts`): add `accentGradient` (teal→cyan `#28e0b0`→`#19b8e6`) + an eyebrow color; the unchain mark lives in `brandtokens.logoUrl`.
- **Client** (`src/client/pages/SysAdmin/marketing/BannerStudio.tsx`): editor gains eyebrow, a headline-lines editor (text + accent toggle per line), badge, bullets, CTA URL, anchor select; the background panel gains a **Direction** box + Apply-edit and a **version filmstrip** to pick the active background.
- **Env**: add `IMAGE_EDIT_MODEL=gemini-2.5-flash-image` to the App Runner console (`GEMINI_API_KEY` already present + verified).
- **Build order**: schema → `editImage` → routes → render rewrite → UI. Nothing pushed until the user says push.

#### Success Criteria (Amendment B)

1. A banner renders eyebrow + multi-line accent headline + badge + bullets + CTA/URL + logo crisply at the chosen preset. *(FR-032…FR-039)*
2. A free-text direction edits the current background in place via `gemini-2.5-flash-image`, kept as a new version; the user can switch among versions. *(FR-040, FR-041)*
3. Edit is throttled + fail-open and stores nothing partial on failure. *(FR-042)*
4. Existing v1 banners (no `headlinesegments`) still render unchanged. *(back-compat)*

#### Out of Scope (Amendment B)

- Per-word accent color (per-line only).
- Animated transitions / multi-frame (still Phase 2).
- AI rendering in-image text or logos (explicitly rejected; the overlay stays crisp).
- A free-form WYSIWYG drag editor (richer fields, still not a canvas editor).

#### Verification note

`gemini-2.5-flash-image` confirmed working against the production `GEMINI_API_KEY` on 2026-06-25: an Imagen-generated source image plus an edit instruction returned an edited image via `:generateContent` (`responseModalities:["IMAGE"]`).

---

## Amendment C — Render via SVG + resvg-js (text-not-showing fix) — DEPLOYED 2026-06-26 (APP 1.5.147)

The Puppeteer/HTML→screenshot render failed in App Runner: first "Could not find Chrome" (patched with `@sparticuz/chromium`), then **blank text** because the serverless Chromium container ships no fonts. `BannerRenderService` now composes the banner as **SVG** — the AI background is embedded as a base64 `<image>` under a navy scrim, and the overlay (eyebrow, multi-line per-line-accent headline, badge, bullets, CTA + URL, logo) is drawn as **crisp vector text** — then rasterized with **`@resvg/resvg-js`** using bundled Inter fonts (Regular + ExtraBold in `src/server/assets/fonts/`). No headless browser. The AI background generation/edit path is unchanged. `puppeteer` / `@sparticuz/chromium` are retained for `MarkdownPdfRenderer` (invoice/lifecycle PDFs).

## Amendment D — Per-element drag/resize layout editor (supersedes Amendment B's "no WYSIWYG")

Adds the free-form WYSIWYG editor Amendment B deferred. New nullable `marketingbanners.overlaylayout` jsonb = `{ [element]: { x, y, scale } }` (x,y as 0..1 fractions of w,h for the element top-left; scale multiplies the auto font size / logo height). When present the renderer positions every element absolutely (`buildAbsoluteOverlay`); when null it uses the auto-stack layout (back-compat — existing banners unchanged). New `BannerLayoutEditor.tsx` is a live preview (AI background + scrim) with a draggable + resizable box per element, mirroring the render's Inter sizing so it is WYSIWYG. The amber **Layout** button opens it; **Save layout** persists the map and **auto-re-renders** so the preview updates immediately; **Reset to auto** clears the overrides. Dev-only: `/r` was added to the Vite proxy so tracked-redirect clicks work in local dev (prod already serves `/r` same-origin with `REDIRECT_BASE_URL` set).

#### Out of Scope (Amendment D)

- Snap-to-grid / alignment guides.
- Per-element show/hide (content presence still governs what renders).
- Multi-frame / transitions (still Phase 2).

---

## Amendment E — Import a custom background image (upload) — 2026-06-26

**Status**: `draft` — approved in-conversation (custom-background-only of three options: background upload vs. image overlay element vs. both).
**Builds on**: Phase 1 + Amendments B/D. The AI background remains the default; this adds a *bring-your-own-image* alternative for the background only. The overlay is still always our crisp text/logo layer.

#### Why

Today the banner background can only come from the AI (FR-006 generate / FR-040 in-place edit / FR-041 version select). A marketer who already has artwork — a product screenshot, a designer-supplied hero, a stock image — has no way to use it. Amendment E lets a SYSADMIN upload an image to use as the background. It enters the existing `bgversions` history as `kind:'upload'`, becomes the active `backgroundurl`, and flows through the existing Layout (Amendment D) and Render pipeline with **no renderer change** — the overlay composites over it exactly as over an AI image.

#### New Functional Requirement

##### FR-044 — Upload a custom background

A SYSADMIN MUST be able to upload an image file (PNG/JPEG/WebP) to use as the banner background, as an alternative to AI generation.

**Acceptance Criteria**:

- [ ] An uploaded image is stored under the banner's S3 prefix and set as the active `backgroundurl`
- [ ] The upload is appended to `bgversions` as `{ url, kind:'upload', createdat }`, so it sits alongside AI versions and is selectable via FR-041
- [ ] Disallowed content-types and over-size files are rejected with a handled message (no partial store)
- [ ] After upload, Layout + Render + export work unchanged over the uploaded image

#### Technical approach (reuse-first, no new tables/columns)

- **Storage** (`src/server/lib/marketing-assets-s3.ts`): add `presignBannerBackgroundUpload({ bannerId, filename, contentType, contentLength })` — a short-TTL presigned PUT to a versioned `public/banners/<id>/upload-<ts>-<name>` key (via `bannerObjectKey`), restricted to image content-types with a size ceiling. Mirrors the proven `presignAssetUpload` browser→S3 path used by `Assets.tsx` (bucket CORS + the App Runner instance role are already known-good in prod), rather than routing image bytes through the API.
- **Routes** (`src/server/routes/marketingBanners.ts`): `POST /:id/background/upload-url {filename,contentType,contentLength}` → presigned PUT + public URL; `POST /:id/background/upload-complete {url}` → validates the url is within **this** banner's S3 prefix (defense-in-depth, never trust an arbitrary url), appends `bgversions` `kind:'upload'`, sets `backgroundurl`. No schema/migration change — reuses the Amendment-B `bgversions` jsonb.
- **Client** (`src/client/pages/SysAdmin/marketing/BannerStudio.tsx`): an **Upload background** button (hidden file input) beside *Generate background* runs presign → PUT-to-S3 → upload-complete, then refreshes the editor; the uploaded version appears in the existing background filmstrip.
- **Build order**: storage helper → routes → UI. Nothing pushed until the user says push.

#### Out of Scope (Amendment E)

- An image **overlay element** (draggable uploaded image on top of the background) — considered and explicitly deferred; would need a new layout element type + renderer support + a data field.
- A media library / re-use of a previously uploaded image across banners (each upload is per-banner).
- Client-side cropping/resizing to the preset (the image is used as `cover`, same as AI backgrounds).

---

## Amendment F — Per-element delete in the Layout editor (hide an element, incl. the logo) — 2026-06-26

**Status**: `draft` — approved in-conversation. Motivating case: a marketer uploads (Amendment E) a designer-made background that **already contains the wxKanban logo**, so the overlay's brand logo renders the logo twice. There was no way to remove the overlay logo (it always rendered; FR-038), and Amendment D explicitly deferred per-element show/hide.

**Builds on**: Amendment D (the per-element absolute `overlaylayout` map) + Amendment E (custom background). Back-compat: no migration; existing layouts render unchanged.

#### New Functional Requirement

##### FR-045 — Hide/delete an overlay element in the Layout editor

In the Layout editor a SYSADMIN MUST be able to delete (hide) any overlay element — in particular the **logo** — so a self-contained background image isn't double-branded. A hidden element MUST be restorable.

**Acceptance Criteria**:

- [ ] Each element box in `BannerLayoutEditor` has a delete (×) control; clicking it removes the element from the canvas
- [ ] Hidden elements are listed as restore chips so the action is reversible (not a dead-end)
- [ ] The render (`buildAbsoluteOverlay`) skips hidden elements; the logo specifically can be removed
- [ ] Existing banners (no hidden flags) render exactly as before

#### Technical approach (no new table/column)

- **Data**: extend the `overlaylayout` placement shape with an optional `hidden?: boolean` — `{ x, y, scale, hidden? }`. Lives in the existing Amendment-D `overlaylayout` jsonb; absence/`false` = shown. (Hiding therefore implies absolute-layout mode, which is already what saving a layout does.)
- **Renderer** (`BannerRenderService.ts`): `OverlayPlacement` gains `hidden?`; `buildAbsoluteOverlay` skips any element whose placement is `hidden` (logo, eyebrow, headline, subhead, bullets, cta, badge).
- **Route** (`marketingBanners.ts`): the `overlaylayout` Zod inner object gains `hidden: z.boolean().optional()` so the flag survives the PATCH (zod strips unknown keys otherwise).
- **Editor** (`BannerLayoutEditor.tsx`): render only non-hidden present elements on the canvas, each with a top-right × (delete) beside the existing resize handle; show hidden elements as a small "Hidden — click to restore" chip row.

#### Out of Scope (Amendment F)

- A separate logo on/off field that works in auto-stack mode (hide lives in `overlaylayout` → applies in Layout/absolute mode, which is where the user removes it).
- Deleting/replacing the background from inside the Layout editor (done in the background panel: Generate / Upload / version filmstrip).
