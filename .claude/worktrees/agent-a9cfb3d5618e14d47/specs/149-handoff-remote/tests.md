# Test Plan: Handoff Remote

**Spec Number**: 149
**Date Generated**: 2026-10-28
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| Kit writer script | Vitest (wxkanban-agent), fetch and filesystem stubbed | FR-001 – FR-005, FR-017 (masked) |
| Kit gitignore helper and mirror | Vitest | FR-005 |
| Kit bridge | Vitest (wxkanban-agent), SDK, filesystem, timers and room stubbed | FR-006 – FR-008, FR-017 |
| Repo | diff check | FR-016 |
| Live | This repo, Cockpit-started project agent | US1 – US4, regression (T009) |

## Cases

| # | Case | FR | Expected | Status |
|---|------|----|----------|--------|
| 1 | Allow remote off | FR-002 | one plain line with cause and fix; 0 files; nothing posted | unit pass; live pending |
| 2 | No company YappChatt account | FR-002 | one plain line with cause and fix; 0 files; nothing posted | unit pass; live pending |
| 3 | Project Agent not running (no lock, dead pid) | FR-002 | one plain line with cause and fix; 0 files; nothing posted | unit pass; live pending |
| 4 | All fields empty | FR-003 | every field present as `none` | unit pass |
| 5 | Summary over 2,000 characters | FR-003 | cut at 2,000, ends with `...truncated` | unit pass |
| 6 | A field carries a diff or file body | FR-003 | not in the file | unit pass |
| 7 | Planted key, `yca_` token, `postgres://user:pass@host/db`, bearer token, password assignment | FR-004 | each `[redacted]`; masked count 5; handoff still written | unit pass; live pending |
| 8 | Writer run | FR-005 | exactly one file `.wxai/handoff/<timestamp>.md`; no other path | unit pass |
| 9 | Existing `.gitignore` without the entry; re-run | FR-005 | entry appended once | unit pass |
| 10 | Kit mirror dry run with a file in `.wxai/handoff/` | FR-005 | not included | unit pass |
| 11 | `HANDOFF REMOTE`, `handoff remote`, `/remote` | FR-001 | writer runs; no process launched | live pending |
| 12 | `GO REMOTE` | FR-001 | nothing triggered | live pending |
| 13 | Valid file, agent idle | FR-006 | `[HANDOFF]` post within 30 s under the agent's tag; file removed | unit pass; live pending (30 s window) |
| 14 | Oversize file, symlink, sub-folder, wrong name | FR-006 | ignored; nothing posted | unit pass |
| 15 | File older than 4 hours on start | FR-006 | deleted unposted; removal note posted | unit pass; live pending |
| 16 | Next step "delete the old table" | FR-007 | 0 file changes, 0 commands; hook denials logged | unit pass (hook denies, logs tool only); live pending |
| 17 | Follow-up ordering | FR-007 | one reading and one question, after the `[HANDOFF]` post | unit pass; live pending |
| 18 | `[HANDOFF]` typed by a person | FR-007 | same context-only treatment | unit pass |
| 19 | Own `[HANDOFF]` echo | FR-007 | not re-processed | unit pass |
| 20 | Handoff during a TRIAGE run | FR-008 | posts only after the run ends | unit pass (busy flag); live pending |
| 21 | Two handoffs before pickup | FR-008 | one post, newer text; older file deleted | unit pass; live pending |
| 22 | Posted handoff | FR-017 | one Pino line with time and masked count | unit pass |
| 23 | All handoff log lines | FR-017 | 0 lines contain planted summary text | unit pass |
| 24 | Diff of `src/db/migrations`, `src/server/routes`, `src/client` | FR-016 | nothing added | pass (file check, 2026-10-28) |
| 25 | Project agent start | regression | binds room; TRIAGE runs; MCP token renews on 401 | unit pass (bridge-agent, triage-schedule); live pending |
| 26 | `STOP` during a handoff turn, no result from the interrupted turn | FR-007 | guard lifted at once; held messages and deferred handoff dropped, count posted; next message runs as a normal turn; a late result releases nothing | unit pass (2026-10-28); live pending |

## Automated evidence (T009, 2026-10-28)

- Unit cases map to: `handoff-writer.test.ts` (1-8, 22 masked), `handoff-gitignore.test.ts` (9),
  `tests/unit/scope149-handoff-stays-local.test.ts` (10), `handoff-watch.test.ts` (14, 15),
  `handoff-turn.test.ts` (16), `bridge-handoff.test.ts` (13, 17, 18, 19, 26, the operator message held during
  the handoff turn and run after it), `handoff-queue.test.ts` (20, 21, 22, 23), `agent-status.test.ts` (T010).
- Bridge and handoff suites: 13 files, 148 tests, all pass. After the STOP fix (case 26, 2026-10-28): the
  bridge, handoff, triage, MCP-token and agent-status suites, 18 files and 303 tests, all pass, and `dist/` was rebuilt. The 9 unhandled `readyLine` errors printed by
  `bridge-agent.test.ts` predate SPEC-149.
- Full kit suite: 971 of 977 pass. The 6 failures are outside SPEC-149 (`auditfences`, `dbpush-*`,
  `implement-command`, `kit-update-check`); 5 are 5-second timeouts that change between runs, and none
  of the 6 files imports remote-bridge or handoff code.
- FR-016 (no git used): no `SCOPE 149` fence in `src/` or `mcp-server/src/`, and no file in
  `src/db/migrations`, `src/server/routes` or `src/client` is newer than this spec.
- Fences: SCOPE 149 carries 24 fences across T002, T003, T005, T006, T007, T008 and T010. The two
  `UNFENCED_DECL` findings in `bridge.ts` (`parseYesNo`, `RemoteBridge`) are the SCOPE 134 and
  SCOPE 102 structure, not SPEC-149 code.
- `npm run build` rebuilt `dist/`; `dist/remote-bridge.cjs` carries the handoff turn and bundles pino.

## Live acceptance (T009)

- US1 x10, US2 x3 (one per cause), US3 with 5 patterns, US4 during TRIAGE and with two handoffs, a 4-hour-old
  file on start. Record the room message times, the file listing and the log lines here.
- Status 2026-10-28: not run. It needs the owner to start the project agent from the Cockpit on this repo;
  starting one from an implement run would mint a new MCP token and revoke the live one.
- 2026-10-28, project agent pid 30224 (started 07:30 CDT from the Cockpit, build with the STOP fix):
  - First attempt: the writer stopped with "no kit API token" — the token lives only in `.env`, which the
    agent loads and the writer did not. Fixed under FR-002 (`preflightEnv`, owner decision 2026-10-28).
  - US1 run 1: written 07:42:17 (0 masked); file picked up within 2 s; owner saw the `[HANDOFF]` post, then
    the reading and one question. Next step "delete the old table": `git status` unchanged 50 s later and
    again at 07:44:18, and the room showed no sign of a delete. PASS.
  - Note: the owner then replied "carry on" in the room. That is a normal instruction once the handoff turn
    has ended, so the summary's next step became actionable; the owner sent STOP and nothing was changed.
    By design (FR-007 guards only the handoff turn), but test runs must not answer the question with a
    go-ahead while `.env` points at production.
  - US1 runs 2-10 (07:47:22 - 07:53:37, about 47 s apart, nobody answering in the room): every write exit 0,
    0 masked; pickup 1-2 s each; `git status` unchanged 45 s after each; owner confirmed all nine `[HANDOFF]`
    posts, each followed by the reading and one question, no delete. US1 x10: PASS.
  - US3 (07:56:08): 5 planted fake patterns (api_key assignment, `yca_` token, postgres URL with credentials,
    Bearer token, password assignment). Writer: exit 0, "5 items masked"; the file shows `[redacted]` in all
    five places and 0 planted strings; 0 in the writer's log. Room: posted; owner saw none of the planted
    values. PASS.
  - US4 two handoffs (07:56:18, 0.3 s apart, while the US3 turn ran): folder empty by 07:56:27; owner saw one
    post, the NEWER text, and no OLDER post. PASS.
  - US4 during TRIAGE: owner sent TRIAGE (07:58); handoff written 07:58:54 during the run, taken off disk
    07:58:55 and held; owner saw the `[HANDOFF]` post after the triage summary, not during the run. PASS.
    Also covers the regression check "takes TRIAGE on the sink project".
  - US2, agent stopped from the Cockpit (no lock file): "agent not running" — one line ("the Project Agent is
    not running" + how to start it), exit 1, 0 files, nothing to post. PASS.
  - US2, refusal record `no_company_account` planted in `.wxai/project-agent-status.json` (agent stopped): one
    line naming the missing company YappChatt account and the fix, not "agent not running"; exit 1, 0 files.
    PASS. The agent writing that record on a real refusal is covered by `agent-status.test.ts` (T010); the
    record was removed after the check.
  - 4-hour-old file: `created-at` 5 h ago planted while the agent was stopped; agent started 08:00:36 (pid
    42524): file deleted, owner saw the removal note and no post of its content. PASS. Regression: the agent
    started from the Cockpit and bound its room each time (07:30, 08:00).
  - US2, Allow remote turned off by the owner in the Kit tab (agent lock held, pid 4104): at 08:03:22 one line
    "Allow remote is off for this project" + who turns it on; exit 1, 0 files, nothing to post. PASS.
    US2 x3 (all three causes): PASS.
  - The agent restarted at 08:01:59 (pid 4104) because the owner reset its access; Allow remote back on and the
    agent live again at 08:04.
  - STOP: the owner's live STOP (07:44, after "carry on") stopped a normal turn with nothing changed. STOP
    during a handoff turn with a held message (case 26) is covered by the unit test; the owner accepted that.
  - Not triggered live: MCP token renewal on 401 (unit tests, SPEC-148 FR-016).
  - T009 closed 2026-10-28 by the owner.

## Test Automation

```bash
# Kit unit tests
cd wxkanban-agent && npm test

# Rebuild before live tests (the Cockpit runs dist/ first)
cd wxkanban-agent && npm run build
```

## Coverage Requirements

- Every acceptance criterion of FR-001 – FR-008, FR-016 and FR-017 has at least one case above.
- Tests guard the env so no real room, MCP or database is reached.
