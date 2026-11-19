# Quickstart: Per-Scope Stage Progression

## Before you write a line of code

Read the scope document's Overview. Then read these three files, in this order — they are the whole
defect:

```
wxkanban-agent/core/policy/resolve-current-phase.ts    # reads projectphases, defaults to Design
wxkanban-agent/core/policy/adapters/cli-adapter.ts     # three refusal sites, lines ~117/183/198
wxkanban-agent/core/orchestrator/transitions.ts        # canTransition — dead code
```

## See it yourself (5 minutes)

**The gate is project-wide.** `cli-adapter.ts` and `policy.ts:64` both refuse based on a single
`stage` value resolved from the project:

```bash
grep -n "resolveCurrentPhase" wxkanban-agent/core/policy/adapters/*.ts wxkanban-agent/core/policy/*.ts
```

**`canTransition` is called by nothing.** Every hit outside its own definition is in a test:

```bash
grep -rn "canTransition" --include=*.ts wxkanban-agent/
```

**The right table has never been written.** Zero non-schema references:

```bash
grep -rln "specificationphases" --include=*.ts src/ mcp-server/src/ wxkanban-agent/
```

You should get exactly one file — `src/db/schema/specificationphase.ts` — which declares it. Nothing
writes it. The table exists in production.

## The trap that will cost you a day

`resolveCurrentPhase` **falls through to `LifecycleStage.Design`** when no `projectphases` row is
active. So a project with no phase row is indistinguishable from one genuinely in Design. When you are
debugging why something reports Design, check whether a row exists at all before assuming the value is
wrong.

Related: `db:drift` is **table-level only**. It exits 0 while declared *columns* are missing, which is
how the `phaseid` 42703 errors went undetected. Verify `specificationphases`' column shape directly
(T004) before building on it.

## Start here

**T004** — confirm the column shape against production. Then **T003** to write the table, then **T001**
to move the gate. The messages (T007, T008) are independent and can go in parallel.

Do not start with **T011**, the backfill. It depends on the final shape of everything else and it is
the one task that writes inferred data into customer databases.

## Ordering you cannot change

**SCOPE-122 lands first.** This scope consumes its unified vocabulary. If you find yourself inventing
a status mapping, stop — that is 122's job, and a fifth vocabulary is the thing FR-009 exists to
prevent.
