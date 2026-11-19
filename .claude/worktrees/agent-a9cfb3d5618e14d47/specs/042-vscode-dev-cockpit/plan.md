# Plan: VS Code Dev Cockpit

**Spec Number**: 042
**Date**: 2026-05-28
**Total Tasks**: 34 across 7 phases (see [tasks.md](tasks.md))

---

## Implementation Plan

### Phase 1 — MCP Read Coverage & Scoping (T001–T006)

The only backend change. Decide whether to enrich `project.list_open_items` or add a small project-scoped cockpit read tool, then make it return the current project's scopes/specs with tasks grouped by phase + status. Lock the read path to the token's project + customer and fix the within-customer scope-leak. This phase blocks the extension's data layer — the UI cannot be built against a contract that doesn't exist yet.

**Resolves caveats**: enrich vs new tool; get-task vs reuse payload; "incomplete" status set; task→scope linkage reliability.

**Gate**: SC-4 — an access test proves a token for project A cannot read project B or a sibling project under the same customer; the cockpit read returns scopes→phases→tasks with correct status grouping for the current project.

### Phase 2 — Extension Scaffold (T007–T010)

Stand up the sibling `vscode-extension/` folder mirroring how `mcp-server/` already coexists: own `package.json`/`tsconfig`/lockfile, esbuild for the host bundle, a minimal webview build that imports only the shared TYPES from `src/shared/types`. Contribute the Activity Bar container, the tree + detail views, the commands, and the activation events.

**Gate**: the extension loads in an Extension Development Host, contributes the wxKanban container + Dev Cockpit view, and activates on a workspace containing `.wxkanban-project.json` — even before real data is wired.

### Phase 3 — Project Linking & Auth (T011–T015)

Port the server's project-resolution precedence into the extension, read lifecycle/active-scope from `.wxai/project.json`, bootstrap the token from the kit's location into SecretStorage, and wrap the kit's existing `McpClient` (bearer auth, envelope unwrap, 429 retry) pointed at `mcpHttpUrl`. Settle the multi-root workspace rule.

**Resolves caveats**: multi-root folder selection.

**Gate**: in a linked workspace the cockpit resolves the correct `projectId`, loads the token from SecretStorage, and makes an authenticated MCP read; the `tools/` fixture and invalid ids are rejected as "not linked."

### Phase 4 — Cockpit View & Detail (T016–T019)

Build the `CockpitTreeProvider` (active scope pinned → scopes → phases → incomplete tasks with counts), the read-only `DetailWebviewProvider`, the "open related spec/file" action, and all empty/error states.

**Gate**: SC-1 + SC-6 — opening the project renders remaining-work-per-scope within ~3s; each of the four failure states shows a clear message rather than wrong/blank data.

### Phase 5 — Live Auto-Refresh (T020–T023)

Wire the local in-IDE refresh signal (chosen mechanism), emit it from `dbpush` and `implement` completion, add the manual refresh command, and investigate hosted-MCP push (subscribe if available, else light poll fallback).

**Resolves caveats**: local refresh signal mechanism; hosted MCP push vs poll.

**Gate**: SC-2 + SC-3 — a `dbpush` surfaces new items and a task completion drops the remaining count, both without manual refresh.

### Phase 6 — Kit Lifecycle Distribution (T024–T027)

Package the extension as a `.vsix`, bundle it into the kit download payload, and hook install into kit init and update into the accepted-upgrade flow with version sync and reload handling.

**Resolves caveats**: confirm download/init + upgrade insertion points; reload-to-activate handling.

**Gate**: SC-5 — a fresh kit download + init installs and activates the extension with no manual step; an accepted upgrade updates it to the kit-matched version; unchanged version is a no-op.

### Phase 7 — Fencing, Tests & Docs (T028–T034)

Apply `[SCOPE 042 / Tnn]` fences across the new folder + MCP changes and extend `auditfences` CI to cover `vscode-extension/`. Add the US1–US3 integration tests, the SC-4 security access test, the install/upgrade test, and docs/CHANGELOG.

**Gate**: `auditfences --strict` exits 0 for the new code; US1–US3 integration tests and the SC-4 isolation test pass.

---

## Critical Path

T001 (decide read shape) → T002/T003 (MCP read + scoping) unlock the extension's data layer (Phase 3–4). Phase 2 (scaffold) can proceed in parallel with Phase 1 since it has no data dependency. Phases 5–6 depend on a working view (Phase 4). Phase 7 closes out.

## Open Decisions Carried Into Implementation

- Enrich `project.list_open_items` vs. dedicated `project.cockpit_summary` tool (T001).
- Local refresh signal: file-watch on a state file vs. a VS Code command emitted by the kit (T020).
- Hosted MCP push capability — confirmed empirically in T022; poll is the fallback, not the default.
