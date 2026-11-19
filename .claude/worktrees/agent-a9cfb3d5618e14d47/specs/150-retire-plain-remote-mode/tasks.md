# Task Breakdown: Retire Plain Remote Mode

**Feature**: Retire Plain Remote Mode
**Spec**: 150
**Date Generated**: 2026-10-28
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Check the five SCOPE-102 dependents for reliance on the plain mode, before any removal (FR-010 - FR-012) | critical | done |
| 2 | T002 Remove the plain .env launch from main.ts; npm run remote becomes the project-agent path (FR-010) | critical | done |
| 3 | T003 Remove environment input for the room and the deprecated aliases from the YappChatt client (FR-011) | high | done |
| 4 | T004 Remove the WXKANBAN_REMOTE_SEED and WXKANBAN_REMOTE_RESUME hooks (FR-012) | high | done |
| 5 | T005 Remove or rewrite the plain-mode tests and the yappchatt-smoke script (FR-013) | high | done |
| 6 | T006 One-time notice for old room keys in .env; the kit never edits .env (FR-014) | medium | done |
| 7 | T007 Retire GO REMOTE in the docs and record the release notes (FR-009, FR-015) | high | done |
| 8 | T008 Kit mirrors in sync, checked by md5, and the build (FR-015) | high | done |
| 9 | T009 Acceptance: US1 - US3 and the project agent regression (FR-009 - FR-015) | high | todo |
| 10 | T010 G.O.D. goes unattended through HANDOFF REMOTE: rewrite N12, R7 and the wxgod.md summary (FR-018) | high | done |

## Task Details

### T001 — T001 Check the five SCOPE-102 dependents for reliance on the plain mode, before any removal (FR-010 - FR-012)

Before T002 starts, read SCOPE-109 (specs/Project-Scope/109-customer-welcome-message.md), SCOPE-132 (132-kain-autonomous-driver.md), SCOPE-136 (136-* and specs/136-wxgod-development-manager/tasks.md), SCOPE-142 (142-* and specs/142-decision-memory, including evidence/us3-resume.ts and evidence/us3-live.ts) and SCOPE-143 (143-*) and their implementing specs and code for any reliance on: the plain .env launch (npm run remote without --project-agent), YAPPCHATT_ROOM / YAPPCHATT_TOKEN / YAPPCHATT_EMAIL read from the environment, the WXKANBAN_* aliases, WXKANBAN_REMOTE_SEED / WXKANBAN_REMOTE_RESUME, or the GO REMOTE phrase. Record each dependent as 'no reliance', 'doc mention only' or 'relies' with file:line evidence in specs/150-retire-plain-remote-mode/research.md. If any relies on behavior this spec removes, STOP and raise it with the owner before T002; doc-only mentions are folded into T007.

### T002 — T002 Remove the plain .env launch from main.ts; npm run remote becomes the project-agent path (FR-010)

wxkanban-agent/apps/remote-bridge/src/main.ts (SCOPE-102 T004 block, MODIFIED-BY via implement): delete the plain launch, from the non-project-agent path on: loadRepoEnv as room input, the 'YAPPCHATT_EMAIL is not set' exit and the start without --project-agent. Without project-agent configuration the entry point refuses with one plain line pointing at the Cockpit or npm run remote. Change the 'remote' script in wxkanban-agent/package.json (and any kit manifest that carries it) so npm run remote runs the project-agent path (the same path as apps/remote-bridge/bin/project-agent.mjs, which the Cockpit launches). Keep intact: the worktree lock, connectProjectAgent, assertDistinctTag, the refusal lines the Cockpit matches, the SPEC-148 projectAgentConfig and mcpExpiresAt hand-over, the shutdown and stdin-close handling. Acceptance and tests: npm run remote starts the project agent; it binds its room, honors Allow remote, takes TRIAGE and renews its MCP token as before; the Cockpit launcher still works.

### T003 — T003 Remove environment input for the room and the deprecated aliases from the YappChatt client (FR-011)

wxkanban-agent/core/yappchatt/client.ts, the 'YappChatt config + identity resolver (env-driven)' block (resolveYappchattConfig, SCOPE-102 T001) and core/yappchatt/index.ts: stop reading YAPPCHATT_ROOM, YAPPCHATT_TOKEN and YAPPCHATT_EMAIL from the environment as input, and delete the WXKANBAN_YAPPCHATT_*, WXKANBAN_YAPPCHAT_*, WXKANBAN_REMOTE_ROOM_ID and WXKANBAN_CHAT_* aliases and their messages. The project agent sets the values in memory for itself: it hands its connection (conversationId, room token, operator email, display name) to the bridge and client directly (or in-process memory set only by the agent), never from .env. Update callers in bridge.ts and agent-mode.ts. Take the full reference list from source files at task time (Grep, excluding node_modules and dist). Acceptance: no source file reads those variables as input; the project agent still connects, reads history and posts.

### T004 — T004 Remove the WXKANBAN_REMOTE_SEED and WXKANBAN_REMOTE_RESUME hooks (FR-012)

Delete WXKANBAN_REMOTE_SEED and WXKANBAN_REMOTE_RESUME and the code behind them: the seedContext / resumeSessionId options passed in main.ts, their handling in bridge.ts and session.ts, and their description in wxkanban-agent/apps/remote-bridge/README.md. The project agent starts its session with no seed, as it does today when none is set. Acceptance and tests: no source file reads either variable; the project agent still starts a session, reconnects and serves room messages without them.

### T005 — T005 Remove or rewrite the plain-mode tests and the yappchatt-smoke script (FR-013)

In wxkanban-agent/tests/unit (yappchatt-client.test.ts, bridge-agent.test.ts, bridge-unattended-env.test.ts and any other test found by searching for the removed variables): delete cases that start the bridge or resolve the room from .env keys or the aliases; keep or rewrite cases for the project-agent path (connection handed over in memory). wxkanban-agent/scripts/yappchatt-smoke.ts: remove it, or rewrite it to smoke-test the project-agent path with the project's kit token; remove any npm script or doc reference to the old form. Acceptance: no test starts the bridge from .env room keys; the kit test suite passes.

### T006 — T006 One-time notice for old room keys in .env; the kit never edits .env (FR-014)

On the first kit run after the upgrade (the project agent's start and the kit CLI entry), check whether the repo-root .env contains the key NAMES YAPPCHATT_ROOM, YAPPCHATT_TOKEN, YAPPCHATT_EMAIL or the removed WXKANBAN_* aliases (match names only; never read, log or print a value). If present, print exactly one notice that they are no longer read and can be deleted, and record that the notice was shown in a git-ignored kit state file under .wxai/ so it never repeats. The kit never writes .env. Tests with a temp repo: notice once across three runs; no notice when the keys are absent; .env hash identical before and after; no value in any output.

### T007 — T007 Retire GO REMOTE in the docs and record the release notes (FR-009, FR-015)

Remove every remaining GO REMOTE mention, with no redirect, and update the docs for the project-agent-only path: CLAUDE.md (any remaining reference after SPEC-149 T004), _wxAI/rules/remote.md (final text), the /remote command copies, docs/guides/wxG-O-D.md, docs/guides/guide-claudeRules.md, docs-workspace/sections/reference (cmd-remote.md, commands-a-z.md, commands-by-stage.md, commands-by-where.md), docs-workspace/commands.json, docs-workspace/wxKanban-Feature-List.md, the regenerated public/manual pages, mcp-server/src/prompts/wxgod/references/new-project.md, wxkanban-agent/apps/remote-bridge/README.md, and comments in main.ts, bridge.ts and session.ts. Add changelog entries (CHANGELOG.md and wxkanban-agent/CHANGELOG.md) that record GO REMOTE and the plain .env bridge mode as retired, the YAPPCHATT_* room keys as no longer read, and HANDOFF REMOTE as the replacement. Add a note under SPEC-145 spec.md line 53 (Out of Scope, 'Plain GO REMOTE') that the plain mode was removed by SCOPE-149 / SPEC-150. Fold in any doc-only mentions T001 found in the five dependent scopes. Acceptance: a search for GO REMOTE in the kit finds it only in the changelog as retired.

### T008 — T008 Kit mirrors in sync, checked by md5, and the build (FR-015)

Check git status and the last three commits for concurrent sessions first. Rebuild wxkanban-agent so dist/remote-bridge.cjs matches the source. Run scripts/sync-to-orchestrator.mjs --dry-run, then sync, and compare md5 of every changed rule, command and README between this repo and the orchestrator checkout (_wxAI/rules/remote.md, .claude/commands/remote.md, _wxAI/commands/remote.md and any other changed mirrored file); confirm no .wxai/handoff/ file and no .env is in the mirror. Acceptance: every mirrored file matches by md5. Cutting the kit release, pushing and publishing wait for the owner's go.

### T009 — T009 Acceptance: US1 - US3 and the project agent regression (FR-009 - FR-015)

With the rebuilt kit on this repo: US1 npm run remote starts the project agent, which binds its room, honors Allow remote, takes TRIAGE on the sink project and renews its MCP token on 401 (SPEC-148 FR-016); the Cockpit start works too; SPEC-149's handoff still posts. US2 a temp repo with the old keys in .env: notice exactly once over 3 runs, .env hash identical. US3 a search for GO REMOTE in the kit finds only the changelog entry; a search for YAPPCHATT_ROOM, YAPPCHATT_TOKEN, YAPPCHATT_EMAIL, WXKANBAN_REMOTE_SEED and WXKANBAN_REMOTE_RESUME as environment input finds 0 source files; the kit test suite passes. Record the evidence in specs/150-retire-plain-remote-mode/tests.md. No push or kit release without the owner's go.

### T010 — T010 G.O.D. goes unattended through HANDOFF REMOTE: rewrite N12, R7 and the wxgod.md summary (FR-018)

Added 2026-10-28 after T001 (research.md) found SCOPE-136 relying on the plain mode; owner decision. Runs before T002 removes the launch and the seed, so G.O.D. never points at a dead path. In mcp-server/src/prompts/wxgod/references/new-project.md rewrite N12 (and the R7 row and the lines near 20 and 43 that refer to it), and in mcp-server/src/prompts/wxgod.md the summary near line 63 and the push lines near 539: the offer is made once per run when .wxai/remote-session.lock names a project agent (no check of the repo env file); on yes G.O.D. saves its state file and runs the HANDOFF REMOTE writer (node wxkanban-agent/apps/remote-bridge/bin/handoff-remote.mjs --input <temp file>) with next step '/wxG-O-D --resume' and the usual summary fields; written -> stop driving from the editor and tell the developer to answer go in the room; stopped -> show the writer's one line and continue in the editor. The room control words and 'G.O.D. drives, KAIN relays' (SCOPE-136 FR-020) stay; drop every mention of npm run remote, WXKANBAN_REMOTE_SEED, the YAPPCHATT_* keys and GO REMOTE. Add a one-line note to specs/136-wxgod-development-manager/tasks.md T022. The hosted MCP build regenerates the prompt registry, so the change rides the next app push. Acceptance: a read-through of N12 and R7 against FR-018; a search of both prompt files for the removed names finds 0.
