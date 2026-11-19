# Tasks: Customer Welcome Message (Spec 109)

**Spec**: 109 · 11 tasks · all `todo`. Fences: `[SCOPE 109 / T0xx]`. DB is the source of truth for status.

> Order is deliberate: data guarantees, then the one shared send path, then surfaces, then the live triggers last — by which point the send path is already proven.

## Phase A — Data + the one send path (FR-001/004/005/006/007/009)

- [ ] **T001 — Schema: welcomemessages + welcomesends + migration** (FR-001/004/007)
  New `src/db/schema/welcomemessages.ts` (single standing record: subject, body, status draft|live, joinlink, linkcapacity, linkconsumed, publishedat, updatedat, updatedbyid) and `src/db/schema/welcomesends.ts` (welcomemessageid, userid, email, status sent|failed, error, trigger, sentat). Register both in `src/db/schema/index.ts`. Generate the migration and hand-verify the **partial** unique index on `lower(email) WHERE status = 'sent'` — Drizzle's generator does not reliably express partial indexes, so this is written/checked by hand.

- [ ] **T002 — WelcomeMessageService: standing record + publish** (FR-001)
  Get-or-create the single record, update while draft, publish (draft→live), and edit-returns-to-draft. No send logic here.

- [ ] **T003 — sendWelcomeTo(): the one send path** (FR-004/005/006/007/009)
  The single entry point used by both triggers, the backfill and retry. Atomic conditional capacity claim (`linkconsumed < linkcapacity`) in the same transaction as the `welcomesends` insert; deliver via direct SES; **release capacity on failure**; mark the row `sent`/`failed` with the error. Refuses when no message is live or capacity is exhausted, recording the reason. Never throws to its caller.

## Phase B — Surfaces (FR-002/003/010)

- [ ] **T004 — Routes: /api/sysadmin/marketing/welcome** (FR-002/003/008/010/011)
  SYSADMIN-gated, mirroring `newsletter.ts`: read/update the standing record, publish, test send, eligible count, backfill start + progress, reach totals, failed list + retry. Mount in `src/server/app.ts`.

- [ ] **T005 — Test send** (FR-003)
  Delivers current content to the review inbox (`NEWSLETTER_REVIEW_TO`) with a test marker; consumes no capacity and writes no send record; allowed in draft or live.

- [ ] **T006 — Client Welcome tab** (FR-002/004/010)
  `src/client/pages/SysAdmin/marketing/Welcome.tsx` modelled on `Newsletter.tsx`: Edit ⇄ Preview toggle, test-send control, publish, join-link + capacity fields, remaining count with the sub-ten warning, eligible count, reach totals, failed list with retry, progress polling during a backfill. Add the tab in `MarketingTabs.tsx` and the route in `App.tsx`.

## Phase C — Triggers, backfill, retry (FR-005/006/008/011)

- [ ] **T007 — Subscription-activation trigger** (FR-005)
  Attach to the existing once-only PENDING→ACTIVE transition in `StripeWebhookHandler`. Fire-and-forget inside a catch that can only log — a welcome failure must never fail or delay activation.

- [ ] **T008 — Invitation-acceptance trigger** (FR-006)
  Attach at post-acceptance user creation in `InvitationService`. Same fire-and-forget guarantee; must never block a person joining.

- [ ] **T009 — Backfill runner** (FR-008/009)
  Atomic run claim, throttled loop reusing the newsletter's delay, one record per recipient, per-recipient failures never abort, terminal tally. Eligibility: active users, valid email, not opted out, **active-subscription companies only** (excludes PENDING and thus deliberate test accounts), deduped case-insensitively. Stops cleanly on exhausted capacity reporting sent vs unsent.

- [ ] **T010 — Retry failed sends** (FR-011)
  Retry individual or all `failed` recipients through `sendWelcomeTo`; never re-sends a success; refused with reason when capacity is exhausted.

## Phase D — Verification (cross-cutting)

- [ ] **T011 — Unit tests + build verification** (FR-004/007/009/011)
  Cover the pieces that cannot be eyeballed: capacity arithmetic and the sub-ten warning boundary; the partial-unique constraint allowing retry after failure but rejecting a second success; failure releases capacity; eligibility excludes PENDING companies and opt-outs. Plus server and client builds clean.
