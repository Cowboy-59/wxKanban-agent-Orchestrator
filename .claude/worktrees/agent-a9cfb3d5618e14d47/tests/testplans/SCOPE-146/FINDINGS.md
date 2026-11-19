# Test plan findings: SCOPE-146

From wxCreateTestPlan PLAN mode, 2026-10-25. Findings about wxKanban itself (the application under test).

## Clarifications required

### CLAR-01 — Must the audit row be written in the same transaction as the action it records?

- Unit: `fn:recordAuditLibraryWrite`
- Why: SPEC-146 writes it after the action and swallows a failed insert; SOC2 CC7.2 evidence could then be missing for a completed change.
- Assumed for now: Observed: written after, failure logged and not raised.
- Severity if wrong: Medium
- Blocks: TC-SEC-016-R1

### CLAR-02 — May a scope- or task-level consultant (not a whole-project grant) read a client project's compliance settings?

- Unit: `fn:canReadProjectCompliance`
- Why: canAccessProjectTenant counts only whole-project engagement assignments.
- Assumed for now: Observed: no — only whole-project grants read.
- Severity if wrong: Low
- Blocks: TC-SEC-024-B1

### CLAR-03 — What status should a non-UUID :id return on the audit routes?

- Unit: `route:GET /documents/:id`
- Why: Today a non-UUID id reaches Postgres and returns 500 (pre-existing).
- Assumed for now: Not asserted.
- Severity if wrong: Low
- Blocks: —

### CLAR-04 — Should AuditConfigPanel disable the framework toggles for a consulting ADMIN, now that their PUT answers 404?

- Unit: `route:PUT /config`
- Why: The panel enables toggles for any ADMIN; a consultant's save now fails.
- Assumed for now: Not asserted; UX gap.
- Severity if wrong: Low
- Blocks: —

## Data-layer constraint gaps (enforced only in application code)

1. Only a SYSADMIN may write `wxkanbandocuments` / `complianceaudittasks`: no database role or RLS separates them.
2. A non-SYSADMIN may read only `compliance_framework` documents: no view or policy enforces it at the database.
3. Only the owner company may change a project's `appauditconfiguration`: no tenant predicate at the database.

## Schema findings on the scope's tables

24 findings (missing `updatedat` / `createdat` timestamps, 18 FK or filter columns without a covering index — notably `complianceaudittasks.documentid`, which FR-005's count and FR-006's replace both filter on). Full table: the `schemaanalysis` document.
