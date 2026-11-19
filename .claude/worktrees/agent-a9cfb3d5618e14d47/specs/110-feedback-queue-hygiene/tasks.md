# Task Breakdown: Feedback Queue Hygiene

**Feature**: Feedback Queue Hygiene
**Spec**: 110
**Date Generated**: 2026-07-24
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | FR | Priority | Status |
|---|------|----|----------|--------|
| 1 | Schema: add hygiene fields + not-dismissed index (both DBs) | Data | high | todo |
| 2 | FR-008: identity reflects the error, not the page | FR-008 | high | todo |
| 3 | FR-009: intake upserts through the constraint | FR-009 | high | todo |
| 4 | FR-010: recurrence reopens the same record | FR-010 | high | todo |
| 5 | FR-011: manual double-submit guard | FR-011 | high | todo |
| 6 | FR-012: one-time repeatable duplicate merge (both DBs) | FR-012 | high | todo |
| 7 | FR-009: unique index enforced by the database (both DBs) | FR-009 | high | todo |
| 8 | FR-001: dismiss / undismiss (reversible) | FR-001 | high | todo |
| 9 | FR-002 + FR-003: purge with audit, bulk as the primitive | FR-002/003 | high | todo |
| 10 | FR-007: purge confirmation semantics (server half) | FR-007 | high | todo |
| 11 | FR-004 + FR-005: submitter hide + self-delete (MCP) | FR-004/005 | high | todo |
| 12 | FR-006: default-visible list + metrics exclusion | FR-006 | high | todo |
| 13 | FR-003 + FR-007 (UI): console selection + action bar | FR-003/007 | high | todo |
| 14 | FR-007 + FR-010 (UI): source indicator, dismissed filter, purge dialog, regression flag | FR-007/010 | high | todo |
| 15 | Test matrix against the success metrics | All | high | todo |

## Task Details

### T001 — Schema: add hygiene fields + not-dismissed index (both DBs)

Add four optional fields to `feedbacksubmissions` — `dismissedat` (timestamp), `dismissedbyid` (uuid, NO foreign key, matching the existing `dispositionedbyid` pattern), `submitterhiddenat` (timestamp), `reopenedat` (timestamp) — in BOTH the app Drizzle schema (`src/db/schema/feedbacksubmissions.ts`) and the MCP mirror (`mcp-server/src/db/schema.ts`). Add a non-unique index supporting the default not-dismissed queue (btree on `projectid` + `dismissedat`). Generate the Drizzle migration via `npm run db:generate`. Do NOT add the unique fingerprint index here — that lands after the merge (T007). No existing field changes meaning; no new table.

### T002 — FR-008: identity reflects the error, not the page

In `src/server/lib/errorFingerprint.ts`, drop `routePath(e.route)` from the `computeErrorFingerprint` basis array so identity derives only from error class, capture kind (trap point), normalized message, and leading stack frames. The browser route is still recorded and displayed on the record — only identity stops depending on it. Fingerprint is computed app-side only (the MCP server stores but does not compute it), so no mirror change. Verify the same logical error across 10 pages yields one identity, checked against the 10 real prod records. Route through `implement` so the SCOPE-061 fence gets a `MODIFIED-BY` line.

### T003 — FR-009: intake upserts through the constraint

In `ErrorCaptureService`, make auto-error intake upsert on `(projectid, errorfingerprint)`: when a record with the same identity exists, increment `occurrencecount` and update `lastoccurredat` instead of inserting. Correctness relies on the DB unique index (T007), not the in-memory guard, so it holds under simultaneous writes from multiple app instances. Human-submitted rows (`source != 'auto'`) bypass the constraint. Retain the existing in-memory write rate limit as a per-instance volume bound only.

### T004 — FR-010: recurrence reopens the same record

When an occurrence matches an existing record whose status is `resolved` or `declined`, return it to `new`, set `reopenedat`, increment `occurrencecount`, update `lastoccurredat`, and clear any dismissal (`dismissedat`/`dismissedbyid`). Send EXACTLY ONE notification, triggered by the resolved/declined → new transition, not per occurrence. Occurrences against an already-open record only increment the count and send no notification. Record the previously-held status so the console can present the row as a regression. Touches `ErrorCaptureService` + `FeedbackNotificationService`.

### T005 — FR-011: manual double-submit guard

On manual feedback submission, if an identical submission (same submitter, project, type, and title) was created within the previous 60 seconds, return the existing record instead of creating a new one, with a response field making clear it was recognized as a repeat so no client reports a second successful submission. Beyond 60s a genuine repeat is accepted. Applies in both the app submission path and the MCP `submit_feedback` tool.

### T006 — FR-012: one-time repeatable duplicate merge (both DBs)

Write an idempotent backfill script under `scripts/` that, within a single transaction: recomputes each existing auto record's identity under the FR-008 basis, groups by identity, merges each group into its EARLIEST record — summing `occurrencecount`, taking earliest `firstoccurredat`, latest `lastoccurredat`, most-advanced status; appends merged records' `internalnotes` to the survivor (never discarding); deletes absorbed rows; logs every merge decision (survivor id + absorbed ids). Must run BEFORE the FR-009 unique index exists and complete-or-rollback. Apply to BOTH the app prod DB and the hosted MCP DB. Repeatable without harm.

### T007 — FR-009: unique index enforced by the database (both DBs)

After the merge, add a partial UNIQUE index — `unique (projectid, errorfingerprint) WHERE source='auto' AND errorfingerprint IS NOT NULL` — to `feedbacksubmissions` in BOTH Drizzle schemas, replacing/supplementing the existing non-unique `errorFingerprintIdx`. Generate the migration and apply to BOTH the app prod DB and the hosted MCP DB. Declared idempotently in both places. Applying it to un-merged data fails loudly by design — intended and documented. Human-submitted rows are unaffected.

### T008 — FR-001: dismiss / undismiss (reversible)

`FeedbackTriageService` + SysAdmin routes to dismiss and undismiss a SET of submissions. Dismissing records `dismissedat` + `dismissedbyid` (acting admin); undismissing clears both. Status, disposition, and every other triage field are unchanged. Dismissing an already-dismissed record is a no-op, not an error. A dismissed filter lists them showing who dismissed them and when. Both accept a list of identifiers (one record = single-element call on the same code path as FR-003).

### T009 — FR-002 + FR-003: purge with audit, bulk as the primitive

SysAdmin service + route to permanently delete a SET of submissions. For each record write a company-audit-log entry BEFORE deletion carrying id, title, source, submitter, acting admin, and a full snapshot; a failed audit write aborts the whole operation so nothing is deleted unrecorded. Records referencing a purged record via `duplicateofid` survive with that reference cleared. Auto records whose `companyid` is null are audited against the sink project's company, original company preserved in the payload. Bulk is the primitive: accept a list (one = single-element), cap at 200 (201 rejected, never truncated), any invalid id fails the whole set. Purge succeeds regardless of dismissal state. The route requires an explicit confirmation token so a malformed or replayed request cannot destroy records.

### T010 — FR-007: purge confirmation semantics (server half)

Server-side validation of the purge confirmation token: a selection of ONLY automatic records requires a single confirmation; a selection containing ANY human-submitted record requires the typed word `DELETE` and the route echoes the affected human-submitted titles. Enforced server-side, not merely in the UI, so a human report is never destroyed unnoticed inside a bulk sweep of machine noise.

### T011 — FR-004 + FR-005: submitter hide + self-delete (MCP)

One new Cockpit/MCP tool by which a submitter hides or deletes their OWN submissions, routed through the same sink resolution as existing feedback tools. Hide: set `submitterhiddenat` (reversible); the submitter's feedback list excludes hidden items unless explicitly requested; administrator-side visibility is unaffected. Self-delete: audited identically to FR-002; ownership enforced INSIDE the data query (not a route guard) so no future caller can bypass; a request naming another user's record deletes nothing and reports not-found; a mixed set containing any record the caller does not own deletes nothing. Extend the submitter feedback listing with an include-hidden flag.

### T012 — FR-006: default-visible list + metrics exclusion

The SysAdmin feedback listing excludes dismissed records unless explicitly requested (add an include/isolate-dismissed flag). Feedback metrics exclude dismissed records from every figure they compute. Fetching a single record by identifier still returns it when dismissed, so deep links keep working. Verify by test that the metrics total equals the count of non-dismissed records at all times.

### T013 — FR-003 + FR-007 (UI): console selection + action bar

In the existing SysAdmin feedback console (no new page or route): a selection checkbox per row; a header control selecting everything within the current filter with a live selected-count; a persistent action bar shown only when a selection exists, reporting the count and offering dismiss, undismiss, and purge. Follows the project's existing shadcn/ui component conventions and retains the console's current visual language.

### T014 — FR-007 + FR-010 (UI): source indicator, dismissed filter, purge dialog, regression flag

Console UI: an explicit automatic-or-human indicator per row (not title-prefix inference); a dismissed option in the status filter, composable with the source filter; a purge confirmation dialog that states the composition of the selection and demands the typed word `DELETE` whenever a human-submitted record is included, listing the affected titles; and a regression indicator on reopened records showing the status previously held.

### T015 — Test matrix against the success metrics

Vitest + Playwright coverage proving each success metric: the auto backlog falls from 57 to ≤10 after the merge with records equal to distinct identities per project, and that equality still holding (0 projects over) as an enforcement check; uniqueness correct under concurrent writes; removing any number of duplicates in exactly 3 interactions; 100% of permanent deletions have an audit entry INCLUDING the audit-write-fails-abort path (no tolerance); the metrics total equals the count of non-dismissed records; 0 successful deletions of another user's submission across the full matrix including a caller supplying a valid id they do not own; a resolved error that recurs produces exactly 1 notification.
