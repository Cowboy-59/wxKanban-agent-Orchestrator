# Spec 103: Archive Scope/Spec Group

**Spec Number**: 103
**Status**: implementing
**Created**: 2026-07-18
**Scope**: `specs/Project-Scope/103-archive-scope.md` (SCOPE-103)
**DB spec id**: `e9402ca5-7352-4e5d-ae5d-dc79ac7c742e`
**Depends On**: SCOPE-098 (delete-scope) · **Related**: SCOPE-101, SCOPE-013

> Implementation spec. Full narrative + success criteria in the scope doc; this is the build view.

## Summary

Non-destructive `archived` status for a scope/spec group. Setting it hides the group from every
working surface and (via kit sync) moves its files to an archive folder; unarchive restores the prior
status and moves files back. Mirrors `ScopeService.deleteScope()` but reversible — no rows/files deleted.

## FR → task map

| FR | Requirement | Tasks |
|----|-------------|-------|
| FR-001 | `archived` status value (no migration) | T001 |
| FR-002 | Archive action (set status, capture prior, any member) | T002, T003 |
| FR-003 | Unarchive (restore prior status, draft fallback) | T002 |
| FR-004 | Hide archived at all 6 read sites + phase matrix | T004 |
| FR-005 | Kit file-sync move to/from archive folder | T007 |
| FR-006 | Audit + non-destructive guarantee | T002 |
| FR-007 | Archive control + restore listing | T005, T006 |

## Key edit sites (from search)

- Status vocab: `mcp-server/src/utils/schemas.ts:390` (`SpecStatusSchema`), `mcp-server/src/server.ts:3516` (registration enum), `src/shared/types/projects.ts:145` (`ScopeStatus`), schema comments `src/db/schema/projectspecification.ts:30` + `mcp-server/src/db/schema.ts:121`.
- Service: `src/server/services/ScopeService.ts` — add `archiveScope`/`unarchiveScope` mirroring `deleteScope()` (448-492); prior status via `companyauditlogs`.
- Write path/perms: `src/server/routes/projects.ts:1473` (`USER_WORKFLOW_STATUSES`) + `update_spec_status` handler `server.ts:1379`.
- Hide sites (add `status != 'archived'`): cockpit `server.ts:1735`, `lifecycle-generator.ts:447`, `devplan-generator.ts:173`, `scopeflow-generator.ts:199`, `ScopeService.getScopes` (~59), `list_open_items` docs `server.ts:1646`; matrix thresholds `ScopeService.ts:19-36`.
- Dead stub to remove/repoint: `POST /api/specifications/:id/archive` (`specificationLifecycle.ts:479`) → `archiveSpecification()` no-op.

## Acceptance

Governed by the 6 success criteria in the scope doc (0/5 surfaces, restore fidelity, file round-trip,
non-destructive, any-member + audit, no migration).
