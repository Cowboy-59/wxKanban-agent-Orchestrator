---
description: Verify a scope before the operator ever sees it — clone the schema, apply the scope's pending DDL to the clone, seed it, boot the real app, drive every route and screen the scope touched, repair within a bounded loop, and hand back a live environment. Blocks implement until green.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# preTest — verify a scope before it reaches the operator

## Purpose

`implement` used to report a scope done and hand over code nobody had run. `preTest` closes that
gap: it stands up a disposable clone of the live schema, applies the scope's pending DDL **to the
clone first**, seeds it, boots the real application against it, drives every route and screen the
scope touched, repairs what it can within a bounded loop, and only then hands over.

This is **not a new gate model.** `wxCreateTestPlan` already defines three signoffs — smoke, CRUD &
execute, and final user verification. Gates 1 and 2 are machine work that was left manual. `preTest`
runs them. **Gate 3 remains the operator's** and is never self-certified.

This command **loads and runs the `wxPreTest` skill** (`_wxAI/skills/wxPreTest/SKILL.md`), which
carries the phase order, the safety invariants, the repair-loop rules, and the handoff contract.

## Usage

```bash
/preTest SCOPE-119            # verify one scope end to end
/preTest SCOPE-119 --dry-run  # plan the run; create nothing
/preTest --list               # enumerate any wxktest_ clones present
/preTest --teardown           # drop this scope's clone
```

`preTest` is **independently runnable** by design. The working cycle is: look at the running app,
change something, re-verify — and that cycle must not cost a full re-implement.

## Phases

| Phase | What it does | Task |
| --- | --- | --- |
| 0 · Delta | Touched fences → FRs → items added / updated / proposed-retired. **Approval gate.** | T013, T014 |
| 1 · Clone | `wxktest_<scope>_<run>`, **refused unless faithful** (table + FK counts match source) | T002 |
| 2 · Isolation | `current_schema()` is `wxktest_*`; canary invisible from `public`. **Before any write.** | T003 |
| 3 · DDL | The scope's reviewed-but-unapplied SQL, applied to the clone | T004 |
| 4 · Seed | `tests/seeds/<NNN-name>/seed.ts` — deterministic, composable | T005 |
| 5 · Smoke | App boots; every touched route non-5xx; new UI routes render | T007 |
| 6 · Drive | supertest CRUD per FR + Playwright screen walk | T009, T010 |
| 7 · Repair | ≤ 3 rounds; may fix app code; **may never weaken an assertion** | T011, T012 |
| 8 · Handoff | Clone left standing + connection details; gates 1–2 recorded | T008, T015 |

## Result contract

Exactly one of three outcomes, never ambiguous:

- **green** — gates 1 and 2 passed and recorded; clone left live with connection details; gate 3
  filed pending for the operator.
- **red** — what failed, and every repair attempted. The clone is left standing for inspection.
- **refused** — a safety precondition did not hold. Nothing was written. The reason names the
  specific check.

## Safety

- **`DATABASE_URL` on this machine is production.** Isolation is proven per run, not assumed:
  `current_schema()` must resolve to a `wxktest_` prefix, and a canary object must be confirmed
  invisible from `public`, before anything else is written.
- **Any DDL may be run freely inside a `wxktest_` schema.** The boundary is the schema prefix, not
  the statement. Nothing outside that prefix may be touched.
- **A clone that is not faithful is refused.** `CREATE TABLE (LIKE … INCLUDING ALL)` drops foreign
  keys; they are reflected back in a second pass and counted. A clone missing constraints would let
  a test pass that production rejects — worse than no clone, because it manufactures confidence.
- **The repair loop may never weaken an assertion.** A test lowered to pass converts a known defect
  into a false guarantee. Such an edit is refused and reported as a finding.
- Does not run git. Does not push. Does not touch `public`.

## Exit conditions

**green** — gates 1 and 2 recorded in wxKanban, gate 3 filed pending, clone live and named.
**red** — failures and attempted repairs reported; clone left standing for inspection.
**refused** — the failed precondition named; no clone, no writes.

## Context

{{args}}
