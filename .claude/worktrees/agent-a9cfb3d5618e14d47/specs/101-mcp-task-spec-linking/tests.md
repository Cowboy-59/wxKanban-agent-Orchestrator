# Test Plan: MCP Task Spec Linking

**Spec**: 101 | **Scope**: SCOPE-101 (incl. Amendment A)

---

## Standing rule

Unit-green plus build-green has shipped fatal bugs in this project. Every requirement below that
touches `dbpush` classification carries a **live-run** check in addition to its unit test.

## Wave 1 — hosted MCP (T001–T006, shipped)

| ID | Check | Type | State |
| --- | --- | --- | --- |
| TC-01 | `create_task` advertises optional `specId`; a call with it persists `projecttasks.specid` | schema + live | verified 2026-08-04 |
| TC-02 | `create_task` without `specId` behaves exactly as before | schema | verified |
| TC-03 | Link by `specId` and by `specNumber` both set the column | schema + live | verified — returned `linked: 1` |
| TC-04 | Link with both or neither identifier is rejected | schema | verified |
| TC-05 | Empty `links` array rejected | schema | verified |
| TC-06 | Out-of-project task/spec → not-found, no cross-tenant write | schema | verified |
| TC-07 | Re-running identical links is idempotent | live | verified |
| TC-08 | Valid status transition returns `previousStatus` + `status` | live | verified — 112 and 113 `planned` → `implementing` |
| TC-09 | Out-of-vocabulary status rejected (e.g. `tasks_generated`) | schema | verified |
| TC-10 | `read_only` role rejected for both tools | schema | verified |

## Wave 2 — Amendment A (T007–T012, not started)

| ID | Check | Type | Requirement |
| --- | --- | --- | --- |
| TC-11 | A spec present in the DB classifies as existing and routes to `pushExistingSpec` | unit | FR-007 |
| TC-12 | **Must fail against current code** — proves the test is real | unit | FR-012 |
| TC-13 | Classification holds when no task title carries a scope number | unit | FR-007 |
| TC-14 | A genuinely new spec still routes to `pushNewSpec` | unit | FR-007 |
| TC-15 | **Live:** `dbpush --dry-run --spec 112` reports `updated: 1 / created: 0` | live | FR-007 |
| TC-16 | **Live:** whole-project dry run reports `0 created` | live | FR-007 |
| TC-17 | Every returned task carries spec identity, or explicit null when genuinely unlinked | schema + live | FR-008 |
| TC-18 | A task linked via `link_task_to_spec` reports that spec | live | FR-008 |
| TC-19 | Existing consumers unaffected by the added field | regression | FR-008 |
| TC-20 | A project with >100 open tasks matches every existing spec | unit | FR-009 |
| TC-21 | A completed task is not recreated | unit | FR-009 |
| TC-22 | Residual truncation is reported, never silent | unit | FR-009 |
| TC-23 | A failed/truncated read blocks the push and names the failed read | unit | FR-010 |
| TC-24 | A genuinely empty project still permits a first push | unit | FR-010 |
| TC-25 | "Indeterminate" and "empty" produce different behaviour | unit | FR-010 |
| TC-26 | `--force` overrides and states what it overrides | unit | FR-010 |
| TC-27 | Separator variation updates rather than duplicates — **confirm the defect exists first** | unit | FR-011 |
| TC-28 | A spec pushed twice produces 0 duplicate documents | live | FR-011 |

## Baselines to measure against

- `dbpush --dry-run --spec 112` → `created: 1 / updated: 0 / tasks created: 11` (2026-08-04)
- `dbpush --dry-run` whole project → `85 created / 0 updated / 811 tasks` (2026-07-30)
- `list_open_items` spec identity → **0 of 100** task rows (2026-08-04)

## Non-regression

- Forward-only task status sync is retained: `TERMINAL_MD_STATUSES` stays `{done, completed, complete, x, shipped}`; `partial` and other non-terminal statuses must not be pushed as done.
- `cockpit_summary` grouping is reused and must not change.
- The canonical status vocabulary must not widen to admit gate-document terms.
