# Task Breakdown: VS Code Dev Cockpit

**Feature**: VS Code Dev Cockpit
**Spec**: 042
**Date Generated**: 2026-05-28
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| #  | Task | FR / SC | Priority | Status |
|----|------|---------|----------|--------|
| T001 | Audit current `project.list_open_items` (mcp-server/src/server.ts): confirm task/doc fields; decide enrich-in-place vs new `project.cockpit_summary` tool to return scopes/specs → phases → tasks + status | FR-004, FR-005 | high | done |
| T002 | Implement the current-project cockpit read: return the project's scopes/specs with tasks grouped by phase and each task's status | FR-004, FR-005 | high | done |
| T003 | Lock the cockpit read path to the token's project + customer; fix the within-customer scope-leak so a token can never see a sibling project | FR-004, SC-4 | high | done |
| T004 | Task-detail source for FR-008: reuse the cockpit-read payload, or add a minimal get-task tool returning title/description/status/phase | FR-008 | medium | done |
| T005 | Define the "incomplete" task status set and verify task→scope linkage is reliable (regression-check the past dropped-spec-linkage bug); add a query test for correct grouping | FR-005 | high | done |
| T006 | Contract/unit test: cockpit read returns only the caller's project; token-for-A cannot read project B or a sibling under the same customer | FR-004, SC-4 | high | done |
| T007 | Create sibling `vscode-extension/` folder: own `package.json`, `tsconfig`, lockfile, esbuild config (mirror `mcp-server/`); zero root build/tsconfig changes | FR-001 | high | done |
| T008 | `package.json` contributions: "wxKanban" Activity Bar container; "Dev Cockpit" tree view + detail webview; commands (refresh, openSpecFile, signIn/relink); `activationEvents` keyed on `.wxkanban-project.json` | FR-001, FR-011 | high | done |
| T009 | `extension.ts` `activate()` — register tree provider, webview provider, and command handlers | FR-001 | high | done |
| T010 | Build pipeline: esbuild for the host bundle + minimal webview bundle importing only shared TYPES from `src/shared/types` (no React-app component reuse) | FR-001, FR-008 | high | done |
| T011 | `projectContext` resolver — port the server precedence (explicit → `WXKANBAN_PROJECT_ID` → walk-up `.wxkanban-project.json`); validate UUID; reject the `tools/` fixture | FR-002 | high | done |
| T012 | Read `.wxai/project.json` for lifecycle stage + active scope | FR-002, FR-005 | high | done |
| T013 | Token bootstrap into SecretStorage — import from `.wxai/project.json` `kit.apiToken` / `WXKANBAN_API_TOKEN`; store/retrieve via SecretStorage only | FR-003 | high | done |
| T014 | `McpClient` wrapper — reuse the kit's existing client (bearer auth, envelope unwrap, 429 retry); target `mcpHttpUrl` from `.wxkanban-project.json` | FR-003, FR-004 | high | done |
| T015 | Multi-root workspace rule: which folder's `.wxkanban-project.json` wins; document + implement | FR-002 | medium | done |
| T016 | `CockpitTreeProvider` — active scope pinned at top, then scopes → phases → incomplete tasks, each with a remaining count | FR-005 | high | done |
| T017 | `DetailWebviewProvider` — read-only task detail (title, description, status, phase) | FR-008 | high | done |
| T018 | "Open related spec/file" command/action from a task or scope node | FR-008 | medium | done |
| T019 | Empty/error states — no project linked, sign-in needed, all caught up, MCP unreachable — each with message + retry/relink action | FR-007, SC-6 | high | done |
| T020 | Local in-IDE refresh signal listener — implement chosen mechanism (file-watch vs emitted command) and trigger a cockpit MCP re-query | FR-006 | high | done |
| T021 | Emit the refresh signal on `dbpush` completion and `implement` completion (kit-side emit) — the cockpit integration point | FR-006 | high | done |
| T022 | Investigate hosted-MCP push (streamable-HTTP): subscribe if supported, else implement a light poll fallback | FR-006 | medium | done |
| T023 | Manual refresh command + toolbar control | FR-006 | medium | done |
| T024 | Package the extension as a `.vsix` and bundle it into the kit download payload | FR-009 | high | done |
| T025 | Kit init hook — install the `.vsix` (`code --install-extension`); handle/prompt the activation reload | FR-009 | high | done |
| T026 | Kit upgrade hook — reinstall/update on accepted upgrade; version sync with `kitVersion`; no-op when unchanged | FR-010 | high | done |
| T027 | Confirm the kit download/init + upgrade flows are the correct insertion points; wire accordingly | FR-009, FR-010 | medium | done |
| T028 | Apply `[SCOPE 042 / Tnn]` fences across all new top-level code in `vscode-extension/` + MCP changes; extend `auditfences` CI to cover `vscode-extension/` | Constraint (026) | high | done |
| T029 | Integration test US1 — open project → remaining-work-per-scope renders < 3s | US1, SC-1 | high | done |
| T030 | Integration test US2 — `dbpush` surfaces new items + task completion drops counts, both via auto-refresh | US2, SC-2, SC-3 | high | done |
| T031 | Integration test US3 — not-linked / sign-in-needed / MCP-unreachable states render correctly | US3, SC-6 | high | done |
| T032 | Security access test — cross-project / sibling-project token isolation on the cockpit read path | FR-004, SC-4 | high | done |
| T033 | Install/upgrade test — fresh kit init installs + activates; accepted upgrade updates to matched version; unchanged is a no-op | FR-009, FR-010, FR-011, SC-5 | high | done |
| T034 | Docs + CHANGELOG entry for 042 (developer guide for the cockpit) | — | low | done |
| T035 | Hosted-MCP-only cleanup (post-release, from alitho bug report): cockpit + kit core read `mcpBaseUrl` / `resolveMcpBaseUrl()` and default to `https://mcp.wxperts.com`; remove the localhost MCP fallback and `mcp` from the local-service machinery (`ServiceName`, `DEFAULT_PORTS`, `kit:status`); mcp-server (the hosted server) untouched | FR-003, FR-004 | high | done |
| T036 | Scope-bind `project.update_task_status` (mcp-server): route through `scoped.updateScoped` so the WHERE is AND-ed with the token's `projectid` — a cross-project taskId matches nothing. Closes the within-customer write-side leak (parity with the T003 read-side fix) and a spec-028 T011 direct-`db.update` violation | FR-004, SC-4 | high | done |
| T037 | Implement the deferred task-status write-back (the half FR-006/SC-3 needs that T021 only pinged for): new kit `syncTaskStatuses()` resolves DB task UUIDs via `project.cockpit_summary` and flips completed tasks to `done` via `project.update_task_status`. Wired into `dbpush` (replaces the deferred stub in `pushExistingSpec`) and into `implement` batch-completion (auto-dbpush on completion). Best-effort; unit-tested | FR-006, SC-3 | high | done |
| T038 | Opportunistic cockpit self-update at refresh time (`core/orchestrator/cockpit-refresh.ts`): new `ensureCockpitUpToDate()` reads the installed version via `code --list-extensions --show-versions`, compares to the bundled `vscode-extension/package.json` version, and `code --install-extension <vsix> --force` when missing/older; no-op when equal, never downgrades. Once-per-process throttle; best-effort (swallow all errors, never affect exit status); disabled by `WXKANBAN_NO_COCKPIT_REFRESH` / `WXKANBAN_NO_COCKPIT_UPDATE`. Called from the same dbpush/implement sites as `emitCockpitRefresh`. Unit-tested | FR-012 | high | done |
