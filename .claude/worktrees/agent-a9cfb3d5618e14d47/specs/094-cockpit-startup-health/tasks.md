# Tasks: Cockpit Startup Health Check (Spec 094)

Spec ID: 9cf2e3b3-dd0c-4236-a4ac-3296a991ceac · 6 tasks · 6 done · **phase: implementation**

| # | Task | Priority | Status | FRs | Task ID |
|---|------|----------|--------|-----|---------|
| T001 | Health-probe service (probeMcpHealth + checkSystemHealth) | high | done | FR-001, FR-002, FR-006 | a38e9574-45fc-4124-8cc7-1c55c6215bd9 |
| T002 | System Health tree surface (group + per-check rows) | high | done | FR-003 | 55a96298-981c-4046-91e1-bc5770caf6fe |
| T003 | Fold health into poll signature for auto-repaint | medium | done | FR-005 | 2ad869a0-cf2b-49fc-911b-ad0a4e5b11b0 |
| T004 | Proactive activate() probe + one-time Retry toast | high | done | FR-004 | e8fbf820-afe3-41ce-a6af-2026552b4f41 |
| T005 | Unit tests for probe outcomes + verdict | medium | done | Metric 4 | 6f4a042f-8bb7-47f9-aff5-2fb13ba88164 |
| T006 | Ship to Marketplace (COCKPIT bump + repackage + vsce publish) | medium | done | — | c1c88201-e96e-4523-812d-24111b750211 |

## T001 — Health-probe service (probeMcpHealth + checkSystemHealth)
New `vscode-extension/src/services/healthCheck.ts`. `probeMcpHealth(baseUrl, fetchImpl?)` fetches `GET /health` with a 5s AbortController and maps outcomes (reachable + version + dbConnected / `HTTP <status>` / network error / `timeout`). `checkSystemHealth(folderPaths, fetchImpl?)` resolves project context and returns `{linked, mcp, overall}` where overall = `ok | degraded | offline | unlinked`. Kept vscode-free (folders injected) so it unit-tests under plain Node. Implements FR-001, FR-002, FR-006. Fenced `[SCOPE 094 / T001]`.

## T002 — System Health tree surface (group + per-check rows)
`cockpitTreeProvider.ts`: `health-group` / `health-item` node kinds, `healthGroupNode()` (rolled-up verdict, collapsed + green when ok, expanded + coloured when degraded/offline), `healthItemNodes()` (Orchestrator link, MCP connection + version, Database). `withHealthSection()` prepends the group at the top of the tree, omitted when unlinked. Implements FR-003. Fenced `[SCOPE 094 / T002-T003]`.

## T003 — Fold health into poll signature for auto-repaint
`cockpitTreeProvider.ts`: `health` added to `ComputedState`, probed at the top of `computeState()` (token-free) and included as a health signature (overall + version + dbConnected) in every load-state signature branch so `poll()` repaints when connectivity flips without flicker; `applyState()` stores the snapshot. Implements FR-005. Fenced `[SCOPE 094 / T002-T003]` (co-located with T002 in the same provider change).

## T004 — Proactive activate() probe + one-time Retry toast
`extension.ts`: fire `checkSystemHealth()` from `activate()` independent of view visibility; on degraded/offline show a one-time warning toast naming the endpoint + reason with a Retry action that refreshes the tree. Best-effort, never blocks activation. Implements FR-004. Fenced `[SCOPE 094 / T004]`.

## T005 — Unit tests for probe outcomes + verdict
`vscode-extension/tests/healthCheck.test.ts`: injectable-fetch tests covering `probeMcpHealth`'s five outcomes (reachable, non-2xx, network error, timeout, dbConnected-null) plus trailing-slash handling, and `checkSystemHealth`'s unlinked verdict. 7 tests; full extension suite 31/31 green. Covers Success Metric 4. Fenced `[SCOPE 094 / T005]`.

## T006 — Ship to Marketplace (COCKPIT bump + repackage + vsce publish)
Per SCOPE-086 the kit no longer bundles the VSIX — going live requires a COCKPIT version bump, esbuild repackage, and `vsce publish` to the VS Code Marketplace. Gated on the user's push/publish approval; not part of code-complete. **Status: done** — published `wxperts.wxkanban-dev-cockpit` **v0.2.22** to the VS Code Marketplace 2026-07-10.
