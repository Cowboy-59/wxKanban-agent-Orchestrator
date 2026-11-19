# Brainstorm: smoothing the build process (stops, subagents, "done"), plus an analyze switch

- **Status:** closed
- **Opened / last updated:** 2026-11-08 / 2026-11-08
- **Source:** internal (owner, after the SPEC-154 / SPEC-155 build took 20+ hours)
- **Asked for by:** the owner (CTO), for wxKanban and for the current customer apps and conversions
- **Level:** senior
- **Next item:** hand-off, /buildscope for the analyze switch first (build order row 8)

## The request

The topic opened as agent teamwork on a collision: when two agents would work the same thing, the
agent that is ready claims it, does it, and tells the others. The owner then widened it: find out why
the last ~24 hours of build work (SPEC-154 Autopilot, SPEC-155 session status) took 20+ hours, and
smooth the process in three places:

- **Part A, too many stops:** questions the scope should already have answered, gates and blocks.
- **Part B, subagents:** taking a scope's tasks, assigning them to subagents, and keeping them from
  conflicting (the original collision topic).
- **Part C, completion:** work reported done that was not wired, found later.

At the close the owner added an analyze switch: the panel analyzes a current app or a conversion for
issues and gaps. First use: 14 customer conversions.

### Findings from the last ~24 hours

- **Time:** about 13.6 hours active and 6.9 hours waiting over 204 runs (decisions/agentrun-log.jsonl;
  waiting is any gap over 2 minutes, _wxAI/routing/capture-worker.mjs). An overnight break of about
  10 hours is not counted. Largest waits: 11-07 17:00 (99 min), 11-08 12:00 (74), 11-07 10:00 (50),
  11-08 06:00 (36). Confirmed.
- **Part A:** Change Impact approvals are bound to the exact edit (T004 blocked on retry 5, T008 six
  approvals, T009 three, T002 cascade audit blocked); 27 boundary crossings on the evening of 11-07
  local (.wxai/impact-crossings.jsonl). Owner calls the spec should have answered: SPEC-155 T004,
  T006, T008, T009. Approval prompts did not reach chat until the T022 relay. One pre-commit retry.
  Confirmed.
- **Part B:** no gated edit delegated to a subagent ever got through, because the approval binds the
  exact bytes (specs/154-project-agent-autopilot/tasks.md:105-109). No collision handling for
  subagents in one tree. Confirmed.
- **Part C:** SPEC-154 was reported done and pushed on 11-07 at 14:14; afterwards the Autopilot switch
  was missing from the screen, "go" never called runPipeline, T004/T008/T009/T010 were unwired
  libraries, buildHeartbeat and buildFullSummary had no caller, and paused was hardcoded false. The
  T013 full-flow test passed while the guard was unreachable in production. The task table disagrees
  with itself. Confirmed.
- **Root cause of the threading:** SPEC-154 has six user stories (spec.md:105-139) but its tasks were
  cut one per requirement (tasks.md:14-26), so no task owned connecting the pieces, and that
  knowledge lived only in a session that was cleared. Confirmed.

## What already exists

| Item | Status | Evidence | Confidence |
| --- | --- | --- | --- |
| Scope check-out (person-level claim, conflict names the holder, audited force) | Built; read-then-write race, no stale timeout, skipped for one-person companies | mcp-server/src/server.ts:2690-2800; specs/058-scope-branch-checkout/spec.md | Confirmed (race Likely) |
| One agent per working tree (refuses a second bridge) | Built, bridge only | wxkanban-agent/apps/remote-bridge/src/agent-mode.ts:219-262 (SCOPE-132 FR-026) | Confirmed |
| Connection record and heartbeat (idle, working, waiting) | Built | wxkanban-agent/apps/remote-bridge/src/connection-record.ts (SPEC-151) | Confirmed |
| Worktree per unit, parallel status file and panel | Specified, not built | specs/Project-Scope/136-wxgod-development-manager.md:401-447 | Confirmed |
| Autopilot runs units one after another under the lock | Built | autopilot-pipeline.ts:12-21 | Confirmed |
| Change Impact approvals: same edit, retried once, within 30 minutes | Built | _wxAI/impact/approve.mjs:12-13 | Confirmed |
| Unattended mode logs crossings and goes ahead (data loss still stops) | Built, unattended only | _wxAI/impact/unattended.mjs, lib/unattended.mjs | Confirmed |
| Approval prompts relayed to chat | Written, not committed | _wxAI/impact/lib/chat-relay.mjs (SCOPE-137 Amendment C, T022) | Confirmed |
| Parallel tasks only when they share no file | Built (advice) | .claude/commands/implement.md:99-100 | Confirmed |
| Manager check after a subagent: fences and tests only | Built | .claude/commands/implement.md:101-102 | Confirmed |
| Wiring / reachability check ("only callers are tests" is a defect) | Built, skipped on implement's auto-run, advisory, after done | .claude/skills/wxUIUXCodeReview/SKILL.md:176-195, 263-270; implement.md:121-134 | Confirmed |
| task-done checks only the database status flip | Built | .claude/commands/task-done.md:18-50 | Confirmed |
| Tasks organized by user story with independent tests | Rule exists, not applied to SPEC-154 | .claude/commands/wxAI-tasks.md:33-44, 75 | Confirmed |
| Ask Gate: ledger answers, assumption or blocker | Built (SPEC-142), not running in this project | _wxAI/askgate/gate.mjs:1-20, classify.mjs; no decisions/settings.yaml or hook | Confirmed |
| Feature registry | None; capability types have no feature | mcp-server/src/server.ts:5236; searched specs/Project-Scope (167 files) | Confirmed |
| Feature seeds: 26-feature list, marketing feature clustering, scope-flow-map, file-to-scope impact index | Built | docs/wxKanban-Podcast-Feature-Set.md section 4; .wxai/impact-index/facts.json | Confirmed |
| Analysis tools: G.O.D. plan mode, analyzescope, analyzecode, wxUIUXCodeReview --audit, wxConversionParity, wxDBAnalyze, compliance-scan | Built | each command's description | Confirmed |
| wxBrainstorm, wxG-O-D, wxUIUXCodeReview ship in the kit | Built | scripts/sync-to-orchestrator.mjs:251-256 | Confirmed |
| Industry: feature list with pass flags set only by an end-to-end check, progress file, one feature per session | Practice | Anthropic, "Effective harnesses for long-running agents" (2025-11) | Likely |

## Panel

Spoke: Lead Architect (chair), Domain Analyst, Database, Backend, Frontend, DevOps, Security, QA,
Documentation · Sat out: Legacy Analyst, Migration Engineer

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
| --- | --- | --- | --- | --- | --- |
| 1 | The need behind agent teamwork on a collision | Coordination, not prevention: one agent per piece of work at a time, visible to every agent, passed to a ready agent with an announcement and no owner step; safety is the floor. Done when two agents given the same work: one works it, the other reports the holder and moves on, nothing lost or committed twice. | Agreed | no (delivered by row 6) | 2026-11-08 |
| 2 | Operating model and who decides "done" | CTO (owner) and the design committee (panel) shape the work; after sign-off the Software Manager (Project Agent) runs the devplan with programmers (subagents). The manager, not the programmer, decides a task is done, and its check includes "every new piece has a caller outside the tests". | Agreed | yes (build order step 2) | 2026-11-08 |
| 3 | How tasks are cut | Every scope's tasks are cut by user story (the existing rule, enforced); each story starts with a walking-skeleton task from the real entrance to the result; each story's end-to-end test is written failing at spec time; each scope ends with a "connect and prove it" task the manager cannot skip or mark done by hand. | Agreed | yes (build order step 2) | 2026-11-08 |
| 4 | Feature list (owner idea; open to adjust after the first real use) | Levels: request in the user's words, features, scopes, stories and tasks. Per request the committee presents must-have and optional features; the CTO goes item by item (keep, explain, not needed, discuss); declined items kept with the reason. A feature records entrances, delivering scopes, end-to-end tests, and a status set only by tests. Lives in a repo file read at every session start, mirrored to the DB. buildscope names each scope's feature; the impact check runs that feature's tests. The existing scopes are grouped once, committee proposes, CTO approves. | Added | yes (build order step 5) | 2026-11-08 |
| 5 | Approval stops (approved-plan mode) | The attended twin of unattended mode: a signed-off scope covers the features, scopes and files it names; edits inside it, by the manager or any programmer, are logged and go ahead and are shown at the closing task. Always stops: possible data loss; login and accounts, secrets, money, schema; any crossing into a feature the scope did not name. What still stops reaches chat (finish T022). Expires when the scope closes. | Added | yes (build order step 3) | 2026-11-08 |
| 6 | Manager as coordinator for programmers | One manager per working tree (the one-agent-per-tree lock kept); a claims board in the repo (task, files, holder); a programmer needing a held file takes the next free task; only the manager commits; only the manager reassigns and announces handovers; a person's claim only by the existing audited force. Second version: a worktree per scope merged one at a time, and the scope check-out fixed (conditional update for the race, stale on a quiet heartbeat, claims for one-person companies). | Agreed | yes (build order step 6) | 2026-11-08 |
| 7 | Analyze switch on brainstorm (owner idea) | /wxBrainstorm --analyze (optional --dir, --conversion) runs the existing analyzers on one app, each in its own subagent; the panel presents must fix, gaps and optional improvements grouped by feature; the CTO goes item by item; agreed items go to scopes, declined kept; findings saved so a re-run shows what changed; one app per sitting, then a cross-app pass that fixes a repeated gap once in the converter. First use: 14 customer conversions; the first app is the trial run. | Added | done (SCOPE-156) | 2026-11-08 |
| 8 | Build order | (1) analyze switch, (2) done and task cutting, (3) approved-plan mode and the chat relay, (4) Ask Gate on, (5) feature list, (6) manager as coordinator, first then second version. First real test of step 2: finishing SPEC-155. | Agreed | no | 2026-11-08 |
| 9 | Ask Gate in this project | Turn it on, so approved lists and logged assumptions answer build-time questions; only real choices stop. | Added | yes (build order step 4) | 2026-11-08 |
| 10 | How the panel works | The panel brings the ideas and a complete proposal; the owner reacts, changes or vetoes. It asks only real choices (money, security, client data, anything irreversible), never open questions with obvious answers. | Added | done (SCOPE-156) | 2026-11-08 |
| 11 | Handover between agents | Changed from agent-to-agent claiming to handover through the manager, and the topic widened from collisions to the whole build process. | Changed | no | 2026-11-08 |
| 12 | A programmer takes work over by itself | Declined: only the manager reassigns. | Declined | no | 2026-11-08 |
| 13 | Programmers commit | Declined: only the manager commits (prevents clobbered commits in one tree). | Declined | no | 2026-11-08 |
| 14 | Ask the owner open questions the team can answer | Declined: the committee proposes the complete version for review instead. | Declined | no | 2026-11-08 |
| 15 | Weaken the hard stops | Declined: data loss, login and accounts, secrets, money and schema always stop. | Declined | no | 2026-11-08 |
| 16 | Coordinator across projects | Parked: deferred, as in the 2026-11-07 brainstorm. Open: the owner answers. | Parked | no | 2026-11-08 |
| 17 | Which tool cut SPEC-154's tasks one per requirement | Parked: checked when build step 2 is built. | Parked | no | 2026-11-08 |
| 18 | SPEC-154 task table disagrees with itself (T003, T007, T009) | Parked: corrected when SPEC-155 is finished. | Parked | no | 2026-11-08 |
| 19 | Impact tool shows no specs for SCOPE-136 though the folder exists | Parked: checked when build step 6 is built. | Parked | no | 2026-11-08 |

## Open items

- Rows 16-19 are parked as listed.
- Row 4 stays open to adjust after its first real use; row 7's format is adjusted after the first app.

## Next step

Take the agreed items to scopes in build order, one at a time, with the owner's go before each
/buildscope. Rows 7 and 10 are done: specs/Project-Scope/156-brainstorm-analyze-mode.md (SCOPE-156,
draft, not yet pushed to the database). Its createSpecs and the rest run through /wxG-O-D on the
owner's go. Next in build order: rows 2 and 3 (done and task cutting), each on the owner's go.
