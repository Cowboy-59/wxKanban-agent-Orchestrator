# Spec 109: Customer Welcome Message

**Spec Number**: 109
**Status**: `draft`
**Created**: 2026-07-22
**Scope**: SCOPE-109 (`specs/Project-Scope/109-customer-welcome-message.md`) — 1:1
**Depends On**: SCOPE-064 (newsletter compose/review/send architecture, SES sender, per-recipient send-record pattern); the existing subscription-activation and invitation-acceptance paths; SCOPE-079 / SCOPE-102 (YappChatt, the join link's destination)
**Source**: `specs/Project-Scope/109-customer-welcome-message.md`

---

## Overview

One static welcome message, authored once in the SysAdmin marketing area and sent automatically at the two moments a person becomes a customer: subscription activation, and invitation acceptance. It carries a YappChatt join link with a finite capacity that counts down per send and warns below ten remaining. Every send is recorded per recipient with a hard once-per-person guarantee, which is what makes both the automatic triggers and a one-time backfill of existing customers safe to run.

The authoring surface mirrors the newsletter (compose, preview, test-send, publish). The signup-Lambda marketing welcome is untouched — different audience.

## Business Problem

Nothing welcomes a customer at the moment they become one. Subscription activation and invitation acceptance both already exist as clean once-only events, and both pass silently. The only welcome that exists serves the marketing notification list, not customers. There is no record of who has been welcomed, so existing customers cannot be caught up safely, and the YappChatt route the message most needs to carry does not exist as data at all — the room is a value in a per-project environment file, with no way to see remaining capacity or be warned before it runs out.

## Actors

- **Primary:** SysAdmin — authors and publishes the message, sets the join link and capacity, sends the test, runs the backfill, retries failures, and is warned when capacity runs low.
- **Secondary:** The new subscriber and the newly-added company user (passive recipients). The subscription-activation and invitation-acceptance paths (trigger sources). The SES sender.

## Success Metrics

1. **Trigger exactness** — over 30 days post-release, 100% of activations and acceptances yield exactly one welcome: zero missed, zero duplicates, reconciled against `welcomesends`.
2. **Backfill completeness** — after the one-time run, 100% of eligible users carry exactly one successful record and an immediate re-run sends to zero people.
3. **Capacity never silently exceeded** — `linkconsumed` never exceeds `linkcapacity`, and a warning always precedes exhaustion.

## Scope Boundary

One standing editable message with draft/live state; automatic send on the two existing once-only hooks; a stored join link with total capacity, remaining count and sub-ten warning; test send; one-time backfill to registered users of active companies; per-recipient records with a hard once-per-successful-send guarantee; manual retry of failures; reach visibility.

## Out of Scope

Drip sequences, onboarding journeys, or any general automation engine (SCOPE-045 rules these out). AI-generated or per-recipient copy beyond first-name substitution. Changing or consolidating the signup-Lambda welcome. Welcoming the marketing-contacts audience. Provisioning YappChatt rooms. Redesigning unsubscribe/consent. Scheduling or recurring re-sends. A/B testing.

## Open Questions

1. **Localization** — six supported languages; this pass ships a single static language.
2. **Tracked join link** — route through `/r/:code` for click analytics, or keep it plain (the countdown measures sends, not clicks)?
3. **Dead welcome code** — `EmailService.sendWelcomeEmail`, `getWelcomeEmailHTML`, `welcome.mjml`, `account-created.mjml` have zero call sites: adopt or delete.
4. **Capacity total** — the backfill needs ~26; what total to set for the ongoing period.
5. **Consent posture** — transactional (always sent) or marketing (suppressed for opt-outs)? Backfill currently honours opt-outs.
6. **Retry ergonomics** — is manual retry (FR-011) enough, or should a small bounded auto-retry run before marking failed?

## Functional Requirements

### FR-001 — A single standing welcome message

Exactly one persistent record with `draft` / `live` state. Editing returns it to draft; publishing arms the triggers. Triggers send nothing while in draft.

### FR-002 — Authoring surface mirroring the newsletter

Own tab beside Newsletter, SYSADMIN-gated, with the same Edit ⇄ Preview toggle and the same body-to-email rendering so plain text keeps its line breaks.

### FR-003 — Test send

Delivers the current content to the review inbox with a test marker. Consumes no capacity, writes no send record, works in draft or live.

### FR-004 — YappChatt join link with finite capacity

Stored link plus `linkcapacity`; `linkconsumed` increments once per successful welcome. Remaining is always visible; below ten raises a clear warning. Capacity can be raised or the link replaced with a fresh total without losing history. Tests never decrement.

### FR-005 — Automatic send on subscription activation

Fires on the existing once-only activation transition so a replayed billing event cannot re-send. Never fails or delays the activation. Failures are recorded and visible.

### FR-006 — Automatic send on a user joining a company

Fires at user-record creation on invitation acceptance. Never blocks the person joining. Someone already welcomed — including joining a second company — is not welcomed again.

### FR-007 — Once per person, guaranteed, but failures stay retryable

A **partial unique index on `lower(email)` where `status = 'sent'`** guarantees at most one *successful* welcome per person, while allowing a `failed` row to coexist so a transient SES failure is not permanent. Case-insensitive. Concurrent trigger and backfill cannot both succeed for the same person.

### FR-008 — One-time backfill to existing customers

Shows the eligible count, sends only to eligible people, writes a record each, re-runs send to nobody. Per-recipient failures never abort the run. Excludes disabled accounts, opt-outs, and users on non-active (`PENDING`) companies — which also keeps deliberate test accounts out of a real send. Deduped case-insensitively so one person on two companies is welcomed once.

### FR-009 — Behaviour at exhausted capacity

At zero remaining, triggered sends do not go out and the reason is recorded; a backfill stops cleanly reporting sent vs unsent; the blocked state is visible; nothing disrupts activation or acceptance.

### FR-010 — Visibility of who has been welcomed

Totals for sent, failed and still-eligible; a retrievable per-recipient record with outcome, error and timestamp; remaining capacity shown alongside.

### FR-011 — Retry failed sends

Failed recipients are listed with their error and are retryable individually or collectively. A retry targets only `failed` records, never re-sends a success, consumes exactly one capacity on success and none on failure, and is refused with a reason when capacity is exhausted.

## Technical Notes

Two new tables (`welcomemessages`, `welcomesends`) following lowercase-concatenated naming with UUID v7 keys. Capacity and dedupe are one primitive: a conditional UPDATE that only succeeds when `linkconsumed < linkcapacity`, in the same transaction as the `welcomesends` insert, so FR-007 and FR-009 are correct under concurrency with no locking of our own. Capacity is consumed by successful delivery only — a failed attempt releases what it provisionally claimed, or a run of failures would silently drain the link.

Delivery uses **direct SES** (`src/server/lib/ses.ts`), matching the newsletter. That has no queue-level retry or dead-letter net, which is why FR-007's partial index and FR-011's manual retry are load-bearing rather than optional.

A single `sendWelcomeTo(person, trigger)` entry point is shared by both triggers, the backfill and retry, so dedupe and capacity rules cannot diverge between paths. Both triggers call it fire-and-forget, wrapped so a send failure can never propagate.

## Constraints

TypeScript throughout, no `any`, Pino logging, Drizzle with UUID v7, lowercase concatenated table/column names. All endpoints SYSADMIN-gated. A welcome send must never fail, delay or roll back an activation or an acceptance. Backfill reuses the newsletter's throttle rather than inventing one. Spec-first and the code-fencing convention apply.
