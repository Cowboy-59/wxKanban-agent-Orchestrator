# Tasks: Archive Scope/Spec Group (Spec 103)

Mirrors the tasks created in the DB under spec 103 (`e9402ca5-7352-4e5d-ae5d-dc79ac7c742e`).

All eight tasks implemented (T001–T006 backend/UI, T007 kit file-sync, T004 leftover closed, T008 verified). Committed on `main`, NOT pushed.

| Task | Title | FRs | Depends |
|------|-------|-----|---------|
| T001 | Add `archived` status value (SpecStatusSchema, update_spec_status registration enum, ScopeStatus union, both schema comments) — no migration | FR-001 | — |
| T002 | `archiveScope`/`unarchiveScope` in ScopeService: mirror `deleteScope` (guard+tx) but UPDATE status + audit `scope_archived`{fromStatus}/`scope_unarchived`; restore prior from audit (draft fallback) | FR-002, FR-003, FR-006 | T001 |
| T003 | Trigger + perms: accept `archived` in `update_spec_status` (MCP) + app status route for any project member; remove/repoint the dead `POST /api/specifications/:id/archive` stub | FR-002 | T001 |
| T004 | Hide archived at all 6 read sites (cockpit, lifecycle, devplan, scopeflow, ScopeService.getScopes, list_open_items docs) + phase-matrix thresholds | FR-004 | T001 |
| T005 | Restore listing: opt-in archived filter on a spec-listing path so archived scopes can be found and unarchived | FR-007 | T002, T004 |
| T006 | App/cockpit archive+unarchive control (ScopeActionButtons beside Delete; cockpit affordance) | FR-007 | T002, T003 |
| T007 | Kit file-sync: move the on-disk group (`specs/Project-Scope/NNN-*.md` + `specs/NNN-name/`) to/from an archive folder to match status; reversible, no loss | FR-005 | T001 |
| T008 | Verify the 6 success criteria: 0/5 surfaces, prior-status restore, file round-trip, non-destructive inventory, any-member + audit, no migration | all | T002–T007 |
