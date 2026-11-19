# Task Breakdown: Marketing Dashboard — Overview & Newsletter

**Feature**: Marketing Dashboard
**Spec**: 064
**Date Generated**: 2026-06-21
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Phase | Priority | Status |
|---|------|-------|----------|--------|
| 1 | T001 `SysAdminMarketingOverviewService` (fail-open aggregates) + `GET /api/sysadmin/marketing/overview` | A | high | done |
| 2 | T002 `Overview.tsx` page + Overview as first tab in `MarketingTabs` + route in `App.tsx` | A | high | done |
| 3 | T003 Marketing summary card on `SysAdminDashboard.tsx` + channels/sites block + engagement-deferred placeholder | A | medium | done |
| 4 | T004 Schema + migration — `newsletterissues` + `newslettersends` + `marketingcontacts.unsubscribedat` | B | high | done |
| 5 | T005 `ses.ts` (`@aws-sdk/client-ses`) + `NewsletterSendService` (recipient SQL port + background SES loop) | B | high | done |
| 6 | T006 Newsletter routes — issues CRUD + recipient preview + async send (`newsletter.ts`) | B | high | done |
| 7 | T007 Public HMAC unsubscribe route + send-time footer link | B | high | done |
| 8 | T008 `Newsletter.tsx` page (list + compose + segment picker + send + record) + Newsletter tab in `MarketingTabs` | B | high | done |
| 9 | T009 Env vars (`NEWSLETTER_FROM`, `NEWSLETTER_UNSUBSCRIBE_SECRET`) in `.env.example` + IAM `ses:SendEmail` note | B | low | done |

---

## Task Details

### Phase A — Marketing Overview

#### T001 — Overview service + endpoint
Create `src/server/services/SysAdminMarketingOverviewService.ts` exporting `getMarketingOverview()`. Compute each source in its own try/catch → `null` on failure (fail-open): `marketingcontacts` audience (total, distinct `lower(email)`, by `signuplist`, `wantshandson` cohort, blank/invalid via regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`, case-insensitive dupes — idioms from `marketing/site/deploy/lambda/count-check.mjs`); `marketingleads` by `status`/`segment`; `campaigns` by `status`; `marketingassets` by `type`/`status`; `campaignposts` by `channel`/`status` + upcoming `scheduledat`; a static channels/sites block (windev.wxperts.com status, landing-docs count) + a deferred-engagement marker. Add `GET /api/sysadmin/marketing/overview` to `src/server/routes/marketingAdmin.ts` (already SYSADMIN-gated). DB via `src/db/client.ts`. *(FR-001/002/003/004/006/013)*

#### T002 — Overview page + tab + route
Create `src/client/pages/SysAdmin/marketing/Overview.tsx` — read-only stat-card groups (Audience · Lead Funnel · Campaigns · Assets · Posts · Channels/Sites · Engagement coming-soon), each linking into its detail tab. Add **Overview** as the first tab in `src/client/pages/SysAdmin/marketing/MarketingTabs.tsx`; add the route in `src/client/App.tsx` alongside the other `/sysadmin/marketing/*` routes. *(FR-005/006)*

#### T003 — Dashboard summary card
Add a Marketing summary card to the Overview tab of `src/client/pages/SysAdminDashboard.tsx` — headline numbers (total audience, campaigns sent, leads in funnel) + a "View marketing →" link to `/sysadmin/marketing`. Use the existing `fetch(..., { credentials: "include" })` + `useState` pattern (no TanStack Query). *(FR-005)*

### Phase B — Newsletter

#### T004 — Schema + migration
Add `src/db/schema/newsletterissues.ts` (`newsletterissues`: id uuid v7 PK, subject, body text, segment varchar, status `draft|sending|sent|failed`, recipientcount/sentcount/failedcount int, createdbyid FK→userprofiles set-null, createdat/updatedat, sentat) and `src/db/schema/newslettersends.ts` (`newslettersends`: id PK, issueid FK→newsletterissues cascade, contactid FK→marketingcontacts, email, status `pending|sent|failed`, error text, sentat). Add `marketingcontacts.unsubscribedat` (timestamptz null) in the same migration. Apply via the `pg.Client` + transaction pattern (app-side UUID v7) — see `src/db/migrations/0032_spec057_companystackprofiles.sql`. Not drizzle-kit push. *(FR-007/010/012)*

#### T005 — SES lib + send service
Create `src/server/lib/ses.ts` wrapping `@aws-sdk/client-ses` (`SendEmailCommand`), mirroring `src/server/lib/marketing-assets-s3.ts` config (region from `MARKETING_ASSETS_REGION`/`AWS_REGION`, From from `NEWSLETTER_FROM`); add `@aws-sdk/client-ses` to server deps. Create `src/server/services/NewsletterSendService.ts` — port the deduped/valid recipient SQL from `send-customer-announce.mjs` (add `unsubscribedat IS NULL`), then run the SES loop in the background: set issue `sending`, iterate recipients writing `newslettersends`, throttle for SES rate limits, roll `sentcount`/`failedcount` onto the issue, end `sent`. Per-recipient failures recorded, not fatal. *(FR-008/009/010)*

#### T006 — Newsletter routes
Create `src/server/routes/newsletter.ts` mounted at `/api/sysadmin/marketing/newsletter` via `src/server/index.ts → app.ts`, behind `authenticateToken` + `requireSysAdmin`: `GET /issues`, `POST /issues`, `GET /issues/:id`, `PATCH /issues/:id`, `GET /issues/:id/recipients?segment=` (deduped count preview), `POST /issues/:id/send` (async trigger via `NewsletterSendService`, guard against re-sending a non-draft issue). *(FR-007/008/009/011/013)*

#### T007 — Public unsubscribe
Add `GET /api/marketing/newsletter/unsubscribe?u=<contactid>&sig=<hmac>` (unauthenticated, like the public lead route in `src/server/routes/marketing.ts`) — verify HMAC over the contact id with `NEWSLETTER_UNSUBSCRIBE_SECRET`, set `unsubscribedat`, return a simple confirmation page. Wrap each sent email with this link in a minimal HTML footer in `NewsletterSendService`. *(FR-012)*

#### T008 — Newsletter UI
Create `src/client/pages/SysAdmin/marketing/Newsletter.tsx` — issue list (reverse-chron with date/segment/sent-failed), compose editor (subject/body), recipient-segment picker with live count (`GET …/recipients`), Send button, and per-issue send record on detail. Add as the **last** tab in `MarketingTabs.tsx`; add the route in `App.tsx`. *(FR-007/008/009/010/011)*

#### T009 — Env + IAM
Add `NEWSLETTER_FROM` and `NEWSLETTER_UNSUBSCRIBE_SECRET` to `.env.example` with comments. Document the App Runner instance-role `ses:SendEmail` grant (set in AWS console — App Runner is `ConfigurationSource: API`) and the SES-out-of-sandbox check. *(FR-009/012)*

#### T014 — "Hands-on" virtual recipient list
Add a reserved segment sentinel `hands-on` in a shared module (`src/shared/newsletter-segments.ts`) with its display label. Branch `getRecipients` / `countRecipients` in `NewsletterSendService` so the sentinel resolves to `WHERE wantshandson = true` (keeping the valid-email / `unsubscribedat IS NULL` / dedupe rules) instead of a `signuplist` match. Surface "Hands-on" in the `Newsletter.tsx` segment picker with a hint. *(FR-014)*

---

## Notes

- Phase A is independent of Phase B and can ship first (no new infra).
- Phase B requires the `ses:SendEmail` IAM grant + SES production access before a real send works end-to-end in prod.
- Implementation routes through `implement <scope>/<task>`; fences written by the orchestrator only.
