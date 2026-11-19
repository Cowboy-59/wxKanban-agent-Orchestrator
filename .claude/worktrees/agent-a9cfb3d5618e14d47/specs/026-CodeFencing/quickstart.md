# Quickstart: Code Fencing — Spec/Task Traceability Markers

**Spec Number**: 026

## Setup

1. Review the spec: `specs/026-CodeFencing/spec.md`
2. Review the plan: `plan.md`
3. Review tasks: `tasks.md`
4. Confirm dependencies: spec 019 (orchestrator kit) is shipped and the CLI gateway is running.

## Development

1. Pick the lowest-numbered open task from `tasks.md`. Tasks must be completed in dependency order — Phase 1 before Phase 2, etc. (see `plan.md` for the dependency graph).
2. Run the task through the orchestrator:

       wxkanban-agent implement 026/T<nnn>

   This will be self-hosting after T014 registers the command. Until then (T001–T013) use the direct-import wrapper noted in project memory `feedback_orchestrator_cli_broken.md`.
3. Verify the produced code is fenced (Phase 2 onward, once fence-emitter exists):

       wxkanban-agent auditfences --path src/

   Expect clean output (exit 0) for any task that wrote production code.
4. Run the relevant test layer:

       npm run test         # Vitest unit tests for the fence-emitter and command handlers
       npm run test:e2e     # Playwright for any UI surfaces (none expected in 026)

5. Mark the task done — this happens automatically when `implement` exits 0 (T013).

## Dogfood Check (after Phase 6)

The point of this spec is that every line of code produced by `implement` is traceable back to its task. To confirm the spec works **on its own deliverables**:

1. After T032 ships the kit at v0.2.0, run:

       wxkanban-agent auditfences --path wxkanban-agent/core/orchestrator/

2. Verify that every function in `fence-emitter.ts`, `implement.ts`, `auditfences.ts`, `declaration-detector.ts`, and `language-matrix.ts` is fenced with a `[SCOPE 026 / T<nnn>]` marker.
3. Run `wxkanban-agent auditfences --history 026/T006` — should print the timeline of every fence ever owned by T006 (the fence-emitter core task).

If any spec 026 code is itself un-fenced, the spec has failed A-10 (dogfood) and must not be marked Released.

## Verification

1. Run `/scope-validate 026` to check spec quality.
2. Run all six QT integration tests (T036–T041) — every one must pass.
3. Confirm all ten acceptance criteria (A-1 through A-10) in `spec.md` pass.
4. Confirm `lifecycle.json` reflects current phase and progress.

## Integration Test Scenarios (from spec.md)

| ID | Scenario | Covering Task |
|----|----------|---------------|
| QT-1 | Fresh-write fence emission across every FR-005 language | T036 |
| QT-2 | MODIFIED-BY insertion, stack ordering, 5-line warning | T037 |
| QT-3 | Full-replacement detection at 80%, with `--replace` / `--modify` overrides | T038 |
| QT-4 | `auditfences` exit codes + JSON output schema + CI gating | T039 |
| QT-5 | Drift detection + `--accept-drift` logging | T040 |
| QT-6 | Idempotent re-run of `implement` (FR-009) | T041 |
