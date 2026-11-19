# Test Plan: Per-Scope Stage Progression

The defining assertion of this scope is **independence**: two scopes in one project, at different
stages, both working. Almost every test below is a variation on it.

## Fixture: a two-scope project

A project with SCOPE-A (tasks complete, Implementation) and SCOPE-B (being specified, Design). Built
from real shapes, not hand-set phase rows — the fixture must be reachable by the same code path a
customer would take, or it proves nothing about the customer's case.

## Unit — the gate resolves per scope (T001, T002)

- A command against SCOPE-A in Implementation is permitted while SCOPE-B sits in Design
- The same command against SCOPE-B is refused, in the same session, without either scope changing
- **No gate path calls `resolveCurrentPhase`** — asserted structurally, not behaviourally, so the
  coupling cannot creep back in a later edit. This is the regression guard for the whole scope.
- The MCP adapter (`mcp-adapter.ts:149`) reaches the same verdict as the CLI adapter for identical
  input

## Unit — `specificationphases` invariants (T003)

- Entering a stage writes exactly one open row
- Leaving sets `exitedat` on the prior row **before** opening the next — a scope never holds two open
  rows, asserted after a full six-stage traversal
- A scope with no open row reads as Design
- History for a scope reconstructs its path in order

## Unit — the advance (T005, T006)

- Closing the last open task advances that scope one stage and records the transition as an event
- Closing a non-final task advances nothing
- Sibling scopes are unchanged, verified by re-reading **each sibling's open row** rather than
  trusting that nothing was written
- A transition `canTransition` rejects is refused and the reason recorded
- The runtime path is exercised — `transitions.test.ts` alone is what let this module sit dead

## Unit — the messages (T007, T008)

- A stage denial contains the scope identifier, its stage, the required stage, and the remaining-task
  count
- It never names a stage that describes no scope in the project
- An unregistered command yields an unrecognised-command error naming **no stage**
- **The two strings are asserted unequal.** This is the specific failure being repeated: the
  byte-identical rejection caused `kit:configure` to be filed, triaged and amended as a stage-gate
  defect when the command had never been registered
- Both `cli-adapter.ts` refusal sites and the `policy.ts` equivalent are covered

## Integration — backfill against real data (T011)

Run against a **copy of a genuinely affected project**, not a synthetic fixture. Project `947a5614`
is the reference case: scopes and completed tasks, zero `specificationphases` rows, no active
`projectphases` row.

- Every scope resolves to a sensible stage with no manual intervention
- A scope whose work has genuinely not started derives as **Design** — the conservative direction
- Ambiguous evidence resolves to the earlier stage and the reason is recorded
- Running the backfill twice changes nothing the second time

## Regression guards (CI)

- The structural assertion that no gate reads `resolveCurrentPhase` or `projectphases`
- Every command is classified scoped or unscoped; an unclassified command **fails the build** rather
  than defaulting silently (T012)
- An unrecognised vocabulary value is rejected at the boundary, never coerced (T013)

## Not covered, deliberately

The dashboard advance/reopen UI — it works, and its June 500 is already fixed. Re-test it manually
against current production before repeating the reporters' claim that it does nothing; do not rebuild
it.
