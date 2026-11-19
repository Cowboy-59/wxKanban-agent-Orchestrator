# Plan: Retire Plain Remote Mode

**Spec Number**: 150 (implements SCOPE-149 piece B)
**Date**: 2026-10-28

## Implementation Plan

Starts after SPEC-149 lands: both specs edit `main.ts` and `bridge.ts`. Check first, then remove code
from the entry point inward, then the docs, then one release with the mirrors in sync.

### Phase 1: Check the dependents (T001)

- Read SCOPE-109, 132, 136, 142 and 143 and their specs and code for reliance on the plain mode, the
  `YAPPCHATT_*` env input, the aliases, the seed/resume hooks or the `GO REMOTE` phrase. Any real reliance
  stops the work and goes to the owner; doc-only mentions are folded into T007.

### Phase 2: Remove the plain mode (T002 – T005)

- T002 the plain launch in `main.ts`; `npm run remote` runs the project-agent path.
- T003 the env-input resolver and the deprecated aliases in `core/yappchatt/client.ts`; the agent hands its
  connection over in memory.
- T004 the `WXKANBAN_REMOTE_SEED` / `WXKANBAN_REMOTE_RESUME` hooks.
- T005 the plain-mode tests and the `yappchatt-smoke` script.
- After each: the project agent starts, binds its room, takes TRIAGE and renews its MCP token.

### Phase 3: The notice and the docs (T006, T007)

- T006 the one-time `.env` notice (key names only; `.env` never written).
- T007 the `GO REMOTE` sweep across rules, commands, guides, manual, docs-workspace, MCP prompt references,
  README and code comments; the changelog entries; the SPEC-145 line 53 note.

### Phase 4: Mirrors and acceptance (T008, T009)

- T008 rebuild `dist/`, sync the kit mirror, md5 every changed mirrored file.
- T009 US1 – US3 and the project agent regression, with evidence in `tests.md`.

## Release order

One kit release carries the code removal, the docs and the mirrors. The MCP prompt reference change
(`mcp-server/src/prompts/wxgod/references/new-project.md`) and the manual pages ride the next app push, which
deploys the app and MCP together. Never push or release without the owner's go.

## Known Issues

- Customers with no company YappChatt account lose remote until they set one up (SCOPE-149 Notes).
- The Cockpit runs `dist/remote-bridge.cjs` first: rebuild `wxkanban-agent` after bridge edits.
- `implement` MODIFY has corrupted UTF-8 in fenced files before; check `main.ts`, `bridge.ts`, `session.ts` and
  `client.ts` after each MODIFY.
- The kit mirror copies the filesystem, including untracked and gitignored files; confirm no `.env` or
  `.wxai/handoff/` file reaches it (T008).
- Another session may have uncommitted edits in the same tree; check `git status` before syncing mirrors.
