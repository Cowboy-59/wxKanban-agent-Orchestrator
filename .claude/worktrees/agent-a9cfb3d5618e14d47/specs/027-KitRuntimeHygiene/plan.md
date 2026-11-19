# Plan: Kit Runtime Hygiene — Port Autoselect & Parent-Process Cleanup

**Spec Number**: 027
**Date**: 2026-05-13

## Implementation Plan

### Phase 1 — Core Runtime Modules (T001–T004)
Three self-contained pure-function modules under `core/runtime/`:
- `state-file.ts` — atomic JSON read/write of `.wxai/kit-runtime.json`.
- `port-autoselect.ts` — `bindWithAutoselect` against the live TCP stack.
- `parent-watcher.ts` — cross-platform PID liveness with 2-miss hysteresis.

Unit tests in T004 exercise each module independently. Nothing else can land until this foundation exists.

### Phase 2 — Client-Side Discovery (T005–T006)
`core/context/runtime-state.ts` exposes a single `resolveServiceUrl(service)` function with FR-008 precedence (runtime-state file → env var → default). All future client refactors call this instead of building URLs inline. Runs in parallel with Phase 1 once `state-file.ts` lands.

### Phase 3 — Service-Side Wiring (T007–T010)
Wire the new runtime modules into the two listeners that need them:
- T007: command-gateway HTTP listener.
- T008: MCP server listener.
- T009/T010: integration tests proving the full lifecycle (bind + write entry + watcher fires + clean shutdown).

### Phase 4 — Spawn Scripts (T011–T014)
- T011/T012: spawn scripts pass `KIT_PARENT_PID` and clean stale entries.
- T013: promote inline `kit:stop` to a real script with legacy `.mcp-server.pid` fallback.
- T014: health-check uses the resolver.

### Phase 5 — `kit:status` Command (T015–T019)
- T015–T017: handler + workflow-engine wiring + npm script.
- T018: unit tests for formatters and exit codes.
- T019: integration test against a live runtime-state file.

### Phase 6 — Client Refactor (T020–T022)
Remove the last hard-coded `localhost:3002/3003` literals from `buildscope-worker`, `lifecycle-client`, and `verify-install`. Each call site switches to `resolveServiceUrl`. T022 also adds the `kit:status` check into `verify-install`.

### Phase 7 — Templates, Docs, Version Bump (T023–T027)
- T023: `.gitignore.snippet` template.
- T024: `docs/kit-runtime.md`.
- T025: README updates.
- T026: CHANGELOG v0.3.0.
- T027: `package.json` version bump + `kit:status` script.

### Phase 8 — QT Integration Tests (T028–T032)
Five integration test files mapping to QT-1 through QT-7. Run alongside the corresponding feature phases as they land; all must pass before T033.

### Phase 9 — Lifecycle Close (T033)
AC verification, `lifecycle.json` flipped to `released`, `projectlifecycle.md` regenerated.

## Critical Path

T001–T004 → T005–T006 → T007/T008 → T011–T013 → T015–T017 → T026/T027 → T033.

Phase 6 (client refactor) and Phase 7 (docs) and Phase 8 (QT tests) hang off the critical path but do not extend it.

## Known Issues

### Issue P-1 — Existing `.mcp-server.pid` legacy file
Consumer projects on v0.2.x have an existing `.mcp-server.pid` file convention. Spec 027 keeps reading and writing the legacy file (T013) so existing scripts and any external tooling that watches it continues to work. Removing the legacy path is explicitly out of scope here.

### Issue P-2 — `KIT_PORT_SCAN_RANGE` env var reserved but not honored
CLI Contracts list `KIT_PORT_SCAN_RANGE` as a reserved env var, but FR-002 fixes the range at 50. Implementation hard-codes 50; the env var is parsed-but-ignored at v0.3.0 with a Pino warning if set. Honoring it is a follow-on.

### Issue P-3 — Two-miss hysteresis adds up to 2 seconds of detection latency
The parent-watcher requires 2 consecutive misses (4 seconds wall time at default 2s interval) before firing graceful shutdown. With the 5s grace window, total worst-case detection-to-exit is ~9 seconds. A-3 documents this as ≤ 7s for the single-miss case; tune the test threshold accordingly.

### Issue P-4 — Port-conflict diagnostic relies on `lsof`/`netstat`/`ss`
FR-002's "conflicting PID (best effort)" enrichment depends on platform tools. On environments without them (some Alpine containers), the diagnostic falls back to "unknown PID". This is documented in the diagnostic itself; not a blocker.

### Issue P-5 — Watcher does not detect SIGSTOP
`process.kill(pid, 0)` returns success for stopped (paused) processes. If the parent is SIGSTOP'd indefinitely, the watcher will not fire. This is acceptable because in practice VS Code never stops its own terminal subprocess. Documented as known limitation.

## Dependencies on Other Specs

- **Spec 019** — Orchestrator Kit. Owns `setup-mcp.mjs`, `kit:stop`, the command gateway. This spec modifies those.
- **Spec 026** — Code Fencing. Every new module gets fenced via `implement 027/T<...>`; CI's `auditfences --strict` gates the PR.

## Out-of-Band Issues to Track Separately

- `verify-install.ts` sequencing — the new `kit:status` check only passes after `kit:start` has been run. Document this as a known step-ordering caveat in spec 026's K-FR-5 notes.
- Future scope candidate: VS Code extension that exposes a "Stop wxKanban kit" command button, calling the same `kit-stop.mjs` script. Out of scope for 027.
