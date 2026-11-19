# Requirements Checklist: Idempotent Spec Persistence

**Spec**: 124 · Traces each FR to its implementing task and its proving test.

> Marker tokens appear separated (`T·O·D·O`, `T·B·D`) — this file is subject to the check FR-007 fixes.

| FR | Requirement | Task(s) | Proven by | Done |
|----|-------------|---------|-----------|------|
| FR-001 | Spec identity resolved from the database, never a filesystem | T001 | Two projects at one spec number resolve differently; verified live 2026-08-05 | [x] |
| FR-002 | An edit is a read-modify-write | T002, T003 | Unit: editing one section leaves others byte-identical; no-change round-trip is byte-identical | [ ] |
| FR-003 | `dbpush` determines existence from specs, not task titles | T004, T005 | Unit: zero-open-task spec and untagged-title spec both recognised; title parsing absent from the identity path | [ ] |
| FR-004 | `list_open_items` can answer what specs exist | T006, T007 | Unit: specs enumerable without parsing a title; the dead branch is live or deleted | [ ] |
| FR-005 | Every write path is idempotent | T008 | Integration: second push yields one spec row and one document per doctype | [ ] |
| FR-006 | Truncation may bound a display, never a correctness check | T009 | Integration: a project past 100 open items pushes correctly | [ ] |
| FR-007 | Preflight judges content, not language or formatting | T010–T013 | Unit: Spanish document passes, real marker still blocks, bolded actor recognised; **both** detectors covered | [ ] |
| FR-008 | Existing duplicates are identifiable and removable | T014, T015 | Integration against a copy of the 030–058 project; read-only detection; per-scope confirmed removal | [ ] |

## Success metric verification

| # | Metric | Verified by | Done |
|---|--------|-------------|------|
| 1 | 0 specs created and 0 documents duplicated by a second `dbpush` run | Integration on a real fixture | [ ] |
| 2 | 0 cross-project identity resolutions | Two-project test against the hosted server | [x] |
| 3 | 100% byte-identical no-change edit round-trip | Unit (FR-002) | [ ] |
| 4 | Non-English scopes pass at the same rate as English | Unit + re-file the blocked customer's document | [ ] |
| 5 | Both duplicate-carrying projects cleared with 0 SQL run by support | Integration + customer confirmation | [ ] |

## Pre-implementation gates

- [ ] The FR-004 shape is chosen — `specs[]` collection, or `specNumber` on each task
- [ ] The FR-005 identity mechanism is chosen — application-level upsert (preferred, DDL-free) or a
      unique index (DDL, manual schema process, schema-change-log entry)
- [ ] **SCOPE-098 T007–T009 have shipped** before T015 starts — there is no delete tool until then
- [ ] A copy of the project carrying the 030–058 duplicates is available for T014/T015
- [ ] The FR-008 policy for a *diverged* duplicate is decided — report and leave, or offer a merge.
      Deleting edited work on an inference is not acceptable

## Do-not-do gates

- [ ] T001 is **not** re-implemented — shipped as `316ffef4`, deployed
- [ ] T001's residual (derived slug ≠ the client's created file name) is **not** closed by widening
      T002 — the durable fix needs DDL and its own decision
- [ ] FR-007 is not closed on the `shared/preflight` fix alone — `server.ts:396` is a second detector
      (T012), and the unconfirmed plural-form claim needs T013
- [ ] No code-span-aware marker check is attempted — `normalizeText` strips backticks before matching
- [ ] Nothing is deleted in bulk on an inference (FR-008)
