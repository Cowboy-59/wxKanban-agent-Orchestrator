# wxCreateTestPlan — stack adapters

`SKILL.md` holds the **method**: the phases, the three signoff gates, both personas, the risk tiers
and caps, the item schema, and the guardrails. All of it is stack-neutral and none of it belongs
here.

An **adapter** holds the **machinery**: the concrete commands, file locations and substitutes that
make the method executable on one particular stack. Every fact lives in exactly one place — if a
command appears in `SKILL.md`, it does not appear in an adapter, and vice versa.

## Why this split exists

The skill was written against wxKanban's own stack and its machinery silently assumed it. Run on a
C#/.NET repository, the TypeScript extractor walked 316 `.cs` files, matched nothing, wrote a
valid-looking inventory of **zero units**, and exited 0. Phase 2 would then have produced a
confident, empty test plan — which is worse than an error, because it reads as a result.

Two things now prevent that: the scripts hard-stop on an unsupported tree (exit 3, naming what they
found), and the skill resolves an adapter before Phase 0 rather than assuming one.

## Available adapters

| Adapter | Stack | Status |
|---|---|---|
| [`wxkanban-express.md`](wxkanban-express.md) | TypeScript · Express · Drizzle · PostgreSQL · Vitest/supertest · Playwright | Reference implementation — wxKanban's own |
| [`dotnet-wpf.md`](dotnet-wpf.md) | C# · .NET 8 · WPF/MVVM · EF Core 8 · PostgreSQL · xUnit + FluentAssertions | Verified on an 18-surface audit, 2026-08-11 |

## Resolution

1. Read `stack.md` at the repo root. It is materialized by the kit from the project's Stack & Style
   document; do not hand-edit it (use `/buildstack`).
2. Match the declared stack to the table above and **announce the resolved adapter out loud**,
   before Phase 0 does anything else.
3. Read that adapter. Follow `SKILL.md` for what to do and the adapter for how to do it here.

**No `stack.md`, or a stack no adapter covers → stop and say so.** Do not run the TypeScript
extractor speculatively to "see what comes back"; a zero-unit inventory from the wrong stack is
indistinguishable from a codebase that genuinely has nothing in it. Offer the user three honest
options: write an adapter for this stack first, run the method by hand with substitutes agreed out
loud, or narrow the target to a subtree an existing adapter does cover.

## The adapter contract

Every adapter answers these six questions and nothing else. Anything that would be true on any
stack belongs in `SKILL.md`.

| § | Question | Feeds |
|---|---|---|
| **Inventory source** | What enumerates every callable unit here, and what does that command miss? | Phase 1 |
| **Schema source** | Where does the schema of record live, and what must it be reconciled against? | Phase 1B |
| **Harness** | How are units driven under test, the way production wires them? | Phase 3 |
| **UI driver** | What drives the running UI and captures evidence? | UI/UX coverage, walkthroughs |
| **DB posture** | Which connection is production, how is a non-prod target proven, what is the disposable option? | Phase 0 step 3 |
| **Test substitutes** | What stands in for the real database/clock/network, and **which constraints can it not enforce**? | Phase 2A risk register, `test-validity` |

The last one is the least obvious and the most valuable. A substitute that cannot enforce the
constraint under test makes every assertion about that constraint **unfailable** — the suite goes
green while testing nothing. Name those limits in the adapter so they land in the risk register at
Phase 2A instead of being discovered at Gate 2, or never.

## Adding an adapter

Copy the six headings, answer them with commands and paths that are real in that stack, and cite
where each claim was verified. Keep anecdotes only when they carry a reusable rule — the 53-vs-55
schema discrepancy in `dotnet-wpf.md` is there because it generalizes to every ORM-first stack, not
because it happened.

Then add a row to the table above, and — if a deterministic extractor exists for the stack — teach
the corresponding script to recognize it rather than hard-stopping. Until it does, the hard stop is
the correct behavior.
