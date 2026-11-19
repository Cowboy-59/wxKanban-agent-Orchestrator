# Implementation Plan: Spec 117 — Production Schema Integrity

**Spec**: `specs/117-production-schema-integrity/spec.md`
**Phase**: implementation
**Priority**: critical

## Approach

Four sequential phases, ordered by risk rather than by requirement number. Phase 1 restores
customer-facing service and is independently shippable. Phases 2–4 remove the cause and are gated
behind a rehearsal, because the baseline step points schema tooling at a production database that
contains the marketing list and the capability index.

### Phase 1 — Restore service (T001–T005)

Pure application code. No DDL, no production database interaction. Fixes the two confirmed defects
(`42P01` from the missing table is not fixed here — only the sentinel `22P02` is) and restores the
diagnostic signal so the remaining work is observable.

Deliverables: renamed declarations, boundary validation on `projectid`, `error.cause` preserved in
DB error paths, `marketingcontacts` declared.

### Phase 2 — Tooling and detection (T006–T008)

Build the detector before using it. `auditfences --schema` must read both `src/db/schema/` and
`mcp-server/src/db/schema.ts`; a detector that reads only the app schema reports `capabilityindex`
(4,002 rows) and `events` (2,625 rows) as drift, which is a false positive that would erode trust
in the gate immediately.

T008 is a hard gate: the detector must be observed **failing** against real production state,
naming all 6 tables, before it is trusted. This is the only opportunity to validate it against a
known-bad environment — after Phase 3 that state no longer exists.

### Phase 3 — Ledger and tables (T009–T014)

The risk concentration. Sequence is strict:

1. **T009 snapshot first.** 125 tables, `marketingcontacts` 1,006, `capabilityindex` 4,002. Without
   this, "no data loss" is an assertion rather than a measurement.
2. **T010 rehearse on a restored copy.** Establish the ledger against non-production and confirm
   zero DROP/ALTER and 27 orphan tables intact.
3. **T011–T013 production.** Ledger, then generated migration, then apply, then verify 131 tables
   and unchanged row counts.

`drizzle-kit push` is prohibited throughout. It reconciles the database *to* the declared schema
and would propose dropping all 27 orphan tables. The local `.env` `DATABASE_URL` points at
production and `drizzle.config.ts` reads it, so the target must be verified before every command.

### Phase 4 — Gate and verify (T015–T018)

Close the loop: detector passes, CI blocks on divergence (proved with a deliberate failure), the
error signal is confirmed end to end, and a 7-day observation window confirms the error class is
gone rather than merely quiet.

## Key Technical Decisions

| Decision | Rationale |
| --- | --- |
| Flag on `auditfences`, not a new `auditschema` command | Reuses an established declared-vs-actual pattern with an existing `--strict` CI mode; no new mechanism to learn |
| CI gate only, no pre-push hook | Avoids adding latency to every push; the pre-push hook already runs the version bump |
| Rename underscore tables before creation | These tables do not yet exist in production; renaming later costs a migration and a deploy |
| Declare `marketingcontacts`, don't drop anything | Declaration is additive and protects 1,006 live rows from reconcile-to-declared tooling |
| Single spec, phased tasks — not a spec fan-out | The work is cohesive; risk sequencing is handled by task order, keeping 1:1 traceability to the scope |

## Risks

| Risk | Mitigation |
| --- | --- |
| A `drizzle-kit` command run against production by reflex | C-1 stated in scope; target verification is a checklist gate on every invocation |
| `push` proposing 27 table drops incl. the marketing list | C-2 prohibits `push`; migration-based application only |
| Baseline claiming sync while diverging | SC-4 requires a fresh `db:generate` to produce an empty diff |
| Detector trusted without ever having failed | T008 requires observing a real failure first |
| Silent data loss during Phase 3 | T009 snapshot + T013 verification of exact counts |

## Dependencies

None blocking. Orphan-table cleanup (26 tables) is deferred behind the PPE conversion and is not
part of this spec.

## Out of Scope

CloudFront access logging and alarm tuning; RDS single-AZ / cross-region topology; dropping any
orphan table; retro-fixing all 233 `error.message`-only log sites; a guaranteed fix for the two
unexplained timer failures.
