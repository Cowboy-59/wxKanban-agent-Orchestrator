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

1. **Run `npm install` at the kit root if `node_modules/tsx` is missing.** The kit ships without `node_modules` (they're platform-specific — esbuild/bcrypt/etc.); consumers install for their own platform on first run.
2. Confirm `https://mcp.wxperts.com` (or your configured `MCP_BASE_URL`) is reachable via `GET /health`.
3. Verify the configured `WXKANBAN_API_TOKEN` authenticates against the hosted MCP.
4. Start the Orchestrator HTTP Gateway on port 3003 (detached, log at `logs/orchestrator-gateway.log`, PID at `.orchestrator-gateway.pid`).
5. Run `orchestrator-health-check.mjs` and report the result. Exits 0 if the hosted MCP is reachable, the token is valid, and the gateway is up; exits 1 otherwise.

> **If the orchestrator doesn't work — run `npm install` at the kit root.**
> The most common cause of a broken kit is missing `node_modules`. `init.mjs`
> auto-installs them on first run, but if you bypass `init.mjs` (e.g. running
> `wxai-http.mjs` directly) you'll see `tsx not found in either of: …` until
> you run `npm install` yourself.

If `init.mjs` reports `WXKANBAN_API_TOKEN missing`, you haven't configured the kit yet. Run `kit-configure` first:

```bash
# Step 1: Ask a wxKanban admin to mint an API token for your project at
#         wxkanban.wxperts.com → Admin → Projects → <project> → API tokens.
#         The admin will give you a ~43-char URL-safe base64 string
#         (e.g. 9bB7UUaP0FebtuVsib999l4WB0Eplf2dfZJ6DF2njS0) — no wxk_ prefix.

# Step 2: Configure the kit (writes .wxai/project.json atomically; token is never echoed in full).
node wxkanban-agent/bin/wxkanban-agent kit-configure \
  --token <token copied from the Admin → API Tokens modal> \
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

3. **Update `wxkanban-agent/CHANGELOG.md`** with a versioned entry
   describing what's in the new release. Keep entries terse; that file
   is the canonical release history.

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
     --token <staging token from Admin → API Tokens> --project-id <test-uuid> \
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

