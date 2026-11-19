# Spec 110: Feedback Queue Hygiene

> Implements **SCOPE-110** (`specs/Project-Scope/110-feedback-queue-hygiene.md`).
> **Depends On**: SCOPE-043 (feedback submission pipeline, SysAdmin triage console, central sink, the `feedbacksubmissions` table this extends); SCOPE-061 (automatic error capture and the `errorfingerprint` grouping this corrects); SCOPE-063 (per-project routing of captured errors, which inherits the dedup fix with no UI change).

## Overview

The feedback queue is where user bug reports, suggestions, and automatically trapped runtime errors arrive for triage. Today nothing ever leaves it. An item can be marked resolved, but it stays in the list, stays in the metrics, and stays in the submitter's Cockpit view permanently — and alongside those real items sit large numbers of duplicate rows describing the same handful of errors over and over.

This spec gives the queue an exit and stops it filling with noise. Administrators can dismiss an item — a reversible hide that leaves the triage decision intact — or purge it permanently, and can do either to many items at once. Submitters can clear items from their own Cockpit list, or delete their own submissions outright, without any power over anyone else's.

At the same time it fixes the reason most of the noise exists. An automatically captured error is currently identified partly by the browser page the user happened to be on when it occurred, so a single application-wide failure files a separate report for every page it touches. Identity moves to what actually distinguishes one error from another — its class, where it was trapped, its message, and its stack — and the database itself enforces that an error is one record. When a closed error happens again it reopens that same record and re-notifies, rather than starting a new one, so a regression is visible as a regression instead of as another duplicate. Existing duplicates are merged, not left for someone to clear by hand.

## Business Problem

The feedback queue has stopped being readable, and a queue nobody can read is a queue nobody triages.

Of the 57 automatically captured error records in the system, roughly 8 are distinct problems. The rest are the same errors recorded again and again: one fetch failure appears as 10 separate records, another as 9, a third as 9, a generic script error as 6. Every one carries an occurrence count of 1, so the queue reports 57 problems of equal weight when the truth is 8 problems of very unequal weight. The signal that would tell an administrator which error matters most — how often it actually happens — is destroyed by the same defect that creates the duplicates.

The cause is that the identity of an error includes the browser route it was seen on. A failure in a poll that runs on every page therefore files one record per page, forever, and will keep doing so no matter how many times someone clears them.

Removal is the other half of the problem, and it does not exist. There is no delete of any kind. Marking something resolved leaves it in the list and in the analytics, so a resolved item is just as much in the way as an unresolved one. Junk, test submissions, and accidental double-submits accumulate with no exit at all. A submitter who reported something months ago still sees it in their Cockpit list with no way to clear it. The two halves compound: adding a delete button without fixing identity would mean deleting the same eight errors by hand every week; fixing identity without adding removal would leave the existing backlog and every future piece of junk in place. Neither is worth doing alone.

## Actors

- Primary: SysAdmin — the wxperts platform administrator who works the feedback console, decides what is noise and what is a real report, and is the only actor who can permanently destroy a record.
- Secondary: The feedback submitter, who manages the visibility of their own submissions from the Cockpit and may delete their own; the error-capture intake path, a non-human writer that creates and updates auto-captured records; the notification service, which re-notifies on a regression; and the company audit log, which records every permanent deletion.

## Success Metrics

1. The automatic-error backlog falls from 57 records to 10 or fewer after the merge, with the number of records equal to the number of distinct identities in every project.
2. 30 days after deployment that equality still holds, with 0 projects showing more automatic records than distinct identities — proving enforcement, not a one-time cleanup.
3. Removing any number of duplicate records takes exactly 3 interactions regardless of how many are selected, against 1 interaction per record today.
4. 100% of permanent deletions have a corresponding audit entry across all test paths, including the case where the audit write fails and the deletion must abort. No tolerance.
5. The total reported by the metrics dashboard equals the count of non-dismissed records at all times, verified by test.
6. 0 successful deletions of another user's submission across the full test matrix, including a caller supplying a valid identifier they do not own.
7. A resolved error that recurs produces exactly 1 notification — not 0, which would hide a regression, and not 1 per occurrence, which would create a notification storm.

## Scope Boundary

IN: Visibility and removal state on feedback submissions — a reversible admin-side dismissal, a submitter-side hide, and an audited permanent purge, all operating on sets of records rather than one at a time. Selection and bulk actions in the SysAdmin feedback console, an explicit indication of whether a record is automatic or human-submitted, and a confirmation guard proportionate to what is being destroyed. Exclusion of dismissed records from the default queue and from feedback metrics. A Cockpit/MCP surface for a submitter to hide or delete their own submissions, with ownership enforced at the data layer. Correction of the automatic-error fingerprint so identity reflects the error rather than the page. Database-level enforcement that an automatic error is a single record per project. Defined reopen-and-re-notify behaviour when a closed error recurs. A guard against manual double-submission. A one-time merge of the existing duplicate records.

## Out of Scope

OUT: Removal controls in the per-project Bug Reports view — that surface inherits the deduplication fix server-side but gains no dismiss, purge, or bulk controls, and its actor remains a customer project owner rather than a platform administrator. Any retention, expiry, or auto-archive policy for aged records. Changes to AI triage, classification, severity assignment, disposition, or accept-to-scope. Changes to the administrator-facing "mark as duplicate" judgement, which remains a separate concept from machine identity. Redesign of the feedback console's layout or visual language beyond the controls this scope adds. Versioning of the fingerprint scheme for future basis changes.

## Open Questions

- Should the 30-day post-deployment verification of sustained uniqueness be a standing check, or is a test-suite assertion at build time sufficient evidence?
- Should the MCP-side database migration be an explicit task within this scope, or an operational note carried out alongside deployment?
- The merge script is scoped as a one-time backfill. If it proves useful against other environments, should it become an orchestrator subcommand instead?
- When a dismissed automatic error recurs, this scope clears the dismissal on the grounds that a live error outranks a prior decision not to look at it. If dismissal is later used as a durable "never show me this class of error again" signal, that behaviour will need revisiting.

## Functional Requirements

### FR-001 — Dismiss and undismiss

An administrator can dismiss one or more submissions and can reverse it.

**Acceptance Criteria**:
- [ ] Dismissing records the time and the acting administrator; undismissing clears both
- [ ] Status, disposition, and every other triage field are unchanged by either action
- [ ] Dismissed records are absent from the default list and from all metrics
- [ ] A dismissed filter lists them showing who dismissed them and when
- [ ] Dismissing an already-dismissed record is a no-op, not an error

### FR-002 — Purge with audit

An administrator can permanently delete submissions.

**Acceptance Criteria**:
- [ ] An audit entry is written for each submission before it is deleted, carrying its identifier, title, source, submitter, the acting administrator, and a full snapshot of the record
- [ ] A failed audit write aborts the deletion — nothing is ever deleted unrecorded
- [ ] Records that referenced a purged record as a duplicate survive with that reference cleared
- [ ] Purge succeeds regardless of dismissal state; dismissing first is not required
- [ ] Automatic records whose company is unknown are audited against the sink project's company, so the absence of a company never blocks the audit

### FR-003 — Bulk as the primitive

Every removal action operates on a set.

**Acceptance Criteria**:
- [ ] Removal operations accept a list of identifiers; acting on one record is a single-element call using the same code path
- [ ] A request is capped at 200 identifiers; 201 is rejected with a clear error rather than silently truncated
- [ ] A set containing any invalid identifier fails as a whole rather than applying to part of it
- [ ] The console offers select-all within the current filter and shows a live count of the selection

### FR-004 — Submitter hide

A submitter can remove items from their own feedback list.

**Acceptance Criteria**:
- [ ] Hiding records the time against that submission
- [ ] The submitter's feedback list excludes hidden items unless hidden items are explicitly requested
- [ ] Administrator-side visibility is entirely unaffected
- [ ] Hiding is reversible

### FR-005 — Submitter self-delete

A submitter can permanently delete their own submissions.

**Acceptance Criteria**:
- [ ] Deletion is audited identically to FR-002
- [ ] Ownership is enforced within the data query itself, not by a route-level guard, so no future caller can bypass it
- [ ] A request naming another user's record deletes nothing and reports not-found, revealing neither that the record exists nor that the caller lacks rights
- [ ] A mixed set containing any record the caller does not own deletes nothing

### FR-006 — Default-visible semantics

**Acceptance Criteria**:
- [ ] The feedback list excludes dismissed records unless they are explicitly requested
- [ ] Feedback metrics exclude dismissed records from every figure they compute
- [ ] Fetching a single record by identifier still returns it when dismissed, so existing deep links continue to work

### FR-007 — Console affordances

**Acceptance Criteria**:
- [ ] The list indicates explicitly whether a record is automatic or human-submitted, rather than requiring the reader to interpret the title prefix
- [ ] Source and status filters compose
- [ ] A purge of only automatic records requires a single confirmation; a purge whose selection contains any human-submitted record requires the word DELETE to be typed and displays the affected titles

### FR-008 — Identity reflects the error, not the page

**Acceptance Criteria**:
- [ ] An automatic error's identity is derived from its class, the point at which it was trapped, its normalised message, and the leading frames of its stack
- [ ] The browser route is excluded from identity but is still recorded and displayed
- [ ] The same logical error occurring on ten different pages produces one identity, verified against the ten real records currently in the system

### FR-009 — Uniqueness enforced by the database

**Acceptance Criteria**:
- [ ] A unique constraint guarantees at most one automatic record per project per identity
- [ ] Intake writes through that constraint, incrementing the occurrence count and last-occurrence time when the record already exists
- [ ] The behaviour is correct under simultaneous writes from multiple application instances and does not depend on any in-memory guard
- [ ] Human-submitted records are unaffected by the constraint

### FR-010 — Recurrence reopens

**Acceptance Criteria**:
- [ ] An occurrence matching a resolved or declined record returns it to new, records the reopening time, increases the occurrence count, and clears any dismissal
- [ ] The reopening sends exactly one notification, triggered by the transition rather than by the occurrence
- [ ] Occurrences against an already-open record increase the count and send no notification
- [ ] The console presents a reopened record as a regression and shows the status it previously held

### FR-011 — Manual double-submit guard

**Acceptance Criteria**:
- [ ] A submission identical in submitter, project, type, and title to one made within the previous 60 seconds returns the existing record instead of creating a new one
- [ ] The response makes clear that the submission was recognised as a repeat, so no client reports a second successful submission
- [ ] Beyond that window a genuine repeat report is accepted; this guards double-clicks, not repeat reporting

### FR-012 — Merge existing duplicates

**Acceptance Criteria**:
- [ ] Every existing automatic record has its identity recomputed under FR-008 and each resulting group is merged into its earliest record
- [ ] The surviving record carries the summed occurrence count, the earliest first-occurrence, the latest last-occurrence, and the most advanced status present in the group
- [ ] Internal notes from merged records are appended to the survivor, never discarded
- [ ] The merge completes before the FR-009 constraint exists, within a single transaction, so a failure leaves the data untouched
- [ ] Every merge decision is logged, naming the surviving record and those absorbed
- [ ] The merge is repeatable without harm, so it can be applied to more than one environment

## Data Requirements

The `feedbacksubmissions` record gains four optional fields and two indexes. No new table is introduced and no existing field changes meaning.

| Field | Type | Purpose |
|---|---|---|
| `dismissedat` | timestamp | When an administrator dismissed the record (FR-001) |
| `dismissedbyid` | uuid | The administrator who dismissed it; carried without a foreign key so the decision stays self-contained, matching the existing `dispositionedbyid` field |
| `submitterhiddenat` | timestamp | When the submitter hid it from their own list (FR-004) |
| `reopenedat` | timestamp | When a closed record was last reopened by a recurrence (FR-010) |

Indexes: a **unique** partial index on `(projectid, errorfingerprint) WHERE source='auto' AND errorfingerprint IS NOT NULL` (FR-009), replacing/supplementing the existing non-unique `idx_feedbacksubmissions_errorfingerprint`; and an index supporting the default not-dismissed queue.

Audit entries for permanent deletion are written to the existing company audit log. That table requires a company, which an automatic record may lack, so those entries are attributed to the sink project's company with the record's own company preserved in the entry payload. The full record is stored in the entry, so a purged report's content survives its deletion.

Recomputing identity for existing records requires the error's class, trap point, message, and stack. All four are already stored on each record; the browser route is the only input being dropped. No information is missing and no data needs to be reconstructed.

The schema change and the merge must be applied to **both** databases — the application's PostgreSQL and the hosted MCP's separate PostgreSQL — since both carry the `feedbacksubmissions` table. Applying to only one leaves the new submitter tool writing against fields that do not exist.

## API Routes

Added to the existing SysAdmin feedback surface, all validated and all accepting sets:

- Dismiss submissions — accepts a list of identifiers
- Undismiss submissions — accepts a list of identifiers
- Purge submissions — accepts a list of identifiers together with an explicit confirmation token, so a malformed or replayed client request cannot destroy records
- The existing feedback listing gains the ability to include or isolate dismissed records

On the Cockpit/MCP surface: one new tool by which a submitter hides or deletes their own submissions, and the existing submitter feedback listing gains the ability to include hidden items. Both route through the same sink resolution as the existing feedback tools.

## Frontend Components

Confined to the existing SysAdmin feedback console; no new page and no new route.

- A selection checkbox per row, and a header control selecting everything within the current filter
- A persistent action bar appearing only when a selection exists, reporting the count and offering dismiss, undismiss, and purge
- An explicit automatic-or-human indicator per row
- A dismissed option in the status filter, composable with the source filter
- A purge confirmation that states the composition of the selection and demands typed confirmation whenever a human-submitted record is included
- A regression indicator on reopened records, showing the status previously held

Components follow the project's existing shadcn/ui conventions and retain the console's current visual language.

## User Scenarios

**US1 — An administrator clears a storm of duplicate errors.** Filters to automatic errors with status new, selects fourteen identical fetch failures with the header checkbox, purges and confirms. Expected: fourteen records deleted, fourteen audit entries written, metrics recomputed without them, no page reload.

**US2 — An administrator dismisses noise without destroying it.** Sets a duplicate suggestion's disposition, dismisses it. Expected: dismissal recorded and reversible; status and disposition untouched; absent from the default list and all metrics; visible under the dismissed filter with who and when.

**US3 — A submitter clears their own Cockpit list.** Hides three long-resolved items. Expected: only those three hidden for that submitter; admin-side visibility unaffected; still retrievable when hidden items are explicitly requested.

**US4 — A resolved error comes back.** Expected: no new record; the existing record returns to new, occurrence count increases, last-occurrence and reopened timestamps update, exactly one notification is sent, and it reappears flagged as a regression showing its previous status.

**US5 — A bulk purge that contains a human report.** Thirty selected (twenty-eight auto, two human). Expected: the confirmation states the split, lists the human-submitted titles, and requires the word DELETE. An all-automatic selection requires a single confirmation instead.

## Constraints & Notes

- The merge of existing duplicates and the uniqueness constraint are mutually dependent; both halves are idempotent, but applying the constraint to un-merged data fails loudly on the existing duplicates — intended and documented rather than defended against.
- Identity must be recomputed by the same logic that computes it at intake. That logic is application code and cannot be expressed in a migration, so the merge is a repeatable script rather than pure schema change, and the constraint is declared idempotently in both places.
- The hosted MCP runs against a different database from the application. The schema change and the merge must be applied to both.
- An automatic error becomes a single record for the life of the project; its history lives in the occurrence count and the first, last, and reopened timestamps rather than in separate records.
- The existing in-memory write rate limit is retained but correctness no longer depends on it.
- Recomputing every existing record means old and new share one identity scheme, so no versioning field is introduced; a future scheme change would need one — flagged, not built.
- Dismissed is deliberately not called Archived — Archived denotes a scope/spec lifecycle status in this project (SCOPE-103).
- Machine identity and the administrator's "mark as duplicate" judgement remain separate concepts.
- All code is written through the orchestrator so that code fences are generated rather than hand-authored.
