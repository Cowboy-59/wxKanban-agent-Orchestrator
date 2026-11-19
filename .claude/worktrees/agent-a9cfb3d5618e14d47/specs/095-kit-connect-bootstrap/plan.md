# Plan: Kit Connect Bootstrap (Spec 095)

Spec ID: 740f5cd0-9973-48db-978f-9e1ca808aa4e · Phase: implementation

## Approach (two repos)

**This repo** (`e:\AI_Development\wxperts\wxKanban`) — deploys on push / mirrors to orchestrator on kit release:
- `src/server/services/KitProxyService.ts` — WS1: inject `.mcp.json` in `writePerProjectFiles` (T001) + add it to `UPGRADE_STRIP_FILES` (T002). Server deploys on push to main.
- `wxkanban-agent/core/orchestrator/command-handlers/kit-configure.ts` — WS2: relax `TOKEN_RE`, fix message (T004). Mirrored to orchestrator on kit release.
- `_wxAI/commands/wxAI-project-init.md`, `wxkanban-agent/docs/hosted-mcp*.md` — WS4 docs (T005). Mirrored.

**Sibling orchestrator repo** (`..\wxKanban-agent-Orchestrator`) — ships in the next kit release:
- `.vscode/tasks.json` — WS3: `folderOpen` init.mjs task (T003).
- `scripts/init.mjs` — WS2: fix error/guidance text (T004).
- `gettingStartedInstructions.md`, `wxKanban_Kit_Setup.md` — WS4 docs (T005).

## Reference (mirror, don't duplicate)
`..\wxKanban-agent-Orchestrator\scripts\init.mjs` `writeClaudeMcpRegistration` (lines 339-372) is the canonical `.mcp.json` entry shape T001 replicates server-side. Real token format: `crypto.randomBytes(32).toString('base64url')` (`KitEncryptionService.generateApiToken`).

## Verify
Unit (server suite + kit-configure), then e2e: real `GET /api/projects/:id/kit/download` → extract → assert `.mcp.json` valid/gitignored + token authenticates via `POST <base>/call`. Ship: push (deploys server WS1/WS2/WS4-mirrored) + orchestrator kit release (WS3 + orchestrator docs). User-gated.

## Fencing
This-repo top-level units fenced `[SCOPE 095 / Tnnn]` via `implement`. Orchestrator-repo files (`.mjs`/`.json`/docs) are consumer-owned and not fenced here.
