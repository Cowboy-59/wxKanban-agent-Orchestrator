# Plan: Feedback Queue Hygiene

**Spec Number**: 110
**Date**: 2026-07-24
**Scope**: [SCOPE-110](../Project-Scope/110-feedback-queue-hygiene.md) | **Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

## Implementation Plan

The build order is dictated by one hard dependency in the scope: **the duplicate merge (FR-012) must run before the uniqueness constraint (FR-009) exists**, because the constraint fails loudly on un-merged data. Everything else fans out from a shared schema change.

### Phase 1: Schema & identity (T001–T005)
- **T001** — Add the four hygiene fields (`dismissedat`, `dismissedbyid`, `submitterhiddenat`, `reopenedat`) + not-dismissed index to **both** the app schema and the MCP mirror. Generate the Drizzle migration. Deliberately withhold the unique fingerprint index.
- **T002 (FR-008)** — Drop the browser route from `computeErrorFingerprint`. One-line basis change; app-side only.
- **T003 (FR-009 intake)** — Upsert auto-errors on `(projectid, errorfingerprint)`; increment `occurrencecount`/`lastoccurredat` on hit.
- **T004 (FR-010)** — Recurrence reopens a resolved/declined record; exactly one notification on the transition.
- **T005 (FR-011)** — 60-second manual double-submit guard on the app path and the MCP `submit_feedback` tool.

### Phase 2: Backfill then enforce (T006 → T007) — ordered, both DBs
- **T006 (FR-012)** — Idempotent, single-transaction merge script; run against the app prod DB and the hosted MCP DB.
- **T007 (FR-009 constraint)** — Only after the merge: the partial unique index, migrated to both DBs.

### Phase 3: Removal server surface (T008–T012)
- **T008 (FR-001)** dismiss/undismiss · **T009 (FR-002+003)** purge with audit + bulk primitive · **T010 (FR-007 server)** confirmation semantics · **T011 (FR-004+005)** submitter hide + self-delete MCP tool · **T012 (FR-006)** default-visible list + metrics exclusion.

### Phase 4: Console UI (T013–T014)
- **T013** selection + action bar · **T014** source indicator, dismissed filter, purge dialog, regression flag. shadcn/ui, existing console only.

### Phase 5: Verification (T015)
- **T015** — Test matrix mapping each of the seven success metrics to at least one automated assertion, including the audit-write-fails-abort path.

## Known Issues / Gates

- **Two databases.** T001, T006, T007 must each be applied to both the application PostgreSQL and the hosted MCP PostgreSQL (separate DBs). Applying to only one leaves the submitter MCP tool writing against columns that do not exist.
- **Merge-before-constraint gate.** T007 must not merge until T006 has run in the same environment; the intended failure mode is a loud constraint-violation, not silent data loss.
- **Fence discipline.** T002 modifies a SCOPE-061 fenced block — route through `implement` so a `MODIFIED-BY` line is added rather than hand-editing the fence.
- **No push until the operator says so** — migrations touch prod DBs and a push deploys the hosted MCP.
