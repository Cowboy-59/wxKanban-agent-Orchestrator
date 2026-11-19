# Spec 124: Idempotent Spec Persistence

**Spec Number**: 124
**Spec ID**: `23c7cf78-3f94-4ce2-b124-50935c4b8bbc`
**Status**: `planned`
**Phase**: design
**Scope document**: [`specs/Project-Scope/124-idempotent-spec-persistence.md`](../Project-Scope/124-idempotent-spec-persistence.md)
**Blocked on**: SCOPE-098 FR-005 (`project.delete_scope`) for FR-008 only

---

## Overview

Eight reports from five projects describe a spec that cannot be updated. They are one defect: **spec
identity is inferred rather than read from the record that owns it.**

`dbpush.ts:499-512` derives its known-spec set from `project.list_open_items`' `tasks` array via
`t.specNumber ?? parseScopeFromTaskTitle(t.title)`. The first branch is dead — tasks link to specs by
`specId`, a UUID, so no `specNumber` is ever returned — leaving identity to a regex over task **title
text**, capped at `maxItems: 100`. A spec with no open tasks, untagged titles, or past that window is
invisible and treated as new.

`buildscope` inferred it from the server's own directory listing, which on the hosted MCP is the
wxKanban repository. **That half is already fixed** — see FR-001 below.

Where the unique index `idx_projectspec_project_specnumber` catches the resulting insert, users are
hard-blocked with "Duplicate specNumber". Where nothing guards it, duplicates land silently: duplicate
document sets, and 29 shadow scopes numbered 030–058 in one project.

Full narrative and evidence live in the scope document. This spec carries the implementation contract.

> **Notation.** Like the scope document, this file cannot spell the marker tokens FR-007 concerns —
> `create_specs`' preflight would reject it. They appear separated (`T·O·D·O`, `T·B·D`), and the word
> for a stand-in value is written *stand-in*.

## Business Problem

Specs cannot be updated, and until 2026-08-05 the identity of the spec being updated was resolved
against the wrong machine. The customers hit hardest are the ones with the most specs — and the defect
is worst on the most *finished* work, because a scope with no open tasks contributes nothing to the
inferred set.

## Actors

- Primary: A developer maintaining a scope after it first exists — editing it, re-pushing it, or
  re-running `dbpush` in CI — met with a duplicate error or a silent second copy
- Secondary: An author writing scopes in a language other than English, rejected for using an
  ordinary word of their own language; the Dev Cockpit and Kanban board, which render duplicate rows
  as real open work; support, the only route to removing a duplicate today

## Success Metrics

1. 0 specs created and 0 documents duplicated by a second `dbpush` run on an unchanged project
2. 0 cross-project identity resolutions, asserted by a test running 2 projects at the same spec number
3. A scope round-tripped through edit with no changes is 100% byte-identical
4. Non-English scopes pass preflight at the same rate as English ones — 1 project currently blocked
5. Both affected projects clear their duplicates with 0 SQL run by support

## Scope Boundary

Resolve spec identity from the database everywhere it is inferred; let `list_open_items` answer what
specs exist; make editing a read-modify-write; make every write path idempotent; remove truncation
from correctness decisions; judge preflight on content rather than language or formatting; give
existing duplicates a supported route out.

## Out of Scope

Hand-cleaning customer data. The `buildscope` interview itself. SCOPE-098's `delete_scope` (consumed,
not built here). Spec *numbering* — SCOPE-089 already fixed that. `projecttasks.specId` semantics —
SCOPE-101 owns them. Product localisation — SCOPE-046.

## Functional Requirements

Authoritative text and acceptance criteria are in the scope document. Summarised for traceability:

| FR | Requirement | Tasks | State |
|---|---|---|---|
| FR-001 | Spec identity resolved from the database, never a filesystem | T001, T018, T019 | T001 **shipped `316ffef4`**, T018 done, T019 done (Amendment A) |
| FR-002 | An edit is a read-modify-write | T002, T003 | **done** |
| FR-003 | `dbpush` determines existence from specs, not task titles | T004, T005 | **done** |
| FR-004 | `list_open_items` can answer what specs exist | T006, T007 | **done** |
| FR-005 | Every write path is idempotent | T008 | **done** |
| FR-006 | Truncation may bound a display, never a correctness check | T009 | **done** |
| FR-007 | Preflight judges content, not language or formatting | T010–T013 | **done** |
| FR-008 | Existing duplicates are identifiable and removable | T014, T015 | T014 done; **T015 blocked on SCOPE-098** |
| FR-009 | A response describes what the call did, not what a caller might assume | T020, T021 | **done** — T020 buildscope, T021 the other six (Amendment B) |

Housekeeping: T016. Cross-cutting verification: T017 (**done**). Residual of FR-001: T018
(**done**), and T018's own residual: T019 (**done**, Amendment A).

## Amendment A — 2026-08-20 — a scope can be validated before it is pushed

Field report 287f076a. T018 closed validatescope's filesystem routes and left no route open for the
thing those routes were being used for: checking a scope that `buildscope` has just written locally,
before `create_specs` or `dbpush` has persisted anything. `filePath` was still advertised as the way
to do it and was inert.

**The amendment does not reopen the gate, and could not.** `filePath` could never have validated a
consumer's file — the hosted server resolves a path against its own disk, which is exactly how T018
found it scoring wxKanban's own documents for other tenants. The route that works without a
filesystem is content: `project.validatescope` now takes `scopeContent`, the caller sends the text
of their own file, and the server scores it and opens nothing. `create_specs` has always taken its
scope this way.

`filePath` becomes a label echoed into the result, and says so. The not-found message names
`scopeContent` as the pre-push route rather than sending callers to `create_specs` for a verdict.
The runtime prompt — which never mentioned the tool at all, and is why calling it with a path was
the reasonable thing to try — now reads the located file and calls the tool with its content.

Carried forward as **not closed**: that prompt's own rubric scores a different document shape than
the server preflight (`US1/US2/US3` and sequential `FR-001` numbering, versus Overview / Business
Problem / Actors / Success Metrics / Scope Boundary / Out of Scope / Open Questions). The server's
verdict is now authoritative over the rubric, so they cannot contradict each other on readiness, but
they remain two rubrics and reconciling them is its own task.

Detail and test evidence: T019.

## Amendment B — 2026-09-04 — buildscope stops claiming it created something

Field report 7dfc7c13. `project.buildscope` returned `status: "created"`, a `filePath`, a
`checklistPath` and "Scope 051 created" for a scope it had neither written nor stored. The behavior
is right — SCOPE-028 Phase 12 removed the server-side write on purpose, because on the hosted MCP it
wrote into our container instead of the caller's workspace — but the response was never updated to
match, and still reads as though a file and a record exist.

The cost is not cosmetic. "Created" plus a concrete path invites the operator to open that path and
edit it, which forks a new empty file from the real scope; in this report it also came close to
replacing a hand-authored scope that preflighted at 100 with generated boilerplate scoring 86.

The response now describes the call: `drafted` / `draft_updated` rather than `created` / `updated`,
a machine-readable `persisted: false`, `suggestedFilePath` and `suggestedChecklistPath` naming the
destinations as destinations, and a message that says the draft is returned for the caller to write
and that nothing exists until `create_specs` or `dbpush` runs. `filePath` and `checklistPath` keep
their names because deployed kits write the scope from them.

This closes the last of the three tools that answered about a document rather than about what they
did: T001 (edit identity), T018/T019 (validatescope), and now T020.

Sweeping the rest of the surface for the same question found six more tools answering `success:
true` for work that did not happen — `import_project` returning a UUID for a project it never
created, `analyze` reporting an analysis it never ran, `session_start` stating a governance version
it never checked, `regenerate_kit` parking the kit row in `generating` with no job behind it, and
`implement` describing a tasks.md read it deliberately does not perform. Carried as T021 under this
amendment.

Detail and test evidence: T020, T021.

## Amendment C — 2026-10-25 — writes that are safe to repeat

Customer report package 2026-10-25 (kit write-safety brainstorm, `docs/brainstorms/2026-10-25-kit-write-safety.md`).
Reopens FR-005 and FR-008 and adds FR-010..FR-016: document identity (spec, kind), the owner-applied
`kind`/retire columns and partial unique index, consented duplicate cleanup, retire instead of delete
(reverses T015's "will not do"), `<scope>-0001` spec numbering, no push over another scope's number,
and resolution only after a live probe with one contract suite over every write tool.

Authoritative text and acceptance criteria: the scope document, section **Amendment C**.

## Status — 2026-08-05

**17 of 18 tasks done. Every FR is closed except FR-008, which is half-closed: duplicates are
detectable, and removal waits on SCOPE-098's `project.delete_scope` (T007–T009 there, still `todo`).**

Two findings from building it are worth carrying forward, because both correct something this spec
asserts:

1. **The 29-shadow duplicate set described in the Overview is not in production.** T014 ran across
   97 projects and 1705 specs and found no bulk-copy cluster at all — one genuine duplicate pair,
   in a different project, at a different offset. Treat the claim as unverified until someone names
   the project it came from. T015's sizing rests on it.
2. **FR-001 had a second residual, now closed as T018.** `validateScope` carried the same
   filesystem fallback T001 removed from the edit path, plus a caller-supplied `filePath` that was
   honoured absolutely. Both are gated on the absence of a `projectId` now.

## Open Questions

1. How `list_open_items` exposes spec identity — a `specs[]` collection, or `specNumber` resolved onto
   each task.
2. Whether FR-005's document identity is enforced by a unique index or in application code. Leaning
   application-level to keep this scope DDL-free.
3. What FR-008 does with a duplicate that has since diverged. Deleting edited work on an inference is
   not acceptable.
4. ~~Whether FR-007 needs an escape for authors writing about markers.~~ **Answered** by this scope's
   own document, which could not be filed until it stopped naming them.
