# Test Plan: Change Impact Check

**Spec**: SPEC-137 · [spec.md](spec.md) · [tasks.md](tasks.md)

**live** marks a check that has to run in a real Claude Code session or a real VS Code window. Unit
tests can't prove those.

## Success criteria → tests

| SC | Test | Kind | Task |
|---|---|---|---|
| SC-1 | Run the engine on the JS/TS fixture, which seeds every one of the eight link types. Every seeded link must be found, with the expected label | Fixture | T015 |
| SC-2 | Time the notify check across 100 AI edits on a 5,000-file repo with a warm cache. Pass if p95 ≤ 2 s | Benchmark | T003 |
| SC-3 | **live**: In bypass mode, ask Claude to edit a file whose change crosses a boundary. The edit must be denied with the impact list, Claude must ask in chat, and the edit lands only after a yes. Repeat for Write, MultiEdit and NotebookEdit | Live session | T009, T016 |
| SC-4 | Simulate an unattended run (`--create` flag set) with 3 boundary edits. All 3 complete without waiting, 3 `change_impact_crossing` records are written, and all 3 are listed at the checkpoint | Integration | T010 |
| SC-5 | Apply a drop-column migration and a mass-delete change, both attended and unattended. Each must stop | Integration | T008, T010 |
| SC-6 | Take the MCP offline, agree to 5 changes, then reconnect. All 5 records must reach the store, with none duplicated | Integration | T014 |
| SC-7 | For a sample project of each offered stack, every report names the link types it checked. A change to a file type the engine can't read reports "not read", never "0 affected" | Fixture set | T007 |
| SC-8 | Try to label an adapter whose fixture fails as Confirmed. The validator must refuse | Unit | T015 |

## Per-requirement tests

| FR | Tests |
|---|---|
| FR-001 | The existing `report_change_impact` tests pass unchanged after the move. The engine is present in both kit locations after the kit build |
| FR-002 | One unit test per link type, each asserting its label (Confirmed or Likely) |
| FR-003 | Change a file through `git checkout` outside the editor; the next check sees the change. At the ask moment, the function-level result appears in the chat or panel |
| FR-004 | Every report has both lists, checked and not checked |
| FR-005 | An `@/` alias import is linked. `.vue`, `.svelte` and `.astro` files are read. A MongoDB fixture reports collections, with foreign keys marked not applicable |
| FR-006 | One positive and one negative fixture per boundary condition. A change confined to a single scope is not a boundary |
| FR-007 | A missing setting behaves as `boundaries`. Test the matrix: 3 modes × 4 situations, as in `plan.md` |
| FR-008 | An approval for file A doesn't allow a different change to file A, or any change to file B. Every approval writes a record |
| FR-009 | Covered by SC-4 and SC-5. A data loss under the Remote Session Bridge produces a relay request |
| FR-010 | **live**: the views update within 3 s of a save. A notify-only change opens no panel. An unanswered crossing stays in the status bar. Undo restores the pre-save content |
| FR-011 | Amending a scope through `/buildscope` lists its specs, its fenced code and its dependents, asks before writing, and logs the answer |
| FR-012 | wxBrainstorm step 3 shows the impact list and writes no file or record |
| FR-013 | An immutability test: no route and no MCP tool updates or deletes the three event types. A hand-edit self-agreement is stored as `change_impact_ack` |
| FR-014 | Covered by SC-1 and SC-8 |

## Regression

- The full `vitest` suite, the `mcp-server` tests, and the `vscode-extension` typecheck.
- `wxkanban-agent auditfences`, filtered to the changed files.
- After the push: probe the hosted MCP with a `change_impact_ack` event, to confirm the deploy really
  rolled out.
