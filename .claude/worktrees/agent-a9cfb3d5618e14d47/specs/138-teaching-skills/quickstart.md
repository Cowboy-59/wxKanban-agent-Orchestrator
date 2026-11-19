# Quickstart: Teaching Skills

**Spec**: SPEC-138 · **Scope**: SCOPE-138 · **Fence label**: `[SCOPE 138 / Tnnn]`

## Read first

1. `spec.md` — the approved requirements (FRs, scenarios, success criteria, constraints).
2. `plan.md` — build order, files touched, and the risks to respect.
3. `tasks.md` — one task per unit of work, each naming its FRs.
4. `tests.md` — how each success criterion is proven.

## Build

- Implement through the orchestrator: `/implement 138` (it writes the fences).
- Depends on: SCOPE-137 (Change Impact — precise staleness for FR-006; ships before or with this spec).

## Verify

- Every SC in `tests.md` passes, including the live checks marked **live**.
- `wxkanban-agent auditfences` is clean for the changed files.
