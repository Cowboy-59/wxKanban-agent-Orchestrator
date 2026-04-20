# wxKanban Agent Orchestrator Kit

The installable AI-ready development kit for projects managed by wxKanban.
Ships the MCP Project Hub, the orchestrator runtime + CLI, the shared
rules and command templates, and the VSCode integration that ties it all
together.

**Source of truth**: this repository. Releases are published as
`kit.tar.gz` and `kit.zip` on the [Releases](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/releases) page. wxKanban's
`/api/projects/:id/kit/download` endpoint fetches the latest release,
injects per-project credentials server-side, and streams the archive to
the user.

---

## What's in the kit

| Path | Purpose |
| --- | --- |
| `wxkanban-agent/` | Orchestrator runtime — CLI + HTTP gateway + workflow engine |
| `mcp-server/` | MCP Project Hub (HTTP/SSE :3002) |
| `_wxAI/rules/` | Constitutional and project rules auto-loaded by AI assistants |
| `_wxAI/commands/` | Markdown command templates (buildscope, createspecs, implement, etc.) |
| `bin/wxkanban-agent`, `bin/wxkanban-agent.cmd` | Node-locating wrappers for POSIX and Windows |
| `.vscode/tasks.json` | Auto-starts both services on folder open |
| `CLAUDE.md` | AI primer template — edit per project |
| `AI.md`, `ProjectOverview.md` | Additional templates |
| `scripts/init.mjs` | One-shot install — starts both services + health check |
| `scripts/setup-mcp.mjs` | Starts just the MCP server (detached, PID-tracked) |
| `scripts/orchestrator-health-check.mjs` | Probes MCP + gateway health |
| `scripts/mcp-health-check.mjs` | Probes MCP only |

Per-project files (`.wxkanban-project.json`, `ai-settings.json`, `.env`)
are NOT in the release tarball — wxKanban injects them server-side at
download time so each user gets their own encrypted credentials.

---

## Install

Download the latest `kit.tar.gz` (Unix/Mac) or `kit.zip` (Windows) from
the Releases page — or let wxKanban serve it to you via the project kit
download button.

```bash
# Unix / Mac
tar -xzf kit.tar.gz
cd <extracted-dir>
node scripts/init.mjs
```

```cmd
:: Windows
tar -xf kit.zip    :: or any zip extractor
cd <extracted-dir>
node scripts/init.mjs
```

`init.mjs` will:

1. Start the MCP server (via `setup-mcp.mjs`, detached, log at
   `logs/mcp-server.log`, PID at `.mcp-server.pid`)
2. Start the Orchestrator HTTP Gateway on port 3003 (detached, log at
   `logs/orchestrator-gateway.log`, PID at `.orchestrator-gateway.pid`)
3. Wait briefly, then run `orchestrator-health-check.mjs` and report
   the result. Exits 0 if both services are healthy, 1 otherwise.

Both service starts are idempotent — running `init.mjs` again while
services are already up will leave them alone and re-run the health
check.

---

## VSCode users

Opening the kit folder in VSCode triggers `.vscode/tasks.json`, which
auto-starts both services in background tasks on `folderOpen`. No manual
`init.mjs` needed.

---

## Health check (any time)

```bash
node scripts/orchestrator-health-check.mjs
```

Reports one line per service and exits 0 if both are healthy:

```
wxKanban kit health check
─────────────────────────
  ✓ MCP server          http://localhost:3002  mcp-project-hub · http
  ✓ Orchestrator gateway http://localhost:3003  command-gateway · port 3003

✓ All services healthy.
```

Override endpoints via env:

```bash
MCP_HTTP_URL=http://my-host:3002 \
GATEWAY_HTTP_URL=http://my-host:3003 \
  node scripts/orchestrator-health-check.mjs
```

---

## CLI

After install, the orchestrator CLI is available via:

```bash
node wxkanban-agent/apps/command-gateway/bin/wxai.mjs --help
# or — if bin/ is on PATH —
wxkanban-agent --help
```

Commands surface based on the project's lifecycle stage in
`.wxai/project.json`. See `CLAUDE.md` for the per-stage command map.

---

## Stopping services

```bash
# Unix
kill $(cat .mcp-server.pid)
kill $(cat .orchestrator-gateway.pid)

# Windows
taskkill /F /PID %MCP_PID%
taskkill /F /PID %GW_PID%
```

VSCode task-started processes stop when you close the window.

---

## Ports

| Service | Default | Env override |
| --- | --- | --- |
| MCP server | 3002 | `MCP_PORT` |
| Orchestrator HTTP Gateway | 3003 | `GATEWAY_HTTP_PORT` |

---

## Releases

- `v0.1.0` — initial consolidated release (orchestrator + MCP + rules)
- `v0.1.1` — adds `scripts/orchestrator-health-check.mjs`
- `v0.1.2` — adds `scripts/init.mjs` one-shot installer, README refresh
