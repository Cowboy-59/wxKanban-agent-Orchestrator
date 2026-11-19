# Tasks: Spec 086 — Kit Cockpit Delivery

Spec: 086 · Scope: SCOPE-086 · Status: implementing (8/8 done) · Priority: high

> **Amendment B (2026-07-10):** design changed to **Marketplace-ONLY** (bundled `.vsix` removed). Task titles below still read "fallback/source override" from the original gallery-first design — the shipped behavior is gallery-only per Amendment B in `spec.md`.

Tasks are created in wxKanban (`projecttasks`, linked to spec `a07bcf8d-2aba-4caa-b0eb-08dd81775061`). Fenced code changes go through `wxkanban-agent implement 086/<task>`, never hand-edited.

| # | Task | FR | Status | Priority | Task ID |
|---|------|----|--------|----------|---------|
| 1 | T001 Marketplace-first self-update in ensureCockpitUpToDate | FR-004 | done | high | 8ae3a4d9-6e14-4709-9345-0068412d3048 |
| 2 | T002 Marketplace-first fresh install (installer retired; path is ensureCockpitUpToDate) | FR-004 | done | high | d925dee2-3402-486b-a3ba-f219931685e9 |
| 3 | T003 WXKANBAN_COCKPIT_SOURCE escape hatch (auto/gallery/vsix) | FR-004 | done | medium | cd33f486-4ccd-4668-814a-a9d39fe8ae27 |
| 4 | T004 Unit tests: gallery-first, fallback, no-downgrade, source override | FR-004 | done | high | 59084712-7f18-485d-9722-29d6e44c487f |
| 5 | T005 Post-release published-asset SHA + vsix-present verification | FR-001 | done | high | 0426c575-b7c7-4636-93b1-834274470fd1 |
| 6 | T006 Visible no-code/no-vsix install fallback message | FR-002 | done | medium | ae22ca8b-3917-4822-913f-fdae5dd87060 |
| 7 | T007 Documented/automated KitProxyService cache-bust | FR-003 | done | medium | cbab1a7d-7315-4cff-8f5f-3ee98a819be9 |
| 8 | T008 Docs + two-allowlist sync + end-to-end verification | cross | done | medium | 1934c494-ca91-4ee4-9304-64a044537790 |

**T005 + T007 were already implemented in a prior session** (commit `0defa039` — `verifyPublishedRelease` in `sync-to-orchestrator.mjs`; `POST /api/sysadmin/kit/reset-cache` in `sysadmin.ts`); this task list re-created them, verified present + wired.

**T008 completed 2026-07-10** — the Marketplace-only refactor (Amendment B) shipped in **kit release v1.7.27** (orchestrator `eb3f297`): the sync mirrored the updated `wxkanban-agent/` in, `build-release.mjs` + `install-cockpit-extension.mjs` were converted to gallery-only, the stale `vscode-extension/` source tree was removed, and the published archive was verified to contain no `.vsix`. Gallery-only behavior now reaches customers.

## Suggested order
1. **T001 + T002** together — the headline behavior change (gallery-first install/update). Verify a fresh init yields a gallery-managed cockpit before moving on.
2. **T003** — escape hatch for locked-down environments (small, complements T001/T002).
3. **T004** — lock the behavior with tests.
4. **T005 / T006 / T007** — fallback-path hardening (independent of each other).
5. **T008** — docs, mirror sync, auditfences, end-to-end verification. Do last.
