# Test Plan: Nightly Testing

**Spec**: SPEC-140 · [spec.md](spec.md) · [tasks.md](tasks.md)

**live** marks a check on a real UAT server or over several real nights.

## Success criteria → tests

| SC | Test | Kind | Task |
|---|---|---|---|
| SC-1 | Run against a database host on the Production list, then against one on neither list, then against an app address on the Production list. All three are refused before any query, with the reason stated | Integration | T002 |
| SC-2 | Fixture with 3 impacted and 20 other items, 5 slots. All 3 impacted run, plus the 5 least-recently-tested. Over 4 nights the rotation covers all 20, and nothing is skipped silently | Integration | T003 |
| SC-3 | After 5 recorded runs the estimate is within ±25% of the actual time. On the fallback, a 13-hour set splits. On UAT, a 13-hour set completes, and a second scheduled run waits for it | Integration | T004 |
| SC-4 | On the fallback, the main run's end time is the same with the helper on and off | Integration | T007 |
| SC-5 | No Observation ever appears in the pass/fail record. The same usability issue found on 2 nights produces 1 task | Integration | T007 |
| SC-6 | A planted failure is re-run once and fails twice. It gets a diagnosis, a patch file and exactly 1 task, and the next night doesn't add a second task. `git log` shows no commits from the run, and no test file is modified | Integration | T008 |
| SC-7 | With "remove all", a query for the run id's rows after cleanup returns 0. With "keep on failure", the kept rows are gone after the next run | Integration | T009 |
| SC-8 | Grant the normal user admin access in a fixture. The run fails on the permission check | Fixture | T006 |
| SC-9 | Put a known fake secret in config and in a screenshot field. The secret scan finds no occurrence in any output | Fixture | T010 |
| SC-10 | **live**: 7 consecutive nights in Alitho's UAT through the Workbench Entry Path. Each morning summary is correct. A planted break is caught. On fully green nights, artifacts exist only for the ticked frameworks | Release test | T015 |

## Per-requirement tests

| FR | Tests |
|---|---|
| FR-001 | An unsupported-stack fixture reports "not supported" |
| FR-005 | Sign-in goes through the sign-in page, never a minted cookie. The portal hand-off is tested. A missing portal assignment is reported as a setup problem. The Entra statement is present |
| FR-011 | `--install` then `--uninstall` on Linux (systemd timer), Windows (Task Scheduler) and macOS (launchd) leaves no residue. Records show the Designated Agent as the actor |
| FR-012 | One summary per run, and every summary lists what wasn't tested |
| FR-013 | A red run writes no artifacts. Only ticked frameworks get artifacts. Every manifest fingerprint is in wxKanban. Grep the artifacts for "compliant" and "certified": 0 matches. The ISO artifact states "15 of 93" |
| FR-014 | No crosswalk: no HITRUST artifact, and the reason is stated. The kit and product contain no CSF content (grep for CSF control-text markers) |

## Regression

- wxPreTest's existing per-scope mode is unchanged, and its existing tests pass.
- After the push: probe the hosted MCP with `nightly_run_completed`.
