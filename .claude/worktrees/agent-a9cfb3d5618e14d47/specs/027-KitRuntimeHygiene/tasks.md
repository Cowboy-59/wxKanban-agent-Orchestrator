# Task Breakdown: Kit Runtime Hygiene — Port Autoselect & Parent-Process Cleanup

**Feature**: Kit Runtime Hygiene
**Spec**: 027
**Date Generated**: 2026-05-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| #  | Task | Priority | Status |
|----|------|----------|--------|
| 1  | T001: `core/runtime/state-file.ts` — atomic read/write, schemaVersion guard, stale-entry handling | high | done |
| 2  | T002: `core/runtime/port-autoselect.ts` — `bindWithAutoselect`, 50-port scan range, exhaustion diagnostic | high | done |
| 3  | T003: `core/runtime/parent-watcher.ts` — cross-platform `isParentAlive`, 2-miss hysteresis | high | done |
| 4  | T004: Unit tests — state-file + port-autoselect + parent-watcher | high | done |
| 5  | T005: `core/context/runtime-state.ts` — `resolveServiceUrl` with FR-008 precedence | high | done |
| 6  | T006: Unit tests — `resolveServiceUrl` precedence + stale-PID fallthrough | high | done |
| 7  | T007: Wire autoselect + parent-watcher into `apps/command-gateway/src/http.ts` | high | done |
| 8  | T008: Wire same into `mcp-server/src/server.ts` (or `index-http.js`) | high | done |
| 9  | T009: Integration test — gateway lifecycle (autoselect + parent-death) | high | done |
| 10 | T010: Integration test — MCP lifecycle (autoselect + parent-death) | high | done |
| 11 | T011: `scripts/setup-mcp.mjs` — pass `KIT_PARENT_PID` + stale-PID cleanup | high | done |
| 12 | T012: `scripts/setup-gateway.mjs` (or extend setup-mcp for gateway) | high | done |
| 13 | T013: Promote inline `kit:stop` in `package.json` to `scripts/kit-stop.mjs` (with legacy fallback) | high | done |
| 14 | T014: `scripts/mcp-health-check.mjs` — use `resolveServiceUrl` | medium | done |
| 15 | T015: `core/orchestrator/command-handlers/kit-status.ts` | high | done |
| 16 | T016: Wire `kit:status` into workflow-engine dispatch + CrossCuttingCommands | high | done |
| 17 | T017: Wire `kit:status` into `package.json` npm scripts | medium | done |
| 18 | T018: Unit tests — `kit-status` formatters and exit codes | high | done |
| 19 | T019: Integration test — `kit:status` against live runtime-state file | high | done |
| 20 | T020: Refactor `workers/ai/buildscope-worker.ts` → `resolveServiceUrl('mcp')` | medium | done |
| 21 | T021: Refactor `services/lifecycle-api/lifecycle-client.ts` → `resolveServiceUrl('mcp')` | medium | done |
| 22 | T022: Update `scripts/verify-install.ts` — use resolver + add `kit:status` health check | medium | done |
| 23 | T023: `templates/.gitignore.snippet` (with `.wxai/kit-runtime.json` line) | medium | done |
| 24 | T024: `docs/kit-runtime.md` (runtime-state file + watcher + `kit:status` reference) | medium | done |
| 25 | T025: `README.md` — mention port autoselect + parent-watcher | medium | done |
| 26 | T026: `CHANGELOG.md` v0.3.0 entry | medium | done |
| 27 | T027: `package.json` version bump to v0.3.0 (+ `kit:status` in scripts) | medium | done |
| 28 | T028: Integration tests — QT-1 + QT-2 (clean startup + autoselect) | high | done |
| 29 | T029: Integration tests — QT-3 (port exhaustion diagnostic + exit 1) | high | done |
| 30 | T030: Integration tests — QT-4 + QT-5 (parent-death watcher within 7s) | high | done |
| 31 | T031: Integration tests — QT-6 (`kit:status` liveness + exit codes) | high | done |
| 32 | T032: Integration tests — QT-7 (two concurrent kit instances coexist) | high | done |
| 33 | T033: Late-bound AC verification + `lifecycle.json` flip to Released | low | done |

## Dependencies

- **Phase 1 (T001–T004)** before everything else — foundational modules.
- **Phase 2 (T005–T006)** can run in parallel with Phase 1 once T001 lands.
- **Phase 3 (T007–T010)** depends on Phase 1.
- **Phase 4 (T011–T014)** depends on Phase 3.
- **Phase 5 (T015–T019)** depends on Phase 1 (state-file).
- **Phase 6 (T020–T022)** depends on Phase 2 (resolver must exist).
- **Phase 7 (T023–T027)** runs alongside Phases 3–6.
- **Phase 8 (T028–T032)** depends on the corresponding feature phase.
- **T033** last (lifecycle flip + projectlifecycle.md regen).

---

## Task Details

### T001 — `core/runtime/state-file.ts`

**Target files**: `wxkanban-agent/core/runtime/state-file.ts`
**Spec refs**: FR-003, FR-004, FR-011 (read semantics, write semantics, race-condition handling)
**Acceptance**:
- Exports `readRuntimeState(): RuntimeState | null`, `writeServiceEntry(name, entry)`, `removeServiceEntry(name)`.
- Atomic write via `.tmp.<pid>` + `rename()`.
- Tolerates missing file, malformed JSON, unknown `schemaVersion` (rejected).
- Deletes the file entirely if `services` becomes empty after `removeServiceEntry`.
- Creates `.wxai/` directory with default permissions if missing.

### T002 — `core/runtime/port-autoselect.ts`

**Target files**: `wxkanban-agent/core/runtime/port-autoselect.ts`
**Spec refs**: FR-002
**Acceptance**:
- Exports `bindWithAutoselect(preferredPort, scanRange = 50): Promise<{server: http.Server, port: number}>`.
- Scans forward from `preferredPort` up to `preferredPort + scanRange - 1`.
- Returns the first port that binds successfully.
- On full-range exhaustion throws `PortRangeExhaustedError` carrying the range and best-effort conflicting-PID info.
- Pino-logs each attempt at `info` level.

### T003 — `core/runtime/parent-watcher.ts`

**Target files**: `wxkanban-agent/core/runtime/parent-watcher.ts`
**Spec refs**: FR-005, FR-006
**Acceptance**:
- Exports `startParentWatcher(parentpid, onParentGone, opts?): { stop(): void }`.
- Polls every `KIT_WATCHER_INTERVAL_MS` (default 2000).
- Uses `process.kill(pid, 0)`; treats `ESRCH` as parent-gone.
- Requires **two consecutive misses** before firing `onParentGone` (hysteresis).
- `stop()` halts polling and is safe to call repeatedly.

### T004 — Unit tests for T001–T003

**Target files**: `wxkanban-agent/tests/unit/runtime-modules.test.ts`
**Acceptance**:
- state-file: atomic-write semantics, schemaVersion rejection, services-empty deletion, malformed-JSON tolerance.
- port-autoselect: first-port-free success, scan-forward over a server we hold open in the test, exhaustion error shape.
- parent-watcher: fires after 2 misses, never on 1 miss, stop() halts cleanly.

### T005 — `core/context/runtime-state.ts`

**Target files**: `wxkanban-agent/core/context/runtime-state.ts`
**Spec refs**: FR-008
**Acceptance**:
- Exports `resolveServiceUrl(service: 'mcp' | 'gateway'): string`.
- Precedence: runtime-state file (alive PID) → env var → default `localhost:3002/3003`.
- Stale-PID entries are skipped (alive check via `process.kill(pid, 0)`).
- Returns string `http://localhost:<port>` consistent with current call sites.

### T006 — Unit tests for `resolveServiceUrl`

**Target files**: `wxkanban-agent/tests/unit/runtime-state-resolver.test.ts`
**Acceptance**:
- All three precedence tiers verified independently.
- Stale-PID entry falls through.
- Unknown `schemaVersion` falls through.
- `MCP_BASE_URL` overrides everything when set.

### T007 — Wire gateway HTTP to autoselect + parent-watcher

**Target files**: `wxkanban-agent/apps/command-gateway/src/http.ts`
**Spec refs**: FR-001, FR-004, FR-005
**Acceptance**:
- Replaces hard-coded `PORT` with `bindWithAutoselect`.
- After bind, calls `writeServiceEntry('gateway', {...})`.
- Starts parent-watcher; on parent-gone runs FR-006 graceful shutdown (5s in-flight grace, then removes entry, exits 0).
- Also handles `SIGTERM` / `SIGINT` via the same shutdown path.

### T008 — Wire MCP server to autoselect + parent-watcher

**Target files**: `mcp-server/src/server.ts` (and rebuilt `mcp-server/dist/index-http.js`)
**Spec refs**: FR-001, FR-004, FR-005, FR-006
**Acceptance**:
- Same shape as T007 for the MCP listener.
- Writes `mcp` entry with port + pid + parentpid.
- Graceful shutdown removes the entry and deletes the file if last service.

### T009 — Integration test — gateway lifecycle

**Target files**: `wxkanban-agent/tests/integration/gateway-lifecycle.test.ts`
**Acceptance**:
- Spawns the gateway as a child process; verifies it binds + writes the entry.
- Kills the test's own PID via a child watcher to simulate parent-death; verifies gateway exits within 7s.
- File entry removed after exit.

### T010 — Integration test — MCP lifecycle

**Target files**: `wxkanban-agent/tests/integration/mcp-lifecycle.test.ts`
**Acceptance**:
- Same shape as T009 for MCP.

### T011 — `setup-mcp.mjs` updates

**Target files**: `scripts/setup-mcp.mjs`
**Spec refs**: FR-007, FR-011
**Acceptance**:
- Sets `KIT_PARENT_PID=process.pid` in the child env.
- Before spawn: reads `.wxai/kit-runtime.json`, removes any stale `mcp` entry (PID dead).
- On spawn failure, surfaces the FR-002 exhaustion diagnostic.

### T012 — `setup-gateway.mjs`

**Target files**: `scripts/setup-gateway.mjs` (new) or extension of `setup-mcp.mjs`
**Acceptance**:
- Same shape as T011 for the gateway.
- `npm run kit:start` invokes both setup-mcp and setup-gateway.

### T013 — `kit-stop.mjs`

**Target files**: `scripts/kit-stop.mjs` (new), `wxkanban-agent/package.json`
**Spec refs**: FR-010
**Acceptance**:
- Reads `.wxai/kit-runtime.json`; SIGTERM each PID, SIGKILL after 5s.
- Falls back to legacy `.mcp-server.pid` if the new file is absent.
- Deletes both files on success.
- `kit:stop` in `package.json` now invokes this script.

### T014 — `mcp-health-check.mjs` uses resolver

**Target files**: `scripts/mcp-health-check.mjs`
**Acceptance**:
- Replaces hard-coded `localhost:3002` with `resolveServiceUrl('mcp')`.
- Reports the actual resolved URL in its output.

### T015 — `kit-status.ts` handler

**Target files**: `wxkanban-agent/core/orchestrator/command-handlers/kit-status.ts`
**Spec refs**: FR-009
**Acceptance**:
- Reads runtime-state file; probes each entry's liveness.
- Emits text or JSON per `--format`.
- Returns the appropriate exit code (0 / 1 / 2).
- Lists expected services (`mcp`, `gateway`) as `NOT RUNNING` if absent.

### T016 — Register `kit:status` in workflow-engine + policy

**Target files**: `wxkanban-agent/core/orchestrator/workflow-engine.ts`, `wxkanban-agent/core/schemas/lifecycle.ts`
**Acceptance**:
- Adds `kit:status` to `CrossCuttingCommands`.
- Adds `runKitStatus` to `WorkflowEngine`.
- Dispatch case routes `kit:status` to the new handler.

### T017 — `package.json` script

**Target files**: `wxkanban-agent/package.json`
**Acceptance**:
- Adds `"kit:status": "ts-node core/orchestrator/command-handlers/kit-status.ts"` (or via CLI gateway).

### T018 — Unit tests for `kit:status`

**Target files**: `wxkanban-agent/tests/unit/kit-status.test.ts`
**Acceptance**:
- Text and JSON formatters verified.
- Exit codes 0 / 1 / 2 verified against synthetic runtime-state files.
- Stale-entry rendering verified.

### T019 — Integration test — `kit:status` live

**Target files**: `wxkanban-agent/tests/integration/kit-status.test.ts`
**Acceptance**:
- Writes a synthetic runtime-state file with the test's own PID; `kit:status` reports it alive.
- With a fake PID, reports stale + exit 1.

### T020 — `buildscope-worker.ts` resolver refactor

**Target files**: `wxkanban-agent/workers/ai/buildscope-worker.ts`
**Acceptance**:
- Removes hard-coded `MCP_URL` literal; calls `resolveServiceUrl('mcp')`.
- Existing tests still pass.

### T021 — `lifecycle-client.ts` resolver refactor

**Target files**: `wxkanban-agent/services/lifecycle-api/lifecycle-client.ts`
**Acceptance**:
- Same shape as T020.

### T022 — `verify-install.ts` updates

**Target files**: `wxkanban-agent/scripts/verify-install.ts`
**Acceptance**:
- Replaces hard-coded `MCP_BASE_URL` with `resolveServiceUrl('mcp')`.
- Adds a `kit:status` health-check step (skipped if runtime-state file absent).

### T023 — `.gitignore.snippet` template

**Target files**: `wxkanban-agent/templates/.gitignore.snippet`
**Acceptance**:
- Includes `.wxai/kit-runtime.json` plus existing kit-recommended ignores (`.mcp-server.pid`, `logs/`, `.env`).

### T024 — `docs/kit-runtime.md`

**Target files**: `wxkanban-agent/docs/kit-runtime.md`
**Acceptance**:
- Documents the runtime-state file schema, the watcher mechanism, and `kit:status` usage.
- Covers FR-008 precedence for client code.
- Documents the legacy `.mcp-server.pid` fallback.

### T025 — `README.md` updates

**Target files**: `wxkanban-agent/README.md`
**Acceptance**:
- Mentions port autoselect under "Architecture" or "Setup".
- Adds `kit:status` to the cross-cutting commands list.
- Notes the parent-watcher behavior.

### T026 — `CHANGELOG.md` v0.3.0 entry

**Target files**: `wxkanban-agent/CHANGELOG.md`
**Acceptance**:
- New `## v0.3.0 — YYYY-MM-DD` section.
- Lists port autoselect, parent-watcher, `kit:status`, runtime-state file.
- Notes backward compat (legacy `.mcp-server.pid` honored).

### T027 — `package.json` v0.3.0 bump

**Target files**: `wxkanban-agent/package.json`
**Acceptance**:
- Version → `0.3.0`.
- `kit:status` script registered.
- `files` array unchanged (templates/, scripts/, etc.).

### T028 — Integration tests QT-1 + QT-2

**Target files**: `wxkanban-agent/tests/integration/spec027-qt12.test.ts`
**Acceptance**:
- QT-1: clean startup writes the runtime-state file with default ports.
- QT-2: starting with a pre-bound conflicting port causes autoselect; recorded port matches the actually-bound port.

### T029 — Integration test QT-3

**Target files**: `wxkanban-agent/tests/integration/spec027-qt3.test.ts`
**Acceptance**:
- Simulate 50 bound ports starting at the preferred port.
- Service exits 1 with the FR-002 diagnostic naming the range.

### T030 — Integration tests QT-4 + QT-5

**Target files**: `wxkanban-agent/tests/integration/spec027-qt45.test.ts`
**Acceptance**:
- QT-4: kill the test's parent (graceful), service exits within 7s, file entry removed.
- QT-5: kill -9 the parent, same outcome.

### T031 — Integration test QT-6

**Target files**: `wxkanban-agent/tests/integration/spec027-qt6.test.ts`
**Acceptance**:
- Healthy state → exit 0.
- Stale entry → exit 1.
- Missing file → exit 2.
- JSON output matches the schema in CLI Contracts.

### T032 — Integration test QT-7

**Target files**: `wxkanban-agent/tests/integration/spec027-qt7.test.ts`
**Acceptance**:
- Two simulated consumer repos in tmp dirs each spawn a gateway.
- Each binds to its own port (one on default, one auto-selected).
- Killing one parent leaves the other running.

### T033 — Late-bound AC + lifecycle close

**Target files**: `specs/027-KitRuntimeHygiene/lifecycle.json`, `specs/projectlifecycle.md`
**Acceptance**:
- All A-1 through A-10 verified.
- `lifecycle.json` phase flipped to `released`.
- `specs/projectlifecycle.md` regenerated with updated phase distribution charts.
- `projectdocuments` row for `lifecycle` doctype upserted per CLAUDE.md convention.
