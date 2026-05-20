# wxKanban Agent Orchestrator Kit

The installable AI-ready development kit for projects managed by wxKanban.
Ships the orchestrator runtime + CLI, the shared rules and command
templates, and the VSCode integration that ties it all together. The
**MCP Project Hub itself is hosted by wxKanban** at `https://mcp.wxperts.com`
— the kit talks to it over HTTPS. No consumer-side database connection
and no consumer-side MCP server are required.

**Source of truth**: this repository. Releases are published as
`kit.tar.gz` and `kit.zip` on the [Releases](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/releases) page. wxKanban's
`/api/projects/:id/kit/download` endpoint fetches the latest release,
injects per-project credentials server-side, and streams the archive to
the user.

---

## ⚠️ Upgrading from v1.0.5 or earlier? Read this first.

If you downloaded v1.0.5 (or any earlier version) and `node scripts/init.mjs`
crashed with `[startup.db.check.fail]` / `Connection terminated due to
connection timeout` — that's [BUG-20](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/issues),
the architectural defect where the kit tried to open a Postgres
connection from your machine. v1.1.0 removes that path entirely.

**Fastest unblock without re-downloading anything:**

1. Ask a wxKanban admin to mint an API token for your project (see [Install — Step 2](#install)).
2. In the extracted v1.0.5 directory, run:
   ```bash
   node wxkanban-agent/bin/wxkanban-agent kit-configure \
     --token wxk_live_<64hex> \
     --project-id <uuid> \
     --mcp-url https://mcp.wxperts.com
   ```
3. Skip `node scripts/init.mjs`. Run `wxkanban-agent` commands directly.

The v1.1.0 kit ships without `mcp-server/` at all, so this trap is gone.
Existing consumers should upgrade via `node scripts/upgrade-kit.mjs` —
the v1.1.0 upgrade flow detects and removes the legacy `mcp-server/`
directory from your install.

---

## What's in the kit

| Path | Purpose |
| --- | --- |
| `wxkanban-agent/` | Orchestrator runtime — CLI + HTTP gateway + workflow engine + HTTPS client to hosted MCP |
| `_wxAI/rules/` | Constitutional and project rules auto-loaded by AI assistants |
| `_wxAI/commands/` | Markdown command templates (buildscope, createspecs, implement, etc.) |
| `bin/wxkanban-agent`, `bin/wxkanban-agent.cmd` | Node-locating wrappers for POSIX and Windows |
| `.vscode/tasks.json` | Auto-starts the orchestrator gateway on folder open |
| `CLAUDE.md` | AI primer template — edit per project |
| `AI.md`, `ProjectOverview.md` | Additional templates |
| `scripts/init.mjs` | One-shot install — validates hosted MCP reachability + starts gateway |
| `scripts/upgrade-kit.mjs` | Preserve-mode kit version upgrade |
| `scripts/check-kit-version.mjs` | Folder-open version-check task |

Per-project files (`.wxai/project.json`, `.env`) are injected
server-side by wxKanban at download time so each consumer gets their own
`WXKANBAN_API_TOKEN`. No database credentials of any kind ship in the
archive.

### What's NOT in v1.1.0 (deliberately)

- **`mcp-server/`** — the MCP server runs on `mcp.wxperts.com`. Consumer machines no longer host it. Removed per spec 019 Decision #1 + spec 028.
- **`scripts/setup-mcp.mjs` / `scripts/mcp-health-check.mjs`** — there is no local MCP to set up or probe.
- **`pg`, `drizzle-orm` runtime dependencies** — the kit makes HTTPS calls; it doesn't talk SQL.
- **`DATABASE_URL_ENCRYPTED`** — the encrypted-DB-URL distribution mechanism is retired per spec 019 Decision #3. The kit carries no DB credentials in any form.

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

1. Confirm `https://mcp.wxperts.com` (or your configured `MCP_BASE_URL`) is reachable via `GET /health`.
2. Verify the configured `WXKANBAN_API_TOKEN` authenticates against the hosted MCP.
3. Start the Orchestrator HTTP Gateway on port 3003 (detached, log at `logs/orchestrator-gateway.log`, PID at `.orchestrator-gateway.pid`).
4. Run `orchestrator-health-check.mjs` and report the result. Exits 0 if the hosted MCP is reachable, the token is valid, and the gateway is up; exits 1 otherwise.

If `init.mjs` reports `WXKANBAN_API_TOKEN missing`, you haven't configured the kit yet. Run `kit-configure` first:

```bash
# Step 1: Ask a wxKanban admin to mint an API token for your project at
#         wxkanban.wxperts.com → Admin → Projects → <project> → API tokens.
#         The admin will give you a wxk_live_<64hex> or wxk_test_<64hex> string.

# Step 2: Configure the kit (writes .wxai/project.json atomically; token is never echoed in full).
node wxkanban-agent/bin/wxkanban-agent kit-configure \
  --token wxk_live_<64hex> \
  --project-id <uuid> \
  --mcp-url https://mcp.wxperts.com

# Step 3: Verify
node scripts/init.mjs
```

See [`wxkanban-agent/docs/hosted-mcp.md`](wxkanban-agent/docs/hosted-mcp.md) for the full configuration reference.

---

## VSCode users

Opening the kit folder in VSCode triggers `.vscode/tasks.json`, which
auto-starts the orchestrator gateway in a background task on
`folderOpen` and runs `check-kit-version.mjs` to notify you of any
available upgrade. No manual `init.mjs` needed once `kit-configure` has
been run.

---

## Health check (any time)

```bash
node scripts/orchestrator-health-check.mjs
```

Reports one line per service and exits 0 if both checks pass:

```
wxKanban kit health check
─────────────────────────
  ✓ Hosted MCP           https://mcp.wxperts.com        mcp-project-hub · http
  ✓ Orchestrator gateway http://localhost:3003          command-gateway · port 3003

✓ All services healthy.
```

Override endpoints via env:

```bash
MCP_BASE_URL=https://staging.mcp.wxperts.com \
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
kill $(cat .orchestrator-gateway.pid)

# Windows
taskkill /F /PID %GW_PID%
```

VSCode task-started processes stop when you close the window. There is
no local MCP server to stop — that runs on `mcp.wxperts.com`.

---

## Ports

| Service | Default | Env override |
| --- | --- | --- |
| Hosted MCP | `https://mcp.wxperts.com` (443) | `MCP_BASE_URL` |
| Orchestrator HTTP Gateway | 3003 (local) | `GATEWAY_HTTP_PORT` |

---

## Configuration files

| File | Purpose |
|------|---------|
| `.wxai/project.json` | Lifecycle stage + `kit` block (`mcpBaseUrl`, `apiToken`, `projectId`) |
| `ai-settings.json` | AI adapter config, custom commands |
| `.env` | Optional — env vars override the `kit` block |

Don't commit `.wxai/project.json` to source control — it contains your
API token. The kit's `.gitignore` template adds it automatically.

---

## Cutting a new kit version (maintainer guide)

The kit is published as `kit.tar.gz` + `kit.zip` (with SHA-256 sidecars)
on every `v*` git tag. [`.github/workflows/release.yml`](.github/workflows/release.yml)
runs on `ubuntu-latest`, builds artifacts, strips every
`node_modules/` from staging (consumer machines run `npm install` for
their own platform via `scripts/init.mjs`), and uploads the artifacts.

### Step-by-step

1. **Land the changes** on `main` and confirm tests pass locally:
   ```bash
   cd wxkanban-agent && npx vitest run --config vitest.config.ts
   ```
   (No more `cd mcp-server && npm test` — `mcp-server/` is not in this repo
   from v1.1.0 forward. Its tests live in the wxKanban repo where the
   hosted MCP source lives.)

2. **Pick the next version** following SemVer against the previous tag:
   - **patch** (`v1.1.0 → v1.1.1`) — bug fixes, no API change
   - **minor** (`v1.1.0 → v1.2.0`) — new commands, new env vars, new MCP-client tool wrappers
   - **major** (`v1.1.0 → v2.0.0`) — breaking changes (renamed commands, removed env vars, hosted MCP API breaking changes that consumers must migrate)

3. **Update this README's release log** at the bottom of the file with a
   one-line summary of what's in the new version. Keep entries terse.

4. **Tag and push**:
   ```bash
   git tag v1.1.1
   git push origin main --tags
   ```
   The push of the tag triggers `release.yml`. Watch the run at
   [Actions](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/actions).

5. **Verify the release** at
   [Releases](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/releases):
   - Both `kit.tar.gz` and `kit.zip` present
   - Both `.sha256` sidecars present
   - Release notes auto-generated by the workflow
   - **CI gate `check-no-pg-in-kit.sh` passed** — confirms `pg` and `drizzle-orm` are not in the archive (spec 028 T055)

6. **Smoke-test on a clean directory** (catch packaging regressions before
   consumers do):
   ```bash
   mkdir /tmp/kit-smoke && cd /tmp/kit-smoke
   curl -L -o kit.tar.gz https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/releases/download/v1.1.1/kit.tar.gz
   tar -xzf kit.tar.gz
   node wxkanban-agent/bin/wxkanban-agent kit-configure \
     --token wxk_test_<64hex> --project-id <test-uuid> \
     --mcp-url https://staging.mcp.wxperts.com
   node scripts/init.mjs
   ```
   Expect: deps install (no Linux-only binary errors on Windows/Mac),
   the gateway comes up, hosted-MCP health check passes, token-valid
   check passes. The smoke is critically the v1.0.5 BUG-20 inverse —
   it MUST pass on a machine without a route to wxKanban's Postgres.

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

Append `?version=v1.1.1` to the kit-download URL or set
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

For a clean re-release with a fix, cut the *next* version (`v1.1.2`,
not `v1.1.1` again) — append-only history keeps consumer kits
auditable.

---

## Release log

- `v1.1.0` — **architectural cutover: hosted MCP only** (spec 019 update 2026-05-20 + spec 028 Phase 10).
  - **`mcp-server/` removed from the kit entirely.** The MCP Project Hub now runs only on wxKanban-operated infrastructure at `https://mcp.wxperts.com` (TLS, App Runner, ACM cert). Consumer machines no longer need a route to wxKanban's Postgres — outbound HTTPS to port 443 is sufficient. Closes BUG-20.
  - **`pg` and `drizzle-orm` removed from the kit's runtime dependencies.** The kit speaks HTTPS, not SQL.
  - **`DATABASE_URL_ENCRYPTED` retired.** The kit carries no DB credentials in any form. Per-project auth is now a single `WXKANBAN_API_TOKEN` (format: `wxk_live_<64hex>` or `wxk_test_<64hex>`).
  - **`scripts/setup-mcp.mjs` and `scripts/mcp-health-check.mjs` removed.** No local MCP to set up.
  - **`scripts/init.mjs` reworked.** Now validates hosted-MCP reachability + token validity, then starts the orchestrator gateway only. Exits cleanly if the kit hasn't been configured yet (instead of crashing on missing `DATABASE_URL`).
  - **`scripts/upgrade-kit.mjs` v1.1.0 cutover step.** Detects pre-v1.1.0 installs and removes legacy `mcp-server/`, `setup-mcp.mjs`, `mcp-health-check.mjs`, and `.mcp-server.pid` after stopping any running local MCP process. Adds `mcpBaseUrl` field to `.wxkanban-project.json` if absent.
  - **CI gate `check-no-pg-in-kit.sh`** — kit archive is checked at build time to ensure no future regression re-bundles `pg`, `drizzle-orm`, or `mcp-server/src/db/connection.ts`.
  - **Bootstrap from pre-v1.1.0 kits**: consumers on v1.0.5 or earlier should run `node scripts/upgrade-kit.mjs` from inside their existing extracted kit. The upgrade script handles the legacy-MCP cleanup automatically. If `upgrade-kit.mjs` isn't present in your kit (pre-v0.1.10), download v1.1.0 directly and run `kit-configure` against your existing project.
- `v0.1.11` — fix `upgrade-kit.mjs` Windows extraction. Surfaced during the R15 dogfood: when invoked from Git Bash / MSYS2 / Cygwin on Windows, PATH-resolved `tar` is GNU tar which can't handle `.zip` and misreads `E:/...` as a remote host. Now prefers `C:\Windows\System32\tar.exe` (bsdtar) on win32 which handles both `.tar.gz` and `.zip` regardless of the calling shell. Recommended for any v0.1.10 install that hasn't dogfooded an upgrade yet.
- `v0.1.10` — **first release with kit upgrade machinery** (spec 019 R15).
  - **`scripts/upgrade-kit.mjs`** — preserve-mode upgrade. `node scripts/upgrade-kit.mjs` (or `node scripts/upgrade-kit.mjs v0.1.X` to pin) downloads from wxKanban's new `/api/projects/:id/kit/upgrade` endpoint, verifies SHA-256 against the response header, extracts in place, updates only the version fields in `.wxkanban-project.json` (preserves `projectId`, `createdAt`, all other fields), and re-runs `init.mjs`. Per-project files (`.wxkanban-project.json`, `ai-settings.json`, `.env`) and customizable templates (`CLAUDE.md`, `AI.md`, `ProjectOverview.md`, `README.md`) are stripped from the archive server-side, so extraction is safe.
  - **`scripts/check-kit-version.mjs`** — runs as a third `folderOpen` task in `.vscode/tasks.json`. Compares your installed version against the latest available release; prints an up-to-date single-liner or a clearly-bordered upgrade-available notice with the exact upgrade command. Always exits 0 — never blocks workspace open.
  - **Bootstrap from pre-R15 kits**: consumers on v0.1.8 or v0.1.9 need a one-time manual upgrade to v0.1.10 (since `upgrade-kit.mjs` isn't in those older kits). After v0.1.10 is installed, all future upgrades use `node scripts/upgrade-kit.mjs` end-to-end.
  - **URL config**: scripts use `WXKANBAN_API_URL` env > `.wxkanban-project.json` `wxkanbanApiUrl` field > `https://wxkanban.wxperts.com` default.
- `v0.1.9` — full sweep of all 13 issues from `BUG_REPORT-wxkanban-kit-v0.1.8.md` in the wxKanban repo.
- `v0.1.8` — see commit log; superseded by v0.1.9 fixes.
- `v0.1.2` — adds `scripts/init.mjs` one-shot installer, README refresh.
- `v0.1.1` — adds `scripts/orchestrator-health-check.mjs`.
- `v0.1.0` — initial consolidated release (orchestrator + MCP + rules).
