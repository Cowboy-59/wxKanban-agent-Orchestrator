# Implementation Plan: Per-Scope Stage Progression

## Read this first

**SCOPE-122 must land before this.** FR-009 consumes its unified vocabulary. Building 123 first means
wiring `specificationphases` while four vocabularies still disagree, creating the fifth surface FR-009
exists to prevent. Decided 2026-08-05, not a preference.

**Nothing here needs DDL.** Every table already exists in production. Given this database has no
migration ledger, six declared tables are already missing from prod, and `drizzle-kit push` is
prohibited against it, keeping this scope DDL-free is a deliberate risk reduction — do not "improve"
it by adding an index or column without a separate decision.

## Architecture

### The enabling insight

The design already exists in the schema. `specificationphases` models per-scope phase history
correctly and has never been written; `canTransition` encodes the legal transitions and is called by
nothing. This scope is **wiring, not invention** — which is why it carries no DDL and no new routes,
and why the risk is concentrated in the backfill rather than the mechanism.

### The gate

One change makes the rest follow: the policy layer resolves the phase of the *scope named by the
command* instead of the project. Because the CLI, the MCP surface and the Dev Cockpit all route
through `core/policy/`, fixing it there fixes all three without touching a single command.

`resolveCurrentPhase` is not deleted — display and rollup callers keep it. It simply stops being
consulted by any gate, and a test enforces that so the coupling cannot creep back.

### Where the advance fires

Task completion arrives through two doors: the app's own task service and the MCP
`project_update_task_status` tool. FR-003 must fire for both. Duplicating the trigger in each caller
guarantees divergence the first time one is edited, so it belongs at the layer both cross.
**Decided 2026-10-04: a shared service**, `wxkanban-agent/core/stage/`, bundled into both the
application (its esbuild build) and the MCP server (`postbuild`), with each surface injecting its
own test gate and stage-entry work. Not a database trigger: that would need DDL and would hide the
rule where tests cannot reach it.

## Sequencing

1. **T004 first** — verify `specificationphases`' column shape against production before building on
   it. `db:drift` is table-level and exits 0 while columns are missing; that is exactly how the
   `phaseid` 42703 errors went undetected.
2. **T003, T001, T002** — write the table, then move the gate. Writing first means the gate has real
   data to read the moment it switches.
3. **T005, T006** — the advance, governed by `canTransition` at runtime.
4. **T007, T008** — the messages. Independent of the above and safe to parallelise.
5. **T009, T010** — demote the project stage. After the gate has moved, not before.
6. **T011** — the backfill. Last, because it depends on the final shape of everything above.
7. **T012, T013, T014** — classification, vocabulary, regression suite.

## Key decisions already locked

- A stage belongs to a scope; each scope moves independently once its tasks complete; a project never
  stops a scope from moving. Stated by the product owner 2026-08-05.
- Scope-driven advance is the model, not a governance question — so no project-stage advance command
  is needed, because the project stage stops being a gate.
- `implement` does not and will not generate code. Two reports treat its silence as a defect; the
  remedy is the FR-004 message, not a generator.
- The backfill infers **conservatively**: ambiguous evidence lands in the earlier stage. Promoting
  generously would unlock commands for unfinished work, which is worse than the condition being fixed.

## Risks

**The backfill writes inferred data to customer databases.** Highest risk in the scope. Mitigations:
idempotent, conservative, derivation recorded for audit, and proven against a copy of a genuinely
affected project rather than a synthetic fixture.

**`phaseid` is tempting to drop and must not be.** Drizzle SELECTs every declared column; dropping one
the deployed code still declares takes production down — this codebase had that incident on
2026-07-28. Remove readers only; record the deferred drop in the schema change log.

**SCOPE-122 slipping.** If it does, this scope inherits the vocabulary mismatch rather than forking a
fifth. FR-009's last acceptance criterion covers that case explicitly.

**Regression into project-level gating.** The coupling is subtle and was the original design. T014's
assertion that no gate path calls `resolveCurrentPhase` is the guard.

## Delivery

Kit-side (`wxkanban-agent/`), so it reaches consumers only through a kit release — batched with
SCOPE-121 and SCOPE-124, not shipped alone. Target version 1.7.50.
