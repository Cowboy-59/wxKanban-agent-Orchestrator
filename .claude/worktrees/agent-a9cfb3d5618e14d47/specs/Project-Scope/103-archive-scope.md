# SCOPE-103: Archive Scope/Spec Group

**Spec Number**: 103 (SCOPE namespace)
**Status**: `draft`
**Created**: 2026-07-18
**Depends On**: SCOPE-098 (delete-scope — the destructive sibling this mirrors non-destructively)
**Related**: SCOPE-101 (spec status/transitions), SCOPE-013 (audit log retention)
**Source**: `specs/Project-Scope/103-archive-scope.md`

---

## Overview

Archive a scope/spec group non-destructively via a new `archived` status. Setting a scope to
`archived` hides it from every working surface (cockpit, lifecycle, devplan, scopeflow, project
panel) and, via the kit's file sync, moves its on-disk files to an archive folder. Unarchiving
restores the scope's prior status and moves the files back. It is the reversible sibling of delete
(SCOPE-098): no rows and no files are ever destroyed — only flagged and moved.

## Business Problem

Completed, abandoned, or superseded scopes accumulate and clutter every surface that lists specs —
the cockpit, the lifecycle and devplan docs, the scopeflow map, and the project detail panel — because
nothing filters them out. Today the only way to clear one from view is to **delete** it, which is
destructive and irreversible (SCOPE-098). An operator needs to retire a scope/spec group from view
while keeping it fully recoverable, so the working views show only live work without losing history.

## Actors

- Primary: Project member managing scopes who wants to retire a scope/spec group from the working views.
- Secondary: The kit file-sync that moves the on-disk group to and from the archive folder; and readers of the cockpit, lifecycle, devplan, and scopeflow who benefit from a view limited to live scopes.

## Scope Boundary

- A new `archived` spec status. The `status` column is a free `varchar(50)` with no DB enum, so no migration is needed; the value is added to the `update_spec_status` Zod enum, the tool registration JSON-Schema enum, and the `ScopeStatus` union, plus the vocabulary comments in both schema files.
- Archive action: set `status='archived'`, capturing the prior status in an audit row so it can be restored. Any project member may archive.
- Unarchive action: restore the prior status from the most recent archive audit row (fallback to `draft` if it was pruned), and write an unarchive audit row.
- Hide archived scopes from all working read surfaces by adding a `status != 'archived'` exclusion at each site: the cockpit query, the lifecycle generator, the devplan generator, the scopeflow generator, `ScopeService.getScopes`, and the `list_open_items` documents path; and handle `archived` in the phase-matrix status thresholds.
- Kit file-sync: on archive, move the on-disk group (`specs/Project-Scope/NNN-*.md` plus the `specs/NNN-name/` folder) into an archive folder to match the DB status; on unarchive, move it back. Reversible.
- One explicit opt-in archived listing (a status filter) so archived scopes can be found and restored.
- Audit rows `scope_archived` and `scope_unarchived` on each transition.

## Out of Scope

- Deleting any row or file — that is SCOPE-098; archive only flags and moves.
- Any Postgres enum or CHECK-constraint migration (the column stays free `varchar`).
- Bulk or multi-select archive — single scope first.
- Archiving individual specs within a group separately — the whole scope/spec group is the unit.
- A new hand-authored lifecycle state machine; archive reuses the existing free-status write path.

## User Scenarios & Testing

### US1 — Retire a finished scope (happy path)

A project member finishes a scope and no longer wants it in the working views. They set its status to
`archived`. It immediately disappears from the cockpit, the lifecycle and devplan docs, the scopeflow
map, and the project panel; the kit sync moves its files into the archive folder. No data is lost.
**Expected:** the scope shows in none of the working surfaces after archiving; an audit row records the
archive with the prior status; the on-disk group is in the archive folder.

### US2 — Bring one back (unarchive)

Later the member needs the archived scope again. From the explicit archived listing they unarchive it.
Its prior status is restored, it reappears on every surface, and the kit sync moves its files back.
**Expected:** unarchive restores the exact prior status (or `draft` if the archive audit was pruned);
the scope reappears everywhere; the files round-trip back with no loss.

### US3 — Archive is not delete (safety)

A member archives a scope, then inspects the database and disk. Every row that delete would have
removed (tasks, documents, conversations, test plans) still exists; every file still exists, just moved
to the archive folder. Nothing is destroyed.
**Expected:** archiving deletes 0 DB rows and 0 files; the only changes are the status value, the audit
rows, and the file move.

## Functional Requirements

### FR-001 — `archived` status value

Add `archived` to the accepted spec-status vocabulary with no DB migration: the `update_spec_status`
Zod enum (`SpecStatusSchema`), the tool-registration JSON-Schema enum, the `ScopeStatus` TypeScript
union, and the vocabulary comments in both the app and MCP schema files.
**Acceptance:** `update_spec_status` accepts `archived`; the `ScopeStatus` type includes it; no DDL
migration is introduced.

### FR-002 — Archive action

An archive action sets `status='archived'` for the target scope, records the prior status in a
`scope_archived` audit row, and is available to any project member. It is non-destructive.
**Acceptance:** archiving sets the status and writes a `scope_archived` audit row containing the prior
status; no rows or files are deleted; any project member can perform it.

### FR-003 — Unarchive action (restore prior status)

An unarchive action restores the scope's prior status from the most recent `scope_archived` audit row
(falling back to `draft` if none survives), and writes a `scope_unarchived` audit row.
**Acceptance:** unarchive restores the exact prior status when the archive audit exists, else `draft`;
a `scope_unarchived` audit row is written; the scope becomes visible again.

### FR-004 — Hide archived from all working surfaces

Every working surface excludes `archived` scopes by adding a `status != 'archived'` condition: the
cockpit query, the lifecycle generator, the devplan generator, the scopeflow generator,
`ScopeService.getScopes`, and the `list_open_items` documents path; the phase-matrix status thresholds
also treat `archived` as inactive.
**Acceptance:** an archived scope appears in none of the five working surfaces and is not counted in
phase-matrix active/threshold logic.

### FR-005 — Kit file-sync to/from the archive folder

The kit sync reconciles files to the DB status: on archive it moves the on-disk group
(`specs/Project-Scope/NNN-*.md` and `specs/NNN-name/`) into an archive folder; on unarchive it moves
the group back to its original location. Reversible with no file loss.
**Acceptance:** after archive the group is in the archive folder and gone from its original location;
after unarchive it is back; all files round-trip with no loss.

### FR-006 — Audit and non-destructive guarantee

Archive and unarchive each write an audit row, and neither deletes any DB row or file — the only
mutations are the status value, the audit rows, and the file move.
**Acceptance:** `scope_archived` / `scope_unarchived` rows exist after each action; a row-count and file
inventory before and after archive differ by 0 deletions.

### FR-007 — Archive control and restore listing

The app panel and cockpit expose an archive/unarchive control, and an explicit opt-in archived listing
(a status filter) lets a member find and restore archived scopes even though they are hidden from the
working surfaces.
**Acceptance:** a member can archive and unarchive from the UI; archived scopes are reachable only
through the explicit archived listing, not the working surfaces.

## Success Criteria

1. Surface hiding: after archiving, the scope appears in 0 of the 5 working surfaces (cockpit, lifecycle, devplan, scopeflow, project panel), verified across all 5.
2. Restore fidelity: unarchive restores the exact prior status in 100% of cases where the archive audit row survives, and `draft` otherwise; the scope reappears on all 5 surfaces.
3. File round-trip: archiving then unarchiving moves 100% of the group's files to the archive folder and back with 0 files lost.
4. Non-destructive: archiving deletes 0 DB rows and 0 files, verified by a before/after inventory against what delete would remove.
5. Access: any project member can archive and unarchive, and each action writes exactly 1 audit row.
6. No migration: the change introduces 0 Postgres DDL migrations (the status column stays `varchar`).

## Data Requirements

No new tables and no DDL. `projectspecifications.status` is already a free `varchar(50)`; `archived`
is a new value only. Prior-status capture reuses the existing `companyauditlogs` table (a
`scope_archived` row carrying the prior status), so no new column is required.

## API Routes

Reuses the existing status write path. The `update_spec_status` MCP tool and the app status route gain
`archived` as an accepted value; the existing dead `POST /api/specifications/:id/archive` stub is either
removed or repointed to this non-destructive path. No brand-new route is required.

## Frontend Components

An archive/unarchive control in the project detail panel's scope actions (alongside the existing
delete control) and a matching affordance in the cockpit, plus a minimal archived listing view for
restore. No new page.

## Technical Notes

Archive mirrors `ScopeService.deleteScope()` structurally (company/project guard, transaction, audit)
but performs an `UPDATE ... SET status='archived'` instead of deletes. Prior status is read back from
the most recent `scope_archived` audit row on unarchive. The DB is the source of truth for status; the
kit sync moves files to match, consistent with the project's "server writes DB, kit syncs the
filesystem" model. This aligns with SCOPE-098 (delete) as the structural template, SCOPE-101 (spec
status), and SCOPE-013 (audit retention — hence the `draft` fallback when an archive audit row has been
pruned).

## Constraints & Risks

- Nothing filters specs by status today, so archived scopes stay visible until the exclusion is added
  at every one of the six read sites — a missed site leaks archived scopes into a working surface.
- Prior-status restore depends on the `scope_archived` audit row; audit retention (SCOPE-013) can prune
  it, so unarchive falls back to `draft`.
- The app writes only the DB; the file move is a kit/sync operation, so status and files can be briefly
  out of sync until the next sync runs.
- "Fully hidden" plus "reversible" requires the one explicit archived listing as the restore entry
  point; without it, archived scopes could not be found to restore.

## Deferred (each its own future scope)

- Bulk / multi-select archive.
- Auto-archive by policy (e.g. archive released scopes older than N days).
- Archiving individual specs within a group independently.

## Clarifications

### Session 2026-07-18 (with the operator)

- Archive covers all three: DB status, hiding from every working surface, and moving the on-disk files.
- Archived scopes are fully hidden from the working surfaces; a single explicit archived listing exists only so they can be found and restored.
- Archiving is reversible and unarchive restores the prior status (audit-backed, `draft` fallback).
- The trigger is a status change to `archived`; any project member may do it.
- Archive is the whole scope/spec group as one unit, and is strictly non-destructive (the reversible sibling of delete, SCOPE-098).
