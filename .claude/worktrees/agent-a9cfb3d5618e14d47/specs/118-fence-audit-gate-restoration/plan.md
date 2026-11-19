# Implementation Plan: Spec 118 — Fence Audit Gate Restoration

**Spec**: `specs/118-fence-audit-gate-restoration/spec.md`
**Phase**: implementation
**Priority**: high

## Approach

Four phases, ordered so the noise is removed before the backlog is judged. Measuring the real
backlog is impossible while 46.8% of findings come from code that was never in scope.

### Phase 1 — Correct the scanning boundary (T001–T002)

`auditfences-scanner.ts` walks the filesystem. `.agents/`, `.claude/` and `.history/` are all in
`.gitignore`, yet contribute 885 errors. Honour `.gitignore`, keeping `DEFAULT_IGNORE` as the floor.

T002 is the counterweight and is not optional. This change makes the gate **quieter**, and a gate
that goes quiet is far more dangerous than one that is noisy — a silent check reads as "clean."
The scanned-file count must be compared before and after, and any file leaving scope justified.

### Phase 2 — Separate the signal (T003–T004)

Two different findings are currently conflated:

- `UNFENCED_DECL` (~795) — genuine missing fences. Deferred as recorded debt.
- `UNKNOWN_TASK` (213) — fences citing unresolvable task IDs. **Broken references**, fixed by
  correcting the label or restoring the spec, not by adding a fence.

Baselining is a deliberate debt, not a fix. Its failure mode is amnesia, so FR-002 requires the
record be dated and queryable rather than a bag of hashes.

### Phase 3 — Prove and stage the gate (T005–T007)

T005 applies SCOPE-117's discipline: observe the gate **failing** on a real induced violation
before trusting it green.

T006–T007 implement the operator's decision to run non-blocking for one release — with the trigger
recorded. A warning-only gate has the same credibility problem this scope exists to fix; the only
difference is that it is deliberate and time-boxed. Without T007 it is not time-boxed.

### Phase 4 — Ship safely to consumers (T008–T009)

`auditfences-scanner.ts` ships to every consumer project. This is the highest-blast-radius part of
an otherwise small change.

## Key Technical Decisions

| Decision | Rationale |
| --- | --- |
| Honour `.gitignore`, not a directory list | Fixes the class. Second filesystem-vs-git defect here; kit sync was the first |
| Keep `DEFAULT_IGNORE` as a floor | Consumers without a `.gitignore` must behave exactly as before |
| Baseline the ~795 rather than fence them | Fencing ~200 files is enormous churn for no behavioural gain |
| Baseline records *what*, not just hashes | A hash suppresses; it cannot answer "what do we still owe?" |
| `UNKNOWN_TASK` demoted, not deleted | Different remedy from a missing fence; triage deferred, count preserved |
| Non-blocking for one release, with a trigger | Operator decision; the trigger is what stops it becoming permanent |

## Risks

| Risk | Mitigation |
| --- | --- |
| Gate goes quiet and reads as clean | T002 before/after file-count comparison |
| Consumer loses coverage of its own source | T008 verification against a real consumer |
| Baseline becomes amnesia; debt never repaid | FR-002 dated, queryable record with a count |
| "Advisory" becomes permanent | T007 named release boundary and review date |
| Gate trusted while never seen failing | T005 induced-violation proof |

## Dependencies

None blocking. Sibling of SCOPE-117, which delivered the `schema-drift` job currently masked by
this gate's red status.

## Out of Scope

The fencing convention itself (spec 026 stands); retro-fencing for tidiness; the `schema-drift`
job; Node 20 deprecation warnings; triage of the 213 broken references.
