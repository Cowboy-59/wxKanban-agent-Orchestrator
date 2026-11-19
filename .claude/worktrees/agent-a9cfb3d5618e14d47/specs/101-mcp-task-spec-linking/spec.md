# SPEC-101: MCP Task/Spec Linking and Spec Lifecycle Transition

**Source scope**: `specs/Project-Scope/101-mcp-task-spec-linking.md` (including Amendment A, 2026-08-04)

## Overview

Three gaps in the wxKanban spec-management surface leave a project unable to keep its Project Hub record faithful to what was actually built. Two sit in the hosted MCP tool surface and were closed in code before this spec was written; the third sits in the kit's `dbpush` and is open.

Gap 1 — a task's spec link was unreachable through the tools. The `projecttasks.specid` column exists and `cockpit_summary` groups every task under its spec purely on that column, but the only client-reachable writer was `create_specs`. `create_task` already accepted `specId` in its handler and validator; the field was simply omitted from the published input schema, so no client could send it.

Gap 2 — a spec could not leave its creation status. `create_specs` writes an initial status from `phase` and nothing in the MCP surface transitioned it afterward, because `project.implement` is dead with `artifactDir` hardcoded undefined.

Gap 3 — `dbpush` cannot sync; every run is an insert. `phase2Compare` builds its set of known specs from `project.list_open_items`, which publishes no spec identity at all, so every local spec is classified as new and routed to `pushNewSpec`.

## Business Problem

A project imports specs and tasks through the MCP and then manages the build from the Dev Cockpit. Gaps 1 and 2 broke that at scale: 129 tasks in the originating consumer project were orphaned, so the Cockpit reported zero remaining work across all 31 modules while holding every task in the unlinked bucket, and every spec was frozen at its creation status with no supported transition.

Gap 3 is worse because it is silent. `dbpush` reports success while inserting duplicates: a dry run on 2026-07-30 reported 85 specs created and 0 updated against a project where all 85 already existed, and a scoped run on 2026-08-04 reported 1 created and 11 tasks created against spec 112, which already existed with 10 tasks. The only thing preventing 85 duplicate specs is an operator noticing the created-versus-updated split. The defect was filed as feedback three separate times over 13 days and never scoped, and one of those filings named the exact root cause.

The downstream cost is that the change-tracking record stops being a record. Work is done locally, the sync tool claims to have pushed it, and the Hub either does not receive it or receives a second copy.

## Actors

- Primary: The operator syncing local spec artifacts to the wxKanban Project Hub, in this project and in consuming projects, who needs the Hub to reflect what was built without hand-repairing it afterward.
- Secondary: The hosted MCP server, which performs tenant-scoped reads and writes through the scoped-query layer, and the Dev Cockpit reader, which groups tasks under their spec purely on `projecttasks.specid`.

## Success Metrics

1. A scoped `dbpush --dry-run --spec 112` reports 1 spec updated and 0 created, against the current behaviour of 1 created and 0 updated with 11 tasks created.
2. A whole-project `dbpush --dry-run` reports 0 specs created where all specs already exist, against the 2026-07-30 baseline of 85 created and 811 tasks created.
3. `project.list_open_items` returns an owning spec for 100 percent of linked tasks, against the measured baseline of 0 of 100 task rows carrying any spec identity.
4. A project holding more than 100 open tasks classifies 100 percent of its existing specs as existing, with 0 specs misclassified as new because their tasks fell beyond the first page.
5. With the comparison read forced to fail, `dbpush` performs 0 writes and names the failed read, rather than inserting.
6. A batch link call sets the spec id on all 129 previously orphaned tasks in at most 1 call, after which the Cockpit reports a non-zero remaining count for the affected specs and 0 of those tasks remain unlinked.
7. `tsc --noEmit` and `npm run build` complete with 0 errors, and the classification regression test fails against current code and passes after the fix.

## Scope Boundary

In scope: exposing `specId` on the published `create_task` schema; a batch `project.link_task_to_spec` repair tool targeting a spec by id or number; a `project.update_spec_status` lifecycle transition tool; tenant scoping and least-privilege gating for both new tools; `dbpush` spec matching resolved from authoritative spec identity rather than parsed task titles; complete matching regardless of task volume; a refusal path when the comparison read cannot establish project contents; separator-tolerant document title matching once that path is reachable; and regression tests across the kit and the server.

## Out of Scope

This iteration excludes fixing `project.implement` and its hardcoded `artifactDir`, which remains unowned. It excludes reconciling the stale gate-document status vocabulary with the policy whitelist, which is a governance decision rather than a build. It excludes pagination work on `cockpit_summary`, covering only `list_open_items`. It excludes lifecycle-document upsert, which `dbpush` has never implemented despite its command documentation claiming the step. It excludes a defensive guard that would block a run reporting many creations and zero updates, which was offered and deliberately not taken up. It excludes the version-stub environment notes carried in the source scope.

## Open Questions

1. Should the defensive guard blocking a run with many creations and zero updates be added as a thirteenth requirement, or does the root-cause fix make it redundant?
2. Is the document title separator defect real? It has never been observed because its code path never executed, so it must be confirmed before any code is changed for it.
3. Should `cockpit_summary` gain paging in a later iteration, given it returns only incomplete tasks and therefore cannot serve as a complete task-identity source on its own?

## Functional Requirements

### FR-001 — create_task publishes specId

The published input schema for `project.create_task` must include an optional `specId`. The handler and validator already accept and persist it.

Acceptance:
- The tool definition advertises `specId` as an optional uuid
- A call with `specId` persists `projecttasks.specid` and the task groups under that scope
- A call without `specId` behaves exactly as before

### FR-002 — Batch task-to-spec repair tool

A tool must set `projecttasks.specid` for existing tasks in batch, accepting 1 to 500 links, each naming a spec by id or number with exactly one of the two.

Acceptance:
- Registered in the tool list and the permission matrix as editor and admin
- A link by id and a link by number both set the column; both or neither is rejected
- An out-of-project task or spec resolves to not-found and performs no cross-tenant write
- Re-running the same links is idempotent

### FR-003 — Spec lifecycle transition tool

A tool must transition the spec status within the canonical vocabulary of draft, planned, implementing, qa, human_testing, beta and released.

Acceptance:
- Registered in the tool list and the permission matrix
- A valid transition updates the status and returns the previous and new values
- A status outside the vocabulary is rejected by the schema
- A spec outside the caller's project resolves to not-found

### FR-004 — Tenant scoping and least privilege

Both new tools must resolve and mutate rows only through the scoped-query layer, binding to the caller's project.

Acceptance:
- No handler path bypasses the scoped-query layer for tasks or specifications
- A read-only role is rejected for both tools
- An out-of-project target resolves to not-found rather than a mutation

### FR-005 — Repaired tasks become visible in the Cockpit

After linking, affected tasks must leave the unlinked bucket and appear under their spec.

Acceptance:
- Linked tasks appear under their scope with a non-zero remaining count
- The unlinked bucket no longer holds them

### FR-006 — Schema regression tests

Schema-level tests must lock the mutually-exclusive identifier contract for both tools and the lifecycle status vocabulary.

Acceptance:
- Tests assert exactly-one-of identifiers, that an empty link array is rejected, and that the status vocabulary rejects out-of-vocabulary values
- Type-check and build complete with 0 errors

### FR-007 — dbpush resolves existing specs from spec identity

`phase2Compare` must determine what the project already contains from an authoritative spec listing rather than inferring scope numbers from task title strings. Title parsing may remain as a fallback but must not be the only source.

Acceptance:
- A spec present in the database is classified as existing and routed to the update path
- Classification holds when no task carries a scope number in its title
- A scoped dry run against spec 112 reports 1 updated and 0 created
- A genuinely new spec is still routed to the create path

### FR-008 — The read endpoint publishes each task's owning spec

`project.list_open_items` must return the owning spec identity per task. The column is already populated and is what the Cockpit groups on; it is simply not exposed on this endpoint.

Acceptance:
- Every returned task carries its spec identity, or an explicit null for a genuinely unlinked task
- A task linked through the batch repair tool reports that spec
- Existing consumers are unaffected by the added field

### FR-009 — Matching is complete regardless of task volume

Spec and task matching must not be bounded by a single page of 100 results.

Acceptance:
- A project with more open tasks than one page matches every existing spec
- Completed tasks are included in task identity so a finished task is not recreated
- Any residual truncation is reported rather than silent

### FR-010 — An indeterminate comparison refuses rather than inserts

Where the comparison read cannot establish project contents, `dbpush` must refuse to write. An unusable read and a genuinely empty project must not produce the same behaviour.

Acceptance:
- An empty result caused by a failed or truncated read blocks the push with a stated reason
- A genuinely empty project still permits a first push
- The refusal names which read failed
- A force flag may override and states what it is overriding

### FR-011 — Document matching tolerates title separator variation

Once the update path is reachable, a stored title using an em-dash must match its counterpart using a colon. This must be confirmed to be a real defect before code is changed, since it has never been observed.

Acceptance:
- Separator variation updates the existing document rather than creating a second
- A spec pushed twice in succession produces 0 duplicate documents

### FR-012 — Regression tests lock the classification contract

Acceptance:
- A test asserts that a spec present in the database is classified as existing, and fails against current code
- A test asserts that an unusable read refuses rather than inserting
- A schema test locks the added spec-identity field on the read endpoint

## Data Requirements

No new tables and no new columns. `projecttasks.specid` and `projectspecifications.status` already exist in the shared mirror schema. This spec changes only which code paths can read and write them, and which reads expose them.

## API Routes

No REST route changes. The work is MCP tool surface plus kit source: two tools added and one input schema widened on the hosted server, and the comparison and classification logic replaced in the kit's `dbpush`.

## Frontend Components

No UI changes. The Dev Cockpit reader is unchanged and reused; this spec makes the grouping it already performs reachable by ensuring the underlying column is set and exposed.

## Integration Context

This spec extends the hosted MCP tool surface delivered by SPEC-028, whose scoped-query layer enforces token-to-project binding and must not be bypassed. It aligns with SCOPE-042, whose Cockpit reader groups tasks under specs purely on the spec-id column and is deliberately left unchanged. It relates to SCOPE-097, which addresses the same family of hosted-tool gaps that burn consuming-project sessions.

Delivery spans two surfaces, which is a change from the original single-surface assumption. FR-001 through FR-006 and FR-008 are hosted-MCP and reach production on a push to main. FR-007 and FR-009 through FR-012 are kit source and reach consumers only through a kit release, so the half that protects users has the slower delivery path.

## Constraints and Risks

Fences for the already-built work were hand-authored because the orchestrator implement path is non-functional; they must be reconciled against database task rows before the strict fence audit is clean. The canonical status vocabulary must not be widened to admit the stale gate-document terms, which the database never stores. Forward-only task status sync is retained: statuses flip toward terminal and never back. Compliance context is active for this project under SOC 2, and control CC8.1 requires every production change to trace to a tracked item recording what changed, why, and who approved it — which is precisely what a silently duplicating sync tool breaks. Nothing is pushed or published until the operator says so.
