# Kit Runtime — Port Autoselect & Parent-Process Cleanup

**Source**: spec 027 (Kit Runtime Hygiene). Ships in `wxkanban-agent` v0.3.0.

The wxkanban-agent kit spawns one long-running HTTP service in every consumer project: the **Orchestrator HTTP gateway** (default `:3003`). (The MCP is hosted at `mcp.wxperts.com` — nothing MCP-related runs locally; see `docs/hosted-mcp.md`.) This document covers how the gateway manages its port, where it records its runtime state, and how it cleans itself up when the editor closes.

## The runtime-state file

Path: `<consumer repo root>/.wxai/kit-runtime.json`

```json
{
  "schemaVersion": 1,
  "services": {
    "gateway": {
      "port": 3003,
      "pid": 12346,
      "parentpid": 6789,
      "startedAt": "2026-05-13T14:23:11.000Z",
      "cmd": "node wxkanban-agent/apps/command-gateway/bin/wxai-http.mjs"
    }
  }
}
```

- Each service writes its own entry **after** it successfully binds (so the recorded `port` is the actual bound port, not the configured preference).
- Writes are atomic (`tmp` + `rename`).
- On graceful shutdown the service removes its own entry; when the last entry is removed the file is deleted entirely.
- The file is per-developer transient state — add `.wxai/kit-runtime.json` to your `.gitignore` (a ready snippet ships at `templates/.gitignore.snippet`).

## Port autoselect (FR-001 / FR-002)

Each service tries its configured port first:

| Service | Env var | Default |
|---------|---------|---------|
| MCP | `MCP_HTTP_PORT` | `3002` |
| Gateway | `GATEWAY_HTTP_PORT` | `3003` |

If the configured port returns `EADDRINUSE`, the service scans forward through **50 consecutive ports** and binds the first free one. If all 50 are busy, startup fails with a clear diagnostic:

```
ERROR: cannot find a free port for mcp in range 3002–3051.
Suggestions:
  - Kill stale processes: wxkanban-agent kit:stop
  - Override the start port: MCP_HTTP_PORT=4000 npm run kit:start
```

The scan range is fixed at 50 in v0.3.0 (the `KIT_PORT_SCAN_RANGE` env var is reserved for future use).

## Parent-process watcher (FR-005 / FR-006)

Each service starts a watcher that polls its parent PID every **2 seconds**. The parent is the process that spawned it (typically the VS Code integrated terminal). The watcher uses `process.kill(pid, 0)` — cross-platform, near-zero cost.

When the parent disappears (closed terminal, crashed shell, VS Code window closed), the watcher requires **2 consecutive misses** (hysteresis) before firing graceful shutdown:

1. `server.close()` — stop accepting new connections.
2. Wait up to **5 seconds** for in-flight requests (override via `KIT_SHUTDOWN_GRACE_MS`).
3. Force-close stragglers.
4. Remove this service's entry from `.wxai/kit-runtime.json`. If `services` is empty, delete the file.
5. Exit `0`.

Worst-case detection-to-exit: ~9 seconds (2s × 2 misses + 5s grace).

The same shutdown path is triggered by `SIGTERM` / `SIGINT` (e.g. `npm run kit:stop`, Ctrl-C in the terminal).

### Spawning a service so the watcher knows the right parent

The spawn script passes the parent PID via the `KIT_PARENT_PID` env var:

```bash
KIT_PARENT_PID=$$ node mcp-server/dist/index-http.js
```

If `KIT_PARENT_PID` is unset (someone runs the binary directly), the watcher falls back to `process.ppid`.

## Client-side discovery — `resolveServiceUrl` (FR-008)

The hosted MCP URL is resolved by `resolveMcpBaseUrl()` (always a hosted URL — see `docs/hosted-mcp.md`). The **gateway** is the only locally-bound service, resolved via `resolveServiceUrl('gateway')`:

```ts
import { resolveMcpBaseUrl, resolveServiceUrl } from 'wxkanban-agent/core/context/runtime-state';

const mcpUrl = resolveMcpBaseUrl();          // e.g. "https://mcp.wxperts.com"
const gwUrl = resolveServiceUrl('gateway');  // e.g. "http://localhost:3003"
```

Gateway precedence:

1. **Runtime-state file** — read `.wxai/kit-runtime.json`, verify the recorded PID is alive, use the port from there.
2. **Explicit env var** — `GATEWAY_HTTP_PORT`.
3. **Default** — `http://localhost:3003`.

If the runtime-state file claims a PID but that PID is dead, the resolver skips the stale entry and falls through to env / default.

## `kit:status` command

Reports per-service liveness:

```
$ npm run kit:status
mcp        port=3002 pid=12345 (alive, parent alive) up=2m13s
gateway    port=3003 pid=12346 (alive, parent alive) up=2m13s

2 healthy, 0 stale, 0 missing
```

Stale or missing examples:

```
mcp        port=3002 pid=12345 (STALE — pid not alive)
gateway    NOT RUNNING

0 healthy, 1 stale, 1 missing
```

| Flag | Effect |
|------|--------|
| `--format json` (or `--json`) | Machine-readable output for CI. |
| `--strict` | Promotes stale entries to errors (changes exit code). |

Exit codes:

- `0` — all expected services (`mcp`, `gateway`) present and alive.
- `1` — at least one expected service is stale (under `--strict`) or missing.
- `2` — runtime-state file is missing or unreadable.

## `kit:stop` command

Reads `.wxai/kit-runtime.json`, sends `SIGTERM` to every recorded PID, waits up to 5 seconds for graceful exit, sends `SIGKILL` if still alive. Falls back to the legacy `.mcp-server.pid` file if the runtime-state file is absent. Deletes both files on success.

```bash
npm run kit:stop
```

Override the grace window via `KIT_SHUTDOWN_GRACE_MS` (default `5000`).

## Concurrent kit instances

Two consumer projects running side-by-side each maintain their own `.wxai/kit-runtime.json` in their own repo. Port autoselect resolves any collision (project B picks the next free port when project A holds the default). Each project's parent-watcher only monitors its own spawning terminal, so closing one project's editor never affects the other's services.

## Troubleshooting

**`kit:start` fails with port-exhaustion**: a process is hoarding 50 consecutive ports. Run `npm run kit:stop` to clear orphans, or override with `MCP_HTTP_PORT=4000` / `GATEWAY_HTTP_PORT=4001`.

**`kit:status` says `STALE`**: an entry's PID is dead. Either run `npm run kit:start` (auto-overwrites stale entries) or manually delete `.wxai/kit-runtime.json`.

**Services don't exit when VS Code closes**: the watcher requires the spawn-time `KIT_PARENT_PID` to match VS Code's terminal PID. If you start the kit outside the integrated terminal (e.g. a detached shell), set `KIT_PARENT_PID` explicitly to the PID you want to monitor, or rely on `kit:stop`.

**Client code still hits the wrong port**: confirm the call site uses `resolveServiceUrl(...)` rather than a literal `localhost:3002/3003`. The spec 026 `auditfences` gate flags inline localhost literals in new code; pre-027 code may still carry them.

## See also

- Spec: `specs/027-KitRuntimeHygiene/spec.md`
- Templates: `templates/.gitignore.snippet`
- Module reference (kit-internal): `core/runtime/{state-file,port-autoselect,parent-watcher}.ts`, `core/context/runtime-state.ts`, `core/orchestrator/command-handlers/kit-status.ts`
- MCP-side mirror (ESM): `mcp-server/src/runtime/kit-hygiene.ts`
