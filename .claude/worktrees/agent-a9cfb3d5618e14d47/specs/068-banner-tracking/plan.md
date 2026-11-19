# Implementation Plan: Banner Studio — Tracking & Redirect

**Spec**: 068 — [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)
**Scope**: [`specs/Project-Scope/070-banner-studio.md`](../Project-Scope/070-banner-studio.md)
**Stack**: Express + PostgreSQL/Drizzle (per `stack.md`); postgres-js via `src/db/client.ts`.

---

## Approach

Build the smallest correct click-tracking subsystem on top of the SPEC-067 tables. The redirect is a thin, fast public handler; the cost is moved off the hot path into a batched writer. The link is treated as a first-class entity (its own CRUD) so the same tracked URL works in a banner `<a><img>`, a plain text link, or an email — not just inside a banner. The dashboard surfaces a counter read, never an aggregate scan. Order: **redirect → writer → classification → links CRUD → Overview rollup**.

## Redirect — `src/server/routes/redirect.ts` (new, public)

`GET /r/:code`, no auth, no CORS (top-level browser navigation, not XHR). Mounted at root in `src/server/app.ts` **before the SPA catch-all** (the `/^\/(?!api\b).*/` route would otherwise swallow `/r/...`). One indexed `where code` SELECT via `src/db/client.ts`:
- unknown/inactive code → clean **404** (no open redirect, no leak).
- valid → build the destination: start from `marketinglinks.destinationurl`, append `utm_source/utm_medium/utm_campaign` **only if not already present** (preserves `?tier=CONSULTANT`), then **302** (not 301 — 301 is browser-cached and future clicks never reach us).
- **open-redirect prevention is structural:** the URL carries only `:code`; the destination comes only from the row. There is no destination-in-URL code path to exploit.
- enqueue the click (below) and return immediately — the response never awaits the insert.

## Click writer — `src/server/lib/banner-click-writer.ts` (new)

An in-process micro-batch queue: `enqueueClick({ linkid, iphash, uaclass, referrer, counted })` pushes to an in-memory buffer; a flush runs (a) on a short timer, (b) opportunistically at the start of the next request, and (c) on SIGTERM — because App Runner CPU-throttles after the response, so true fire-and-forget would drop writes (the SCOPE-043 lesson encoded in `marketing.ts`). Flush does one multi-row `INSERT` into `marketinglinkclicks` plus a single `UPDATE marketinglinks SET clickcount = clickcount + <countedDelta> WHERE id = ...` per affected link (counter increments only for `counted=true`). Batching collapses a launch-day burst into a handful of statements, avoiding a connection storm against the postgres-js pool and the RDS db.t3.small ~200-conn ceiling. Bounded best-effort single-statement fallback if the buffer is contended.

## Classification & privacy — within the redirect handler

- **`iphash`**: `HMAC-SHA256(IPHASH_SALT, truncate(ip))` (truncate to /24 or drop the last octet) → store the hash only. No raw IP, no PII.
- **`uaclass`**: classify the User-Agent + method into `human | bot | preview`. `HEAD` requests, known scanner/unfurler UAs (Slackbot, facebookexternalhit, bots/crawlers), and prefetch signals → `bot`/`preview` with `counted=false`. A same-IP-hash dedupe window suppresses double-counting from rapid preview+click.
- Rate-limit the **logging** (per IP hash, fixed window) — never the redirect itself — so users behind shared NAT aren't blocked from reaching us.

## Links CRUD — `src/server/routes/marketingLinks.ts` (new, admin)

Mounted `/api/sysadmin/marketing/links` (before the broad `marketingAdmin` mount), `authenticateToken` + `requireSysAdmin`, Zod-validated. `GET /links` (list with `clickcount`), `POST /links` (create standalone tracked link: destination + UTM; validate the destination host via the **shared allowlist helper from SPEC-067**), `GET /links/:id`, `PATCH /links/:id` (destination/UTM/status), `DELETE /links/:id` (archive). This is what makes the link reusable outside a banner. DB via `src/db/client.ts`.

## Overview rollup — extend `src/server/services/SysAdminMarketingOverviewService.ts`

Extend `getMarketingOverview()` with a `links` block (total links, total counted clicks, maybe top-N by `clickcount`) read from the **counter** — `SUM(clickcount)` / simple selects, never `COUNT(*)` over `marketinglinkclicks`. This replaces the `engagementTracking: "deferred"` placeholder SCOPE-064 left as exactly this seam.

## Conventions

Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`/`@ts-ignore`); Pino-only; fences written by the orchestrator at `implement`; nothing pushed until the user says push.

## Risks

- **Flusher vs. throttle** — verify the timer flush actually runs under App Runner's post-response CPU throttling; the opportunistic next-request flush + SIGTERM flush are the safety nets.
- **Multi-instance buffers** — each instance has its own buffer; that's fine (each flushes its own), but the counter UPDATE must be atomic (`clickcount = clickcount + n`), never read-modify-write.
- **Bot-list drift** — the UA classifier is best-effort; err toward `counted=false` for ambiguous automation so the counter stays conservative.
- **`/r/` reachability** — confirm the App Runner domain / any CloudFront in front of the app passes `/r/*` through to the origin (it must not be cached or routed to the static site).
