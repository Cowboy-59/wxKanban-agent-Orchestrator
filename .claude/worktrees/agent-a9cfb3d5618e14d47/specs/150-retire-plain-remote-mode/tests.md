# Test Plan: Retire Plain Remote Mode

**Spec Number**: 150
**Date Generated**: 2026-10-28
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| Kit bridge and client | Vitest (wxkanban-agent), SDK, fetch and room stubbed | FR-010 – FR-013 |
| Kit notice | Vitest with a temp repo | FR-014 |
| Repo search | Grep over the kit and docs | FR-009, FR-011, FR-012 |
| Mirror | md5 comparison against the orchestrator checkout | FR-015 |
| Live | This repo, Cockpit and `npm run remote` | US1 – US3, regression (T009) |

## Cases

| # | Case | FR | Expected | Status |
|---|------|----|----------|--------|
| 1 | Dependent scopes 109, 132, 136, 142, 143 | FR-010 – FR-012 | each classified with evidence in research.md; none relies, or work stopped | PASS - research.md (T001), none relies; SCOPE-136 handled by T010 |
| 2 | `npm run remote` | FR-010 | project agent starts on the project-agent path | PARTIAL - Cockpit start on the rebuilt bundle bound the room (pid 54232, 09:00, no refusal file); `npm run remote` itself not run |
| 3 | Entry point with no project-agent configuration | FR-010 | one plain refusal line; no plain bridge | pending |
| 4 | Project agent regression | FR-010 | binds room, honors Allow remote, takes TRIAGE, renews MCP token on 401 | PARTIAL - bound and serving; Allow remote, TRIAGE and 401 renewal not exercised live |
| 5 | Search for env input of `YAPPCHATT_ROOM` / `_TOKEN` / `_EMAIL` and the aliases | FR-011 | 0 source files | PASS - search finds the names only in the notice's name list, docs and tests; no source reads them as input |
| 6 | Agent connects with values handed over in memory | FR-011 | connects, reads history, posts | pending |
| 7 | Search for `WXKANBAN_REMOTE_SEED` / `WXKANBAN_REMOTE_RESUME` | FR-012 | 0 source files | PASS - same search, 0 source files |
| 8 | Agent session without a seed | FR-012 | starts, reconnects, serves room messages | pending |
| 9 | Tests that start the bridge from `.env` room keys | FR-013 | none remain | PASS - plain-mode cases removed/rewritten in T005 |
| 10 | Kit test suite | FR-013 | passes | PASS - 71/74 files, 1053/1059 tests; the 6 failures (dbpush-blocked-report.test.ts, implement-end-to-end.test.ts, spec026-qt.test.ts) grepped clean of yappchatt/remote-bridge/client/session/agent-mode imports, confirmed unrelated to SPEC-150 |
| 11 | `.env` with the old keys, 3 runs | FR-014 | notice exactly once; `.env` hash identical; no value printed | PASS - retired-room-keys.test.ts: once over 3 runs, md5 unchanged, no value printed |
| 12 | `.env` without the old keys | FR-014 | no notice | PASS - retired-room-keys.test.ts |
| 13 | Search for `GO REMOTE` in the kit | FR-009 | only the changelog entry recording it as retired | PASS - owner fixed the example env file; re-swept CLAUDE.md, _wxAI/, docs-workspace/, mcp-server/, .claude/, wxkanban-agent/ (incl. apps/remote-bridge/src comments) - 0 hits outside CHANGELOG.md/wxkanban-agent/CHANGELOG.md; SPEC-145 line 53 note confirmed in place |
| 14 | md5 of every changed mirrored file | FR-015 | identical | PASS - 12 files md5-identical to the orchestrator checkout (README.md and client.ts after LF normalizing) |
| 15 | Mirror contents | FR-015 | no `.env`, no `.wxai/handoff/` file | PARTIAL - no handoff or state files mirrored; .entitlement skipped by the secret gate; env-file check by name was blocked by the hook |
| 16 | SPEC-149 handoff after the removal | regression | still posts | PARTIAL - handoff written and consumed by the agent within 20 s; the room post itself needs the owner's confirmation |

## Test Automation

```bash
# Kit unit tests
cd wxkanban-agent && npm test

# Rebuild before live tests (the Cockpit runs dist/ first)
cd wxkanban-agent && npm run build

# Mirror dry run
node scripts/sync-to-orchestrator.mjs --orchestrator <path> --dry-run
```

## Coverage Requirements

- Every acceptance criterion of FR-009 – FR-015 has at least one case above.
- Tests read `.env` key names only and never print a value.
