---
name: wxPreTest
description: Verify one scope end to end before the operator sees it — clone the live schema into a disposable wxktest_ schema, apply the scope's pending DDL to the clone, seed it, boot the real app against it, drive every route and screen the scope touched, repair within a bounded loop that cannot weaken assertions, record signoff gates 1 and 2, and hand back a live environment. Use when implement finishes a scope, when re-verifying after a manual change, or whenever "does this actually work" needs a machine answer rather than thirty minutes by hand.
---

# wxPreTest — verify a scope before the operator sees it

## What this is for

`implement` reports done and hands over code nobody ran. Everything needed to prevent that already
existed — plan authoring, a clone engine, Playwright, 115 test files — wired deliberately not to
fire. This skill is the connection.

**It automates gates 1 and 2 of the existing three-gate signoff model.** Smoke and CRUD-and-execute
are machine work that was left manual. Final user verification is gate 3, belongs to the operator,
and is never self-certified here.

## The one thing to keep hold of

The failure mode for this skill is **not** a broken gate. It is a gate that reports green while
proving nothing. Every safety property below is therefore verified **fail-first** — observed
*refusing* before being trusted to accept. A quiet check reads as "clean," which is exactly the
pathology SCOPE-118 existed to correct in the fence auditor.

## Phase order

Run in this order. Phase 2 gates everything after it.

### Phase 0 — Delta (approval gate)

Resolve the fences the change touched → their tasks → their `FR-###` via the existing
`link_task_to_spec` chain. Classify each affected requirement:

- requirement touched, no filed items → **add**
- requirement touched, text changed since items were filed → **update**
- filed item whose requirement no longer appears in the spec → **propose retirement**

**Retirement is proposed only, never automatic.** Silently dropping coverage is how a suite rots
into green-but-meaningless. Present the delta and stop for approval before proceeding.

*(Phase 0 is delivered by T013–T014. Until then, run from the scope's existing test plan and say so
in the report rather than skipping silently.)*

### Phase 1 — Stand up the disposable target (SCOPE-127 / FR-003)

**Resolve the adapter first. It decides the posture; this phase decides what happens on it.**

```bash
node _wxAI/adapters/resolve-adapter.mjs --json
```

Announce the resolved adapter before touching anything. Non-zero means no adapter covers this
stack — stop and say so. Do not clone speculatively: a target built for the wrong stack is worse
than no target, because the run that follows it reports results.

Read the adapter's **Disposable target** answer. It names the posture and the exact commands. Three
postures are supported and an adapter answers with exactly one:

| Posture | The disposable target is |
|---|---|
| **schema** | A clone inside the same database instance |
| **file** | A database file created for this run |
| **container** | A database container started for this run |

Run the adapter's stated creation command. Whatever the posture, two properties are required and
the adapter says how each is proven here:

- **Faithful** — the target's structure matches what production would enforce. A target that
  quietly lost constraints lets a test pass that production would reject, so where the adapter
  names a faithfulness check it is **blocking, not advisory**.
- **Disposable** — this run created it and this run may destroy it. A pre-existing target is not
  proof of anything.

### Phase 2 — Isolation proof (before any write)

Run the adapter's stated isolation command and treat its assertions as blocking.

The assertions differ by posture and the adapter names them, because the same check does not
transfer. A schema-prefix assertion is meaningful when the disposable target shares an instance
with production and meaningless when it does not; on a container posture the equivalent guarantee
is that the host and port differ from the production connection **and** that this run created the
target.

**No write of any kind happens before this proof passes.** That ordering is the whole guarantee —
a proof taken afterwards documents what already happened rather than preventing it.

### Phase 3 — Pending DDL

```bash
node _wxAI/skills/wxPreTest/scripts/apply-ddl.mjs --schema wxktest_119_xxxx --scope 119
```

Applies the scope's reviewed-but-unapplied SQL to the clone and reports per-statement results.

**Any DDL may be run freely inside a `wxktest_` schema — no per-statement approval.** The boundary
is the schema prefix, not the statement. Nothing outside that prefix may be touched.

This is the phase with the largest sleeper value. Under SCOPE-117 schema changes are hand-applied
to production with no migration ledger, and there is currently nowhere to rehearse them — which is
why `42P01` production 500s keep recurring. This gives that DDL somewhere to fail harmlessly.

### Phase 4 — Seed

Run `tests/seeds/<NNN-name>/seed.ts` against the clone. Seeds are deterministic, so screens are
reproducible and assertions can name known rows, and **composable** — a scope needing a company and
a consultant user imports the seed that already establishes them rather than re-authoring the
world. Without composition, per-scope fixtures drift apart.

### Phase 5 — Smoke (gate 1)

Boot the real application against the clone via `search_path`. Assert every route the scope's
fences touched returns non-5xx, and every UI route the scope added renders without crashing.

### Phase 6 — Drive (gate 2)

- **Routes** — real create→read→update→delete per `FR-###` via supertest against `createApp()`,
  with genuine JWTs from `signToken`. Routes mount under `/api`.
- **Screens** — Playwright: page-to-page navigation *and back*, guarded-route redirect *and return*,
  deep-link, refresh, and each interactive element.

This makes the standing "endpoint test every feature change" rule automatic rather than remembered.

### Phase 7 — Repair (bounded)

On red: diagnose, fix, re-run **only the affected items**. **At most three rounds.** Application
code may be corrected.

**An assertion may never be weakened to produce green.** A test lowered to pass converts a known
defect into a false guarantee — strictly worse than the red it replaced. The loop's cheapest path
to green is exactly this, so the prohibition is structural: such an edit is refused and reported as
a finding. After the cap, report red with every repair attempted.

### Phase 8 — Handoff

On green: record signoff gates 1 and 2 in the wxKanban DB, leave gate 3 filed pending, and **leave
the clone standing** with connection details printed. The point of the gate is that the operator
opens the application and looks at real screens holding known data — tearing down on success would
defeat it. Teardown is explicit; the next run for the scope drops its predecessor.

## Result contract

Exactly one of three, never ambiguous:

| Result | Meaning |
| --- | --- |
| **green** | Gates 1–2 passed and recorded; clone live; gate 3 pending for the operator |
| **red** | What failed plus every repair attempted; clone left standing for inspection |
| **refused** | A safety precondition did not hold; nothing written; the failed check named |

## Scripts

| Script | Phase | Task |
| --- | --- | --- |
| `scripts/clone-guard.mjs` | 1, 2, 8 | T002, T003, T008 |
| `scripts/apply-ddl.mjs` | 3 | T004 |
| `scripts/smoke.mjs` | 5 | T007 |
| `wxCreateTestPlan/scripts/clone-test-schema.mjs` | 1 (invoked) | SCOPE-111 Amendment B |

## Never

- Never write to `public`, and never assume isolation without Phase 2 having asserted it this run.
- Never proceed past an unfaithful clone.
- Never weaken an assertion to reach green.
- Never delete a test item — retirement is proposed and approved.
- Never self-certify gate 3.
- Never run git.
