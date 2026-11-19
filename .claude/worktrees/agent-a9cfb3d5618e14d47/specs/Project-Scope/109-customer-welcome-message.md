# SCOPE-109: Customer Welcome Message

**Scope Number**: SCOPE-109
**Status**: `draft`
**Created**: 2026-07-22
**Last Reviewed**: 2026-07-22 (interactive buildscope — section-by-section, approved through all six sections by the project owner)
**Depends On**: SCOPE-064 (the newsletter compose/review/send architecture, its SES sender + configuration, and the per-recipient send-record pattern this mirrors and extends); the existing subscription-activation path and invitation-acceptance flow (the two once-only hook points this attaches to, neither of which sends any email today); SCOPE-079 / SCOPE-102 (the YappChatt integrations that give the join link its destination); SCOPE-070 (tracked-link + redirect infrastructure, needed only if the tracked-link open question resolves toward tracking).
**Related Scopes**: SCOPE-045 declares marketing automation and drip sequences out of scope; this scope is a deliberate, narrow exception (two triggered sends of one static message, with no sequencing, branching, or scheduling). SCOPE-014 carries a one-line "welcome series" aspiration with no design; this scope supersedes that line. SCOPE-065 (marketing AI assist) is reusable for composing the copy but is not required.
**Source**: `specs/Project-Scope/109-customer-welcome-message.md`

---

## Overview

A single, static welcome message that the business writes once and the system sends automatically at the two moments a person becomes a customer: when a subscription goes active, and when someone accepts an invitation and joins a company. The message is authored and reviewed in the SysAdmin marketing area using the same compose-review-test-send rhythm as the newsletter, so there is nothing new to learn — draft it, preview it, send a test to yourself, then make it live.

The message carries a join link to YappChatt. That link is stored as real data with a capacity: a total number of uses that is decremented every time a welcome goes out, a visible count of how many remain, and a warning once fewer than ten are left, so the link is never handed out past what it can hold.

Every send is recorded against the individual recipient, and a person can be welcomed only once. That record is what makes the message safe to run automatically and what makes it possible to catch up the customers who exist today: a one-time backfill sends the same message to the registered users of existing companies and marks each as welcomed, so nobody is missed and nobody is mailed twice — including on a re-run.

The existing marketing-list welcome that fires from the signup Lambda is untouched; it serves a different audience and stays exactly as it is.

## Business Problem

Nothing welcomes a customer at the moment they actually become one. When a subscription goes active, and when a person is added to a company and accepts their invitation, the system sends them nothing. Both moments already exist as clean, once-only events in the code and both pass silently. The only welcome email that exists today serves a different audience entirely — people who filled in the marketing form on windev.wxperts.com and are on a notification list, not customers. So the people who have actually paid, or who have just joined a paying team, get less of a greeting than someone who typed their email into a landing page.

That silence costs three things. First, orientation: a new customer or team member gets no starting point, no "here's what to do first," at precisely the moment they are most willing to act. Second, the community connection: the one thing the message most needs to carry is a way into YappChatt, and that route does not exist as data anywhere — the room is a value in a per-project environment file, so there is no link to hand out, no way to see how much of its capacity has been consumed, and no warning before it runs out. A link could be given to more people than it can hold, and the first sign of trouble would be a customer who cannot get in. Third, and most limiting today: there is no record of who has been welcomed. Sends are not tracked per person, so existing customers cannot be safely caught up — a backfill would either skip people or mail them twice, with no way to tell which.

The result is that the most valuable audience the business has is the least communicated with, and the gap cannot be closed safely because nothing remembers who has already been reached.

## Actors

- **Primary:** SysAdmin — writes and reviews the welcome message, sets the YappChatt link and its capacity, sends the test to themselves, triggers the one-time backfill, and is the person warned when the link is running low.
- **Secondary:** The **new subscriber** and the **newly-added company user** — the recipients, who take no action. The **subscription-activation path** and the **invitation-acceptance path** — the two existing once-only events that fire the send. The **SES sender** that delivers it. The **redirect/click-tracking service**, if the join link is issued as a tracked link.

## Scope Boundary

IN: One editable, static welcome message stored as a standing record with a draft-and-live state, authored in the SysAdmin marketing area mirroring the newsletter's compose-review pattern. Automatic send on subscription activation and on invitation acceptance, using the two existing once-only hook points. A stored YappChatt join link with a configured total capacity, a remaining count decremented per send, and a low-balance warning below ten. Test send to the review inbox. A one-time backfill to registered users of existing companies. Per-recipient send records with a hard once-per-person guarantee shared by the triggers and the backfill. Visibility of who has been welcomed and how many remain.

OUT: Drip sequences, multi-step onboarding journeys, or any general marketing-automation engine — SCOPE-045 rules these out and this scope does not reopen them. AI-generated or per-recipient personalised copy; the message is static beyond basic name substitution. Changing, retiring, or consolidating the existing signup-Lambda welcome. Welcoming the marketing-contacts list. Provisioning or managing YappChatt rooms themselves — the link is stored, not created. Redesigning unsubscribe or consent handling. Retrofitting the unused dead welcome code paths beyond deciding their fate.

---

## User Scenarios

### US1 — Author and make the welcome message live (happy path)

**Actor:** SysAdmin

1. Opens the Welcome Message area in SysAdmin marketing. It shows the single standing message, in draft.
2. Writes the subject and body, using the same editor and preview toggle as the newsletter so what is shown is what recipients receive.
3. Pastes the YappChatt join link and sets its total capacity — the number of people who can use it.
4. Clicks **Send test to me**; the message arrives at the review inbox with a clear test marker and does not consume link capacity or create a send record.
5. Reviews it, adjusts, and sets the message **live**.

**Expected outcome:** One live welcome message exists. From this point the two triggers send it automatically. The remaining-capacity count is displayed and unchanged, because tests do not consume it.

### US2 — A new subscription activates

**Actor:** New subscriber (passive)

1. A customer completes payment and their subscription flips to active.
2. The system sends the live welcome message to that customer, once.
3. A send record is written against them, and the link's remaining count drops by one.

**Expected outcome:** The customer is welcomed within the normal delivery window. A repeat or replayed activation event does not send a second copy. If no message is live, or capacity is exhausted, nothing is sent and the activation itself is never disrupted.

### US3 — A person is added to a company

**Actor:** Newly-added company user (passive)

1. An admin invites someone; the person accepts and their account is created on the company.
2. The system sends the same live welcome message, once, with a send record and a capacity decrement.

**Expected outcome:** The new team member is welcomed on joining. Someone who has already been welcomed — for instance an existing customer joining a second company — is **not** welcomed again.

### US4 — Catch up existing customers (one-time backfill)

**Actor:** SysAdmin

1. Opens the Welcome Message area and sees how many registered users of existing companies have **not yet** been welcomed.
2. Reviews that count, then starts the backfill.
3. The system sends to exactly those people, writing a send record for each and decrementing capacity per send, with progress visible as it runs.

**Expected outcome:** Every existing customer has been welcomed exactly once. Running the backfill a second time sends to nobody, because everyone already carries a record. If capacity would be exceeded partway, the run stops cleanly and reports how many were sent and how many remain unsent.

### US5 — The join link runs low

**Actor:** SysAdmin

1. Sends accumulate and the link's remaining count falls below ten.
2. The Welcome Message area shows a clear low-balance warning with the number remaining, and the SysAdmin is notified rather than having to go looking.
3. They either raise the capacity or replace the link with a new one and a fresh total.

**Expected outcome:** The business is warned before the link is exhausted. If it does reach zero, sends stop rather than issuing a link that cannot be used, and the reason is visible.

---

## Functional Requirements

### FR-001 — A single standing welcome message

The system MUST hold exactly one welcome message as a persistent record with a draft-and-live state, rather than a per-send issue. Editing is allowed while in draft; making it live is the explicit publish action that arms the triggers.

**Acceptance Criteria**:

- [ ] Exactly one welcome message record exists; the area never presents a list to choose from
- [ ] The record carries subject, body, state (`draft` / `live`), and last-updated stamp
- [ ] Triggers send nothing while the message is in draft
- [ ] Editing a live message returns it to draft, or requires an explicit re-publish, so a half-edited message is never sent

### FR-002 — Authoring surface mirroring the newsletter

The message MUST be authored in the SysAdmin marketing area using the same compose-and-review pattern as the newsletter, including the edit/preview toggle that shows exactly what recipients receive.

**Acceptance Criteria**:

- [ ] Reachable as its own tab alongside Newsletter, SYSADMIN-gated like every other marketing endpoint
- [ ] Edit ⇄ Preview toggle renders the true recipient view
- [ ] Body supports the same formatting handling as newsletter bodies, so plain text renders with its line breaks intact

### FR-003 — Test send

The SysAdmin MUST be able to send a test copy to the review inbox without side effects.

**Acceptance Criteria**:

- [ ] A test send delivers the current draft with a clear test marker in the subject
- [ ] A test consumes **no** link capacity and writes **no** send record
- [ ] A test can be sent whether the message is draft or live

### FR-004 — YappChatt join link with finite capacity

The message MUST carry a stored YappChatt join link with a configured total capacity, a remaining count decremented once per delivered welcome, and a low-balance warning when fewer than ten remain.

**Acceptance Criteria**:

- [ ] The link and its total capacity are set in the authoring surface and persisted
- [ ] Remaining count is shown at all times and decreases by exactly one per welcome actually sent
- [ ] Below ten remaining, a clear warning is surfaced to the SysAdmin, not merely a colour change
- [ ] The capacity can be raised, or the link replaced with a new one and a fresh total, without losing the send history
- [ ] Test sends never decrement it

### FR-005 — Automatic send on subscription activation

When a subscription becomes active, the live welcome message MUST be sent to that customer exactly once, without disrupting the activation.

**Acceptance Criteria**:

- [ ] Fires on the existing once-only activation transition, so a replayed billing event cannot re-send
- [ ] A failure to send never fails or delays the activation itself
- [ ] Send failures are recorded and visible, not silently swallowed

### FR-006 — Automatic send on a user joining a company

When an invited person accepts and their account is created on a company, the live welcome message MUST be sent to them exactly once.

**Acceptance Criteria**:

- [ ] Fires at the point the user record is created on acceptance
- [ ] A failure to send never blocks the person from joining
- [ ] A person already welcomed — including one joining a second company — is not welcomed again

### FR-007 — Once per person, guaranteed — but a failure must stay retryable

The system MUST guarantee at the data layer that any individual receives the welcome **successfully** at most once, across both triggers and the backfill — while still allowing a person whose send *failed* to be retried. Because the chosen sender is direct SES with no queue-level retry (see Clarifications), a failed send is a dead end unless the constraint deliberately permits a second attempt.

**Acceptance Criteria**:

- [ ] A hard uniqueness constraint prevents a second **successful** welcome for the same person; query-time filtering alone is insufficient
- [ ] The constraint is scoped to successful sends only, so a `failed` record does **not** permanently bar that person from ever being welcomed
- [ ] Matching is case-insensitive on email so the same address in different casing is one person
- [ ] A concurrent trigger and backfill cannot both successfully send to the same person
- [ ] Retrying a previously failed recipient succeeds and leaves exactly one successful record

### FR-011 — Retry failed sends

Because direct SES offers no automatic retry, the SysAdmin MUST be able to re-attempt delivery to recipients whose welcome failed, without touching anyone already welcomed successfully.

**Acceptance Criteria**:

- [ ] Failed recipients are listed with their error and are individually or collectively retryable
- [ ] A retry targets only `failed` records and never re-sends to a successful one
- [ ] A successful retry consumes exactly one link capacity; a failed attempt consumes none
- [ ] Retrying when capacity is exhausted is refused with the reason shown (FR-009)

### FR-008 — One-time backfill to existing customers

The SysAdmin MUST be able to send the welcome to registered users of existing companies who have not yet been welcomed, marking each as sent.

**Acceptance Criteria**:

- [ ] The eligible (not-yet-welcomed) count is shown before starting
- [ ] The run sends only to eligible people and writes a record per person
- [ ] Re-running sends to nobody
- [ ] Progress and a final sent/failed tally are visible, and per-recipient failures do not abort the run
- [ ] The run respects existing opt-out rules and excludes disabled accounts
- [ ] Only users on companies with an **active** subscription are eligible; users on `PENDING` (unpaid) companies are excluded, which also keeps deliberate test accounts out of a real send
- [ ] Recipients are deduped case-insensitively on email, so one person on two companies is welcomed once

### FR-009 — Behaviour at exhausted capacity

When remaining capacity reaches zero, the system MUST stop sending rather than deliver a welcome carrying an unusable join link, and MUST make the reason visible.

**Acceptance Criteria**:

- [ ] At zero remaining, triggered sends do not go out and the reason is recorded
- [ ] A backfill that would exceed capacity stops cleanly and reports sent versus unsent
- [ ] The blocked state is clearly surfaced in the authoring surface
- [ ] Nothing about a blocked welcome disrupts activation or invitation acceptance

### FR-010 — Visibility of who has been welcomed

The SysAdmin MUST be able to see the welcome's reach: how many have been sent, how many remain eligible, and the per-recipient outcome.

**Acceptance Criteria**:

- [ ] Totals for sent, failed, and still-eligible are shown
- [ ] A per-recipient record with outcome, any error, and timestamp is retrievable
- [ ] Remaining link capacity is shown alongside these totals

---

## Technical Sections

### Data / Schema

Two new tables, following the project's naming rules (lowercase, concatenated, no underscores, UUID v7 keys).

**`welcomemessages`** — the single standing record from FR-001. Holds `subject`, `body`, `status` (`draft` / `live`), the YappChatt `joinlink`, `linkcapacity` (the configured total) and `linkconsumed` (incremented per delivered welcome), plus `publishedat`, `updatedat`, and `updatedbyid`. Remaining capacity is `linkcapacity - linkconsumed`. Replacing the link sets a new total and resets consumed, leaving send history intact.

**`welcomesends`** — one row per recipient: `welcomemessageid`, `userid`, `email`, `status` (`sent` / `failed`), `error`, `trigger` (`subscription` / `invitation` / `backfill`), `sentat`. The once-per-person guarantee from FR-007 is a **partial unique index on `lower(email)` where `status = 'sent'`** — not per message and not query-time filtering, so concurrent triggers and a running backfill cannot both slip a successful send through. Scoping the index to successful sends is deliberate: a `failed` row must be able to sit alongside a later successful one, otherwise a single transient SES failure would bar that person from ever being welcomed (FR-011).

### Shared model

Capacity enforcement and the once-only guarantee are the same primitive used twice, and both borrow the newsletter's proven atomic-claim trick: a **conditional UPDATE** that only succeeds when there is room (`linkconsumed < linkcapacity`), performed in the same transaction as the `welcomesends` insert. If either the partial unique index or the capacity condition rejects, no email is sent. This makes FR-007 and FR-009 correct under concurrency without any locking of our own.

Capacity is consumed by **successful delivery only**. Since the record is written before SES confirms, a failed attempt must release the capacity it provisionally claimed, or a run of failures would silently drain the link (FR-011).

### Server

A `WelcomeMessageService` owns the standing record, the publish action, the test send, and a single `sendWelcomeTo(person, trigger)` entry point shared by both triggers and the backfill — so there is exactly one implementation of "welcome this person," and the dedupe and capacity rules cannot diverge between paths.

Routes live at `/api/sysadmin/marketing/welcome`, SYSADMIN-gated exactly as `newsletter.ts` is, covering read/update, publish, test send, eligible-count, backfill start, and progress.

The two triggers attach at the existing once-only points identified in the reuse pass: the subscription activation transition in `StripeWebhookHandler`, and the post-acceptance user creation in `InvitationService`. Both call the service **fire-and-forget**, wrapped so a send failure can never fail or delay an activation or a person joining (FR-005, FR-006).

The backfill mirrors `NewsletterSendService.startSend`: an atomic status claim, a throttled loop, a per-recipient record, per-recipient failures that never abort the run, and a terminal tally — plus the capacity stop from FR-009.

Delivery goes through **direct SES** (`src/server/lib/ses.ts`), the same sender the newsletter uses, rather than the BullMQ queue that carries invitations. That keeps one sender across the marketing surface, but it means there is **no queue-level retry or dead-letter safety net**: whatever fails, stays failed until someone acts. FR-011's manual retry and FR-007's partial unique index are the compensating controls, and they are load-bearing rather than nice-to-have — without them a transient SES blip would permanently strand a customer with no way back.

### Client

A new **Welcome** tab beside Newsletter in `MarketingTabs`, at `src/client/pages/SysAdmin/marketing/Welcome.tsx`, modelled directly on `Newsletter.tsx`: the same edit/preview toggle, the same test-send control, the same progress polling while a backfill runs. Added to it are the join-link and capacity fields, the remaining count with the sub-ten warning, the eligible-to-backfill count, and the reach totals from FR-010.

### Reuse map

**Reused as-is:** the SES sender and `NEWSLETTER_FROM` configuration; the newsletter's body-to-email HTML rendering; the test-send-to-review-inbox pattern; the atomic claim and throttled background-send shape; the compose/preview UI; the two idempotent trigger points, which already exist and fire exactly once.

**Extended:** the marketing tab set gains one tab.

**Built new:** the two tables, the capacity primitive with its low-balance warning, the shared `sendWelcomeTo` path, and the hard once-per-person constraint — which the newsletter deliberately does not have.

**Left alone:** the signup-Lambda welcome and the marketing-contacts audience entirely.

---

## Success Criteria

1. **Trigger coverage and exactness** — Over the first 30 days after release, **100%** of subscription activations and invitation acceptances result in exactly one welcome: zero eligible people missed, zero duplicates. Measured by reconciling activation and acceptance events against `welcomesends` rows.

2. **Backfill completeness and safety** — After the one-time run, **100%** of registered users of existing active companies carry exactly one welcome record, and an immediate re-run sends to **zero** people. Measured by the eligible-count reading zero and the second run's tally being empty.

3. **Capacity is never silently exceeded** — In **100%** of cases the SysAdmin is warned while more than zero and fewer than ten uses remain, and **zero** welcomes are delivered carrying a join link beyond its capacity. Measured by `linkconsumed` never exceeding `linkcapacity` and by a warning event preceding every exhaustion.

## Clarifications

Decisions taken during this interactive buildscope session, 2026-07-22:

- **Countdown semantics** — one shared join link with a configured total capacity, decremented per send, warning below ten. Not a pool of unique invite codes.
- **Backfill population** — registered users of existing companies (actual customers), not the marketing-contacts list.
- **Message count** — one shared static message serving both triggers, not separate copy per trigger.
- **Existing Lambda welcome** — left untouched; it serves the marketing list, a different audience.
- **Zero-capacity behaviour** — stop sending rather than deliver an unusable link.
- **Uniqueness granularity** — once per person ever, across both triggers and the backfill, not once per trigger.
- **Editing a live message** — returns it to draft, requiring an explicit re-publish, chosen for safety over convenience.
- **Email sender** — **direct SES**, the same path the newsletter uses, rather than the BullMQ queue used by invitations. Chosen for consistency with the surface this mirrors and fewer moving parts. The consequence is accepted deliberately: SES-direct has **no automatic retry or dead-letter handling**, so a transient failure would otherwise strand that recipient permanently. FR-011 (manual retry) and the partial unique index in FR-007 exist specifically to absorb that trade-off.

## Out of Scope

Drip sequences, multi-step onboarding journeys, and any general marketing-automation engine. AI-generated or per-recipient personalised copy beyond first-name substitution. Changing, retiring, or consolidating the signup-Lambda welcome. Welcoming the marketing-contacts audience. Creating or managing YappChatt rooms — the link is stored, never provisioned. Redesigning unsubscribe or consent handling. Scheduling or recurring re-sends. A/B testing of welcome copy.

## Open Questions

1. **Localization** — the app ships in six languages and the newsletter can translate per recipient locale. This pass specifies a single static language. Should the welcome be localized?
2. **Tracked join link** — issue through the existing `/r/:code` redirect for click analytics and bot filtering, or keep it a plain link since the countdown measures sends rather than clicks?
3. **Fate of the dead welcome code** — `EmailService.sendWelcomeEmail`, `getWelcomeEmailHTML`, `welcome.mjml`, and `account-created.mjml` all exist with zero call sites. Adopt one as the basis, or delete them so a third copy does not accumulate.
4. **Backfill size versus capacity** — measured 2026-07-22: **28** deduped active users with valid emails and no opt-out, of which **26** sit on `ACTIVE`-subscription companies and 2 on `PENDING` (excluded per FR-008). So the first backfill needs roughly **26** uses. Any sensible link capacity clears this comfortably; the capacity stop in FR-009 is therefore a guardrail for ongoing triggered sends rather than a real constraint on the initial run. Remaining question is only what total to set for the ongoing period.
5. **Consent posture** — is the welcome transactional (always sent) or marketing (suppressed for opt-outs)? This scope currently honours existing opt-outs on the backfill; the triggers arguably warrant transactional treatment.
6. **Retry ergonomics** — FR-011 specifies manual retry of failed sends. Should a small bounded automatic retry also run before a send is marked failed, or is manual sufficient given expected volumes?

Resolved 2026-07-22: the email-sender question settled on direct SES — see Clarifications.

## Constraints & Notes

### Constraints

- Stack and conventions per CLAUDE.md: TypeScript throughout with no `any`, Pino logging with no `console.log`, Drizzle with UUID v7 keys, and lowercase concatenated table and column names.
- Every authoring, backfill, and reporting endpoint is SYSADMIN-gated, consistent with the rest of the marketing surface.
- A welcome send must never fail, delay, or roll back a subscription activation or an invitation acceptance. Failure is recorded, never propagated.
- Send throughput must respect SES limits; the backfill reuses the newsletter's throttle rather than inventing its own.
- Spec-first and the code-fencing convention apply to all work under this scope.

### Dependencies

- **SCOPE-064** — the newsletter compose/review/send architecture, its SES sender and configuration, and the per-recipient send-record pattern this mirrors and extends.
- **The subscription activation path** and **the invitation flow** — the two existing once-only hook points this attaches to; neither sends any email today.
- **SCOPE-079 / SCOPE-102** — the YappChatt integrations. Note that the room exists today only as an environment value in a per-project file; this scope is the first to treat a YappChatt link as stored data.
- **SCOPE-070** — the tracked-link and redirect infrastructure, needed only if open question 3 resolves toward tracking.
- **SCOPE-045** — declares marketing automation and drip sequences out of scope. This scope is a deliberate, narrow exception: two triggered sends of one static message, with no sequencing, branching, or scheduling. Recorded here so it does not read as drift.
