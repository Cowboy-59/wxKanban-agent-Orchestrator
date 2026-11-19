# Plan: Consultants Management (Engagement Core)

**Spec Number**: 037
**Date**: 2026-05-26
**Total Tasks**: 77 across 15 phases (see [tasks.md](tasks.md))

---

## Implementation Plan

### Phase 1 — Database Foundation (T001–T008)

Drizzle schema files for the 4 new tables plus the `companies.billingemail` column. Generate and apply migration to dev. This phase blocks every other phase — nothing else can land until the schema exists and the partial unique + check constraints behave correctly.

**Gate**: manual insert tests confirm: (a) two `active` engagements on same Client×Consulting pair are rejected by unique constraint; (b) an `engagementassignments` row with both `scopeid` and `taskid` populated is rejected by check constraint; (c) `companies.billingemail` accepts null and a valid email.

### Phase 2 — Router Wiring (T009–T011)

`src/server/routes/engagements.ts` scaffolded with handler stubs, auth-context resolver middleware in place, and **mounted in `app.ts`** as the first action.

**Why this is its own phase**: today's commits c18ee7a + c03c524 were emergency fixes for exactly this class of bug (route file existed, never mounted, returned 404 in prod). Making the wiring an explicit standalone phase forces the mounting to happen before any handler is written.

### Phase 3 — Invitation Flow (T012–T016)

Three endpoints: invite, validate token, accept. The accept endpoint is the most complex — single endpoint branching on `provisionCompany` payload and on existing-user lookup. Email template for invitation reuses existing pattern.

**Gate**: a brand-new email can be invited, the token validates, and accept either binds to an existing CONSULTANT-plan tenant OR provisions a new one.

### Phase 4 — Lifecycle State Machine (T017–T021)

Centralized state-machine module with the allowed-transition table. Endpoints for pause/resume/disable/enable/end. Shared write-block middleware enforces `paused`/`disabled` for downstream phases. Audit-log writes for all state transitions.

**Gate**: SC-6 — unit tests confirm 100% branch coverage; disallowed transitions return 409.

### Phase 5 — Assignments CRUD (T022–T028)

Engagement read endpoints + assignment add/remove with mandatory soft-delete. Audit writes for all changes. Pending-modifications queue handles writes attempted during paused/disabled (queued, applied on resume per FR-005 AC4).

**Gate**: assignment additions are visible to Consulting Co. without re-acceptance; removals revoke writes but preserve time-entry history.

### Phase 6 — Sub-Assignments + Needs-Reassignment Queue (T029–T034)

Sub-assignment CRUD inside the Consulting Co.'s view. Member deactivation cascades to the "Needs reassignment" queue. The at-least-one-ADMIN invariant (FR-028) is enforced here because the consultant onboarding flow makes this constraint observable.

**Gate**: deactivating a Consulting Member with active sub-assignments lands them in the queue; queue is reassignable by ADMIN or TEAM_MANAGER; removing the last ADMIN of any Company returns 409.

### Phase 7 — Permission Enforcement (T035–T037)

Visibility middleware scopes Consulting Member queries to their active sub-assignments. Existing tasks + scope-documents endpoints integrate this check. Lifecycle-phase write block enforces consultant cannot manually advance phase (automation-only).

**Gate**: SC-3 — ≥ 15 negative isolation tests cover cross-engagement leak, cross-scope leak, team-list visibility, phase-move attempt, etc.

### Phase 8 — Billing & B2B Invoicing (T038–T044)

Time entries stored in Consulting Co. tenant. `GET /billing` returns aggregate-only metrics. `POST /invoice` reuses existing invoice/PDF flow with B2B mode. Delivery via `billingemail` with retry queue. Time entries final-on-submit.

**Gate**: SC-4 — confidentiality contract validated by API-surface audit; SC-5 — invoice delivery ≥ 99.9% with retry queue active.

### Phase 9 — Notifications (T045–T047)

Three notification types from FR-022 / FR-023 / FR-024. State-change emails, batched assignment-modification email, phase-advance email. Reuse existing email infrastructure.

**Gate**: state transitions and assignment changes produce the right notification audit rows; resume from paused is silent.

### Phase 10 — PM Integration Hooks (T048–T051)

Seat-cap calculation guard confirms sub-assignments don't count. PM connect at onboarding (FR-019) + post-onboarding (FR-020). **FR-021 (bidirectional sync) is a stub** — implementation pending spec 020 completion. Document the integration shape so it can be wired in later without re-architecting.

**Gate**: optional PM connect during onboarding completes via existing 020 OAuth flow; sub-assignments never increment `seatsused`.

### Phase 11 — Frontend: Personnel + Invite (T052–T053)

`ConsultantsPanel` added to `PersonnelManagementPage`. `InviteConsultingCompanyModal` is the entry point. Cards show aggregate billing metrics.

**Gate**: Client ADMIN can browse all engaged Consulting Companies, see metrics, click into details, and invite new ones.

### Phase 12 — Frontend: Engagement Detail (T054–T056, T060)

`EngagementDetailPage` with role-gated layout. `AssignmentEditor` for Client ADMIN. `SubAssignmentEditor` for Consulting ADMIN/TM with "Needs reassignment" queue. Lifecycle controls wired to API with confirmation modal for `end` (terminal warning).

**Gate**: both sides can use the engagement view; lifecycle actions all reachable from UI with confirmations on irreversible.

### Phase 13 — Frontend: Onboarding + Work Surface (T057–T058, T061–T062)

`ConsultantProvisionForm` for FR-003 with optional PM connect. `ConsultantWorkHubPage` extension to surface sub-assignments. `billingemail` field on Company settings. Tenant-context indicator chip in nav for dual-persona users.

**Gate**: brand-new email completes onboarding in < 5 minutes (SC-2); Consulting Member sees their sub-assignments alongside any spec 020 PM-system work.

### Phase 14 — Invoice UI Wiring (T059)

`InvoiceGenerator` extension to support B2B mode pre-populated from engagement. Single small task; depends on Phase 8 backend complete.

**Gate**: Consulting Co. ADMIN generates a B2B invoice end-to-end from the UI.

### Phase 15 — QA, Documentation, Release (T063–T077)

All test coverage (15 tasks): unit (4), integration (4), permission isolation (1), confidentiality audit (1), audit trail (1), email delivery (1), beta runbook (1). Plus docs (3 tasks) — admin guide, README/CHANGELOG, beta runbook.

**Gate**: SC-1 through SC-7 verifiable in beta; ready for release.

---

## Critical Path

```
Phase 1 (T001-T008)          Schema
  ↓
Phase 2 (T009-T011)          Router mounted — single biggest bug risk neutralized early
  ↓
Phase 3 (T012-T016)          Invitation flow
  ↓
Phase 4 (T017-T021)          State machine — gates write-block enforcement for Phases 5,6,7
  ↓
Phases 5-10 parallelize on Phase 4 + 2 outputs:
  - Phase 5 (Assignments)
  - Phase 6 (Sub-Assignments + invariant)
  - Phase 7 (Permission enforcement)
  - Phase 8 (Billing + B2B invoice)
  - Phase 9 (Notifications)
  - Phase 10 (PM integration hooks)
  ↓
Phases 11-14 (Frontend) land in parallel once backend endpoints are stable
  ↓
Phase 15 (QA + Release) gates ship
```

## Realistic Sizing

| Phase | Tasks | Est. effort |
|---|---|---|
| 1 | 8 | 0.5 day |
| 2 | 3 | 0.5 day |
| 3 | 5 | 1.5 days |
| 4 | 5 | 1 day |
| 5 | 7 | 1.5 days |
| 6 | 6 | 1 day |
| 7 | 3 | 1 day |
| 8 | 7 | 1.5 days |
| 9 | 3 | 0.5 day |
| 10 | 4 | 0.5 day (+ deferred FR-021) |
| 11 | 2 | 1 day |
| 12 | 4 | 2 days |
| 13 | 4 | 1.5 days |
| 14 | 1 | 0.5 day |
| 15 | 15 | 1 week |
| **Total** | **77** | **~3-4 weeks of focused work** |

---

## Risk Mitigations Embedded in Plan

- **Orphaned-route class of bug** (BUG-20, today's c18ee7a fix) → Phase 2 is a standalone wiring step, runs before any handler is written.
- **Confidentiality contract leak** → Phase 8 includes an explicit API-surface audit task (T040) gating Phase 15 acceptance.
- **State-machine soundness** → Phase 4 requires 100% branch coverage as gate, not "later."
- **Spec 020 dependency uncertainty** → Phase 10's FR-021 is an explicit stub (T051), shippable as `[pending 020 completion]`. 037 ships without it if needed.
- **At-least-one-ADMIN invariant** → Phase 6 enforcement applies to *all* Companies, not just consultants — protects the existing Personnel flows too.

---

## Out of Scope for This Plan

- 038 marketplace UI / discovery (separate scope)
- 039 pre-sales / proposals / NDAs (separate scope)
- 040 payment processing (separate scope)
- 041 cross-engagement reporting + time-entry dispute (separate scope)
- Multi-tenant analytics across engagements (separate scope)
- Migration of pre-existing `userinvitations` rows from non-Consulting companies for the same email (intentionally not auto-migrated — Howard@HAS Enterprises must be re-invited as Consulting Co. via the new flow per the Migration Notes in the source scope)

---

## Next Steps After This Plan

1. Review tasks.md for task sizing — break anything > 4 hours into sub-tasks.
2. Run `validateScope 037` before implementation begins.
3. Implementation proceeds via `implement 037/T001` → `implement 037/T002` → ... per the orchestrator-driven flow (or direct-import wrapper if CLI bootstrap is still rough).
4. Update `specs/projectlifecycle.md` to include 037 in active scopes (per CLAUDE.md projectlifecycle.md convention).
