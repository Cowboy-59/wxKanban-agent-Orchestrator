# Plan: Delete Scope on Project Detail

**Spec Number**: 098
**Date**: 2026-07-13

## Implementation Plan

### Phase 1: Server — service (FR-002)
- `src/server/services/ScopeService.ts`: add `deleteScope(projectid, scopeid)` next to `overrideStatus`. `db.transaction`: verify scope exists + belongs to `projectid` (else not-found) → `delete projecttasks where specid = scopeid` → `delete projectspecifications where id = scopeid and projectid = projectid`. Cascade removes documents/spec-phases/scope-chat/testplans. Return a summary `{ deleted: true, taskCount }` or not-found.
- Verify the live `projectdocuments` schema (plural file) cascades on `specid`.

### Phase 2: Server — route (FR-001)
- `src/server/routes/projects.ts`: add `DELETE /:id/scopes/:scopeid` near `PATCH /:id/scopes/:scopeid/status` (~1471), `scopeParamsSchema`, `authenticateToken` + `requireAuth` + the sibling project-access check (any member). Map service not-found → 404; success → 200 `{ success, message }`.

### Phase 3: Client — control + confirm (FR-003)
- `src/client/components/Projects/ProjectDetailPanel.tsx`: add a Delete button in `ScopeActionButtons` (~722). Build the impact string from the scope's loaded task count + documents length; `window.confirm`; on confirm `DELETE` the endpoint.

### Phase 4: Client — refetch + feedback (FR-004)
- On success: `onRefetch()` (handleRefetch ~1141) + success toast. On error: error toast + refetch to resync.

### Phase 5: Tests
- Server: `deleteScope` atomic + project-scoped + not-found; route 200/404/401-403.
- Client: confirm counts, cancel = no request, success = refetch.

## Known Issues

- Two `projectdocuments` schema files (singular vs plural); `ScopeService` uses the plural (live) one — confirm cascade there.
- On-disk `specs/Project-Scope/NNN-*.md` is NOT removed (kit FS-sync territory) — possible reintroduction on a later sync. Out of scope; note only.
