# Tasks: Spec 117 — Production Schema Integrity

**Spec**: `specs/117-production-schema-integrity/spec.md`
**Scope**: `specs/Project-Scope/117-schema-integrity-eliminate-schema-drift.md`
**Total**: 18 tasks

> Ordering is deliberate. Phase 1 restores service and is shippable on its own. Phase 3 touches
> production DDL and is gated on the Phase 3 rehearsal passing first.

---

## Phase 1 — Restore service (shippable independently)

- [ ] **T001** — Rename `gitcommandlogs` / `gitcommandstats` declarations before creation *(FR-001, high)*
  Rename the `git_command_logs` / `git_command_stats` pgTable declarations in
  `src/db/schema/gitCommands.ts` and update `GitCommandMonitor`. These tables do not yet exist in
  production, so this is the last opportunity to fix the underscore convention violation without a
  migration.

- [ ] **T002** — Reject the `all` sentinel at the invoice-preview request boundary *(FR-002, critical)*
  `consultantHub.ts` line 606 admits any non-empty string as `projectid`, so the `"all"` sentinel
  reaches a UUID column and throws `22P02`. Parse through a boundary schema: treat `"all"` as
  no-filter (matching the guard at line 141), return 400 on malformed input.

- [ ] **T003** — Audit all routes accepting `projectid` for the same sentinel leak *(FR-002, high)*
  The one-line fix leaves the identical bug latent on every other route taking a `projectid`
  parameter. Enumerate and apply the same boundary parsing.

- [ ] **T004** — Preserve `error.cause` in database error logging paths *(FR-003, critical)*
  Drizzle 0.45 wraps the real `PostgresError` in `error.cause`; the ~233 sites logging only
  `error.message` discard the code and detail, and Pino has no serializers. Scope to DB error
  paths, not all 233 sites. Keep output valid single-line JSON; expose no secrets or PII-bearing
  bound parameters.

- [ ] **T005** — Declare `marketingcontacts` in the app schema *(FR-006, high)*
  1,006 live rows used via raw SQL in `NewsletterSendService` and marketing routes, declared
  nowhere. While undeclared, any reconcile-to-declared operation treats it as deletable. Additive;
  changes no data.

## Phase 2 — Tooling and detection

- [ ] **T006** — Add `db:generate` / `db:migrate` scripts and reconcile CLAUDE.md *(FR-007, high)*
  CLAUDE.md documents `npm run db:generate` but `package.json` has no `db:*` scripts at all — the
  documented workflow was never executable, which is a root cause of the drift. Target
  `src/db/migrations` explicitly so it cannot be confused with `mcp-server/migrations`.

- [ ] **T007** — Implement `auditfences --schema` drift detection *(FR-005, high)*
  Compare declared pgTable definitions against deployed `information_schema`. Must read **both**
  `src/db/schema/` and `mcp-server/src/db/schema.ts`, or MCP-owned tables like `capabilityindex`
  and `events` register as false positives. Orphans are informational only. Non-zero exit on
  divergence.

- [ ] **T008** — Prove the detector fails before it passes *(FR-005 / SC-3, high)*
  Run against current production **before** remediation; confirm non-zero exit naming all 6 missing
  tables. Capture output as evidence. A detector only ever observed passing is unproven.

## Phase 3 — Ledger and tables (production DDL — gated)

- [ ] **T009** — Capture pre-change production baseline snapshot *(FR-004 / SC-5, critical)*
  Record before any DDL: 125 tables, `marketingcontacts` 1,006 rows, `capabilityindex` 4,002 rows.
  This is the evidence that the work was non-destructive.

- [ ] **T010** — Rehearse the ledger baseline against a restored non-production copy *(FR-004, critical)*
  **HIGHEST RISK STEP.** Restore a production snapshot to a non-production target and establish the
  ledger there first. Confirm zero destructive operations and that all 27 orphan tables survive.
  **Do not proceed to T011 until this rehearsal is clean.**

- [ ] **T011** — Establish the migration ledger in production (additive only) *(FR-004, critical)*
  Baseline to reflect actual current state, not a replay of historical migrations against live
  data. `drizzle-kit push` is **PROHIBITED** — it would propose dropping all 27 orphan tables
  including `marketingcontacts`. Verify the `.env` `DATABASE_URL` target before every command; it
  points at PRODUCTION.

- [ ] **T012** — Generate the migration creating the 6 missing tables *(FR-001, critical)*
  Review the generated SQL for any DROP or ALTER before applying — it must be purely additive.

- [ ] **T013** — Apply the migration and verify non-destructiveness *(FR-001 / SC-5, critical)*
  Verify exactly 131 tables (up from 125), `marketingcontacts` still 1,006, `capabilityindex` still
  4,002. Any deviation is a rollback trigger.

- [ ] **T014** — Verify Consultant Hub returns 200 on all four requests *(SC-2, critical)*
  One consultant account, "All projects" selected. The customer-visible proof the incident is
  resolved.

## Phase 4 — Gate and verify

- [ ] **T015** — Confirm the detector passes cleanly post-remediation *(FR-005 / SC-3, high)*
  Exit 0 after T011–T013. Also confirm a fresh `db:generate` produces an empty diff — proving the
  ledger is honest rather than merely present.

- [ ] **T016** — Wire the schema check into CI and prove it blocks *(FR-005 / SC-7, high)*
  Verify with one intentional divergence commit that MUST fail the build. CI only — no pre-push
  hook.

- [ ] **T017** — Verify the restored diagnostic signal end to end *(FR-003 / SC-6, medium)*
  Induce a `42P01` in non-production; confirm the log carries code and relation name in single-line
  JSON, and root cause is reachable in under 2 minutes without replaying SQL against production.

- [ ] **T018** — Run the 7-day error observation window *(SC-1, medium)*
  Zero `42P01` and zero `22P02` across 7 consecutive days, against the baseline of 9 bursts on
  2026-07-30. A single post-deploy smoke check is insufficient — this failure is bursty and
  traffic-dependent, which is how it hid from the alarm for days.

---

---

## Status as of 2026-07-31

15 of 18 closed. **Three of those are superseded, not delivered** — the task tracker has no
"cancelled" state, so they show as `done` there. Recorded here so the distinction survives.

| Task | Real status |
| --- | --- |
| T001–T005 | **Delivered** — shipped in commit `5b4844ee`, APP 1.5.288 |
| T006 | **Outstanding** — `db:generate` / `db:migrate` scripts still absent |
| T007, T008 | **Delivered** — detector built; proven failing (exit 1, names the object) and passing (exit 0) |
| T009 | **Delivered** — baseline captured: 125 tables, 1006 / 4002 rows |
| T010 | **SUPERSEDED** — ledger rehearsal presumed migration-based application; operator applies DDL manually |
| T011 | **SUPERSEDED** — migration ledger replaced by a written change record (FR-004 amended) |
| T012 | **SUPERSEDED** — migration generation replaced by reviewed `manual-ddl.sql` |
| T013 | **Delivered** — DDL applied by operator; verified non-destructive |
| T014 | **Partial** — 4 of 4 incident queries verified at the SQL layer; NOT yet verified over HTTP with a real consultant account |
| T015, T017 | **Delivered** — detector clean post-remediation; real 42P01/22P02 captured with codes |
| T016 | **Delivered** — CI gate added; **requires the `SCHEMA_DRIFT_DATABASE_URL` secret or CI will fail** |
| T018 | **Outstanding** — 7-day observation window begins at the 2026-07-31 deploy |

**Genuinely remaining: T006, T014, T018.**

---

## Safety gates (non-negotiable)

- [ ] `DATABASE_URL` target verified before **every** `drizzle-kit` invocation — the local `.env` points at PRODUCTION
- [ ] `drizzle-kit push` confirmed **not** used at any point
- [ ] T010 rehearsal clean before T011 runs against production
- [ ] No orphan table dropped (blocked on PPE conversion)
