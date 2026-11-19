# Quickstart: Spec 117 — Production Schema Integrity

## Read this first

**The local `.env` `DATABASE_URL` points at PRODUCTION**, and `drizzle.config.ts` reads it. Any
`drizzle-kit` command you run from this working tree acts on the live database immediately. Verify
the target before every invocation.

**`drizzle-kit push` is prohibited on this spec.** It reconciles the database *to* the declared
schema and would propose dropping all 27 orphan tables — including `marketingcontacts`, which holds
1,006 rows of live marketing contacts.

## Reproduce the defects

Both are reproducible against production, read-only:

```sql
-- FR-001: the missing table (expect 42P01)
select 1 from complianceflags limit 1;

-- FR-002: the sentinel leak (expect 22P02)
select 1 from projecttimeentries where projectid = 'all' limit 1;
```

## Current state (captured 2026-07-30)

| Metric | Value |
| --- | --- |
| Production tables | 125 |
| Declared in `src/db/schema/` | 101 |
| Declared in `mcp-server/src/db/schema.ts` | 20 |
| Declared but missing from production | 6 |
| Orphan (declared by neither) | 27 |
| `marketingcontacts` rows | 1,006 |
| `capabilityindex` rows | 4,002 |
| Migration ledger | **none** |

## The 6 missing tables

`complianceflags`, `gitcommandlogs`, `gitcommandstats`, `mcpdriftevents`, `mcpparityconfig`,
`mcpupdateadoptions`

Only `complianceflags` is currently reachable — it is queried by `consultantHub.ts`, registered at
`app.ts:177`. The other five sit behind routes registered only in `index2.ts`, the dead entrypoint.

## Where the code lives

| Concern | Path |
| --- | --- |
| App schema | `src/db/schema/` |
| MCP schema | `mcp-server/src/db/schema.ts` |
| App migrations | `src/db/migrations` (per `drizzle.config.ts`) |
| MCP migrations | `mcp-server/migrations` — **not interchangeable** |
| Sentinel bug | `src/server/routes/consultantHub.ts` line 606 (correct guard at line 141) |
| Logger | `src/server/lib/logger.ts` — no serializers configured |
| Drift detector (to build) | alongside `auditfences` in `wxkanban-agent` |

## Gotchas

- **"Undeclared" does not mean unused.** `capabilityindex` and `events` are MCP-declared and live;
  `marketingcontacts` is declared nowhere and is live. A detector reading only the app schema
  produces false positives on the first two and misses the risk on the third.
- **Near-miss names.** `userprofile` is an orphan; `userprofiles` (plural) is MCP-declared, live,
  and backs authentication. `profile` and `settings` are similarly near-misses.
- **`npm run db:generate` does not exist** despite CLAUDE.md documenting it. T006 adds it.
- **Drizzle SELECTs every declared column**, so column drops need the 3-deploy sequence. This spec
  is additive, so it does not apply here — but it applies to any follow-up.

## Order of work

Follow `tasks.md` phases in order. T010 (rehearse the ledger on a restored copy) is a hard gate
before T011 touches production.
