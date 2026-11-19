# Tests: Test Suite Lifecycle

**Spec**: 111 — Test Suite Lifecycle
**Scope**: SCOPE-111 (`specs/Project-Scope/111-test-suite-lifecycle.md`)
**Spec ID**: `f5552f9a-e581-46d1-8cdf-6e09569d1b22`
**Status**: planned
**Phase**: design
**Created**: 2026-07-25

---

This spec builds the testing subsystem, so its own test strategy has to avoid circularity: the
suite proving SCOPE-111 is written conventionally (Vitest + supertest + Playwright), not generated
by the feature under construction.

## What must be proved, and where

| Area | Level | The assertions that matter |
|---|---|---|
| Schema | unit | Naming rules hold; UUID v7 keys; the migration is additive and the scope-delete cascade plus the merge_scope reassignment still work against the extended `testplans`. |
| Force resolution | unit | `item.forcetest ?? plan.forcetest` across all four combinations, including an override that turns a forced item OFF. |
| Signoff / executor match | unit + integration | A human signoff on a machine item is refused; an AI signoff on a human item is refused; an AI signoff on an item whose run result was not a pass is refused. |
| Machine reset | integration | A machine signoff from cycle N does not satisfy the gate in cycle N+1 — and no sweep ran to make that true. |
| Human carry-forward | integration | A human signoff survives a new version untouched; the same signoff stops counting once an unanswered Retest mark exists; a dismissal restores it without creating a new signoff. |
| Impact analysis | unit + integration | Transitive reach marks a test whose subject is several imports from the change; an item with multiple subjects is marked when ANY subject is reached; the mark names which one. A request with no graph is refused; a commit mismatch is refused; a declared-broad analysis marks every human item. |
| Regression classification | unit | Baseline is the item's own last execution, not the previous cycle. An item unexercised for three cycles is judged against the run that last exercised it. Never-passed items never appear as regressions. |
| Gate | integration | Each of QA, User Testing and Release refuses with the right items named; non-forced items never block; a waiver satisfies the gate without reading as a pass. |
| Live run | integration + E2E | Starting a run returns the ordered list; the snapshot reflects the current item; a run without heartbeats reads as stalled, not running. |
| Tester flow | E2E (Playwright) | Criteria render; a fail without a reason is impossible; a fail creates a linked bug report; a tester-authored item is live immediately. |

## Explicit negative coverage

These are the failures the feature exists to prevent, so each gets a test that would catch its
absence:

1. A release promoted with a forced item unsigned.
2. A regression shipped because impact analysis under-marked and a stale human signoff stood.
3. A silently truncated dependent set accepted as complete.
4. A graph computed against a different commit applied without complaint.
5. An impact request with no graph read as "nothing was affected".
6. A test recorded as failed with no reason and no bug report.

## Safety

The crud tier must refuse to run without a verified non-production database. The local environment
points at production and the hosted orchestrator shares it, so this is asserted, not assumed.
