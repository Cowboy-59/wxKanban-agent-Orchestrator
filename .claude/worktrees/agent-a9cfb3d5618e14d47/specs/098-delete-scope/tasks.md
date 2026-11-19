# Task Breakdown: Delete Scope on Project Detail

**Feature**: Delete Scope on Project Detail
**Spec**: 098
**Date Generated**: 2026-07-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Add DELETE /:id/scopes/:scopeid route | high | done |
| 2 | ScopeService.deleteScope atomic cascade + task delete | high | done |
| 3 | Delete control + impact confirm in ProjectDetailPanel | high | done |
| 4 | Wire refetch + success/error feedback | medium | done |
| 5 | Server tests: service atomicity + route status codes | medium | done |
| 6 | Client test: confirm counts, cancel, refetch | low | done |
| 7 | MCP: DeleteScopeInputSchema + permission matrix entry | high | done |
| 8 | MCP: project.delete_scope handler + tool definition | high | done |
| 9 | MCP tests: dryRun, force guard, scoping, permissions | medium | done |

### Amendment A — 2026-09-23 — T007–T009 built; the FK map corrected

Built to unblock SCOPE-124/T015, which had waited on `project.delete_scope` since this
scope shipped its web half.

**T008's task text was right about the trap and wrong about its width.** Verified against
`pg_constraint` rather than taken on trust — eight FKs reference `projectspecifications`,
not one:

| Rule | Tables |
|---|---|
| `CASCADE` — removed automatically | `projectdocuments`, `scopeconversations`, `specificationphases`, `testplans` |
| `SET NULL` — row survives, link lost | **`projecttasks`** (the documented trap), plus `auditexecutions`, `testplanitems`, `testruns` |
| no FK at all | `aispecsessions` carries a `specid` and is unconstrained |

So deleting the spec first detaches four child sets, not one. `projecttasks` is deleted
explicitly before the spec row, matching `ScopeService.deleteScope`. The other three are
QA and audit history, so the link is nulled rather than the record destroyed — which is
also what the web route does. **The response reports those counts** rather than letting
the orphaning happen silently; that is the only part that diverges from the web route,
and it diverges by saying more, not by doing more.

`aispecsessions` is left alone: no constraint, and no evidence it is in use.

20 tests in `mcp-server/tests/scope-098-t009-delete-scope.test.ts`. The ordering guard is
mutation-verified — swapping the two deletes fails that test and only that test.

## Task Details

### T001 — Add DELETE /:id/scopes/:scopeid route

In src/server/routes/projects.ts, add DELETE /:id/scopes/:scopeid near the existing PATCH /:id/scopes/:scopeid/status (~line 1471), reusing scopeParamsSchema. Gate with authenticateToken + requireAuth + the same project-access check the sibling scope routes use (any project member, NOT requireAdmin). Return { success, message } on success, 404 when the scope is not found under :id, 401/403 when unauthorized. Implements FR-001. (task-id: c346b105-ff94-4fd8-865e-305bd8517346)

### T002 — ScopeService.deleteScope atomic cascade + task delete

In src/server/services/ScopeService.ts add deleteScope(projectid, scopeid) alongside overrideStatus. Wrap in db.transaction: (1) verify the scope exists and projectid matches else return not-found; (2) delete projecttasks where specid = scopeid; (3) delete projectspecifications where id = scopeid and projectid = projectid. DB cascade removes documents/spec-phases/scope-chat/test-plans. Return a boolean/summary. Uses src/db/client.ts. Implements FR-002. (task-id: 486adbeb-9921-4029-8758-96671b3d7abd)

### T003 — Delete control + impact confirm in ProjectDetailPanel

In src/client/components/Projects/ProjectDetailPanel.tsx add a Delete button to ScopeActionButtons (~line 722). The handler builds the impact string from the scope's already-loaded task count + documents length, calls window.confirm naming the scope and the counts, then issues DELETE /:id/scopes/:scopeid. Follows the app's window.confirm delete convention (ScopeKanbanBoard.tsx:298). shadcn/Tailwind to match the sibling action buttons. Implements FR-003. (task-id: 60d2105b-7fb6-48fb-abd3-9bd160927ff5)

### T004 — Wire refetch + success/error feedback

On delete success call the existing onRefetch() (handleRefetch, ~line 1141) so the scope disappears and show a success message; on error show a clear message and refetch to resync to server truth. Implements FR-004. (task-id: b02cd3ba-6049-4b30-bc83-f059c638e520)

### T005 — Server tests: service atomicity + route status codes

Test ScopeService.deleteScope deletes tasks + scope atomically, is project-scoped (won't delete a cross-project scopeid), and returns not-found for a missing/foreign scope. Test the route: 200 happy path, 404 stale/foreign scope, 401/403 unauthenticated. Verifies FR-001, FR-002. (task-id: 75d9d5cc-0b40-4470-888a-9347c764d29d)

### T006 — Client test: confirm counts, cancel, refetch

Test that the delete confirm shows the correct task and document counts, that cancelling makes no request, and that a successful delete triggers the panel refetch. Verifies FR-003, FR-004. (task-id: 3968e18e-deb4-4a8a-97b3-8b804f24b989)

---

## Amendment A tasks — MCP surface (2026-08-03)

From feedback a5c4b345. These land in `mcp-server/`, NOT the app — the hosted MCP auto-deploys on push to main, so nothing here ships until the user gates the push.

### T007 — MCP: DeleteScopeInputSchema + permission matrix entry

In `mcp-server/src/utils/schemas.ts`, add `DeleteScopeInputSchema` next to `MergeScopeInputSchema` (~line 407): `projectId` (uuid), exactly one of `specId` (uuid) / `specNumber` (string, 1–10 chars) via a `.refine` mirroring `TaskSpecLinkSchema` (~line 423), plus `dryRun` and `force` booleans defaulting to false. Export the inferred type. In `mcp-server/src/auth/role-checker.ts`, add `'project.delete_scope': ['editor', 'admin']` to `PERMISSION_MATRIX` beside the `merge_scope` entry (~line 45). Implements FR-005 (input contract + authorization).

### T008 — MCP: project.delete_scope handler + tool definition

In `mcp-server/src/server.ts`: import `DeleteScopeInputSchema`; add `'project.delete_scope'` to the project-scoped tool-name list (~line 285); add the `case 'project.delete_scope'` handler next to `merge_scope` (~line 2485); add the tool definition block next to the `merge_scope` definition (~line 4221).

Handler: resolve the target from `selectScoped(projectspecifications)` by `specId` or `specNumber` — not-found returns the `{ success:false, blocked:true, message }` shape. Count its `projecttasks` and `projectdocuments`. If either is non-zero and `force` is false, return blocked, naming both counts. If `dryRun`, return the counts and mutate nothing. Otherwise delete the scope's `projecttasks` FIRST — the `specid` FK is `SET NULL`, so skipping this orphans every task rather than removing it; `merge_scope` never needed this step (it reassigns children) so there is no MCP precedent to copy — then delete the `projectspecifications` row filtered by BOTH `id` and `projectId`, letting the FK cascade take documents, spec-phases, scope conversations, and test plans. Record to `events` via `insertScoped` with `actor: 'delete_scope'` and the removed counts in metadata. Implements FR-005.

### T009 — MCP tests: dryRun, force guard, scoping, permissions

Cover every FR-005 acceptance bullet: empty-scope delete reports 0/0; `dryRun` leaves all rows intact; a scope with tasks or documents is blocked without `force` and fully deleted with it (assert 0 remaining `projecttasks` with that `specid` — the orphan trap in T008); neither-or-both of `specId`/`specNumber` is a validation error; a cross-project `specId` is not-found with nothing deleted; a `read_only` token is refused; an `events` row is written. Verifies FR-005.
