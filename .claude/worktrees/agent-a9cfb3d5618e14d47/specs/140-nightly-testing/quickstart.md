# Quickstart: Nightly Testing

**Spec**: SPEC-140 · **Scope**: SCOPE-140 · **Fence label**: `[SCOPE 140 / Tnnn]`

## Read first

1. `spec.md` — the approved requirements (FRs, scenarios, success criteria, constraints).
2. `plan.md` — build order, files touched, and the risks to respect.
3. `tasks.md` — one task per unit of work, each naming its FRs.
4. `tests.md` — how each success criterion is proven.

## Build

- Implement through the orchestrator: `/implement 140` (it writes the fences).
- Depends on: SCOPE-137 (Change Impact — impact-first selection and the CC8.1 change log).

## Verify

- Every SC in `tests.md` passes, including the live checks marked **live**.
- `wxkanban-agent auditfences` is clean for the changed files.
