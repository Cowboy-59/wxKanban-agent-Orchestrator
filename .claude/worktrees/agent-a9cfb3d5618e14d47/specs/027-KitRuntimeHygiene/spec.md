# Spec 027: Kit Runtime Hygiene — Port Autoselect & Parent-Process Cleanup

## Overview

# Spec 027: Kit Runtime Hygiene — Port Autoselect & Parent-Process Cleanup

**Spec Number**: 027
**Status**: `draft`
**Created**: 2026-05-13
**Depends On**: 019-agent-orchestrator-kit (the MCP + gateway processes whose ports/lifecycle we're managing), 026-CodeFencing (kit at v0.2.0 baseline)
**Source**: in-conversation buildscope, 2026-05-13

---

## Overview

The wxKanban-agent kit spawns two long-running HTTP services in every consumer project: the **MCP server** (default :3002) and the **Orchestrator HTTP gateway** (default :3003). Today these have two operational pain points:

1. **Hard-coded ports**. If `:3002` or `:3003` is already bound (other dev work, leftover process, another consumer project running side-by-side), startup fails with `EADDRINUSE` and the user has to manually pick a port via env var.

2. **No process cleanup on editor exit**. When the user closes VS Code, the spawned MCP and gateway processes orphan-survive their parent terminal. Over a day of work this accumulates dead processes still binding ports, complicates the next session's startup, and silently holds DB connections.

This spec ships:

- **Port autoselect** at startup. Each service tries its configured default, then scans forward through a small bounded range and picks the first free port. The chosen port is written to a shared runtime-state file so clients can discover it.
- **Parent-process watching** on every spawned service. A small watcher polls its parent PID (the VS Code integrated terminal that started it); when the parent disappears, the watcher gracefully shuts down the service (closes the server, releases the port, deletes its entry from the runtime-state file).
- **A single source of truth** at `.wxai/kit-runtime.json` keyed by service name, holding `{port, pid, parentpid, startedAt}` per service. Consumer clients (the buildscope worker, the MCP-call code, future commands) read this file to discover where to connect.
- **A `kit:status` command** that prints the current runtime-state file plus a liveness probe for each service.
- **Backwards compatibility** with the existing `.mcp-server.pid` convention and the existing `kit:stop` script — they keep working; the new runtime-state file is additive.

Both behaviors share the same lifecycle file, so they're packaged as one scope rather than split.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actors** | The kit's spawn scripts (`scripts/setup-mcp.mjs` and a new equivalent for the gateway); the watcher subprocess inside each spawned service; consumer code that calls MCP / gateway HTTP endpoints. |
| **Key Value** | Eliminates `EADDRINUSE` startup failures and orphaned processes. Multiple consumer projects can run concurrently without port collisions. Closing VS Code reliably tears down the project's kit processes. |
| **Scope Boundary (IN)** | Port-conflict detection + autoselect with bounded search range; runtime-state file at `.wxai/kit-runtime.json`; parent-process watcher for graceful shutdown; consumer-side reader that prefers runtime-state file over env vars; `kit:status` CLI; updates to `scripts/setup-mcp.mjs`, `scripts/mcp-health-check.mjs`, `scripts/kit:stop`; per-language matrix unaffected; CLAUDE.md note. |
| **Scope Boundary (OUT)** | A VS Code extension (we explicitly chose the watcher approach instead); detecting non-VS-Code editor exit (Cursor, JetBrains — same parent-process mechanism happens to work but isn't a tested target); cluster / multi-instance deployments; remote MCP servers; HTTPS / auth. |

---

## Functional Requirements

### FR-001 — Default ports and configurable defaults
- MCP server default: `3002`. Overridable via `MCP_HTTP_PORT` env var.
- Orchestrator HTTP gateway default: `3003`. Overridable via `GATEWAY_HTTP_PORT` env var.
- The configured value (env or default) is the **first** port the service attempts to bind; it is not a hard requirement.

### FR-002 — Port autoselect on bind failure
On startup, each service attempts to bind its configured port. If the bind fails with `EADDRINUSE`, the kit scans forward through a bounded range (configured port + 1, +2, ..., +49) and binds the first port that succeeds.

- **Scan range**: 50 ports starting from the configured port. The bound is fixed at 50, not configurable (keeps the search small and predictable).
- **Exhaustion**: if no port in the range is free, startup fails with a clear diagnostic naming the range scanned and the conflicting PID (when discoverable via `netstat`/`lsof`/`ss`, best effort per OS).
- **Probe method**: actual `net.createServer().listen(port)` followed by immediate close — checking with `lsof` first would be racy. The service does one combined attempt: listen → if EADDRINUSE → next.

### FR-003 — Runtime-state file format
A single JSON file at `.wxai/kit-runtime.json`, keyed by service name:

```json
{
  "schemaVersion": 1,
  "services": {
    "mcp": {
      "port": 3002,
      "pid": 12345,
      "parentpid": 6789,
      "startedAt": "2026-05-13T14:23:10.000Z",
      "cmd": "node mcp-server/dist/index-http.js"
    },
    "gateway": {
      "port": 3003,
      "pid": 12346,
      "parentpid": 6789,
      "startedAt": "2026-05-13T14:23:11.000Z",
      "cmd": "ts-node apps/command-gateway/src/http.ts"
    }
  }
}
```

- File is written atomically (tmp + rename) by the spawned service immediately after successful bind.
- File is deleted entirely when both services are gone (the last to shut down removes the file). Partial entries are tolerated.
- Reads are best-effort; if the file is missing, mid-write, or stale (pid no longer alive), the reader falls through to defaults.

### FR-004 — Service-side write-back on bind
Immediately after `app.listen(...)` (or equivalent) reports the actual bound port, the service:
1. Reads the existing `.wxai/kit-runtime.json` if present.
2. Sets/overwrites its own key (`mcp` or `gateway`) with `{port, pid, parentpid, startedAt, cmd}`.
3. Writes the file atomically.

If the directory `.wxai/` doesn't exist, it is created with default permissions.

### FR-005 — Parent-process watcher
Every spawned service starts a watcher thread/interval that polls the parent PID every **2 seconds**:

- **Detection**: on Linux/macOS, check `/proc/<parentpid>` exists; on Windows, use `process.kill(parentpid, 0)` and catch `ESRCH`. Fall back to attempting a no-op signal in either case.
- **Cross-platform abstraction**: a single `isParentAlive(): boolean` helper handles platform differences.
- **Watcher does not block the event loop**. It uses `setInterval` with a low-cost check.

### FR-006 — Graceful shutdown sequence on parent death
When the watcher detects the parent has gone, in order:
1. Stop accepting new connections (`server.close()`).
2. Wait up to **5 seconds** for in-flight requests to complete; force-close stragglers after that.
3. Remove this service's entry from `.wxai/kit-runtime.json`. If no entries remain in `services`, delete the file.
4. Exit with code `0`.

The same shutdown path is invoked on `SIGTERM` / `SIGINT` (kit:stop, Ctrl-C in the terminal). The watcher just routes parent-death to it.

### FR-007 — `parentpid` capture at spawn time
The spawning script (`scripts/setup-mcp.mjs` for MCP; new `scripts/setup-gateway.mjs` or extension thereof for gateway) passes its own PID to the child via an env var (`KIT_PARENT_PID`). If unset (someone runs the service directly), the watcher uses `process.ppid`.

### FR-008 — Client-side discovery precedence
Any client reading the MCP or gateway URL (currently the buildscope worker, lifecycle-client, verify-install) follows this order:

1. **Runtime-state file** — read `.wxai/kit-runtime.json`, verify the recorded PID is alive, use the port from there.
2. **Explicit env var** — `MCP_BASE_URL` / `MCP_HTTP_URL` / `GATEWAY_HTTP_PORT`.
3. **Default** — `localhost:3002` for MCP, `localhost:3003` for gateway.

A new helper `core/context/runtime-state.ts` exposes `resolveServiceUrl(service: 'mcp' | 'gateway'): string` that all clients call instead of building the URL inline.

### FR-009 — `kit:status` command
A new entry under `wxkanban-agent kit:status` (or `npm run kit:status`) prints:

```
mcp        port=3002 pid=12345 (alive, parent=6789 alive) up=2m
gateway    port=3003 pid=12346 (alive, parent=6789 alive) up=2m
```

- Reports each service's bound port, PID, parent PID, liveness, and uptime.
- Exit code `0` if all entries in the runtime-state file are healthy, `1` if any entry is stale (PID dead), `2` if file missing.
- Used by humans for quick diagnosis and by `verify-install.ts` (an additional K-FR check).

### FR-010 — `kit:stop` backward compatibility
Existing `kit:stop` script keeps working. After this spec it:
1. Reads `.wxai/kit-runtime.json` if present.
2. For each service: send SIGTERM to recorded PID, wait up to 5s, SIGKILL if still alive.
3. Falls back to the legacy `.mcp-server.pid` file if the runtime-state file is absent.
4. Deletes both files on success.

### FR-011 — Race-condition handling
- **Concurrent writes**: writes are tmp-file-then-rename, atomic at OS level. Last writer wins; any service overwriting another's entry would be a bug detected by `kit:status` (mismatched PIDs).
- **Stale-PID recovery**: if `kit-runtime.json` claims a port/PID but the PID is dead, a starting service overwrites that entry and binds the recorded port (or autoselects if still busy). `kit:status` reports stale entries as warnings.
- **Multiple consumer projects**: each consumer has its own `.wxai/kit-runtime.json` in its own repo, so no cross-project state collision; port-level collisions are resolved by FR-002.

### FR-012 — Logging
- All port-autoselect attempts log via Pino at `info` level: `"Port 3002 busy, trying 3003... bound on 3004"`.
- Watcher shutdown logs at `info`: `"Parent PID 6789 disappeared; shutting down mcp gracefully"`.
- No new `console.log` (per CLAUDE.md).

### FR-013 — `.gitignore` rules
The runtime-state file is per-developer transient state. Spec ships an entry for the consumer's `.gitignore`:

```
.wxai/kit-runtime.json
```

The kit's templates include this in `templates/.gitignore.snippet`.

---

## User Scenarios & Testing

### US1 — First-time startup, ports free (happy path)

**Actor**: Developer opening VS Code in a consumer project for the first time today.

**Scenario**:
1. Developer opens the VS Code integrated terminal.
2. Developer runs `npm run kit:start`.
3. `setup-mcp.mjs` spawns the MCP server with `KIT_PARENT_PID=<terminal pid>`.
4. MCP attempts `:3002`, bind succeeds, writes its entry to `.wxai/kit-runtime.json`.
5. The gateway setup script spawns the gateway, attempts `:3003`, bind succeeds, writes its entry.
6. Developer runs `npm run kit:status` — both services report alive, parents alive, uptime ~5s.

**Expected outcome**: `.wxai/kit-runtime.json` contains both `mcp` and `gateway` entries with the default ports. No EADDRINUSE, no manual intervention.

### US2 — Port conflict — autoselect resolves it

**Actor**: Developer who already has port `:3002` bound (another project's MCP, or a leftover process).

**Scenario**:
1. Developer starts MCP. The bind attempt on `:3002` returns `EADDRINUSE`.
2. The script scans forward: tries `:3003`... busy (the gateway from another project), `:3004`... free.
3. MCP binds `:3004`. Logs: `Port 3002 busy, trying 3003... 3004... bound on 3004`.
4. MCP writes `.wxai/kit-runtime.json` with `{ "mcp": { "port": 3004, ... } }`.
5. The gateway starts, attempts `:3003`, busy, scans to `:3005`, binds. Writes its entry.
6. The buildscope worker calls `resolveServiceUrl('mcp')` → reads `.wxai/kit-runtime.json` → returns `http://localhost:3004`.

**Expected outcome**: Services run on free ports; clients connect via the runtime-state file; no user intervention beyond running `kit:start`.

### US3 — Port-range exhaustion (failure path)

**Actor**: Developer in a pathological environment where 50 consecutive ports are bound.

**Scenario**:
1. MCP tries `:3002` through `:3051`, all return EADDRINUSE.
2. Startup fails with exit code `1` and diagnostic:

```
ERROR: cannot find a free port for mcp in range 3002–3051.
Conflicting PIDs (best effort): 3002=12345 (node), 3003=12346 (node), ...
Suggestions:
  - Kill stale processes: wxkanban-agent kit:stop
  - Override the start port: MCP_HTTP_PORT=4000 npm run kit:start
```

**Expected outcome**: Loud failure with actionable guidance. No silent fallback.

### US4 — Parent VS Code closes, services exit cleanly

**Actor**: Developer who closes VS Code at end of day.

**Scenario**:
1. MCP and gateway have been running for 4 hours, parent PID = VS Code's integrated terminal.
2. Developer closes VS Code; the integrated terminal process exits; terminal PID disappears.
3. Each service's watcher polls `isParentAlive(parentpid)` every 2s; within 2s it returns false.
4. Watcher invokes graceful shutdown: `server.close()`, wait ≤5s for in-flight requests, remove the service's entry from `.wxai/kit-runtime.json`, exit `0`.
5. When both services have exited, the file is deleted entirely.

**Expected outcome**: Within ~7s of VS Code closing, both processes are gone. Ports released. `.wxai/kit-runtime.json` is absent.

### US5 — Mid-session parent crash

**Actor**: Developer whose terminal session crashes (not a clean exit — kill -9 on the shell).

**Scenario**:
1. Same as US4 except the parent exits via SIGKILL rather than clean close.
2. The OS still removes the parent PID; watcher detection works identically.
3. In-flight requests get up to 5s; whatever's left is force-closed.

**Expected outcome**: Same as US4. The mechanism doesn't depend on the parent shutting down gracefully.

### US6 — Stale-PID recovery on next startup

**Actor**: Developer whose previous session ended badly (e.g., laptop crashed, processes orphaned somehow despite the watcher).

**Scenario**:
1. `.wxai/kit-runtime.json` still claims `mcp` at PID 12345 on port 3002.
2. Developer starts kit. Startup script reads the file, calls `isPidAlive(12345)` → false.
3. The file's `mcp` entry is treated as stale; the new MCP attempts `:3002`, succeeds, overwrites the entry with its own PID.
4. `kit:status` reports both services healthy.

**Expected outcome**: No manual cleanup required. Stale entries are transparently overwritten.

### US7 — `kit:status` on a partially-running session

**Actor**: Developer who started MCP but the gateway is not running.

**Scenario**:
1. `kit:status` reads the file.
2. Output:

```
mcp        port=3002 pid=12345 (alive, parent=6789 alive) up=10m
gateway    NOT RUNNING
```

3. Exit code `1` because at least one expected service is missing.

**Expected outcome**: Honest reporting, machine-readable exit code.

### US8 — Concurrent kit instances in two consumer projects

**Actor**: Developer with two consumer projects open in two VS Code windows.

**Scenario**:
1. Project A starts kit first: MCP bound on `:3002`, gateway on `:3003`.
2. Project B starts kit second: MCP attempts `:3002` (busy), autoselects `:3004`; gateway attempts `:3003` (busy), autoselects `:3005`.
3. Each project's `.wxai/kit-runtime.json` lives in its own repo; no shared state.
4. Closing project B's VS Code only kills project B's MCP+gateway (the watcher knows its specific parent PID).

**Expected outcome**: Both projects coexist. Each has its own runtime-state file and independent lifecycle.

### Integration test mapping (quickstart.md)

QA tasks cover:

- **QT-1** (US1): clean startup writes runtime-state file, ports match config.
- **QT-2** (US2): port autoselect resolves a conflict and records the actual port.
- **QT-3** (US3): port exhaustion produces the documented diagnostic and exits 1.
- **QT-4** (US4, US5): parent-death watcher triggers graceful shutdown within 7s of parent exit.
- **QT-5** (US6): stale-PID entries are overwritten by a fresh startup.
- **QT-6** (US7): `kit:status` reports per-service liveness with correct exit codes.
- **QT-7** (US8): two concurrent kit instances in separate repos coexist without state collision.

---

## Data Model

This spec adds **no database tables**. All state is filesystem-only and per-consumer-repo.

### `.wxai/kit-runtime.json` — runtime-state file

Path: `<consumer repo root>/.wxai/kit-runtime.json`

```jsonc
{
  "schemaVersion": 1,
  "services": {
    "mcp": {
      "port": 3002,
      "pid": 12345,
      "parentpid": 6789,
      "startedAt": "2026-05-13T14:23:10.000Z",
      "cmd": "node mcp-server/dist/index-http.js"
    },
    "gateway": {
      "port": 3003,
      "pid": 12346,
      "parentpid": 6789,
      "startedAt": "2026-05-13T14:23:11.000Z",
      "cmd": "ts-node apps/command-gateway/src/http.ts"
    }
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `schemaVersion` | integer | Currently `1`. Bumped on incompatible change. Readers reject unknown versions. |
| `services.<name>.port` | integer | The port the service is currently bound to (after autoselect). |
| `services.<name>.pid` | integer | OS process ID. |
| `services.<name>.parentpid` | integer | PID of the spawning terminal/script (`KIT_PARENT_PID` env var, or `process.ppid` fallback). |
| `services.<name>.startedAt` | ISO 8601 string | Set once at bind, never updated. |
| `services.<name>.cmd` | string | Diagnostic only; the actual command line used. |

Service names are `mcp` and `gateway` at v0.3.0. Adding new services in future releases requires bumping `schemaVersion` only if the existing entries gain new required fields.

### Write semantics

- Atomic: write to `.wxai/kit-runtime.json.tmp.<pid>` then `rename()` over the target. Crash-safe against partial reads.
- Concurrent: last writer wins on overlapping writes. Each service only writes its own key, so collisions only occur if two MCPs (or two gateways) try to start simultaneously — which is itself a misconfiguration.
- Cleanup: on graceful shutdown, the service reads the file, removes its own key, writes back. If `services` is empty after the removal, the file is deleted entirely.

### Read semantics

- All reads tolerate: missing file, malformed JSON, stale PIDs.
- A "stale" entry is one whose `pid` is not alive. Readers skip stale entries and fall through to defaults (FR-008 precedence).
- Reads are cheap (small JSON, <1 KB typical); no caching is required.

## CLI Contracts

### `wxkanban-agent kit:status` (new)

```
wxkanban-agent kit:status [--format text|json] [--strict]
```

Reads `.wxai/kit-runtime.json` and probes each entry's liveness.

**Text output**:

```
mcp        port=3002 pid=12345 (alive, parent=6789 alive) up=2m13s
gateway    port=3003 pid=12346 (alive, parent=6789 alive) up=2m13s
```

If an entry is stale:

```
mcp        port=3002 pid=12345 (STALE — pid not alive)
```

If a service is missing entirely:

```
gateway    NOT RUNNING
```

**JSON output (`--format json`)**:

```json
{
  "schemaVersion": 1,
  "services": {
    "mcp":     { "port": 3002, "pid": 12345, "alive": true,  "parentAlive": true,  "uptimeSec": 133 },
    "gateway": { "port": 3003, "pid": 12346, "alive": true,  "parentAlive": true,  "uptimeSec": 133 }
  },
  "summary": { "healthy": 2, "stale": 0, "missing": 0 }
}
```

**Exit codes**:
- `0` — all expected services (`mcp`, `gateway`) present and alive.
- `1` — at least one expected service is stale or missing.
- `2` — runtime-state file is malformed or unreadable.

`--strict` makes stale-but-not-yet-cleaned-up entries an error (default treats them as warnings).

### `npm run kit:start` (existing — behavior change)

- Reads existing `.wxai/kit-runtime.json` for stale-PID cleanup (FR-006 / FR-011).
- Spawns MCP and gateway with `KIT_PARENT_PID=$$` (the shell's PID).
- Each service performs FR-002 autoselect and FR-004 write-back.
- If a service fails to bind across the whole 50-port range, exits non-zero with FR-002 diagnostic.

### `npm run kit:stop` (existing — behavior change)

- Reads `.wxai/kit-runtime.json` and sends SIGTERM to each recorded PID; SIGKILL after 5s.
- Falls back to the legacy `.mcp-server.pid` if the new file is absent.
- Removes both files on success.

### Environment variables

| Var | Default | Effect |
|-----|---------|--------|
| `MCP_HTTP_PORT` | `3002` | First port MCP attempts to bind. Autoselect proceeds from here. |
| `GATEWAY_HTTP_PORT` | `3003` | First port gateway attempts. |
| `MCP_BASE_URL` / `MCP_HTTP_URL` | (unset) | Explicit override of MCP URL discovery; **bypasses** the runtime-state file. |
| `KIT_PARENT_PID` | (set by `kit:start`) | PID the watcher monitors. Unset → uses `process.ppid`. |
| `KIT_PORT_SCAN_RANGE` | `50` | (Reserved — currently hard-coded.) |
| `KIT_WATCHER_INTERVAL_MS` | `2000` | Poll interval for parent-death detection. |

## New Modules

| Module | Purpose |
|--------|---------|
| `wxkanban-agent/core/runtime/state-file.ts` | Read/write `.wxai/kit-runtime.json` atomically; expose `readRuntimeState()`, `writeServiceEntry(name, entry)`, `removeServiceEntry(name)`. |
| `wxkanban-agent/core/runtime/port-autoselect.ts` | `bindWithAutoselect(preferredPort, scanRange): Promise<{server, port}>`. Returns the bound HTTP server and actual port. |
| `wxkanban-agent/core/runtime/parent-watcher.ts` | `startParentWatcher(parentpid, onParentGone, opts?): { stop(): void }`. Cross-platform alive check. |
| `wxkanban-agent/core/context/runtime-state.ts` | Client-side `resolveServiceUrl(service): string` implementing FR-008 precedence. |
| `wxkanban-agent/core/orchestrator/command-handlers/kit-status.ts` | `kit:status` CLI handler. |

## Updated Modules

- `wxkanban-agent/apps/command-gateway/src/http.ts` — replaces hard-coded `PORT` with autoselect; starts parent-watcher; writes/removes its entry.
- `mcp-server/src/server.ts` (and/or `mcp-server/dist/index-http.js`) — same treatment for MCP.
- `scripts/setup-mcp.mjs` — passes `KIT_PARENT_PID`, reads runtime-state for stale recovery.
- `scripts/mcp-health-check.mjs` — uses `resolveServiceUrl('mcp')` instead of hard-coded URL.
- `scripts/kit:stop` (the inline command in `package.json`) — promoted to a real script `scripts/kit-stop.mjs` that handles both new file and legacy `.mcp-server.pid`.
- `wxkanban-agent/workers/ai/buildscope-worker.ts` and `services/lifecycle-api/lifecycle-client.ts` — call `resolveServiceUrl('mcp')`.
- `wxkanban-agent/scripts/verify-install.ts` — adds a `kit:status` health-check step.
- `wxkanban-agent/templates/.gitignore.snippet` — new file with `.wxai/kit-runtime.json` plus existing recommended ignores.

---

## Acceptance Criteria

Spec 027 is `Released` when all of the following hold:

### A-1 — Port autoselect works (FR-002)
- A free configured port is bound on first try; runtime-state file records that port.
- A busy configured port causes scan-forward; the first free port in the 50-range is bound; runtime-state file records the actual port.
- A 50-port-exhausted scenario exits 1 with the documented diagnostic naming the range scanned.
- Both MCP and gateway exercise this path independently.

### A-2 — Runtime-state file behaves correctly (FR-003, FR-004, FR-011)
- Written atomically (tmp + rename); a `kill -9` mid-write leaves either the prior contents or the new contents intact, never partial.
- Each service writes its own key without touching the other.
- A stale entry (PID dead) is overwritten by a fresh startup without manual cleanup.
- File is deleted entirely when the last service exits gracefully.

### A-3 — Parent-process watcher fires on parent death (FR-005, FR-006)
- Within `KIT_WATCHER_INTERVAL_MS` + 5s graceful window (default ≤ 7s total) of the parent PID disappearing, both services exit cleanly.
- Ports are released (next `kit:start` can bind the original ports immediately).
- Runtime-state file is fully cleaned up after both services exit.

### A-4 — Client-side discovery follows precedence (FR-008)
- Runtime-state file is preferred over env vars; env vars over defaults.
- If runtime-state file exists but its recorded PID is dead, the client falls through to env / default.
- `resolveServiceUrl('mcp')` and `resolveServiceUrl('gateway')` are the only places URLs are computed; old inline `localhost:3002/3003` literals are removed from `buildscope-worker`, `lifecycle-client`, `verify-install`, `mcp-health-check`.

### A-5 — `kit:status` works (FR-009)
- Text output reports each service's port, PID, parent PID, liveness, uptime.
- JSON output validates against the schema in CLI Contracts.
- Exit codes follow CLI Contracts: 0 healthy, 1 stale/missing, 2 unreadable.
- Missing-service is surfaced even when the file exists with only one entry.

### A-6 — `kit:stop` updated, legacy fallback preserved (FR-010)
- With `.wxai/kit-runtime.json` present: SIGTERM-then-SIGKILL each recorded PID, delete the file.
- With only legacy `.mcp-server.pid` present: existing behavior preserved.
- With both present: prefer runtime-state file, still clean up the legacy file.

### A-7 — Multi-instance coexistence (FR-002, US8)
- Two consumer projects' kits started concurrently each get unique ports (one on defaults, the other auto-selected).
- Each project's runtime-state file lives in its own repo and references its own parent PID.
- Closing one project's editor does not affect the other's running services.

### A-8 — Tests pass
- Unit tests for `port-autoselect.ts`, `parent-watcher.ts`, `state-file.ts`, `runtime-state.ts` resolver.
- Integration tests for QT-1 through QT-7.
- Existing kit test suite stays green (no regressions in the 139 tests from spec 026).

### A-9 — Documentation
- `wxkanban-agent/docs/kit-runtime.md` documents the runtime-state file, the watcher mechanism, and the `kit:status` command.
- `README.md` updated to mention port autoselect and the parent-watcher.
- `CHANGELOG.md` `v0.3.0` entry summarizes the change and migration notes (none required; behavior is additive).

### A-10 — Dogfood
- This repo's own kit start (via `npm run kit:start`) exercises both autoselect (forced by binding `:3002` in another shell first) and parent-watcher (verified by closing the VS Code window).
- `kit:status` reports green on a healthy session.

## Out of Scope

- **VS Code extension**. Explicitly chosen out — parent-process watcher is the mechanism. Editor-side integration may revisit this in a later scope if cross-shell scenarios surface.
- **Non-VS-Code editor detection**. The parent-process mechanism happens to work for Cursor/JetBrains/raw shells but those aren't tested targets at v0.3.0.
- **Remote MCP / gateway servers**. The runtime-state file assumes `localhost:port`; remote deployments are a separate spec.
- **HTTPS / auth**. Ports remain plain HTTP local-only.
- **Cluster / multi-process service instances**. Each service is single-instance per repo at v0.3.0.
- **Custom port-range size beyond 50**. `KIT_PORT_SCAN_RANGE` env var is reserved in CLI Contracts but not honored at v0.3.0; ship as a follow-on if needed.
- **Healthcheck polling beyond simple PID-alive**. A full `GET /health` probe isn't required for liveness; `kit:status` reports PID-alive only. An HTTP-level health probe is a future enhancement.
- **Migration of the legacy `.mcp-server.pid` format**. It remains as a fallback; removal is a future scope.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Watcher polls add noise (CPU/log spam). | Low | Low | 2-second poll, single `kill(pid, 0)` syscall, no logging on the steady-state happy path. |
| Parent-watcher misfires — kills service while parent is briefly unresponsive. | Low | Medium | `kill(pid, 0)` returns success even for zombies; only `ESRCH` is treated as "parent gone". Two consecutive misses required before triggering shutdown (small hysteresis). |
| Port autoselect picks a port some unrelated service later wants. | Medium | Low | Documented as expected behavior; the alternative (reserving a wide range) is worse. Range stays small (50) so the chosen port stays close to the documented default. |
| Stale runtime-state entry blocks recovery (a real PID that's not our service). | Low | Medium | FR-011 stale-PID handling: we test alive-ness, not just file presence. A PID collision with an unrelated process is rare but possible; the worst case is a single failed scan attempt before falling through. |
| Two simultaneous spawns race the file. | Low | Low | Atomic rename + last-writer-wins. Misconfiguration only — `setup-mcp.mjs` is the single entry. |
| Linux `/proc/<pid>` check disagrees with `process.kill(pid, 0)` on edge containers. | Low | Low | Single `isPidAlive` helper using `process.kill(pid, 0)` everywhere; `/proc` is fallback only. |
| Graceful 5-second window is too short for slow consumer HTTP work. | Low | Low | Configurable via `KIT_SHUTDOWN_GRACE_MS` (reserved; default 5000). Verified in QT-4. |
| Schema version bump breaks rolling rollback. | Low | Low | Readers reject unknown `schemaVersion`; old kits fall through to env/default discovery (same behavior as pre-027). |

## Dependencies

- **Spec 019** — Orchestrator Kit. Provides `setup-mcp.mjs`, `kit:stop`, the command gateway. This spec modifies those.
- **Spec 026** — Code Fencing. Every new module shipped here is itself fenced by `implement 027/T<...>`. Spec 026's `auditfences` gate runs in CI.
- **Pino logging** per CLAUDE.md.
- **No new third-party libraries.** Uses built-in `net`, `child_process`, `process`, `fs/promises`.

## Out-of-Band Issues to Track Separately

- `verify-install.ts` step ordering — the new `kit:status` check will only meaningfully pass once the consumer has run `kit:start`. Document this in K-FR-5 of spec 026 as a sequencing note.
