# Test Plan: KAIN Session Status

**Spec Number**: 155 (implements SCOPE-132 Amendment G, piece A)
**Date Generated**: 2026-11-07
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|---|---|---|
| Schema / DDL | `npm run db:drift` | All five new columns present after manual apply (T001) |
| Bridge / hook | Vitest, run against a worktree fixture | Hook timing and exit code (FR-001, SC-29), masking (FR-001, FR-002, SC-28), rolling-summary maintenance (FR-002) |
| API | Vitest + supertest-style route tests | Heartbeat extension and clearing (FR-003), status route auth/reach/audit (FR-004) |
| MCP | Vitest | `project.get_session_status` returns the same shape as the REST route (FR-004) |
| Cockpit | manual / static review | `shareStatus` setting default and status bar text (FR-005) |
| Regression | Vitest | Existing HANDOFF REMOTE and SCOPE-151 heartbeat cycle unaffected (FR-006) |
| Contract | `docs/kain-contract.md` fixtures | New status-read shape matches what the agent emits (T009) |

## Cases

| # | Case | FR | Expected |
|---|------|----|----------|
| 1 | A turn ends with sharing on and an agent running | FR-001, SC-29 | One masked line appended to `.wxai/session-feed.jsonl`; hook exits 0 in <200ms |
| 2 | 100 simulated turns, p95 timing | FR-001, SC-29 | p95 hook runtime <200ms; 100% exit 0; 0 blocked turns |
| 3 | `WXAI_REMOTE=1` set | FR-001 | Hook writes nothing |
| 4 | Sharing off (Cockpit setting) | FR-001, FR-005 | Hook writes nothing |
| 5 | No project agent running for the repo | FR-001 | Hook writes nothing |
| 6 | Feed file exceeds 200 lines | FR-001 | Only the last 200 lines are kept |
| 7 | A turn's message contains a secret pattern | FR-001, SC-28 | Secret masked in the feed line |
| 8 | New feed lines present | FR-002 | Rolling summary (≤1500 chars), last entry (≤500 chars), blocker titles updated via the cheap model tier |
| 9 | No new feed lines | FR-002 | No summarization run; no model call |
| 10 | Summary built from a line containing a secret pattern | FR-002, SC-28 | Secret still absent after the second masking pass before upload |
| 11 | Heartbeat posts `{ summary, lastEntry, blockers, sharing: true }` | FR-003 | Connection record overwritten; no history row added |
| 12 | Connection closes | FR-003, new SC | `sessionsummary`, `lastentry`, `blockers` cleared on the next write |
| 13 | Connection lapses stale | FR-003, new SC | Same clearing as case 12 |
| 14 | Heartbeat reports `sharing: false` | FR-003, FR-005 | Content columns cleared; `sharing` set false |
| 15 | Older server ignores the new heartbeat fields | FR-003 | No agent-side error; behavior otherwise unchanged |
| 16 | K.A.I.N. calls the status route/tool for a live, sharing, in-reach project | FR-004, SC-27 | Returns summary ≤60s old, last entry, blockers, state, last-seen, live/stale/gone, `director: null`; one `agent.status.read` audit row written |
| 17 | Caller is out of `agentReach` | FR-004 | `404 not_granted`; no summary content returned |
| 18 | Sharing is off for the project | FR-004 | `{ sharing: false }` returned; no summary content |
| 19 | REST route vs. MCP tool, same project and state | FR-004 | Identical response shape from both |
| 20 | Cockpit setting read with no prior value set | FR-005 | Defaults to on |
| 21 | Setting turned off, then a heartbeat sent | FR-005, FR-003 | Status bar reads "Remote: live"; content columns cleared on that heartbeat |
| 22 | Setting on | FR-005 | Status bar reads "Remote: live · sharing status" |
| 23 | An existing HANDOFF REMOTE and SCOPE-151 heartbeat cycle run with the new columns present but unused | FR-006 | Behaves exactly as before this spec shipped |
| 24 | Hook run against `.remember` or any transcript file | FR-006 | Hook never reads or writes either — only `.wxai/session-feed.jsonl` |
| 25 | 10-secret-pattern seeded run across the full path (hook → summary → heartbeat → status read) | SC-28 | 0 unmasked secrets anywhere in the feed file, the connection record, or any response |

## Evidence

None yet — implementation has not started as of spec creation (2026-11-07). Populate this section
with file:line references as each task lands, per house convention for later specs' tests.md.
