# Tests: Spec Status Vocabulary (Spec 122)

## Why unit tests alone are not sufficient

The defect was a **legal write that rendered nowhere**. It typechecked, it passed every existing
test, the MCP returned success, and the row was correct in the database. Any test plan that only
asserts "the write succeeded" reproduces the blind spot rather than closing it. Every test below
asserts something about *what the board shows*, not about what was stored.

## Unit — column resolution (Vitest)

| ID | Test | Expected |
|---|---|---|
| U1 | `beta` resolves to a column | Phase 5 |
| U2 | `qa` resolves to a column | Phase 3 |
| U3 | `human_testing` resolves to a column | Phase 4 |
| U4 | App-side values still resolve (`beta_cleared`, `qa_passed`, `human_tested`, `deferred`) | unchanged from today |
| U5 | **An unknown status appears in exactly 1 column** | Deferred — never 0 |
| U6 | `archived` appears in 0 columns | hidden by explicit rule |
| U7 | U5 and U6 hold simultaneously | proves hidden-by-intent and vanished-by-accident are different code paths |

U5 is the important one. Assert the **count of columns containing the card is exactly 1**, not merely
that some column contains it — the original bug was a card in zero columns, and only a count catches
that class directly.

## Unit — write-side validation

| ID | Test | Expected |
|---|---|---|
| U8 | A bogus status is rejected by `update_spec_status` | error names the value |
| U9 | The error lists the valid set | caller can self-correct |
| U10 | Every valid vocabulary member is accepted | no false rejection |

## Guard — vocabulary parity

| ID | Test | Expected |
|---|---|---|
| U11 | Every `SpecStatusSchema` value resolves to a board outcome | build fails on divergence |
| U12 | The guard is observed failing before being trusted | add a value to one side, see red, revert |

U12 is a process requirement, not an assertion: a guard never seen failing is not known to work.

## Integration — the real board

| ID | Test | Expected |
|---|---|---|
| I1 | Load the reporting customer's project board | 9 of 9 scopes visible |
| I2 | The 8 `beta` scopes | all in Phase 5 |
| I3 | Their data after the fix | 0 writes — the fix is client-side rendering |
| I4 | Archive a scope, then toggle the reveal filter | scope is retrievable in 1 interaction |

## Audit — production data (read-only)

| ID | Check | Expected |
|---|---|---|
| A1 | Group `status` by project across all customers | 0 values outside the union of both vocabularies |
| A2 | The audit performs no writes | verified by inspection before running |

## Regression risk

The change is additive to a lookup map, so the main regression risk is an existing mapping being
altered while adding new ones. U4 exists specifically to catch that.
