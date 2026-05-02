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

## Cutting a new kit version (maintainer guide)

The kit is published as `kit.tar.gz` + `kit.zip` (with SHA-256 sidecars)
on every `v*` git tag. [`.github/workflows/release.yml`](.github/workflows/release.yml)
runs on `ubuntu-latest`, builds `mcp-server/dist/`, strips every
`node_modules/` from staging (consumer machines run `npm install` for
their own platform via `scripts/init.mjs`), and uploads the artifacts.

### Step-by-step

1. **Land the changes** on `main` and confirm tests pass locally:
   ```bash
   cd wxkanban-agent && npx vitest run --config vitest.config.ts
   cd ../mcp-server && npm test
   ```

2. **Pick the next version** following SemVer against the previous tag:
   - **patch** (`v0.1.8 → v0.1.9`) — bug fixes, no API change
   - **minor** (`v0.1.8 → v0.2.0`) — new commands, new env vars, new MCP tools
   - **major** (`v0.1.8 → v1.0.0`) — breaking changes (renamed commands, removed env vars, schema changes that consumers must migrate)

3. **Update this README's release log** at the bottom of the file with a
   one-line summary of what's in the new version. Keep entries terse.

4. **Tag and push**:
   ```bash
   git tag v0.1.9
   git push origin main --tags
   ```
   The push of the tag triggers `release.yml`. Watch the run at
   [Actions](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/actions).

5. **Verify the release** at
   [Releases](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/releases):
   - Both `kit.tar.gz` and `kit.zip` present
   - Both `.sha256` sidecars present
   - Release notes auto-generated by the workflow

6. **Smoke-test on a clean directory** (catch packaging regressions before
   consumers do):
   ```bash
   mkdir /tmp/kit-smoke && cd /tmp/kit-smoke
   curl -L -o kit.tar.gz https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/releases/download/v0.1.9/kit.tar.gz
   tar -xzf kit.tar.gz
   node scripts/init.mjs
   ```
   Expect: deps install (no Linux-only binary errors on Windows/Mac),
   both services come up, health check passes.

### Promoting to wxKanban consumers

The wxKanban app's `KitProxyService` resolves the **GitHub `latest`
release tag** by default (cached for 60s). Once the new tag is published
and the artifacts are uploaded, the next `/api/projects/:id/kit/download`
call serves the new version automatically — no wxKanban-side change is
required for ordinary patch / minor releases.

If a release needs a wxKanban-side change too (e.g., a new env var that
`KitProxyService.injectPerProjectFiles` must populate), bump
`wxKanban`'s `APP_VERSION` and ship that as a separate PR — the kit and
wxKanban release independently.

### Pinning consumers to a specific version

Append `?version=v0.1.9` to the kit-download URL or set
`KIT_DOWNLOAD_VERSION` on the wxKanban server to override the default
`latest` resolution. Useful for staging a new kit version against a
single project before letting the rest of the fleet roll forward.

### Rolling back

GitHub releases can be deleted but cannot be republished under the same
tag (workflow will refuse). To roll back:
1. **Delete the bad release** in the GitHub UI (this also removes the
   `latest` pointer from it).
2. The next-most-recent release becomes `latest` automatically.
3. wxKanban consumers will pick up the previous version on their next
   download (subject to the 60-second `latest` resolve cache).

For a clean re-release with a fix, cut the *next* version (`v0.1.10`,
not `v0.1.9` again) — append-only history keeps consumer kits
auditable.

---

## Release log

- `v0.1.0` — initial consolidated release (orchestrator + MCP + rules)
- `v0.1.1` — adds `scripts/orchestrator-health-check.mjs`
- `v0.1.2` — adds `scripts/init.mjs` one-shot installer, README refresh
- `v0.1.8` — see commit log; superseded by v0.1.9 fixes
- `v0.1.9` — full sweep of all 13 issues from `BUG_REPORT-wxkanban-kit-v0.1.8.md` in the wxKanban repo. **Recommended upgrade for every consumer.**
  - **Windows blockers (BUG-1/2/3):** kit no longer ships Linux-only `node_modules` (consumer install is platform-correct via `init.mjs`); `bin/wxkanban-agent.cmd` Node major-version check rewritten with `for /f` against `node --version` (no more cmd caret-escape parse error); `wxkanban-agent` `postinstall`/`postupdate` hooks removed (they crashed on missing `fs-extra` + a kit-author-only path).
  - **Data integrity (BUG-5):** `buildscope` no longer invents schema/API/component/entity content from the feature name. The four affected sections render `[NEEDS CLARIFICATION]` placeholders that echo your `scopeBoundary` and `outOfScope` so reviewers see the constraint to respect.
  - **Workspace root (BUG-4):** `resolveWorkspaceRoot()` now anchors on `.wxkanban-project.json` first, so first-ever `buildscope` on a clean install no longer mis-files into `mcp-server/specs/`.
  - **CLI quality (BUG-6/7/8/9):** worker branches on `mcpResult.status` so `draft_interview` surfaces the server's questions + blocking issues instead of falsely reporting "Spec X created"; CLI flag parser accepts `--key=value` (not just space-separated); `--help` documents the kebab/camel + delimiter conventions; non-OK MCP responses now include the response body so structured `McpError` messages reach the user.
  - **Server (BUG-10/11):** `mcp-server/start-http.mjs` resolves paths relative to `import.meta.url` (works from any cwd, not just `mcp-server/`); `getDatabaseUrl()` checks `WXKANBAN_MCP_DATABASE_URL` (env) before embedded credentials so consumer projects ignore kit-author DB state and the spurious "Failed to decrypt embedded database URL" log on startup is gone.
  - **Validation polish (BUG-12/13):** `isMeasurableMetric` placeholder check no longer rejects natural prose containing the word "placeholder" (now matches only standalone markers); `generateShortName` stop-word list extended with `uat`, `prod`, `dev`, `qa`, `stg`, `staging`, `production`, `development` so environment names don't leak into spec short names.
- `v0.1.11` — fix `upgrade-kit.mjs` Windows extraction. Surfaced during the R15 dogfood: when invoked from Git Bash / MSYS2 / Cygwin on Windows, PATH-resolved `tar` is GNU tar which can't handle `.zip` and misreads `E:/...` as a remote host. Now prefers `C:\Windows\System32\tar.exe` (bsdtar) on win32 which handles both `.tar.gz` and `.zip` regardless of the calling shell. Recommended for any v0.1.10 install that hasn't dogfooded an upgrade yet.
- `v0.1.10` — **first release with kit upgrade machinery** (spec 019 R15).
  - **`scripts/upgrade-kit.mjs`** — preserve-mode upgrade. `node scripts/upgrade-kit.mjs` (or `node scripts/upgrade-kit.mjs v0.1.X` to pin) downloads from wxKanban's new `/api/projects/:id/kit/upgrade` endpoint, verifies SHA-256 against the response header, extracts in place, updates only the version fields in `.wxkanban-project.json` (preserves `projectId`, `createdAt`, all other fields), and re-runs `init.mjs`. Per-project files (`.wxkanban-project.json`, `ai-settings.json`, `.env`) and customizable templates (`CLAUDE.md`, `AI.md`, `ProjectOverview.md`, `README.md`) are stripped from the archive server-side, so extraction is safe.
  - **`scripts/check-kit-version.mjs`** — runs as a third `folderOpen` task in `.vscode/tasks.json`. Compares your installed version against the latest available release; prints an up-to-date single-liner or a clearly-bordered upgrade-available notice with the exact upgrade command. Always exits 0 — never blocks workspace open.
  - **Bootstrap from pre-R15 kits**: consumers on v0.1.8 or v0.1.9 need a one-time manual upgrade to v0.1.10 (since `upgrade-kit.mjs` isn't in those older kits). After v0.1.10 is installed, all future upgrades use `node scripts/upgrade-kit.mjs` end-to-end.
  - **URL config**: scripts use `WXKANBAN_API_URL` env > `.wxkanban-project.json` `wxkanbanApiUrl` field > `https://wxkanban.wxperts.com` default.
