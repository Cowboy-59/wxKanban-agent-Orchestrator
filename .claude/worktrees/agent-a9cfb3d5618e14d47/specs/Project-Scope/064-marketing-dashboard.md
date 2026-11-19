# SCOPE-064: Marketing Dashboard — Overview Rollup & Newsletter

**Scope Number**: SCOPE-064
**Status**: `draft`
**Created**: 2026-06-20
**Last Reviewed**: 2026-06-20 (interactive buildscope — section-by-section, approved through all six sections); amended 2026-07-08 (Amendment A — registered-user newsletter audience)
**Depends On**: SPEC-046 (marketing lead capture — reuses `marketingleads`, the `/sysadmin/marketing` hub, `marketingAdmin.ts` routes, and the `authenticateToken` + `requireSysAdmin` gate); SPEC-048 (marketing module — reuses `campaigns`, `marketingassets`, `campaignposts`, and `MarketingTabs.tsx`); the `marketingcontacts` table (same app Postgres); the proven AWS SES/Lambda send path (`marketing/site/deploy/lambda/send-customer-announce.mjs` — recipient dedupe/invalid SQL + SES send loop).
**Related Scopes**: SPEC-046/048 built the marketing *surfaces*; this scope makes them *reflect reality* (the Overview rollup) and adds the one outbound action the hub still lacks (the Newsletter).
**Source**: `specs/Project-Scope/064-marketing-dashboard.md`

---

## Overview

The sysadmin Marketing hub (`/sysadmin/marketing`) has the right tabs — Leads, Campaigns, Assets, Posts — but they're empty scaffolding: none of the marketing work actually done so far is visible anywhere. The real audience (~844 imported customers + ~35 launch-notify opt-ins in `marketingcontacts`), the real blasts already sent (cust844, launch-notify, customer-announce), and the live windev.wxperts.com site don't surface in the dashboard. A SYSADMIN has no at-a-glance read on "what have we actually done, and who can we reach."

This scope closes that in two parts. **(A) Marketing Overview** — a read-only rollup, surfaced both as a summary card on the main SysAdmin dashboard and as a first "Overview" tab in the hub, aggregating audience, lead funnel, campaigns, assets, and posts from the app's own Postgres (no new infra). **(B) Newsletter** — a compose-and-send capability: a SYSADMIN authors a newsletter issue in-app, selects the recipient segment from `marketingcontacts`, and sends it through the existing AWS SES/Lambda pipeline, with issues and their per-send results tracked in new newsletter tables. Engagement/click tracking (DynamoDB) is explicitly deferred.

## Business Problem

The marketing module was built before there was any marketing to show, so it shipped as empty CRUD surfaces. Meanwhile the real work happened *outside* the app — contacts imported via Lambda, blasts sent from `send-customer-announce.mjs` as scheduled tasks, the landing site deployed by hand. The result is a split brain: the dashboard claims to be the marketing home but reflects none of the activity, and the one thing a SYSADMIN most wants to do from here — reach the audience with a message — isn't possible in-app at all.

Two gaps follow. First, **visibility**: there's no rollup tying audience size, funnel state, and campaign/asset/post counts into one read, so "where do we stand" means running ad-hoc SQL and `.mjs` scripts. Second, **reach**: sending a newsletter today means hand-editing a Lambda and a Windows task — fine for a one-off blast, untenable as a repeatable habit. The machinery to close both already exists: `marketingcontacts` lives in the same Postgres the app queries, and the SES/Lambda send path is proven. The gap is purely surfacing it — a read-only aggregate over existing tables, and a compose/send front end over the existing send pipeline.

### Core Design

| Element | Feature A — Marketing Overview | Feature B — Newsletter |
| --- | --- | --- |
| **Primary Actor** | SYSADMIN wanting an at-a-glance read on marketing state | SYSADMIN authoring and sending a newsletter issue |
| **Secondary Actors** | — | AWS SES/Lambda send pipeline (non-human sender); the recipient audience in `marketingcontacts` |
| **Key Value** | One read-only rollup — audience, lead funnel, campaign/asset/post counts, channels/sites — built entirely on the existing Postgres connection | Compose an issue in-app, pick a recipient segment, send via the proven SES path, and track the issue + per-send outcome — turning a hand-edited Lambda blast into a repeatable in-app action |
| **Placement** | Summary card on the main SysAdmin dashboard + first "Overview" tab in the Marketing hub; each stat links into its detail tab | Last tab in the Marketing hub (`Overview · Leads · Campaigns · Assets · Posts · Newsletter`) |
| **Boundary — IN** | Aggregate queries over `marketingcontacts` + the four app marketing tables; a static channels/sites block | New newsletter tables (issues + per-recipient sends); compose UI; recipient segment selection from `marketingcontacts`; background SES send; per-issue send status/counts; minimal unsubscribe; SYSADMIN gating |
| **Boundary — OUT** | DynamoDB engagement/clicks (deferred → "coming soon" placeholder); any write/edit | DynamoDB click/open tracking; drip automation/scheduling; a full subscriber preference center (beyond the single newsletter opt-in added in Amendment A); A/B testing; transactional/system email |

---

## User Scenarios

### US1 — At-a-glance from the main dashboard

A SYSADMIN logs in and lands on the SysAdmin dashboard. A Marketing summary card shows headline numbers — total audience, campaigns sent, leads in funnel — with a "View marketing →" link.

**Expected:** the card renders real numbers from `marketingcontacts` + the marketing tables; the link opens the Marketing hub Overview tab.

### US2 — The full rollup

From the hub's first "Overview" tab, the SYSADMIN sees grouped read-only cards: Audience (total, by signuplist, opt-in vs import, hands-on cohort, dupes/invalids), Lead Funnel (by status/segment), Campaigns, Assets, Posts, and a Channels/Sites block (windev.wxperts.com LIVE, docs count). Clicking a group jumps to its detail tab.

**Expected:** every group shows correct counts; each links into the matching Leads/Campaigns/Assets/Posts tab.

### US3 — A source is unavailable

One aggregate query errors (e.g., a table is empty or a column is missing after a migration lag). The page still renders; the affected card shows "—" instead of failing the whole view.

**Expected:** a failing sub-query degrades that one metric to null/"—"; no 500; the rest of the rollup renders (fail-open).

### US4 — Compose and send an issue

A SYSADMIN writes a newsletter issue (subject + body), selects a recipient segment (e.g. `customer-import`), previews it, and clicks Send. The issue goes out through the SES path to the deduped, valid-email recipients in that segment.

**Expected:** the issue is persisted; recipients are the deduped valid emails for the chosen segment (case-insensitive, invalids excluded — reusing the `send-customer-announce.mjs` selection logic); a send record captures attempted/sent/failed counts.

### US5 — Partial send / invalid addresses

Some addresses in the segment are malformed or fail at the SES call. The send completes for the good ones; the issue records how many succeeded vs failed.

**Expected:** invalids are skipped up front; per-recipient SES failures are counted, not fatal; the issue ends in a `sent` state with accurate sent/failed tallies and is never left half-written.

### US6 — Unsubscribe / compliance

A recipient clicks unsubscribe in the footer. They're removed from future sends.

**Expected:** every issue includes a working unsubscribe path; an unsubscribed contact is excluded from subsequent newsletter recipient selection.

### US7 — Review past issues

The SYSADMIN opens the Newsletter surface and sees prior issues with their date, segment, and sent/failed counts.

**Expected:** issues list in reverse-chronological order with their send outcomes; an issue's detail shows subject/body and the send record.

---

## Functional Requirements

### FR-001 — Overview rollup endpoint

A read-only `GET /api/sysadmin/marketing/overview` MUST return a single aggregate object, behind `authenticateToken` + `requireSysAdmin`.

**Acceptance Criteria**:

- [ ] Endpoint returns one rollup object
- [ ] Non-SYSADMIN gets 403

### FR-002 — Audience metrics

The rollup MUST report `marketingcontacts` audience: total, distinct `lower(email)`, breakdown by `signuplist` (opt-in vs import), the `wantshandson` cohort, and blank/invalid/dupe counts — reusing the `count-check.mjs` / `send-customer-announce.mjs` SQL idioms.

**Acceptance Criteria**:

- [ ] Counts match a direct query (total ≈ 879; ~844 `customer-import`, ~35 `launch-notify`)
- [ ] Invalid/dupe figures use the same case-insensitive + regex rules as the Lambda scripts

### FR-003 — Funnel & module counts

The rollup MUST include lead-funnel counts by `status` and `segment` (`marketingleads`), plus counts for `campaigns` (by status), `marketingassets` (by type/status), and `campaignposts` (by channel/status, with upcoming scheduled).

**Acceptance Criteria**:

- [ ] Each table's counts appear and match direct queries
- [ ] Upcoming scheduled posts are surfaced

### FR-004 — Fail-open aggregation

Each source MUST be computed independently; a failure in one MUST degrade that metric to null without failing the response.

**Acceptance Criteria**:

- [ ] A deliberately broken sub-query yields null for that metric and a 200 overall (no 5xx)

### FR-005 — Dual placement

A summary MUST appear both as a card on the main SysAdmin dashboard (headline numbers + "View marketing →") and as the first "Overview" tab in the Marketing hub, with each group linking to its detail tab.

**Acceptance Criteria**:

- [ ] Dashboard card shows headline numbers and links to the hub
- [ ] Overview tab is first in `MarketingTabs`; each group links into Leads/Campaigns/Assets/Posts

### FR-006 — Channels/sites + deferred engagement

The Overview MUST include a static Channels/Sites block (windev.wxperts.com status, landing-docs count) and a placeholder for engagement/clicks marked deferred.

**Acceptance Criteria**:

- [ ] Channels/sites block renders
- [ ] An "Engagement (coming soon)" placeholder is shown, not a broken DynamoDB call

### FR-007 — Compose & store issues

A SYSADMIN MUST be able to author a newsletter issue (subject + body) and save it as a draft in a new newsletter table before sending.

**Acceptance Criteria**:

- [ ] A draft persists with subject/body and reloads for editing
- [ ] Created/updated and author are tracked

### FR-008 — Recipient segment selection

Before send, the issue MUST target a recipient segment derived from `marketingcontacts`, using deduped, valid-email selection (case-insensitive `distinct on lower(email)`, invalid-regex excluded), with a recipient count shown pre-send.

**Acceptance Criteria**:

- [ ] Selecting a segment shows the deduped valid-recipient count
- [ ] Selection logic matches `send-customer-announce.mjs` (dedupe + invalid exclusion)

### FR-009 — Send via SES

Sending MUST deliver the issue to the selected recipients through the AWS SES path proven by `send-customer-announce.mjs`.

**Acceptance Criteria**:

- [ ] A send reaches the selected recipients via SES
- [ ] Send is SYSADMIN-gated
- [ ] A sent issue cannot be silently re-sent without an explicit action

### FR-010 — Resilient send recording

Each send MUST record attempted/sent/failed counts; per-recipient failures MUST NOT abort the run, and the issue MUST never be left half-written.

**Acceptance Criteria**:

- [ ] An issue with some invalid/failing addresses completes with accurate sent/failed tallies and a terminal `sent` state

### FR-011 — Issue history & detail

The Newsletter surface MUST list prior issues reverse-chronologically with date, segment, and sent/failed counts, and show subject/body + send record on detail.

**Acceptance Criteria**:

- [ ] Issues list with outcomes
- [ ] Detail shows content and the send record

### FR-012 — Unsubscribe / compliance (minimal v1)

Every sent issue MUST include a working unsubscribe path, and unsubscribed contacts MUST be excluded from future newsletter recipient selection.

**Acceptance Criteria**:

- [ ] Each issue carries an unsubscribe mechanism
- [ ] An unsubscribed contact is excluded from subsequent sends

### FR-013 — Role & tenant gating

All newsletter compose/send/list endpoints MUST require SYSADMIN.

**Acceptance Criteria**:

- [ ] Non-SYSADMIN is rejected (403) on every newsletter endpoint

---

## Amendment A (2026-07-08) — Registered-user newsletter audience

The original scope targeted the newsletter at the **marketing audience only** (`marketingcontacts`). This amendment adds **registered app users** (`userprofiles`) as a second, **distinct** audience, gives each user their own opt-in choice, and lets a SYSADMIN send an issue to the marketing audience, the registered-user audience, or **both** (deduped so no one is mailed twice). It does not change any Overview (Feature A) behavior.

**Locked decisions (2026-07-08):**

- **Two categories for registered users.** The registered-user channel is primarily for **product updates & announcements** (release notes, changes) — distinct from **marketing/promotions**. Each user has two independent opt-ins: `updates` and `promos`. A newsletter issue that targets the users audience declares which category it is, and only users opted into that category receive it.
- **Default = opted-in (both categories).** Registered users are subscribed to both categories by default with one-click unsubscribe per category. Modeled as two nullable columns on `userprofiles` — `updatesunsubscribedat` and `promosunsubscribedat` (NULL = subscribed) — symmetric with `marketingcontacts.unsubscribedat`, so every existing user is subscribed with no backfill.
- **Both → dedupe.** When an issue targets both audiences, recipients are merged by `lower(email)`; a person on both lists gets exactly one copy. (The category filter applies to the user side; marketing contacts have no category.)
- **Three preference surfaces:** two toggles on the Settings → Notifications tab, two pre-checked checkboxes at registration, and per-category newsletter footer unsubscribe links — all flip the matching `*unsubscribedat` column.

### FR-014 — Registered-user opt-in state

Each registered user MUST have a newsletter subscription state, defaulting to subscribed, persisted on `userprofiles` (nullable `newsletterunsubscribedat`; NULL = subscribed).

**Acceptance Criteria**:

- [ ] Existing users are treated as subscribed with no data migration/backfill (NULL = subscribed)
- [ ] Toggling the preference sets/clears `newsletterunsubscribedat`

### FR-015 — Preference surfaces

The opt-in MUST be settable from (a) the Settings → Notifications tab (a toggle wired through `PATCH /api/auth/profile`), (b) a pre-checked checkbox in the registration flow, and (c) the footer unsubscribe link of any sent issue.

**Acceptance Criteria**:

- [ ] Notifications tab shows a newsletter toggle reflecting current state and saves it
- [ ] Registration collects a (default-checked) newsletter opt-in and stores it on the new user
- [ ] A registered user's footer unsubscribe sets their `newsletterunsubscribedat`

### FR-016 — Audience selection

Before send, a SYSADMIN MUST choose the issue's audience: **marketing contacts** (with the existing `signuplist` segment picker), **registered users**, or **both**. The chosen audience MUST persist on the issue.

**Acceptance Criteria**:

- [ ] Compose UI offers marketing / users / both; the marketing segment picker applies only when marketing is included
- [ ] The selected audience is stored on the issue (`audience` = `marketing|users|both`)

### FR-017 — Registered-user recipient selection & cross-audience dedupe

Registered-user recipients MUST be the opted-in users (`newsletterunsubscribedat IS NULL`) with a valid, deduped `lower(email)`, excluding disabled/locked accounts. When the audience is **both**, the marketing and user recipient sets MUST be merged by `lower(email)` so each address is sent at most once. The pre-send recipient count MUST reflect the deduped total.

**Acceptance Criteria**:

- [ ] Registered-user selection excludes unsubscribed and disabled/locked accounts and applies the same invalid-email + case-insensitive dedupe rules as the marketing path
- [ ] "Both" yields a union deduped by `lower(email)`; a shared address appears once with an accurate count
- [ ] The pre-send count shown matches the actual number sent

### FR-018 — Per-recipient log across audiences

Each `newslettersends` row MUST identify which audience/recipient it came from (nullable `userid` FK → `userprofiles` alongside the existing nullable `contactid` FK → `marketingcontacts`), while attempted/sent/failed tallies and resilient background send (FR-010) behave identically regardless of audience.

**Acceptance Criteria**:

- [ ] A send to registered users records rows with `userid` set (and `contactid` null), and vice-versa
- [ ] Tallies and terminal `sent` state work identically for user, marketing, and both

### FR-019 — Registered-user unsubscribe path

Issues sent to registered users MUST include a working unsubscribe link that flips `userprofiles.newsletterunsubscribedat`; the link MUST be HMAC-signed and distinguish a user recipient from a marketing contact so the correct table/row is updated. Unsubscribed users MUST be excluded from subsequent registered-user selection.

**Acceptance Criteria**:

- [ ] A user-recipient unsubscribe link updates `userprofiles`, not `marketingcontacts` (type-tagged, HMAC-verified)
- [ ] An unsubscribed user drops out of future registered-user sends

---

## Technical Sections

### Send-trigger decision (locked)

**Server-side SES, run as a background job** — not inline in the HTTP request. The server already uses the AWS SDK (`@aws-sdk/client-s3` for presigning), so adding `@aws-sdk/client-ses` is consistent and avoids Lambda-invoke plumbing; the recipient SQL + SES loop from `send-customer-announce.mjs` ports straight into a server service. A ~844-recipient blast can't run inside one request (timeout + SES throttle), so `POST …/send` marks the issue `sending`, returns immediately, and a background worker processes recipients and updates counts. **Verify at implement:** SES production access (out of sandbox) for the send identity — windev already sends, so likely already granted.

### Data / Schema

New tables (UUID v7, applied via the established `pg.Client` + transaction migration pattern — *not* drizzle-kit push, which needs a TTY here):

- `src/db/schema/newsletterissues.ts` — `newsletterissues`: `id` (PK), `subject`, `body` (text), `segment` (varchar — the targeted `signuplist`), `status` (`draft|sending|sent|failed`), `recipientcount`, `sentcount`, `failedcount`, `createdbyid` (FK → userprofiles, set null), `createdat`/`updatedat`, `sentat`.
- `src/db/schema/newslettersends.ts` — `newslettersends` (per-recipient log): `id` (PK), `issueid` (FK → newsletterissues, cascade), `contactid` (FK → marketingcontacts), `email`, `status` (`pending|sent|failed`), `error` (text), `sentat`. Enables accurate tallies, retry, and audit.
- **Unsubscribe:** add an `unsubscribedat` (timestamptz, null) column to `marketingcontacts`; recipient selection excludes non-null. (Alternative deferred to spec sizing — a separate `newsletterunsubscribes` table keyed on `lower(email)` if touching the legacy table is undesirable.)

### Server (`src/server/routes`)

Routes mounted via the real `index.ts → app.ts` chain (`index2.ts` is dead code — routes mounted there 404 in prod). All DB access via `src/db/client.ts` (postgres-js), never `lib/db.ts`.

- **Overview:** `GET /api/sysadmin/marketing/overview` added to `marketingAdmin.ts`; new `src/server/services/SysAdminMarketingOverviewService.ts` (`getMarketingOverview()`, per-source try/catch → fail-open).
- **Newsletter:** new `src/server/routes/newsletter.ts` mounted at `/api/sysadmin/marketing/newsletter` (behind `authenticateToken` + `requireSysAdmin`): `GET /issues`, `POST /issues`, `GET /issues/:id`, `PATCH /issues/:id`, `GET /issues/:id/recipients?segment=` (preview count), `POST /issues/:id/send` (async trigger).
- **Send service:** `src/server/services/NewsletterSendService.ts` — ports the deduped/valid recipient SQL from `send-customer-announce.mjs`, runs the SES loop in the background, writes `newslettersends` + rolls counts onto the issue. New `src/server/lib/ses.ts` wraps `@aws-sdk/client-ses` (mirrors `src/server/lib/marketing-assets-s3.ts` config style; region + verified From from env).
- **Public unsubscribe:** `GET /api/marketing/newsletter/unsubscribe?u=<contactid>&sig=<hmac>` — unauthenticated (like the public `/api/marketing/leads` route), verifies an HMAC over the contact id, sets `unsubscribedat`. No token column needed.

### Client

- **Overview:** new `src/client/pages/SysAdmin/marketing/Overview.tsx`; `MarketingTabs.tsx` gains **Overview** as the first tab; route added in `App.tsx`; summary card added to the Overview tab of `SysAdminDashboard.tsx` (existing `fetch(..., { credentials: "include" })` + `useState` pattern — no TanStack Query in this dashboard).
- **Newsletter:** new `src/client/pages/SysAdmin/marketing/Newsletter.tsx` (issue list + compose editor + recipient-segment picker with live count + Send + per-issue send record); added as the **last** tab in `MarketingTabs.tsx`.

### Environment / Infra

- New env vars: `NEWSLETTER_FROM` (SES-verified sender), `NEWSLETTER_UNSUBSCRIBE_SECRET` (HMAC); reuse `MARKETING_ASSETS_REGION` / `AWS_REGION`.
- App Runner instance role needs `ses:SendEmail` added (today it only grants S3 presign) — an infra step for implement, set in the AWS console (App Runner is `ConfigurationSource: API`).

### Conventions

Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`), Pino-only; fences written by the orchestrator at `implement`.

### Amendment A — implementation deltas (registered-user audience)

Builds on the already-implemented Newsletter (`src/db/schema/newsletterissues.ts`, `newslettersends.ts`, `src/server/routes/newsletter.ts`, `src/server/services/NewsletterSendService.ts`, `src/server/lib/newsletter-unsubscribe.ts`, `src/client/pages/SysAdmin/marketing/Newsletter.tsx`). New migration under `src/db/migrations/` via the established `pg.Client` + transaction pattern (not drizzle-kit push).

- **Schema.** Add `userprofiles.newsletterunsubscribedat` (timestamptz, null = subscribed). Add `newsletterissues.audience` (varchar `marketing|users|both`, default `marketing`) — keep `segment` for the marketing signuplist, applied only when audience includes marketing. Add `newslettersends.userid` (FK → `userprofiles`, set null, nullable) and make `contactid` nullable so a send row belongs to exactly one recipient type.
- **Send service (`NewsletterSendService`).** Add a registered-user recipient query (opted-in, valid, deduped `lower(email)`, exclude disabled/locked); branch recipient assembly on `issue.audience`; when `both`, union + dedupe by `lower(email)`. Per-recipient log writes `userid` or `contactid` accordingly. Background send / throttle / tally logic unchanged.
- **Newsletter route/UI.** `POST/PATCH /issues` accept `audience`; `GET /issues/:id/recipients` returns the deduped count for the chosen audience(s). Compose UI (`Newsletter.tsx`) gains an audience selector (marketing / users / both) with the segment picker shown only for marketing.
- **User preference surfaces.** `PATCH /api/auth/profile` accepts `newslettersubscribed` (boolean → sets/clears `newsletterunsubscribedat`); `RegistrationService`/`auth.ts` accept an opt-in at signup; `SettingsPage.tsx` Notifications tab gains the toggle; the registration form gains a default-checked checkbox.
- **Unsubscribe.** Extend `newsletter-unsubscribe.ts` links with a recipient-type tag (`t=user|contact`) in the HMAC payload; `GET /api/marketing/newsletter/unsubscribe` updates `userprofiles` or `marketingcontacts` per type. No new env vars or IAM beyond SCOPE-064's original `ses:SendEmail`.

---

## Success Criteria

1. **Marketing state is visible at a glance.** A SYSADMIN sees a summary card on the main dashboard and a full Overview tab in the hub, both showing real numbers from the app's own Postgres. *(FR-001/005)*
2. **The audience is real and accurate.** Audience metrics match a direct query of `marketingcontacts` (≈879 total; ~844 import / ~35 opt-in), using the same dedupe/invalid rules as the Lambda scripts. *(FR-002)*
3. **The whole funnel rolls up.** Lead, campaign, asset, and post counts all surface and link into their detail tabs. *(FR-003)*
4. **One bad source never breaks the page.** A failing sub-query degrades to "—" with a 200; the rest renders. *(FR-004)*
5. **A newsletter can be composed and sent in-app.** A SYSADMIN authors an issue, picks a segment, sees the deduped recipient count, and sends via SES. *(FR-007/008/009)*
6. **Sends are resilient and recorded.** Partial failures don't abort the run; the issue ends with accurate sent/failed tallies and a terminal state. *(FR-010)*
7. **Issues are auditable.** Past issues list with outcomes; detail shows content + send record. *(FR-011)*
8. **Compliant by default.** Every issue carries a working unsubscribe; unsubscribed contacts drop out of future sends. *(FR-012)*
9. **Locked down.** Every overview/newsletter endpoint requires SYSADMIN. *(FR-001/013)*

---

## Constraints & Notes

### Constraints

- **Reuse, don't reinvent.** Overview is aggregate SQL over existing tables on the existing pool; Newsletter ports the proven recipient SQL + SES loop from `send-customer-announce.mjs`. Net-new = one overview service/route, two newsletter tables + an `unsubscribedat` column, the newsletter routes + send service + `ses.ts`, and the Overview/Newsletter UI.
- **Read-only Overview.** Feature A never writes; no DynamoDB call in v1 (engagement is a "coming soon" placeholder).
- **Background send.** Sends run as a background job (issue → `sending` → `sent`), never inline in the request; SES throttling respected.
- **Correct plumbing.** Routes via `index.ts → app.ts` (not dead `index2.ts`); DB via `src/db/client.ts`; 100% TypeScript, Pino-only.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`; fences written by the orchestrator only.

### Out of Scope (v1 / later)

- **DynamoDB engagement/click & open tracking** — deferred; placeholder only.
- **Drip automation, scheduled sequences, A/B testing.**
- **Subscriber self-service preference center** beyond the single newsletter opt-in toggle (Amendment A) + unsubscribe + `signuplist`.
- **Transactional/system email** — the Newsletter still carries no transactional/system mail. Per Amendment A its *audience* now includes opted-in registered app users alongside the marketing audience, but the content is marketing-only.

### Dependencies

- SPEC-046 (`marketingleads`, hub, `marketingAdmin.ts`, `requireSysAdmin`); SPEC-048 (`campaigns` / `marketingassets` / `campaignposts`, `MarketingTabs.tsx`); `marketingcontacts` (same Postgres); the SES/Lambda send path (`marketing/site/deploy/lambda/send-customer-announce.mjs`); App Runner instance-role IAM (add `ses:SendEmail`).

### Notes

- **Likely fan-out (decided at `createSpecs`):** 2 implementation specs — (A) Marketing Overview rollup; (B) Newsletter compose+send. Folders take the next global SPEC numbers, not 064.
- **Open items deferred to spec sizing:** `marketingcontacts.unsubscribedat` column vs a separate `newsletterunsubscribes` table; confirming SES production-access for the send identity; newsletter body format (plain/markdown vs an HTML template like `customer-announce-email.mjs`).
- **Process note:** authored in-conversation via interactive buildscope (section-by-section), the standing workaround while the orchestrator `buildscope` CLI is broken; implementation routes through `createSpecs` → `implement` per orchestrator-first.
