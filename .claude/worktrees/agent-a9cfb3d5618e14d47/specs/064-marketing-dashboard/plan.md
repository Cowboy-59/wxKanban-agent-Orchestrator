# Implementation Plan: Marketing Dashboard — Overview & Newsletter

**Feature**: Marketing Dashboard
**Spec**: 064 — [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)
**Scope**: SCOPE-064 — `specs/Project-Scope/064-marketing-dashboard.md`
**Date**: 2026-06-21

---

## Strategy

One spec folder, two phases. **Phase A (Marketing Overview)** is the quick, no-infra win — aggregate SQL over existing tables on the existing pool, plus read-only UI; verifiable by curl + a SYSADMIN login. **Phase B (Newsletter)** adds the two tables, the server-side SES send (background job), the routes, the public unsubscribe, and the compose/send UI. The two phases are independent; A can ship without B. ~70% of this is reuse — the Overview reuses proven count SQL, and the Newsletter ports the recipient SQL + SES loop from `send-customer-announce.mjs`.

## Phase A — Marketing Overview (T001–T003)

**Aggregate service + route** — read-only, no writes:
- `src/server/services/SysAdminMarketingOverviewService.ts` → `getMarketingOverview()`. Computes each source in its own try/catch so one failing query degrades that metric to `null` (fail-open, the spec-043 resilience pattern) rather than 500-ing the page. Sources:
  - `marketingcontacts` audience — total, distinct `lower(email)`, by `signuplist`, `wantshandson` cohort, blank/invalid (regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`) and case-insensitive dupes, reusing the idioms in `marketing/site/deploy/lambda/count-check.mjs` + `send-customer-announce.mjs`.
  - `marketingleads` by `status` + `segment`; `campaigns` by `status`; `marketingassets` by `type`/`status`; `campaignposts` by `channel`/`status` + upcoming `scheduledat`.
  - a static channels/sites block (windev.wxperts.com status, landing-docs count via the existing docs query) + a deferred "engagement" marker.
- `GET /api/sysadmin/marketing/overview` added to `src/server/routes/marketingAdmin.ts` (already mounted at `/api/sysadmin/marketing`, already behind `authenticateToken` + `requireSysAdmin`). All DB via `src/db/client.ts` (postgres-js), never `lib/db.ts`.

**UI (both placements):**
- `src/client/pages/SysAdmin/marketing/Overview.tsx` — read-only stat-card groups (Audience · Lead Funnel · Campaigns · Assets · Posts · Channels/Sites · Engagement-coming-soon), each linking into its detail tab.
- `src/client/pages/SysAdmin/marketing/MarketingTabs.tsx` — add **Overview** as the first tab; add the route in `src/client/App.tsx` alongside the other `/sysadmin/marketing/*` routes.
- `src/client/pages/SysAdminDashboard.tsx` — a Marketing summary card on the Overview tab (headline numbers + "View marketing →"), using the existing `fetch(..., { credentials: "include" })` + `useState` pattern (no TanStack Query in this dashboard).

## Phase B — Newsletter (T004–T008)

**Schema + migration** (UUID v7; applied via the `pg.Client` + transaction pattern — see `src/db/migrations/0032_spec057_companystackprofiles.sql` — not drizzle-kit push):
- `src/db/schema/newsletterissues.ts` → `newsletterissues` (`id` PK, `subject`, `body` text, `segment` varchar, `status` `draft|sending|sent|failed`, `recipientcount`/`sentcount`/`failedcount` int, `createdbyid` FK→userprofiles set-null, `createdat`/`updatedat`, `sentat`).
- `src/db/schema/newslettersends.ts` → `newslettersends` (`id` PK, `issueid` FK→newsletterissues cascade, `contactid` FK→marketingcontacts, `email`, `status` `pending|sent|failed`, `error` text, `sentat`).
- `marketingcontacts.unsubscribedat` (timestamptz, null) added in the same migration; recipient selection excludes non-null.

**SES send (server-side, background job):**
- `src/server/lib/ses.ts` — wraps `@aws-sdk/client-ses` (`SendEmailCommand`), mirroring the config style of `src/server/lib/marketing-assets-s3.ts` (region from `MARKETING_ASSETS_REGION`/`AWS_REGION`, From from `NEWSLETTER_FROM`). Add `@aws-sdk/client-ses` to server deps.
- `src/server/services/NewsletterSendService.ts` — ports the deduped/valid recipient SQL from `send-customer-announce.mjs` (adding the `unsubscribedat IS NULL` filter), then runs the SES loop in the background (`POST …/send` sets the issue `sending` and returns; the worker iterates recipients, writes `newslettersends`, throttles for SES rate limits, and rolls `sentcount`/`failedcount` onto the issue, ending `sent`). A per-recipient SES failure is recorded, not fatal.

**Routes:**
- `src/server/routes/newsletter.ts` mounted at `/api/sysadmin/marketing/newsletter` via `src/server/index.ts → app.ts` (never dead `index2.ts`), behind `authenticateToken` + `requireSysAdmin`: `GET /issues`, `POST /issues`, `GET /issues/:id`, `PATCH /issues/:id`, `GET /issues/:id/recipients?segment=` (deduped count preview), `POST /issues/:id/send` (async trigger, guard against re-send of a non-draft).
- Public unsubscribe: `GET /api/marketing/newsletter/unsubscribe?u=<contactid>&sig=<hmac>` — unauthenticated (like the public `/api/marketing/leads` route in `src/server/routes/marketing.ts`), verifies an HMAC (`NEWSLETTER_UNSUBSCRIBE_SECRET`) over the contact id and sets `unsubscribedat`. The send wraps each email with this link in a minimal HTML footer.

**UI:**
- `src/client/pages/SysAdmin/marketing/Newsletter.tsx` — issue list (reverse-chron with outcomes) + compose editor (subject/body) + recipient-segment picker with live count + Send + per-issue send record. Added as the **last** tab in `MarketingTabs.tsx`.

## Infra / Config (Phase B)

- New env: `NEWSLETTER_FROM` (SES-verified sender), `NEWSLETTER_UNSUBSCRIBE_SECRET` (HMAC). Reuse `MARKETING_ASSETS_REGION`/`AWS_REGION`. Document in `.env.example`.
- App Runner instance role needs `ses:SendEmail` added (today it only grants S3 presign) — set in the AWS console (App Runner is `ConfigurationSource: API`; yaml env is ignored). Verify SES is out of sandbox for the send identity.

## Conventions

Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`, no `@ts-ignore`); Pino-only (no `console.log`); fences written by the orchestrator at `implement`. Nothing pushed until the user says push (App Runner deploys on push).

## Verification

1. `npm run check-types` clean.
2. Phase A: as SYSADMIN, `GET /api/sysadmin/marketing/overview` returns real numbers (total ≈ 879; ~844 import / ~35 opt-in; funnel + module counts); a deliberately broken sub-query degrades to null with a 200; Overview tab + dashboard card render and link through; non-SYSADMIN gets 403.
3. Phase B: compose a draft; `GET …/recipients?segment=customer-import` shows the deduped count; `POST …/send` returns immediately, the issue goes `sending → sent` with accurate tallies, `newslettersends` rows exist; a malformed address is counted failed, not fatal; the unsubscribe link sets `unsubscribedat` and the contact drops from a re-preview.
4. `auditfences` exit 0.
