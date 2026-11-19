# Spec 064: Marketing Dashboard — Overview Rollup & Newsletter

## Overview

Two features that make the sysadmin Marketing hub reflect reality and gain its first outbound action. **(A) Marketing Overview** — a read-only rollup of the marketing work done so far, surfaced both as a summary card on the main SysAdmin dashboard and as a first "Overview" tab in the `/sysadmin/marketing` hub, aggregating audience, lead funnel, and campaign/asset/post counts from the app's own Postgres (no new infra). **(B) Newsletter** — a compose-and-send capability: a SYSADMIN authors a newsletter issue in-app, picks a recipient segment from `marketingcontacts`, and sends it through the proven AWS SES path as a background job, with issues and per-recipient send results tracked in new newsletter tables.

This is the single implementation spec for **SCOPE-064**, organized into two phases: **A** (Marketing Overview — read-only aggregate + UI) and **B** (Newsletter — schema, SES send service, routes, unsubscribe, UI). It builds directly on SPEC-046 (`marketingleads`, the hub, `marketingAdmin.ts`, `requireSysAdmin`) and SPEC-048 (`campaigns`/`marketingassets`/`campaignposts`, `MarketingTabs`), the `marketingcontacts` table (same app Postgres), and the proven send path in `marketing/site/deploy/lambda/send-customer-announce.mjs`. Full reviewed scope: `specs/Project-Scope/064-marketing-dashboard.md`.

## Business Problem

The marketing module was built before there was any marketing to show, so it shipped as empty CRUD surfaces while the real work happened outside the app — contacts imported via Lambda, blasts sent from `send-customer-announce.mjs` as scheduled tasks, the landing site deployed by hand. The dashboard claims to be the marketing home but reflects none of the activity, and the one thing a SYSADMIN most wants to do from here — reach the audience with a message — isn't possible in-app at all. Two gaps follow: **visibility** (no rollup tying audience, funnel, and counts into one read) and **reach** (sending a newsletter means hand-editing a Lambda + a Windows task). The machinery to close both already exists — `marketingcontacts` is in the same Postgres the app queries, and the SES send path is proven — so the work is purely surfacing it: a read-only aggregate over existing tables, and a compose/send front end over the existing send pipeline.

## Actors

- Primary (A): the SYSADMIN wanting an at-a-glance read on marketing state.
- Primary (B): the SYSADMIN authoring and sending a newsletter issue.
- Secondary: the AWS SES send pipeline (non-human sender); the recipient audience in `marketingcontacts`; an unsubscribing recipient (public, unauthenticated).

## Success Metrics

1. **Marketing state is visible at a glance:** a summary card on the main dashboard and a full Overview tab in the hub both show real numbers from the app's own Postgres. *(FR-001/005)*
2. **The audience is real and accurate:** audience metrics match a direct query of `marketingcontacts` (≈879 total; ~844 import / ~35 opt-in), using the same dedupe/invalid rules as the Lambda scripts. *(FR-002)*
3. **One bad source never breaks the page:** a failing sub-query degrades to "—" with a 200; the rest renders. *(FR-004)*
4. **A newsletter can be composed and sent in-app:** a SYSADMIN authors an issue, picks a segment, sees the deduped recipient count, and sends via SES; partial failures don't abort the run and the issue ends with accurate tallies. *(FR-007/008/009/010)*
5. **Compliant + locked down:** every issue carries a working unsubscribe and excludes unsubscribed contacts; every overview/newsletter endpoint requires SYSADMIN. *(FR-012/013)*

## Scope Boundary

IN: a read-only `GET /api/sysadmin/marketing/overview` aggregating `marketingcontacts` + the four app marketing tables (fail-open per source) with a static channels/sites block; a summary card on `SysAdminDashboard.tsx` + a first "Overview" tab in `MarketingTabs`; new `newsletterissues` + `newslettersends` tables + a `marketingcontacts.unsubscribedat` column; newsletter compose/list/detail/recipient-preview/send routes (SYSADMIN-gated); a server-side SES send run as a background job (porting the recipient dedupe/invalid SQL from `send-customer-announce.mjs`); a public HMAC unsubscribe route; a Newsletter tab in the hub.

## Out of Scope

DynamoDB engagement/click & open tracking (deferred — the Overview shows an "Engagement (coming soon)" placeholder, not a broken call); drip automation, scheduled sequences, and A/B testing; a subscriber self-service preference center beyond unsubscribe + `signuplist`; transactional/system email (the Newsletter targets the marketing audience only); any write/edit on the Overview (it is strictly read-only).

## Open Questions

- `marketingcontacts.unsubscribedat` column vs a separate `newsletterunsubscribes` table keyed on `lower(email)` — sized in Phase B (default: the column).
- Confirm SES production-access (out of sandbox) for the send identity — verified at Phase B implement; windev already sends.
- Newsletter body format: plain/markdown vs an HTML template like `customer-announce-email.mjs` — sized in Phase B (default: stored markdown/text, wrapped in a minimal HTML shell with the unsubscribe footer on send).

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

A SYSADMIN MUST be able to author a newsletter issue (subject + body) and save it as a draft in `newsletterissues` before sending.

**Acceptance Criteria**:
- [ ] A draft persists with subject/body and reloads for editing
- [ ] Created/updated and author are tracked

### FR-008 — Recipient segment selection

Before send, the issue MUST target a recipient segment derived from `marketingcontacts`, using deduped, valid-email selection (case-insensitive `distinct on lower(email)`, invalid-regex excluded, unsubscribed excluded), with a recipient count shown pre-send.

**Acceptance Criteria**:
- [ ] Selecting a segment shows the deduped valid-recipient count
- [ ] Selection logic matches `send-customer-announce.mjs` (dedupe + invalid exclusion) and excludes `unsubscribedat IS NOT NULL`

### FR-009 — Send via SES

Sending MUST deliver the issue to the selected recipients through the AWS SES path proven by `send-customer-announce.mjs`, run server-side as a background job.

**Acceptance Criteria**:
- [ ] `POST …/send` marks the issue `sending`, returns immediately, and a background worker delivers via SES
- [ ] Send is SYSADMIN-gated
- [ ] A sent issue cannot be silently re-sent without an explicit action

### FR-010 — Resilient send recording

Each send MUST write `newslettersends` per recipient and record attempted/sent/failed counts on the issue; per-recipient failures MUST NOT abort the run, and the issue MUST never be left half-written.

**Acceptance Criteria**:
- [ ] An issue with some invalid/failing addresses completes with accurate sent/failed tallies and a terminal `sent` state
- [ ] Each recipient has a `newslettersends` row with `sent|failed` + any error

### FR-011 — Issue history & detail

The Newsletter surface MUST list prior issues reverse-chronologically with date, segment, and sent/failed counts, and show subject/body + send record on detail.

**Acceptance Criteria**:
- [ ] Issues list with outcomes
- [ ] Detail shows content and the send record

### FR-012 — Unsubscribe / compliance (minimal v1)

Every sent issue MUST include a working unsubscribe path (a public HMAC-verified link), and unsubscribed contacts MUST be excluded from future newsletter recipient selection.

**Acceptance Criteria**:
- [ ] Each issue carries an unsubscribe link verified by HMAC over the contact id
- [ ] Hitting the link sets `unsubscribedat`; the contact is excluded from subsequent sends

### FR-013 — Role & tenant gating

All overview + newsletter compose/send/list endpoints MUST require SYSADMIN; only the public unsubscribe route is unauthenticated.

**Acceptance Criteria**:
- [ ] Non-SYSADMIN is rejected (403) on every overview/newsletter endpoint
- [ ] The unsubscribe route works unauthenticated but only via a valid HMAC link

### FR-014 — "Hands-on" recipient list (virtual segment) (2026-07-22)

The Newsletter recipient picker MUST offer a **"Hands-on"** list in addition to the raw `signuplist` values. Selecting it targets every marketing contact who asked for hands-on help — `marketingcontacts.wantshandson = true` — rather than a `signuplist` match.

**Design:** "Hands-on" is a **virtual segment**, not a `signuplist` value. `wantshandson` is an orthogonal boolean cohort (99 contacts today, all in `launch-notify`), so it cannot be expressed as a `signuplist` string. A single reserved segment sentinel (`hands-on`) is recognized in the recipient-resolution layer (`getRecipients` / `countRecipients` in `NewsletterSendService`) and switches the `WHERE signuplist = $segment` clause to `WHERE wantshandson = true`. All other filters (valid email, `unsubscribedat IS NULL`, case-insensitive dedupe) are unchanged, so the preview count and the actual send stay identical. The sentinel + label live in a shared module (`src/shared/newsletter-segments.ts`) so the client picker and server resolver cannot drift.

**Acceptance Criteria**:
- [ ] The segment picker lists "Hands-on" alongside the existing signuplist options, with a hint that it targets `wantshandson = true` contacts.
- [ ] Selecting "Hands-on" makes the recipient preview count equal the count of emailable, non-unsubscribed `wantshandson = true` contacts, and a send reaches exactly that deduped set.
- [ ] The virtual sentinel never collides with a real `signuplist` value; a raw `signuplist` send is unaffected.
- [ ] `wantshandson` contacts who have unsubscribed are still excluded (same `unsubscribedat IS NULL` rule).
