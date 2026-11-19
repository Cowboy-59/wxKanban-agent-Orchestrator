# Quickstart: Change Impact Check

**Spec**: SPEC-137 · **Scope**: SCOPE-137 · **Fence label**: `[SCOPE 137 / Tnnn]`

## Read first

1. `spec.md` — the approved requirements (FRs, scenarios, success criteria, constraints).
2. `plan.md` — build order, files touched, and the risks to respect.
3. `tasks.md` — one task per unit of work, each naming its FRs.
4. `tests.md` — how each success criterion is proven.

## Build

- Implement through the orchestrator: `/implement 137` (it writes the fences).
- Depends on: SCOPE-026 (fences), SCOPE-058 (Cockpit badges), SCOPE-073 (scope dependencies, save watcher), SCOPE-111 (impact graph), SCOPE-127 (stack adapters).

## Verify

- Every SC in `tests.md` passes, including the live checks marked **live**.
- `wxkanban-agent auditfences` is clean for the changed files.
