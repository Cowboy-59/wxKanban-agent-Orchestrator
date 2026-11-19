# Production Schema Change Record

**Purpose (SCOPE 117 / FR-004, amended 2026-07-31, SOC2 CC8.1)**

All schema changes to the wxKanban production database are applied **manually by the
operator**. This file is the record of what was applied — it does not apply anything.

Production has no migration ledger, so without this file a schema change leaves no trace
outside one person's memory. That is precisely how `complianceflags` came to be declared in
code but absent from the database, and how it stayed that way undetected until a customer hit
a 500.

## How to use this

Add an entry **at the time you apply the change**, not afterwards. An entry written from
memory a week later is the failure mode this exists to prevent.

Each entry records: date, what changed, why, who applied it, the DDL reference, and the
verification evidence.

After any change, run the drift gate to confirm code and database agree:

```
auditfences --schema     # exit 0 = declared schema fully deployed
```

---

## 2026-07-31 — SCOPE 117 initial reconciliation

**Applied by:** Andy (operator), manually
**DDL:** [`manual-ddl.sql`](./manual-ddl.sql)
**Reason:** Six tables were declared in `src/db/schema/` but absent from production. One of
them, `complianceflags`, is queried by a live Consultant Hub route and produced `42P01` on
every page load — nine error bursts on 2026-07-30.

**Changes:**

| Change | Object | Note |
| --- | --- | --- |
| RENAME | `git_command_sessions` → `gitcommandsessions` | existing table, 3 rows preserved |
| CREATE | `complianceflags` | the table behind the Consultant Hub 500s |
| CREATE | `gitcommandlogs` | renamed from `git_command_logs` before creation |
| CREATE | `gitcommandstats` | renamed from `git_command_stats` before creation |
| CREATE | `mcpdriftevents` | |
| CREATE | `mcpparityconfig` | |
| CREATE | `mcpupdateadoptions` | |

**Also applied by the operator in the same window (orphan cleanup):**

Dropped 7 orphan tables — declared by neither the app nor the MCP schema, and referenced by
no code: `defaulttasks` (4 rows), `profile` (6), `kanbansettings` (15),
`projectconfigurations` (17), `memberuserprofilexref` (19), `userprofile` (28),
`membermessage` (37). 126 rows total.

Earlier the same cycle: `alithoprojects`, `chatrooms`, `testPlan` (foreign-application
tables, 0 rows relevant).

> Note: singular `userprofile` was dropped; plural `userprofiles` is live, MCP-declared, backs
> authentication, and was verified intact (74 rows) afterwards. These names are one character
> apart — see constraint C-6.

**Verification:**

| Check | Expected | Actual |
| --- | --- | --- |
| Declared-but-missing tables | 0 | **0** |
| `marketingcontacts` rows | 1006 unchanged | **1006** |
| `capabilityindex` rows | 4002 unchanged | **4002** |
| `userprofiles` (auth) intact | present | **present, 74 rows** |
| `gitcommandsessions` rows | 3 preserved by rename | **3** |
| All 7 target tables present | yes | **yes** |
| Consultant Hub incident queries | all succeed | **4 of 4 OK** |
| `auditfences --schema` | exit 0 | **exit 0** |

Table count went 125 → 124 rather than the projected 131: six created, one renamed (no count
change), seven orphans dropped. The arithmetic reconciles; the drops were intentional operator
cleanup, not DDL side effects.

---

## 2026-07-31 — SCOPE-119 customers table (unblocks SPEC-017 Phase 1)

**Applied by:** Andy (by hand, per SCOPE-117 — `drizzle-kit push` not used)
**DDL:** `src/db/migrations/0059_scope119_customers.sql`
**Reason:** SPEC-017 declared `customers` under "Existing Infrastructure" and it never existed.
Its four connection tables (`externalconnections`, `credentialauditlogs`, `synchistory`,
`connectionhealth`) each declare `customerid REFERENCES customers(id)`, so SPEC-017 Phase 1 could
not run at all. The Consultant Dashboard shipped the same day without its Customers rail for the
same reason. SCOPE-119 supplies the missing table.

**Changes:**

| Change | Object | Note |
| --- | --- | --- |
| CREATE | `customers` | Consultant-owned CRM record. `consultantid` uses **ON DELETE RESTRICT**, not CASCADE — CASCADE would let deleting a departing consultant destroy customer rows and make every invoice referencing those clients unresolvable. SPEC-119 FR-011 supplies the transfer flow that releases them. |
| CREATE INDEX | `idx_customers_consultantid` | |
| CREATE INDEX | `idx_customers_companyid` | |
| CREATE INDEX | `idx_customers_clientcompanyid` | `clientcompanyid` is the OPTIONAL link to a tenant; ON DELETE SET NULL so the consultant's record survives deletion of someone else's company |
| CREATE UNIQUE INDEX | `idx_customers_consultant_name_live` | PARTIAL — `(consultantid, lower(name)) WHERE archivedat IS NULL`. Archiving frees the name for reuse. Drizzle cannot express a partial expression index, so it lives in SQL only. |
| ALTER / ADD COLUMN | `companyprojects.customerid` | Nullable, `REFERENCES customers(id) ON DELETE SET NULL`. Every existing project keeps working with it NULL. |
| CREATE INDEX | `idx_companyprojects_customerid` | |

**Ordering note.** The `ADD COLUMN` is the mirror image of the DROP COLUMN hazard: Drizzle emits
every *declared* column in its SELECT list, so the DDL had to land before
`src/db/schema/companyproject.ts` declared `customerid`. That order was followed — SQL applied
first, verified, then the declaration. Reversing it returns `42703` on every `companyprojects`
query and takes the Consultant Dashboard, Work Hub and project list down together.

**Verification:**

| Check | Expected | Actual |
| --- | --- | --- |
| Declared-but-missing tables | 0 | **0** |
| `db:drift` exit code | 0 | **0** |
| Declared table count after declaration | 105 → 106 | **106** |
| `customers` moves out of UNDECLARED list | yes | **yes — 20 → 19** |
| `npx tsc --noEmit` on changed schema files | clean | **clean** |
| Post-declaration `42703` errors | 0 | *pending — check production logs over the next 24h (SPEC-119 success metric 2)* |

---

## 2026-07-31 — SCOPE-017 external PM connection layer

**Applied by:** Andy (by hand, per SCOPE-117)
**DDL:** `src/db/migrations/0060_scope017_connections.sql`
**Reason:** SPEC-017's connection layer, blocked since the spec was written because all four
tables reference `customers`. SCOPE-119 supplied that table earlier the same day.

**Changes:**

| Change | Object | Note |
| --- | --- | --- |
| CREATE | `externalconnections` | PM system per customer; `credentialsencrypted` holds AES-256-GCM `iv:authTag:ciphertext` from the existing `src/server/lib/crypto.ts` |
| CREATE | `credentialauditlogs` | Credential-access trail. **Neither FK cascades** — see the correction below |
| CREATE | `synchistory` | Operational sync records; cascades from its connection |
| CREATE | `connectionhealth` | Health-check history; cascades from its connection |
| CREATE INDEX | 15 indexes across the four tables | |

**Two corrections to the DDL in `specs/017-consultant-dashboard/data-model.md`:**

1. **`users(id)` does not exist** — the real table is `userprofiles`. The original would have
   failed on its first foreign key.

2. **A security defect.** The spec requires audit entries be "immutable and retained for 90 days
   minimum" (SCOPE-017 line 672), then declared
   `credentialauditlogs.connectionid ... ON DELETE CASCADE`. Under that rule, deleting a
   connection destroys its entire credential-access trail — a one-step way to erase evidence of
   credential access. Corrected to `SET NULL` on both foreign keys, with denormalised
   `connectionname` and `useremail` snapshots so a row stays readable after the connection and
   the user it names are both gone. `synchistory` and `connectionhealth` still cascade, correctly:
   they are operational telemetry, not audit.

**Verification:**

| Check | Expected | Actual |
| --- | --- | --- |
| Declared-but-missing tables | 0 | **0** |
| `db:drift` exit code | 0 | **0** |
| Declared / deployed counts | 106/125 → 110/129 | **110 / 129** |
| `credentialauditlogs.connectionid` delete rule | SET NULL | **SET NULL** (queried in prod) |
| `credentialauditlogs.userid` delete rule | SET NULL | **SET NULL** (queried in prod) |
| `synchistory.connectionid` delete rule | CASCADE | **CASCADE** |
| `connectionhealth.connectionid` delete rule | CASCADE | **CASCADE** |

---

## Template for the next entry

```
## YYYY-MM-DD — <short description>

**Applied by:**
**DDL:**
**Reason:**

**Changes:**
| Change | Object | Note |
| --- | --- | --- |

**Verification:**
| Check | Expected | Actual |
| --- | --- | --- |
| Declared-but-missing tables | 0 | |
| auditfences --schema | exit 0 | |
```

---

## Observation log — SCOPE-117 / T018 (7-day window, Success Metric 1)

Target: **zero `42P01` and zero `22P02`** across 7 consecutive days, against the measured baseline
of **9 error bursts on 2026-07-30** (10:27, 12:04, 12:06, 12:12, 12:53, 15:12, 18:44, 23:13, 23:14 UTC).

Window opens at the post-fix deploy: **2026-07-31T09:42:47Z**.

| Reading | Window | `Failed query` | `42P01` | `22P02` | Notes |
| --- | --- | --- | --- | --- | --- |
| Day 1 (partial) | 09:42Z → 11:30Z | 0 | 0 | 0 | ~2 hours only. Not yet meaningful — this failure mode is bursty and traffic-dependent, which is how it hid from the CloudFront alarm for days. |
| Day 2 | — | — | — | **live source found** | ⚠️ **Window reset.** See below. |

### ⚠️ Window reset 2026-08-01 — a live `22P02` source was found in code, not in schema

`GET /api/consultant/dashboard` threw **`22P02`** on every request from a consultant with at
least one project, from the moment the Consultant Dashboard shipped (2026-07-31) until it was
fixed on 2026-08-01 (**SCOPE-017 / T147**). Both of its project filters passed a JS array into a
`sql` template as `= ANY(...)`; drizzle renders that as a parenthesised bind-param list, so
Postgres received a scalar and tried `array_in`. Fixed to `inArray()`.

**Why day 1 read zero:** the window opened at 09:42Z on 2026-07-31 and the dashboard had just
shipped. Nobody with real project data opened it until 2026-08-01. The reading was accurate and
still misleading — zero errors meant zero traffic on the broken path, not a healthy one.

**Two corrections this forces on the metric:**

1. **The clock restarts at the T147 deploy**, not at 2026-07-31T09:42Z. The 7-day target window
   has not begun; it begins when this fix reaches production.
2. **`22P02` is not only a schema-drift signal.** SCOPE-117 framed both codes as symptoms of the
   missing migration ledger. This one had nothing to do with schema — it was a query-construction
   bug in freshly shipped code. A clean 7 days therefore proves less than intended: it proves no
   *observed* failures, across whatever paths happened to get traffic. Untrafficked paths are
   invisible to it, which is exactly how this one survived a full day inside the window.

Read the metric as "no user hit a broken query", not "no broken queries exist."

**Pre-deploy contrast**, same log group, 2026-07-30 23:20Z → deploy: **73 `Failed query` events**
(19 invoice preview, 19 recent timer, 19 active timer, 16 compliance flags). None carry a Postgres
code because they predate the FR-003 logging change — which is precisely the gap that made the
original incident take hours to diagnose.

**How to take the next reading:**

```bash
aws logs filter-log-events --profile Andy --region us-east-2 \
  --log-group-name "/aws/apprunner/wxKanban/30cd8148c8524391a7517c188f7f7592/application" \
  --start-time 1785490967000 --filter-pattern '"Failed query"' \
  --query 'events[*].message' --output text
```

Any hit now carries `"code"` — read it directly rather than replaying SQL against production.

---

## 2026-08-02 — two columns restored, and a correction to this document's own verification step

**Applied by:** Andy (operator), manually
**DDL:** [`0061_scope043_audit_requested_project.sql`](../../src/db/migrations/0061_scope043_audit_requested_project.sql), [`0062_scope117_projecttimeentries_phaseid.sql`](../../src/db/migrations/0062_scope117_projecttimeentries_phaseid.sql)

> ⚠️ **Filed after application, not at the time.** This entry breaks the rule stated in *How to
> use this* above. Recording that plainly rather than back-dating it: the `phaseid` DDL was run
> ad hoc with no migration file in existence, and `0062` was written afterwards to describe what
> had already happened. Both files are honest about which parts are applied and which are not.

**Changes:**

| Change | Object | Status | Note |
| --- | --- | --- | --- |
| ADD COLUMN | `projecttimeentries.phaseid` (uuid, null) | ✅ applied | declared since spec 020, never deployed |
| ADD COLUMN | `mcprequestaudit.requestedprojectid` (uuid, null) | ✅ applied | new — SCOPE-043 audit gap |
| ADD CONSTRAINT | `projecttimeentries_phaseid_projectphases_id_fk` | ⛔ **NOT applied** | declared in `projecttimeentry.ts`; see 0062 Part 2 |

Verified by direct `information_schema` query — both columns present, `uuid`, nullable.

### Why `phaseid` mattered

`projecttimeentry.ts` has declared `phaseid` since spec 020; production never had it. Drizzle puts
every **declared** column in its SELECT list, so bare `db.select().from(projecttimeentries)` — the
dominant read pattern here — returned `42703`, while partial selects naming only the columns they
need kept working. That produced intermittent, endpoint-specific 500s rather than a clean outage.
A candidate cause of the unexplained ~9 daily 500-bursts; worth re-reading the error metric now
that it is closed.

Found by **wxDBAnalyze** (`schema.missing-column`, critical) — not by any existing gate.

### ⚠️ Correction — `auditfences --schema` cannot verify a column change

*How to use this* (above) instructs: run `auditfences --schema`, exit 0 = declared schema fully
deployed. **That instruction is wrong for column changes, and this entry is the proof.**

`npm run db:drift` — the same check — was run on 2026-08-02 and **exited 0 while BOTH columns in
this entry were missing from production**:

```
Schema drift — 110 declared, 129 deployed (database: wxKanban)
DECLARED BUT NOT DEPLOYED (0) — none
OK — every declared table exists in the database
```

Read its success line literally: *every declared **TABLE** exists*. It never inspects columns. A
green run says nothing about whether a column migration landed, and `phaseid` sat declared-but-
absent through the entire SCOPE-117 reconciliation of 2026-07-31 because that pass — and its gate
— compared tables while this gap was a column.

**Verify column changes directly instead:**

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = $1 and column_name = $2;
```

This does not make the drift gate useless — it still catches missing tables, which is what it was
built for. It means SCOPE-117's stated goal of eliminating schema drift is **not yet met at column
granularity**, and the gate should be extended before a clean run is treated as coverage.

### Deploy-ordering hazard on 0061

`mcprequestaudit.requestedprojectid` is written by the MCP audit middleware, whose INSERT names its
columns explicitly. Had the code shipped before this DDL, every audit insert would have failed
`42703` — and `asyncWriteAudit` swallows insert errors into a `logger.warn` so responses are not
blocked. Audit logging would have stopped completely with **no request failing and no alarm**. The
DDL landed first, so this did not occur; it is recorded because the ordering is not obvious from
the code and the failure would have been silent.

---

## 2026-08-03 — SCOPE-111 / GAP-05 forcetest semantics comment ✅ **APPLIED**

**Applied by:** Andy (operator), manually, as the owning role `ccscowboy`
**DDL:** [`0063_scope111_forcetest_semantics_comment.sql`](../../src/db/migrations/0063_scope111_forcetest_semantics_comment.sql)
**Reason:** `testplanitems.forcetest` is a three-state column — `NULL` = inherit
`testplans.forcetest`, `TRUE`/`FALSE` = override in either direction (FR-030). Nothing at the
schema level recorded that `NULL` is meaningful. A `SET NOT NULL DEFAULT false`, or an all-null-
column cleanup, would silently un-force every inheriting item with no error and no visible change.
It fails **open**: tests stop blocking the release rather than starting to.

**Changes:**

| Change | Object | Status | Note |
| --- | --- | --- | --- |
| COMMENT ON COLUMN | `testplanitems.forcetest` | ✅ applied | metadata only |
| COMMENT ON COLUMN | `testplans.forcetest` | ✅ applied | metadata only |

No column is added, no type changed, no row touched. Reversible with `COMMENT ON COLUMN ... IS NULL`.

### Why the operator had to run it

`COMMENT ON` requires **table ownership** — no GRANT covers it. Both credentials available to
tooling are deliberately non-owner under H-9 least-privilege, which is the control working as
designed, so this could not be applied by a script, an agent, or CI:

| Credential | `current_user` | Owner of `testplanitems` | Can COMMENT |
| --- | --- | --- | --- |
| `DATABASE_URL` | `wxkanban_app` | `ccscowboy` | **no** (`42501`) |
| `SCHEMA_DRIFT_DATABASE_URL` | `wxkanban_ci_readonly` | `ccscowboy` | **no** |

Worth carrying forward: a *comment-only* migration still needs the operator. It is metadata, but
it is not self-service.

**Verification (read-only, 2026-08-03, after apply):**

| Check | Expected | Actual |
| --- | --- | --- |
| `testplanitems.forcetest` comment | present, states NULL = inherit | **present** |
| `testplans.forcetest` comment | present | **present** |
| `testplanitems.forcetest` `is_nullable` | `YES` — **unchanged** | **YES** |
| `testplanitems.forcetest` `column_default` | none — **unchanged** | **none** |
| `testplans.forcetest` `is_nullable` | `NO` — **unchanged** | **NO** |
| `testplans.forcetest` `column_default` | `false` — **unchanged** | **false** |
| Rows with a non-null override | 0 of 178 — **unchanged** | **0 of 178** |

All four `[SCOPE 111 / T045]` assertions now pass against production. The nullability rows are
listed as *unchanged* deliberately: the point of a comment-only migration is that it moves nothing,
and this table is the evidence it moved nothing.

No drift: the deployed shape matches `src/db/schema/`. This entry adds documentation and a gate,
it does not correct a defect.

> **Related, still open:** `npm run db:drift` compares **tables only** — see the correction above,
> dated 2026-08-02. It cannot see a nullability change on this or any other column. The
> deployed-schema assertions added under `[SCOPE 111 / T045]` cover *this* column specifically;
> extending the drift gate to column granularity remains the general SCOPE-117 follow-up.

---

## 2026-09-18 — `0064_scope129_brand_schema.sql` — `brandschema` on all three theme tiers

**Scope**: SCOPE-129 / SPEC-126 T006. **Applied by**: Andy, as the table owner. **Verified by**: read-only query, below.

Adds one nullable `jsonb` column, `brandschema`, to **three** tables:

| Table | Tier | Why it needs the column |
| --- | --- | --- |
| `themetemplates` | company-scoped named gallery | where a tenant's own brand lives |
| `projectthemes` | per-project applied snapshot | what `execute` reads |
| `companythemeprofiles` | company default | what a company-wide brand selection resolves through |

Strictly additive and idempotent — `ADD COLUMN IF NOT EXISTS`, nullable, no default, no backfill,
no type change. `ADD COLUMN` with no default is metadata-only in PostgreSQL 11+, so no table was
rewritten. Every pre-existing row keeps working with the column NULL, and today's artifacts are
unchanged.

`designsystems` is deliberately **not** altered: it is global, read-only and system-owned, which
makes it the wrong home for one tenant's brand.

**Why all three tiers together.** `resolveTheme()` states that the company and default tiers have
no rich token set *by construction*, because neither table carried the existing carrier columns.
SCOPE-129's capture flow ends in a brand being selected **company-wide**, so adding this column to
the project tier alone would look correct in the Studio and then lose the schema at the company
boundary — every project that had not imported the brand individually would resolve to bare colours
while every screen reported success. That is the failure shape SCOPE-114 recorded on the other two
carrier columns, and it is why these three move in one migration.

**Verification (read-only, 2026-09-18, after apply):**

| Check | Expected | Actual |
| --- | --- | --- |
| `themetemplates.brandschema` exists | present | **present** |
| `projectthemes.brandschema` exists | present | **present** |
| `companythemeprofiles.brandschema` exists | present | **present** |
| `npm run db:drift` | 0 declared-but-not-deployed | **0 — OK** |
| Undeclared tables reported | 19, informational only — **unchanged** | **19** |

**Privilege note, worth recording because it will recur.** The first apply attempt was made with
the application credential and was **correctly refused**: `must be owner of table themetemplates`.
`DATABASE_URL` names `wxkanban_app`, which is not a superuser, holds no role memberships, and does
not own these tables — they are owned by `ccscowboy`. The attempt ran inside a transaction and
rolled back cleanly, verified by query: no column was created.

This is the H-9 least-privilege hardening behaving exactly as designed, confirmed under a real
attempt rather than only in an audit. The consequence is general: **no schema change on this
project can be applied with the credentials present in the local environment**, because no
owner-level connection string exists there. Every migration needs the owner to run it. That is the
concrete reason behind SCOPE-117's "applied manually", and it applies to every future migration,
not just this one.

**Ordering note.** The Drizzle declarations for these columns were deliberately **not** written
until after this migration was applied. Drizzle names every declared column in its `SELECT`s, so
declaring a column that does not yet exist would have thrown `column does not exist` on all three
tables against the live database. This is the inverse of the drop-column ordering rule already
recorded here, and it constrains the sequence in both directions: **declare after adding, stop
selecting before dropping.**

---

## 2026-09-21 — `0065_scope132_company_lifecycle_timestamps.sql` — four lifecycle dates on `companies` ✅ **APPLIED 2026-09-22**

**Applied by:** Andy, by hand, on the owner connection (`ccscowboy`) — `wxkanban_app` does not own
`companies` and cannot apply this. Verified 2026-09-22 read-only over `wxkanban_app`.
**DDL:** `src/db/migrations/0065_scope132_company_lifecycle_timestamps.sql`
**Reason:** SPEC-132 / T001. SCOPE-130 adds self-serve suspend and cancel (SPEC-131) plus a 30-day
data archival sweep (SPEC-132). Four dates drive that lifecycle and none exist today.

**Changes:**

| Change | Object | Note |
| --- | --- | --- |
| ADD COLUMN | `companies.cancelrequestedat` | timestamp, nullable. Cancellation *requested*; Stripe set to `cancel_at_period_end`. Access continues; reversible. **Not** the archival clock |
| ADD COLUMN | `companies.cancelledat` | timestamp, nullable. Cancellation *effective* at period end. The 30-day clock starts here and the sweep selects on this column alone |
| ADD COLUMN | `companies.pausedat` | timestamp, nullable. Billing suspended via Stripe `pause_collection`. Walled, but never archived |
| ADD COLUMN | `companies.archivedat` | timestamp, nullable. Archival completed; presence makes re-archival a no-op |

Purely additive — no defaults, no constraints, no indexes, no data touched. `ADD COLUMN` with a
NULL default does not rewrite the table, so the `ACCESS EXCLUSIVE` lock is brief regardless of size
(55 rows — the header of the DDL file says 47, which was the count when it was written; the table has
grown since and nothing in this change depends on the number).

**Verification — run 2026-09-22, read-only, as `wxkanban_app` against `wxKanban`:**

| Check | Expected | Actual |
| --- | --- | --- |
| The 4 columns exist on `companies` | present, `timestamp`, all nullable | ✅ 4/4 — all `timestamp without time zone`, all `is_nullable = YES`, no defaults |
| Rows with any of the 4 stamped | **0** — this migration backfills nothing | ✅ 0 of 55 companies |
| Declared-but-missing tables (`npm run db:drift`) | 0 | ✅ 0 (110 declared, 129 deployed, 19 undeclared-but-live — unchanged) |
| `auditfences --schema` | exit 0 | ✅ exit 0 |
| Column comments landed | 4 | ✅ 4/4 |
| The four pre-existing `CANCELED` companies | `cancelledat` still NULL — T018 stamps them, not this | ✅ CPC, JCA Software, McM Tech Solutions, MIRALTEC INFORMÁTICA S.L.L. — all NULL |

**`db:drift` did not and could not verify this change.** It is table-level and passed identically
before the apply. The column evidence above came from `information_schema.columns` directly, as the
DDL header instructs. Recording that here so the next reader does not mistake a green `db:drift` for
column-level proof.

**Unblocked by this apply:** SPEC-132 / T002 (declare the four columns in `schema/company.ts`) may now
run, and with it the whole of SPEC-131. The arming order for the sweep is unchanged — T018 backfill →
T019 dry-run + P1.1 sign-off → only then `SUBSCRIPTION_ARCHIVAL_ENABLED=on`.

⚠️ **`db:drift` cannot verify this change.** It compares TABLES and will pass whether or not these
columns exist — the same structural blind spot that hid `projecttimeentries.phaseid` until
wxDBAnalyze found it (see the 2026-08-02 correction above). Verify against
`information_schema.columns` directly; the query is in the migration header.

### Ordering constraint — declare only after applying

Per the 2026-09-18 note, the Drizzle declarations for these four columns are deliberately **not**
written until this migration is applied. Drizzle names every declared column in its `SELECT`s, and
`companies` is read on effectively every authenticated request, so declaring ahead of the DDL would
return 500s across the whole application rather than on one endpoint. SPEC-132 / T002 is the task
that adds the declarations, and it is gated on this entry being marked applied.

This also gates **SPEC-131** entirely: that spec's cancel, resume and pause paths all write three of
these columns.

### Why the four pre-existing `CANCELED` companies are not backfilled here

Production already holds four cancelled companies — CPC (`019ee07e-…`), McM Tech Solutions
(`01a01abf-…`), MIRALTEC INFORMÁTICA S.L.L. (`019f3b5a-…`) and JCA Software (`019f2aed-…`) — with 7
projects and 4 still-`active` users between them. They have no `cancelledat`, because the column did
not exist when they cancelled.

Their only available date is `updatedat`, which last moved between 2026-06-19 and 2026-08-27 for
reasons unrelated to cancellation. That makes it weak evidence, and it is why **no code path may
derive an archival date from `updatedat`**: a sweep keyed on it would judge all four long overdue and
archive them, unreviewed, on its first armed run.

Stamping them is therefore a separate, explicitly reviewed statement — **SPEC-132 / T018** — filed as
its own change-log entry when it is applied, so that accepting `updatedat` as good-enough evidence for
those four specific rows is a decision on the record rather than a side effect of adding a column.

**Arming order for the sweep, for the record:** T018 backfill → a `dryrun` naming exactly those four
→ SOC 2 P1.1 sign-off on the scrub field lists → only then `SUBSCRIPTION_ARCHIVAL_ENABLED=on`.

---

## 2026-09-23 — `clientbinding` on `mcpapitokens` (SCOPE-131) ✅ **APPLIED 2026-09-23**

**Applied by:** Andy, by hand against production
**DDL:** `ALTER TABLE mcpapitokens ADD COLUMN clientbinding varchar(255);`
**Reason:** SCOPE-131 needs per-token client identity so `project.session_start` can answer only to
a named agent (KAIN first, ALIS later). Tokens previously carried no notion of *what kind of client*
held them, which made an agent-only restriction unexpressible.

**Changes:**
| Change | Object | Note |
| --- | --- | --- |
| ADD COLUMN | `mcpapitokens.clientbinding` | `varchar(255)`, **nullable**, no default. Holds `NAME:<sha256-of-token>` — the token half is hashed, so no plaintext credential is persisted alongside its own hash. |

**Verification:**
| Check | Expected | Actual |
| --- | --- | --- |
| Column exists | yes | yes |
| Type | `character varying(255)` | `character varying(255)` |
| Nullable | `YES` | `YES` |
| Existing tokens left unbound | all | 356 of 356 |
| Declared-but-missing tables | 0 | 0 |
| `npm run db:drift` | exit 0 | exit 0 |

**⚠ Neither `db:drift` nor `auditfences --schema` can verify this change.** Both are table-level and
exit 0 while a declared column is missing — the same limitation recorded in this document's
2026-08-02 correction. The column was confirmed by querying `information_schema.columns` directly,
which is the only method that actually answers the question.

### Ordering constraint — declare only after applying

`mcpapitokens` is the **authentication table: every MCP request reads it**, and Drizzle names every
declared column in its `SELECT`s. A declaration landing before the DDL would therefore error on
every MCP call from every client — the orchestrator kit, the VS Code Cockpit and any agent — rather
than on a single endpoint. It is the worst blast radius of any table in this database.

This entry being marked applied is what unblocks the declaration, which must be added to **both**
the application's `src/db/schema/` and the `mcp-server/src/db/schema.ts` mirror. Declaring in one
only yields a silent `undefined`, not an error — see the partial-mirror note in that file.

**Nullable is load-bearing.** 356 existing tokens carry no binding and must keep authenticating
unchanged. `NOT NULL` without a default would have failed the `ALTER` outright; `NOT NULL` *with* a
default would have silently bound all 356 tokens to a name none of them owns.

---

## 2026-09-23 — room binding on `companyprojects` (SCOPE-132) ✅ **APPLIED 2026-09-23**

**Applied by:** Andy, by hand against production
**DDL:**

```sql
ALTER TABLE companyprojects
  ADD COLUMN conversationid       varchar(255),
  ADD COLUMN agenttokenencrypted  text;
```

**Reason:** SCOPE-132 derives an agent's YappChatt room from its token's `projectId` instead of a
hand-pasted `.env` value. Today the project↔room link exists nowhere — `client.ts:402` records that
"per-project falls out because each repo has its own `.env`", i.e. isolation is convention, not
data. These two columns make the mapping server-authoritative, so a room is never a client claim.

**Changes:**
| Change | Object | Note |
| --- | --- | --- |
| ADD COLUMN | `companyprojects.conversationid` | `varchar(255)`, nullable. The YappChatt room's `conversationId` for this project. |
| ADD COLUMN | `companyprojects.agenttokenencrypted` | `text`, nullable. The per-room `yca_…` agent token, **AES-256-GCM at rest** as `iv:authTag:ciphertext` — same shape and helper as `externalconnection.credentialsencrypted` (`src/server/lib/crypto.ts`). Stored because minting is mint-once-and-reuse; YappChatt's `connectClaudeToConversation` inserts a new token per call and never revokes, so minting per connect would grow live credentials without bound. |

**Verification:**
| Check | Expected | Actual |
| --- | --- | --- |
| `conversationid` | `varchar(255)`, nullable | `character varying(255)`, `YES` |
| `agenttokenencrypted` | `text`, nullable | `text`, `YES` |
| Existing projects unaffected | all | 174 of 174 have no room |
| Declared-but-missing tables | 0 | 0 |

Confirmed by querying `information_schema.columns` directly — `db:drift` and `auditfences --schema`
are table-level and cannot see a column change.

### Incidental finding — the mirror is missing 9 columns

Listing `companyprojects` showed **17 columns in production against 8 declared** in
`mcp-server/src/db/schema.ts`. Undeclared: `pmsystems`, `hourlyrate`, `allocatedhours`,
`currentphase`, `securityclassification`, `skiptesting`, `customerid`, plus the two added here.

This is not harmless. `currentphase` is `varchar(50)` **NOT NULL** in production, yet
`loadProjectSummary` returns `currentPhase: null` as a **hardcoded literal** — because the column
was never declared, so Drizzle never fetched it and the literal was written to paper over an
`undefined`. SCOPE-131 / FR-013 now fixes that by declaring the column rather than by joining
`projectphases`, which was never needed.

**Declaration for both new columns is gated on this entry**, in the application schema *and* the
`mcp-server` mirror. Declaring in one only yields a silent `undefined` — which is exactly how
`currentphase` became a literal in the first place.

### ⚠ SUPERSEDED the same day — see the `projectrooms` entry below

Neither column was ever declared, and both are dropped by
`0068_scope134_projectrooms_table.sql`. This entry stays because the columns really were applied
to production on 2026-09-23; a change log that edits away what happened is not a log.

---

## 2026-09-23 — `0068_scope134_projectrooms_table.sql` — `projectrooms` replaces the columns above ✅ APPLIED 2026-09-25

**To be applied by:** Andy, by hand
**Reason:** a modelling correction caught before it set, not a fault in the columns.

A column pair on `companyprojects` hard-codes **one room per project**, which silently answers
SCOPE-132's **OQ-7** — *"does ALIS share KAIN's room or get its own?"* — as "shares", by
construction rather than by decision. A table keyed `(projectid, agentname)` leaves that question
genuinely open.

That distinction is load-bearing rather than theoretical: YappChatt keys its agent principal **per
room** (`claude+<conversationid>@agent.yappchat.internal`, display name "Claude"), so two agents
sharing one room *are the same `users` row* and cannot be told apart at the platform level. A
separate room is the only mechanism that distinguishes them. Prefix tagging is a content
convention layered on top, not an identity.

**Changes:**
| Change | Object | Note |
| --- | --- | --- |
| CREATE TABLE | `projectrooms` | `projectid` FK → `companyprojects` ON DELETE CASCADE; `agentname`; `conversationid` NOT NULL; `agenttokenmintedat` nullable; unique `(projectid, agentname)`. **No token column** — the agent keeps its own `yca_` (corrected 2026-09-25: this row previously listed `agenttokenencrypted`, which the migration file never had). |
| DROP COLUMN | `companyprojects.conversationid` | Empty and declared nowhere. |
| DROP COLUMN | `companyprojects.agenttokenencrypted` | Empty and declared nowhere. |

**Why the drop is safe, and the precondition to re-check before applying:** both columns were
applied but **declared in no schema file**, so nothing ever SELECTed them, and
`select count(conversationid) from companyprojects` returned **0 of 174**. No data moves. Had any
row been populated, this would need a backfill before the DROP — it deliberately has none, so the
count is a precondition to verify, not an assumption to carry.

**Why now specifically.** This was the free moment and it was closing. Undeclared columns can be
dropped in one statement; once SPEC-134/T004 declares them, removal becomes the three-deploys-apart
sequence, because Drizzle names every declared column in every `companyprojects` SELECT. The
question "does every project need these fields?" was asked at exactly the right time.

**Verification:** to be recorded when applied. `db:drift` **will** see the new table, but cannot
see the dropped columns — use the `information_schema.columns` queries in the migration header.

**Applied by hand by Andy, 2026-09-25. Verification:** the migration header's four checks —
dropped columns `0`; `projectrooms` columns `id, projectid, agentname, conversationid,
agenttokenmintedat, createdat, updatedat`; unique `projectrooms_projectid_agentname_key`; encrypted
columns `0`. `db:drift` exit 0 (113 declared, all present).

**Pre-check re-run 2026-09-25:** both columns still present, `count(conversationid)` and
`count(agenttokenencrypted)` both **0**; `projectrooms` did not yet exist.

---

## 2026-09-25 — `0069_scope134_companyagenttokens.sql` — `companyagenttokens` ✅ APPLIED

Applied by hand by Andy, 2026-09-25. One new table, nothing altered or dropped.

| Change | Object | Note |
| --- | --- | --- |
| CREATE TABLE | `companyagenttokens` | An agent's admission ticket for one company. SHA-256 hash only; one live ticket per `(companyid, agentname)`. Reaches no project data. |

**Verification (2026-09-25):** `db:drift` exit 0 (112 declared, all present). Columns read from
`information_schema.columns` match the declaration exactly: `id, companyid, agentname, tokenhash,
tokenprefix, label, issuedbyid, issuedat, lastusedat, revokedat, revokedbyid`.

---

## 2026-09-25 — `0070_scope134_projectagentgrants.sql` — `projectagentgrants` ✅ APPLIED

Applied by hand by Andy, 2026-09-25. One new table, nothing altered or dropped.

| Change | Object | Note |
| --- | --- | --- |
| CREATE TABLE | `projectagentgrants` | One row per project an agent may reach. Soft revoke; live-grant unique index. Re-checked on every MCP call for grant-minted tokens. |

**Verification (2026-09-25):** `db:drift` exit 0. Columns match the declaration exactly: `id,
projectid, agentname, grantedbyid, grantedat, revokedat, revokedbyid`. Also declared in the
`mcp-server` mirror, which reads it on the hot path.

---

## 2026-10-04 — SCOPE-123 — `projectspecifications.phaseid` drop DEFERRED, `specificationphases` first writer ⏸ NOTHING APPLIED

Recorded by SCOPE-123 (T004, T010). **No DDL was run.** This entry records an intent and a
verification, so the deferred drop is not forgotten and not done early.

| Change | Object | Note |
| --- | --- | --- |
| Readers removed (code only) | `projectspecifications.phaseid` | It pointed a scope at the PROJECT's phase row, the category error SCOPE-123 removes. Readers gone: `GET /:id/phases/:phaseid/specs`, `GET /:id/scaffold`, and the `ScopeService` pass-through. The column stays **declared and present**. |
| First writer (code only) | `specificationphases` | Written for the first time by the per-scope stage advance. No column added, no index added. |

**Why the drop waits.** Drizzle SELECTs every declared column, so dropping a column the running
bundle still declares breaks every query on the table (the `companyprojects.audittype` incident,
2026-07-28). The drop needs three steps, each fully deployed before the next:

1. Remove the last writer, `POST /:id/phases/:phaseid/specs` in `src/server/routes/projects.ts`. Deploy.
2. Remove the declaration from `src/db/schema/projectspecification.ts`. Deploy, and confirm it is live.
3. `ALTER TABLE projectspecifications DROP COLUMN phaseid`, behind an explicit confirm guard.

**Type mismatch found while verifying (2026-10-04).** The app declares `phaseid` as `uuid`
(FK to `projectphases.id`); production has it as **`varchar(50)`**, nullable. `db:drift` is
table-level and does not see this. Moot once the column is dropped, but anything that reads it
before then gets a string.

**`specificationphases` verified against production (2026-10-04, `information_schema.columns`,
read-only).** Nine columns, matching the declaration exactly: `id uuid default gen_random_uuid()`,
`specificationid uuid NOT NULL` (FK to `projectspecifications`, `ON DELETE CASCADE`),
`phase varchar(50) NOT NULL`, `enteredat timestamp NOT NULL` (no default), `exitedat timestamp`,
`approvedby uuid`, `notes text`, `blockers text`, `createdat timestamp NOT NULL default now()`.
Only the primary-key index exists; there is **no** unique index on open rows, so the stage
service serialises writes per scope with a transaction-scoped advisory lock instead. One row
existed before SCOPE-123: a closed test row for spec 010 (`phase = 'Release'`, 2026-03-02).

---

## 2026-10-09 — `0071_scope002_company_vatnumber.sql` — `companies.vatnumber` ✅ APPLIED

Applied by hand by Andy on 2026-10-09 for SPEC-002 Amendment A (FR-012a). One column was added.
Nothing was altered or dropped.

| Change | Object | Note |
| --- | --- | --- |
| ADD COLUMN | `companies.vatnumber` | `varchar(50)`, nullable, no default. Optional VAT registration number, as entered. Display only; no tax logic. |

**Verification (2026-10-09, read-only):**

| Check | Result |
| --- | --- |
| `information_schema.columns` | One row: `vatnumber`, `character varying`, length 50, nullable, no default |
| Existing rows | 57 companies, all with `vatnumber` NULL, as expected |
| `db:drift` | Exit 0 (113 declared tables, all present). It checks tables only, so it does not prove the column exists; the column check above does. |
| Column comment | **Not set.** Only the `ALTER TABLE` was run. This is cosmetic; the `COMMENT ON COLUMN` in 0071 can be run at any time. |

**Order kept.** The column was applied and verified before SPEC-002 T072 declared it in
`src/db/schema/company.ts`. `companies` is read on nearly every request, so declaring it first
would have returned 500 across the whole application.

---

## 2026-10-24 — `specs/144-company-yappchatt-account/sql/0001-company-yappchatt.sql` — company YappChatt account (SCOPE-144) ✅ APPLIED

**Applied by:** Andy, by hand, on the owner connection, 2026-10-24. Verified the same day (below).
**DDL:** [`../144-company-yappchatt-account/sql/0001-company-yappchatt.sql`](../144-company-yappchatt-account/sql/0001-company-yappchatt.sql) (SPEC-144 contract C2; one transaction)
**Reason:** SPEC-144 / T003 (FR-001, FR-003, FR-005, FR-007). A wxKanban company gets its own
YappChatt account and corporate group; project rooms are owned by that account, and an old room is
retired (history kept) rather than deleted when it is replaced.

**Changes:**

| Change | Object | Note |
| --- | --- | --- |
| ADD COLUMN | `companies.yappchattuserid` | `uuid`, nullable. The company account's YappChatt user id |
| ADD COLUMN | `companies.yappchattemail` | `varchar(255)`, nullable. The email the account was created or linked with |
| ADD COLUMN | `companies.yappchattlinkedat` | `timestamptz`, nullable. When the account was created or linked |
| ADD COLUMN | `companies.yappchattgroupid` | `uuid`, nullable. The company's YappChatt corporate group (org id) |
| ADD COLUMN | `userprofiles.yappchattuserid` | `uuid`, nullable. Each person's YappChatt user id, stored on membership sync |
| ADD COLUMN | `projectrooms.owneryappchattid` | `uuid`, nullable. The YappChatt account that owns the room |
| ADD COLUMN | `projectrooms.retiredat` | `timestamptz`, nullable. Set when the room is retired |
| DROP CONSTRAINT | `projectrooms_projectid_agentname_key` | The unique `(projectid, agentname)` from 0068 |
| CREATE UNIQUE INDEX | `projectrooms_projectid_agentname_active_key` | PARTIAL — `(projectid, agentname) WHERE retiredat IS NULL`. Keeps one live room per project and agent; retired rows can stay |

All additive and nullable with no defaults, so no table is rewritten and existing rows keep NULL.

**Order — the declarations are already written, and must not ship first.** SPEC-144 / T004
declares all seven columns and the partial index in `src/db/schema/company.ts`,
`src/db/schema/userprofiles.ts` and `src/db/schema/projectroom.ts` now, so the other areas compile
and unit-test against them, each marked "declared before the column exists in production". Nothing
that declares or uses these columns may be pushed or deployed until this SQL is applied and
verified: Drizzle names every declared column in its SELECTs, and `companies` and `userprofiles`
are read on nearly every request, so a declared-but-missing column returns `42703` across the whole
application.

**Verification (2026-10-24, read-only, `BEGIN READ ONLY`):** `db:drift` is table-level and
**cannot** see these columns or the index, so the `information_schema.columns`, `pg_indexes` and
`pg_constraint` queries from the SQL file's header were run against database `wxKanban`.

| Check | Expected | Actual |
| --- | --- | --- |
| Pre-check: unique constraint on `projectrooms` | `projectrooms_projectid_agentname_key` | Not captured: the SQL was applied before the check was run. The post-state below is consistent with it |
| The 7 columns exist | present, all nullable, types as above | ✅ 7 rows, all in `public`, all nullable: `companies.yappchattuserid` uuid, `yappchattemail` varchar(255), `yappchattlinkedat` timestamptz, `yappchattgroupid` uuid; `userprofiles.yappchattuserid` uuid; `projectrooms.owneryappchattid` uuid, `retiredat` timestamptz |
| `projectrooms_projectid_agentname_active_key` | unique, `WHERE (retiredat IS NULL)` | ✅ `CREATE UNIQUE INDEX … ON public.projectrooms USING btree (projectid, agentname) WHERE (retiredat IS NULL)` |
| `projectrooms_projectid_agentname_key` | gone | ✅ 0 rows |
| Declared-but-missing tables (`npm run db:drift`) | 0 | First run: 1, and **not this change** (`agentruns`, SPEC-143, then unapplied). Re-run after `agentruns` was applied (entry below): ✅ 0, "every declared table exists" |
| `auditfences --schema` | exit 0 | Not run |

**Companion change in YappChatt (SPEC-093 / T006):** `YappChat/apps/web/drizzle/0031_conversation_retiredat.sql`
(`yappchat.conversations.retiredat`, timestamptz, nullable) was applied by Andy on 2026-10-24 to
the YappChatt database. Andy reported the verify query returning the row; not independently
re-checked from this repo.

---

## 2026-10-24 — `specs/143-agent-model-routing-metering/agentruns.sql` — `agentruns` (SPEC-143 / FR-002) ✅ APPLIED

Applied by hand by Andy on 2026-10-24. One table and two indexes were added. Nothing existing was
altered or dropped.

| Change | Object | Note |
| --- | --- | --- |
| CREATE TABLE | `agentruns` | One row per agent run or main-session command turn. 24 columns: ids, short labels, counts, flags and timestamps only; no prompt text, code or customer data. `id` uuid with no DB default (the app generates UUID v7). FKs to `companyprojects` (cascade), `aispecsessions` and `projecttasks` (set null). 5 CHECK constraints (kind, difficulty, route, variant, non-negative counts) |
| CREATE INDEX | `idx_agentruns_project_start` | `(projectid, starttime)` |
| CREATE INDEX | `idx_agentruns_aispecsession` | PARTIAL — `(aispecsessionid) WHERE aispecsessionid IS NOT NULL` |

**Verification (2026-10-24, read-only, `BEGIN READ ONLY`, through the app's own connection):**

| Check | Expected | Actual |
| --- | --- | --- |
| `to_regclass('public.agentruns')` | `agentruns` | ✅ `agentruns` |
| Named columns / all columns | 24 / 24 | ✅ 24 / 24 |
| CHECK constraints | 5 | ✅ 5 |
| Foreign keys | 3 | ✅ 3 |
| Indexes (PK + 2) | 3 | ✅ 3 |
| App role privileges | SELECT, INSERT, UPDATE | ✅ all three, for `wxkanban_app` (`has_table_privilege`) |
| Rows | 0 | 0 |
| `npm run db:drift` | 0 declared-but-missing | ✅ 0, "every declared table exists" |

**Order kept.** The table now exists; `src/db/schema/agentrun.ts` may be exported from
`src/db/schema/index.ts` and `src/server/routes/agentRuns.ts` mounted (SPEC-143), not before.

---

## 2026-10-24 — `specs/144-company-yappchatt-account/sql/0002-consultant-approvers.sql` — consultant approvers flag (SPEC-144 FR-012) ✅ APPLIED

Applied by hand by Andy on 2026-10-24. Two columns were added. Nothing was altered or dropped.

| Change | Object | Note |
| --- | --- | --- |
| ADD COLUMN | `engagements.consultantapprovers` | `boolean NOT NULL DEFAULT false`. The client lets the consulting company's ADMINs and TEAM_MANAGERs act as Room Approvers (contracts D6) |
| ADD COLUMN | `engagementinvitations.consultantapprovers` | `boolean NOT NULL DEFAULT false`. The choice made in the invitation, copied to the engagement on accept |

**Verification (2026-10-24, read-only, `BEGIN READ ONLY`, through the app's own connection):**

| Check | Expected | Actual |
| --- | --- | --- |
| `information_schema.columns` | 2 rows, boolean, default false, NOT NULL | ✅ both: `boolean`, `column_default false`, `is_nullable NO` |
| Existing rows | all false | ✅ 2 engagements and 3 invitations, 0 with the flag on |

**Order kept.** Applied before SPEC-144 T016 declares the columns in `src/db/schema/`. Nothing
declares them yet.

---

## 2026-10-25 — `companyprojects.allowremote` — "Allow remote" per project (SCOPE-132 Amendment B, FR-036) ✅ APPLIED

Applied by hand by Andy on 2026-10-25, in two steps: the column was added nullable with
`DEFAULT false`, then made `NOT NULL` once verified to hold no NULLs. Nothing else was altered.

| Change | Object | Note |
| --- | --- | --- |
| ADD COLUMN | `companyprojects.allowremote` | `boolean NOT NULL DEFAULT false`. A company ADMIN or that project's TEAM_MANAGER allows the project agent (the remote) to start; the server enforces it on every start (FR-037) |

**Verification (2026-10-25, read-only, `BEGIN READ ONLY`, through the app's own connection):**

| Check | Expected | Actual |
| --- | --- | --- |
| `information_schema.columns` | boolean, default false, NOT NULL | ✅ `boolean`, `column_default false`, `is_nullable NO` |
| Existing rows | all false | ✅ 192 projects, 0 allowed, 0 NULL |
| App role privileges | SELECT, UPDATE | ✅ `wxkanban_app` has both on the column |

**Order kept.** Applied before any schema file declares it. `companyprojects` is read on nearly every
request, so declaring it first would 500 the application.

---

## 2026-10-25 — `projectdocuments` kind + retire columns (SCOPE-124 Amendment C, T026 / FR-011 step 1) ✅ APPLIED

SQL: `specs/124-idempotent-spec-persistence/sql/0001-document-kind-retire.sql`. Applied by hand by Andy
on 2026-10-25. Additive only, in one transaction; no defaults, no index, no row rewrite.

| Change | Object | Note |
| --- | --- | --- |
| ADD COLUMN | `projectdocuments.kind` | `varchar(50)`, nullable. A document's kind from its file name (spec, plan, tests, tasks, lifecycle); identity becomes (project, spec, kind), never the title (FR-010) |
| ADD COLUMN | `projectdocuments.retiredat` | `timestamptz`, nullable. NULL = live; delete becomes retire (FR-013) |
| ADD COLUMN | `projectdocuments.retiredbyid` | `uuid`, nullable, FK `userprofiles(id) ON DELETE SET NULL` |
| ADD COLUMN | `projectdocuments.retiredreason` | `text`, nullable |

**Verification (2026-10-25, read-only, `SET TRANSACTION READ ONLY`, through the app's own connection):**

| Check | Expected | Actual |
| --- | --- | --- |
| `information_schema.columns` | 4 rows, all nullable | ✅ kind `character varying`, retiredat `timestamp with time zone`, retiredbyid `uuid`, retiredreason `text`; all `YES` |
| Foreign key | 1, ON DELETE SET NULL | ✅ `projectdocuments_retiredbyid_fkey` FOREIGN KEY (retiredbyid) REFERENCES userprofiles(id) ON DELETE SET NULL |
| Existing rows | untouched | ✅ 16,158 rows; 0 retired; 0 with a kind |
| App role privileges | SELECT, UPDATE | ✅ `wxkanban_app` holds INSERT, SELECT, UPDATE on all four columns |
| `npm run db:drift` | exit 0 | ✅ every declared table exists (19 undeclared, informational) |

**Order to keep.** Apply before T027 declares the columns in `src/db/schema/projectdocuments.ts`
and `mcp-server/src/db/schema.ts` — `projectdocuments` is read by every spec push and every
generator, so declaring first would 500 them. The unique live-document index (T032, step 2) is a
separate, later change: only after the T031 cleanup reports zero live duplicate groups.

---

## 2026-10-25 — `companyauditlogs` append-only for the app role (SCOPE-147, T009 / FR-008) ✅ APPLIED

SQL: `specs/147-sysadmin-action-audit-trail/sql/0001-companyauditlogs-append-only.sql`. Applied by hand
by Andy on 2026-10-25, after SCOPE-147 (app 1.5.352) was deployed and verified.

| Change | Object | Note |
| --- | --- | --- |
| REVOKE UPDATE, DELETE | `companyauditlogs` from `wxkanban_app` | The app role keeps INSERT and SELECT. No application code changes or removes audit rows (code search 2026-10-25). Company-delete cascades still run (referential actions use the owner's rights) |

**Verification (2026-10-25, as `wxkanban_app` through the app's own connection; every probe in a rolled-back transaction):**

| Check | Expected | Actual |
| --- | --- | --- |
| `role_table_grants` | INSERT, SELECT | ✅ INSERT,SELECT |
| UPDATE ... WHERE false | 42501 | ✅ refused, 42501 permission denied for table companyauditlogs |
| DELETE ... WHERE false | 42501 | ✅ refused, 42501 |
| INSERT | allowed | ✅ allowed (rolled back; 0 probe rows remain) |

---

## 2026-10-28 — `projectagentconnections` — which project agents are connected (SCOPE-132 Amendment D, SPEC-151 T001 / FR-058) ✅ APPLIED

SQL: `specs/151-project-agent-connections/sql/0001-projectagentconnections.sql`. Applied by hand by Andy
on 2026-10-28. Adds one table; changes nothing existing.

| Change | Object | Note |
| --- | --- | --- |
| CREATE TABLE | `projectagentconnections` | One row per project agent connection, start to stop: `projectid` FK `companyprojects` ON DELETE CASCADE, room, tag, machine, repo folder name, kit version, state, connected / last seen / disconnected, end reason. No secret, no path. UUID v7 id from the app |
| CHECK | state, endreason, closed | `state` idle / working / waiting; `endreason` stopped / stale / replaced; `disconnectedat` and `endreason` set together |
| UNIQUE INDEX | `projectagentconnections_projectid_open_key` | One open row per project (`WHERE disconnectedat IS NULL`) |
| INDEX | `idx_projectagentconnections_project_connected` | `(projectid, connectedat DESC)` for history reads |
| GRANT | SELECT, INSERT, UPDATE to `wxkanban_app` | |

**Verification (2026-10-28, read-only, through the app's own connection):**

| Check | Expected | Actual |
| --- | --- | --- |
| Table | exists | ✅ `projectagentconnections` |
| Columns | 12 | ✅ 12 |
| Check constraints | 3 | ✅ 3 |
| Indexes | 3 (PK + 2) | ✅ 3 |
| App role privileges | INSERT, SELECT, UPDATE | ⚠ DELETE, INSERT, SELECT, UPDATE — DELETE was not in the SQL, so it comes from the schema's default privileges. No code deletes from this table; revoke it if the app role should not hold it |
| Rows | 0 | ✅ 0 |
| `npm run db:drift` | exit 0 | ✅ every declared table exists (19 undeclared, informational) |

**Order kept.** Applied and verified before `src/db/schema/index.ts` exported
`projectagentconnection.ts` and before any push of the routes or the MCP tool that read and write it.

---

## 2026-10-28 — `agentdevicetokens` — K.A.I.N. sign-in per person and device; Company Access Tokens retired (SCOPE-132 Amendment F, SPEC-152 T002 / FR-065, FR-069) ✅ APPLIED

SQL: `specs/152-kain-signin-agent-reach/sql/0001-agentdevicetokens.sql` (DDL) and
`specs/152-kain-signin-agent-reach/sql/0002-retire-company-agent-tokens.sql` (data). Both applied by hand by
Andy on 2026-10-28.

| Change | Object | Note |
| --- | --- | --- |
| CREATE TABLE | `agentdevicetokens` | One row per K.A.I.N. sign-in per person and device: `userid` FK `userprofiles`, `companyid` FK `companies` (both ON DELETE CASCADE), device name, SHA-256 of the device token (never the token, never a password), created / last used / revoked, revoked by, reason. UUID v7 id from the app |
| CHECK | revokereason, revoked | `revokereason` revoked / replaced / password_changed; `revokedat` and `revokereason` set together |
| UNIQUE INDEX | `agentdevicetokens_tokenhash_key` | Lookup by hash on every K.A.I.N. call |
| UNIQUE INDEX | `agentdevicetokens_user_device_live_key` | One live token per `(userid, devicename)` (`WHERE revokedat IS NULL`) |
| INDEX | `idx_agentdevicetokens_company` | `(companyid, createdat DESC)` for the ADMIN device list |
| GRANT | SELECT, INSERT, UPDATE to `wxkanban_app` | |
| DATA | `companyagenttokens` | Every live Company Access Token revoked (`revokedat`), one `companyauditlogs` row `agent.token.retired` per token with reason `replaced_by_signin`. Rows kept. `projectagentgrants` untouched |

**Verification (2026-10-28, read-only, through the app's own connection):**

| Check | Expected | Actual |
| --- | --- | --- |
| Table | exists | ✅ `agentdevicetokens` |
| Columns | 10 | ✅ 10 |
| Check constraints | 2 | ✅ 2 |
| Indexes | 4 (PK + 3) | ✅ 4 |
| App role privileges | INSERT, SELECT, UPDATE | ⚠ DELETE, INSERT, SELECT, UPDATE — DELETE comes from the schema's default privileges, as for `projectagentconnections`. No code deletes from this table |
| Live Company Access Tokens after 0002 | 0 | ✅ 0 of 9 |
| `agent.token.retired` audit rows | one per token revoked | ✅ 3 |
| `npm run db:drift` | exit 0 | ✅ every declared table exists (19 undeclared, informational) |

**Order.** `0001` applied and verified before `src/db/schema/index.ts` exported `agentdevicetoken.ts` and
before the MCP mirror declared it. **`0002` was applied ahead of the release** that ships K.A.I.N. sign-in, so
a running K.A.I.N. holding a Company Access Token is refused until SPEC-152 deploys.

---

## 2026-11-01 — Time and Billing columns on `companies`, `companyprojects`, `customers`, `projectinvoices`, `projecttimeentries` (SCOPE-005 Amendment A, SPEC-005 T001 / FR-002, FR-005, FR-007, FR-008, FR-009, FR-011, FR-012) ✅ APPLIED

SQL: `src/db/migrations/0072_scope005_time_billing.sql`, one transaction, idempotent. Applied by hand by Andy
on 2026-11-01.

| Change | Object | Note |
| --- | --- | --- |
| ALTER DEFAULT | `companies.hourlyrate` | `150.00` for new companies (default Developer rate). Existing NULL rows untouched; the app falls back to 150.00 |
| ADD COLUMN | `companies` | `resourcerate` numeric(10,2) NOT NULL DEFAULT 50.00; `achbankname`, `achroutingnumber`, `achaccountnumber`, `achaccountname` text (AES-256-GCM ciphertext only) |
| ADD COLUMN | `companyprojects` | `billed` boolean NOT NULL DEFAULT false; `resourcerate` numeric(10,2) (override) |
| ADD COLUMN | `customers` | `billingcycle` varchar(10) NOT NULL DEFAULT 'weekly' |
| ADD COLUMN | `projectinvoices` | `customerid` uuid, `periodstart`, `periodend` date, `developerhours`, `resourcehours` numeric(10,2) |
| DROP NOT NULL | `projecttimeentries.taskid` | Entries sit on scope or project lines, not tasks |
| ADD COLUMN | `projecttimeentries` | `specid`, `enteredbyid`, `invoiceid` uuid; `category` varchar(10); `line` varchar(12); `model` varchar(100); `workdate` date; `resourcecount` integer (owner-approved addition, FR-009) |
| FK | `projecttimeentries.specid` → `projectspecifications` | ON DELETE SET NULL |
| FK | `projecttimeentries.enteredbyid` → `userprofiles` | ON DELETE SET NULL |
| FK | `projecttimeentries.invoiceid` → `projectinvoices` | ON DELETE RESTRICT (locked entries keep their statement) |
| FK | `projectinvoices.customerid` → `customers` | ON DELETE RESTRICT (customers are archive-only) |
| CHECK | `projecttimeentries` | category developer/resource; line scope/brainstorm/process; resource needs model; resourcecount ≥ 0; negative duration needs a note |
| CHECK | `customers.billingcycle` | weekly / biweekly |
| UNIQUE INDEX | `idx_projecttimeentries_agentpull` | (projectid, line, COALESCE(specid, zero uuid), workdate, model) WHERE source = 'agentrun' — FR-007 idempotent pull |
| INDEX | `idx_projecttimeentries_company_workdate`, `idx_projecttimeentries_invoice`, `idx_projectinvoices_customer_periodend` | Range totals, locked-entry lookup, last statement per Customer |

**Verification** (read-only, run 2026-11-01 after apply):

| Check | Expected | Actual |
| --- | --- | --- |
| Columns | 23 | ✅ 23, types, nullability and defaults as listed |
| Constraints | 10, all validated | ✅ 10, all `convalidated = true` |
| Indexes | 4 | ✅ 4 |
| Time entries with a category | 0 (no data touched) | ✅ 0 |
| App role privileges on the 5 tables | unchanged | ✅ DELETE, INSERT, SELECT, UPDATE (as before) |
| `npm run db:drift` | exit 0 | ✅ every declared table exists (19 undeclared, informational) |

**Order kept.** Applied and verified before SPEC-005 T002 declares any of these columns in `src/db/schema/`.

## 0073 — SPEC-005 Amendment B: `projectbillings` (FR-014) — APPLIED 2026-11-02

**File**: `src/db/migrations/0073_scope005_projectbillings.sql` · **Status**: applied by the owner, verified

| Change | Object | Detail |
| --- | --- | --- |
| CREATE TABLE | `projectbillings` | A consulting company's billing settings for an engaged client project: `companyid` (billing company), `projectid`, `customerid`, `billed`, `hourlyrate`, `resourcerate`, `updatedbyid`, `createdat`, `updatedat` |
| FK | `companyid` → `companies`, `projectid` → `companyprojects` | ON DELETE CASCADE |
| FK | `customerid` → `customers`, `updatedbyid` → `userprofiles` | ON DELETE SET NULL |
| CHECK | `hourlyrate`, `resourcerate` | NULL or 0 – 10,000.00 |
| UNIQUE INDEX | `projectbillings_company_project_key` | (companyid, projectid) |
| INDEX | `projectbillings_projectid_idx` | (projectid) |
| GRANT | `wxkanban_app` | SELECT, INSERT, UPDATE, DELETE |

**Verification** (read-only, run 2026-11-02 after apply):

| Check | Expected | Actual |
| --- | --- | --- |
| Columns | 10 | ✅ 10, types, nullability and defaults as written |
| Constraints | 7 (pkey, 4 FK, 2 CHECK), validated | ✅ 7, all `convalidated = true` |
| Indexes | 3 | ✅ pkey, company_project_key, projectid_idx |
| App role privileges | SELECT, INSERT, UPDATE, DELETE | ✅ `wxkanban_app` has all four |
| Rows | 0 | ✅ 0 |
| `npm run db:drift` | exit 0 | ✅ every declared table exists; `projectbillings` listed undeclared until T022 declares it |

## 0074 — SPEC-005 Amendment D: `projecttimeentries.line` accepts dba, management, meeting (FR-003) — ✅ APPLIED

**File**: `src/db/migrations/0074_scope005_time_lines.sql` · **Status**: written 2026-11-02; applied by the owner and verified 2026-11-02

| Change | Object | Detail |
| --- | --- | --- |
| DROP + ADD CHECK | `projecttimeentries_line_check` | `line IS NULL OR line IN ('scope','brainstorm','process','dba','management','meeting')` — a superset of the old rule, so every existing row passes |
| COMMENT | `projecttimeentries.line` | lists the six values |

**Order**: apply and verify BEFORE deploying the app version that writes the new lines; until then a DBA / Management / Meetings entry fails with 23514.

**Verification** (read-only, to run after apply):

| Check | Expected | Actual |
| --- | --- | --- |
| `pg_get_constraintdef` of `projecttimeentries_line_check` | the six values above | ✅ the six values |
| `convalidated` | true | ✅ true |

## 0075 — SPEC-143 Amendment A: `agentruns.companyid` and route narrowed to official (FR-002, FR-017) — ✅ APPLIED

**File**: `src/db/migrations/0075_scope143_agentruns_company.sql` · **Status**: written 2026-11-02; applied by the owner and verified 2026-11-02

| Change | Object | Detail |
| --- | --- | --- |
| ADD COLUMN | `agentruns.companyid` | uuid NOT NULL, no backfill: the table holds 0 rows, and the script refuses if it holds any while the column is missing |
| ADD FK | `fk_agentruns_company` | `companyid` → `companies(id)` ON DELETE CASCADE |
| CREATE INDEX | `idx_agentruns_company_start` | `(companyid, starttime)` — the agent-run pull reads by company and day |
| DROP + ADD CHECK | `chk_agentruns_route` | `route = 'official'` (OmniRoute removed, D1); refuses if any row has another route |
| COMMENT | `agentruns.companyid`, `agentruns.route` | meaning of each |
| GRANT | `wxkanban_app` | SELECT, INSERT, UPDATE (as agentruns.sql requires; no DELETE) |

**Order**: apply and verify BEFORE the app version that declares `companyid` (SPEC-143 T024) is deployed; declaring it first returns 500s on every agentruns read.

**Verification** (read-only, the queries in the file's header):

| Check | Expected | Actual |
| --- | --- | --- |
| `companyid` column | uuid, NOT NULL | ✅ uuid, NO |
| `fk_agentruns_company` | FK to companies(id) ON DELETE CASCADE, validated | ✅ |
| `chk_agentruns_route` | `route = 'official'`, validated | ✅ |
| `idx_agentruns_company_start` | btree (companyid, starttime) | ✅ |
| `has_table_privilege('wxkanban_app', …, 'SELECT,INSERT,UPDATE')` | true | ✅ true (DELETE was already granted before 0075) |
| column count | 25 | ✅ 25 (0 rows) |
| `npm run db:drift` | exit 0 | ✅ every declared table exists |

## 0076 — SPEC-143 Amendment A / SPEC-005 Amendment E: `idx_projecttimeentries_agentpull` keyed by company (FR-014, FR-017) — ✅ APPLIED

**File**: `src/db/migrations/0076_scope143_agentpull_company.sql` · **Status**: written 2026-11-02; applied by the owner and verified 2026-11-03

| Change | Object | Detail |
| --- | --- | --- |
| DROP + CREATE UNIQUE INDEX | `idx_projecttimeentries_agentpull` | `(companyid, projectid, line, COALESCE(specid, nil-uuid), workdate, model) WHERE source = 'agentrun'` — was the same key without `companyid` |

**Why**: the agent-run pull now runs per billing company (`agentruns.companyid`, 0075). On an engaged client project, the consultant's pull and the client's own pull for the same project, day and model would otherwise land on one row and overwrite each other's hours.

**Safety**: the new key is the old key plus one column, so the CREATE cannot fail on existing data. It is inside one transaction and re-running it is a no-op.

**Order**: apply and verify BEFORE the app version whose pull names `companyid` in its ON CONFLICT target (SPEC-143 T027) is deployed; otherwise every pull fails with 42P10.

**Verification** (read-only):

| Check | Expected | Actual |
| --- | --- | --- |
| `indexdef` | UNIQUE btree `(companyid, projectid, line, COALESCE(specid, …), workdate, model) WHERE source = 'agentrun'` | ✅ matches |
| `indisunique` / `indisvalid` / `indisready` | true / true / true | ✅ true / true / true |
| agent-pull rows at apply time | — | 0 |

## 0077 — SPEC-005 Amendment F: timer Pause/Resume, `projecttimeentries.pausedat` and `pausedseconds` (FR-006) — ✅ APPLIED

**File**: `src/db/migrations/0077_scope005_timer_pause.sql` · **Status**: written 2026-11-03; applied by the owner and verified 2026-11-03

| Change | Object | Detail |
| --- | --- | --- |
| ADD COLUMN | `projecttimeentries.pausedat` | timestamp, NULL — set while a timer is paused |
| ADD COLUMN | `projecttimeentries.pausedseconds` | integer NOT NULL DEFAULT 0 — total paused seconds, excluded from the duration (no table rewrite: constant default) |
| ADD CHECK | `chk_projecttimeentries_pausedseconds` | `pausedseconds >= 0` |
| COMMENT | both columns | meaning of each |

**Order**: apply and verify BEFORE the app version that declares the two columns (SPEC-005 T029) is deployed; declaring them first returns 500s on every Time & Billing read.

**Verification**: the read-only queries in the file's header (expected results there).

| Check | Expected | Actual |
| --- | --- | --- |
| `pausedat` | timestamp without time zone, NULL, no default | ✅ |
| `pausedseconds` | integer, NOT NULL, default 0 | ✅ |
| `chk_projecttimeentries_pausedseconds` | `CHECK ((pausedseconds >= 0))`, validated | ✅ |
| rows with a pause at apply time | 0 | ✅ 0 |

## 0078 — SPEC-154: Autopilot switch and run marker (SCOPE-132 Amendment H, FR-001, FR-008) — ✅ APPLIED

**File**: `specs/154-project-agent-autopilot/sql/0001-autopilot-switch.sql` · **Status**: written 2026-11-07; applied by the owner and verified 2026-11-07

| Change | Object | Detail |
| --- | --- | --- |
| ADD COLUMN | `companyprojects.autopilotenabled` | boolean NOT NULL DEFAULT false — lets the project's agent work the dev plan unattended; off by default |
| ADD COLUMN | `projectagentconnections.autopilotrunactive` | boolean, NULL — distinguishes an active unattended run from an idle agent connection, so the server can derive a missed-heartbeat alert from this record alone |

**Order**: applied and verified BEFORE the Drizzle declarations in `src/db/schema/companyproject.ts` and `src/db/schema/projectagentconnection.ts` (SPEC-154 T001); declaring either column first would 500 every query against its table.

**Verification** (read-only, the query in the file's header):

| Check | Expected | Actual |
| --- | --- | --- |
| `companyprojects.autopilotenabled` | boolean, NOT NULL, default false | ✅ boolean, NO, false |
| `projectagentconnections.autopilotrunactive` | boolean, NULL, no default | ✅ boolean, YES, null |
| `npm run db:drift` | exit 0 | ✅ every declared table exists (table-level only; column-level confirmed by the query above) |

## 0079 — SPEC-155: K.A.I.N. session status (SCOPE-132 Amendment G piece A, FR-002, FR-003, FR-004) — ✅ APPLIED

**File**: `specs/155-kain-session-status/sql/0001-session-status.sql` · **Status**: written 2026-11-07; applied by the owner and verified 2026-11-07

| Change | Object | Detail |
| --- | --- | --- |
| ADD COLUMN | `projectagentconnections.sessionsummary` | varchar(1500), NULL — agent-maintained rolling summary, masked twice before upload |
| ADD COLUMN | `projectagentconnections.lastentry` | varchar(500), NULL — most recent masked turn summary |
| ADD COLUMN | `projectagentconnections.blockers` | jsonb, NULL — open blocker titles only, no bodies |
| ADD COLUMN | `projectagentconnections.sharing` | boolean NOT NULL DEFAULT false — mirrors the Cockpit `shareStatus` setting as of the last heartbeat |
| ADD COLUMN | `projectagentconnections.summaryat` | timestamptz, NULL — when the three content columns above were last written |

**Order**: must be applied and verified BEFORE the Drizzle declarations in
`src/db/schema/projectagentconnection.ts` and the `mcp-server` schema mirror (SPEC-155 T001);
declaring any of these columns first would 500 every query against `projectagentconnections`.

**Verification** (read-only, the query in the file's header):

| Check | Expected | Actual |
| --- | --- | --- |
| `sessionsummary` | varchar(1500), NULL, no default | ✅ character varying, YES, null |
| `lastentry` | varchar(500), NULL, no default | ✅ character varying, YES, null |
| `blockers` | jsonb, NULL, no default | ✅ jsonb, YES, null |
| `sharing` | boolean, NOT NULL, default false | ✅ boolean, NO, false |
| `summaryat` | timestamptz, NULL, no default | ✅ timestamp with time zone, YES, null |
| `npm run db:drift` | exit 0 | ✅ every declared table exists (table-level only; column-level confirmed by the query above) |
