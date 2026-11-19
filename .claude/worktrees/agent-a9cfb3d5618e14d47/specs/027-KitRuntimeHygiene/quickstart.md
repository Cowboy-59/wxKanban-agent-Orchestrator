# Quickstart: Kit Runtime Hygiene — Port Autoselect & Parent-Process Cleanup

**Spec Number**: 027

## Setup

1. Review the spec: `specs/027-KitRuntimeHygiene/spec.md`
2. Review the plan: `plan.md`
3. Review tasks: `tasks.md`
4. Confirm dependencies: spec 019 (orchestrator kit) and spec 026 (code fencing) are both shipped.

## Development

1. Pick the lowest-numbered open task from `tasks.md`. Tasks must be completed in dependency order (see `plan.md`).
2. Run the task through the orchestrator:

       wxkanban-agent implement 027/T<nnn>

   This will fence every new module under `[SCOPE 027 / T<nnn>]` (spec 026 dogfood).
3. After Phase 3 (T007/T008) is done, restart the kit to exercise the new behavior:

       npm run kit:stop
       npm run kit:start
       npm run kit:status

4. Run the affected test layer:

       npm run test                  # Vitest unit + integration

5. Mark the task done — `implement` does this automatically on exit 0.

## Verification

1. Run `wxkanban-agent auditfences --strict` to confirm every new module is fenced.
2. Run the QT-1 through QT-7 integration tests (T028–T032).
3. Confirm all ten acceptance criteria (A-1 through A-10) in `spec.md` pass.
4. Confirm `kit:status` reports green on a live session.

## Dogfood Check (after Phase 6 release)

After T027 bumps to v0.3.0, run the kit against itself:

1. **Port autoselect**: in one terminal, bind port 3002 with `nc -l 3002` (or any quick server). In another, run `npm run kit:start`. MCP should autoselect to 3003+ and log the chosen port.
2. **Parent watcher**: with the kit running, close the VS Code window (or kill the integrated terminal). Within ~7 seconds the MCP and gateway processes should disappear and `.wxai/kit-runtime.json` should be deleted.
3. **kit:status**: with the kit running, `npm run kit:status` should report both services green.

## Integration Test Scenarios (from spec.md)

| ID | Scenario | Covering Task |
|----|----------|---------------|
| QT-1 | Clean startup writes runtime-state file with default ports | T028 |
| QT-2 | Port autoselect resolves a conflict and records the actual port | T028 |
| QT-3 | Port exhaustion produces the documented diagnostic, exits 1 | T029 |
| QT-4 | Parent-death watcher triggers graceful shutdown within 7s of parent exit | T030 |
| QT-5 | Parent SIGKILL produces identical behavior | T030 |
| QT-6 | `kit:status` reports per-service liveness with correct exit codes | T031 |
| QT-7 | Two concurrent kit instances in separate repos coexist without state collision | T032 |
