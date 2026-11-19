# Spec 150: Retire Plain Remote Mode

Implements SCOPE-149

**Implements**: SCOPE-149 piece B (`specs/Project-Scope/149-handoff-remote.md`, FR-009 – FR-015, and FR-018
added 2026-10-28).
Fences for this spec are `[SCOPE 150 / Tnnn]`, written by `implement` only.
**Depends on**: SPEC-149 (SCOPE-149 piece A, the handoff) in order only: both edit the remote bridge's
`main.ts` and `bridge.ts`, so this spec starts after SPEC-149 lands. Also SPEC-134 (project agent),
SPEC-145 (Allow remote, Cockpit auto-start), SPEC-148 (triage and MCP token renewal, commit 2227bbfc).
**Supersedes (in part)**: SCOPE-102 (the per-repo `.env` room binding and the `GO REMOTE` launch).
**Source**: `docs/brainstorms/2026-10-27-go-remote-handoff.md` (D-0082 – D-0095; row 9 removes the plain mode
entirely).
**Created**: 2026-10-28

## Overview

`GO REMOTE` launched a one-off Remote Session Bridge bound to fixed `.env` room keys, which never called the
server and so bypassed the company Allow-remote switch. SPEC-149 replaced it with `HANDOFF REMOTE`. This spec
removes what is left: the `GO REMOTE` wording everywhere in the kit and its docs (no redirect), the plain
`.env`-driven launch in the bridge entry point, the environment input for the room and its deprecated aliases,
the seed and resume hooks, the plain-mode tests and the smoke script. `npm run remote` becomes the project-agent
path, so the Project Agent is the only remote path. The kit never edits `.env`; on the first run after the
upgrade it prints one notice when the old room keys are still there.

## Business Problem

Two ways to go remote exist, and the older one is unsafe: the plain bridge reads `YAPPCHATT_ROOM`,
`YAPPCHATT_TOKEN` and `YAPPCHATT_EMAIL` from a per-repo `.env`, connects without asking the server, and so
ignores the company's Allow-remote switch and room ownership. It also keeps a seed hook that can start a second
autonomous Claude on a shared working tree, a set of deprecated `WXKANBAN_*` aliases, tests and a smoke script
that all exercise a path nobody should use. Leaving it in place means customers keep finding `GO REMOTE` in the
docs and launching the path the company switch cannot govern.

## Actors

- Primary: Operator and customers who start remote sessions; after this spec only through the Project Agent
- Secondary: The Project Agent (Remote Session Bridge in project-agent mode), which must keep working unchanged; the Cockpit, which starts it; scopes that depend on SCOPE-102 (109, 132, 136, 142, 143)

## Success Metrics

1. After the plain mode is removed, 0 source files read `YAPPCHATT_ROOM`, `YAPPCHATT_TOKEN` or `YAPPCHATT_EMAIL` from the environment as input, and the project agent still starts, binds its room, takes TRIAGE and renews its token in 100% of test runs.
2. `.env` is byte-identical before and after the upgrade (checked by hash), and the one-time notice appears exactly 1 time across 3 consecutive runs.
3. A search for `GO REMOTE` across the kit finds it in 0 places other than the changelog entry that records it as retired.
4. The kit mirrors of every changed rule and command match the source by md5 in 100% of files.
5. 0 tests start the bridge from `.env` room keys, and the kit test suite passes 100%.

## Scope Boundary

- `wxkanban-agent/apps/remote-bridge/src/main.ts`: the plain `.env`-driven launch (from the non-project-agent
  path on, including `loadRepoEnv` for room input) removed; `npm run remote` runs the project-agent path.
- `wxkanban-agent/core/yappchatt/client.ts` (and `core/yappchatt/index.ts`): the env-input resolver for the room
  and identity, and the `WXKANBAN_YAPPCHATT_*`, `WXKANBAN_YAPPCHAT_*`, `WXKANBAN_REMOTE_ROOM_ID` and
  `WXKANBAN_CHAT_*` aliases, removed; the project agent hands its values over in memory.
- `WXKANBAN_REMOTE_SEED` / `WXKANBAN_REMOTE_RESUME` and the code behind them (`main.ts`, `bridge.ts`,
  `session.ts`, the bridge README).
- Plain-mode tests and `wxkanban-agent/scripts/yappchatt-smoke.ts` removed or rewritten for the project-agent path.
- The one-time `.env` notice (key names only; the kit never edits `.env`).
- The `GO REMOTE` sweep and release docs: CLAUDE.md, `_wxAI/rules/remote.md`, the guides, the manual and
  docs-workspace pages, the MCP prompt references, the bridge README, the changelog, the kit mirrors (md5), and a
  note on SPEC-145 line 53.
- A check of SCOPE-109, 132, 136, 142 and 143 for reliance on the plain mode, before any removal.

## Out of Scope

- The handoff itself (writer, folder, agent pickup, queueing, expiry, audit) — SPEC-149.
- Automatic handoff at session end; a cross-repo view across rooms; the Cockpit "last handoff" display; any
  behavior for KAIN or the owner's multi-project assistant.
- New database tables, API routes or screens; editing a user's `.env`.
- Changing SCOPE-134 or SCOPE-145 behavior: the project agent's start, room binding, TRIAGE and token renewal
  stay exactly as they are.

## Open Questions

None blocking. Decided in the brainstorm (row 9: remove the plain bridge mode and the `YAPPCHATT_*` room keys
entirely; row 11: no `.env` fallback) and the buildscope review (`GO REMOTE` retired with no redirect). The full
reference list for the `YAPPCHATT_*` keys is taken from source files at T002 time, as the brainstorm deferred it
to the spec stage; the dependent-scope check (T001) runs before anything is removed.

## User Scenarios & Testing

### US1 — Starting remote after the upgrade

Given a repo that used `GO REMOTE`, when the operator runs `npm run remote` in `wxkanban-agent/`, then the project
agent starts on the project-agent path: it binds the company-owned room through `POST /api/project-agent/room`,
honors Allow remote, takes `TRIAGE` and renews its MCP token, exactly as when the Cockpit starts it.

### US2 — Old room keys are still in `.env`

Given `.env` still holds `YAPPCHATT_ROOM`, `YAPPCHATT_TOKEN` and `YAPPCHATT_EMAIL`, when the kit runs for the
first time after the upgrade, then it prints one notice that these keys are no longer read and can be deleted,
leaves `.env` byte-identical, and never prints the notice again.

### US3 — Someone says GO REMOTE

Given the upgraded kit, when the operator says `GO REMOTE`, then nothing is triggered and no rule, command or
guide tells them otherwise; only the changelog records that it was retired.

## Functional Requirements

### FR-009 — Retire GO REMOTE

The `GO REMOTE` trigger is removed from remote.md, CLAUDE.md, the /remote skill, the guides and the kit mirrors,
with no redirect.

**Acceptance Criteria**:
- [ ] A search for the phrase in the kit finds it only in the changelog as retired

### FR-010 — Remove the plain launch path

The plain `.env`-driven launch is deleted from the remote bridge entry point, and `npm run remote` becomes the
project-agent path.

**Acceptance Criteria**:
- [ ] `npm run remote` starts the project agent
- [ ] The project agent starts, binds its room, takes TRIAGE and renews its token as before

### FR-011 — Remove environment input for the room

The code that reads `YAPPCHATT_ROOM`, `YAPPCHATT_TOKEN` and `YAPPCHATT_EMAIL` from the environment as input, and
the deprecated `WXKANBAN_YAPPCHATT_*` and `WXKANBAN_REMOTE_ROOM_ID` aliases, are deleted. The project agent still
sets the values in memory for itself.

**Acceptance Criteria**:
- [ ] No source file reads those variables as input
- [ ] The project agent still connects

### FR-012 — Remove the seed hooks

`WXKANBAN_REMOTE_SEED` and `WXKANBAN_REMOTE_RESUME` and the code behind them are deleted.

**Acceptance Criteria**:
- [ ] No source file reads either variable
- [ ] The project agent still starts a session without them

### FR-013 — Tests and smoke script

The plain-mode tests and the yappchatt-smoke script are removed or rewritten for the project-agent path.

**Acceptance Criteria**:
- [ ] No test starts the bridge from `.env` room keys
- [ ] The test suite passes

### FR-014 — .env is left alone

The kit never edits `.env`. On the first run after the upgrade, if the old room keys are present, it prints one
notice that they are no longer read and can be deleted.

**Acceptance Criteria**:
- [ ] `.env` is byte-identical after the upgrade
- [ ] The notice appears exactly once

### FR-015 — Docs and release

CLAUDE.md, remote.md, the guides, the changelog, the kit mirrors and a note on SPEC-145 are updated in the same
release.

**Acceptance Criteria**:
- [ ] The kit mirrors match, checked by md5

### FR-018 — G.O.D. goes unattended through HANDOFF REMOTE

Added 2026-10-28 after T001 found SCOPE-136 relying on the plain mode (`research.md`); owner decision. G.O.D.'s
unattended offer (SCOPE-136 FR-019: `mcp-server/src/prompts/wxgod/references/new-project.md` N12, R7 under
`--create`, and the summary in `mcp-server/src/prompts/wxgod.md`) stops looking for room keys in `.env` and stops
launching a seeded bridge. It offers once per run when `.wxai/remote-session.lock` names a project agent. On yes it
saves its state file and writes a handoff through the HANDOFF REMOTE writer with next step `/wxG-O-D --resume`. If
the writer stops, G.O.D. shows its one line and carries on in the editor; if it writes, G.O.D. stops driving from
the editor. The agent posts the handoff and asks (SPEC-149 FR-007); on the operator's go it runs
`/wxG-O-D --resume` as a normal turn, KAIN relaying as before (SCOPE-136 FR-020).

**Acceptance Criteria**:
- [ ] The offer never reads `.env`; with no project agent lock, G.O.D. says nothing about remote and continues in the editor
- [ ] On yes, the writer runs once: written, the editor session stops driving; stopped, its line is shown and the run continues in the editor
- [ ] The handoff turn runs nothing; `/wxG-O-D --resume` runs only after the operator's go in the room
- [ ] N12, R7 and `wxgod.md` name no `.env` room key, `npm run remote` launch, seed variable or `GO REMOTE`

### Acceptance — the Project Agent keeps working

Every task that touches `main.ts`, `bridge.ts`, `session.ts` or `client.ts` re-proves:

- [ ] The project agent starts (Cockpit launcher `apps/remote-bridge/bin/project-agent.mjs` and `npm run remote`)
- [ ] It binds its room through `POST /api/project-agent/room` and honors Allow remote (403 `remote_not_allowed`)
- [ ] It takes `TRIAGE` on the sink project (SPEC-148)
- [ ] It renews its MCP token on 401 (SPEC-148 FR-016, commit 2227bbfc)
- [ ] SPEC-149's handoff pickup still works

## Data Requirements

None. No tables, columns or migrations. The "notice already shown" marker is a local, git-ignored kit state value
under `.wxai/`, not a database record.

## API Routes

None added or changed. The project agent keeps using `POST /api/project-agent/room` and
`GET /api/project-agent/settings` unchanged.

## Frontend Components

None.

## Integration Context

SCOPE-102 Remote Session Bridge (superseded in part: its `.env` room binding and `GO REMOTE` launch go; its
control vocabulary, self-echo handling and push gate stay); SCOPE-134 / SPEC-134 project agent; SCOPE-145 /
SPEC-145 (its Out of Scope line 53 names plain `GO REMOTE`, which no longer exists); SPEC-148 triage and token
holder; SCOPE-144 company YappChatt account (customers without one lose remote until they set one up). Five scopes
depend on SCOPE-102: SCOPE-109, SCOPE-132, SCOPE-136, SCOPE-142 and SCOPE-143.

## Compliance

SOC 2 is the only framework enabled on this project.

- **CC6.1, authentication and authorization design.** After this spec every remote session is authorized by the
  server: the company Allow-remote switch and company-room membership, through the project agent's kit token.
  The path that bypassed both is removed.
- **CC6.1, secrets management.** Room credentials are no longer read from a per-repo `.env`; the agent fetches
  and holds them in memory. The kit reads `.env` only for key names, to print the notice, and never writes it.
- **CC6.3, least privilege.** The seed hook that could start a second autonomous Claude on a shared tree is removed.
- **CC8.1, change management.** One kit release carries the code removal, the docs and the mirrors, checked by md5.

## Constraints

- MUST deliver only the behavior described within the scope boundary above.
- Starts after SPEC-149 lands (same files). The dependent-scope check (T001) runs before T002.
- The kit never edits `.env`; tests and checks read key NAMES only, never values.
- House rules: 100% TypeScript, no `any`, no `@ts-ignore`, Pino, no `console.log` in new code. Fences
  `[SCOPE 150 / Tnnn]` are written by `implement` only; edits to SCOPE-102 / SCOPE-134 / SPEC-148 fenced blocks
  get MODIFIED-BY lines, and a block that is deleted whole is removed with its fence.
- After bridge edits, rebuild `wxkanban-agent` so `dist/remote-bridge.cjs` matches the source.
- One kit release with mirrors in sync; check `git status` and the last commits for concurrent sessions first.
  No push or release without the owner's go.

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-10-28
- **Phase**: design
