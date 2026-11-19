# Plan: Self-Serve Subscription Suspend & Cancel (SPEC-131)

Spec: `specs/131-selfserve-suspend-cancel/spec.md` · Tasks: `tasks.md`
Umbrella scope: SCOPE-130 · Sibling: SPEC-132

---

## Blocking prerequisite

**SPEC-132 T001 must land first.** T003, T005 and T006 write
`companies.cancelrequestedat`, `cancelledat` and `pausedat`, none of which exist. The DDL is
hand-applied against production per SCOPE-117, so this is a real calendar dependency, not a
merge-order preference. Attempting T003 first produces code that typechecks and fails at runtime.

## Build order

1. **T001, T002, T003** — the cancel path, server side. Ship these together: T002 without T003 is
   an endpoint that walls paying customers.
2. **T004** — un-cancel. Immediately after T003, because it is what makes T002 safe to expose.
3. **T005** — the period-end webhook. Independent of the UI, and the only output SPEC-132 consumes.
4. **T006, T007** — suspend and its access decision. T007 edits a *shared* module
   (`src/shared/subscription-policy.ts`) owned by SCOPE-090 Amendment A; read that scope before
   touching it.
5. **T009** — the exemption. Must precede any UI work, or a walled ADMIN cannot exercise the panel.
6. **T008, T010, T011, T012, T013** — the client surface.
7. **T014, T015** — email and audit.
8. **T016** — endpoint tests across every failure path.

## Gates

| Gate | Condition |
|---|---|
| **G1 — schema** | SPEC-132 T001 applied and verified; columns present in production, declared in `schema/company.ts` |
| **G2 — no premature wall** | With a cancellation pending, a company is still `ACTIVE` and fully usable. Verified in the browser, not only by unit test — the wall is client-side |
| **G3 — Stripe/DB agreement** | Every path leaves Stripe and `companies`/`companysubscriptions` consistent, including on Stripe failure (nothing written) |
| **G4 — reachability** | A `PAUSED` and a `CANCELLED` company's ADMIN can reach all four mutating routes |
| **G5 — allow-list intact** | `evaluateAccess` still blocks an unknown status after `PAUSED` is added |
| **G6 — endpoint-tested** | T016 complete. A green unit run plus a green build is explicitly *not* sufficient on this project |

## Known issues and constraints

- **The client wall is always on; the server gate ships inert.** `ProtectedRoute.tsx` runs
  `evaluateAccess` with no env flag, while `requireActiveSubscription` defaults to
  `SUBSCRIPTION_GATE_ENFORCE=off`. It is easy to conclude the gate is off and be wrong. This
  asymmetry is why T003 exists as its own task.
- **Stripe cancellation is one-way.** A `canceled` Stripe subscription cannot be resumed — only
  replaced. Hence `cancel_at_period_end` (T001) rather than an immediate cancel, and hence T004
  clearing the flag rather than re-creating anything.
- **`CANCELED` vs `CANCELLED`.** Production contains only the one-L spelling; the UI and
  `deleteCompany()` write two. SCOPE-067 FR-002 promised to standardize this and did not. Every
  status read added here accepts both, or it silently misses rows.
- **Do not confuse this with dunning.** SCOPE-067's `PENDING_INACTIVE` means "card failed, please
  fix it". A deliberate cancellation is not that, and the two paths must not both email the
  customer. The *recovery from a dunning-initiated cancellation* defect is explicitly out of scope
  and needs its own spec.
- **`SubscriptionManagementPanel.tsx` does not exist.** SCOPE-023 D.6 named it; nothing was built.
  Extend `BillingSubscriptionPanel.tsx` and do not resurrect the other name.
- **Stripe dashboard.** SCOPE-023 recorded "leave *Cancel subscriptions* OFF" because cancel was
  meant to live in our UI. Confirm it is still off before T002 ships, or customers get two
  divergent cancel paths.

## Rollback

Every task here is additive except T007, which edits a shared decision function. Reverting T007
alone restores the previous access behavior. A company left mid-state (Stripe
`cancel_at_period_end: true`, local markers written) is recovered by T004's resume path, which is
why T004 ships in the first batch rather than last.

## Compliance

SOC 2 is the only enabled framework. **CC6.3** — all four mutating routes carry an explicit
`requireAdmin` guard; hiding controls client-side is UX, not the control. **CC7.2** — T015 records
every transition in `company_status_history`, a table separate from the row being changed.
