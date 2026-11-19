# Plan: Brainstorm Analyze Mode

**Spec Number**: 156 (implements SCOPE-156)
**Date**: 2026-11-08

## Implementation Plan

### Phase 1 — Findings helper and its tests (T008, T019)
Build `.claude/skills/wxBrainstorm/scripts/analyze-findings.mjs` first: plain Node, no dependencies,
subcommands `merge`, `compare`, `cross-app`, `check`. It owns the FR-006 record shape, the FR-009
fingerprint and evidence hash, and the FR-008/FR-011 write guards. Everything else in the sitting
calls it, so it lands with its Vitest suite (`tests/unit/brainstormAnalyzeFindings.test.ts`) before
any methodology text depends on it.

### Phase 2 — Collect-only modes in the analyzers (T004, T005, T006)
Add `--collect-only` to wxUIUXCodeReview `--audit` and wxConversionParity (served prompt text in
`mcp-server/src/prompts/` plus the local stubs) and to analyzecode / wxICA, limited to steps 0-2. Each
writes findings in the helper's input shape, asks nothing, edits nothing. Interactive mode is
untouched and stays the default.

### Phase 3 — The analyze sitting (T001, T002, T003, T007, T009, T010, T011, T013, T015)
Add the `--analyze` switch to wxBrainstorm's SKILL.md and write `references/analyze.md`: feature
groups first, the analyzer plan through the D-0001 router, one subagent per analyzer with a time
limit, "not checked" on failure, item-by-item review with `check` blocking an undecided close, the
saved report and data file in the analyzed repo, re-run comparison, the opt-in database check, and
resume.

### Phase 4 — Hand-off and cross-app (T012, T014)
`/buildscope --from-md` hand-off on the owner's go and ledger entries through `ledger.mjs`; the
cross-app pass in wxKanban that reads other repos' data files and proposes converter scopes.

### Phase 5 — Panel conduct, help, kit (T016, T017, T018)
Panel conduct in `panel.md` and `conduct.md`; help reference, `commands.json` and the manual page;
confirm the kit sync ships every new file (dry-run only).

### Phase 6 — Verification (T020, T021)
Owner verification runs on the trial conversion with Andy (SC-1 – SC-6), then the consumer
end-to-end check after Andy publishes the kit (SC-7). T021 passing marks the scope done.

## Release order

1. T008 → T019 (helper, then its tests; nothing else depends on unverified hashing).
2. T004, T005, T006 (independent of each other).
3. T001 → T002 → T003 → T007 → T009 → T010 → T011 → T013 → T015 (the sitting, in the order a sitting runs).
4. T012, T014.
5. T016, T017, T018.
6. T020 (with Andy) → T021 (after Andy publishes the kit).

## Known Issues

- **Hosted MCP prompts deploy on push.** T004 and T005 change `mcp-server/src/prompts/*.md`, which
  the hosted MCP regenerates at build (`mcp-server/scripts/build-prompts.mjs`) and deploys on push
  to main. Their collect-only text is live only after Andy pushes; until then a consumer still gets
  the interactive-only prompt.
- **wxDBAnalyze output is Unknown.** Whether its real output carries row values is not yet known;
  T013 records it on a real database before relying on it. The helper strips values regardless.
- **analyzecode / wxICA lives in the agent templates.** T006 edits
  `wxkanban-agent/templates/skills/wxICA/SKILL.md`; confirm the kit sync picks the template up
  (T018).
- **No schema, no route, no UI.** Nothing here touches the database schema or the server, so no
  manual DDL, `db:drift` or deploy step applies.
- **Unit tests hit the production database.** Two known-false failures are expected in the existing
  suite; T019's test file touches no database.
