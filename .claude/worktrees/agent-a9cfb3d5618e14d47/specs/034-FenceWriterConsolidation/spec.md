# Spec 034: Fence-Writer Consolidation — Single Canonical Fence Module

**Spec Number**: 034
**Status**: `proposed`
**Created**: 2026-05-17
**Depends On**: 019-agent-orchestrator-kit, 026-CodeFencing, 030-StageGateConsolidation (the pattern), 031-ImplementEnhancements (delete + batch for the refactor itself), 032-KitHousekeeping (clean fenced baseline), 033-SpecParserConsolidation (sequenced before — implementation pattern is twice-validated by then)
**Governed By**: [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md) — **third concrete application** of the cross-surface-concerns-live-in-one-canonical-module rule
**Source**: in-conversation buildscope, 2026-05-17, queued during spec 030 buildscope as the third ADR-0001 application

---

## Overview

The kit's fence-writing logic — the core capability of [Spec 026 CodeFencing](../026-CodeFencing/) — is split across **three modules with overlapping responsibilities** and a fourth implicit owner that grew during spec 031:

1. `wxkanban-agent/core/orchestrator/fence-emitter.ts` — parses existing fences, decides MODIFY vs REPLACE, emits new fence lines, computes diff ratios, builds `dbWrites`. The bulk of the logic.
2. `wxkanban-agent/core/orchestrator/fence-db.ts` — owns `taskfences` / `taskfencemodifications` / `taskfencehistory` row writes via raw SQL. Consumes `dbWrites` from #1.
3. `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` — directly calls `emitFence`, then calls `applyFenceDbWrites`, plus inlines the drift check, plus inlines the delete-branch fence-history writes (added in spec 031 Phase 1). **`implement.ts` has become a partial fence-writer itself.**
4. `wxkanban-agent/core/orchestrator/content-hash.ts` — owns SHA-256 content hashing used by both the emitter (for new fence rows) and the drift check (for detecting hand-edits). Not duplicated, but tightly coupled to the fence concern.

Adding new fence metadata or changing fence semantics requires touching multiple modules in lockstep. The recent delete-action addition (spec 031) actually **expanded** the inline fence-writing logic in `implement.ts` rather than going through a unified seam — because there isn't one. Each future fence-related enhancement compounds the split.

Same architectural shape as spec 030's Stage Gate problem and spec 033's spec-parser problem. Same fix: **consolidate into a single canonical module at `wxkanban-agent/core/fencing/` exposing one high-level API that owns the full fence lifecycle.**

After this spec lands:

- `wxkanban-agent/core/fencing/` is the only place in the kit that knows how fences work. Adding new fence metadata is a one-module edit.
- `implement.ts`'s per-file loop calls **one function** (`applyFenceWrite({...})`) instead of orchestrating fence-emitter + fence-db + delete-branch logic inline.
- The drift check moves into the canonical module (eliminating the inline check in `implement.ts`).
- The delete-branch fence-history writes (currently inline in `implement.ts` from spec 031) move into the canonical module.
- `fence-emitter.ts`, `fence-db.ts`, and `content-hash.ts` are deleted; their contents move into `core/fencing/internals/`. External API surface collapses to `core/fencing/writer.ts` + `core/fencing/reader.ts`.
- Spec 026 semantics (MODIFY-vs-REPLACE 80% rule, BEGIN/END marker format, `(replaces ...)` suffix) preserved byte-identical.

This spec is **the third concrete application of [ADR-0001](../../wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md)**. After it lands, the pattern is established across three refactors (Stage Gate, spec parser, fence writer) — the kit's three biggest cross-concern surfaces are consolidated. Future refactors copy the pattern directly.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actors** | wxkanban-agent kit maintainers (refactor target — the fence-writing surface); the `implement` orchestrator (primary consumer; loses ~80 LOC of inline fence orchestration); `auditfences` (audit consumer; gets a cleaner read surface); future fence-related enhancements (one-module edits instead of multi-module coordination). |
| **Key Value** | Fence-write drift is structurally eliminated. The "implement.ts has become a partial fence-writer" symptom is closed. Adding fence metadata, changing fence semantics, or evolving the audit trail is a one-module edit. The kit gains its third worked example of ADR-0001, establishing the pattern. |
| **Scope Boundary (IN)** | New canonical module `wxkanban-agent/core/fencing/` with the full fence lifecycle (parse → diff → decide-mode → emit-markers → persist). Refactor `implement.ts` so the per-file loop calls a single `applyFenceWrite()` function. Migration of `fence-emitter.ts`, `fence-db.ts`, `content-hash.ts` into the new module (deleted as external files; survive as internal helpers). Drift check moved into the canonical module. Delete-branch fence-history writes moved into the canonical module. Read surface (`reader.ts`) separated from write surface for audit consumers. Module-load drift assertions consistent with specs 030 + 033. Version bump + CHANGELOG. |
| **Scope Boundary (OUT)** | Changes to fence-emission semantics from Spec 026 (MODIFY-vs-REPLACE 80% rule, BEGIN/END marker format, `(replaces ...)` suffix). All preserved byte-identical. Changes to `taskfences` / `taskfencemodifications` / `taskfencehistory` schemas. The spec-parser concern (Spec 033). The CLI/MCP policy concern (Spec 030 — already consolidated). Fence-history `action` column addition (spec 031 FR-004 deviation; would be a separate small schema-change scope). The fence-rendering side (how fences appear in source code) — already correctly owned by `language-matrix.ts` + `buildFenceLine()`. |

---

## Functional Requirements

### FR-001 — Single canonical module at `wxkanban-agent/core/fencing/`
All fence-writing logic for the wxkanban-agent kit lives under `wxkanban-agent/core/fencing/`. No other directory contains fence-parsing, fence-emission, drift-detection, or `taskfences`/`taskfencemodifications`/`taskfencehistory` row-write logic. Adding new fence metadata, evolving the MODIFY/REPLACE decision, or changing the audit trail is a one-module edit.

Directory layout:

```text
wxkanban-agent/core/fencing/
  writer.ts           — applyFenceWrite, the single high-level write API (FR-002)
  reader.ts           — getFencesForFile, getFencesByOwner, audit read surface (FR-005)
  internals/
    emitter.ts        — fence-emission logic (today's fence-emitter.ts, internalized)
    db.ts             — DB persistence (today's fence-db.ts, internalized)
    drift.ts          — drift detection (FR-003)
    hash.ts           — sha256 (today's content-hash.ts, internalized)
  drift-assert.ts     — module-load self-consistency check (FR-007)
```

The `internals/` subdirectory holds helpers consumed only by `writer.ts` and `reader.ts`. External callers import from `writer.ts` or `reader.ts` only — never from `internals/`.

### FR-002 — `applyFenceWrite` is the single high-level write API
`wxkanban-agent/core/fencing/writer.ts` exports `applyFenceWrite(options): Promise<FenceWriteResult>` as the canonical entry point. The function does the full fence lifecycle in one call:

```ts
export interface ApplyFenceWriteOptions {
  filepath: string;            // repo-relative path
  action: "create" | "modify" | "delete";  // matches ProposedFile.action from spec 031
  proposedContent: string;     // ignored when action === "delete"
  ownerScope: string;          // "030"
  ownerTask: string;           // "T013"
  description: string;         // task title for fence headers
  mode?: "auto" | "replace" | "modify";  // optional override for the FR-009 MODIFY/REPLACE heuristic
  acceptDrift?: boolean;       // overrides FR-003 drift block
  db?: FenceDbClient;          // optional — see FR-006 DB-less mode
  projectId?: string;          // required when db is supplied
  dryRun?: boolean;            // suppresses FS + DB writes; returns the plan
}

export interface FenceWriteResult {
  filesWritten: string[];      // [filepath] on create/modify success
  filesDeleted: string[];      // [filepath] on delete success
  filesSkipped: string[];      // [filepath] on dry-run or no-detectable-unit
  warnings: string[];          // emitter warnings (e.g., NoDetectableUnit)
}
```

Behavior per action:

- **`action: "create"` or `"modify"`**: drift check (FR-003) → run internal emitter to compute output content + dbWrites → atomic file write (tmp + rename) → DB writes via internal db helper.
- **`action: "delete"`**: drift check (FR-003) → atomic FS removal via `unlinkSync` → DB cleanup. Preserves spec 031 FR-002 behavior including the missing-file hard-fail (`ImplementError(2, "cannot delete <path>: file does not exist")`).
- **`dryRun: true`**: no FS or DB side effects; the file path goes to `filesSkipped`.

The function throws `ImplementError(1, ...)` on drift detection (when `acceptDrift` is not set), matching spec 031 FR-003 byte-identical messages.

### FR-003 — Drift check inside the canonical module
The drift check moves from `implement.ts` (where spec 031 inlined it) into `wxkanban-agent/core/fencing/internals/drift.ts`:

```ts
export function checkDrift(
  filepath: string,
  currentContent: string | null,
  existingFences: TaskFenceRow[],
): DriftDetection;
```

`checkDrift` is consumed only by `applyFenceWrite` (FR-002) — external callers never invoke it directly. It returns a structured `DriftDetection` (per-fence drift booleans) that `applyFenceWrite` uses to decide whether to throw.

The check semantics are byte-identical to today's inline check in `implement.ts`. The `acceptDrift` override path is preserved.

### FR-004 — Delete-action fence-history writes inside the canonical module
The delete-branch logic spec 031 added inline in `implement.ts` moves into the canonical module (`internals/db.ts` or `writer.ts` — implementer's call) as part of `applyFenceWrite`'s `action: "delete"` path:

- For each `taskfences` row associated with the file's path, insert a `taskfencehistory` row before removing the `taskfences` row.
- Use the existing `taskfencehistory` schema (per spec 031 FR-004 deviation; out of scope for 034).
- Delete the `taskfencemodifications` rows tied to the deleted fence.

After this FR, `implement.ts` contains zero inline fence-history-write code.

### FR-005 — Read adapter for audit/reporting consumers
`wxkanban-agent/core/fencing/reader.ts` exports a read-only API:

```ts
export interface FenceRecord {
  id: string;
  filepath: string;
  unitkind: string;
  unitname: string;
  ownerscope: string;
  ownertask: string;
  description: string;
  contenthash: string;
  linestart: number;
  lineend: number;
}

export function getFencesForFile(db: FenceDbClient, projectId: string, filepath: string): Promise<FenceRecord[]>;
export function getFencesByOwner(db: FenceDbClient, projectId: string, ownerScope: string, ownerTask?: string): Promise<FenceRecord[]>;
export function getFenceHistory(db: FenceDbClient, projectId: string, filepath?: string): Promise<FenceHistoryRecord[]>;
export function listAllFences(db: FenceDbClient, projectId: string): Promise<FenceRecord[]>;
```

The reader has **no write methods** by construction. `auditfences` imports only from `reader.ts` — accidental mutation through this surface is structurally impossible.

### FR-006 — DB-less mode via optional `db` parameter
`applyFenceWrite` (FR-002) accepts `db` as optional. When absent:

- File writes still occur — source file gets fence markers via the internal emitter, or is atomically removed.
- DB writes are no-ops.
- The drift check (FR-003) is skipped (no `existingFences` available); a warning `"drift check skipped: no db provided"` is added to `FenceWriteResult.warnings`.
- The function still returns a fully-populated `FenceWriteResult` accurate to FS reality.

This preserves today's `useDb` gating semantics from `implement.ts`, moved into the canonical module. `reader.ts` functions all require `db` (no meaningful DB-less mode for reads).

### FR-007 — Module-load drift assert
`wxkanban-agent/core/fencing/drift-assert.ts` runs a synchronous round-trip check at first import:

- Constructs a known in-memory state: a file body with a single known top-level declaration; a synthetic `applyFenceWrite` invocation with action `"create"`, ownerScope/Task `"999"/"T999"`, description `"drift assert test"`.
- Runs the internal emitter helper (not through `applyFenceWrite` itself — round-tripping through file writes would require a tmp dir).
- Asserts the resulting fence-marker text matches the regex `reader.ts`-side parsing expects.
- Asserts a second cycle (re-emitting against the just-emitted content) is idempotent.

Pattern mirrors spec 030's `capabilities.ts` and spec 033's `drift-assert.ts`.

### FR-008 — Cutover all call sites to the new canonical module
Every consumer of fence-related logic is updated to import from `wxkanban-agent/core/fencing/`. Inventory:

| Call site | Today | After cutover |
|---|---|---|
| `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` | Imports `emitFence` from `'../fence-emitter'`, `applyFenceDbWrites` and `loadExistingFencesForFile` from `'../fence-db'`; orchestrates them inline with the drift check and delete-branch logic | Imports `applyFenceWrite` from `'../../fencing/writer'` only. Per-file loop body shrinks to ~15 LOC (single `applyFenceWrite` call + result-shape adapter). |
| `wxkanban-agent/core/orchestrator/command-handlers/auditfences.ts` | Imports from `'../fence-db'` for read queries; possibly inline DB calls | Imports from `'../../fencing/reader'`; no write-side imports |
| Test files for fence-emitter / fence-db (if standalone) | Test old exports | Port to test new write/read surfaces |

### FR-009 — Deletion / internalization of old surfaces
After this spec lands, these files no longer exist as external modules:

- `wxkanban-agent/core/orchestrator/fence-emitter.ts` — content moves to `core/fencing/internals/emitter.ts`.
- `wxkanban-agent/core/orchestrator/fence-db.ts` — content splits: write-side → `core/fencing/internals/db.ts`; read-side → `core/fencing/reader.ts`.
- `wxkanban-agent/core/orchestrator/content-hash.ts` — moves to `core/fencing/internals/hash.ts`.

A grep for `from '../fence-emitter'`, `from '../fence-db'`, `from '../content-hash'` outside `specs/` and `docs/` returns zero matches.

No re-export shims. Same strict-deletion posture as specs 030 and 033.

### FR-010 — Behavior preservation (Spec 026 semantics byte-identical)
Every behavior described in Spec 026 (CodeFencing) FR-001 through FR-010 is preserved byte-identical. The refactor is purely structural — no observable behavior changes from any caller's perspective, including:

- **MODIFY vs REPLACE decision**: 80% non-whitespace line-change threshold; `--replace` and `--modify` overrides honored identically.
- **Fence marker format**: `// [SCOPE NNN / Tnn] BEGIN — <description>`, `END`, `MODIFIED-BY`, `(replaces NNN/Tnn)`.
- **Content-hash computation**: SHA-256 of the fenced body (excluding fence markers themselves).
- **DB write shapes**: rows written to `taskfences`, `taskfencemodifications`, `taskfencehistory` have byte-identical column values to today's output.
- **Error message strings**: every fence-related error message preserved byte-identical.

Where a test asserts on specific message text or DB row content, the assertion continues to pass without modification after the cutover.

### FR-011 — Tests for the new canonical module
Tests for `core/fencing/` use a **mixed pattern**:

- **Decision-table tests** in `tests/unit/fencing/emitter.test.ts` — MODIFY/REPLACE decision, fence-parsing edge cases, against tables of inputs + expected outputs.
- **Fixture-bundle tests** in `tests/unit/fencing/writer.test.ts` — end-to-end `applyFenceWrite` round-trips; fixtures at `tests/unit/fencing/fixtures/`, golden outputs at `tests/unit/fencing/golden/`.
- **Reader tests** in `tests/unit/fencing/reader.test.ts` — each read function with a stub `FenceDbClient` returning canned rows.
- **DB-less mode tests** verify FR-006 — file writes without a `db` parameter.
- **Drift-assert test** verifies FR-007 fires when intentionally broken.

The existing fence-emitter and fence-db test suites port into the new test files. Every behavior covered by the old tests is captured in the new fixture set.

### FR-012 — Acceptance criteria
This spec is complete when:

1. `wxkanban-agent/core/fencing/` contains `writer.ts`, `reader.ts`, `internals/{emitter,db,drift,hash}.ts`, `drift-assert.ts`.
2. `fence-emitter.ts`, `fence-db.ts`, `content-hash.ts` do not exist (FR-009).
3. `implement.ts`'s per-file loop body calls `applyFenceWrite` once per file; no inline drift-check, delete-branch, or fence-emission orchestration code remains.
4. `auditfences.ts` imports only from `core/fencing/reader.ts`.
5. Spec 026 semantics preserved byte-identical (FR-010). Existing test suite passes unchanged.
6. Module-load drift assert (FR-007) fires when intentionally broken.
7. New tests in `tests/unit/fencing/` exist and pass: decision-table + fixture-bundle + reader + db-less + drift-assert.
8. Full kit test suite passes.
9. `wxkanban-agent auditfences --strict` returns exit 0.
10. Kit version bumped one minor (`0.8.0` → `0.9.0` assuming 032 + 033 shipped first; otherwise adjusted). `CHANGELOG.md` entry documents the consolidation.
11. ADR-0001 (optional) — evidence section notes spec 034 as the third concrete application.

---

## User Scenarios & Testing

### Write path: applyFenceWrite

| Scenario | Setup | Expected outcome |
|---|---|---|
| Create — new file with detectable top-level decl | `applyFenceWrite({ action: 'create', filepath: 'new.ts', proposedContent: 'export function foo() {}', ownerScope: '030', ownerTask: 'T001', description: 'Sample', db, projectId })` | File created with `// [SCOPE 030 / T001] BEGIN — Sample` / `END` markers; `taskfences` row inserted; result `{ filesWritten: ['new.ts'], ... }`. |
| Modify — existing file, < 80% diff | Same shape with `action: 'modify'` against a file with an existing fence; new body changes < 80% of lines | MODIFIED-BY line inserted under the original BEGIN; `taskfencemodifications` row written. Original ownership preserved. |
| Modify — existing file, ≥ 80% diff | Same shape but body changes ≥ 80% | Original fence replaced with `(replaces 015/T011)`; `taskfencehistory` records the replacement. |
| Delete — file with existing fences | `applyFenceWrite({ action: 'delete', filepath: 'old.ts', ... })` | File removed; `taskfencehistory` rows written; `taskfences` + `taskfencemodifications` rows deleted. |
| Delete — file does not exist | Same against `nonexistent.ts` | Throws `ImplementError(2, "cannot delete nonexistent.ts: file does not exist")` — preserves spec 031 FR-002. |
| Drift detected, no accept-drift | Modify against a file with hand-edited fenced body | Throws `ImplementError(1, "<path>: fence [SCOPE X / TY] modified out of band...")` — byte-identical to today's message. |
| Drift detected, --accept-drift | Same with `acceptDrift: true` | Write proceeds; `taskfencemodifications` row written with override annotation. |
| Dry-run | Same as create with `dryRun: true` | No FS or DB change; result `{ filesWritten: [], filesSkipped: ['new.ts'], ... }`. |
| DB-less mode | Same as create with `db` omitted | File created with fences; no DB rows; warning `"drift check skipped: no db provided"`. |

### Read path: reader API

| Scenario | Setup | Expected outcome |
|---|---|---|
| `getFencesForFile` | Project with 3 fences in `target.ts` | Returns array of 3 `FenceRecord`s. |
| `getFencesByOwner` with scope only | `getFencesByOwner(db, projectId, '030')` | Returns every fence owned by scope 030 across all files. |
| `getFencesByOwner` with scope + task | `getFencesByOwner(db, projectId, '030', 'T001')` | Returns only fences owned by 030/T001. |
| `getFenceHistory` | Project with prior replacements + deletions | Returns audit-trail records in chronological order. |
| `listAllFences` | Project with N total fences | Returns array of N `FenceRecord`s. |

### Cutover

| Scenario | Setup | Expected outcome |
|---|---|---|
| `implement.ts` per-file loop shrinks | Compare pre- and post-034 | Post-034 body is one `applyFenceWrite` call + a thin result-shape adapter (~15 LOC). |
| Existing test suite passes unchanged | 24 implement-command tests + 6 integration tests | All pass without modification (FR-010 byte-identical preservation). |

### Module-load drift assert

| Scenario | Setup | Expected outcome |
|---|---|---|
| Normal import | `import { applyFenceWrite } from '../../fencing/writer'` | Assert runs synchronously, passes silently. |
| Intentionally broken emitter | Test stub mutates the internal emitter; re-runs the assert | Throws with descriptive message. |

---

## New / Modified / Deleted Modules

| Path | Status | Notes |
|---|---|---|
| `wxkanban-agent/core/fencing/writer.ts` | **New** | `applyFenceWrite` (FR-002) |
| `wxkanban-agent/core/fencing/reader.ts` | **New** | Read-side API (FR-005) |
| `wxkanban-agent/core/fencing/internals/emitter.ts` | **New (relocated)** | Moved from `core/orchestrator/fence-emitter.ts` |
| `wxkanban-agent/core/fencing/internals/db.ts` | **New (relocated)** | Write-side from `core/orchestrator/fence-db.ts` |
| `wxkanban-agent/core/fencing/internals/drift.ts` | **New** | Extracted from `implement.ts` inline check (FR-003) |
| `wxkanban-agent/core/fencing/internals/hash.ts` | **New (relocated)** | Moved from `core/orchestrator/content-hash.ts` |
| `wxkanban-agent/core/fencing/drift-assert.ts` | **New** | Module-load round-trip check (FR-007) |
| `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` | **Modified** | Per-file loop collapses to single `applyFenceWrite` call (FR-008) |
| `wxkanban-agent/core/orchestrator/command-handlers/auditfences.ts` | **Modified** | Imports from `core/fencing/reader.ts` only |
| `wxkanban-agent/tests/unit/fencing/writer.test.ts` | **New** | Fixture-bundle end-to-end tests (FR-011) |
| `wxkanban-agent/tests/unit/fencing/emitter.test.ts` | **New** | Decision-table tests (FR-011) |
| `wxkanban-agent/tests/unit/fencing/reader.test.ts` | **New** | Read-surface tests (FR-011) |
| `wxkanban-agent/tests/unit/fencing/drift-assert.test.ts` | **New** | Drift-assert tests (FR-011) |
| `wxkanban-agent/tests/unit/fencing/fixtures/**` | **New** | Fixture directories |
| `wxkanban-agent/tests/unit/fencing/golden/**` | **New** | Golden outputs |
| `wxkanban-agent/core/orchestrator/fence-emitter.ts` | **Deleted** | Relocated to `core/fencing/internals/emitter.ts` |
| `wxkanban-agent/core/orchestrator/fence-db.ts` | **Deleted** | Split into `core/fencing/internals/db.ts` + `core/fencing/reader.ts` |
| `wxkanban-agent/core/orchestrator/content-hash.ts` | **Deleted** | Moved to `core/fencing/internals/hash.ts` |
| Old fence-emitter / fence-db test files (if standalone) | **Deleted or ported** | Behavior captured by new test files |
| `wxkanban-agent/package.json` | **Modified** | Version bump |
| `wxkanban-agent/CHANGELOG.md` | **Modified** | Version entry covering consolidation |
| `wxkanban-agent/docs/adr/0001-cross-surface-concerns-live-in-one-canonical-module.md` | **Modified (optional)** | Evidence section notes 034 as third concrete application |

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Behavior preservation byte-identical promise** (FR-010); subtle bugs could hide | Medium — cutover refactors implement.ts per-file loop significantly | Existing test suite acts as byte-identical witness: every test that passes today must pass post-cutover unchanged. Spec 031 batch-mode integration test in `tests/integration/implement-end-to-end.test.ts` is the strongest end-to-end check. Manual smoke of `implement 999/T901` against the fixture is the final gate. |
| **`auditfences` cutover risk** — if `auditfences.ts` is more entangled with `fence-db.ts`'s write paths than the spec assumes | Low to medium — depends on `auditfences.ts` current state | Quick code check at implementation start: grep `auditfences.ts` for write-side fence-db calls. If found, decide per case (move to reader OR rewrite to use read-only equivalents). |
| **DB-less mode silent skip changes** — today's `implement.ts` silently skips drift when `existingFences` is empty; FR-006 adds a warning | Low — warning is non-blocking | Warning is opt-in visibility, not behavior change. Can be downgraded to debug-level if consumers prefer silence. |
| **Strict deletion of fence-emitter / fence-db / content-hash** — if any external consumer imports these paths directly, deletion breaks them | Medium — within kit's source we control all imports, but downstream kit consumers might have unknown imports | Standard ADR-0001 pattern: consumers should never import kit internals. Document in CHANGELOG; surface in release notes. |
| **Refactor depth in `implement.ts`** — per-file loop changes from ~80 LOC to ~15 LOC | Low — the simplification is the point | Cutover is well-defined; existing test suite verifies behavioral equivalence. |
| **Spec 031 FR-004 deviation persists** — `taskfencehistory` lacks the `action` column | Low (acknowledged, out of scope) | Documented as out-of-band #1. A future small schema-change scope addresses it. |
| **Mixed test pattern adds more test infrastructure** | Low | Justified: fence-writing has both pure-logic and IO-heavy concerns. Pattern scales — new edge case is "add fixture + golden"; new MODIFY/REPLACE rule is "add table row." |

---

## Dependencies

| Spec | Why |
|---|---|
| **019 — agent-orchestrator-kit** | The kit being refactored. |
| **026 — CodeFencing** | The spec this refactor preserves byte-identical. |
| **030 — StageGateConsolidation** | First concrete ADR-0001 application; pattern established. |
| **031 — ImplementEnhancements** | Delete action is one operation `applyFenceWrite` consolidates. Batch mode enables cutover. |
| **032 — KitHousekeeping** | Track A's fence cleanup establishes the clean baseline 034's new files inherit. |
| **033 — SpecParserConsolidation** | Pattern twice-validated by the time 034 starts. 034 inherits test-pattern refinements. |

This spec is **a dependency of** the queued small schema-change scope for `taskfencehistory.action` column (out-of-band #1).

---

## Out-of-Band Issues to Track Separately

1. **`taskfencehistory.action` column** — spec 031 FR-004 deviation. A small dedicated schema scope adds `action varchar` with values `'delete'`, `'delete-with-drift'`, `'replace'`, `'modify'`. Could fold into 034 per implementer choice; deliberately separate to keep 034 schema-change-free.
2. **CI gate enforcing `auditfences --strict` + `npm run doc:check` + `npm run spec:check`** — the kit now has three validation gates; wiring them as required PR checks is a small follow-up.
3. **Spec 030 deferred FR-006 — topological dependency sort in `implement <scope>`.** Spec 033 populates `SpecTask.dependencies`; the small `handleImplementBatchCommand` upgrade remains.
4. **Other broken commands per Spec 019.** `buildscope --edit` and `createspecs` still pending.
5. **"Claude coworker" enhancement** — deferred from spec 031.
6. **MCP-side batch mode question** — deferred.
7. **The 7 architecture-review candidates not yet specced** — live outside the kit (wxKanban app code).

---

## Data Model

N/A. No new database tables or schema changes. Existing `taskfences`, `taskfencemodifications`, `taskfencehistory` tables consumed unchanged.

## Acceptance Criteria

See **FR-012**. The 11 numbered conditions there are the canonical acceptance gate.

## Out of Scope

See the **Scope Boundary (OUT)** row of the Core Design table in the Overview section, and the **Out-of-Band Issues to Track Separately** section above for explicit non-goals.
