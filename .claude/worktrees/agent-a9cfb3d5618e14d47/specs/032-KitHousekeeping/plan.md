# Spec 032: Plan — Kit Housekeeping

**See also**: [spec.md](spec.md), [tasks.md](tasks.md), [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)

This file is the HOW. The WHAT is in [spec.md](spec.md). The task breakdown is in [tasks.md](tasks.md).

---

## Implementation Phasing

The refactor lands as **one PR in three sliced tracks**. Tracks are sequenced A → B → C because:

- Track A's clean baseline is the prerequisite for Track B's assertions to run against valid state.
- Track C touches `mcp-server/src/server.ts` and `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` (both within Track A's fence-cleanup scope), so doing Track A first means Track C operates on already-fenced files.
- Each track is independently testable; checkpoints sit at the boundary of each.

### Slice A — Fence Cleanup (Track A: FR-001 through FR-005)

1. **Inventory step (T001)**: Run `wxkanban-agent auditfences --strict` against the kit. Capture full output to `specs/032-KitHousekeeping/inventory.md`. The output drives the per-file task plan.
2. **Per-file fence tasks (T002–T0NN)**: One task per file in the inventory. Each task is a `wxkanban-agent implement 032/T0NN` invocation with `action: "modify"` proposal containing the file's unchanged source body. The orchestrator's `emitFence` wraps top-level declarations in `// [SCOPE 032 / T0NN] BEGIN/END` markers and writes `taskfences` rows.
3. **Verification step**: Run `wxkanban-agent auditfences --strict` after the per-file tasks complete. Confirm exit 0 (FR-005).

**Checkpoint after Slice A**: `auditfences --strict` returns exit 0; kit test suite passes unchanged (FR-004).

### Slice B — Doc-Validation Tooling (Track B: FR-006 through FR-010)

1. **Doc-validation script (T_B1)**: Write `scripts/doc-validation.ts` per FR-006. Implement the 5 assertion types from FR-007. ~200 LOC.
2. **Assertion config (T_B2)**: Write `scripts/doc-validation.config.ts` with the FR-010 minimum assertion set.
3. **Wire `npm run doc:check` (T_B3)**: Add the script entry to `wxkanban-agent/package.json`. Optionally integrate into `auditfences` per the FR-009 implementer-note.

**Checkpoint after Slice B**: `npm run doc:check` returns exit 0 against the post-Slice-A docs.

### Slice C — MCP Tool Parity (Track C: FR-011 through FR-016)

1. **Register 9 new MCP handlers (T_C1)**: Add the 9 `case` branches + `tools/list` entries in `mcp-server/src/server.ts` per FR-011. Each handler validates args + dispatches.
2. **Apply naming rename (T_C2)**: Rename the 7 existing inconsistent tools to snake_case per FR-013. The renames are applied across `tools/list`, `tools/call` dispatch, and the `mcp-adapter.ts` MCP_TOOL_MAP.
3. **Register deprecation aliases (T_C3)**: Add 7 `[DEPRECATED]` alias registrations per FR-014. Each alias dispatches identically + emits a deprecation warning.
4. **Update mcp-adapter mapping (T_C4)**: `MCP_TOOL_MAP` in `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` is updated per FR-015 (12 canonical + 7 aliases during v0.7.0 lifetime).
5. **Tests (T_C5)**: Per-handler tests + kit_status regression + alias tests + naming-convention assertion test per FR-016.

**Checkpoint after Slice C**: All 9 new MCP tools dispatch correctly; deprecated aliases work; naming convention is uniform.

### Slice D — Cleanup (FR-017 #5, #6)

1. **Version bump (T_D1)**: `wxkanban-agent/package.json` 0.6.0 → 0.7.0.
2. **CHANGELOG entry (T_D2)**: v0.7.0 entry covering all 3 tracks, breaking change in Track C, deprecation window.
3. **Final verification (T_D3)**: Full kit test suite + `auditfences --strict` + `npm run doc:check` + manual smoke test of one new MCP tool per FR-017 #6.

---

## Pre-Implementation Gates

Three conditions must hold before Slice A begins.

| Gate | State as of 2026-05-17 | Action if not met |
|---|---|---|
| **Enhanced `implement <scope>` is functional.** Spec 031 v0.5.0 shipped the batch mode + delete action. | **Met** — verified through spec 030 implementation (Slices A–D) which used these capabilities. | n/a |
| **`auditfences --strict` is functional and produces inventory output.** | **Likely met** but kit `dist/` is out of date from this session's source edits; running auditfences requires `npm run build` first. | Run `npm run build` in `wxkanban-agent/` before invoking auditfences. |
| **Test runner functional.** Slice checkpoints depend on running existing tests. | **Met** — vitest works; 257-359 tests pass throughout this session. | n/a |

---

## Hard Constraints

These are non-negotiable for the implementation phase.

1. **All fences go through the orchestrator** — never hand-author `// [SCOPE 032 / T0NN] BEGIN` markers. Per FR-002 and CLAUDE.md spec 026.
2. **No behavior changes from Track A** — fencing is comment-only; test suite must pass unchanged (FR-004).
3. **Track A precedes Track B precedes Track C** — Track B's assertions run against post-A state; Track C touches files in Track A's scope.
4. **Snake_case for all MCP tool names after Track C** — no exceptions. Future MCP tool registrations follow the convention. Doc-validation assertion enforces.
5. **Deprecation aliases must dispatch identically to canonical names** — same behavior, only different name + warning log.
6. **One PR, four slices** — Slices A → B → C → D ship together. Mid-state where Track A is complete but Track C isn't would leave the kit with mixed naming + missing handlers.

---

## Open Questions Resolved During Buildscope

| Question | Decision | Rationale |
|---|---|---|
| Should `buildscope-worker.ts` legacy unfenced declarations be remediated? | **Mandatory** (FR-003 updated) | Foundational orchestrator code is more important to track, not less. The 2026-05-13 baseline is migration tolerance, not a permanent two-tier system. |
| Track A: per-file or per-declaration tasks? | **Per-file** | One file = one `implement` invocation = clear attribution; ~10 tasks vs ~100 tasks. |
| Track B: integrate into auditfences or sibling auditdocs command? | **Implementer's choice** (FR-009) | Both routings have working precedent. |
| Track C: rename existing tools or keep mixed naming? | **Rename to snake_case with one-release deprecation window** (FR-013/014) | Inconsistent naming would compound when 9 new tools are added; rename + deprecate aligns the kit. |
| Track C: dispatch routing — all through WorkflowEngine or split? | **Implementer's choice** (FR-011 note) | Both patterns coexist in current code; document the choice inline. |
| Out-of-scope: `taskfencehistory.action` column? | **Out** | Schema change is its own scope. Spec 031's FR-004 workaround stays. |
| Out-of-scope: CI gate enforcing auditfences --strict? | **Out** | CI wiring is its own concern (per CHANGELOG known-follow-ups). |

---

## Rollback Strategy

**Mechanism**: `git revert <PR-merge-sha>`.

**Risk assessment**:

- **Track A**: Low — fences are comments + DB rows. Revert restores the unfenced state. DB rows from `taskfences` would orphan, but kit functions correctly with orphan history rows (they're audit-only).
- **Track B**: Low — new script + config + package.json entry. Revert removes them; nothing else depends on them.
- **Track C**: Medium — the rename + deprecation aliases means consumers may already have updated their scripts to new names. Reverting strands those consumers on names that no longer exist (though they may still work as aliases if the alias side survives, depending on revert scope). If Track C ships v0.7.0 and revert is needed, ship v0.7.1 keeping both name sets working.

**Detection**: post-merge, the manual smoke test sequence from `spec.md` "User Scenarios & Testing" runs as the release gate (FR-017 #6).

**Recovery from rollback**: Track A & B are pure cleanups — re-attempt is straightforward. Track C's rename has the deprecation alias as a built-in cushion; if alias usage shows the rename is too aggressive, extending the deprecation window via a patch release is the lighter alternative to full revert.

**Forward-only after v0.8.0**: Once v0.8.0 removes the deprecation aliases, reverting Track C in isolation breaks consumers who updated to the new names. From that point fixes are forward-only.
