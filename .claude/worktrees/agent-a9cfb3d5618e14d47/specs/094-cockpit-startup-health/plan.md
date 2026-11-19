# Plan: Cockpit Startup Health Check (Spec 094)

Spec ID: 9cf2e3b3-dd0c-4236-a4ac-3296a991ceac · Phase: implementation

## Approach

Client-only VS Code extension change. No backend surface: it reuses the hosted MCP hub's existing auth-exempt `GET /health` (`mcp-server/src/index-http.ts`), which already returns `{status, version, dbConnected, timestamp}`. In the hosted-only model (spec 028) there is no local gateway process — the orchestrator the developer talks to *is* the hosted MCP — so `/health` is both the MCP-connection and orchestrator-health signal.

The probe logic is isolated in a vscode-free service (folders + fetch injected) so it unit-tests under plain Node; the tree provider and activation wire it into the UI.

## Components

1. **`vscode-extension/src/services/healthCheck.ts`** (new) — `probeMcpHealth()` (5s AbortController port of `scripts/kit-status.mjs::probeHostedMcp`) + `checkSystemHealth()` verdict rollup. (T001)
2. **`vscode-extension/src/providers/cockpitTreeProvider.ts`** — `health-group`/`health-item` nodes, `withHealthSection()` prepend, and `health` folded into `ComputedState` + poll signature. (T002, T003)
3. **`vscode-extension/src/extension.ts`** — proactive `activate()` probe + one-time Retry toast. (T004)
4. **`vscode-extension/tests/healthCheck.test.ts`** (new) — 7 injectable-fetch tests. (T005)

## Verdict model

`checkSystemHealth` → `{linked, mcp, overall}`:
- `unlinked` — no valid `.wxkanban-project.json` resolved (root "no project" message covers it; health group omitted).
- `offline` — `/health` unreachable (timeout / non-2xx / network error).
- `degraded` — reachable but `dbConnected === false`.
- `ok` — reachable and DB connected.

## Reuse

- `probeHostedMcp` shape from `scripts/kit-status.mjs` (single source of the 5s-abort `/health` fetch).
- `resolveProjectContext` (`vscode-extension/src/services/projectContext.js`) for endpoint precedence.
- The existing 30s Cockpit poll + signature machinery (`computeState`/`applyState`/`poll`) for auto-repaint.

## Constraints & gates

- **Marketplace-only delivery (SCOPE-086):** live requires COCKPIT bump → repackage → `vsce publish`. Code-complete ≠ live. (T006, gated on user)
- **Depends on `/health` staying auth-exempt** — if auth is ever added there, FR-002 breaks and the probe must carry a token.
- **Provisional fences reconciled** post-createSpecs from `[SCOPE 094 / cockpit-startup-health]` to real task numbers (`T001`, `T002-T003`, `T004`, `T005`).

## Verification

- `tsc --noEmit -p .` clean · `node esbuild.mjs` bundles · `vitest run` → 31/31 (7 new).
- Manual: Extension Development Host with (a) reachable hub → quiet OK row; (b) bad `mcpBaseUrl` → offline group + toast within 5s; (c) hub up / DB down → degraded group + toast.
