# Quickstart: Spec 120 — Pre-Test Gate

## The situation in one line

`implement` reports a scope done and hands you code nobody ran — and every piece needed to prevent
that already exists, wired deliberately not to fire.

## Confirm the gap

```bash
grep -n -A4 "Phase 5" .claude/commands/implement.md
```

Expected today — verbatim: *"advisory and non-blocking — implement is already reported done — and
runs in PLAN mode only (it does not `--Execute`)."*

## Confirm the machinery exists

```bash
ls _wxAI/skills/wxCreateTestPlan/scripts/clone-test-schema.mjs   # the clone engine
ls playwright.config.ts                                          # UI harness, already installed
find tests -name "*.test.ts" | wc -l                             # 115
ls tests/seeds 2>/dev/null || echo "0 seed fixtures"             # nothing to populate a clone with
ls tests/testplans/                                              # 1 filed plan, out of 94 scopes
```

## Reproduce the baseline

```bash
ls specs/Project-Scope/*.md | wc -l                  # 94 scopes
ls src/db/migrations/0059* src/db/migrations/0060*   # 2 migrations, apply-status unrecorded
```

Under SCOPE-117 schema changes are applied to production by hand with no ledger, and there is
nowhere to rehearse them — `DATABASE_URL` here is production and the hosted MCP shares the same RDS.

**Do not infer apply-status from git.** Those two files are untracked, and this scope's first draft
read that as "never applied." Both had in fact been applied to production on 2026-07-31. The only
reliable answer comes from executing them against a faithful clone:

```bash
node _wxAI/skills/wxPreTest/scripts/apply-ddl.mjs --schema wxktest_119_<id> --scope 119
# → 0 applied, 7 already present  ⇒ already live in production
```

## Try the clone engine by hand

Safe: it reads from `public` and writes only to a `wxktest_`-prefixed schema.

```bash
node _wxAI/skills/wxCreateTestPlan/scripts/clone-test-schema.mjs --list
node _wxAI/skills/wxCreateTestPlan/scripts/clone-test-schema.mjs --create
# → prints  {"schema":"wxktest_...","faithful":true,"tables":N,"foreignKeys":M}
node _wxAI/skills/wxCreateTestPlan/scripts/clone-test-schema.mjs --drop --name wxktest_<id>
```

`faithful: false` means the clone lost constraints and **must not** be tested against — it would
let tests pass that production rejects.

## What this scope adds

```
/preTest SCOPE-119
  ├─ delta      fences touched → FRs → items added / updated / proposed-retired   [approval gate]
  ├─ clone      wxktest_120_<run>, refused unless faithful
  ├─ safety     current_schema() is wxktest_*, canary invisible from public       [before any write]
  ├─ ddl        the scope's SQL, applied to the clone first (applied vs already-live)
  ├─ seed       tests/seeds/119-.../seed.ts — deterministic, composable
  ├─ smoke      app boots; touched routes non-5xx                                 [gate 1]
  ├─ drive      supertest CRUD + Playwright screen walk                           [gate 2]
  ├─ repair     ≤ 3 rounds, may fix app code, may never weaken an assertion
  └─ handoff    clone left standing + connection details                          [gate 3 = you]
```

`implement` then blocks on the result. `--skip-pretest` exists for an unreachable database and
records a visible waiver, so "not tested" is never mistaken for "passed."

## Where to start

T001–T003, in that order. T003 before any write task: production unreachability is proven, not
assumed, because `DATABASE_URL` on this machine is production.

## The one thing to keep hold of

The failure mode for this scope is not a broken gate — it is a gate that reports green while
proving nothing. That is why `tests.md` requires each safety property be observed **refusing**
before it is trusted to accept, and why T012 must ship with T011 rather than after it.
