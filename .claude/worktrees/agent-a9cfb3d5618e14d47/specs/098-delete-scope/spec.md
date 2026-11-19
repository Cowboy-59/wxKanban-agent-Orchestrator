# Spec 098: Delete Scope on Project Detail

## Overview

A project accumulates scopes (`projectspecifications` rows — "scope" and "spec" are the same entity) on its detail page. Some are created by mistake, superseded, or abandoned. Today there is no way to remove one from the app: the project detail panel only creates, edits, and changes status. The only workaround is deleting at the DB level, which non-technical users cannot do, so dead scopes pile up in the Design panel and skew the lifecycle rollups.

> **Correction (Amendment A, 2026-08-03).** This paragraph originally offered "the DB or MCP level" as the workaround. The MCP half was never true: the hosted MCP has never had a scope-delete tool, and `project.merge_scope` refuses any pair of specs that do not share a `specNumber`. FR-005 adds the missing MCP path.

This scope adds a per-scope Delete action on the project detail page that permanently removes a scope and everything under it. Deleting calls a new DELETE /api/projects/:id/scopes/:scopeid, which in one transaction deletes the scope's tasks and then the projectspecifications row (the DB foreign-key cascade removes its documents, spec-phase history, scope conversations, and test plans). The panel refetches so the scope disappears immediately.

## Business Problem

Every project's detail page lists its scopes, but the app gives no way to delete one. A member who creates a scope by mistake, or whose scope is superseded, is stuck with it forever unless a developer removes the row directly from the database, which ordinary users cannot and should not do. The result is cluttered Design panels, misleading lifecycle and progress rollups that count dead scopes, and repeated "can you delete this for me" requests to the technical team. The desired outcome is a safe, self-service delete that removes the scope and all of its children in one confirmed action, scoped to the project, with no database access required.

## Actors

- Primary: Any authenticated project member viewing a project's detail page who wants to remove an unwanted scope and all of its children without database access.
- Secondary: ScopeService.deleteScope (the atomic delete transaction) and the project-panel query that re-renders the scope list after a successful delete.

## Success Metrics

1. A member deletes a scope in 2 clicks plus 1 confirm with no database access and 0 manual page reloads; the scope disappears from the Design panel on success.
2. Delete is complete and atomic: after deleting a scope with N tasks and M documents there are 0 tasks with that specid and 0 of its documents, spec-phases, scope-chat, and test-plans, and a mid-operation failure preserves 100% of the data.
3. Delete is project-scoped: a scopeid that does not belong to the :id project is never deleted (0 cross-project deletions) and returns HTTP 404.
4. The confirm states the real impact, showing the exact task count and document count (2 numbers) before the user commits.

## Scope Boundary

In scope: a per-scope Delete control in the Design panel's ScopeActionButtons; a window.confirm that names the scope and states the impact (task count plus document count); a new DELETE /api/projects/:id/scopes/:scopeid route in src/server/routes/projects.ts reusing scopeParamsSchema; a new ScopeService.deleteScope(projectid, scopeid) in src/server/services/ScopeService.ts that deletes the scope's tasks then the scope row in one db.transaction (cascade handles documents, spec-phases, scope conversations, and test plans); refetch via the existing handleRefetch on success; access allowed to any project member (not admin-gated). Added by Amendment A: a `project.delete_scope` tool in `mcp-server/` exposing the same delete over MCP for kit and agent sessions (FR-005).

## Out of Scope

Deliberately excluded: soft-archive, undo, and restore (this is hard delete only); removing the on-disk specs/Project-Scope/*.md file (the app writes DB only — the kit syncs the filesystem); reconciling number-keyed soft references (feedback.linkedspecid, engagementassignments.scopeid, aispecsessions.specid); bulk delete; and a shared ConfirmDialog component (the app uses window.confirm today). No schema migration: the scope's tasks are deleted in the service rather than flipping the projecttasks.specid foreign key from SET NULL to CASCADE.

## Open Questions

None outstanding. Four decisions were made with the product owner during scope authoring: hard delete plus cascade (not archive), delete the scope's tasks too (not orphan them), any project member may delete (not admin-only), and delete DB rows only (leave the on-disk file to the kit).

## Functional Requirements

### FR-001 — Delete endpoint

Add DELETE /api/projects/:id/scopes/:scopeid (authenticated, project-access-checked, scopeParamsSchema). It deletes the scope only when the scope belongs to :id; returns { success, message } on success and 404 when the scope is not found under that project. Access matches the sibling scope routes (any project member, not admin-gated).

**Acceptance Criteria**:
- [ ] DELETE for a scope in that project returns 200 { success: true } and the row is gone
- [ ] scopeid not under :id (or already deleted) returns 404 and nothing is deleted
- [ ] Unauthenticated or no project access returns 401 or 403

### FR-002 — Cascade plus task deletion in one transaction

ScopeService.deleteScope(projectid, scopeid) MUST, in a single transaction, delete the scope's tasks (projecttasks where specid = scopeid) and then the projectspecifications row; the DB foreign-key cascade removes its documents, spec-phases, scope conversations, and test plans. The delete is always filtered by projectid.

**Acceptance Criteria**:
- [ ] After delete there are 0 projecttasks with that specid and 0 of its documents, spec-phases, scope conversations, and test plans
- [ ] A failure at any step rolls back the whole delete (atomic, no orphans, no partial state)
- [ ] A scopeid from another project is never touched (project-scoped)

### FR-003 — Per-scope Delete control on the scope surfaces

Add a Delete control to the scope UI on the project detail page. Implemented on BOTH scope surfaces: (a) the ProjectDetailPanel Design panel's ScopeActionButtons, and (b) the ScopeKanbanBoard scope cards (a trash icon in the card header) — the kanban board is the surface users actually operate on. Clicking it opens a window.confirm that names the scope (number plus title) and states the impact (task count plus document count) before proceeding.

**Acceptance Criteria**:
- [x] Each scope card on the kanban board shows a Delete (trash) control; each Design-panel scope row shows a Delete control
- [x] The confirm names the scope and shows how many tasks and documents will be deleted
- [x] Cancelling the confirm performs no request and no change

### FR-004 — Refresh plus feedback

On success the panel refetches (via the existing handleRefetch) so the scope disappears; a success message shows. On error, a clear message shows and the panel refetches to resync to server truth.

**Acceptance Criteria**:
- [ ] Successful delete removes the scope from the list without a manual reload
- [ ] Success and error both surface user-visible feedback
- [ ] After an error (for example a 404 stale delete), the list resyncs to server truth

### FR-005 — `project.delete_scope` MCP tool (Amendment A)

FR-001 through FR-004 shipped app-only, leaving MCP/kit sessions with no scope-removal path at all: the hosted MCP's only related tool, `project.merge_scope`, blocks unless two specs share a `specNumber` (it is a dedup tool, and an unwanted scope has nothing to merge into). Add `project.delete_scope` to `mcp-server/`, applying the same transaction FR-002 specifies — delete the scope's `projecttasks` explicitly (the `specid` FK is `SET NULL`, so they would otherwise orphan), then the `projectspecifications` row, letting the FK cascade take documents, spec-phases, scope conversations, and test plans.

Input: `projectId` plus exactly one of `specId` (uuid) or `specNumber`, matching the either/or shape of the existing `TaskSpecLinkSchema`. Flags: `dryRun` (default false) reports what would be removed and mutates nothing; `force` (default false) is required only when the scope still has tasks or documents, so deleting an empty scope needs no ceremony while destroying real work takes a deliberate signal. Blocked calls return `{ success: false, blocked: true, message }`, the shape `merge_scope` established. Permission `['editor','admin']`; project-scoped; the delete is recorded to `events` with `actor: 'delete_scope'`.

The handler reimplements the transaction against the MCP's `scoped` DB helper — `mcp-server/` is a separate deployable and cannot import `ScopeService` from `src/server/`. This is the only requirement in this spec that deploys with the hosted MCP rather than the app.

**Acceptance Criteria**:
- [ ] Deleting an empty in-project scope removes the row and reports 0 tasks / 0 documents
- [ ] `dryRun: true` reports the same counts and leaves every row in place
- [ ] A scope with tasks or documents is blocked without `force`, and fully deleted with it
- [ ] Exactly one of `specId` / `specNumber` is accepted; neither or both is a validation error
- [ ] A `specId` from another project is reported not-found and nothing is deleted
- [ ] A `read_only` token is refused by the permission matrix
- [ ] The delete is recorded to `events` with `actor: 'delete_scope'`

## Phase

**Current Phase**: design
**Priority**: medium

## Status

- **Date**: 2026-08-03 (Amendment A — FR-005 MCP surface; from feedback a5c4b345)
- **Phase**: design
- **Spec ID**: 0fc853be-2519-43ce-8867-5b3addcc8236
