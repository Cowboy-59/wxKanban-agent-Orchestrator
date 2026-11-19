# Plan: Archive Scope/Spec Group (Spec 103)

**Scope**: SCOPE-103 · **Spec id**: `e9402ca5-7352-4e5d-ae5d-dc79ac7c742e`

## Approach

Add a non-destructive `archived` spec status and hide it everywhere. Structurally mirror
`ScopeService.deleteScope()` but `UPDATE ... SET status='archived'` instead of deleting, capturing the
prior status in a `companyauditlogs` row so unarchive can restore it (draft fallback if pruned). The
DB is the source of truth; the kit sync moves the on-disk group to/from an archive folder to match.
No DB migration — the status column is already free `varchar(50)`.

## Phases

**Phase 1 — Status value + service (DB).**
T001 add `archived` across enums/types/comments. T002 `archiveScope`/`unarchiveScope` service
(guard + tx + status update + audit; prior-status restore). T003 trigger/perms: accept `archived` in
`update_spec_status` + app status route for any member; remove/repoint the dead `/archive` stub.

**Phase 2 — Hide it.**
T004 add `status != 'archived'` at all six read sites + phase-matrix thresholds. This is the bulk of
the work and the highest-risk (a missed site leaks an archived scope into a working surface).

**Phase 3 — Restore + UI.**
T005 opt-in archived listing (status filter) for restore. T006 archive/unarchive control in the
project panel (beside Delete) + cockpit affordance.

**Phase 4 — Files + verify.**
T007 kit file-sync move to/from archive folder. T008 verify the 6 success criteria (0/5 surfaces,
restore fidelity, file round-trip, non-destructive inventory, any-member + audit, no migration).

## Risks / gates

- Missed read site = leak: T004 must cover all six + the matrix. Verify each surface after.
- Prior-status restore depends on the audit row surviving retention (SCOPE-013) → draft fallback.
- Status (DB) and files (kit) can be briefly out of sync until the next sync runs — acceptable, documented.

## Rollout

Touches the app (service, routes, generators, frontend), the MCP server (status enum, generators,
list path), and the kit (file-sync). No migration. Ship via the normal path; nothing pushed without
explicit instruction.
