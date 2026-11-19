# Quickstart: Onboarding Videos

**Spec**: SPEC-139 · **Scope**: SCOPE-139 · **Fence label**: `[SCOPE 139 / Tnnn]`

## Read first

1. `spec.md` — the approved requirements (FRs, scenarios, success criteria, constraints).
2. `plan.md` — build order, files touched, and the risks to respect.
3. `tasks.md` — one task per unit of work, each naming its FRs.
4. `tests.md` — how each success criterion is proven.

## Build

- Implement through the orchestrator: `/implement 139` (it writes the fences).
- Depends on: SCOPE-138 (lesson steps are the recording script; shared UAT/Production lists), and through it SCOPE-137 (Change Impact).

## Verify

- Every SC in `tests.md` passes, including the live checks marked **live**.
- `wxkanban-agent auditfences` is clean for the changed files.
