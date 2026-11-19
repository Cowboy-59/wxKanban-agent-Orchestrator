# SCOPE-098: Delete Scope on Project Detail

**Scope Number**: SCOPE-098
**Status**: `draft`
**Created**: 2026-07-13
**Last Reviewed**: 2026-08-03 (Amendment A — MCP surface; from field feedback a5c4b345)
**Depends On**: SCOPE-012 (Scope card/board UI + `projectspecifications` model), the `/:id/scopes/*` route family + `ScopeService`.
**Related Scopes**: Extends the scope-management surface on the project detail page (create/edit/status) with a delete action. No overlap with SCOPE-012 (board) or SCOPE-077 (scope-change events).
**Source**: `specs/Project-Scope/098-delete-scope.md`

---

## Overview

A project accumulates scopes (`projectspecifications` rows — "scope" and "spec" are the same entity) on its detail page. Some are created by mistake, superseded, or abandoned. Today there is no way to remove one from the app: the project detail panel only creates, edits, and changes status. The only workaround is deleting at the DB level, which non-technical users can't do, so dead scopes pile up in the Design panel and skew the lifecycle rollups.

> **Correction (Amendment A, 2026-08-03).** This paragraph originally said the workaround was
> "deleting at the DB/MCP level." The MCP half was never true — the hosted MCP has never had a
> scope-delete tool, and `project.merge_scope` hard-refuses any pair of specs that don't share a
> `specNumber`. A kit/agent session therefore had **no** removal path at all. Amendment A adds one.

This scope adds a per-scope **Delete** action on the project detail page that permanently removes a scope and everything under it. Deleting calls a new `DELETE /api/projects/:id/scopes/:scopeid`, which — in one transaction — deletes the scope's tasks and then the `projectspecifications` row (the DB FK cascade removes its documents, spec-phase history, scope conversations, and test plans). The panel refetches so the scope disappears immediately.

## Business Problem

Every project's detail page lists its scopes, but the app gives no way to delete one. A member who creates a scope by mistake, or whose scope is superseded, is stuck with it forever unless a developer removes the row directly from the database — which ordinary users cannot and should not do. The result is cluttered Design panels, misleading lifecycle/progress rollups that count dead scopes, and repeated "can you delete this for me" requests to the technical team. The desired outcome is a safe, self-service delete that removes the scope and all of its children in one confirmed action, scoped to the project, with no database access required.

### Core Design

| Element | Delete Scope on Project Detail |
| --- | --- |
| **Primary Actor** | Any authenticated project member viewing a project's detail page who wants to remove an unwanted scope |
| **Secondary Actor** | `ScopeService` (new `deleteScope`) and the project-panel query that re-renders the scope list |
| **Key Value** | A member can permanently remove a mistaken or dead scope and all its children in one confirmed action, without DB access |
| **Boundary — IN** | Per-scope Delete control in the Design panel's `ScopeActionButtons`; a `window.confirm` that names the scope and states the impact (task count + document count); `DELETE /:id/scopes/:scopeid`; `ScopeService.deleteScope` deletes the scope's tasks then the scope row in one transaction (cascade handles documents/spec-phases/scope-chat/test-plans); refetch on success; any project member may delete |
| **Boundary — OUT** | Soft-archive / undo / restore (hard delete only); removing the on-disk `specs/Project-Scope/*.md` file (the app writes DB only — the kit syncs the filesystem); reconciling number-keyed soft references (feedback.linkedspecid, engagementassignments.scopeid, aispecsessions.specid); bulk delete; a shared ConfirmDialog component |

---

## User Scenarios

### US1 — Delete a mistaken scope (happy path)
A member views a project's Design panel, sees a scope created by mistake, and clicks its Delete control. A confirm shows "This permanently deletes scope 042 'X' and its N tasks and M documents. Continue?". They confirm.
**Expected:** the delete succeeds; the scope's tasks and the scope row (with cascaded documents/spec-phases/scope-chat/test-plans) are gone; the panel refetches and the scope no longer appears; a success message shows.

### US2 — Cancel the confirm
The member clicks Delete but cancels at the confirm.
**Expected:** no request is made and nothing changes.

### US3 — Delete a scope with no tasks or documents
A bare scope (no tasks, no documents) is deleted.
**Expected:** the row is removed cleanly; the confirm reflects "0 tasks, 0 documents"; success.

### US4 — Scope already gone or wrong project
The member deletes a scope that was already deleted (stale panel), or a `scopeid` that does not belong to `:id`.
**Expected:** the endpoint returns 404 (not found for this project); the UI shows a friendly error and refetches to resync. No partial deletes, no cross-project deletion.

### US5 — Delete fails mid-operation
The task-delete or the scope-delete errors (DB issue).
**Expected:** the operation is atomic (single transaction) — either everything is deleted or nothing is; the UI surfaces the error and the scope remains.

---

## Functional Requirements

### FR-001 — Delete endpoint
Add `DELETE /api/projects/:id/scopes/:scopeid` (authenticated, project-access-checked, `scopeParamsSchema`). It deletes the scope only when the scope belongs to `:id`; returns `{ success, message }` on success and 404 when the scope is not found under that project. Access matches the sibling scope routes (any project member — not admin-gated).
**Acceptance:**
- [ ] `DELETE /:id/scopes/:scopeid` for a scope in that project → 200 `{ success: true }`, row gone
- [ ] scopeid not under `:id` (or already deleted) → 404, nothing deleted
- [ ] Unauthenticated / no project access → 401/403

### FR-002 — Cascade + task deletion in one transaction
`ScopeService.deleteScope(projectid, scopeid)` MUST, in a single transaction, delete the scope's tasks (`projecttasks WHERE specid = scopeid`) and then the `projectspecifications` row; the DB FK cascade removes its documents, spec-phases, scope conversations, and test plans. The delete is always filtered by `projectid`.
**Acceptance:**
- [ ] After delete: 0 `projecttasks` with that `specid`; 0 `projectdocuments`/`specificationphases`/`scopeconversations`/`testplans` for that scope
- [ ] A failure at any step rolls back the whole delete (atomic — no orphans, no partial state)
- [ ] A `scopeid` from another project is never touched (project-scoped)

### FR-003 — Per-scope Delete control on the panel
Add a Delete control to the scope row's `ScopeActionButtons` on the project detail page. Clicking it opens a `window.confirm` that names the scope (number + title) and states the impact (task count + document count) before proceeding.
**Acceptance:**
- [ ] Each scope row in the Design panel shows a Delete control
- [ ] The confirm names the scope and shows how many tasks and documents will be deleted
- [ ] Cancelling the confirm performs no request and no change

### FR-004 — Refresh + feedback
On success the panel refetches (via the existing `handleRefetch`) so the scope disappears; a success message shows. On error, a clear message shows and the panel refetches to resync to server truth.
**Acceptance:**
- [ ] Successful delete removes the scope from the list without a manual reload
- [ ] Success and error both surface user-visible feedback
- [ ] After an error (e.g. 404 stale), the list resyncs to server truth

---

## Technical Sections

### Data / Schema
No schema change. The scope's tasks are deleted in the service rather than migrating the `projecttasks.specid` FK from `SET NULL` to `CASCADE` — explicit, no migration, matches the app's direct-DB pattern. All other children (`projectdocuments`, `specificationphases`, `scopeconversations`, `testplans`) already cascade on the `projectspecifications` FK.

### API Routes
New `DELETE /:id/scopes/:scopeid` in `src/server/routes/projects.ts`, near the existing `PATCH /:id/scopes/:scopeid/status` (~line 1471), reusing `scopeParamsSchema`. Gate: `authenticateToken` + `requireAuth` + the same project-access check the sibling scope routes use (any project member — NOT `requireAdmin`).

### Service
New `ScopeService.deleteScope(projectid, scopeid)` in `src/server/services/ScopeService.ts`, alongside `overrideStatus`. Wrap in `db.transaction`: (1) verify the scope exists and `projectid` matches → else not-found; (2) `delete projecttasks where specid = scopeid`; (3) `delete projectspecifications where id = scopeid and projectid = projectid`. Return a boolean/summary. Uses `src/db/client.ts`.

### Frontend Components
`src/client/components/Projects/ProjectDetailPanel.tsx`: add a Delete button to `ScopeActionButtons` (~line 722). The handler builds the impact string from the scope's already-loaded task count + documents length, calls `window.confirm`, then issues the `DELETE`, then calls the existing `onRefetch()` (`handleRefetch`, ~line 1141). Follows the app's `window.confirm` delete convention (e.g. `ScopeKanbanBoard.tsx:298`). shadcn/Tailwind styling to match the sibling action buttons.

### Tests
- Server: `ScopeService.deleteScope` deletes tasks + scope atomically, is project-scoped (won't delete a cross-project scopeid), returns not-found for a missing/foreign scope. Route: 200 happy path, 404 stale/foreign, 401/403 unauth.
- Client: the confirm shows the correct counts; cancel makes no request; success triggers refetch.

### Conventions
TypeScript (no `any`); Pino logging; shadcn/Tailwind for the control. Fences written by the orchestrator at implement. App feature — deploys with the app on push; no hosted-MCP change. Nothing pushed until the user says so.

---

## Success Criteria

1. **A member can delete a scope from the panel in ≤ 2 clicks + 1 confirm**, with no DB access and no manual page reload — the scope disappears from the Design panel on success. *(FR-003, FR-004)*
2. **Delete is complete and atomic:** after deleting a scope with N tasks and M documents, there are 0 tasks with that `specid`, 0 of its documents/spec-phases/scope-chat/test-plans, and a mid-operation failure leaves 100% of the data intact. *(FR-002)*
3. **Delete is project-scoped:** a `scopeid` that doesn't belong to `:id` is never deleted — 0 cross-project deletions — and returns 404. *(FR-001, FR-002)*
4. **The confirm states the real impact:** it names the scope and shows the exact task and document counts that will be removed before the user commits. *(FR-003)*
5. **Errors resync, never mislead:** a stale/404 delete surfaces a clear message and the list refetches to server truth. *(FR-004)*

---

## Constraints & Notes

### Constraints
- **Hard delete, irreversible.** No archive/undo/restore — once confirmed, the scope and its children are gone. The impact-stating confirm is the only safety gate.
- **Atomic + project-scoped.** Task-delete + scope-delete run in one transaction, always filtered by `projectid`. A failure rolls back; a foreign `scopeid` is never touched.
- **Any project member.** Not admin-gated (product decision) — same access check as the sibling scope routes.
- **DB-only.** The app deletes DB rows; it does not remove the on-disk `specs/Project-Scope/*.md` file or reconcile number-keyed soft references.
- **Orchestrator-first.** createSpecs → implement; fences by the orchestrator. Nothing pushed until the user gates it.

### Dependencies
- `ScopeService` + the `/:id/scopes/*` route family and `scopeParamsSchema`.
- The project-panel query / `handleRefetch` in `ProjectDetailPanel.tsx`.
- FK cascades on `projectdocuments`/`specificationphases`/`scopeconversations`/`testplans` (verify the live plural `projectdocuments` schema at implement).

### Out of Scope
- Soft-archive / undo / restore, bulk delete, and a shared ConfirmDialog component.
- Drift cleanup: on-disk scope files and number-keyed soft references (`feedback.linkedspecid`, `engagementassignments.scopeid`, `aispecsessions.specid`) are left as-is — flagged, not solved.

### Notes
- **Known drift risk:** deleting the DB row while the `specs/Project-Scope/NNN-*.md` file remains means a later kit FS-sync could reintroduce the scope. Follow-up if it bites; out of scope here.
- **Schema caveat:** two near-identical `projectdocuments` schema files exist (singular `projectdocument.ts` vs plural `projectdocuments.ts`); `ScopeService` imports the plural (live) one — use and verify that one's cascade at implement.
- **Process:** authored in-conversation; createSpecs → implement next. App feature; no hosted-MCP change (*superseded by Amendment A — the MCP surface DOES change the hosted MCP*).

---

## Amendment A — MCP surface for scope deletion (2026-08-03)

**Trigger:** field feedback `a5c4b345-cd91-4a4e-bbb2-538835ad0ee2` (suggestion, severity low), raised from
project `1b7ff890-ab5d-476e-9fd6-2369af59457a` — a WinDev email-client conversion carrying six empty
boilerplate scopes (specNumbers 001–006, status `draft`, 0 tasks each) with no way to remove them.

### The gap

The FR-001…FR-004 delete shipped **app-only**. Everything a browser user needs is there:
`ScopeService.deleteScope` (`src/server/services/ScopeService.ts:459`), `DELETE /api/projects/:id/scopes/:scopeid`
(`src/server/routes/projects.ts:1514`), the panel + kanban controls, and i18n across all six locales.

None of it is reachable from the hosted MCP. The only scope-removal tool there is `project.merge_scope`
(`mcp-server/src/server.ts:2485`), which is a **dedup** tool by construction: it blocks unless both rows
exist in the project *and* share a `specNumber`, because its whole job is reassigning one duplicate's
children onto a keeper. An unwanted scope with no counterpart has nothing to merge into, so the tool
correctly refuses and the user is stuck.

This is a transport gap, not a semantics gap — the delete behaviour is already specified (FR-002) and built.
Amendment A exposes the existing service over MCP; it does not redefine what deleting means.

### FR-005 — `project.delete_scope` MCP tool

Add `project.delete_scope` to the hosted MCP, with the same semantics FR-002 already specifies: in one
transaction delete the scope's `projecttasks` (the `specid` FK is `SET NULL`, so they must be deleted
explicitly rather than orphaned), then the `projectspecifications` row, letting the FK cascade take its
documents, spec-phases, scope conversations, and test plans.

Input targets the scope by `projectId` plus **exactly one** of `specId` (uuid) or `specNumber` — the
same either/or shape `TaskSpecLinkSchema` already uses (`mcp-server/src/utils/schemas.ts:423`), so an
agent that only knows "spec 001" doesn't have to resolve a uuid first. Two safety flags:

- `dryRun` (default `false`) — report exactly what *would* be removed and change nothing, mirroring `merge_scope`.
- `force` (default `false`) — required only when the scope still has tasks or documents. Deleting an
  **empty** scope (the reported case, and the common one) needs no flag; destroying real work takes a
  deliberate second signal. Without it the tool returns the `{ success:false, blocked:true, message }`
  shape `merge_scope` already established, naming the counts that blocked it.

Permission: `['editor','admin']` in `PERMISSION_MATRIX`, matching `merge_scope` — an irreversible write.
Project-scoped like every other tool: a `specId` outside the token's project is not found, never deleted.

**Acceptance:**
- [ ] `delete_scope` on an empty in-project scope removes the row; the response reports 0 tasks / 0 documents
- [ ] `dryRun: true` reports the same counts and leaves every row in place
- [ ] A scope with tasks or documents is **blocked** without `force`, and deleted with it (tasks gone, cascade complete)
- [ ] Exactly one of `specId` / `specNumber` is accepted — neither or both is a validation error
- [ ] A `specId` belonging to another project is reported not-found and nothing is deleted
- [ ] A `read_only` token is refused by the permission matrix
- [ ] The delete is recorded to `events` (`actor: 'delete_scope'`), as `merge_scope` records its merge

### Technical notes

Five touchpoints, mirroring how `merge_scope` is wired:

| File | Change |
| --- | --- |
| `mcp-server/src/utils/schemas.ts` | `DeleteScopeInputSchema` + type (next to `MergeScopeInputSchema`, ~line 407) |
| `mcp-server/src/server.ts` | import the schema; `case 'project.delete_scope'` handler; tool definition block |
| `mcp-server/src/server.ts` | add to the project-scoped tool-name list (~line 285) |
| `mcp-server/src/auth/role-checker.ts` | `PERMISSION_MATRIX` entry `['editor','admin']` (~line 45) |
| `tests/` | tool tests per the acceptance list above |

The handler reimplements the transaction against the MCP's `scoped` DB helper rather than importing
`ScopeService` — the MCP server is a separate deployable with its own schema mirror and cannot import
from `src/server/`. **The `projecttasks` delete is the part that must not be dropped in translation:**
`merge_scope` never needed it (it reassigns children), so there is no existing MCP precedent for it, and
omitting it silently orphans every task under the deleted scope. Audit to `events` via `insertScoped`
(the MCP path has no `companyauditlogs` equivalent), not to `companyauditlogs`.

### Deployment

Unlike FR-001…FR-004 this is **not** an app change — it lands in `mcp-server/` and the hosted MCP
auto-deploys on push to `main`. Nothing pushed until the user gates it.

### Amendment A — Out of Scope

- `project.archive_scope`. `ScopeService.archiveScope` (SCOPE-103) is *also* app-only and has the same
  MCP gap, but the product decision here was delete-only. Logged as a known gap, not solved.
- Bulk delete. One scope per call; an agent loops if it has six to remove.
- On-disk `specs/Project-Scope/*.md` cleanup and number-keyed soft references — unchanged from the
  parent scope's Out of Scope, and the drift risk noted above applies equally to the MCP path.
- The upstream question of *why* project `1b7ff890` had six HIPAA/PHI-flavoured boilerplate scopes.
  Those names appear nowhere in this repo, so the reporter's "leftover starter-kit seed scopes" reading
  is unverified and probably wrong — more likely a `buildscope`/`createSpecs` run with a compliance
  framework loaded. Worth its own look; not this amendment.

### Amendment A — Open Question

- **`force` flag — keep or drop?** Decided: keep. It makes the reported case (empty scopes) a one-call
  no-ceremony delete while making an agent spend a second signal to destroy real work. If you'd rather
  the tool match `merge_scope`'s simpler single-flag shape, strike `force` and FR-005's third acceptance
  bullet — nothing else depends on it.
