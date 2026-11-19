# Quickstart: Delete Scope on Project Detail

**Spec Number**: 098
**Date**: 2026-07-13

## What this scope does

Adds a per-scope Delete action on the project detail page that hard-deletes a scope and everything under it (tasks + cascaded documents/spec-phases/scope-chat/test-plans), in one transaction, scoped to the project.

## Where the code lives

- `src/server/services/ScopeService.ts` — new `deleteScope(projectid, scopeid)` (atomic transaction)
- `src/server/routes/projects.ts` — new `DELETE /:id/scopes/:scopeid` (~near line 1471)
- `src/client/components/Projects/ProjectDetailPanel.tsx` — Delete button in `ScopeActionButtons` (~722) + confirm + refetch

## Verify locally

```bash
# server tests (service + route)
npm run test -- ScopeService
# client tests (confirm + refetch)
npm run test -- ProjectDetailPanel
```

## Manual smoke

1. Open a project's detail page (Design phase).
2. On a throwaway scope, click Delete → confirm shows "N tasks, M documents".
3. Confirm → scope disappears; verify in DB that its tasks + documents are gone.
4. Try deleting an already-deleted scope (stale tab) → friendly 404 + list resyncs.

## Notes

- Hard delete, irreversible. Any project member can delete.
- DB-only: the on-disk `specs/Project-Scope/NNN-*.md` file is NOT removed (kit FS-sync territory).
- App feature — deploys with the app on push. Nothing pushed until the user gates it.
