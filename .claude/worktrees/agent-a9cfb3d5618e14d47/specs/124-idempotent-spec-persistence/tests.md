# Test Plan: Idempotent Spec Persistence

The defining assertion is **idempotency**: running any write path twice on an unchanged project
changes nothing the second time. Most tests below are a form of it.

> **Notation.** Marker tokens appear separated (`T·O·D·O`, `T·B·D`) — this file is subject to the same
> check FR-007 fixes.

## Fixture: a project with awkward specs

Real shapes, not convenient ones. It must contain: a spec with **zero open tasks**; a spec whose task
titles carry **no** `[NNN-T###]` prefix; and enough open items to exceed **100**. Each corresponds to
one way identity is currently lost, and a fixture without them proves nothing.

## Unit — identity resolves from the database (T001, shipped)

Already verified against production for `316ffef4`; retained as regression:

- Two projects at the same spec number resolve to **different** records
- A spec number absent from the caller's project returns not-found, regardless of what exists in the
  server's workspace
- **Must run against the hosted server or with a live `projectId`.** A local run has no `projectId`,
  takes the kit-author fallback, and demonstrates nothing — this is precisely why the defect survived

## Unit — the edit preserves what it did not touch (T002, T003)

- Editing one section leaves every other section byte-identical
- An edit supplying no optional fields is a no-op on content
- A no-change round-trip through edit is byte-identical to the original
- The response enumerates which sections were replaced

## Unit — existence comes from specs, not titles (T004, T005)

- A spec with **zero open tasks** is recognised as existing — the sharpest case, because the more
  finished the work the more likely it was to be duplicated
- A spec whose task titles carry no prefix is recognised as existing
- `parseScopeFromTaskTitle` has no callers in the identity path (structural assertion)
- A project sized past the old 100-item window pushes correctly (T009)

## Integration — idempotency (T008)

- Pushing the same spec twice yields **one** spec row and **one** document per doctype
- A second write to the same spec+doctype updates rather than inserting
- Task rows are not duplicated by a re-run
- `create_specs` re-run on an existing spec updates rather than creating a duplicate set
- The "Duplicate specNumber" error is unreachable through a normal re-run

## Unit — preflight judges content (T010–T013)

- A Spanish document using the ordinary word in prose, singular and plural, **passes**
- A literal uppercase marker still **blocks**
- `- Secondary: **Supervisor** - descripción` is recognised as a secondary actor
- A blocking message quotes the matched text and where it was found
- Both detectors are covered — `matchesPlaceholder` in `shared/preflight` **and** `server.ts:396`.
  Fixing one and declaring victory is the expected failure mode.

## Integration — duplicate detection and removal (T014, T015)

Against a copy of the project carrying the 030–058 duplicates:

- Each duplicate is listed with the original it shadows and the reason
- Detection is read-only and safe against production
- Removal goes through `project.delete_scope` and takes tasks and documents with it
- Nothing is deleted without explicit per-scope confirmation

## Regression guards (CI)

- The two-project identity test (blocks a return of the cross-tenant resolution)
- The second-run-is-clean assertion on a real fixture
- The structural assertion that title parsing is absent from the identity path

## Known gap, not a test failure

T001's residual: the derived slug may differ from the file name the client wrote at creation. There is
no assertion for this because it is not fixed — the durable fix needs DDL. Do not write a test that
passes by accepting whatever the code produces.
