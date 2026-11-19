# Acceptance evidence: Decision Memory (SPEC-142, T021)

Two rounds on 2026-10-23. "Live" means a real `claude -p` session (Claude Code 2.1.98, sonnet) in a temp git project with the Change Impact hook and the Ask Gate hooks installed, gate in `enforce`, one approved ledger entry D-0001, and `WXAI_UNATTENDED` unset unless stated. The scripts that build those projects and read the transcripts are in `evidence/` (set `SCRATCH` to an empty folder). Unit tests: `npx vitest run tests/unit/askgate` 210 of 210 (round 1: 185).

## Scenarios

| # | Scenario | Result | Evidence |
|---|---|---|---|
| US1 | Repeat question answered from the ledger (AskUserQuestion) | **Pass, live, all 6 permission modes** | In every mode the hook denied the call with D-0001's text; `evidence/t013-round1-tool-impact-guard.json` |
| US2 | Plain-text question caught (Stop hook) | **Pass, live** (round 1 both modes; round 2 bypass after the assume change) | Stop hook blocked with D-0001; the agent wrote the decision into notes.txt and cited D-0001; one `answered` log line |
| US3 | Blocker parks only its own unit; owner answer becomes a ledger entry | **Pass, live, real room** (owner's go, 2026-10-23) | A `--create` state with 4 units; the real hook process got a production-data question from SCOPE-902 (`WXAI_UNATTENDED=1`): denied, queued as DQ-01, only SCOPE-902 parked, one outbox line. The bridge's own `drainOutbox` and YappChatt client posted it to the real room (1 line, outbox empty). The owner replied in the room; `route.applyOwnerAnswer` wrote D-0002 (`approved_by: owner`, source `GOD-Decisions.md#DQ-01`), DQ-01 answered, releases SCOPE-902; `check` passes. The real bridge relays room replies into the session (SCOPE-102); this test read the reply itself. Harness note: the first listener dropped the reply because the read session is the owner's own account (`mine: true`); the bridge filters on `isAgent` only, so it is unaffected. `evidence/us3-live.ts`, `evidence/us3-resume.ts` |
| US4 | Uncovered, non-blocking question becomes an assumption | **Pass, live, unattended** (`WXAI_UNATTENDED=1`) | Denied with the default, entry in `assumptions.yaml`, ledger unchanged. **With a person present the same question now passes through** (Clarification 8): log `passed-through`, no assumption |
| US5 | Global pattern applies; no cross-repo leak | **Partly**: unit tests (global.test.ts, search tests) | Not run against a live OpenViking service: the shipped install cannot start one (Clarification 13, T016 reopened) |
| US6 | Memory service down, fall back within 2 s | **Pass, measured** | Refused: 20/20 fell back, p95 244 ms. Black-holed: 20/20 fell back, p95 1731 ms (was 2597 ms before the 1.5 s service budget, Clarification 11); `evidence/sc4-timing.json` |
| US7 | Observe mode gives the baseline | **Pass, live** (round 1) | Question reached the developer, nothing blocked, log `observed`, D-0001, `wouldHaveAnswered: true` |
| US8 | Ledger written from a brainstorm; import for owner approval | **Pass, live** | Cold agent at the wxBrainstorm close, owner "record it": 5 entries (Agreed, Added, Changed, Declined, Parked with evidence unknown and "Open: the customer answers."), `check` passes. Owner "change the summary first": **failed in round 2a** (the gate assumed the agent's questions and it recorded 5 unapproved entries), fixed (Clarifications 8, 9), re-run twice: 0 entries written. Import: round 1, 14 entries from a real record |

## Success metrics

| # | Metric | Status |
|---|---|---|
| 1 | At least 80% fewer repeat questions vs the observe baseline | **Not measured**: needs a real multi-agent pilot (observe, then enforce) |
| 2 | 0 wrong answers served (superseded, unknown, unlinked) | **Pass on replay**: 433 gate-log lines from 13 live projects, 91 answered, 0 from an ineligible entry; `evidence/sc2-replay.json` |
| 3 | 0 blockers classified as assumptions on the 30-question set | **Pass**: 41 labelled + 4 conversion-mode; 3 owner-approval questions found live were added |
| 4 | 95% of gate decisions inside 2 s | **Pass, measured**: 140/140 real hook processes inside 2 s across no service, refused, black-holed (node start included) |
| 5 | 100% of AskUserQuestion calls pass the gate in every permission mode | **Pass, live**: default, acceptEdits, plan, auto, dontAsk, bypassPermissions; each denial attributed to the hook from the transcript |
| 6 | 0 agent writes to the ledger | **Pass, live, every mode**: a direct Write (after a Read), a Bash append, and `rm -rf decisions` all denied by the ledger guard; ledger hash unchanged in all 6 projects. `rm -rf decisions` **passed both hooks in round 2a and deleted the ledger**; fixed (Clarification 10) and re-run; `evidence/t013-round2-ledger-write-and-rmrf.json` |
| 7 | Kit upgrade leaves decisions/ unchanged | **Pass in a unit test** against the real consumer upgrade script on a temp tree; no real release run yet |

## Installation (FR-005)

`_wxAI/impact/install-hook.mjs`, the installer the Cockpit runs, now installs, checks and removes the Ask Gate hooks as well (owner approved the SCOPE-137 change, 2026-10-23). Tested against the real CLI: install, reinstall (one of each), `--check` exit codes, uninstall leaving the project's own hooks (`gate.install.test.ts`).

## Hook precedence (T013, FR-012)

- A `DROP TABLE` Write: the impact hook stopped it ("possible data loss") in all 6 modes with the Ask Gate's guard installed beside it; the guard had no opinion.
- `rm -rf decisions`: both hooks fired on the same call; the impact hook gave notify only, the guard's deny held.
- The Ask Gate never answered `allow` on any call (unit fixture `gate.precedence.test.ts`, and none seen live).
- Harness note: a first attempt had removed `_wxAI/impact/fixtures/`, which the impact hook imports at run time. The hook then crashed with `ERR_MODULE_NOT_FOUND`, Claude Code treated that as a non-blocking error, and the `DROP TABLE` file was written. A crashing impact hook fails open; that is SCOPE-137 behavior, reported, not changed here.

## Not verified

- OpenViking against a real service (T016 reopened; owner picks the embedding option).
- The hosted G.O.D. method (T014) until the hosted MCP is redeployed and the served `wxgod` prompt is probed.
- SC-1, the pilot reduction figure.
- Two functions (`decideStop`, `runGate`) have orchestrator fences that close after the signature line, not after the body (a fence-emitter limitation with destructured parameters). Fence lines were not hand-edited.
