# Plan: Cancelled-Company Data Archival (SPEC-132)

Spec: `specs/132-cancelled-company-archival/spec.md` · Tasks: `tasks.md`
Umbrella scope: SCOPE-130 · Sibling: SPEC-131 (produces the `cancelledat` this spec consumes)

---

## The one thing to get right

This spec builds an **unattended job that rewrites ownership of customer data**. Everything in the
build order below exists to make that job provably safe before it is allowed to act:

- it ships `off`;
- it runs `dryrun` before it ever runs `on`;
- it works one transaction per company;
- it caps its own per-run blast radius;
- it refuses to act on any row whose `cancelledat` is null;
- and it deletes nothing, ever.

The four companies already sitting in `CANCELED` are the concrete reason for the null-skip rule.
Their only available date is `updatedat`, which last moved months ago for unrelated reasons — any
`updatedat`-based heuristic archives all four, unreviewed, on the first armed run.

## Build order

1. **T001** — the DDL. Hand-applied, logged, verified. **Gates both specs.**
2. **T002** — declare the columns, only after T001 is confirmed present in production.
3. **T003, T004** — the job shell with three modes, wired in, announcing its mode at boot. No
   archival logic yet; a job that starts, logs `off`, and does nothing is the correct first commit.
4. **T005** — selection only. With mode `dryrun`, this alone answers "who would be archived?" and
   is the first thing worth reviewing.
5. **T009** — the untouchability guard, **before** any mutation task. Write the thing that forbids
   damage before writing the thing that could do it.
6. **T006, T007, T008** — transfer, then prove no orphans.
7. **T010, T011, T012** — the scrubs. T011 destroys credentials; treat it as security work.
8. **T013** — deactivation at effective cancellation (needs SPEC-131 T005 landed to be observable).
9. **T014** — wrap it all in one transaction per company and prove idempotency.
10. **T015, T016, T017** — manifest, warning email, SYSADMIN queue.
11. **T018 → T019** — backfill, then the dry-run review and sign-off gate.
12. **T020** — the seeded invoice fixture.

## Gates

| Gate | Condition |
|---|---|
| **G1 — schema** | T001 applied by hand, logged in the SCOPE-117 change log, columns verified present (not via `db:drift`, which is table-level only), then T002 declared |
| **G2 — inert on arrival** | With `SUBSCRIPTION_ARCHIVAL_ENABLED` unset, the job starts, logs its mode, and touches nothing |
| **G3 — selection reviewed** | A `dryrun` names exactly the four T018 companies, their 7 projects and their 4 users, and moves nothing |
| **G4 — audit store intact** | Row counts and checksums on `companyauditlogs`, `company_status_history`, `credentialauditlogs` identical before and after a full archival |
| **G5 — integrity** | 0 rows deleted, 0 broken FKs across all 77 keyed tables, 0 orphaned `projectid`, 0 cross-tenant `projectinvoices` references |
| **G6 — credentials dead** | A scrubbed account cannot authenticate with its pre-scrub password, and its open sessions are invalid |
| **G7 — P1.1 sign-off** | A named person has approved the T010/T011/T012 scrub field lists, recorded alongside the T018 backfill. **Blocks mode `on` in production** |
| **G8 — invoice path proven** | T020 fixture passes; the path is not assumed correct because the first run met no invoices |

## Known issues and constraints

- **`jobScheduler` is a trap for this job.** It stores `setTimeout`/`setInterval` handles in an
  in-memory `Map`, so every App Runner redeploy forgets them silently. A 30-day timer registered
  there would never fire. The wait must be a date in the database, discovered by a daily sweep.
- **`deleteCompany()` already lies.** It reports `"Data will be retained for {n} days"` and writes
  a `retentionDate` into a `jsonb` blob that nothing reads. Reconciling it to stamp `cancelledat`
  is deliberately out of scope — it widens the change into the sysadmin surface — but it means two
  cancellation paths will coexist until someone decides. Tracked as Open Question 2.
- **`npm run db:drift` cannot verify T001.** It is table-level and exits 0 while declared columns
  are missing. Check `information_schema.columns` directly.
- **Declaring a column before it exists causes production 500s**, because Drizzle SELECTs every
  declared column. Hence T001 and T002 are separate tasks in a fixed order.
- **Unique constraints bite the scrub.** `companies.contactemail`, `companies.referralcode` and
  `userprofiles.emailaddr` are all unique. Scrub values derived from a shared literal make the
  *second* archival of the day fail on a duplicate key — a bug that cannot appear in a
  single-company test.
- **The archive company grows without bound.** HAS Enterprises LLC holds 1 project today and will
  accumulate every departed customer's work indefinitely, which eventually makes its own
  dashboards unusable. Tracked as Open Question 4; not solved here.
- **`activeflag` is already inconsistent in production** — one `ACTIVE` company has
  `activeflag = false`, and the four `CANCELED` ones split 2/2. Neither the sweep nor the backfill
  attempts to normalize it; status alone is never a sufficient read.

## Rollback

The job is reversible up to the point it acts: mode `off` restores the pre-spec behavior
completely, and T001's columns are additive and harmless if unused.

**An archival itself is not cleanly reversible.** Nothing is deleted, so the data survives — but
reversing a transfer means re-pointing projects back to a company whose identity has been scrubbed,
and that company's original name and contact details are gone. The T015 manifest exists precisely
so a reversal is *possible* (it records what moved, and from where) rather than *easy*. This is why
G3 and G7 gate arming, and why the per-run cap matters: a bad selection that touches one company is
recoverable work, and one that touches forty is not.

## Compliance

SOC 2 only. **CC7.2** — T009 keeps the audit store unalterable by this job; T015 records each
archival in a table separate from the rows changed. **CC6.3** — T017's route carries an explicit
SYSADMIN guard. **CC8.1** — T001 and T018 are hand-applied DDL/DML traced to the schema-change log
with rationale and approver. **P1.1** — G7; anonymizing customer PII and destroying credentials is
new personal-data handling and needs a named approver before it runs. **CC5.2** — separation of
duties cannot be satisfied on a single-operator project; recorded as an accepted exception, with
the mandatory dry-run review (G3) as the compensating control.
