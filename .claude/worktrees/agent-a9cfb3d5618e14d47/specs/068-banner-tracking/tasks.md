# Task Breakdown: Banner Studio — Tracking & Redirect

**Feature**: Banner Studio — Tracking & Redirect
**Spec**: 068
**Date Generated**: 2026-06-24
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Band | Priority | Status |
|---|------|------|----------|--------|
| 1 | T001 `redirect.ts` — public `GET /r/:code`, indexed lookup → 302, non-destructive UTM, open-redirect-proof; mount in `app.ts` before SPA catch-all | Backend | high | open |
| 2 | T002 `banner-click-writer.ts` — in-process micro-batch queue (timer + opportunistic + SIGTERM flush) → `marketinglinkclicks` insert + atomic `clickcount` increment | Backend | high | open |
| 3 | T003 Classification & privacy — `iphash` (salted/truncated), `uaclass` (human/bot/preview, `HEAD`/unfurler → `counted=false`), same-IP dedupe, rate-limit the logging | Backend | high | open |
| 4 | T004 `marketingLinks.ts` admin router — `/links` CRUD (reuses the SPEC-067 host-allowlist helper); mount before `marketingAdmin` | Backend | high | open |
| 5 | T005 Overview rollup — extend `SysAdminMarketingOverviewService.getMarketingOverview()` with a counter-based links/clicks block (replace the deferred placeholder) | Backend | medium | open |
| 6 | T006 Env/docs — `.env.example` adds `IPHASH_SALT`, `REDIRECT_BASE_URL`; note open-redirect/privacy posture | — | low | open |

> **Status (2026-06-24):** T001–T006 implemented in-conversation; esbuild server build green. Tables already live (SPEC-067 migration applied). NOT committed/pushed. Live verification (a real `/r/:code` hit → 302 + counter increment + Overview rollup) pending deploy + `REDIRECT_BASE_URL`/`IPHASH_SALT` set.

> **Build order:** T001 (redirect) + T002 (writer) are the core; T003 layers onto T001/T002; T004 (links CRUD) and T005 (rollup) are independent and can land in parallel. Depends on SPEC-067's tables + shared helper being in place.

> **Process:** authored in-conversation (orchestrator `createSpecs` path unavailable from this session). Implementation routes through `implement`; fences at implement time. Nothing pushed until the user says push.

---

## Task Details

### T001 — Redirect endpoint
New `src/server/routes/redirect.ts`, public (no auth/CORS), mounted at root in `src/server/app.ts` **before the SPA catch-all** (`/^\/(?!api\b).*/` would otherwise swallow `/r/...`). `GET /r/:code`: one indexed `where code` SELECT (`src/db/client.ts`); unknown/inactive → clean 404; valid → 302 to `destinationurl` with `utm_*` appended only if absent (preserve `?tier=`); 302 not 301. Destination comes **only** from the row (open-redirect-proof). Enqueue the click via T002 and return without awaiting. *(FR-015, FR-016, FR-019, FR-022)*

### T002 — Click micro-batch writer
New `src/server/lib/banner-click-writer.ts`: `enqueueClick({linkid, iphash, uaclass, referrer, counted})` → in-memory buffer; flush on a short timer, opportunistically at the next request, and on SIGTERM (App Runner CPU-throttles post-response — true fire-and-forget drops writes, per SCOPE-043). Flush = one multi-row `INSERT` into `marketinglinkclicks` + an atomic `UPDATE marketinglinks SET clickcount = clickcount + <countedDelta>` per affected link. Bounded best-effort fallback. *(FR-019, FR-022)*

### T003 — Classification & privacy
In the redirect handler: compute `iphash = HMAC-SHA256(IPHASH_SALT, truncate(ip))` (truncate to /24; store hash only — no raw IP/PII); classify `uaclass` into `human|bot|preview` from UA + method (`HEAD`, Slackbot/facebookexternalhit/known crawlers, prefetch → `bot`/`preview`, `counted=false`); same-IP-hash dedupe window to suppress preview+click double-count; rate-limit the **logging** per IP hash (fixed window), never the redirect. *(FR-020, FR-021)*

### T004 — Links CRUD
New `src/server/routes/marketingLinks.ts`, mounted `/api/sysadmin/marketing/links` before `marketingAdminRoutes`, `authenticateToken` + `requireSysAdmin`, Zod-validated. `GET /links` (with `clickcount`), `POST /links` (standalone link: destination + UTM; validate host via the **shared allowlist helper introduced in SPEC-067**), `GET/PATCH/DELETE /links/:id` (archive on delete). Makes the link reusable outside a banner. *(FR-017, FR-018)*

### T005 — Overview rollup
Extend `src/server/services/SysAdminMarketingOverviewService.ts` `getMarketingOverview()` with a `links` block (total links, total counted clicks, optional top-N by `clickcount`) read from the **counter** (`SUM(clickcount)` / simple selects — never `COUNT(*)` over click rows). Replaces the `engagementTracking: "deferred"` placeholder from SCOPE-064. *(FR-028)*

### T006 — Env/docs
Add `IPHASH_SALT` and `REDIRECT_BASE_URL` to `.env.example`; note the open-redirect (destination only from DB) and privacy (hashed/truncated IP, no PII) posture, and that `/r/*` must reach the app origin (not cached/routed to the static site). *(Notes / risks)*

---

## Notes

- **Verification (no UI):** `GET /r/<code>` → 302 to destination with UTM (preserve `?tier=`); a `counted=true` row + `clickcount` increment; a `HEAD`/scanner-UA hit → `counted=false`, counter unmoved; an unknown code → 404; attempt to coerce an arbitrary host → impossible; Overview shows the links/clicks block.
- **First click-tracking in the product** — SCOPE-064 deferred it; this realizes it. Counter is the read path; reconcile job is a later safety net.
- **Nothing pushed until the user says push.**
