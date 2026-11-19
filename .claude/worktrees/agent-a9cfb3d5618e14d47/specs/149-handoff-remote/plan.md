# Plan: Handoff Remote

**Spec Number**: 149 (implements SCOPE-149 piece A)
**Date**: 2026-10-28

## Implementation Plan

Three areas, built so the writer and its safety rules exist before the agent ever reads a file. Ships
before SPEC-150 (piece B), which edits the same `main.ts` and `bridge.ts`.

### Phase 1: Verify (T001)

- T001 first: confirm, with existing surfaces only, how each blocked cause is detected (Allow remote from
  `GET /api/project-agent/settings`, a running agent from `.wxai/remote-session.lock`, no company account from
  the agent's refusal code), and where the bridge's busy signals and self-echo live. If "no company account"
  cannot be told apart from "agent not running" without a new route, stop and raise it (FR-016).

### Phase 2: The writer and the command (T002 – T004)

- T002 the kit writer script: preflight, fixed template, redaction that masks, 2,000-character cap, one file.
- T003 `.wxai/handoff/` git-ignored here, for new projects and existing projects, and excluded from the kit mirror.
- T004 `/remote` and `_wxAI/rules/remote.md` rewritten for `HANDOFF REMOTE`; the CLAUDE.md AI Behavior bullet
  changed, so `GO REMOTE` triggers nothing.
- Tests: Vitest for the writer (blocked causes, template, truncation, 5 secret patterns) and the gitignore helper.

### Phase 3: The agent (T005 – T008)

- T005 the folder watcher, safe reads and 4-hour expiry with a removal note.
- T006 the `[HANDOFF]` post under the agent's own tag, the busy queue (turn, gates, TRIAGE run) and replace.
- T007 context-only handling with a PreToolUse hook for the handoff turn, and the reading-plus-question follow-up,
  also for a `[HANDOFF]` typed by a person.
- T008 Pino audit lines without content (adds the `pino` dependency to the kit).
- Tests with the SDK, filesystem, timers and room stubbed.

### Phase 4: Acceptance (T009)

- US1 – US4 live on this repo with the Cockpit-started project agent, the FR-016 check, and the regression:
  start, bind room, TRIAGE, MCP token renewal.

## Release order

Piece A ships in one kit release (wxkanban-agent rebuilt so `dist/` matches source, mirrors in sync). No app or
MCP change, so no deploy is needed for this spec. SPEC-150 follows in its own release or the same one; never
push or release without the owner's go.

## Known Issues

- The Cockpit's project agent runs the bridge from `dist/remote-bridge.cjs` when present: rebuild
  `wxkanban-agent` after bridge edits or the old code runs.
- `canUseTool` is never consulted in bypass mode; the handoff turn's guard must be a PreToolUse hook (T007).
- `wxkanban-agent` has no `pino` dependency today; FR-017 adds one, which touches all three kit manifests (T008).
- `fs.watch` is unreliable on Windows; the watcher keeps a periodic scan so the 30-second target holds (T005).
- Edits to `implement`-fenced files through `implement` MODIFY have corrupted UTF-8 before; check the bridge files
  after each MODIFY.
