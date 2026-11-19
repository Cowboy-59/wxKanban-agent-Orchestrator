# Database Analysis — wxKanban

**Engine**: postgres  
**Run at**: 2026-08-02T14:05:57.593Z  
**Findings**: 6 critical, 107 high, 126 medium, 165 low, 36 info — 4 dimensions not fully run

## Findings by rule

| Rule | Count |
| --- | --- |
| integrity.unindexed-fk | 101 |
| performance.unused-index | 73 |
| data.empty-table | 55 |
| data.all-null-column | 36 |
| data.high-null-density | 35 |
| integrity.not-probed | 33 |
| schema.undeclared-table | 24 |
| integrity.missing-fk | 23 |
| schema.source-conflict | 20 |
| schema.type-mismatch | 10 |
| integrity.undeclared-fk | 6 |
| schema.undeclared-column | 6 |
| performance.seq-scan-heavy | 4 |
| integrity.cross-tenant | 3 |
| schema.nullability-mismatch | 3 |
| integrity.action-mismatch | 1 |
| integrity.tenant-coverage-gap | 1 |
| maintenance.bloat-unmeasurable | 1 |
| maintenance.never-analyzed | 1 |
| performance.duplicate-check-skipped | 1 |
| performance.duplicate-index | 1 |
| performance.no-statement-stats | 1 |
| schema.missing-column | 1 |

## Dimension coverage

| Dimension | Support | Note |
| --- | --- | --- |
| schema | full |  |
| integrity | full |  |
| data | full |  |
| performance | full |  |
| maintenance | full |  |
| conventions | not-implemented | arrives in wxDBAnalyze Phase 2 |
| security | not-implemented | arrives in wxDBAnalyze Phase 2 |
| availability | not-implemented | arrives in wxDBAnalyze Phase 2 |
| impact | not-implemented | arrives in wxDBAnalyze Phase 2 |

## Findings

### CRITICAL — companyauditlogs.changedby — `integrity.cross-tenant.companyauditlogs.changedby`

**Rule**: `integrity.cross-tenant`  
**Severity**: critical  
**Urgency**: immediate  
**Confidence**: proven

1 companyauditlogs rows carry a tenant that disagrees with their parent userprofiles row.

**Why it needs changing**: No foreign key can express this — a constraint checks that the parent exists, not that it belongs to the same tenant. Any query filtering by tenant on the child while joining through the parent (or the reverse) returns rows belonging to a different customer.

**Business impact**: Cross-tenant data exposure: one customer can see another customer's rows through whichever of the two paths disagrees.

**Doing nothing**: The exposure persists and grows with every write that repeats the defect.

**Remediation** (manual-only, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Correcting the tenant on an affected row moves data between customers; it must be decided per row, not applied in bulk.

**Rollback**: n/a

**Evidence**

```sql
select count(*)::bigint as mismatches from "companyauditlogs" c join "userprofiles" p on c."changedby" = p."id" where c."companyid" is not null and p."companyid" is not null and c."companyid" <> p."companyid"
```

---

### CRITICAL — feedbacksubmissions.duplicateofid — `integrity.cross-tenant.feedbacksubmissions.duplicateofid`

**Rule**: `integrity.cross-tenant`  
**Severity**: critical  
**Urgency**: immediate  
**Confidence**: proven

4 feedbacksubmissions rows carry a tenant that disagrees with their parent feedbacksubmissions row.

**Why it needs changing**: No foreign key can express this — a constraint checks that the parent exists, not that it belongs to the same tenant. Any query filtering by tenant on the child while joining through the parent (or the reverse) returns rows belonging to a different customer.

**Business impact**: Cross-tenant data exposure: one customer can see another customer's rows through whichever of the two paths disagrees.

**Doing nothing**: The exposure persists and grows with every write that repeats the defect.

**Remediation** (manual-only, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Correcting the tenant on an affected row moves data between customers; it must be decided per row, not applied in bulk.

**Rollback**: n/a

**Evidence**

```sql
select count(*)::bigint as mismatches from "feedbacksubmissions" c join "feedbacksubmissions" p on c."duplicateofid" = p."id" where c."companyid" is not null and p."companyid" is not null and c."companyid" <> p."companyid"
```

---

### CRITICAL — feedbacksubmissions.projectid — `integrity.cross-tenant.feedbacksubmissions.projectid`

**Rule**: `integrity.cross-tenant`  
**Severity**: critical  
**Urgency**: immediate  
**Confidence**: proven

48 feedbacksubmissions rows carry a tenant that disagrees with their parent companyprojects row.

**Why it needs changing**: No foreign key can express this — a constraint checks that the parent exists, not that it belongs to the same tenant. Any query filtering by tenant on the child while joining through the parent (or the reverse) returns rows belonging to a different customer.

**Business impact**: Cross-tenant data exposure: one customer can see another customer's rows through whichever of the two paths disagrees.

**Doing nothing**: The exposure persists and grows with every write that repeats the defect.

**Remediation** (manual-only, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Correcting the tenant on an affected row moves data between customers; it must be decided per row, not applied in bulk.

**Rollback**: n/a

**Evidence**

```sql
select count(*)::bigint as mismatches from "feedbacksubmissions" c join "companyprojects" p on c."projectid" = p."id" where c."companyid" is not null and p."companyid" is not null and c."companyid" <> p."companyid"
```

---

### CRITICAL — companyauditlogs.changedby — `integrity.missing-fk.companyauditlogs.changedby`

**Rule**: `integrity.missing-fk`  
**Severity**: critical  
**Urgency**: immediate  
**Confidence**: proven

companyauditlogs.changedby references userprofiles.id (asserted by declared) but no foreign key enforces it. 7 of ~292 rows are orphaned.

**Why it needs changing**: Nothing stops a companyauditlogs row pointing at a userprofiles that no longer exists, and 7 rows already do. Any join to userprofiles silently drops those rows, so they vanish from lists and aggregates rather than raising an error anyone would notice.

**Business impact**: 7 rows are already unreachable through their parent. Any per-userprofiles count, total or report built on a join undercounts by that amount, silently.

**Doing nothing**: The orphan count grows with every parent deletion, and the affected rows stay invisible to anyone reading through the parent.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: milliseconds — NOT VALID does not scan existing rows)

```sql
alter table "companyauditlogs" add constraint "companyauditlogs_changedby_fkey" foreign key ("changedby") references "userprofiles" ("id") not valid;
```

**Fix risk**: NOT VALID is safe and immediate, but it does not repair the existing 7 orphans — those are emitted separately for manual handling, because deleting versus re-parenting is a business decision.

**Rollback**: alter table "companyauditlogs" drop constraint "companyauditlogs_changedby_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "companyauditlogs" c left join "userprofiles" p on c."changedby" = p."id" where c."changedby" is not null and p."id" is null
```

---

### CRITICAL — mcprequestaudit.customerid — `integrity.missing-fk.mcprequestaudit.customerid`

**Rule**: `integrity.missing-fk`  
**Severity**: critical  
**Urgency**: immediate  
**Confidence**: proven

mcprequestaudit.customerid references customers.id (asserted by convention) but no foreign key enforces it. 387658 rows are orphaned — more than the planner's ~386423-row estimate for mcprequestaudit. The estimate is a stale statistics snapshot from the last ANALYZE, not a live count; the orphan count itself comes from a direct count(*) and is exact, so it is the number to trust.

**Why it needs changing**: Nothing stops a mcprequestaudit row pointing at a customers that no longer exists, and 387658 rows already do. Any join to customers silently drops those rows, so they vanish from lists and aggregates rather than raising an error anyone would notice.

**Business impact**: 387658 rows are already unreachable through their parent. Any per-customers count, total or report built on a join undercounts by that amount, silently.

**Doing nothing**: The orphan count grows with every parent deletion, and the affected rows stay invisible to anyone reading through the parent.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: milliseconds — NOT VALID does not scan existing rows)

```sql
alter table "mcprequestaudit" add constraint "mcprequestaudit_customerid_fkey" foreign key ("customerid") references "customers" ("id") not valid;
```

**Fix risk**: NOT VALID is safe and immediate, but it does not repair the existing 387658 orphans — those are emitted separately for manual handling, because deleting versus re-parenting is a business decision.

**Rollback**: alter table "mcprequestaudit" drop constraint "mcprequestaudit_customerid_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "mcprequestaudit" c left join "customers" p on c."customerid" = p."id" where c."customerid" is not null and p."id" is null
```

---

### CRITICAL — projecttimeentries.phaseid — `schema.missing-column.projecttimeentries.phaseid`

**Rule**: `schema.missing-column`  
**Severity**: critical  
**Urgency**: immediate  
**Confidence**: proven

projecttimeentries.phaseid (uuid) is declared but absent from the deployed projecttimeentries.

**Why it needs changing**: Bare db.select().from(projecttimeentries) — the dominant read pattern in this codebase — asks Drizzle to project every declared column, so those reads fail with 42703 even when nothing in the call references phaseid. Partial selects that name only the columns they need keep working, because they never ask for the missing one. The result is not a total outage: it looks intermittent and endpoint-specific, which is harder to diagnose than a clean failure.

**Business impact**: Every bare-select read of projecttimeentries returns 500 until the column is added; partial-select reads that omit it keep succeeding, so the outage presents as inconsistent rather than total.

**Doing nothing**: Bare-select reads of projecttimeentries continue to fail; partial-select reads that omit this column continue to mask the gap.

**Remediation** (additive-safe, lock: ACCESS EXCLUSIVE, held briefly (catalog-only on PG 11+), duration: milliseconds — no table rewrite for a nullable column)

```sql
alter table "projecttimeentries" add column "phaseid" uuid;
```

**Fix risk**: Adding a nullable column takes a brief catalog-only lock on PG 11+ and does not rewrite the table.

**Rollback**: alter table "projecttimeentries" drop column "phaseid";

**Evidence**

```sql
select attname from pg_catalog.pg_attribute where attrelid = $table
```

---

### HIGH — userprofiles.companyid — `integrity.action-mismatch.userprofiles.companyid`

**Rule**: `integrity.action-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

userprofiles.companyid is declared with ON DELETE restrict but the live constraint userprofiles_companyid_fkey enforces ON DELETE set null.

**Why it needs changing**: Every reader of the code sees ON DELETE restrict declared on userprofiles.companyid and reasons about deletes and updates accordingly, but the database actually enforces ON DELETE set null. The affected operation behaves differently than every reader of the code expects, and code review cannot catch it because the truth is not in the code — it is only in the live catalog.

**Business impact**: A companies deletion or key update behaves as declared in the live constraint (ON DELETE set null) while the code declares ON DELETE restrict, so the path the team tested against the declared behaviour is not the one that actually runs.

**Doing nothing**: The declared and enforced referential-action semantics keep disagreeing, and the next person to read the code is misled by it.

**Remediation** (manual-only, lock: n/a — code change or migration decision only, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling requires deciding which behaviour is correct — updating the code to declare the enforced action, or migrating the constraint to match the code — and that decision is a business one, not a mechanical fix.

**Rollback**: n/a

**Evidence**

```sql
select confdeltype, confupdtype from pg_catalog.pg_constraint where contype = 'f'
```

---

### HIGH — favoritetask.userprofileid — `integrity.missing-fk.favoritetask.userprofileid`

**Rule**: `integrity.missing-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

favoritetask.userprofileid references userprofiles.id (asserted by convention) but no foreign key enforces it. Orphans were not measured — child column is bigint but parent key is uuid — the comparison would require a cast, which no foreign key could express either.

**Why it needs changing**: Nothing prevents a favoritetask row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing favoritetask row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans ~41 rows without blocking writes)

```sql
alter table "favoritetask" add constraint "favoritetask_userprofileid_fkey" foreign key ("userprofileid") references "userprofiles" ("id") not valid;
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "favoritetask" drop constraint "favoritetask_userprofileid_fkey";

**Evidence**

```sql
anti-join not executed
```

---

### HIGH — feesxref.settingsid — `integrity.missing-fk.feesxref.settingsid`

**Rule**: `integrity.missing-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

feesxref.settingsid references settings.id (asserted by convention) but no foreign key enforces it. Orphans were not measured — anti-join skipped: feesxref.settingsid is unindexed and its row count is unknown — feesxref has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: Nothing prevents a feesxref row from pointing at a deleted settings. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single settings deletion converts every referencing feesxref row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "feesxref" add constraint "feesxref_settingsid_fkey" foreign key ("settingsid") references "settings" ("id") not valid;
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "feesxref" drop constraint "feesxref_settingsid_fkey";

**Evidence**

```sql
anti-join not executed
```

---

### HIGH — openchatlist.userprofileid — `integrity.missing-fk.openchatlist.userprofileid`

**Rule**: `integrity.missing-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

openchatlist.userprofileid references userprofiles.id (asserted by convention) but no foreign key enforces it. Orphans were not measured — child column is bigint but parent key is uuid — the comparison would require a cast, which no foreign key could express either.

**Why it needs changing**: Nothing prevents a openchatlist row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing openchatlist row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "openchatlist" add constraint "openchatlist_userprofileid_fkey" foreign key ("userprofileid") references "userprofiles" ("id") not valid;
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "openchatlist" drop constraint "openchatlist_userprofileid_fkey";

**Evidence**

```sql
anti-join not executed
```

---

### HIGH — projectinvoices.projectid — `integrity.missing-fk.projectinvoices.projectid`

**Rule**: `integrity.missing-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

projectinvoices.projectid references companyprojects.id (asserted by declared) but no foreign key enforces it. Orphans were not measured — anti-join skipped: projectinvoices.projectid is unindexed and its row count is unknown — projectinvoices has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: Nothing prevents a projectinvoices row from pointing at a deleted companyprojects. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single companyprojects deletion converts every referencing projectinvoices row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "projectinvoices" add constraint "projectinvoices_projectid_fkey" foreign key ("projectid") references "companyprojects" ("id") not valid;
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "projectinvoices" drop constraint "projectinvoices_projectid_fkey";

**Evidence**

```sql
anti-join not executed
```

---

### HIGH — projectspecifications.phaseid — `integrity.missing-fk.projectspecifications.phaseid`

**Rule**: `integrity.missing-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

projectspecifications.phaseid references projectphases.id (asserted by declared) but no foreign key enforces it. Orphans were not measured — child column is character varying(50) but parent key is uuid — the comparison would require a cast, which no foreign key could express either.

**Why it needs changing**: Nothing prevents a projectspecifications row from pointing at a deleted projectphases. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single projectphases deletion converts every referencing projectspecifications row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans ~1275 rows without blocking writes)

```sql
alter table "projectspecifications" add constraint "projectspecifications_phaseid_fkey" foreign key ("phaseid") references "projectphases" ("id") not valid;
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "projectspecifications" drop constraint "projectspecifications_phaseid_fkey";

**Evidence**

```sql
anti-join not executed
```

---

### HIGH — projecttasktimelog.userprofileid — `integrity.missing-fk.projecttasktimelog.userprofileid`

**Rule**: `integrity.missing-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

projecttasktimelog.userprofileid references userprofiles.id (asserted by convention) but no foreign key enforces it. Orphans were not measured — child column is bigint but parent key is uuid — the comparison would require a cast, which no foreign key could express either.

**Why it needs changing**: Nothing prevents a projecttasktimelog row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing projecttasktimelog row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans ~1211 rows without blocking writes)

```sql
alter table "projecttasktimelog" add constraint "projecttasktimelog_userprofileid_fkey" foreign key ("userprofileid") references "userprofiles" ("id") not valid;
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "projecttasktimelog" drop constraint "projecttasktimelog_userprofileid_fkey";

**Evidence**

```sql
anti-join not executed
```

---

### HIGH — projectteam.userprofileid — `integrity.missing-fk.projectteam.userprofileid`

**Rule**: `integrity.missing-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

projectteam.userprofileid references userprofiles.id (asserted by convention) but no foreign key enforces it. Orphans were not measured — child column is bigint but parent key is uuid — the comparison would require a cast, which no foreign key could express either.

**Why it needs changing**: Nothing prevents a projectteam row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing projectteam row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans ~93 rows without blocking writes)

```sql
alter table "projectteam" add constraint "projectteam_userprofileid_fkey" foreign key ("userprofileid") references "userprofiles" ("id") not valid;
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "projectteam" drop constraint "projectteam_userprofileid_fkey";

**Evidence**

```sql
anti-join not executed
```

---

### HIGH — projecttimeentries.phaseid — `integrity.missing-fk.projecttimeentries.phaseid`

**Rule**: `integrity.missing-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

projecttimeentries.phaseid references projectphases.id (asserted by declared) but no foreign key enforces it. Orphans were not measured — child column is unknown but parent key is uuid — the comparison would require a cast, which no foreign key could express either.

**Why it needs changing**: Nothing prevents a projecttimeentries row from pointing at a deleted projectphases. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single projectphases deletion converts every referencing projecttimeentries row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "projecttimeentries" add constraint "projecttimeentries_phaseid_fkey" foreign key ("phaseid") references "projectphases" ("id") not valid;
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "projecttimeentries" drop constraint "projecttimeentries_phaseid_fkey";

**Evidence**

```sql
anti-join not executed
```

---

### HIGH — settings.userprofileid — `integrity.missing-fk.settings.userprofileid`

**Rule**: `integrity.missing-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

settings.userprofileid references userprofiles.id (asserted by convention) but no foreign key enforces it. Orphans were not measured — child column is bigint but parent key is uuid — the comparison would require a cast, which no foreign key could express either.

**Why it needs changing**: Nothing prevents a settings row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing settings row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans ~74 rows without blocking writes)

```sql
alter table "settings" add constraint "settings_userprofileid_fkey" foreign key ("userprofileid") references "userprofiles" ("id") not valid;
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "settings" drop constraint "settings_userprofileid_fkey";

**Evidence**

```sql
anti-join not executed
```

---

### HIGH — gitcommandsessions.user_id — `integrity.undeclared-fk.gitcommandsessions.user_id`

**Rule**: `integrity.undeclared-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

Constraint git_command_sessions_user_id_fkey enforces gitcommandsessions.user_id -> userprofiles.id with ON DELETE cascade, but no schema source declares it.

**Why it needs changing**: The database will apply ON DELETE cascade when a userprofiles row is removed, and no code declares that behaviour. A cascade the application does not know about deletes rows nobody expected to lose; a restrict it does not know about turns an ordinary delete into an unexplained constraint error.

**Business impact**: Deletion behaviour for gitcommandsessions is decided by the database and is invisible in code review.

**Doing nothing**: The gap between declared and enforced deletion semantics persists, and the next person to read the schema in code will be misled.

**Remediation** (manual-only, lock: n/a — code change only, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the existing constraint in the ORM is inert at runtime; the risk is declaring a different action than the one deployed.

**Rollback**: n/a

**Evidence**

```sql
select conname, confdeltype from pg_catalog.pg_constraint where contype = 'f'
```

---

### HIGH — newslettersends.issueid — `integrity.undeclared-fk.newslettersends.issueid`

**Rule**: `integrity.undeclared-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

Constraint newslettersends_issueid_newsletterissues_id_fk enforces newslettersends.issueid -> newsletterissues.id with ON DELETE cascade, but no schema source declares it.

**Why it needs changing**: The database will apply ON DELETE cascade when a newsletterissues row is removed, and no code declares that behaviour. A cascade the application does not know about deletes rows nobody expected to lose; a restrict it does not know about turns an ordinary delete into an unexplained constraint error.

**Business impact**: Deletion behaviour for newslettersends is decided by the database and is invisible in code review.

**Doing nothing**: The gap between declared and enforced deletion semantics persists, and the next person to read the schema in code will be misled.

**Remediation** (manual-only, lock: n/a — code change only, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the existing constraint in the ORM is inert at runtime; the risk is declaring a different action than the one deployed.

**Rollback**: n/a

**Evidence**

```sql
select conname, confdeltype from pg_catalog.pg_constraint where contype = 'f'
```

---

### HIGH — timeEntry.taskid — `integrity.undeclared-fk.timeEntry.taskid`

**Rule**: `integrity.undeclared-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

Constraint timeEntry_taskid_fkey enforces timeEntry.taskid -> projecttasks.id with ON DELETE cascade, but no schema source declares it.

**Why it needs changing**: The database will apply ON DELETE cascade when a projecttasks row is removed, and no code declares that behaviour. A cascade the application does not know about deletes rows nobody expected to lose; a restrict it does not know about turns an ordinary delete into an unexplained constraint error.

**Business impact**: Deletion behaviour for timeEntry is decided by the database and is invisible in code review.

**Doing nothing**: The gap between declared and enforced deletion semantics persists, and the next person to read the schema in code will be misled.

**Remediation** (manual-only, lock: n/a — code change only, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the existing constraint in the ORM is inert at runtime; the risk is declaring a different action than the one deployed.

**Rollback**: n/a

**Evidence**

```sql
select conname, confdeltype from pg_catalog.pg_constraint where contype = 'f'
```

---

### HIGH — aispecsessions.companyid — `integrity.unindexed-fk.aispecsessions.companyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

aispecsessions.companyid references companies but has no index; aispecsessions holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on companies must scan row count unknown (table has never been analyzed) of aispecsessions to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to aispecsessions for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as aispecsessions grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_aispecsessions_companyid" on "aispecsessions" ("companyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_aispecsessions_companyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — aispecsessions.projectid — `integrity.unindexed-fk.aispecsessions.projectid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

aispecsessions.projectid references companyprojects but has no index; aispecsessions holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on companyprojects must scan row count unknown (table has never been analyzed) of aispecsessions to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companyprojects is slow and blocks concurrent writes to aispecsessions for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as aispecsessions grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_aispecsessions_projectid" on "aispecsessions" ("projectid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_aispecsessions_projectid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — aispecsessions.userid — `integrity.unindexed-fk.aispecsessions.userid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

aispecsessions.userid references userprofiles but has no index; aispecsessions holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of aispecsessions to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to aispecsessions for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as aispecsessions grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_aispecsessions_userid" on "aispecsessions" ("userid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_aispecsessions_userid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — company_status_history.changed_by — `integrity.unindexed-fk.company_status_history.changed_by`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

company_status_history.changed_by references userprofiles but has no index; company_status_history holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of company_status_history to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to company_status_history for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as company_status_history grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_company_status_history_changed_by" on "company_status_history" ("changed_by");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_company_status_history_changed_by";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — companystackprofiles.createdbyid — `integrity.unindexed-fk.companystackprofiles.createdbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

companystackprofiles.createdbyid references userprofiles but has no index; companystackprofiles holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of companystackprofiles to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to companystackprofiles for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as companystackprofiles grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_companystackprofiles_createdbyid" on "companystackprofiles" ("createdbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_companystackprofiles_createdbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — companythemeprofiles.createdbyid — `integrity.unindexed-fk.companythemeprofiles.createdbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

companythemeprofiles.createdbyid references userprofiles but has no index; companythemeprofiles holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of companythemeprofiles to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to companythemeprofiles for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as companythemeprofiles grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_companythemeprofiles_createdbyid" on "companythemeprofiles" ("createdbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_companythemeprofiles_createdbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — complianceflags.triggeredbyid — `integrity.unindexed-fk.complianceflags.triggeredbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

complianceflags.triggeredbyid references userprofiles but has no index; complianceflags holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of complianceflags to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to complianceflags for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as complianceflags grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_complianceflags_triggeredbyid" on "complianceflags" ("triggeredbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_complianceflags_triggeredbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — complianceoverride.teamprojectdutyid — `integrity.unindexed-fk.complianceoverride.teamprojectdutyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

complianceoverride.teamprojectdutyid references teamprojectduty but has no index; complianceoverride holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on teamprojectduty must scan row count unknown (table has never been analyzed) of complianceoverride to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a teamprojectduty is slow and blocks concurrent writes to complianceoverride for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as complianceoverride grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_complianceoverride_teamprojectdutyid" on "complianceoverride" ("teamprojectdutyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_complianceoverride_teamprojectdutyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — dutyassignment.teamprojectdutyid — `integrity.unindexed-fk.dutyassignment.teamprojectdutyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

dutyassignment.teamprojectdutyid references teamprojectduty but has no index; dutyassignment holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on teamprojectduty must scan row count unknown (table has never been analyzed) of dutyassignment to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a teamprojectduty is slow and blocks concurrent writes to dutyassignment for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as dutyassignment grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_dutyassignment_teamprojectdutyid" on "dutyassignment" ("teamprojectdutyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_dutyassignment_teamprojectdutyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — engagementmodifications.queuedbyid — `integrity.unindexed-fk.engagementmodifications.queuedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

engagementmodifications.queuedbyid references userprofiles but has no index; engagementmodifications holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of engagementmodifications to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to engagementmodifications for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as engagementmodifications grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_engagementmodifications_queuedbyid" on "engagementmodifications" ("queuedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_engagementmodifications_queuedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — feedbacks.phaseid — `integrity.unindexed-fk.feedbacks.phaseid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

feedbacks.phaseid references projectphases but has no index; feedbacks holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on projectphases must scan row count unknown (table has never been analyzed) of feedbacks to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a projectphases is slow and blocks concurrent writes to feedbacks for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as feedbacks grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_feedbacks_phaseid" on "feedbacks" ("phaseid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_feedbacks_phaseid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — feesxref.settingsid — `integrity.unindexed-fk.feesxref.settingsid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

feesxref.settingsid references settings but has no index; feesxref holds row count unknown (table has never been analyzed).

**Why it needs changing**: No foreign key enforces feesxref.settingsid today (see the related missing-fk finding), so a settings delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and feesxref has never been analyzed, so there is no row-count estimate to say how large that sequential scan would be — its cost cannot be quantified, which is itself a reason to add the index now rather than a reason to wait until the cost is known. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against feesxref pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as feesxref grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_feesxref_settingsid" on "feesxref" ("settingsid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_feesxref_settingsid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — importcache.companyid — `integrity.unindexed-fk.importcache.companyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

importcache.companyid references companies but has no index; importcache holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on companies must scan row count unknown (table has never been analyzed) of importcache to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to importcache for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as importcache grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_importcache_companyid" on "importcache" ("companyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_importcache_companyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — marketinglinks.assetid — `integrity.unindexed-fk.marketinglinks.assetid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

marketinglinks.assetid references marketingassets but has no index; marketinglinks holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on marketingassets must scan row count unknown (table has never been analyzed) of marketinglinks to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a marketingassets is slow and blocks concurrent writes to marketinglinks for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as marketinglinks grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_marketinglinks_assetid" on "marketinglinks" ("assetid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_marketinglinks_assetid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — mcpdriftevents.projectid — `integrity.unindexed-fk.mcpdriftevents.projectid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

mcpdriftevents.projectid references companyprojects but has no index; mcpdriftevents holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on companyprojects must scan row count unknown (table has never been analyzed) of mcpdriftevents to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companyprojects is slow and blocks concurrent writes to mcpdriftevents for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as mcpdriftevents grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_mcpdriftevents_projectid" on "mcpdriftevents" ("projectid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_mcpdriftevents_projectid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — mcpparityconfig.rollbackby — `integrity.unindexed-fk.mcpparityconfig.rollbackby`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

mcpparityconfig.rollbackby references userprofiles but has no index; mcpparityconfig holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of mcpparityconfig to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to mcpparityconfig for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as mcpparityconfig grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_mcpparityconfig_rollbackby" on "mcpparityconfig" ("rollbackby");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_mcpparityconfig_rollbackby";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — mcprequestaudit.customerid — `integrity.unindexed-fk.mcprequestaudit.customerid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

mcprequestaudit.customerid references customers but has no index; mcprequestaudit holds ~386423 rows.

**Why it needs changing**: No foreign key enforces mcprequestaudit.customerid today (see the related missing-fk finding), so a customers delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and every ordinary lookup by this column in the meantime would otherwise scan ~386423 rows of mcprequestaudit sequentially. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against mcprequestaudit pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as mcprequestaudit grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~386423 rows; runs online)

```sql
create index concurrently "idx_mcprequestaudit_customerid" on "mcprequestaudit" ("customerid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_mcprequestaudit_customerid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — openchatlist.userprofileid — `integrity.unindexed-fk.openchatlist.userprofileid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: inferred

openchatlist.userprofileid references userprofiles but has no index; openchatlist holds row count unknown (table has never been analyzed).

**Why it needs changing**: No foreign key enforces openchatlist.userprofileid today (see the related missing-fk finding), so a userprofiles delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and openchatlist has never been analyzed, so there is no row-count estimate to say how large that sequential scan would be — its cost cannot be quantified, which is itself a reason to add the index now rather than a reason to wait until the cost is known. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against openchatlist pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as openchatlist grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_openchatlist_userprofileid" on "openchatlist" ("userprofileid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_openchatlist_userprofileid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — pmsystemconnections.userid — `integrity.unindexed-fk.pmsystemconnections.userid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

pmsystemconnections.userid references userprofiles but has no index; pmsystemconnections holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of pmsystemconnections to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to pmsystemconnections for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as pmsystemconnections grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_pmsystemconnections_userid" on "pmsystemconnections" ("userid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_pmsystemconnections_userid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — projectinvoices.projectid — `integrity.unindexed-fk.projectinvoices.projectid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectinvoices.projectid references companyprojects but has no index; projectinvoices holds row count unknown (table has never been analyzed).

**Why it needs changing**: No foreign key enforces projectinvoices.projectid today (see the related missing-fk finding), so a companyprojects delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and projectinvoices has never been analyzed, so there is no row-count estimate to say how large that sequential scan would be — its cost cannot be quantified, which is itself a reason to add the index now rather than a reason to wait until the cost is known. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against projectinvoices pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectinvoices grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_projectinvoices_projectid" on "projectinvoices" ("projectid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectinvoices_projectid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — projecttimeentries.companyid — `integrity.unindexed-fk.projecttimeentries.companyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projecttimeentries.companyid references companies but has no index; projecttimeentries holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on companies must scan row count unknown (table has never been analyzed) of projecttimeentries to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to projecttimeentries for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projecttimeentries grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_projecttimeentries_companyid" on "projecttimeentries" ("companyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projecttimeentries_companyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — projecttimeentries.phaseid — `integrity.unindexed-fk.projecttimeentries.phaseid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projecttimeentries.phaseid references projectphases but has no index; projecttimeentries holds row count unknown (table has never been analyzed).

**Why it needs changing**: No foreign key enforces projecttimeentries.phaseid today (see the related missing-fk finding), so a projectphases delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and projecttimeentries has never been analyzed, so there is no row-count estimate to say how large that sequential scan would be — its cost cannot be quantified, which is itself a reason to add the index now rather than a reason to wait until the cost is known. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against projecttimeentries pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as projecttimeentries grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_projecttimeentries_phaseid" on "projecttimeentries" ("phaseid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projecttimeentries_phaseid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — projecttimeentries.projectid — `integrity.unindexed-fk.projecttimeentries.projectid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projecttimeentries.projectid references companyprojects but has no index; projecttimeentries holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on companyprojects must scan row count unknown (table has never been analyzed) of projecttimeentries to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companyprojects is slow and blocks concurrent writes to projecttimeentries for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projecttimeentries grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_projecttimeentries_projectid" on "projecttimeentries" ("projectid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projecttimeentries_projectid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — projecttimeentries.taskid — `integrity.unindexed-fk.projecttimeentries.taskid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projecttimeentries.taskid references projecttasks but has no index; projecttimeentries holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on projecttasks must scan row count unknown (table has never been analyzed) of projecttimeentries to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a projecttasks is slow and blocks concurrent writes to projecttimeentries for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projecttimeentries grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_projecttimeentries_taskid" on "projecttimeentries" ("taskid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projecttimeentries_taskid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — projecttimeentries.userid — `integrity.unindexed-fk.projecttimeentries.userid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projecttimeentries.userid references userprofiles but has no index; projecttimeentries holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of projecttimeentries to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to projecttimeentries for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projecttimeentries grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_projecttimeentries_userid" on "projecttimeentries" ("userid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projecttimeentries_userid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — sessions.userid — `integrity.unindexed-fk.sessions.userid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

sessions.userid references userprofiles but has no index; sessions holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of sessions to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to sessions for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as sessions grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_sessions_userid" on "sessions" ("userid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_sessions_userid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — signupinvitations.invitedbyid — `integrity.unindexed-fk.signupinvitations.invitedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

signupinvitations.invitedbyid references userprofiles but has no index; signupinvitations holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of signupinvitations to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to signupinvitations for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as signupinvitations grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_signupinvitations_invitedbyid" on "signupinvitations" ("invitedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_signupinvitations_invitedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — signupinvitations.redeemedcompanyid — `integrity.unindexed-fk.signupinvitations.redeemedcompanyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

signupinvitations.redeemedcompanyid references companies but has no index; signupinvitations holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on companies must scan row count unknown (table has never been analyzed) of signupinvitations to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to signupinvitations for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as signupinvitations grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_signupinvitations_redeemedcompanyid" on "signupinvitations" ("redeemedcompanyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_signupinvitations_redeemedcompanyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — subassignments.assignedbyid — `integrity.unindexed-fk.subassignments.assignedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

subassignments.assignedbyid references userprofiles but has no index; subassignments holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of subassignments to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to subassignments for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as subassignments grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_subassignments_assignedbyid" on "subassignments" ("assignedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_subassignments_assignedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — subassignments.removedbyid — `integrity.unindexed-fk.subassignments.removedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

subassignments.removedbyid references userprofiles but has no index; subassignments holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of subassignments to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to subassignments for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as subassignments grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_subassignments_removedbyid" on "subassignments" ("removedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_subassignments_removedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — synchistory.triggeredby — `integrity.unindexed-fk.synchistory.triggeredby`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

synchistory.triggeredby references userprofiles but has no index; synchistory holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of synchistory to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to synchistory for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as synchistory grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_synchistory_triggeredby" on "synchistory" ("triggeredby");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_synchistory_triggeredby";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — systemsettingshistory.changedby — `integrity.unindexed-fk.systemsettingshistory.changedby`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

systemsettingshistory.changedby references userprofiles but has no index; systemsettingshistory holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of systemsettingshistory to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to systemsettingshistory for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as systemsettingshistory grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_systemsettingshistory_changedby" on "systemsettingshistory" ("changedby");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_systemsettingshistory_changedby";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — taskdependencies.blockedbyid — `integrity.unindexed-fk.taskdependencies.blockedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

taskdependencies.blockedbyid references projecttasks but has no index; taskdependencies holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on projecttasks must scan row count unknown (table has never been analyzed) of taskdependencies to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a projecttasks is slow and blocks concurrent writes to taskdependencies for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as taskdependencies grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_taskdependencies_blockedbyid" on "taskdependencies" ("blockedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_taskdependencies_blockedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — taskstateoverrides.userid — `integrity.unindexed-fk.taskstateoverrides.userid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

taskstateoverrides.userid references userprofiles but has no index; taskstateoverrides holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of taskstateoverrides to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to taskstateoverrides for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as taskstateoverrides grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_taskstateoverrides_userid" on "taskstateoverrides" ("userid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_taskstateoverrides_userid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — tasksyncrecords.pmconnectionid — `integrity.unindexed-fk.tasksyncrecords.pmconnectionid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

tasksyncrecords.pmconnectionid references pmsystemconnections but has no index; tasksyncrecords holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on pmsystemconnections must scan row count unknown (table has never been analyzed) of tasksyncrecords to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a pmsystemconnections is slow and blocks concurrent writes to tasksyncrecords for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as tasksyncrecords grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_tasksyncrecords_pmconnectionid" on "tasksyncrecords" ("pmconnectionid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_tasksyncrecords_pmconnectionid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — tasksyncrecords.taskid — `integrity.unindexed-fk.tasksyncrecords.taskid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

tasksyncrecords.taskid references projecttasks but has no index; tasksyncrecords holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on projecttasks must scan row count unknown (table has never been analyzed) of tasksyncrecords to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a projecttasks is slow and blocks concurrent writes to tasksyncrecords for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as tasksyncrecords grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_tasksyncrecords_taskid" on "tasksyncrecords" ("taskid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_tasksyncrecords_taskid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — themeblocks.createdbyid — `integrity.unindexed-fk.themeblocks.createdbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

themeblocks.createdbyid references userprofiles but has no index; themeblocks holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on userprofiles must scan row count unknown (table has never been analyzed) of themeblocks to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to themeblocks for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as themeblocks grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_themeblocks_createdbyid" on "themeblocks" ("createdbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_themeblocks_createdbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — timeEntry.taskid — `integrity.unindexed-fk.timeEntry.taskid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

timeEntry.taskid references projecttasks but has no index; timeEntry holds row count unknown (table has never been analyzed).

**Why it needs changing**: Every delete or key update on projecttasks must scan row count unknown (table has never been analyzed) of timeEntry to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a projecttasks is slow and blocks concurrent writes to timeEntry for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as timeEntry grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to row count unknown (table has never been analyzed); runs online)

```sql
create index concurrently "idx_timeEntry_taskid" on "timeEntry" ("taskid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_timeEntry_taskid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### HIGH — 88 tables — `maintenance.never-analyzed`

**Rule**: `maintenance.never-analyzed`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

88 of 129 tables have never been analyzed — neither a manual ANALYZE nor autovacuum has ever run against them: aiproposals, aispecsessions, appauditconfigurations, auditexecutions, auditreportmetadata, auditresults, campaigns, clientgroups, collapsexref, company_analytics, and 78 more.

**Why it needs changing**: The planner is choosing join orders and scan strategies for these tables with no idea how large they are or how their values are distributed — every plan touching them is a guess dressed up as a decision. And it is not only the planner: every statistics-derived metric elsewhere in this report — dead-tuple ratios, row estimates, bloat — is unavailable for these same tables, so their apparent good health in the rest of this report is an absence of data, not evidence of health.

**Business impact**: Queries touching these tables may pick sequential scans, bad join orders, or wrong memory allocations with no warning, because the optimizer has nothing measured to reason from.

**Doing nothing**: The planner keeps flying blind on these tables, and every statistics-derived finding in this report keeps excluding them — not because they are healthy, but because nothing has ever measured them.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE per table, held only while that table is scanned — does not block reads or writes, duration: proportional to the combined size of all 88 tables; runs online, one table at a time)

```sql
analyze;
```

**Fix risk**: ANALYZE reads a sample of rows from each table and has real I/O cost while it runs across this many tables, but it takes no exclusive lock and does not block concurrent reads or writes.

**Rollback**: n/a — ANALYZE only refreshes planner statistics, it changes no data

**Evidence**

```sql
select relname from pg_catalog.pg_stat_user_tables where last_analyze is null and last_autoanalyze is null
```

---

### HIGH — companyprojects.status — `schema.nullability-mismatch.companyprojects.status`

**Rule**: `schema.nullability-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

companyprojects.status is declared NOT NULL but is nullable in the database.

**Why it needs changing**: TypeScript types status as non-optional, so no code path guards against null. Any null already present, or inserted by another writer, reaches code that will dereference it.

**Business impact**: A runtime null produces a TypeError rather than a handled validation error, and the type system gives no warning at build time.

**Doing nothing**: The code keeps asserting a guarantee the database does not enforce.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: SET NOT NULL scans the whole table and takes ACCESS EXCLUSIVE; it also fails outright if nulls exist, so existing nulls must be resolved first.

**Rollback**: n/a

**Evidence**

```sql
select attnotnull from pg_catalog.pg_attribute
```

---

### HIGH — userprofiles.companyid — `schema.nullability-mismatch.userprofiles.companyid`

**Rule**: `schema.nullability-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

userprofiles.companyid is declared NOT NULL but is nullable in the database.

**Why it needs changing**: TypeScript types companyid as non-optional, so no code path guards against null. Any null already present, or inserted by another writer, reaches code that will dereference it.

**Business impact**: A runtime null produces a TypeError rather than a handled validation error, and the type system gives no warning at build time.

**Doing nothing**: The code keeps asserting a guarantee the database does not enforce.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: SET NOT NULL scans the whole table and takes ACCESS EXCLUSIVE; it also fails outright if nulls exist, so existing nulls must be resolved first.

**Rollback**: n/a

**Evidence**

```sql
select attnotnull from pg_catalog.pg_attribute
```

---

### HIGH — userprofiles.usertype — `schema.nullability-mismatch.userprofiles.usertype`

**Rule**: `schema.nullability-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

userprofiles.usertype is declared NOT NULL but is nullable in the database.

**Why it needs changing**: TypeScript types usertype as non-optional, so no code path guards against null. Any null already present, or inserted by another writer, reaches code that will dereference it.

**Business impact**: A runtime null produces a TypeError rather than a handled validation error, and the type system gives no warning at build time.

**Doing nothing**: The code keeps asserting a guarantee the database does not enforce.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: SET NOT NULL scans the whole table and takes ACCESS EXCLUSIVE; it also fails outright if nulls exist, so existing nulls must be resolved first.

**Rollback**: n/a

**Evidence**

```sql
select attnotnull from pg_catalog.pg_attribute
```

---

### HIGH — appauditconfiguration — `schema.source-conflict.appauditconfiguration`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

appauditconfiguration is declared in app and mcp with differing shapes — type mismatch on: autoauditschedule (app: varchar(20) vs mcp: varchar(50)), createdat (app: timestamp vs mcp: timestamp with time zone), updatedat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — companies — `schema.source-conflict.companies`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

companies is declared in app and mcp with differing shapes — columns only in app: address, billingemail, contactemail, createdat, digestconfig, distributor, hourlyrate, logourl, maxusers, name, phone, referralcode, referredby, settings, updatedat, verifiedat; nullability mismatch on: activeflag (app: not null vs mcp: nullable), billingexempt (app: not null vs mcp: nullable), billingplan (app: not null vs mcp: nullable), subscriptionstatus (app: not null vs mcp: nullable).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — companyprojects — `schema.source-conflict.companyprojects`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

companyprojects is declared in app and mcp with differing shapes — columns only in app: allocatedhours, currentphase, customerid, hourlyrate, pmsystems, securityclassification, skiptesting; type mismatch on: createdat (app: timestamp vs mcp: timestamp with time zone), status (app: varchar(20) vs mcp: varchar(50)), updatedat (app: timestamp vs mcp: timestamp with time zone); nullability mismatch on: status (app: not null vs mcp: nullable), userid (app: not null vs mcp: nullable).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — engagementassignments — `schema.source-conflict.engagementassignments`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

engagementassignments is declared in app and mcp with differing shapes — columns only in app: addedat, addedbyid, removedbyid; type mismatch on: removedat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — projectdocuments — `schema.source-conflict.projectdocuments`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectdocuments is declared in app and mcp with differing shapes — columns only in app: pdfcontent, pdfgeneratedat; columns only in mcp: sourceeventid, tags, taskids; type mismatch on: createdat (app: timestamp vs mcp: timestamp with time zone), filepath (app: varchar(500) vs mcp: varchar(1000)), title (app: varchar(255) vs mcp: varchar(500)), updatedat (app: timestamp vs mcp: timestamp with time zone); nullability mismatch on: doctype (app: not null vs mcp: nullable), isgenerated (app: not null vs mcp: nullable).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — projectphases — `schema.source-conflict.projectphases`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectphases is declared in app and mcp with differing shapes — columns only in app: assigneduserid, reason; type mismatch on: completedat (app: timestamp vs mcp: timestamp with time zone), createdat (app: timestamp vs mcp: timestamp with time zone), enteredat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — projectproposals — `schema.source-conflict.projectproposals`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectproposals is declared in app and mcp with differing shapes — type mismatch on: createdat (app: timestamp vs mcp: timestamp with time zone), createdbyid (app: uuid vs mcp: varchar(255)), proposeddate (app: timestamp vs mcp: timestamp with time zone), updatedat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — projectspecifications — `schema.source-conflict.projectspecifications`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectspecifications is declared in app and mcp with differing shapes — columns only in app: approvedat, phaseid; type mismatch on: claimedat (app: timestamp vs mcp: timestamp with time zone), createdat (app: timestamp vs mcp: timestamp with time zone), title (app: varchar(255) vs mcp: varchar(500)), updatedat (app: timestamp vs mcp: timestamp with time zone); nullability mismatch on: content (app: not null vs mcp: nullable), isoptional (app: not null vs mcp: nullable), specorder (app: not null vs mcp: nullable).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — projecttasks — `schema.source-conflict.projecttasks`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projecttasks is declared in app and mcp with differing shapes — columns only in app: assignedduty, assignedtoid, effort, externalid, issuetype, nextduty, phaseid, results, sourceoforigin, sourcepmssystem; columns only in mcp: assignee, documentids, sourceeventid; type mismatch on: createdat (app: timestamp vs mcp: timestamp with time zone), duedate (app: date vs mcp: timestamp with time zone), updatedat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — testcycles — `schema.source-conflict.testcycles`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

testcycles is declared in app and mcp with differing shapes — type mismatch on: createdat (app: timestamp vs mcp: timestamp with time zone), openedat (app: timestamp vs mcp: timestamp with time zone), promotedtoproductionat (app: timestamp vs mcp: timestamp with time zone), promotedtouatat (app: timestamp vs mcp: timestamp with time zone), supersededat (app: timestamp vs mcp: timestamp with time zone), updatedat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — testitemsubjects — `schema.source-conflict.testitemsubjects`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

testitemsubjects is declared in app and mcp with differing shapes — type mismatch on: createdat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — testplanitems — `schema.source-conflict.testplanitems`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

testplanitems is declared in app and mcp with differing shapes — columns only in app: blockedreason, parentitemid; type mismatch on: createdat (app: timestamp vs mcp: timestamp with time zone), lastresultat (app: timestamp vs mcp: timestamp with time zone), releasedat (app: timestamp vs mcp: timestamp with time zone), updatedat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — testplans — `schema.source-conflict.testplans`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

testplans is declared in app and mcp with differing shapes — columns only in app: results, testcases; type mismatch on: createdat (app: timestamp vs mcp: timestamp with time zone), generatedat (app: timestamp vs mcp: timestamp with time zone), updatedat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — testretests — `schema.source-conflict.testretests`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

testretests is declared in app and mcp with differing shapes — type mismatch on: appliedat (app: timestamp vs mcp: timestamp with time zone), createdat (app: timestamp vs mcp: timestamp with time zone), resolvedat (app: timestamp vs mcp: timestamp with time zone), updatedat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — testrunresults — `schema.source-conflict.testrunresults`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

testrunresults is declared in app and mcp with differing shapes — type mismatch on: createdat (app: timestamp vs mcp: timestamp with time zone), endedat (app: timestamp vs mcp: timestamp with time zone), startedat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — testruns — `schema.source-conflict.testruns`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

testruns is declared in app and mcp with differing shapes — type mismatch on: createdat (app: timestamp vs mcp: timestamp with time zone), endedat (app: timestamp vs mcp: timestamp with time zone), lastheartbeatat (app: timestamp vs mcp: timestamp with time zone), startedat (app: timestamp vs mcp: timestamp with time zone), updatedat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — testsignoffs — `schema.source-conflict.testsignoffs`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

testsignoffs is declared in app and mcp with differing shapes — type mismatch on: createdat (app: timestamp vs mcp: timestamp with time zone), signedat (app: timestamp vs mcp: timestamp with time zone), supersededat (app: timestamp vs mcp: timestamp with time zone), updatedat (app: timestamp vs mcp: timestamp with time zone).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — userprofiles — `schema.source-conflict.userprofiles`

**Rule**: `schema.source-conflict`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

userprofiles is declared in app and mcp with differing shapes — columns only in app: active, allowoutsideteams, avatarurl, basepercentage, clientid, clientsecret, dashboardconfig, devcycleid, failedlogins, joinedat, language, lastloginedat, lockeduntil, password, payrate, payratemethod, pendingemail, profileid, profiletype, promosunsubscribedat, requirepasswordchange, responsibility, securitylevel, startchat, timezone, tracktime, updatesunsubscribedat; nullability mismatch on: companyid (app: not null vs mcp: nullable), emailaddr (app: not null vs mcp: nullable), usertype (app: not null vs mcp: nullable).

**Why it needs changing**: The sources disagree in a way no read-only-mirror relationship explains — either each declares a column the other lacks, or they declare the same column with a different type or nullability. Whichever is wrong will emit SQL the database rejects, or silently accept a value the other source's own type would have refused, and a drift check comparing against either source alone reports clean.

**Business impact**: One of the two components fails against the deployed schema, and which one depends on which source happens to be correct.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### HIGH — companyprojects.status — `schema.type-mismatch.companyprojects.status`

**Rule**: `schema.type-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

companyprojects.status is declared varchar(20) but deployed as character varying(50).

**Why it needs changing**: The driver decodes status as character varying(50) while the application's types assert varchar(20). Comparisons and joins against this column may silently fall back to a cast, defeating any index on it.

**Business impact**: Queries filtering on this column can degrade to sequential scans, and values may round-trip differently than the code expects.

**Doing nothing**: The mismatch persists silently — it produces no error, only wrong plans and occasional wrong comparisons.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the duration; it is destructive and must be applied by hand in a window.

**Rollback**: n/a

**Evidence**

```sql
select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute
```

---

### HIGH — projectproposals.createdat — `schema.type-mismatch.projectproposals.createdat`

**Rule**: `schema.type-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectproposals.createdat is declared timestamp but deployed as timestamp with time zone.

**Why it needs changing**: The driver decodes createdat as timestamp with time zone while the application's types assert timestamp. Comparisons and joins against this column may silently fall back to a cast, defeating any index on it.

**Business impact**: Queries filtering on this column can degrade to sequential scans, and values may round-trip differently than the code expects.

**Doing nothing**: The mismatch persists silently — it produces no error, only wrong plans and occasional wrong comparisons.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the duration; it is destructive and must be applied by hand in a window.

**Rollback**: n/a

**Evidence**

```sql
select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute
```

---

### HIGH — projectproposals.proposeddate — `schema.type-mismatch.projectproposals.proposeddate`

**Rule**: `schema.type-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectproposals.proposeddate is declared timestamp but deployed as timestamp with time zone.

**Why it needs changing**: The driver decodes proposeddate as timestamp with time zone while the application's types assert timestamp. Comparisons and joins against this column may silently fall back to a cast, defeating any index on it.

**Business impact**: Queries filtering on this column can degrade to sequential scans, and values may round-trip differently than the code expects.

**Doing nothing**: The mismatch persists silently — it produces no error, only wrong plans and occasional wrong comparisons.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the duration; it is destructive and must be applied by hand in a window.

**Rollback**: n/a

**Evidence**

```sql
select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute
```

---

### HIGH — projectproposals.updatedat — `schema.type-mismatch.projectproposals.updatedat`

**Rule**: `schema.type-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectproposals.updatedat is declared timestamp but deployed as timestamp with time zone.

**Why it needs changing**: The driver decodes updatedat as timestamp with time zone while the application's types assert timestamp. Comparisons and joins against this column may silently fall back to a cast, defeating any index on it.

**Business impact**: Queries filtering on this column can degrade to sequential scans, and values may round-trip differently than the code expects.

**Doing nothing**: The mismatch persists silently — it produces no error, only wrong plans and occasional wrong comparisons.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the duration; it is destructive and must be applied by hand in a window.

**Rollback**: n/a

**Evidence**

```sql
select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute
```

---

### HIGH — projectspecifications.phaseid — `schema.type-mismatch.projectspecifications.phaseid`

**Rule**: `schema.type-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectspecifications.phaseid is declared uuid but deployed as character varying(50).

**Why it needs changing**: The driver decodes phaseid as character varying(50) while the application's types assert uuid. Comparisons and joins against this column may silently fall back to a cast, defeating any index on it.

**Business impact**: Queries filtering on this column can degrade to sequential scans, and values may round-trip differently than the code expects.

**Doing nothing**: The mismatch persists silently — it produces no error, only wrong plans and occasional wrong comparisons.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the duration; it is destructive and must be applied by hand in a window.

**Rollback**: n/a

**Evidence**

```sql
select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute
```

---

### HIGH — systemsettings.description — `schema.type-mismatch.systemsettings.description`

**Rule**: `schema.type-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

systemsettings.description is declared text but deployed as character varying(255).

**Why it needs changing**: The driver decodes description as character varying(255) while the application's types assert text. Comparisons and joins against this column may silently fall back to a cast, defeating any index on it.

**Business impact**: Queries filtering on this column can degrade to sequential scans, and values may round-trip differently than the code expects.

**Doing nothing**: The mismatch persists silently — it produces no error, only wrong plans and occasional wrong comparisons.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the duration; it is destructive and must be applied by hand in a window.

**Rollback**: n/a

**Evidence**

```sql
select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute
```

---

### HIGH — userprofiles.basepercentage — `schema.type-mismatch.userprofiles.basepercentage`

**Rule**: `schema.type-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

userprofiles.basepercentage is declared numeric(10, 2) but deployed as numeric.

**Why it needs changing**: The driver decodes basepercentage as numeric while the application's types assert numeric(10, 2). Comparisons and joins against this column may silently fall back to a cast, defeating any index on it.

**Business impact**: Queries filtering on this column can degrade to sequential scans, and values may round-trip differently than the code expects.

**Doing nothing**: The mismatch persists silently — it produces no error, only wrong plans and occasional wrong comparisons.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the duration; it is destructive and must be applied by hand in a window.

**Rollback**: n/a

**Evidence**

```sql
select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute
```

---

### HIGH — userprofiles.payrate — `schema.type-mismatch.userprofiles.payrate`

**Rule**: `schema.type-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

userprofiles.payrate is declared numeric(10, 2) but deployed as numeric.

**Why it needs changing**: The driver decodes payrate as numeric while the application's types assert numeric(10, 2). Comparisons and joins against this column may silently fall back to a cast, defeating any index on it.

**Business impact**: Queries filtering on this column can degrade to sequential scans, and values may round-trip differently than the code expects.

**Doing nothing**: The mismatch persists silently — it produces no error, only wrong plans and occasional wrong comparisons.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the duration; it is destructive and must be applied by hand in a window.

**Rollback**: n/a

**Evidence**

```sql
select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute
```

---

### HIGH — userprofiles.promosunsubscribedat — `schema.type-mismatch.userprofiles.promosunsubscribedat`

**Rule**: `schema.type-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

userprofiles.promosunsubscribedat is declared timestamp but deployed as timestamp with time zone.

**Why it needs changing**: The driver decodes promosunsubscribedat as timestamp with time zone while the application's types assert timestamp. Comparisons and joins against this column may silently fall back to a cast, defeating any index on it.

**Business impact**: Queries filtering on this column can degrade to sequential scans, and values may round-trip differently than the code expects.

**Doing nothing**: The mismatch persists silently — it produces no error, only wrong plans and occasional wrong comparisons.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the duration; it is destructive and must be applied by hand in a window.

**Rollback**: n/a

**Evidence**

```sql
select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute
```

---

### HIGH — userprofiles.updatesunsubscribedat — `schema.type-mismatch.userprofiles.updatesunsubscribedat`

**Rule**: `schema.type-mismatch`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

userprofiles.updatesunsubscribedat is declared timestamp but deployed as timestamp with time zone.

**Why it needs changing**: The driver decodes updatesunsubscribedat as timestamp with time zone while the application's types assert timestamp. Comparisons and joins against this column may silently fall back to a cast, defeating any index on it.

**Business impact**: Queries filtering on this column can degrade to sequential scans, and values may round-trip differently than the code expects.

**Doing nothing**: The mismatch persists silently — it produces no error, only wrong plans and occasional wrong comparisons.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the duration; it is destructive and must be applied by hand in a window.

**Rollback**: n/a

**Evidence**

```sql
select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute
```

---

### HIGH — appauditconfigurations — `schema.undeclared-table.appauditconfigurations`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

appauditconfigurations exists in the database with 13 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If appauditconfigurations holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — clientgroups — `schema.undeclared-table.clientgroups`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

clientgroups exists in the database with 5 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If clientgroups holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — collapsexref — `schema.undeclared-table.collapsexref`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

collapsexref exists in the database with 6 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If collapsexref holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — departments — `schema.undeclared-table.departments`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

departments exists in the database with 5 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If departments holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — favoritetask — `schema.undeclared-table.favoritetask`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

favoritetask exists in the database with 4 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If favoritetask holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — fees — `schema.undeclared-table.fees`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

fees exists in the database with 6 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If fees holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — feesxref — `schema.undeclared-table.feesxref`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

feesxref exists in the database with 5 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If feesxref holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — gitcommandlogs — `schema.undeclared-table.gitcommandlogs`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

gitcommandlogs exists in the database with 21 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If gitcommandlogs holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — gitcommandsessions — `schema.undeclared-table.gitcommandsessions`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

gitcommandsessions exists in the database with 9 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If gitcommandsessions holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — gitcommandstats — `schema.undeclared-table.gitcommandstats`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

gitcommandstats exists in the database with 14 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If gitcommandstats holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — newsletterissues — `schema.undeclared-table.newsletterissues`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

newsletterissues exists in the database with 14 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If newsletterissues holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — newslettersends — `schema.undeclared-table.newslettersends`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

newslettersends exists in the database with 8 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If newslettersends holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — openchatlist — `schema.undeclared-table.openchatlist`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

openchatlist exists in the database with 3 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If openchatlist holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — projectlicenses — `schema.undeclared-table.projectlicenses`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectlicenses exists in the database with 17 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If projectlicenses holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — projectprofilexref — `schema.undeclared-table.projectprofilexref`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectprofilexref exists in the database with 3 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If projectprofilexref holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — projecttasknotes — `schema.undeclared-table.projecttasknotes`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projecttasknotes exists in the database with 10 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If projecttasknotes holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — projecttasktimelog — `schema.undeclared-table.projecttasktimelog`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projecttasktimelog exists in the database with 14 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If projecttasktimelog holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — projectteam — `schema.undeclared-table.projectteam`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

projectteam exists in the database with 4 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If projectteam holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — schedulerdepartments — `schema.undeclared-table.schedulerdepartments`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

schedulerdepartments exists in the database with 8 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If schedulerdepartments holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — settings — `schema.undeclared-table.settings`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

settings exists in the database with 5 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If settings holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — socketdata — `schema.undeclared-table.socketdata`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

socketdata exists in the database with 8 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If socketdata holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — sockettrace — `schema.undeclared-table.sockettrace`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

sockettrace exists in the database with 5 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If sockettrace holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — systemlog — `schema.undeclared-table.systemlog`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

systemlog exists in the database with 9 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If systemlog holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### HIGH — timeEntry — `schema.undeclared-table.timeEntry`

**Rule**: `schema.undeclared-table`  
**Severity**: high  
**Urgency**: scheduled  
**Confidence**: proven

timeEntry exists in the database with 12 columns but is declared in no schema source.

**Why it needs changing**: Schema tooling treats undeclared tables as removable. The application also cannot read it through the ORM, so whatever writes it is doing so outside the declared model and is unprotected by type checking.

**Business impact**: If timeEntry holds live data, an automated reconciliation would propose dropping it.

**Doing nothing**: `drizzle-kit push` would propose dropping this table — which is why it is prohibited against this database. The prohibition is the mitigation, and it depends on nobody forgetting.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring it retroactively is safe; the risk lies in declaring it inaccurately, which converts a silent table into a wrong one.

**Rollback**: n/a

**Evidence**

```sql
select relname from pg_catalog.pg_class where relkind in ('r','p')
```

---

### MEDIUM — auditexecutions — `data.all-null-column.auditexecutions`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

auditexecutions has 2 columns that are null in all 5 rows — no row has ever carried a value in any of them: triggeredby, specid.

**Why it needs changing**: Across 5 rows, none of these 2 columns has ever been written: triggeredby, specid. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("triggeredby"), count("specid") from "auditexecutions"
```

---

### MEDIUM — auditreportmetadata — `data.all-null-column.auditreportmetadata`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

auditreportmetadata.reviewedby (uuid) is null in all 3 rows — no row has ever carried a value.

**Why it needs changing**: Across 3 rows, reviewedby has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("reviewedby") from "auditreportmetadata"
```

---

### MEDIUM — campaignposts — `data.all-null-column.campaignposts`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

campaignposts.assetid (uuid) is null in all 106 rows — no row has ever carried a value.

**Why it needs changing**: Across 106 rows, assetid has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("assetid") from "campaignposts"
```

---

### MEDIUM — companies — `data.all-null-column.companies`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

companies has 5 columns that are null in all 43 rows — no row has ever carried a value in any of them: hourlyrate, logourl, verifiedat, digestconfig, settings.

**Why it needs changing**: Across 43 rows, none of these 5 columns has ever been written: hourlyrate, logourl, verifiedat, digestconfig, settings. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("hourlyrate"), count("logourl"), count("verifiedat"), count("digestconfig"), count("settings") from "companies"
```

---

### MEDIUM — company_status_history — `data.all-null-column.company_status_history`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

company_status_history.changed_by (uuid) is null in all 13 rows — no row has ever carried a value.

**Why it needs changing**: Across 13 rows, changed_by has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("changed_by") from "company_status_history"
```

---

### MEDIUM — companyauditlogs — `data.all-null-column.companyauditlogs`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

companyauditlogs.previousvalue (jsonb) is null in all 344 rows — no row has ever carried a value.

**Why it needs changing**: Across 344 rows, previousvalue has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("previousvalue") from "companyauditlogs"
```

---

### MEDIUM — companyprojects — `data.all-null-column.companyprojects`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

companyprojects.customerid (uuid) is null in all 106 rows — no row has ever carried a value.

**Why it needs changing**: Across 106 rows, customerid has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("customerid") from "companyprojects"
```

---

### MEDIUM — companysubscriptions — `data.all-null-column.companysubscriptions`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

companysubscriptions.overageamount (numeric(10,2)) is null in all 30 rows — no row has ever carried a value.

**Why it needs changing**: Across 30 rows, overageamount has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("overageamount") from "companysubscriptions"
```

---

### MEDIUM — complianceaudittasks — `data.all-null-column.complianceaudittasks`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

complianceaudittasks.suggestedfix (text) is null in all 565 rows — no row has ever carried a value.

**Why it needs changing**: Across 565 rows, suggestedfix has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("suggestedfix") from "complianceaudittasks"
```

---

### MEDIUM — customers — `data.all-null-column.customers`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

customers has 6 columns that are null in all 1 rows — no row has ever carried a value in any of them: clientcompanyid, email, phone, billingaddress, taxid, archivedat.

**Why it needs changing**: Across 1 rows, none of these 6 columns has ever been written: clientcompanyid, email, phone, billingaddress, taxid, archivedat. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("clientcompanyid"), count("email"), count("phone"), count("billingaddress"), count("taxid"), count("archivedat") from "customers"
```

---

### MEDIUM — engagementassignments — `data.all-null-column.engagementassignments`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

engagementassignments has 4 columns that are null in all 1 rows — no row has ever carried a value in any of them: scopeid, taskid, removedat, removedbyid.

**Why it needs changing**: Across 1 rows, none of these 4 columns has ever been written: scopeid, taskid, removedat, removedbyid. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("scopeid"), count("taskid"), count("removedat"), count("removedbyid") from "engagementassignments"
```

---

### MEDIUM — engagements — `data.all-null-column.engagements`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

engagements has 4 columns that are null in all 2 rows — no row has ever carried a value in any of them: pausedat, disabledat, endedat, endedbyid.

**Why it needs changing**: Across 2 rows, none of these 4 columns has ever been written: pausedat, disabledat, endedat, endedbyid. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("pausedat"), count("disabledat"), count("endedat"), count("endedbyid") from "engagements"
```

---

### MEDIUM — feedbacksubmissions — `data.all-null-column.feedbacksubmissions`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

feedbacksubmissions has 9 columns that are null in all 86 rows — no row has ever carried a value in any of them: declinereason, disposition, dispositionedat, dispositionedbyid, linkedscopenumber, scopeseed, dismissedat, dismissedbyid, submitterhiddenat.

**Why it needs changing**: Across 86 rows, none of these 9 columns has ever been written: declinereason, disposition, dispositionedat, dispositionedbyid, linkedscopenumber, scopeseed, dismissedat, dismissedbyid, submitterhiddenat. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("declinereason"), count("disposition"), count("dispositionedat"), count("dispositionedbyid"), count("linkedscopenumber"), count("scopeseed"), count("dismissedat"), count("dismissedbyid"), count("submitterhiddenat") from "feedbacksubmissions"
```

---

### MEDIUM — gitcommandsessions — `data.all-null-column.gitcommandsessions`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

gitcommandsessions.user_id (uuid) is null in all 3 rows — no row has ever carried a value.

**Why it needs changing**: Across 3 rows, user_id has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("user_id") from "gitcommandsessions"
```

---

### MEDIUM — infrahealthchecks — `data.all-null-column.infrahealthchecks`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

infrahealthchecks.solution (text) is null in all 4 rows — no row has ever carried a value.

**Why it needs changing**: Across 4 rows, solution has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("solution") from "infrahealthchecks"
```

---

### MEDIUM — marketingassets — `data.all-null-column.marketingassets`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

marketingassets has 2 columns that are null in all 268 rows — no row has ever carried a value in any of them: companyid, campaignid.

**Why it needs changing**: Across 268 rows, none of these 2 columns has ever been written: companyid, campaignid. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("companyid"), count("campaignid") from "marketingassets"
```

---

### MEDIUM — marketingbanners — `data.all-null-column.marketingbanners`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

marketingbanners has 7 columns that are null in all 1 rows — no row has ever carried a value in any of them: campaignid, headline, subhead, brandtokens, slot, ctaurl, overlayanchor.

**Why it needs changing**: Across 1 rows, none of these 7 columns has ever been written: campaignid, headline, subhead, brandtokens, slot, ctaurl, overlayanchor. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("campaignid"), count("headline"), count("subhead"), count("brandtokens"), count("slot"), count("ctaurl"), count("overlayanchor") from "marketingbanners"
```

---

### MEDIUM — marketingfeaturesnippets — `data.all-null-column.marketingfeaturesnippets`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

marketingfeaturesnippets has 2 columns that are null in all 18 rows — no row has ever carried a value in any of them: ctaurl, sourcescope.

**Why it needs changing**: Across 18 rows, none of these 2 columns has ever been written: ctaurl, sourcescope. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("ctaurl"), count("sourcescope") from "marketingfeaturesnippets"
```

---

### MEDIUM — marketingleads — `data.all-null-column.marketingleads`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

marketingleads has 4 columns that are null in all 3 rows — no row has ever carried a value in any of them: companyid, campaignid, declinedreason, notes.

**Why it needs changing**: Across 3 rows, none of these 4 columns has ever been written: companyid, campaignid, declinedreason, notes. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("companyid"), count("campaignid"), count("declinedreason"), count("notes") from "marketingleads"
```

---

### MEDIUM — marketinglinkclicks — `data.all-null-column.marketinglinkclicks`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

marketinglinkclicks.referrer (character varying(1000)) is null in all 2 rows — no row has ever carried a value.

**Why it needs changing**: Across 2 rows, referrer has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("referrer") from "marketinglinkclicks"
```

---

### MEDIUM — marketinglinks — `data.all-null-column.marketinglinks`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

marketinglinks has 5 columns that are null in all 3 rows — no row has ever carried a value in any of them: campaignid, utmsource, utmmedium, utmcampaign, assetid.

**Why it needs changing**: Across 3 rows, none of these 5 columns has ever been written: campaignid, utmsource, utmmedium, utmcampaign, assetid. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("campaignid"), count("utmsource"), count("utmmedium"), count("utmcampaign"), count("assetid") from "marketinglinks"
```

---

### MEDIUM — mcpapitokens — `data.all-null-column.mcpapitokens`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

mcpapitokens.revokedbyid (uuid) is null in all 202 rows — no row has ever carried a value.

**Why it needs changing**: Across 202 rows, revokedbyid has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("revokedbyid") from "mcpapitokens"
```

---

### MEDIUM — projectspecifications — `data.all-null-column.projectspecifications`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

projectspecifications has 2 columns that are null in all 1275 rows — no row has ever carried a value in any of them: claimedbyid, claimedat.

**Why it needs changing**: Across 1275 rows, none of these 2 columns has ever been written: claimedbyid, claimedat. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("claimedbyid"), count("claimedat") from "projectspecifications"
```

---

### MEDIUM — projecttasks — `data.all-null-column.projecttasks`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

projecttasks has 9 columns that are null in all 6318 rows — no row has ever carried a value in any of them: assignedtoid, duedate, assignedduty, nextduty, externalid, effort, sourcepmssystem, results, assignee.

**Why it needs changing**: Across 6318 rows, none of these 9 columns has ever been written: assignedtoid, duedate, assignedduty, nextduty, externalid, effort, sourcepmssystem, results, assignee. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("assignedtoid"), count("duedate"), count("assignedduty"), count("nextduty"), count("externalid"), count("effort"), count("sourcepmssystem"), count("results"), count("assignee") from "projecttasks"
```

---

### MEDIUM — sockettrace — `data.all-null-column.sockettrace`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

sockettrace.pending (boolean) is null in all 505889 rows — no row has ever carried a value.

**Why it needs changing**: Across 505889 rows, pending has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("pending") from "sockettrace"
```

---

### MEDIUM — specificationphases — `data.all-null-column.specificationphases`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

specificationphases has 2 columns that are null in all 1 rows — no row has ever carried a value in any of them: approvedby, blockers.

**Why it needs changing**: Across 1 rows, none of these 2 columns has ever been written: approvedby, blockers. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("approvedby"), count("blockers") from "specificationphases"
```

---

### MEDIUM — systemsettings — `data.all-null-column.systemsettings`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

systemsettings.updatedby (uuid) is null in all 11 rows — no row has ever carried a value.

**Why it needs changing**: Across 11 rows, updatedby has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("updatedby") from "systemsettings"
```

---

### MEDIUM — testcycles — `data.all-null-column.testcycles`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

testcycles has 7 columns that are null in all 10 rows — no row has ever carried a value in any of them: commitsha, buildref, promotedtouatat, promotedtoproductionat, supersededat, promotedbyid, notes.

**Why it needs changing**: Across 10 rows, none of these 7 columns has ever been written: commitsha, buildref, promotedtouatat, promotedtoproductionat, supersededat, promotedbyid, notes. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("commitsha"), count("buildref"), count("promotedtouatat"), count("promotedtoproductionat"), count("supersededat"), count("promotedbyid"), count("notes") from "testcycles"
```

---

### MEDIUM — testitemsubjects — `data.all-null-column.testitemsubjects`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

testitemsubjects.sourceline (integer) is null in all 160 rows — no row has ever carried a value.

**Why it needs changing**: Across 160 rows, sourceline has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("sourceline") from "testitemsubjects"
```

---

### MEDIUM — testplanitems — `data.all-null-column.testplanitems`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

testplanitems has 9 columns that are null in all 160 rows — no row has ever carried a value in any of them: taskid, parentitemid, automationref, blockedreason, releasedat, forcetest, lastresultstatus, lastresultat, lastrunid.

**Why it needs changing**: Across 160 rows, none of these 9 columns has ever been written: taskid, parentitemid, automationref, blockedreason, releasedat, forcetest, lastresultstatus, lastresultat, lastrunid. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("taskid"), count("parentitemid"), count("automationref"), count("blockedreason"), count("releasedat"), count("forcetest"), count("lastresultstatus"), count("lastresultat"), count("lastrunid") from "testplanitems"
```

---

### MEDIUM — testplans — `data.all-null-column.testplans`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

testplans.generatedbyid (uuid) is null in all 1 rows — no row has ever carried a value.

**Why it needs changing**: Across 1 rows, generatedbyid has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("generatedbyid") from "testplans"
```

---

### MEDIUM — themetemplates — `data.all-null-column.themetemplates`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

themetemplates has 2 columns that are null in all 7 rows — no row has ever carried a value in any of them: tokens, designsystemslug.

**Why it needs changing**: Across 7 rows, none of these 2 columns has ever been written: tokens, designsystemslug. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("tokens"), count("designsystemslug") from "themetemplates"
```

---

### MEDIUM — userprofiles — `data.all-null-column.userprofiles`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

userprofiles has 12 columns that are null in all 74 rows — no row has ever carried a value in any of them: profileid, payrate, payratemethod, profiletype, basepercentage, devcycleid, clientid, clientsecret, dashboardconfig, lockeduntil, avatarurl, pendingemail.

**Why it needs changing**: Across 74 rows, none of these 12 columns has ever been written: profileid, payrate, payratemethod, profiletype, basepercentage, devcycleid, clientid, clientsecret, dashboardconfig, lockeduntil, avatarurl, pendingemail. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("profileid"), count("payrate"), count("payratemethod"), count("profiletype"), count("basepercentage"), count("devcycleid"), count("clientid"), count("clientsecret"), count("dashboardconfig"), count("lockeduntil"), count("avatarurl"), count("pendingemail") from "userprofiles"
```

---

### MEDIUM — welcomesends — `data.all-null-column.welcomesends`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

welcomesends.error (text) is null in all 51 rows — no row has ever carried a value.

**Why it needs changing**: Across 51 rows, error has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("error") from "welcomesends"
```

---

### MEDIUM — wxkanbandocuments — `data.all-null-column.wxkanbandocuments`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

wxkanbandocuments.createdby (uuid) is null in all 11 rows — no row has ever carried a value.

**Why it needs changing**: Across 11 rows, createdby has never been written. Either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("createdby") from "wxkanbandocuments"
```

---

### MEDIUM — wxkanbanhelp — `data.all-null-column.wxkanbanhelp`

**Rule**: `data.all-null-column`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

wxkanbanhelp has 12 columns that are null in all 26 rows — no row has ever carried a value in any of them: commandalias, usage, arguments, options, examples, relatedtopics, prerequisites, minappversion, maxappversion, publishedat, deprecatedat, reviewedby.

**Why it needs changing**: Across 26 rows, none of these 12 columns has ever been written: commandalias, usage, arguments, options, examples, relatedtopics, prerequisites, minappversion, maxappversion, publishedat, deprecatedat, reviewedby. For each one, either the code path that populates it is dead, or it writes to a different column than the one intended — a mistake that produces no error, because writing to the wrong nullable column and never writing at all look identical here.

**Business impact**: If any of these columns is meant to hold data, a feature is silently not working. If it is genuinely unused, it is storage and schema noise.

**Doing nothing**: If a writer was supposed to exist for any of these columns, it keeps not existing, and nothing will surface that fact.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping a column is destructive. Confirm first whether the intended writer exists for each one — an all-null column is evidence of a bug at least as often as it is evidence of dead weight.

**Rollback**: n/a

**Evidence**

```sql
select count("commandalias"), count("usage"), count("arguments"), count("options"), count("examples"), count("relatedtopics"), count("prerequisites"), count("minappversion"), count("maxappversion"), count("publishedat"), count("deprecatedat"), count("reviewedby") from "wxkanbanhelp"
```

---

### MEDIUM — complianceoverride.overriddenby — `integrity.missing-fk.complianceoverride.overriddenby`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

complianceoverride.overriddenby references userprofiles.id (asserted by declared) but no foreign key enforces it. 0 orphaned rows out of a total that is unknown — complianceoverride has never been analyzed, so there is no planner estimate to compare against.

**Why it needs changing**: Nothing prevents a complianceoverride row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing complianceoverride row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "complianceoverride" add constraint "complianceoverride_overriddenby_fkey" foreign key ("overriddenby") references "userprofiles" ("id") not valid;
alter table "complianceoverride" validate constraint "complianceoverride_overriddenby_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "complianceoverride" drop constraint "complianceoverride_overriddenby_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "complianceoverride" c left join "userprofiles" p on c."overriddenby" = p."id" where c."overriddenby" is not null and p."id" is null
```

---

### MEDIUM — complianceoverride.projectid — `integrity.missing-fk.complianceoverride.projectid`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

complianceoverride.projectid references companyprojects.id (asserted by declared) but no foreign key enforces it. 0 orphaned rows out of a total that is unknown — complianceoverride has never been analyzed, so there is no planner estimate to compare against.

**Why it needs changing**: Nothing prevents a complianceoverride row from pointing at a deleted companyprojects. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single companyprojects deletion converts every referencing complianceoverride row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "complianceoverride" add constraint "complianceoverride_projectid_fkey" foreign key ("projectid") references "companyprojects" ("id") not valid;
alter table "complianceoverride" validate constraint "complianceoverride_projectid_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "complianceoverride" drop constraint "complianceoverride_projectid_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "complianceoverride" c left join "companyprojects" p on c."projectid" = p."id" where c."projectid" is not null and p."id" is null
```

---

### MEDIUM — complianceoverride.userid — `integrity.missing-fk.complianceoverride.userid`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

complianceoverride.userid references userprofiles.id (asserted by declared) but no foreign key enforces it. 0 orphaned rows out of a total that is unknown — complianceoverride has never been analyzed, so there is no planner estimate to compare against.

**Why it needs changing**: Nothing prevents a complianceoverride row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing complianceoverride row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "complianceoverride" add constraint "complianceoverride_userid_fkey" foreign key ("userid") references "userprofiles" ("id") not valid;
alter table "complianceoverride" validate constraint "complianceoverride_userid_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "complianceoverride" drop constraint "complianceoverride_userid_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "complianceoverride" c left join "userprofiles" p on c."userid" = p."id" where c."userid" is not null and p."id" is null
```

---

### MEDIUM — dutyassignment.assignedby — `integrity.missing-fk.dutyassignment.assignedby`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

dutyassignment.assignedby references userprofiles.id (asserted by declared) but no foreign key enforces it. 0 orphaned rows out of a total that is unknown — dutyassignment has never been analyzed, so there is no planner estimate to compare against.

**Why it needs changing**: Nothing prevents a dutyassignment row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing dutyassignment row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "dutyassignment" add constraint "dutyassignment_assignedby_fkey" foreign key ("assignedby") references "userprofiles" ("id") not valid;
alter table "dutyassignment" validate constraint "dutyassignment_assignedby_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "dutyassignment" drop constraint "dutyassignment_assignedby_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "dutyassignment" c left join "userprofiles" p on c."assignedby" = p."id" where c."assignedby" is not null and p."id" is null
```

---

### MEDIUM — dutyassignment.projectid — `integrity.missing-fk.dutyassignment.projectid`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

dutyassignment.projectid references companyprojects.id (asserted by declared) but no foreign key enforces it. 0 orphaned rows out of a total that is unknown — dutyassignment has never been analyzed, so there is no planner estimate to compare against.

**Why it needs changing**: Nothing prevents a dutyassignment row from pointing at a deleted companyprojects. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single companyprojects deletion converts every referencing dutyassignment row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "dutyassignment" add constraint "dutyassignment_projectid_fkey" foreign key ("projectid") references "companyprojects" ("id") not valid;
alter table "dutyassignment" validate constraint "dutyassignment_projectid_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "dutyassignment" drop constraint "dutyassignment_projectid_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "dutyassignment" c left join "companyprojects" p on c."projectid" = p."id" where c."projectid" is not null and p."id" is null
```

---

### MEDIUM — dutyassignment.userid — `integrity.missing-fk.dutyassignment.userid`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

dutyassignment.userid references userprofiles.id (asserted by declared) but no foreign key enforces it. 0 orphaned rows out of a total that is unknown — dutyassignment has never been analyzed, so there is no planner estimate to compare against.

**Why it needs changing**: Nothing prevents a dutyassignment row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing dutyassignment row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "dutyassignment" add constraint "dutyassignment_userid_fkey" foreign key ("userid") references "userprofiles" ("id") not valid;
alter table "dutyassignment" validate constraint "dutyassignment_userid_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "dutyassignment" drop constraint "dutyassignment_userid_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "dutyassignment" c left join "userprofiles" p on c."userid" = p."id" where c."userid" is not null and p."id" is null
```

---

### MEDIUM — projecttasks.assignedtoid — `integrity.missing-fk.projecttasks.assignedtoid`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

projecttasks.assignedtoid references userprofiles.id (asserted by declared) but no foreign key enforces it. 0 of ~6147 rows are orphaned.

**Why it needs changing**: Nothing prevents a projecttasks row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing projecttasks row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans ~6147 rows without blocking writes)

```sql
alter table "projecttasks" add constraint "projecttasks_assignedtoid_fkey" foreign key ("assignedtoid") references "userprofiles" ("id") not valid;
alter table "projecttasks" validate constraint "projecttasks_assignedtoid_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "projecttasks" drop constraint "projecttasks_assignedtoid_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "projecttasks" c left join "userprofiles" p on c."assignedtoid" = p."id" where c."assignedtoid" is not null and p."id" is null
```

---

### MEDIUM — projecttasks.createdbyid — `integrity.missing-fk.projecttasks.createdbyid`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

projecttasks.createdbyid references userprofiles.id (asserted by declared) but no foreign key enforces it. 0 of ~6147 rows are orphaned.

**Why it needs changing**: Nothing prevents a projecttasks row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing projecttasks row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans ~6147 rows without blocking writes)

```sql
alter table "projecttasks" add constraint "projecttasks_createdbyid_fkey" foreign key ("createdbyid") references "userprofiles" ("id") not valid;
alter table "projecttasks" validate constraint "projecttasks_createdbyid_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "projecttasks" drop constraint "projecttasks_createdbyid_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "projecttasks" c left join "userprofiles" p on c."createdbyid" = p."id" where c."createdbyid" is not null and p."id" is null
```

---

### MEDIUM — projecttasks.phaseid — `integrity.missing-fk.projecttasks.phaseid`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

projecttasks.phaseid references projectphases.id (asserted by declared) but no foreign key enforces it. 0 of ~6147 rows are orphaned.

**Why it needs changing**: Nothing prevents a projecttasks row from pointing at a deleted projectphases. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single projectphases deletion converts every referencing projecttasks row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans ~6147 rows without blocking writes)

```sql
alter table "projecttasks" add constraint "projecttasks_phaseid_fkey" foreign key ("phaseid") references "projectphases" ("id") not valid;
alter table "projecttasks" validate constraint "projecttasks_phaseid_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "projecttasks" drop constraint "projecttasks_phaseid_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "projecttasks" c left join "projectphases" p on c."phaseid" = p."id" where c."phaseid" is not null and p."id" is null
```

---

### MEDIUM — projectusers.projectid — `integrity.missing-fk.projectusers.projectid`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

projectusers.projectid references companyprojects.id (asserted by declared) but no foreign key enforces it. 0 orphaned rows out of a total that is unknown — projectusers has never been analyzed, so there is no planner estimate to compare against.

**Why it needs changing**: Nothing prevents a projectusers row from pointing at a deleted companyprojects. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single companyprojects deletion converts every referencing projectusers row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "projectusers" add constraint "projectusers_projectid_fkey" foreign key ("projectid") references "companyprojects" ("id") not valid;
alter table "projectusers" validate constraint "projectusers_projectid_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "projectusers" drop constraint "projectusers_projectid_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "projectusers" c left join "companyprojects" p on c."projectid" = p."id" where c."projectid" is not null and p."id" is null
```

---

### MEDIUM — projectusers.userid — `integrity.missing-fk.projectusers.userid`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

projectusers.userid references userprofiles.id (asserted by declared) but no foreign key enforces it. 0 orphaned rows out of a total that is unknown — projectusers has never been analyzed, so there is no planner estimate to compare against.

**Why it needs changing**: Nothing prevents a projectusers row from pointing at a deleted userprofiles. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single userprofiles deletion converts every referencing projectusers row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "projectusers" add constraint "projectusers_userid_fkey" foreign key ("userid") references "userprofiles" ("id") not valid;
alter table "projectusers" validate constraint "projectusers_userid_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "projectusers" drop constraint "projectusers_userid_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "projectusers" c left join "userprofiles" p on c."userid" = p."id" where c."userid" is not null and p."id" is null
```

---

### MEDIUM — teamprojectduty.projectid — `integrity.missing-fk.teamprojectduty.projectid`

**Rule**: `integrity.missing-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

teamprojectduty.projectid references companyprojects.id (asserted by declared) but no foreign key enforces it. 0 orphaned rows out of a total that is unknown — teamprojectduty has never been analyzed, so there is no planner estimate to compare against.

**Why it needs changing**: Nothing prevents a teamprojectduty row from pointing at a deleted companyprojects. The data is currently consistent, which means the gap is a latent defect rather than an active one — the next parent deletion is what creates the orphan.

**Business impact**: A single companyprojects deletion converts every referencing teamprojectduty row into an invisible orphan.

**Doing nothing**: The relationship stays unenforced; correctness depends entirely on application code getting every deletion path right, forever.

**Remediation** (additive-safe, lock: SHARE ROW EXCLUSIVE, held briefly, duration: NOT VALID is instant; VALIDATE scans row count unknown (table has never been analyzed) without blocking writes)

```sql
alter table "teamprojectduty" add constraint "teamprojectduty_projectid_fkey" foreign key ("projectid") references "companyprojects" ("id") not valid;
alter table "teamprojectduty" validate constraint "teamprojectduty_projectid_fkey";
```

**Fix risk**: Brief lock on the child table; the validating scan does not block reads or writes.

**Rollback**: alter table "teamprojectduty" drop constraint "teamprojectduty_projectid_fkey";

**Evidence**

```sql
select count(*)::bigint as orphans from "teamprojectduty" c left join "companyprojects" p on c."projectid" = p."id" where c."projectid" is not null and p."id" is null
```

---

### MEDIUM — newsletterissues.createdbyid — `integrity.undeclared-fk.newsletterissues.createdbyid`

**Rule**: `integrity.undeclared-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

Constraint newsletterissues_createdbyid_userprofiles_id_fk enforces newsletterissues.createdbyid -> userprofiles.id with ON DELETE set null, but no schema source declares it.

**Why it needs changing**: The database will apply ON DELETE set null when a userprofiles row is removed, and no code declares that behaviour. A cascade the application does not know about deletes rows nobody expected to lose; a restrict it does not know about turns an ordinary delete into an unexplained constraint error.

**Business impact**: Deletion behaviour for newsletterissues is decided by the database and is invisible in code review.

**Doing nothing**: The gap between declared and enforced deletion semantics persists, and the next person to read the schema in code will be misled.

**Remediation** (manual-only, lock: n/a — code change only, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the existing constraint in the ORM is inert at runtime; the risk is declaring a different action than the one deployed.

**Rollback**: n/a

**Evidence**

```sql
select conname, confdeltype from pg_catalog.pg_constraint where contype = 'f'
```

---

### MEDIUM — newslettersends.contactid — `integrity.undeclared-fk.newslettersends.contactid`

**Rule**: `integrity.undeclared-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

Constraint newslettersends_contactid_marketingcontacts_id_fk enforces newslettersends.contactid -> marketingcontacts.id with ON DELETE set null, but no schema source declares it.

**Why it needs changing**: The database will apply ON DELETE set null when a marketingcontacts row is removed, and no code declares that behaviour. A cascade the application does not know about deletes rows nobody expected to lose; a restrict it does not know about turns an ordinary delete into an unexplained constraint error.

**Business impact**: Deletion behaviour for newslettersends is decided by the database and is invisible in code review.

**Doing nothing**: The gap between declared and enforced deletion semantics persists, and the next person to read the schema in code will be misled.

**Remediation** (manual-only, lock: n/a — code change only, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the existing constraint in the ORM is inert at runtime; the risk is declaring a different action than the one deployed.

**Rollback**: n/a

**Evidence**

```sql
select conname, confdeltype from pg_catalog.pg_constraint where contype = 'f'
```

---

### MEDIUM — newslettersends.userid — `integrity.undeclared-fk.newslettersends.userid`

**Rule**: `integrity.undeclared-fk`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

Constraint newslettersends_userid_userprofiles_id_fk enforces newslettersends.userid -> userprofiles.id with ON DELETE set null, but no schema source declares it.

**Why it needs changing**: The database will apply ON DELETE set null when a userprofiles row is removed, and no code declares that behaviour. A cascade the application does not know about deletes rows nobody expected to lose; a restrict it does not know about turns an ordinary delete into an unexplained constraint error.

**Business impact**: Deletion behaviour for newslettersends is decided by the database and is invisible in code review.

**Doing nothing**: The gap between declared and enforced deletion semantics persists, and the next person to read the schema in code will be misled.

**Remediation** (manual-only, lock: n/a — code change only, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the existing constraint in the ORM is inert at runtime; the risk is declaring a different action than the one deployed.

**Rollback**: n/a

**Evidence**

```sql
select conname, confdeltype from pg_catalog.pg_constraint where contype = 'f'
```

---

### MEDIUM — invitationbatches (batchid) — `performance.duplicate-index.invitationbatches.invitationbatches_pkey.uk_invitationbatches_batchid`

**Rule**: `performance.duplicate-index`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

invitationbatches carries 2 indexes on the same columns (batchid): invitationbatches_pkey, uk_invitationbatches_batchid, together 16384 bytes.

**Why it needs changing**: Every insert, update, or delete on invitationbatches maintains all 2 of these indexes — invitationbatches_pkey, uk_invitationbatches_batchid — because they cover the identical column set, but the planner only ever chooses one of them to satisfy a given query. The extras pay full write cost for zero additional read benefit.

**Business impact**: 16384 bytes across 2 indexes where one would serve every query the redundant ones could also serve, plus the write cost of maintaining every copy on every change to the table.

**Doing nothing**: invitationbatches keeps paying the write and storage cost of 2 indexes doing the work of one.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "uk_invitationbatches_batchid";
```

**Fix risk**: Confirm the surviving index's options (uniqueness, opclass, sort order) cover every use case of the ones being dropped before dropping them — two indexes on the same columns can still differ in those details.

**Rollback**: CREATE UNIQUE INDEX uk_invitationbatches_batchid ON public.invitationbatches USING btree (batchid);

**Evidence**

```sql
select relname, indkey from pg_catalog.pg_index where indrelid = $table group by indkey
```

---

### MEDIUM — query performance monitoring — `performance.no-statement-stats`

**Rule**: `performance.no-statement-stats`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

pg_stat_statements is already preloaded via shared_preload_libraries and has been collecting query statistics all along, but the extension was never created, so nothing can read them. Run CREATE EXTENSION pg_stat_statements to expose the data already being gathered.

**Why it needs changing**: Without statement statistics this tool cannot rank queries by cost at all — it has no visibility into which queries actually run, how often, or how long they take. Every performance finding in this report is therefore structural, derived only from the schema and table counters, and none of it is derived from what the database is actually spending its time on — the report is blind to the workload itself.

**Business impact**: The performance findings in this report cover only what the schema and table-level counters can show. Whichever queries are actually slowest in production are invisible until this is enabled.

**Doing nothing**: Query-level cost stays invisible; this report can only reason from schema and table shape, never from actual query behaviour.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Creating the extension is a single DDL statement, but enabling collection where it is not already preloaded requires a change to shared_preload_libraries and a server restart.

**Rollback**: n/a

**Evidence**

```sql
select 1 from pg_extension where extname = 'pg_stat_statements'
```

---

### MEDIUM — events — `performance.seq-scan-heavy.events`

**Rule**: `performance.seq-scan-heavy`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

events has been sequentially scanned 1064 times against 0 index scans, reading 1700532 rows via sequential scan out of ~2795 live rows.

**Why it needs changing**: events has 2795 live rows — large enough that a sequential scan reads the whole table every time — and has been scanned that way 1064 times against only 0 index scans. Whatever predicate these queries filter on has no supporting index, so every one of them pays a full-table read instead of a targeted lookup.

**Business impact**: Each of the 1064 sequential scans reads on the order of 2795 rows instead of the handful an index lookup would touch, and the cost grows as the table grows.

**Doing nothing**: events keeps paying a full-table read for every one of these queries, and the cost grows with every row inserted.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: No index is generated automatically here because the columns these scans filter on are not visible from table-level counters alone — identify them from the query text (see the statement-statistics findings) before adding an index.

**Rollback**: n/a

**Evidence**

```sql
select seq_scan, idx_scan, seq_tup_read, n_live_tup from pg_catalog.pg_stat_user_tables
```

---

### MEDIUM — overviewtranscripts — `performance.seq-scan-heavy.overviewtranscripts`

**Rule**: `performance.seq-scan-heavy`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

overviewtranscripts has been sequentially scanned 888 times against 0 index scans, reading 995990 rows via sequential scan out of ~1645 live rows.

**Why it needs changing**: overviewtranscripts has 1645 live rows — large enough that a sequential scan reads the whole table every time — and has been scanned that way 888 times against only 0 index scans. Whatever predicate these queries filter on has no supporting index, so every one of them pays a full-table read instead of a targeted lookup.

**Business impact**: Each of the 888 sequential scans reads on the order of 1645 rows instead of the handful an index lookup would touch, and the cost grows as the table grows.

**Doing nothing**: overviewtranscripts keeps paying a full-table read for every one of these queries, and the cost grows with every row inserted.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: No index is generated automatically here because the columns these scans filter on are not visible from table-level counters alone — identify them from the query text (see the statement-statistics findings) before adding an index.

**Rollback**: n/a

**Evidence**

```sql
select seq_scan, idx_scan, seq_tup_read, n_live_tup from pg_catalog.pg_stat_user_tables
```

---

### MEDIUM — projectdocuments — `performance.seq-scan-heavy.projectdocuments`

**Rule**: `performance.seq-scan-heavy`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

projectdocuments has been sequentially scanned 67623 times against 11025 index scans, reading 129686598 rows via sequential scan out of ~4027 live rows.

**Why it needs changing**: projectdocuments has 4027 live rows — large enough that a sequential scan reads the whole table every time — and has been scanned that way 67623 times against only 11025 index scans. Whatever predicate these queries filter on has no supporting index, so every one of them pays a full-table read instead of a targeted lookup.

**Business impact**: Each of the 67623 sequential scans reads on the order of 4027 rows instead of the handful an index lookup would touch, and the cost grows as the table grows.

**Doing nothing**: projectdocuments keeps paying a full-table read for every one of these queries, and the cost grows with every row inserted.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: No index is generated automatically here because the columns these scans filter on are not visible from table-level counters alone — identify them from the query text (see the statement-statistics findings) before adding an index.

**Rollback**: n/a

**Evidence**

```sql
select seq_scan, idx_scan, seq_tup_read, n_live_tup from pg_catalog.pg_stat_user_tables
```

---

### MEDIUM — projecttasks — `performance.seq-scan-heavy.projecttasks`

**Rule**: `performance.seq-scan-heavy`  
**Severity**: medium  
**Urgency**: scheduled  
**Confidence**: proven

projecttasks has been sequentially scanned 188464 times against 3952 index scans, reading 494190556 rows via sequential scan out of ~6318 live rows.

**Why it needs changing**: projecttasks has 6318 live rows — large enough that a sequential scan reads the whole table every time — and has been scanned that way 188464 times against only 3952 index scans. Whatever predicate these queries filter on has no supporting index, so every one of them pays a full-table read instead of a targeted lookup.

**Business impact**: Each of the 188464 sequential scans reads on the order of 6318 rows instead of the handful an index lookup would touch, and the cost grows as the table grows.

**Doing nothing**: projecttasks keeps paying a full-table read for every one of these queries, and the cost grows with every row inserted.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: No index is generated automatically here because the columns these scans filter on are not visible from table-level counters alone — identify them from the query text (see the statement-statistics findings) before adding an index.

**Rollback**: n/a

**Evidence**

```sql
select seq_scan, idx_scan, seq_tup_read, n_live_tup from pg_catalog.pg_stat_user_tables
```

---

### MEDIUM — auditexecutions.reportdocumentid — `integrity.unindexed-fk.auditexecutions.reportdocumentid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

auditexecutions.reportdocumentid references wxkanbandocuments but has no index; auditexecutions holds ~5 rows.

**Why it needs changing**: Every delete or key update on wxkanbandocuments must scan ~5 rows of auditexecutions to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a wxkanbandocuments is slow and blocks concurrent writes to auditexecutions for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as auditexecutions grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~5 rows; runs online)

```sql
create index concurrently "idx_auditexecutions_reportdocumentid" on "auditexecutions" ("reportdocumentid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_auditexecutions_reportdocumentid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — auditexecutions.triggeredby — `integrity.unindexed-fk.auditexecutions.triggeredby`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

auditexecutions.triggeredby references userprofiles but has no index; auditexecutions holds ~5 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~5 rows of auditexecutions to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to auditexecutions for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as auditexecutions grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~5 rows; runs online)

```sql
create index concurrently "idx_auditexecutions_triggeredby" on "auditexecutions" ("triggeredby");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_auditexecutions_triggeredby";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — auditreportmetadata.documentid — `integrity.unindexed-fk.auditreportmetadata.documentid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

auditreportmetadata.documentid references wxkanbandocuments but has no index; auditreportmetadata holds ~3 rows.

**Why it needs changing**: Every delete or key update on wxkanbandocuments must scan ~3 rows of auditreportmetadata to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a wxkanbandocuments is slow and blocks concurrent writes to auditreportmetadata for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as auditreportmetadata grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~3 rows; runs online)

```sql
create index concurrently "idx_auditreportmetadata_documentid" on "auditreportmetadata" ("documentid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_auditreportmetadata_documentid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — auditreportmetadata.executionid — `integrity.unindexed-fk.auditreportmetadata.executionid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

auditreportmetadata.executionid references auditexecutions but has no index; auditreportmetadata holds ~3 rows.

**Why it needs changing**: Every delete or key update on auditexecutions must scan ~3 rows of auditreportmetadata to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a auditexecutions is slow and blocks concurrent writes to auditreportmetadata for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as auditreportmetadata grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~3 rows; runs online)

```sql
create index concurrently "idx_auditreportmetadata_executionid" on "auditreportmetadata" ("executionid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_auditreportmetadata_executionid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — auditreportmetadata.reviewedby — `integrity.unindexed-fk.auditreportmetadata.reviewedby`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

auditreportmetadata.reviewedby references userprofiles but has no index; auditreportmetadata holds ~3 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~3 rows of auditreportmetadata to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to auditreportmetadata for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as auditreportmetadata grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~3 rows; runs online)

```sql
create index concurrently "idx_auditreportmetadata_reviewedby" on "auditreportmetadata" ("reviewedby");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_auditreportmetadata_reviewedby";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — auditresults.taskid — `integrity.unindexed-fk.auditresults.taskid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

auditresults.taskid references complianceaudittasks but has no index; auditresults holds ~10 rows.

**Why it needs changing**: Every delete or key update on complianceaudittasks must scan ~10 rows of auditresults to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a complianceaudittasks is slow and blocks concurrent writes to auditresults for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as auditresults grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~10 rows; runs online)

```sql
create index concurrently "idx_auditresults_taskid" on "auditresults" ("taskid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_auditresults_taskid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — campaignposts.assetid — `integrity.unindexed-fk.campaignposts.assetid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

campaignposts.assetid references marketingassets but has no index; campaignposts holds ~106 rows.

**Why it needs changing**: Every delete or key update on marketingassets must scan ~106 rows of campaignposts to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a marketingassets is slow and blocks concurrent writes to campaignposts for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as campaignposts grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~106 rows; runs online)

```sql
create index concurrently "idx_campaignposts_assetid" on "campaignposts" ("assetid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_campaignposts_assetid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — campaignposts.companyid — `integrity.unindexed-fk.campaignposts.companyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

campaignposts.companyid references companies but has no index; campaignposts holds ~106 rows.

**Why it needs changing**: Every delete or key update on companies must scan ~106 rows of campaignposts to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to campaignposts for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as campaignposts grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~106 rows; runs online)

```sql
create index concurrently "idx_campaignposts_companyid" on "campaignposts" ("companyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_campaignposts_companyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — campaigns.companyid — `integrity.unindexed-fk.campaigns.companyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

campaigns.companyid references companies but has no index; campaigns holds ~1 rows.

**Why it needs changing**: Every delete or key update on companies must scan ~1 rows of campaigns to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to campaigns for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as campaigns grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_campaigns_companyid" on "campaigns" ("companyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_campaigns_companyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — companyauditlogs.changedby — `integrity.unindexed-fk.companyauditlogs.changedby`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

companyauditlogs.changedby references userprofiles but has no index; companyauditlogs holds ~292 rows.

**Why it needs changing**: No foreign key enforces companyauditlogs.changedby today (see the related missing-fk finding), so a userprofiles delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and every ordinary lookup by this column in the meantime would otherwise scan ~292 rows of companyauditlogs sequentially. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against companyauditlogs pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as companyauditlogs grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~292 rows; runs online)

```sql
create index concurrently "idx_companyauditlogs_changedby" on "companyauditlogs" ("changedby");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_companyauditlogs_changedby";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — companyprojects.companyid — `integrity.unindexed-fk.companyprojects.companyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

companyprojects.companyid references companies but has no index; companyprojects holds ~106 rows.

**Why it needs changing**: Every delete or key update on companies must scan ~106 rows of companyprojects to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to companyprojects for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as companyprojects grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~106 rows; runs online)

```sql
create index concurrently "idx_companyprojects_companyid" on "companyprojects" ("companyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_companyprojects_companyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — companyprojects.userid — `integrity.unindexed-fk.companyprojects.userid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

companyprojects.userid references userprofiles but has no index; companyprojects holds ~106 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~106 rows of companyprojects to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to companyprojects for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as companyprojects grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~106 rows; runs online)

```sql
create index concurrently "idx_companyprojects_userid" on "companyprojects" ("userid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_companyprojects_userid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — complianceaudittasks.documentid — `integrity.unindexed-fk.complianceaudittasks.documentid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

complianceaudittasks.documentid references wxkanbandocuments but has no index; complianceaudittasks holds ~565 rows.

**Why it needs changing**: Every delete or key update on wxkanbandocuments must scan ~565 rows of complianceaudittasks to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a wxkanbandocuments is slow and blocks concurrent writes to complianceaudittasks for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as complianceaudittasks grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~565 rows; runs online)

```sql
create index concurrently "idx_complianceaudittasks_documentid" on "complianceaudittasks" ("documentid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_complianceaudittasks_documentid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — emailverificationtokens.userid — `integrity.unindexed-fk.emailverificationtokens.userid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

emailverificationtokens.userid references userprofiles but has no index; emailverificationtokens holds ~12 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~12 rows of emailverificationtokens to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to emailverificationtokens for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as emailverificationtokens grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~12 rows; runs online)

```sql
create index concurrently "idx_emailverificationtokens_userid" on "emailverificationtokens" ("userid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_emailverificationtokens_userid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — engagementassignments.addedbyid — `integrity.unindexed-fk.engagementassignments.addedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

engagementassignments.addedbyid references userprofiles but has no index; engagementassignments holds ~1 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~1 rows of engagementassignments to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to engagementassignments for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as engagementassignments grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_engagementassignments_addedbyid" on "engagementassignments" ("addedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_engagementassignments_addedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — engagementassignments.removedbyid — `integrity.unindexed-fk.engagementassignments.removedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

engagementassignments.removedbyid references userprofiles but has no index; engagementassignments holds ~1 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~1 rows of engagementassignments to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to engagementassignments for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as engagementassignments grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_engagementassignments_removedbyid" on "engagementassignments" ("removedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_engagementassignments_removedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — engagementinvitations.invitedbyid — `integrity.unindexed-fk.engagementinvitations.invitedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

engagementinvitations.invitedbyid references userprofiles but has no index; engagementinvitations holds ~1 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~1 rows of engagementinvitations to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to engagementinvitations for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as engagementinvitations grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_engagementinvitations_invitedbyid" on "engagementinvitations" ("invitedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_engagementinvitations_invitedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — engagements.acceptedbyid — `integrity.unindexed-fk.engagements.acceptedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

engagements.acceptedbyid references userprofiles but has no index; engagements holds ~1 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~1 rows of engagements to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to engagements for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as engagements grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_engagements_acceptedbyid" on "engagements" ("acceptedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_engagements_acceptedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — engagements.createdbyid — `integrity.unindexed-fk.engagements.createdbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

engagements.createdbyid references userprofiles but has no index; engagements holds ~1 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~1 rows of engagements to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to engagements for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as engagements grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_engagements_createdbyid" on "engagements" ("createdbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_engagements_createdbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — engagements.endedbyid — `integrity.unindexed-fk.engagements.endedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

engagements.endedbyid references userprofiles but has no index; engagements holds ~1 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~1 rows of engagements to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to engagements for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as engagements grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_engagements_endedbyid" on "engagements" ("endedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_engagements_endedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — engagements.invitationid — `integrity.unindexed-fk.engagements.invitationid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

engagements.invitationid references engagementinvitations but has no index; engagements holds ~1 rows.

**Why it needs changing**: Every delete or key update on engagementinvitations must scan ~1 rows of engagements to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a engagementinvitations is slow and blocks concurrent writes to engagements for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as engagements grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_engagements_invitationid" on "engagements" ("invitationid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_engagements_invitationid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — favoritetask.userprofileid — `integrity.unindexed-fk.favoritetask.userprofileid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: inferred

favoritetask.userprofileid references userprofiles but has no index; favoritetask holds ~41 rows.

**Why it needs changing**: No foreign key enforces favoritetask.userprofileid today (see the related missing-fk finding), so a userprofiles delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and every ordinary lookup by this column in the meantime would otherwise scan ~41 rows of favoritetask sequentially. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against favoritetask pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as favoritetask grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~41 rows; runs online)

```sql
create index concurrently "idx_favoritetask_userprofileid" on "favoritetask" ("userprofileid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_favoritetask_userprofileid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — feedbacksubmissions.companyid — `integrity.unindexed-fk.feedbacksubmissions.companyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

feedbacksubmissions.companyid references companies but has no index; feedbacksubmissions holds ~83 rows.

**Why it needs changing**: Every delete or key update on companies must scan ~83 rows of feedbacksubmissions to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to feedbacksubmissions for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as feedbacksubmissions grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~83 rows; runs online)

```sql
create index concurrently "idx_feedbacksubmissions_companyid" on "feedbacksubmissions" ("companyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_feedbacksubmissions_companyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — feedbacksubmissions.duplicateofid — `integrity.unindexed-fk.feedbacksubmissions.duplicateofid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

feedbacksubmissions.duplicateofid references feedbacksubmissions but has no index; feedbacksubmissions holds ~83 rows.

**Why it needs changing**: Every delete or key update on feedbacksubmissions must scan ~83 rows of feedbacksubmissions to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a feedbacksubmissions is slow and blocks concurrent writes to feedbacksubmissions for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as feedbacksubmissions grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~83 rows; runs online)

```sql
create index concurrently "idx_feedbacksubmissions_duplicateofid" on "feedbacksubmissions" ("duplicateofid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_feedbacksubmissions_duplicateofid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — marketingassets.companyid — `integrity.unindexed-fk.marketingassets.companyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

marketingassets.companyid references companies but has no index; marketingassets holds ~266 rows.

**Why it needs changing**: Every delete or key update on companies must scan ~266 rows of marketingassets to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to marketingassets for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as marketingassets grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~266 rows; runs online)

```sql
create index concurrently "idx_marketingassets_companyid" on "marketingassets" ("companyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_marketingassets_companyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — marketingbanners.companyid — `integrity.unindexed-fk.marketingbanners.companyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

marketingbanners.companyid references companies but has no index; marketingbanners holds ~1 rows.

**Why it needs changing**: Every delete or key update on companies must scan ~1 rows of marketingbanners to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to marketingbanners for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as marketingbanners grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_marketingbanners_companyid" on "marketingbanners" ("companyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_marketingbanners_companyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — marketingbanners.linkid — `integrity.unindexed-fk.marketingbanners.linkid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

marketingbanners.linkid references marketinglinks but has no index; marketingbanners holds ~1 rows.

**Why it needs changing**: Every delete or key update on marketinglinks must scan ~1 rows of marketingbanners to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a marketinglinks is slow and blocks concurrent writes to marketingbanners for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as marketingbanners grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_marketingbanners_linkid" on "marketingbanners" ("linkid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_marketingbanners_linkid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — marketingleads.companyid — `integrity.unindexed-fk.marketingleads.companyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

marketingleads.companyid references companies but has no index; marketingleads holds ~3 rows.

**Why it needs changing**: Every delete or key update on companies must scan ~3 rows of marketingleads to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to marketingleads for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as marketingleads grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~3 rows; runs online)

```sql
create index concurrently "idx_marketingleads_companyid" on "marketingleads" ("companyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_marketingleads_companyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — mcpapitokens.issuedbyid — `integrity.unindexed-fk.mcpapitokens.issuedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

mcpapitokens.issuedbyid references userprofiles but has no index; mcpapitokens holds ~202 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~202 rows of mcpapitokens to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to mcpapitokens for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as mcpapitokens grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~202 rows; runs online)

```sql
create index concurrently "idx_mcpapitokens_issuedbyid" on "mcpapitokens" ("issuedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_mcpapitokens_issuedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — mcpapitokens.revokedbyid — `integrity.unindexed-fk.mcpapitokens.revokedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

mcpapitokens.revokedbyid references userprofiles but has no index; mcpapitokens holds ~202 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~202 rows of mcpapitokens to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to mcpapitokens for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as mcpapitokens grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~202 rows; runs online)

```sql
create index concurrently "idx_mcpapitokens_revokedbyid" on "mcpapitokens" ("revokedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_mcpapitokens_revokedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — newsletterissues.createdbyid — `integrity.unindexed-fk.newsletterissues.createdbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

newsletterissues.createdbyid references userprofiles but has no index; newsletterissues holds ~9 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~9 rows of newsletterissues to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to newsletterissues for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as newsletterissues grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~9 rows; runs online)

```sql
create index concurrently "idx_newsletterissues_createdbyid" on "newsletterissues" ("createdbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_newsletterissues_createdbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — newslettersends.contactid — `integrity.unindexed-fk.newslettersends.contactid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

newslettersends.contactid references marketingcontacts but has no index; newslettersends holds ~3540 rows.

**Why it needs changing**: Every delete or key update on marketingcontacts must scan ~3540 rows of newslettersends to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a marketingcontacts is slow and blocks concurrent writes to newslettersends for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as newslettersends grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~3540 rows; runs online)

```sql
create index concurrently "idx_newslettersends_contactid" on "newslettersends" ("contactid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_newslettersends_contactid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — newslettersends.userid — `integrity.unindexed-fk.newslettersends.userid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

newslettersends.userid references userprofiles but has no index; newslettersends holds ~3540 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~3540 rows of newslettersends to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to newslettersends for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as newslettersends grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~3540 rows; runs online)

```sql
create index concurrently "idx_newslettersends_userid" on "newslettersends" ("userid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_newslettersends_userid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — notes.projectid — `integrity.unindexed-fk.notes.projectid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

notes.projectid references companyprojects but has no index; notes holds ~1 rows.

**Why it needs changing**: Every delete or key update on companyprojects must scan ~1 rows of notes to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companyprojects is slow and blocks concurrent writes to notes for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as notes grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_notes_projectid" on "notes" ("projectid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_notes_projectid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — notifications.userid — `integrity.unindexed-fk.notifications.userid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

notifications.userid references userprofiles but has no index; notifications holds ~326 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~326 rows of notifications to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to notifications for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as notifications grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~326 rows; runs online)

```sql
create index concurrently "idx_notifications_userid" on "notifications" ("userid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_notifications_userid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — overviewdrafts.authoruserid — `integrity.unindexed-fk.overviewdrafts.authoruserid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

overviewdrafts.authoruserid references userprofiles but has no index; overviewdrafts holds ~74 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~74 rows of overviewdrafts to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to overviewdrafts for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as overviewdrafts grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~74 rows; runs online)

```sql
create index concurrently "idx_overviewdrafts_authoruserid" on "overviewdrafts" ("authoruserid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_overviewdrafts_authoruserid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — overviewdrafts.companyid — `integrity.unindexed-fk.overviewdrafts.companyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

overviewdrafts.companyid references companies but has no index; overviewdrafts holds ~74 rows.

**Why it needs changing**: Every delete or key update on companies must scan ~74 rows of overviewdrafts to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companies is slow and blocks concurrent writes to overviewdrafts for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as overviewdrafts grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~74 rows; runs online)

```sql
create index concurrently "idx_overviewdrafts_companyid" on "overviewdrafts" ("companyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_overviewdrafts_companyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — overviewdrafts.projectid — `integrity.unindexed-fk.overviewdrafts.projectid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

overviewdrafts.projectid references companyprojects but has no index; overviewdrafts holds ~74 rows.

**Why it needs changing**: Every delete or key update on companyprojects must scan ~74 rows of overviewdrafts to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companyprojects is slow and blocks concurrent writes to overviewdrafts for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as overviewdrafts grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~74 rows; runs online)

```sql
create index concurrently "idx_overviewdrafts_projectid" on "overviewdrafts" ("projectid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_overviewdrafts_projectid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — overviewdrafts.proposalid — `integrity.unindexed-fk.overviewdrafts.proposalid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

overviewdrafts.proposalid references projectproposals but has no index; overviewdrafts holds ~74 rows.

**Why it needs changing**: Every delete or key update on projectproposals must scan ~74 rows of overviewdrafts to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a projectproposals is slow and blocks concurrent writes to overviewdrafts for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as overviewdrafts grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~74 rows; runs online)

```sql
create index concurrently "idx_overviewdrafts_proposalid" on "overviewdrafts" ("proposalid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_overviewdrafts_proposalid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — overviewtranscripts.overviewdraftid — `integrity.unindexed-fk.overviewtranscripts.overviewdraftid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

overviewtranscripts.overviewdraftid references overviewdrafts but has no index; overviewtranscripts holds ~1605 rows.

**Why it needs changing**: Every delete or key update on overviewdrafts must scan ~1605 rows of overviewtranscripts to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a overviewdrafts is slow and blocks concurrent writes to overviewtranscripts for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as overviewtranscripts grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1605 rows; runs online)

```sql
create index concurrently "idx_overviewtranscripts_overviewdraftid" on "overviewtranscripts" ("overviewdraftid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_overviewtranscripts_overviewdraftid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectdocuments.createdbyid — `integrity.unindexed-fk.projectdocuments.createdbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectdocuments.createdbyid references userprofiles but has no index; projectdocuments holds ~4021 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~4021 rows of projectdocuments to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to projectdocuments for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectdocuments grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~4021 rows; runs online)

```sql
create index concurrently "idx_projectdocuments_createdbyid" on "projectdocuments" ("createdbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectdocuments_createdbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectdocuments.projectid — `integrity.unindexed-fk.projectdocuments.projectid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectdocuments.projectid references companyprojects but has no index; projectdocuments holds ~4021 rows.

**Why it needs changing**: Every delete or key update on companyprojects must scan ~4021 rows of projectdocuments to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companyprojects is slow and blocks concurrent writes to projectdocuments for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectdocuments grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~4021 rows; runs online)

```sql
create index concurrently "idx_projectdocuments_projectid" on "projectdocuments" ("projectid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectdocuments_projectid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectdocuments.specid — `integrity.unindexed-fk.projectdocuments.specid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectdocuments.specid references projectspecifications but has no index; projectdocuments holds ~4021 rows.

**Why it needs changing**: Every delete or key update on projectspecifications must scan ~4021 rows of projectdocuments to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a projectspecifications is slow and blocks concurrent writes to projectdocuments for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectdocuments grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~4021 rows; runs online)

```sql
create index concurrently "idx_projectdocuments_specid" on "projectdocuments" ("specid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectdocuments_specid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectphases.projectid — `integrity.unindexed-fk.projectphases.projectid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectphases.projectid references companyprojects but has no index; projectphases holds ~600 rows.

**Why it needs changing**: Every delete or key update on companyprojects must scan ~600 rows of projectphases to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companyprojects is slow and blocks concurrent writes to projectphases for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectphases grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~600 rows; runs online)

```sql
create index concurrently "idx_projectphases_projectid" on "projectphases" ("projectid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectphases_projectid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectproposals.createdbyid — `integrity.unindexed-fk.projectproposals.createdbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectproposals.createdbyid references userprofiles but has no index; projectproposals holds ~8 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~8 rows of projectproposals to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to projectproposals for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectproposals grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~8 rows; runs online)

```sql
create index concurrently "idx_projectproposals_createdbyid" on "projectproposals" ("createdbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectproposals_createdbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectproposals.projectid — `integrity.unindexed-fk.projectproposals.projectid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectproposals.projectid references companyprojects but has no index; projectproposals holds ~8 rows.

**Why it needs changing**: Every delete or key update on companyprojects must scan ~8 rows of projectproposals to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companyprojects is slow and blocks concurrent writes to projectproposals for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectproposals grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~8 rows; runs online)

```sql
create index concurrently "idx_projectproposals_projectid" on "projectproposals" ("projectid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectproposals_projectid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectspecifications.claimedbyid — `integrity.unindexed-fk.projectspecifications.claimedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectspecifications.claimedbyid references userprofiles but has no index; projectspecifications holds ~1275 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~1275 rows of projectspecifications to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to projectspecifications for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectspecifications grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1275 rows; runs online)

```sql
create index concurrently "idx_projectspecifications_claimedbyid" on "projectspecifications" ("claimedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectspecifications_claimedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectspecifications.createdbyid — `integrity.unindexed-fk.projectspecifications.createdbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectspecifications.createdbyid references userprofiles but has no index; projectspecifications holds ~1275 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~1275 rows of projectspecifications to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to projectspecifications for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectspecifications grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1275 rows; runs online)

```sql
create index concurrently "idx_projectspecifications_createdbyid" on "projectspecifications" ("createdbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectspecifications_createdbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectspecifications.phaseid — `integrity.unindexed-fk.projectspecifications.phaseid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectspecifications.phaseid references projectphases but has no index; projectspecifications holds ~1275 rows.

**Why it needs changing**: No foreign key enforces projectspecifications.phaseid today (see the related missing-fk finding), so a projectphases delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and every ordinary lookup by this column in the meantime would otherwise scan ~1275 rows of projectspecifications sequentially. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against projectspecifications pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectspecifications grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1275 rows; runs online)

```sql
create index concurrently "idx_projectspecifications_phaseid" on "projectspecifications" ("phaseid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectspecifications_phaseid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projecttasks.assignedtoid — `integrity.unindexed-fk.projecttasks.assignedtoid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.assignedtoid references userprofiles but has no index; projecttasks holds ~6147 rows.

**Why it needs changing**: No foreign key enforces projecttasks.assignedtoid today (see the related missing-fk finding), so a userprofiles delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and every ordinary lookup by this column in the meantime would otherwise scan ~6147 rows of projecttasks sequentially. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against projecttasks pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as projecttasks grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~6147 rows; runs online)

```sql
create index concurrently "idx_projecttasks_assignedtoid" on "projecttasks" ("assignedtoid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projecttasks_assignedtoid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projecttasks.createdbyid — `integrity.unindexed-fk.projecttasks.createdbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.createdbyid references userprofiles but has no index; projecttasks holds ~6147 rows.

**Why it needs changing**: No foreign key enforces projecttasks.createdbyid today (see the related missing-fk finding), so a userprofiles delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and every ordinary lookup by this column in the meantime would otherwise scan ~6147 rows of projecttasks sequentially. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against projecttasks pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as projecttasks grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~6147 rows; runs online)

```sql
create index concurrently "idx_projecttasks_createdbyid" on "projecttasks" ("createdbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projecttasks_createdbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projecttasks.phaseid — `integrity.unindexed-fk.projecttasks.phaseid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.phaseid references projectphases but has no index; projecttasks holds ~6147 rows.

**Why it needs changing**: No foreign key enforces projecttasks.phaseid today (see the related missing-fk finding), so a projectphases delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and every ordinary lookup by this column in the meantime would otherwise scan ~6147 rows of projecttasks sequentially. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against projecttasks pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as projecttasks grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~6147 rows; runs online)

```sql
create index concurrently "idx_projecttasks_phaseid" on "projecttasks" ("phaseid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projecttasks_phaseid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projecttasks.projectid — `integrity.unindexed-fk.projecttasks.projectid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.projectid references companyprojects but has no index; projecttasks holds ~6147 rows.

**Why it needs changing**: Every delete or key update on companyprojects must scan ~6147 rows of projecttasks to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a companyprojects is slow and blocks concurrent writes to projecttasks for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projecttasks grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~6147 rows; runs online)

```sql
create index concurrently "idx_projecttasks_projectid" on "projecttasks" ("projectid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projecttasks_projectid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projecttasks.specid — `integrity.unindexed-fk.projecttasks.specid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.specid references projectspecifications but has no index; projecttasks holds ~6147 rows.

**Why it needs changing**: Every delete or key update on projectspecifications must scan ~6147 rows of projecttasks to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a projectspecifications is slow and blocks concurrent writes to projecttasks for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projecttasks grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~6147 rows; runs online)

```sql
create index concurrently "idx_projecttasks_specid" on "projecttasks" ("specid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projecttasks_specid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projecttasktimelog.userprofileid — `integrity.unindexed-fk.projecttasktimelog.userprofileid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: inferred

projecttasktimelog.userprofileid references userprofiles but has no index; projecttasktimelog holds ~1211 rows.

**Why it needs changing**: No foreign key enforces projecttasktimelog.userprofileid today (see the related missing-fk finding), so a userprofiles delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and every ordinary lookup by this column in the meantime would otherwise scan ~1211 rows of projecttasktimelog sequentially. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against projecttasktimelog pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as projecttasktimelog grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1211 rows; runs online)

```sql
create index concurrently "idx_projecttasktimelog_userprofileid" on "projecttasktimelog" ("userprofileid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projecttasktimelog_userprofileid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectteam.userprofileid — `integrity.unindexed-fk.projectteam.userprofileid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: inferred

projectteam.userprofileid references userprofiles but has no index; projectteam holds ~93 rows.

**Why it needs changing**: No foreign key enforces projectteam.userprofileid today (see the related missing-fk finding), so a userprofiles delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and every ordinary lookup by this column in the meantime would otherwise scan ~93 rows of projectteam sequentially. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against projectteam pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectteam grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~93 rows; runs online)

```sql
create index concurrently "idx_projectteam_userprofileid" on "projectteam" ("userprofileid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectteam_userprofileid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectthemes.createdbyid — `integrity.unindexed-fk.projectthemes.createdbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectthemes.createdbyid references userprofiles but has no index; projectthemes holds ~14 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~14 rows of projectthemes to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to projectthemes for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as projectthemes grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~14 rows; runs online)

```sql
create index concurrently "idx_projectthemes_createdbyid" on "projectthemes" ("createdbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_projectthemes_createdbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — scopeconversations.scopeid — `integrity.unindexed-fk.scopeconversations.scopeid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

scopeconversations.scopeid references projectspecifications but has no index; scopeconversations holds ~115 rows.

**Why it needs changing**: Every delete or key update on projectspecifications must scan ~115 rows of scopeconversations to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a projectspecifications is slow and blocks concurrent writes to scopeconversations for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as scopeconversations grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~115 rows; runs online)

```sql
create index concurrently "idx_scopeconversations_scopeid" on "scopeconversations" ("scopeid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_scopeconversations_scopeid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — settings.userprofileid — `integrity.unindexed-fk.settings.userprofileid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: inferred

settings.userprofileid references userprofiles but has no index; settings holds ~74 rows.

**Why it needs changing**: No foreign key enforces settings.userprofileid today (see the related missing-fk finding), so a userprofiles delete triggers no such scan right now. But the constraint cannot be added economically without this index first — VALIDATE CONSTRAINT, and every ordinary lookup by this column in the meantime would otherwise scan ~74 rows of settings sequentially. Add the index before the foreign key, not after.

**Business impact**: Adding the foreign key later requires a slow VALIDATE, and every interim lookup by this column against settings pays a sequential scan.

**Doing nothing**: Parent deletions stay slow and get slower as settings grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~74 rows; runs online)

```sql
create index concurrently "idx_settings_userprofileid" on "settings" ("userprofileid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_settings_userprofileid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — specificationphases.specificationid — `integrity.unindexed-fk.specificationphases.specificationid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

specificationphases.specificationid references projectspecifications but has no index; specificationphases holds ~1 rows.

**Why it needs changing**: Every delete or key update on projectspecifications must scan ~1 rows of specificationphases to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a projectspecifications is slow and blocks concurrent writes to specificationphases for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as specificationphases grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_specificationphases_specificationid" on "specificationphases" ("specificationid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_specificationphases_specificationid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — themetemplates.createdbyid — `integrity.unindexed-fk.themetemplates.createdbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

themetemplates.createdbyid references userprofiles but has no index; themetemplates holds ~5 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~5 rows of themetemplates to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to themetemplates for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as themetemplates grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~5 rows; runs online)

```sql
create index concurrently "idx_themetemplates_createdbyid" on "themetemplates" ("createdbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_themetemplates_createdbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — welcomemessages.updatedbyid — `integrity.unindexed-fk.welcomemessages.updatedbyid`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

welcomemessages.updatedbyid references userprofiles but has no index; welcomemessages holds ~1 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~1 rows of welcomemessages to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to welcomemessages for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as welcomemessages grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~1 rows; runs online)

```sql
create index concurrently "idx_welcomemessages_updatedbyid" on "welcomemessages" ("updatedbyid");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_welcomemessages_updatedbyid";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — wxkanbandocuments.createdby — `integrity.unindexed-fk.wxkanbandocuments.createdby`

**Rule**: `integrity.unindexed-fk`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

wxkanbandocuments.createdby references userprofiles but has no index; wxkanbandocuments holds ~9 rows.

**Why it needs changing**: Every delete or key update on userprofiles must scan ~9 rows of wxkanbandocuments to check for referencing rows, and it holds a lock for the duration of that scan. The cost falls on the parent's writes, which is why it is easy to miss when profiling the child.

**Business impact**: Deleting a userprofiles is slow and blocks concurrent writes to wxkanbandocuments for the length of the scan.

**Doing nothing**: Parent deletions stay slow and get slower as wxkanbandocuments grows.

**Remediation** (additive-safe, lock: SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes, duration: proportional to ~9 rows; runs online)

```sql
create index concurrently "idx_wxkanbandocuments_createdby" on "wxkanbandocuments" ("createdby");
```

**Fix risk**: CREATE INDEX CONCURRENTLY cannot run inside a transaction block and leaves an INVALID index behind if it fails, which must then be dropped. It does not block reads or writes while building.

**Rollback**: drop index concurrently "idx_wxkanbandocuments_createdby";

**Evidence**

```sql
select indkey from pg_catalog.pg_index where indrelid = $child
```

---

### MEDIUM — projectdocuments.sourceeventid — `schema.undeclared-column.projectdocuments.sourceeventid`

**Rule**: `schema.undeclared-column`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectdocuments.sourceeventid exists in the database but is not declared.

**Why it needs changing**: The application cannot read or write sourceeventid, so any data in it is inaccessible to the product and invisible to type checking.

**Business impact**: Data written by another process is stranded outside the model.

**Doing nothing**: The column stays invisible to the application indefinitely.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the column in code is inert until deployed; no database change is required.

**Rollback**: n/a

**Evidence**

```sql
select attname, attnotnull, atthasdef from pg_catalog.pg_attribute
```

---

### MEDIUM — projectdocuments.tags — `schema.undeclared-column.projectdocuments.tags`

**Rule**: `schema.undeclared-column`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectdocuments.tags exists in the database but is not declared.

**Why it needs changing**: The application cannot read or write tags, so any data in it is inaccessible to the product and invisible to type checking.

**Business impact**: Data written by another process is stranded outside the model.

**Doing nothing**: The column stays invisible to the application indefinitely.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the column in code is inert until deployed; no database change is required.

**Rollback**: n/a

**Evidence**

```sql
select attname, attnotnull, atthasdef from pg_catalog.pg_attribute
```

---

### MEDIUM — projectdocuments.taskids — `schema.undeclared-column.projectdocuments.taskids`

**Rule**: `schema.undeclared-column`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projectdocuments.taskids exists in the database but is not declared.

**Why it needs changing**: The application cannot read or write taskids, so any data in it is inaccessible to the product and invisible to type checking.

**Business impact**: Data written by another process is stranded outside the model.

**Doing nothing**: The column stays invisible to the application indefinitely.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the column in code is inert until deployed; no database change is required.

**Rollback**: n/a

**Evidence**

```sql
select attname, attnotnull, atthasdef from pg_catalog.pg_attribute
```

---

### MEDIUM — projecttasks.assignee — `schema.undeclared-column.projecttasks.assignee`

**Rule**: `schema.undeclared-column`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.assignee exists in the database but is not declared.

**Why it needs changing**: The application cannot read or write assignee, so any data in it is inaccessible to the product and invisible to type checking.

**Business impact**: Data written by another process is stranded outside the model.

**Doing nothing**: The column stays invisible to the application indefinitely.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the column in code is inert until deployed; no database change is required.

**Rollback**: n/a

**Evidence**

```sql
select attname, attnotnull, atthasdef from pg_catalog.pg_attribute
```

---

### MEDIUM — projecttasks.documentids — `schema.undeclared-column.projecttasks.documentids`

**Rule**: `schema.undeclared-column`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.documentids exists in the database but is not declared.

**Why it needs changing**: The application cannot read or write documentids, so any data in it is inaccessible to the product and invisible to type checking.

**Business impact**: Data written by another process is stranded outside the model.

**Doing nothing**: The column stays invisible to the application indefinitely.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the column in code is inert until deployed; no database change is required.

**Rollback**: n/a

**Evidence**

```sql
select attname, attnotnull, atthasdef from pg_catalog.pg_attribute
```

---

### MEDIUM — projecttasks.sourceeventid — `schema.undeclared-column.projecttasks.sourceeventid`

**Rule**: `schema.undeclared-column`  
**Severity**: medium  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.sourceeventid exists in the database but is not declared.

**Why it needs changing**: The application cannot read or write sourceeventid, so any data in it is inaccessible to the product and invisible to type checking.

**Business impact**: Data written by another process is stranded outside the model.

**Doing nothing**: The column stays invisible to the application indefinitely.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Declaring the column in code is inert until deployed; no database change is required.

**Rollback**: n/a

**Evidence**

```sql
select attname, attnotnull, atthasdef from pg_catalog.pg_attribute
```

---

### LOW — aiproposals — `data.empty-table.aiproposals`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

aiproposals exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "aiproposals"
```

---

### LOW — aispecsessions — `data.empty-table.aispecsessions`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

aispecsessions exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "aispecsessions"
```

---

### LOW — appauditconfigurations — `data.empty-table.appauditconfigurations`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

appauditconfigurations exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "appauditconfigurations"
```

---

### LOW — auditresults — `data.empty-table.auditresults`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

auditresults exists and holds no rows (16384 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "auditresults"
```

---

### LOW — clientgroups — `data.empty-table.clientgroups`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

clientgroups exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "clientgroups"
```

---

### LOW — collapsexref — `data.empty-table.collapsexref`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

collapsexref exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "collapsexref"
```

---

### LOW — company_analytics — `data.empty-table.company_analytics`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

company_analytics exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "company_analytics"
```

---

### LOW — complianceflags — `data.empty-table.complianceflags`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

complianceflags exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "complianceflags"
```

---

### LOW — complianceoverride — `data.empty-table.complianceoverride`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

complianceoverride exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "complianceoverride"
```

---

### LOW — connectionhealth — `data.empty-table.connectionhealth`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

connectionhealth exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "connectionhealth"
```

---

### LOW — credentialauditlogs — `data.empty-table.credentialauditlogs`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

credentialauditlogs exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "credentialauditlogs"
```

---

### LOW — departments — `data.empty-table.departments`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

departments exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "departments"
```

---

### LOW — dutyassignment — `data.empty-table.dutyassignment`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

dutyassignment exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "dutyassignment"
```

---

### LOW — engagementmodifications — `data.empty-table.engagementmodifications`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagementmodifications exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "engagementmodifications"
```

---

### LOW — externalconnections — `data.empty-table.externalconnections`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

externalconnections exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "externalconnections"
```

---

### LOW — feedbacks — `data.empty-table.feedbacks`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

feedbacks exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "feedbacks"
```

---

### LOW — fees — `data.empty-table.fees`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

fees exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "fees"
```

---

### LOW — feesxref — `data.empty-table.feesxref`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

feesxref exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "feesxref"
```

---

### LOW — gitcommandlogs — `data.empty-table.gitcommandlogs`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

gitcommandlogs exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "gitcommandlogs"
```

---

### LOW — gitcommandstats — `data.empty-table.gitcommandstats`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

gitcommandstats exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "gitcommandstats"
```

---

### LOW — importcache — `data.empty-table.importcache`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

importcache exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "importcache"
```

---

### LOW — invitationbatches — `data.empty-table.invitationbatches`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

invitationbatches exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "invitationbatches"
```

---

### LOW — invitationdlqs — `data.empty-table.invitationdlqs`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

invitationdlqs exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "invitationdlqs"
```

---

### LOW — mcpdriftevents — `data.empty-table.mcpdriftevents`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

mcpdriftevents exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "mcpdriftevents"
```

---

### LOW — mcpparityconfig — `data.empty-table.mcpparityconfig`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

mcpparityconfig exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "mcpparityconfig"
```

---

### LOW — mcpupdateadoptions — `data.empty-table.mcpupdateadoptions`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

mcpupdateadoptions exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "mcpupdateadoptions"
```

---

### LOW — notificationsettings — `data.empty-table.notificationsettings`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

notificationsettings exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "notificationsettings"
```

---

### LOW — openchatlist — `data.empty-table.openchatlist`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

openchatlist exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "openchatlist"
```

---

### LOW — phasetransitionlogs — `data.empty-table.phasetransitionlogs`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

phasetransitionlogs exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "phasetransitionlogs"
```

---

### LOW — pmsystemconnections — `data.empty-table.pmsystemconnections`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

pmsystemconnections exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "pmsystemconnections"
```

---

### LOW — projectinvoices — `data.empty-table.projectinvoices`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectinvoices exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "projectinvoices"
```

---

### LOW — projectprofilexref — `data.empty-table.projectprofilexref`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectprofilexref exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "projectprofilexref"
```

---

### LOW — projecttimeentries — `data.empty-table.projecttimeentries`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projecttimeentries exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "projecttimeentries"
```

---

### LOW — projectusers — `data.empty-table.projectusers`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectusers exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "projectusers"
```

---

### LOW — schedulerdepartments — `data.empty-table.schedulerdepartments`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

schedulerdepartments exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "schedulerdepartments"
```

---

### LOW — sessions — `data.empty-table.sessions`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

sessions exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "sessions"
```

---

### LOW — socketdata — `data.empty-table.socketdata`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

socketdata exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "socketdata"
```

---

### LOW — subassignments — `data.empty-table.subassignments`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

subassignments exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "subassignments"
```

---

### LOW — subscriptiondutytype — `data.empty-table.subscriptiondutytype`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

subscriptiondutytype exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "subscriptiondutytype"
```

---

### LOW — synchistory — `data.empty-table.synchistory`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

synchistory exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "synchistory"
```

---

### LOW — systemlog — `data.empty-table.systemlog`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

systemlog exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "systemlog"
```

---

### LOW — systemsettingshistory — `data.empty-table.systemsettingshistory`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

systemsettingshistory exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "systemsettingshistory"
```

---

### LOW — taskdependencies — `data.empty-table.taskdependencies`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

taskdependencies exists and holds no rows (0 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "taskdependencies"
```

---

### LOW — taskfencehistory — `data.empty-table.taskfencehistory`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

taskfencehistory exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "taskfencehistory"
```

---

### LOW — taskfencemodifications — `data.empty-table.taskfencemodifications`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

taskfencemodifications exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "taskfencemodifications"
```

---

### LOW — taskfences — `data.empty-table.taskfences`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

taskfences exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "taskfences"
```

---

### LOW — taskfenceslegacy — `data.empty-table.taskfenceslegacy`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

taskfenceslegacy exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "taskfenceslegacy"
```

---

### LOW — taskstateoverrides — `data.empty-table.taskstateoverrides`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

taskstateoverrides exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "taskstateoverrides"
```

---

### LOW — tasksyncrecords — `data.empty-table.tasksyncrecords`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

tasksyncrecords exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "tasksyncrecords"
```

---

### LOW — teamprojectduty — `data.empty-table.teamprojectduty`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

teamprojectduty exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "teamprojectduty"
```

---

### LOW — testretests — `data.empty-table.testretests`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

testretests exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "testretests"
```

---

### LOW — testrunresults — `data.empty-table.testrunresults`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

testrunresults exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "testrunresults"
```

---

### LOW — testruns — `data.empty-table.testruns`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

testruns exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "testruns"
```

---

### LOW — testsignoffs — `data.empty-table.testsignoffs`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

testsignoffs exists and holds no rows (16384 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "testsignoffs"
```

---

### LOW — timeEntry — `data.empty-table.timeEntry`

**Rule**: `data.empty-table`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

timeEntry exists and holds no rows (8192 bytes allocated).

**Why it needs changing**: An empty table is either a feature that was never used, a table whose writes go somewhere else than intended, or scaffolding left behind. All three are worth knowing, and none is distinguishable from the catalog alone — the table looks identical in each case.

**Business impact**: None directly. The cost is that a reader of the schema cannot tell whether this table is pending, abandoned, or silently broken.

**Doing nothing**: The table stays as an unexplained entry in the schema. No runtime cost.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Dropping an unused table is destructive and irreversible; confirm no code path writes to it before considering that.

**Rollback**: n/a

**Evidence**

```sql
select count(*) from "timeEntry"
```

---

### LOW — campaignposts.createdbyid — `data.high-null-density.campaignposts.createdbyid`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

campaignposts.createdbyid is null in 98.1% of 106 rows (2 populated).

**Why it needs changing**: Only 2 of 106 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("createdbyid") from "campaignposts"
```

---

### LOW — campaignposts.liveurl — `data.high-null-density.campaignposts.liveurl`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

campaignposts.liveurl is null in 99.1% of 106 rows (1 populated).

**Why it needs changing**: Only 1 of 106 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("liveurl") from "campaignposts"
```

---

### LOW — campaignposts.publishedat — `data.high-null-density.campaignposts.publishedat`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

campaignposts.publishedat is null in 99.1% of 106 rows (1 populated).

**Why it needs changing**: Only 1 of 106 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("publishedat") from "campaignposts"
```

---

### LOW — companies.billingemail — `data.high-null-density.companies.billingemail`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

companies.billingemail is null in 97.7% of 43 rows (1 populated).

**Why it needs changing**: Only 1 of 43 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("billingemail") from "companies"
```

---

### LOW — companies.referralcode — `data.high-null-density.companies.referralcode`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

companies.referralcode is null in 97.7% of 43 rows (1 populated).

**Why it needs changing**: Only 1 of 43 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("referralcode") from "companies"
```

---

### LOW — companyprojects.allocatedhours — `data.high-null-density.companyprojects.allocatedhours`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

companyprojects.allocatedhours is null in 98.1% of 106 rows (2 populated).

**Why it needs changing**: Only 2 of 106 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("allocatedhours") from "companyprojects"
```

---

### LOW — companyprojects.hourlyrate — `data.high-null-density.companyprojects.hourlyrate`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

companyprojects.hourlyrate is null in 98.1% of 106 rows (2 populated).

**Why it needs changing**: Only 2 of 106 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("hourlyrate") from "companyprojects"
```

---

### LOW — companyprojects.pmsystems — `data.high-null-density.companyprojects.pmsystems`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

companyprojects.pmsystems is null in 99.1% of 106 rows (1 populated).

**Why it needs changing**: Only 1 of 106 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("pmsystems") from "companyprojects"
```

---

### LOW — events.normalized_content — `data.high-null-density.events.normalized_content`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

events.normalized_content is null in 99.8% of 2795 rows (5 populated).

**Why it needs changing**: Only 5 of 2795 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("normalized_content") from "events"
```

---

### LOW — feedbacksubmissions.clarificationanswer — `data.high-null-density.feedbacksubmissions.clarificationanswer`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

feedbacksubmissions.clarificationanswer is null in 98.8% of 86 rows (1 populated).

**Why it needs changing**: Only 1 of 86 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("clarificationanswer") from "feedbacksubmissions"
```

---

### LOW — feedbacksubmissions.internalnotes — `data.high-null-density.feedbacksubmissions.internalnotes`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

feedbacksubmissions.internalnotes is null in 95.3% of 86 rows (4 populated).

**Why it needs changing**: Only 4 of 86 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("internalnotes") from "feedbacksubmissions"
```

---

### LOW — feedbacksubmissions.linkedtaskid — `data.high-null-density.feedbacksubmissions.linkedtaskid`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

feedbacksubmissions.linkedtaskid is null in 98.8% of 86 rows (1 populated).

**Why it needs changing**: Only 1 of 86 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("linkedtaskid") from "feedbacksubmissions"
```

---

### LOW — feedbacksubmissions.reopenedat — `data.high-null-density.feedbacksubmissions.reopenedat`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

feedbacksubmissions.reopenedat is null in 98.8% of 86 rows (1 populated).

**Why it needs changing**: Only 1 of 86 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("reopenedat") from "feedbacksubmissions"
```

---

### LOW — feedbacksubmissions.suggestedat — `data.high-null-density.feedbacksubmissions.suggestedat`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

feedbacksubmissions.suggestedat is null in 98.8% of 86 rows (1 populated).

**Why it needs changing**: Only 1 of 86 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("suggestedat") from "feedbacksubmissions"
```

---

### LOW — feedbacksubmissions.suggestedsolution — `data.high-null-density.feedbacksubmissions.suggestedsolution`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

feedbacksubmissions.suggestedsolution is null in 98.8% of 86 rows (1 populated).

**Why it needs changing**: Only 1 of 86 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("suggestedsolution") from "feedbacksubmissions"
```

---

### LOW — feedbacksubmissions.suggestedsolutionrationale — `data.high-null-density.feedbacksubmissions.suggestedsolutionrationale`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

feedbacksubmissions.suggestedsolutionrationale is null in 98.8% of 86 rows (1 populated).

**Why it needs changing**: Only 1 of 86 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("suggestedsolutionrationale") from "feedbacksubmissions"
```

---

### LOW — marketingcontacts.unsubscribedat — `data.high-null-density.marketingcontacts.unsubscribedat`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

marketingcontacts.unsubscribedat is null in 96.9% of 1007 rows (31 populated).

**Why it needs changing**: Only 31 of 1007 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("unsubscribedat") from "marketingcontacts"
```

---

### LOW — mcpapitokens.expiresat — `data.high-null-density.mcpapitokens.expiresat`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

mcpapitokens.expiresat is null in 98.5% of 202 rows (3 populated).

**Why it needs changing**: Only 3 of 202 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("expiresat") from "mcpapitokens"
```

---

### LOW — mcpapitokens.revokedat — `data.high-null-density.mcpapitokens.revokedat`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

mcpapitokens.revokedat is null in 98.0% of 202 rows (4 populated).

**Why it needs changing**: Only 4 of 202 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("revokedat") from "mcpapitokens"
```

---

### LOW — mcprequestaudit.errorcode — `data.high-null-density.mcprequestaudit.errorcode`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

mcprequestaudit.errorcode is null in 98.8% of 387658 rows (4760 populated).

**Why it needs changing**: Only 4760 of 387658 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("errorcode") from "mcprequestaudit"
```

---

### LOW — overviewdrafts.estimatedeffort — `data.high-null-density.overviewdrafts.estimatedeffort`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

overviewdrafts.estimatedeffort is null in 98.6% of 74 rows (1 populated).

**Why it needs changing**: Only 1 of 74 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("estimatedeffort") from "overviewdrafts"
```

---

### LOW — overviewtranscripts.sectionkey — `data.high-null-density.overviewtranscripts.sectionkey`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

overviewtranscripts.sectionkey is null in 98.3% of 1645 rows (28 populated).

**Why it needs changing**: Only 28 of 1645 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("sectionkey") from "overviewtranscripts"
```

---

### LOW — overviewtranscripts.sourceuri — `data.high-null-density.overviewtranscripts.sourceuri`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

overviewtranscripts.sourceuri is null in 99.9% of 1645 rows (2 populated).

**Why it needs changing**: Only 2 of 1645 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("sourceuri") from "overviewtranscripts"
```

---

### LOW — projectdocuments.filepath — `data.high-null-density.projectdocuments.filepath`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectdocuments.filepath is null in 95.4% of 4027 rows (187 populated).

**Why it needs changing**: Only 187 of 4027 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("filepath") from "projectdocuments"
```

---

### LOW — projectdocuments.pdfcontent — `data.high-null-density.projectdocuments.pdfcontent`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectdocuments.pdfcontent is null in 99.4% of 4027 rows (23 populated).

**Why it needs changing**: Only 23 of 4027 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("pdfcontent") from "projectdocuments"
```

---

### LOW — projectdocuments.pdfgeneratedat — `data.high-null-density.projectdocuments.pdfgeneratedat`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectdocuments.pdfgeneratedat is null in 99.4% of 4027 rows (23 populated).

**Why it needs changing**: Only 23 of 4027 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("pdfgeneratedat") from "projectdocuments"
```

---

### LOW — projectphases.completedat — `data.high-null-density.projectphases.completedat`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectphases.completedat is null in 99.8% of 630 rows (1 populated).

**Why it needs changing**: Only 1 of 630 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("completedat") from "projectphases"
```

---

### LOW — projectphases.reason — `data.high-null-density.projectphases.reason`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectphases.reason is null in 99.8% of 630 rows (1 populated).

**Why it needs changing**: Only 1 of 630 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("reason") from "projectphases"
```

---

### LOW — projectspecifications.approvedat — `data.high-null-density.projectspecifications.approvedat`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectspecifications.approvedat is null in 99.5% of 1275 rows (6 populated).

**Why it needs changing**: Only 6 of 1275 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("approvedat") from "projectspecifications"
```

---

### LOW — projectspecifications.createdbyid — `data.high-null-density.projectspecifications.createdbyid`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectspecifications.createdbyid is null in 98.4% of 1275 rows (20 populated).

**Why it needs changing**: Only 20 of 1275 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("createdbyid") from "projectspecifications"
```

---

### LOW — projecttasks.createdbyid — `data.high-null-density.projecttasks.createdbyid`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.createdbyid is null in 99.9% of 6318 rows (5 populated).

**Why it needs changing**: Only 5 of 6318 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("createdbyid") from "projecttasks"
```

---

### LOW — projecttasks.issuetype — `data.high-null-density.projecttasks.issuetype`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.issuetype is null in 99.0% of 6318 rows (63 populated).

**Why it needs changing**: Only 63 of 6318 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("issuetype") from "projecttasks"
```

---

### LOW — projecttasks.phaseid — `data.high-null-density.projecttasks.phaseid`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.phaseid is null in 100.0% of 6318 rows (3 populated).

**Why it needs changing**: Only 3 of 6318 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("phaseid") from "projecttasks"
```

---

### LOW — userprofiles.promosunsubscribedat — `data.high-null-density.userprofiles.promosunsubscribedat`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

userprofiles.promosunsubscribedat is null in 97.3% of 74 rows (2 populated).

**Why it needs changing**: Only 2 of 74 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("promosunsubscribedat") from "userprofiles"
```

---

### LOW — userprofiles.updatesunsubscribedat — `data.high-null-density.userprofiles.updatesunsubscribedat`

**Rule**: `data.high-null-density`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

userprofiles.updatesunsubscribedat is null in 95.9% of 74 rows (3 populated).

**Why it needs changing**: Only 3 of 74 rows carry a value. That is the shape of a column populated by one narrow code path rather than the general case — which usually means it belongs on a separate table, or that the path meant to populate it runs far less often than intended.

**Business impact**: Any query filtering or reporting on this column covers a small fraction of the table, which is easy to mistake for a small result rather than a sparsely-populated field.

**Doing nothing**: Nothing breaks. This is a modelling observation, not a defect.

**Remediation** (none, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None from reporting. Acting on it — normalising the column out — is a schema change that needs its own analysis.

**Rollback**: n/a

**Evidence**

```sql
select count("updatesunsubscribedat") from "userprofiles"
```

---

### LOW — auditexecutions.idx_audit_executions_specid — `performance.unused-index.auditexecutions.idx_audit_executions_specid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

auditexecutions.idx_audit_executions_specid is 16384 bytes and has recorded zero scans since the statistics were last reset, while auditexecutions has recorded 5 inserts.

**Why it needs changing**: Every insert into auditexecutions — 5 inserts so far — updates idx_audit_executions_specid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 5 inserts to auditexecutions are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_audit_executions_specid keeps paying its write and storage cost on every future insert into auditexecutions without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_audit_executions_specid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown auditexecutions costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_audit_executions_specid ON public.auditexecutions USING btree (specid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — auditexecutions.idx_audit_executions_status — `performance.unused-index.auditexecutions.idx_audit_executions_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

auditexecutions.idx_audit_executions_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while auditexecutions has recorded 5 inserts.

**Why it needs changing**: Every insert into auditexecutions — 5 inserts so far — updates idx_audit_executions_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 5 inserts to auditexecutions are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_audit_executions_status keeps paying its write and storage cost on every future insert into auditexecutions without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_audit_executions_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown auditexecutions costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_audit_executions_status ON public.auditexecutions USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — campaignposts.idx_campaignposts_campaignid — `performance.unused-index.campaignposts.idx_campaignposts_campaignid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

campaignposts.idx_campaignposts_campaignid is 16384 bytes and has recorded zero scans since the statistics were last reset, while campaignposts has recorded 106 inserts.

**Why it needs changing**: Every insert into campaignposts — 106 inserts so far — updates idx_campaignposts_campaignid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 106 inserts to campaignposts are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_campaignposts_campaignid keeps paying its write and storage cost on every future insert into campaignposts without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_campaignposts_campaignid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown campaignposts costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_campaignposts_campaignid ON public.campaignposts USING btree (campaignid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — campaignposts.idx_campaignposts_status — `performance.unused-index.campaignposts.idx_campaignposts_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

campaignposts.idx_campaignposts_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while campaignposts has recorded 106 inserts.

**Why it needs changing**: Every insert into campaignposts — 106 inserts so far — updates idx_campaignposts_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 106 inserts to campaignposts are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_campaignposts_status keeps paying its write and storage cost on every future insert into campaignposts without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_campaignposts_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown campaignposts costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_campaignposts_status ON public.campaignposts USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — campaigns.idx_campaigns_status — `performance.unused-index.campaigns.idx_campaigns_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

campaigns.idx_campaigns_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while campaigns has recorded 3 inserts.

**Why it needs changing**: Every insert into campaigns — 3 inserts so far — updates idx_campaigns_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 3 inserts to campaigns are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_campaigns_status keeps paying its write and storage cost on every future insert into campaigns without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_campaigns_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown campaigns costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — capabilityindex.idx_capabilityindex_embedding_cosine — `performance.unused-index.capabilityindex.idx_capabilityindex_embedding_cosine`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

capabilityindex.idx_capabilityindex_embedding_cosine is 31121408 bytes and has recorded zero scans since the statistics were last reset, while capabilityindex has recorded 5851 inserts.

**Why it needs changing**: Every insert into capabilityindex — 5851 inserts so far — updates idx_capabilityindex_embedding_cosine in addition to the table itself, and the index's 31121408 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 31121408 bytes of storage and a write penalty on every one of 5851 inserts to capabilityindex are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_capabilityindex_embedding_cosine keeps paying its write and storage cost on every future insert into capabilityindex without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_capabilityindex_embedding_cosine";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown capabilityindex costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_capabilityindex_embedding_cosine ON public.capabilityindex USING hnsw (embedding vector_cosine_ops);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — companies.idx_companies_referredby — `performance.unused-index.companies.idx_companies_referredby`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

companies.idx_companies_referredby is 16384 bytes and has recorded zero scans since the statistics were last reset, while companies has recorded 55 inserts.

**Why it needs changing**: Every insert into companies — 55 inserts so far — updates idx_companies_referredby in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 55 inserts to companies are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_companies_referredby keeps paying its write and storage cost on every future insert into companies without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_companies_referredby";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown companies costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_companies_referredby ON public.companies USING btree (referredby);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — companyprojects.idx_companyprojects_customerid — `performance.unused-index.companyprojects.idx_companyprojects_customerid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

companyprojects.idx_companyprojects_customerid is 16384 bytes and has recorded zero scans since the statistics were last reset, while companyprojects has recorded 178 inserts.

**Why it needs changing**: Every insert into companyprojects — 178 inserts so far — updates idx_companyprojects_customerid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 178 inserts to companyprojects are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_companyprojects_customerid keeps paying its write and storage cost on every future insert into companyprojects without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_companyprojects_customerid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown companyprojects costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_companyprojects_customerid ON public.companyprojects USING btree (customerid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — companysubscriptions.idx_companysubscriptions_status — `performance.unused-index.companysubscriptions.idx_companysubscriptions_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

companysubscriptions.idx_companysubscriptions_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while companysubscriptions has recorded 31 inserts.

**Why it needs changing**: Every insert into companysubscriptions — 31 inserts so far — updates idx_companysubscriptions_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 31 inserts to companysubscriptions are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_companysubscriptions_status keeps paying its write and storage cost on every future insert into companysubscriptions without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_companysubscriptions_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown companysubscriptions costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_companysubscriptions_status ON public.companysubscriptions USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — complianceaudittasks.idx_compliance_tasks_category — `performance.unused-index.complianceaudittasks.idx_compliance_tasks_category`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

complianceaudittasks.idx_compliance_tasks_category is 57344 bytes and has recorded zero scans since the statistics were last reset, while complianceaudittasks has recorded 1710 inserts.

**Why it needs changing**: Every insert into complianceaudittasks — 1710 inserts so far — updates idx_compliance_tasks_category in addition to the table itself, and the index's 57344 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 57344 bytes of storage and a write penalty on every one of 1710 inserts to complianceaudittasks are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_compliance_tasks_category keeps paying its write and storage cost on every future insert into complianceaudittasks without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_compliance_tasks_category";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown complianceaudittasks costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_compliance_tasks_category ON public.complianceaudittasks USING btree (category);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — complianceaudittasks.idx_compliance_tasks_priority — `performance.unused-index.complianceaudittasks.idx_compliance_tasks_priority`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

complianceaudittasks.idx_compliance_tasks_priority is 40960 bytes and has recorded zero scans since the statistics were last reset, while complianceaudittasks has recorded 1710 inserts.

**Why it needs changing**: Every insert into complianceaudittasks — 1710 inserts so far — updates idx_compliance_tasks_priority in addition to the table itself, and the index's 40960 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 40960 bytes of storage and a write penalty on every one of 1710 inserts to complianceaudittasks are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_compliance_tasks_priority keeps paying its write and storage cost on every future insert into complianceaudittasks without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_compliance_tasks_priority";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown complianceaudittasks costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_compliance_tasks_priority ON public.complianceaudittasks USING btree (priority);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — customers.idx_customers_clientcompanyid — `performance.unused-index.customers.idx_customers_clientcompanyid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

customers.idx_customers_clientcompanyid is 16384 bytes and has recorded zero scans since the statistics were last reset, while customers has recorded 1 inserts.

**Why it needs changing**: Every insert into customers — 1 inserts so far — updates idx_customers_clientcompanyid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 1 inserts to customers are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_customers_clientcompanyid keeps paying its write and storage cost on every future insert into customers without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_customers_clientcompanyid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown customers costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_customers_clientcompanyid ON public.customers USING btree (clientcompanyid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — customers.idx_customers_companyid — `performance.unused-index.customers.idx_customers_companyid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

customers.idx_customers_companyid is 16384 bytes and has recorded zero scans since the statistics were last reset, while customers has recorded 1 inserts.

**Why it needs changing**: Every insert into customers — 1 inserts so far — updates idx_customers_companyid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 1 inserts to customers are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_customers_companyid keeps paying its write and storage cost on every future insert into customers without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_customers_companyid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown customers costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_customers_companyid ON public.customers USING btree (companyid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — customers.idx_customers_consultantid — `performance.unused-index.customers.idx_customers_consultantid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

customers.idx_customers_consultantid is 16384 bytes and has recorded zero scans since the statistics were last reset, while customers has recorded 1 inserts.

**Why it needs changing**: Every insert into customers — 1 inserts so far — updates idx_customers_consultantid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 1 inserts to customers are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_customers_consultantid keeps paying its write and storage cost on every future insert into customers without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_customers_consultantid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown customers costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_customers_consultantid ON public.customers USING btree (consultantid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagementassignments.idx_engagementassignments_engagementid — `performance.unused-index.engagementassignments.idx_engagementassignments_engagementid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagementassignments.idx_engagementassignments_engagementid is 16384 bytes and has recorded zero scans since the statistics were last reset, while engagementassignments has recorded 1 inserts.

**Why it needs changing**: Every insert into engagementassignments — 1 inserts so far — updates idx_engagementassignments_engagementid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 1 inserts to engagementassignments are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_engagementassignments_engagementid keeps paying its write and storage cost on every future insert into engagementassignments without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_engagementassignments_engagementid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown engagementassignments costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_engagementassignments_engagementid ON public.engagementassignments USING btree (engagementid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagementassignments.idx_engagementassignments_projectid — `performance.unused-index.engagementassignments.idx_engagementassignments_projectid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagementassignments.idx_engagementassignments_projectid is 16384 bytes and has recorded zero scans since the statistics were last reset, while engagementassignments has recorded 1 inserts.

**Why it needs changing**: Every insert into engagementassignments — 1 inserts so far — updates idx_engagementassignments_projectid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 1 inserts to engagementassignments are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_engagementassignments_projectid keeps paying its write and storage cost on every future insert into engagementassignments without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_engagementassignments_projectid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown engagementassignments costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_engagementassignments_projectid ON public.engagementassignments USING btree (projectid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagementassignments.idx_engagementassignments_removedat — `performance.unused-index.engagementassignments.idx_engagementassignments_removedat`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagementassignments.idx_engagementassignments_removedat is 16384 bytes and has recorded zero scans since the statistics were last reset, while engagementassignments has recorded 1 inserts.

**Why it needs changing**: Every insert into engagementassignments — 1 inserts so far — updates idx_engagementassignments_removedat in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 1 inserts to engagementassignments are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_engagementassignments_removedat keeps paying its write and storage cost on every future insert into engagementassignments without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_engagementassignments_removedat";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown engagementassignments costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_engagementassignments_removedat ON public.engagementassignments USING btree (removedat);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagementassignments.idx_engagementassignments_scopeid — `performance.unused-index.engagementassignments.idx_engagementassignments_scopeid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagementassignments.idx_engagementassignments_scopeid is 16384 bytes and has recorded zero scans since the statistics were last reset, while engagementassignments has recorded 1 inserts.

**Why it needs changing**: Every insert into engagementassignments — 1 inserts so far — updates idx_engagementassignments_scopeid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 1 inserts to engagementassignments are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_engagementassignments_scopeid keeps paying its write and storage cost on every future insert into engagementassignments without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_engagementassignments_scopeid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown engagementassignments costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_engagementassignments_scopeid ON public.engagementassignments USING btree (scopeid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagementassignments.idx_engagementassignments_taskid — `performance.unused-index.engagementassignments.idx_engagementassignments_taskid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagementassignments.idx_engagementassignments_taskid is 16384 bytes and has recorded zero scans since the statistics were last reset, while engagementassignments has recorded 1 inserts.

**Why it needs changing**: Every insert into engagementassignments — 1 inserts so far — updates idx_engagementassignments_taskid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 1 inserts to engagementassignments are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_engagementassignments_taskid keeps paying its write and storage cost on every future insert into engagementassignments without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_engagementassignments_taskid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown engagementassignments costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_engagementassignments_taskid ON public.engagementassignments USING btree (taskid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagementinvitations.idx_engagementinvitations_clientcompanyid — `performance.unused-index.engagementinvitations.idx_engagementinvitations_clientcompanyid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagementinvitations.idx_engagementinvitations_clientcompanyid is 16384 bytes and has recorded zero scans since the statistics were last reset, while engagementinvitations has recorded 4 inserts.

**Why it needs changing**: Every insert into engagementinvitations — 4 inserts so far — updates idx_engagementinvitations_clientcompanyid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 4 inserts to engagementinvitations are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_engagementinvitations_clientcompanyid keeps paying its write and storage cost on every future insert into engagementinvitations without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_engagementinvitations_clientcompanyid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown engagementinvitations costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_engagementinvitations_clientcompanyid ON public.engagementinvitations USING btree (clientcompanyid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagementinvitations.idx_engagementinvitations_invitedemail — `performance.unused-index.engagementinvitations.idx_engagementinvitations_invitedemail`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagementinvitations.idx_engagementinvitations_invitedemail is 16384 bytes and has recorded zero scans since the statistics were last reset, while engagementinvitations has recorded 4 inserts.

**Why it needs changing**: Every insert into engagementinvitations — 4 inserts so far — updates idx_engagementinvitations_invitedemail in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 4 inserts to engagementinvitations are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_engagementinvitations_invitedemail keeps paying its write and storage cost on every future insert into engagementinvitations without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_engagementinvitations_invitedemail";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown engagementinvitations costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_engagementinvitations_invitedemail ON public.engagementinvitations USING btree (invitedemail);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagementinvitations.idx_engagementinvitations_status — `performance.unused-index.engagementinvitations.idx_engagementinvitations_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagementinvitations.idx_engagementinvitations_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while engagementinvitations has recorded 4 inserts.

**Why it needs changing**: Every insert into engagementinvitations — 4 inserts so far — updates idx_engagementinvitations_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 4 inserts to engagementinvitations are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_engagementinvitations_status keeps paying its write and storage cost on every future insert into engagementinvitations without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_engagementinvitations_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown engagementinvitations costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_engagementinvitations_status ON public.engagementinvitations USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagements.idx_engagements_clientcompanyid — `performance.unused-index.engagements.idx_engagements_clientcompanyid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagements.idx_engagements_clientcompanyid is 16384 bytes and has recorded zero scans since the statistics were last reset, while engagements has recorded 2 inserts.

**Why it needs changing**: Every insert into engagements — 2 inserts so far — updates idx_engagements_clientcompanyid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 2 inserts to engagements are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_engagements_clientcompanyid keeps paying its write and storage cost on every future insert into engagements without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_engagements_clientcompanyid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown engagements costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_engagements_clientcompanyid ON public.engagements USING btree (clientcompanyid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagements.idx_engagements_consultingcompanyid — `performance.unused-index.engagements.idx_engagements_consultingcompanyid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagements.idx_engagements_consultingcompanyid is 16384 bytes and has recorded zero scans since the statistics were last reset, while engagements has recorded 2 inserts.

**Why it needs changing**: Every insert into engagements — 2 inserts so far — updates idx_engagements_consultingcompanyid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 2 inserts to engagements are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_engagements_consultingcompanyid keeps paying its write and storage cost on every future insert into engagements without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_engagements_consultingcompanyid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown engagements costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_engagements_consultingcompanyid ON public.engagements USING btree (consultingcompanyid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagements.idx_engagements_state — `performance.unused-index.engagements.idx_engagements_state`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagements.idx_engagements_state is 16384 bytes and has recorded zero scans since the statistics were last reset, while engagements has recorded 2 inserts.

**Why it needs changing**: Every insert into engagements — 2 inserts so far — updates idx_engagements_state in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 2 inserts to engagements are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_engagements_state keeps paying its write and storage cost on every future insert into engagements without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_engagements_state";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown engagements costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_engagements_state ON public.engagements USING btree (state);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — gitcommandsessions.idx_git_command_sessions_active — `performance.unused-index.gitcommandsessions.idx_git_command_sessions_active`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

gitcommandsessions.idx_git_command_sessions_active is 16384 bytes and has recorded zero scans since the statistics were last reset, while gitcommandsessions has recorded 3 inserts.

**Why it needs changing**: Every insert into gitcommandsessions — 3 inserts so far — updates idx_git_command_sessions_active in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 3 inserts to gitcommandsessions are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_git_command_sessions_active keeps paying its write and storage cost on every future insert into gitcommandsessions without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_git_command_sessions_active";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown gitcommandsessions costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_git_command_sessions_active ON public.gitcommandsessions USING btree (is_active) WHERE (is_active = true);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — gitcommandsessions.idx_git_command_sessions_user — `performance.unused-index.gitcommandsessions.idx_git_command_sessions_user`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

gitcommandsessions.idx_git_command_sessions_user is 16384 bytes and has recorded zero scans since the statistics were last reset, while gitcommandsessions has recorded 3 inserts.

**Why it needs changing**: Every insert into gitcommandsessions — 3 inserts so far — updates idx_git_command_sessions_user in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 3 inserts to gitcommandsessions are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_git_command_sessions_user keeps paying its write and storage cost on every future insert into gitcommandsessions without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_git_command_sessions_user";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown gitcommandsessions costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_git_command_sessions_user ON public.gitcommandsessions USING btree (user_id);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — infrahealthchecks.idx_infrahealthchecks_evaluatedat — `performance.unused-index.infrahealthchecks.idx_infrahealthchecks_evaluatedat`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

infrahealthchecks.idx_infrahealthchecks_evaluatedat is 16384 bytes and has recorded zero scans since the statistics were last reset, while infrahealthchecks has recorded 4 inserts.

**Why it needs changing**: Every insert into infrahealthchecks — 4 inserts so far — updates idx_infrahealthchecks_evaluatedat in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 4 inserts to infrahealthchecks are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_infrahealthchecks_evaluatedat keeps paying its write and storage cost on every future insert into infrahealthchecks without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_infrahealthchecks_evaluatedat";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown infrahealthchecks costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_infrahealthchecks_evaluatedat ON public.infrahealthchecks USING btree (evaluatedat);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — infrahealthchecks.idx_infrahealthchecks_status — `performance.unused-index.infrahealthchecks.idx_infrahealthchecks_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

infrahealthchecks.idx_infrahealthchecks_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while infrahealthchecks has recorded 4 inserts.

**Why it needs changing**: Every insert into infrahealthchecks — 4 inserts so far — updates idx_infrahealthchecks_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 4 inserts to infrahealthchecks are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_infrahealthchecks_status keeps paying its write and storage cost on every future insert into infrahealthchecks without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_infrahealthchecks_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown infrahealthchecks costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_infrahealthchecks_status ON public.infrahealthchecks USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — marketingassets.idx_marketingassets_status — `performance.unused-index.marketingassets.idx_marketingassets_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

marketingassets.idx_marketingassets_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while marketingassets has recorded 270 inserts.

**Why it needs changing**: Every insert into marketingassets — 270 inserts so far — updates idx_marketingassets_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 270 inserts to marketingassets are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_marketingassets_status keeps paying its write and storage cost on every future insert into marketingassets without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_marketingassets_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown marketingassets costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_marketingassets_status ON public.marketingassets USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — marketingbanners.idx_marketingbanners_campaignid — `performance.unused-index.marketingbanners.idx_marketingbanners_campaignid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

marketingbanners.idx_marketingbanners_campaignid is 16384 bytes and has recorded zero scans since the statistics were last reset, while marketingbanners has recorded 3 inserts.

**Why it needs changing**: Every insert into marketingbanners — 3 inserts so far — updates idx_marketingbanners_campaignid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 3 inserts to marketingbanners are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_marketingbanners_campaignid keeps paying its write and storage cost on every future insert into marketingbanners without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_marketingbanners_campaignid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown marketingbanners costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_marketingbanners_campaignid ON public.marketingbanners USING btree (campaignid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — marketingbanners.idx_marketingbanners_status — `performance.unused-index.marketingbanners.idx_marketingbanners_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

marketingbanners.idx_marketingbanners_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while marketingbanners has recorded 3 inserts.

**Why it needs changing**: Every insert into marketingbanners — 3 inserts so far — updates idx_marketingbanners_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 3 inserts to marketingbanners are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_marketingbanners_status keeps paying its write and storage cost on every future insert into marketingbanners without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_marketingbanners_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown marketingbanners costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_marketingbanners_status ON public.marketingbanners USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — marketingcontacts.marketingcontactsemailidx — `performance.unused-index.marketingcontacts.marketingcontactsemailidx`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

marketingcontacts.marketingcontactsemailidx is 81920 bytes and has recorded zero scans since the statistics were last reset, while marketingcontacts has recorded 1023 inserts.

**Why it needs changing**: Every insert into marketingcontacts — 1023 inserts so far — updates marketingcontactsemailidx in addition to the table itself, and the index's 81920 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 81920 bytes of storage and a write penalty on every one of 1023 inserts to marketingcontacts are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: marketingcontactsemailidx keeps paying its write and storage cost on every future insert into marketingcontacts without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "marketingcontactsemailidx";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown marketingcontacts costs a full index build, not a rollback.

**Rollback**: CREATE INDEX marketingcontactsemailidx ON public.marketingcontacts USING btree (email);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — marketingfeaturesnippets.idx_marketingfeaturesnippets_sortorder — `performance.unused-index.marketingfeaturesnippets.idx_marketingfeaturesnippets_sortorder`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

marketingfeaturesnippets.idx_marketingfeaturesnippets_sortorder is 16384 bytes and has recorded zero scans since the statistics were last reset, while marketingfeaturesnippets has recorded 18 inserts.

**Why it needs changing**: Every insert into marketingfeaturesnippets — 18 inserts so far — updates idx_marketingfeaturesnippets_sortorder in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 18 inserts to marketingfeaturesnippets are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_marketingfeaturesnippets_sortorder keeps paying its write and storage cost on every future insert into marketingfeaturesnippets without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_marketingfeaturesnippets_sortorder";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown marketingfeaturesnippets costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_marketingfeaturesnippets_sortorder ON public.marketingfeaturesnippets USING btree (sortorder);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — marketingleads.idx_marketingleads_campaignid — `performance.unused-index.marketingleads.idx_marketingleads_campaignid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

marketingleads.idx_marketingleads_campaignid is 16384 bytes and has recorded zero scans since the statistics were last reset, while marketingleads has recorded 3 inserts.

**Why it needs changing**: Every insert into marketingleads — 3 inserts so far — updates idx_marketingleads_campaignid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 3 inserts to marketingleads are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_marketingleads_campaignid keeps paying its write and storage cost on every future insert into marketingleads without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_marketingleads_campaignid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown marketingleads costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_marketingleads_campaignid ON public.marketingleads USING btree (campaignid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — marketingleads.idx_marketingleads_segment — `performance.unused-index.marketingleads.idx_marketingleads_segment`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

marketingleads.idx_marketingleads_segment is 16384 bytes and has recorded zero scans since the statistics were last reset, while marketingleads has recorded 3 inserts.

**Why it needs changing**: Every insert into marketingleads — 3 inserts so far — updates idx_marketingleads_segment in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 3 inserts to marketingleads are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_marketingleads_segment keeps paying its write and storage cost on every future insert into marketingleads without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_marketingleads_segment";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown marketingleads costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_marketingleads_segment ON public.marketingleads USING btree (segment);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — marketingleads.idx_marketingleads_status — `performance.unused-index.marketingleads.idx_marketingleads_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

marketingleads.idx_marketingleads_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while marketingleads has recorded 3 inserts.

**Why it needs changing**: Every insert into marketingleads — 3 inserts so far — updates idx_marketingleads_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 3 inserts to marketingleads are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_marketingleads_status keeps paying its write and storage cost on every future insert into marketingleads without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_marketingleads_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown marketingleads costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_marketingleads_status ON public.marketingleads USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — marketinglinkclicks.idx_marketinglinkclicks_clickedat — `performance.unused-index.marketinglinkclicks.idx_marketinglinkclicks_clickedat`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

marketinglinkclicks.idx_marketinglinkclicks_clickedat is 16384 bytes and has recorded zero scans since the statistics were last reset, while marketinglinkclicks has recorded 2 inserts.

**Why it needs changing**: Every insert into marketinglinkclicks — 2 inserts so far — updates idx_marketinglinkclicks_clickedat in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 2 inserts to marketinglinkclicks are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_marketinglinkclicks_clickedat keeps paying its write and storage cost on every future insert into marketinglinkclicks without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_marketinglinkclicks_clickedat";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown marketinglinkclicks costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_marketinglinkclicks_clickedat ON public.marketinglinkclicks USING btree (clickedat);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — marketinglinkclicks.idx_marketinglinkclicks_linkid — `performance.unused-index.marketinglinkclicks.idx_marketinglinkclicks_linkid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

marketinglinkclicks.idx_marketinglinkclicks_linkid is 16384 bytes and has recorded zero scans since the statistics were last reset, while marketinglinkclicks has recorded 2 inserts.

**Why it needs changing**: Every insert into marketinglinkclicks — 2 inserts so far — updates idx_marketinglinkclicks_linkid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 2 inserts to marketinglinkclicks are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_marketinglinkclicks_linkid keeps paying its write and storage cost on every future insert into marketinglinkclicks without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_marketinglinkclicks_linkid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown marketinglinkclicks costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_marketinglinkclicks_linkid ON public.marketinglinkclicks USING btree (linkid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — mcprequestaudit.mcprequestaudit_project_createdat_idx — `performance.unused-index.mcprequestaudit.mcprequestaudit_project_createdat_idx`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

mcprequestaudit.mcprequestaudit_project_createdat_idx is 26951680 bytes and has recorded zero scans since the statistics were last reset, while mcprequestaudit has recorded 387657 inserts.

**Why it needs changing**: Every insert into mcprequestaudit — 387657 inserts so far — updates mcprequestaudit_project_createdat_idx in addition to the table itself, and the index's 26951680 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 26951680 bytes of storage and a write penalty on every one of 387657 inserts to mcprequestaudit are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: mcprequestaudit_project_createdat_idx keeps paying its write and storage cost on every future insert into mcprequestaudit without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "mcprequestaudit_project_createdat_idx";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown mcprequestaudit costs a full index build, not a rollback.

**Rollback**: CREATE INDEX mcprequestaudit_project_createdat_idx ON public.mcprequestaudit USING btree (projectid, createdat);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — passwordresettokens.idx_passwordresettokens_expiresat — `performance.unused-index.passwordresettokens.idx_passwordresettokens_expiresat`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

passwordresettokens.idx_passwordresettokens_expiresat is 16384 bytes and has recorded zero scans since the statistics were last reset, while passwordresettokens has recorded 20 inserts.

**Why it needs changing**: Every insert into passwordresettokens — 20 inserts so far — updates idx_passwordresettokens_expiresat in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 20 inserts to passwordresettokens are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_passwordresettokens_expiresat keeps paying its write and storage cost on every future insert into passwordresettokens without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_passwordresettokens_expiresat";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown passwordresettokens costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_passwordresettokens_expiresat ON public.passwordresettokens USING btree (expiresat);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — passwordresettokens.idx_passwordresettokens_userid — `performance.unused-index.passwordresettokens.idx_passwordresettokens_userid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

passwordresettokens.idx_passwordresettokens_userid is 16384 bytes and has recorded zero scans since the statistics were last reset, while passwordresettokens has recorded 20 inserts.

**Why it needs changing**: Every insert into passwordresettokens — 20 inserts so far — updates idx_passwordresettokens_userid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 20 inserts to passwordresettokens are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_passwordresettokens_userid keeps paying its write and storage cost on every future insert into passwordresettokens without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_passwordresettokens_userid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown passwordresettokens costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_passwordresettokens_userid ON public.passwordresettokens USING btree (userid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — projectdocuments.idx_projectdocuments_sourceeventid — `performance.unused-index.projectdocuments.idx_projectdocuments_sourceeventid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectdocuments.idx_projectdocuments_sourceeventid is 106496 bytes and has recorded zero scans since the statistics were last reset, while projectdocuments has recorded 4848 inserts.

**Why it needs changing**: Every insert into projectdocuments — 4848 inserts so far — updates idx_projectdocuments_sourceeventid in addition to the table itself, and the index's 106496 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 106496 bytes of storage and a write penalty on every one of 4848 inserts to projectdocuments are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_projectdocuments_sourceeventid keeps paying its write and storage cost on every future insert into projectdocuments without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_projectdocuments_sourceeventid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown projectdocuments costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_projectdocuments_sourceeventid ON public.projectdocuments USING btree (sourceeventid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — projectkitfiles.idx_projectkitfiles_filetype — `performance.unused-index.projectkitfiles.idx_projectkitfiles_filetype`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectkitfiles.idx_projectkitfiles_filetype is 294912 bytes and has recorded zero scans since the statistics were last reset, while projectkitfiles has recorded 44527 inserts.

**Why it needs changing**: Every insert into projectkitfiles — 44527 inserts so far — updates idx_projectkitfiles_filetype in addition to the table itself, and the index's 294912 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 294912 bytes of storage and a write penalty on every one of 44527 inserts to projectkitfiles are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_projectkitfiles_filetype keeps paying its write and storage cost on every future insert into projectkitfiles without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_projectkitfiles_filetype";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown projectkitfiles costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_projectkitfiles_filetype ON public.projectkitfiles USING btree (filetype);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — projectkits.idx_projectkits_status — `performance.unused-index.projectkits.idx_projectkits_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectkits.idx_projectkits_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while projectkits has recorded 107 inserts.

**Why it needs changing**: Every insert into projectkits — 107 inserts so far — updates idx_projectkits_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 107 inserts to projectkits are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_projectkits_status keeps paying its write and storage cost on every future insert into projectkits without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_projectkits_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown projectkits costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_projectkits_status ON public.projectkits USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — projectproposals.idx_projectproposals_companyid — `performance.unused-index.projectproposals.idx_projectproposals_companyid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectproposals.idx_projectproposals_companyid is 16384 bytes and has recorded zero scans since the statistics were last reset, while projectproposals has recorded 10 inserts.

**Why it needs changing**: Every insert into projectproposals — 10 inserts so far — updates idx_projectproposals_companyid in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 10 inserts to projectproposals are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_projectproposals_companyid keeps paying its write and storage cost on every future insert into projectproposals without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_projectproposals_companyid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown projectproposals costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_projectproposals_companyid ON public.projectproposals USING btree (companyid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — projectproposals.idx_projectproposals_companyid_status — `performance.unused-index.projectproposals.idx_projectproposals_companyid_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectproposals.idx_projectproposals_companyid_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while projectproposals has recorded 10 inserts.

**Why it needs changing**: Every insert into projectproposals — 10 inserts so far — updates idx_projectproposals_companyid_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 10 inserts to projectproposals are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_projectproposals_companyid_status keeps paying its write and storage cost on every future insert into projectproposals without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_projectproposals_companyid_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown projectproposals costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_projectproposals_companyid_status ON public.projectproposals USING btree (companyid, status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — projectproposals.idx_projectproposals_status — `performance.unused-index.projectproposals.idx_projectproposals_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectproposals.idx_projectproposals_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while projectproposals has recorded 10 inserts.

**Why it needs changing**: Every insert into projectproposals — 10 inserts so far — updates idx_projectproposals_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 10 inserts to projectproposals are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_projectproposals_status keeps paying its write and storage cost on every future insert into projectproposals without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_projectproposals_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown projectproposals costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_projectproposals_status ON public.projectproposals USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — projecttasks.idx_projecttasks_assignee — `performance.unused-index.projecttasks.idx_projecttasks_assignee`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.idx_projecttasks_assignee is 90112 bytes and has recorded zero scans since the statistics were last reset, while projecttasks has recorded 6754 inserts.

**Why it needs changing**: Every insert into projecttasks — 6754 inserts so far — updates idx_projecttasks_assignee in addition to the table itself, and the index's 90112 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 90112 bytes of storage and a write penalty on every one of 6754 inserts to projecttasks are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_projecttasks_assignee keeps paying its write and storage cost on every future insert into projecttasks without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_projecttasks_assignee";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown projecttasks costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_projecttasks_assignee ON public.projecttasks USING btree (assignee);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — projecttasks.idx_projecttasks_external — `performance.unused-index.projecttasks.idx_projecttasks_external`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.idx_projecttasks_external is 8192 bytes and has recorded zero scans since the statistics were last reset, while projecttasks has recorded 6754 inserts.

**Why it needs changing**: Every insert into projecttasks — 6754 inserts so far — updates idx_projecttasks_external in addition to the table itself, and the index's 8192 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 8192 bytes of storage and a write penalty on every one of 6754 inserts to projecttasks are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_projecttasks_external keeps paying its write and storage cost on every future insert into projecttasks without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_projecttasks_external";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown projecttasks costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_projecttasks_external ON public.projecttasks USING btree (sourcepmssystem, externalid) WHERE (externalid IS NOT NULL);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — projecttasks.idx_projecttasks_sourceeventid — `performance.unused-index.projecttasks.idx_projecttasks_sourceeventid`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projecttasks.idx_projecttasks_sourceeventid is 90112 bytes and has recorded zero scans since the statistics were last reset, while projecttasks has recorded 6754 inserts.

**Why it needs changing**: Every insert into projecttasks — 6754 inserts so far — updates idx_projecttasks_sourceeventid in addition to the table itself, and the index's 90112 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 90112 bytes of storage and a write penalty on every one of 6754 inserts to projecttasks are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_projecttasks_sourceeventid keeps paying its write and storage cost on every future insert into projecttasks without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_projecttasks_sourceeventid";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown projecttasks costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_projecttasks_sourceeventid ON public.projecttasks USING btree (sourceeventid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — projectthemes.idx_projectthemes_designsystemslug — `performance.unused-index.projectthemes.idx_projectthemes_designsystemslug`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

projectthemes.idx_projectthemes_designsystemslug is 16384 bytes and has recorded zero scans since the statistics were last reset, while projectthemes has recorded 25 inserts.

**Why it needs changing**: Every insert into projectthemes — 25 inserts so far — updates idx_projectthemes_designsystemslug in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 25 inserts to projectthemes are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_projectthemes_designsystemslug keeps paying its write and storage cost on every future insert into projectthemes without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_projectthemes_designsystemslug";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown projectthemes costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_projectthemes_designsystemslug ON public.projectthemes USING btree (designsystemslug) WHERE (designsystemslug IS NOT NULL);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — signupinvitations.idx_signupinvitations_email — `performance.unused-index.signupinvitations.idx_signupinvitations_email`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

signupinvitations.idx_signupinvitations_email is 16384 bytes and has recorded zero scans since the statistics were last reset, while signupinvitations has recorded 4 inserts.

**Why it needs changing**: Every insert into signupinvitations — 4 inserts so far — updates idx_signupinvitations_email in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 4 inserts to signupinvitations are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_signupinvitations_email keeps paying its write and storage cost on every future insert into signupinvitations without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_signupinvitations_email";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown signupinvitations costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_signupinvitations_email ON public.signupinvitations USING btree (email);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — systemsettings.idx_systemsettings_category — `performance.unused-index.systemsettings.idx_systemsettings_category`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

systemsettings.idx_systemsettings_category is 16384 bytes and has recorded zero scans since the statistics were last reset, while systemsettings has recorded 11 inserts.

**Why it needs changing**: Every insert into systemsettings — 11 inserts so far — updates idx_systemsettings_category in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 11 inserts to systemsettings are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_systemsettings_category keeps paying its write and storage cost on every future insert into systemsettings without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_systemsettings_category";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown systemsettings costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_systemsettings_category ON public.systemsettings USING btree (category);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — systemsettings.idx_systemsettings_key — `performance.unused-index.systemsettings.idx_systemsettings_key`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

systemsettings.idx_systemsettings_key is 16384 bytes and has recorded zero scans since the statistics were last reset, while systemsettings has recorded 11 inserts.

**Why it needs changing**: Every insert into systemsettings — 11 inserts so far — updates idx_systemsettings_key in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 11 inserts to systemsettings are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_systemsettings_key keeps paying its write and storage cost on every future insert into systemsettings without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_systemsettings_key";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown systemsettings costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_systemsettings_key ON public.systemsettings USING btree (key);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — systemsettings.idx_systemsettings_updatedby — `performance.unused-index.systemsettings.idx_systemsettings_updatedby`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

systemsettings.idx_systemsettings_updatedby is 16384 bytes and has recorded zero scans since the statistics were last reset, while systemsettings has recorded 11 inserts.

**Why it needs changing**: Every insert into systemsettings — 11 inserts so far — updates idx_systemsettings_updatedby in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 11 inserts to systemsettings are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_systemsettings_updatedby keeps paying its write and storage cost on every future insert into systemsettings without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_systemsettings_updatedby";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown systemsettings costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_systemsettings_updatedby ON public.systemsettings USING btree (updatedby);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — testcycles.idx_testcycles_promotedby — `performance.unused-index.testcycles.idx_testcycles_promotedby`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

testcycles.idx_testcycles_promotedby is 16384 bytes and has recorded zero scans since the statistics were last reset, while testcycles has recorded 12 inserts.

**Why it needs changing**: Every insert into testcycles — 12 inserts so far — updates idx_testcycles_promotedby in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 12 inserts to testcycles are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_testcycles_promotedby keeps paying its write and storage cost on every future insert into testcycles without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_testcycles_promotedby";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown testcycles costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_testcycles_promotedby ON public.testcycles USING btree (promotedbyid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — testplans.idx_testplans_generatedby — `performance.unused-index.testplans.idx_testplans_generatedby`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

testplans.idx_testplans_generatedby is 16384 bytes and has recorded zero scans since the statistics were last reset, while testplans has recorded 2 inserts.

**Why it needs changing**: Every insert into testplans — 2 inserts so far — updates idx_testplans_generatedby in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 2 inserts to testplans are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_testplans_generatedby keeps paying its write and storage cost on every future insert into testplans without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_testplans_generatedby";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown testplans costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_testplans_generatedby ON public.testplans USING btree (generatedbyid);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — themetemplates.idx_themetemplates_designsystemslug — `performance.unused-index.themetemplates.idx_themetemplates_designsystemslug`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

themetemplates.idx_themetemplates_designsystemslug is 16384 bytes and has recorded zero scans since the statistics were last reset, while themetemplates has recorded 9 inserts.

**Why it needs changing**: Every insert into themetemplates — 9 inserts so far — updates idx_themetemplates_designsystemslug in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 9 inserts to themetemplates are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_themetemplates_designsystemslug keeps paying its write and storage cost on every future insert into themetemplates without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_themetemplates_designsystemslug";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown themetemplates costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_themetemplates_designsystemslug ON public.themetemplates USING btree (designsystemslug) WHERE (designsystemslug IS NOT NULL);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — userinvitations.idx_userinvitation_token — `performance.unused-index.userinvitations.idx_userinvitation_token`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

userinvitations.idx_userinvitation_token is 16384 bytes and has recorded zero scans since the statistics were last reset, while userinvitations has recorded 23 inserts.

**Why it needs changing**: Every insert into userinvitations — 23 inserts so far — updates idx_userinvitation_token in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 23 inserts to userinvitations are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_userinvitation_token keeps paying its write and storage cost on every future insert into userinvitations without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_userinvitation_token";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown userinvitations costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_userinvitation_token ON public.userinvitations USING btree (token);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — userprofiles.idx_userprofiles_active — `performance.unused-index.userprofiles.idx_userprofiles_active`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

userprofiles.idx_userprofiles_active is 16384 bytes and has recorded zero scans since the statistics were last reset, while userprofiles has recorded 74 inserts.

**Why it needs changing**: Every insert into userprofiles — 74 inserts so far — updates idx_userprofiles_active in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 74 inserts to userprofiles are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_userprofiles_active keeps paying its write and storage cost on every future insert into userprofiles without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_userprofiles_active";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown userprofiles costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_userprofiles_active ON public.userprofiles USING btree (active);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — userprofiles.idx_userprofiles_emailaddr — `performance.unused-index.userprofiles.idx_userprofiles_emailaddr`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

userprofiles.idx_userprofiles_emailaddr is 16384 bytes and has recorded zero scans since the statistics were last reset, while userprofiles has recorded 74 inserts.

**Why it needs changing**: Every insert into userprofiles — 74 inserts so far — updates idx_userprofiles_emailaddr in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 74 inserts to userprofiles are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_userprofiles_emailaddr keeps paying its write and storage cost on every future insert into userprofiles without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_userprofiles_emailaddr";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown userprofiles costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_userprofiles_emailaddr ON public.userprofiles USING btree (emailaddr);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — wxkanbandocuments.idx_wxkanbandocuments_framework — `performance.unused-index.wxkanbandocuments.idx_wxkanbandocuments_framework`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbandocuments.idx_wxkanbandocuments_framework is 16384 bytes and has recorded zero scans since the statistics were last reset, while wxkanbandocuments has recorded 18 inserts.

**Why it needs changing**: Every insert into wxkanbandocuments — 18 inserts so far — updates idx_wxkanbandocuments_framework in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 18 inserts to wxkanbandocuments are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_wxkanbandocuments_framework keeps paying its write and storage cost on every future insert into wxkanbandocuments without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_wxkanbandocuments_framework";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown wxkanbandocuments costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_wxkanbandocuments_framework ON public.wxkanbandocuments USING btree (framework);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — wxkanbandocuments.idx_wxkanbandocuments_fts — `performance.unused-index.wxkanbandocuments.idx_wxkanbandocuments_fts`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbandocuments.idx_wxkanbandocuments_fts is 147456 bytes and has recorded zero scans since the statistics were last reset, while wxkanbandocuments has recorded 18 inserts.

**Why it needs changing**: Every insert into wxkanbandocuments — 18 inserts so far — updates idx_wxkanbandocuments_fts in addition to the table itself, and the index's 147456 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 147456 bytes of storage and a write penalty on every one of 18 inserts to wxkanbandocuments are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_wxkanbandocuments_fts keeps paying its write and storage cost on every future insert into wxkanbandocuments without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_wxkanbandocuments_fts";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown wxkanbandocuments costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_wxkanbandocuments_fts ON public.wxkanbandocuments USING gin (fulltextsearch);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — wxkanbandocuments.idx_wxkanbandocuments_type — `performance.unused-index.wxkanbandocuments.idx_wxkanbandocuments_type`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbandocuments.idx_wxkanbandocuments_type is 16384 bytes and has recorded zero scans since the statistics were last reset, while wxkanbandocuments has recorded 18 inserts.

**Why it needs changing**: Every insert into wxkanbandocuments — 18 inserts so far — updates idx_wxkanbandocuments_type in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 18 inserts to wxkanbandocuments are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_wxkanbandocuments_type keeps paying its write and storage cost on every future insert into wxkanbandocuments without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_wxkanbandocuments_type";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown wxkanbandocuments costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_wxkanbandocuments_type ON public.wxkanbandocuments USING btree (documenttype);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — wxkanbanhelp.idx_wxkanbanhelp_category — `performance.unused-index.wxkanbanhelp.idx_wxkanbanhelp_category`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbanhelp.idx_wxkanbanhelp_category is 16384 bytes and has recorded zero scans since the statistics were last reset, while wxkanbanhelp has recorded 29 inserts.

**Why it needs changing**: Every insert into wxkanbanhelp — 29 inserts so far — updates idx_wxkanbanhelp_category in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 29 inserts to wxkanbanhelp are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_wxkanbanhelp_category keeps paying its write and storage cost on every future insert into wxkanbanhelp without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_wxkanbanhelp_category";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown wxkanbanhelp costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_wxkanbanhelp_category ON public.wxkanbanhelp USING btree (category);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — wxkanbanhelp.idx_wxkanbanhelp_createdat — `performance.unused-index.wxkanbanhelp.idx_wxkanbanhelp_createdat`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbanhelp.idx_wxkanbanhelp_createdat is 16384 bytes and has recorded zero scans since the statistics were last reset, while wxkanbanhelp has recorded 29 inserts.

**Why it needs changing**: Every insert into wxkanbanhelp — 29 inserts so far — updates idx_wxkanbanhelp_createdat in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 29 inserts to wxkanbanhelp are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_wxkanbanhelp_createdat keeps paying its write and storage cost on every future insert into wxkanbanhelp without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_wxkanbanhelp_createdat";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown wxkanbanhelp costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_wxkanbanhelp_createdat ON public.wxkanbanhelp USING btree (createdat);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — wxkanbanhelp.idx_wxkanbanhelp_docs — `performance.unused-index.wxkanbanhelp.idx_wxkanbanhelp_docs`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbanhelp.idx_wxkanbanhelp_docs is 16384 bytes and has recorded zero scans since the statistics were last reset, while wxkanbanhelp has recorded 29 inserts.

**Why it needs changing**: Every insert into wxkanbanhelp — 29 inserts so far — updates idx_wxkanbanhelp_docs in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 29 inserts to wxkanbanhelp are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_wxkanbanhelp_docs keeps paying its write and storage cost on every future insert into wxkanbanhelp without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_wxkanbanhelp_docs";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown wxkanbanhelp costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_wxkanbanhelp_docs ON public.wxkanbanhelp USING btree (category, status, sortorder);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — wxkanbanhelp.idx_wxkanbanhelp_search — `performance.unused-index.wxkanbanhelp.idx_wxkanbanhelp_search`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbanhelp.idx_wxkanbanhelp_search is 131072 bytes and has recorded zero scans since the statistics were last reset, while wxkanbanhelp has recorded 29 inserts.

**Why it needs changing**: Every insert into wxkanbanhelp — 29 inserts so far — updates idx_wxkanbanhelp_search in addition to the table itself, and the index's 131072 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 131072 bytes of storage and a write penalty on every one of 29 inserts to wxkanbanhelp are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_wxkanbanhelp_search keeps paying its write and storage cost on every future insert into wxkanbanhelp without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_wxkanbanhelp_search";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown wxkanbanhelp costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_wxkanbanhelp_search ON public.wxkanbanhelp USING gin (to_tsvector('english'::regconfig, (((((COALESCE(title, ''::character varying))::text || ' '::text) || (COALESCE(description, ''::character varying))::text) || ' '::text) || COALESCE(content, ''::text))));

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — wxkanbanhelp.idx_wxkanbanhelp_slug — `performance.unused-index.wxkanbanhelp.idx_wxkanbanhelp_slug`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbanhelp.idx_wxkanbanhelp_slug is 16384 bytes and has recorded zero scans since the statistics were last reset, while wxkanbanhelp has recorded 29 inserts.

**Why it needs changing**: Every insert into wxkanbanhelp — 29 inserts so far — updates idx_wxkanbanhelp_slug in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 29 inserts to wxkanbanhelp are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_wxkanbanhelp_slug keeps paying its write and storage cost on every future insert into wxkanbanhelp without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_wxkanbanhelp_slug";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown wxkanbanhelp costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_wxkanbanhelp_slug ON public.wxkanbanhelp USING btree (slug);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — wxkanbanhelp.idx_wxkanbanhelp_status — `performance.unused-index.wxkanbanhelp.idx_wxkanbanhelp_status`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbanhelp.idx_wxkanbanhelp_status is 16384 bytes and has recorded zero scans since the statistics were last reset, while wxkanbanhelp has recorded 29 inserts.

**Why it needs changing**: Every insert into wxkanbanhelp — 29 inserts so far — updates idx_wxkanbanhelp_status in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 29 inserts to wxkanbanhelp are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_wxkanbanhelp_status keeps paying its write and storage cost on every future insert into wxkanbanhelp without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_wxkanbanhelp_status";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown wxkanbanhelp costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_wxkanbanhelp_status ON public.wxkanbanhelp USING btree (status);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — wxkanbanhelp.idx_wxkanbanhelp_subcategory — `performance.unused-index.wxkanbanhelp.idx_wxkanbanhelp_subcategory`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbanhelp.idx_wxkanbanhelp_subcategory is 16384 bytes and has recorded zero scans since the statistics were last reset, while wxkanbanhelp has recorded 29 inserts.

**Why it needs changing**: Every insert into wxkanbanhelp — 29 inserts so far — updates idx_wxkanbanhelp_subcategory in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 29 inserts to wxkanbanhelp are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_wxkanbanhelp_subcategory keeps paying its write and storage cost on every future insert into wxkanbanhelp without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_wxkanbanhelp_subcategory";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown wxkanbanhelp costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_wxkanbanhelp_subcategory ON public.wxkanbanhelp USING btree (subcategory);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — wxkanbanhelp.idx_wxkanbanhelp_visibility — `performance.unused-index.wxkanbanhelp.idx_wxkanbanhelp_visibility`

**Rule**: `performance.unused-index`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbanhelp.idx_wxkanbanhelp_visibility is 16384 bytes and has recorded zero scans since the statistics were last reset, while wxkanbanhelp has recorded 29 inserts.

**Why it needs changing**: Every insert into wxkanbanhelp — 29 inserts so far — updates idx_wxkanbanhelp_visibility in addition to the table itself, and the index's 16384 bytes compete for space in the buffer cache on every access to that table, for a structure no recorded query has ever read.

**Business impact**: 16384 bytes of storage and a write penalty on every one of 29 inserts to wxkanbanhelp are being spent maintaining a structure that provides no read benefit today.

**Doing nothing**: idx_wxkanbanhelp_visibility keeps paying its write and storage cost on every future insert into wxkanbanhelp without ever being read.

**Remediation** (manual-only, lock: SHARE UPDATE EXCLUSIVE — concurrent drop, does not block reads or writes, duration: proportional to index size; runs online)

```sql
drop index concurrently "idx_wxkanbanhelp_visibility";
```

**Fix risk**: DROP INDEX CONCURRENTLY cannot run inside a transaction block, so it must be issued on its own. If a future query does need this access path, the index cannot be cheaply recreated — rebuilding it against a grown wxkanbanhelp costs a full index build, not a rollback.

**Rollback**: CREATE INDEX idx_wxkanbanhelp_visibility ON public.wxkanbanhelp USING btree (visibility);

**Evidence**

```sql
select idx_scan from pg_catalog.pg_stat_user_indexes where indexrelid = $index
```

---

### LOW — engagements — `schema.source-conflict.engagements`

**Rule**: `schema.source-conflict`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

engagements is declared in app and mcp with differing shapes — columns only in app: acceptedat, acceptedbyid, createdat, createdbyid, disabledat, endedat, endedbyid, invitationid, pausedat.

**Why it needs changing**: One source declares a strict subset of the other's columns. That is the read-only-mirror pattern this project uses deliberately, so it is reported for confirmation rather than as a defect — but an undocumented subset is indistinguishable from a stale declaration.

**Business impact**: None if the narrowing is intentional. If it is not, the narrower source cannot read the columns it omits.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### LOW — wxkanbandocuments — `schema.source-conflict.wxkanbandocuments`

**Rule**: `schema.source-conflict`  
**Severity**: low  
**Urgency**: deferred  
**Confidence**: proven

wxkanbandocuments is declared in app and mcp with differing shapes — columns only in app: createdby, effectivedate, fulltextsearch, pdfcontent, pdfgeneratedat, updatedat.

**Why it needs changing**: One source declares a strict subset of the other's columns. That is the read-only-mirror pattern this project uses deliberately, so it is reported for confirmation rather than as a defect — but an undocumented subset is indistinguishable from a stale declaration.

**Business impact**: None if the narrowing is intentional. If it is not, the narrower source cannot read the columns it omits.

**Doing nothing**: The divergence widens with each change applied to one source and not the other.

**Remediation** (manual-only, lock: n/a — no statement is generated, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Reconciling is a code change only; the risk is choosing the wrong source as authoritative.

**Rollback**: n/a

**Evidence**

```sql
declared-schema comparison across sources
```

---

### INFO — aispecsessions.companyid — `integrity.not-probed.aispecsessions.companyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for aispecsessions.companyid -> companies were not measured: anti-join skipped: aispecsessions.companyid is unindexed and its row count is unknown — aispecsessions has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — aispecsessions.projectid — `integrity.not-probed.aispecsessions.projectid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for aispecsessions.projectid -> companyprojects were not measured: anti-join skipped: aispecsessions.projectid is unindexed and its row count is unknown — aispecsessions has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — aispecsessions.userid — `integrity.not-probed.aispecsessions.userid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for aispecsessions.userid -> userprofiles were not measured: anti-join skipped: aispecsessions.userid is unindexed and its row count is unknown — aispecsessions has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — company_status_history.changed_by — `integrity.not-probed.company_status_history.changed_by`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for company_status_history.changed_by -> userprofiles were not measured: anti-join skipped: company_status_history.changed_by is unindexed and its row count is unknown — company_status_history has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — companystackprofiles.createdbyid — `integrity.not-probed.companystackprofiles.createdbyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for companystackprofiles.createdbyid -> userprofiles were not measured: anti-join skipped: companystackprofiles.createdbyid is unindexed and its row count is unknown — companystackprofiles has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — companythemeprofiles.createdbyid — `integrity.not-probed.companythemeprofiles.createdbyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for companythemeprofiles.createdbyid -> userprofiles were not measured: anti-join skipped: companythemeprofiles.createdbyid is unindexed and its row count is unknown — companythemeprofiles has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — complianceflags.triggeredbyid — `integrity.not-probed.complianceflags.triggeredbyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for complianceflags.triggeredbyid -> userprofiles were not measured: anti-join skipped: complianceflags.triggeredbyid is unindexed and its row count is unknown — complianceflags has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — complianceoverride.teamprojectdutyid — `integrity.not-probed.complianceoverride.teamprojectdutyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for complianceoverride.teamprojectdutyid -> teamprojectduty were not measured: anti-join skipped: complianceoverride.teamprojectdutyid is unindexed and its row count is unknown — complianceoverride has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — dutyassignment.teamprojectdutyid — `integrity.not-probed.dutyassignment.teamprojectdutyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for dutyassignment.teamprojectdutyid -> teamprojectduty were not measured: anti-join skipped: dutyassignment.teamprojectdutyid is unindexed and its row count is unknown — dutyassignment has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — engagementmodifications.queuedbyid — `integrity.not-probed.engagementmodifications.queuedbyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for engagementmodifications.queuedbyid -> userprofiles were not measured: anti-join skipped: engagementmodifications.queuedbyid is unindexed and its row count is unknown — engagementmodifications has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — feedbacks.phaseid — `integrity.not-probed.feedbacks.phaseid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for feedbacks.phaseid -> projectphases were not measured: anti-join skipped: feedbacks.phaseid is unindexed and its row count is unknown — feedbacks has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — importcache.companyid — `integrity.not-probed.importcache.companyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for importcache.companyid -> companies were not measured: anti-join skipped: importcache.companyid is unindexed and its row count is unknown — importcache has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — marketinglinks.assetid — `integrity.not-probed.marketinglinks.assetid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for marketinglinks.assetid -> marketingassets were not measured: anti-join skipped: marketinglinks.assetid is unindexed and its row count is unknown — marketinglinks has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — mcpdriftevents.projectid — `integrity.not-probed.mcpdriftevents.projectid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for mcpdriftevents.projectid -> companyprojects were not measured: anti-join skipped: mcpdriftevents.projectid is unindexed and its row count is unknown — mcpdriftevents has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — mcpparityconfig.rollbackby — `integrity.not-probed.mcpparityconfig.rollbackby`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for mcpparityconfig.rollbackby -> userprofiles were not measured: anti-join skipped: mcpparityconfig.rollbackby is unindexed and its row count is unknown — mcpparityconfig has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — pmsystemconnections.userid — `integrity.not-probed.pmsystemconnections.userid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for pmsystemconnections.userid -> userprofiles were not measured: anti-join skipped: pmsystemconnections.userid is unindexed and its row count is unknown — pmsystemconnections has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — projecttimeentries.companyid — `integrity.not-probed.projecttimeentries.companyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for projecttimeentries.companyid -> companies were not measured: anti-join skipped: projecttimeentries.companyid is unindexed and its row count is unknown — projecttimeentries has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — projecttimeentries.projectid — `integrity.not-probed.projecttimeentries.projectid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for projecttimeentries.projectid -> companyprojects were not measured: anti-join skipped: projecttimeentries.projectid is unindexed and its row count is unknown — projecttimeentries has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — projecttimeentries.taskid — `integrity.not-probed.projecttimeentries.taskid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for projecttimeentries.taskid -> projecttasks were not measured: anti-join skipped: projecttimeentries.taskid is unindexed and its row count is unknown — projecttimeentries has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — projecttimeentries.userid — `integrity.not-probed.projecttimeentries.userid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for projecttimeentries.userid -> userprofiles were not measured: anti-join skipped: projecttimeentries.userid is unindexed and its row count is unknown — projecttimeentries has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — sessions.userid — `integrity.not-probed.sessions.userid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for sessions.userid -> userprofiles were not measured: anti-join skipped: sessions.userid is unindexed and its row count is unknown — sessions has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — signupinvitations.invitedbyid — `integrity.not-probed.signupinvitations.invitedbyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for signupinvitations.invitedbyid -> userprofiles were not measured: anti-join skipped: signupinvitations.invitedbyid is unindexed and its row count is unknown — signupinvitations has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — signupinvitations.redeemedcompanyid — `integrity.not-probed.signupinvitations.redeemedcompanyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for signupinvitations.redeemedcompanyid -> companies were not measured: anti-join skipped: signupinvitations.redeemedcompanyid is unindexed and its row count is unknown — signupinvitations has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — subassignments.assignedbyid — `integrity.not-probed.subassignments.assignedbyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for subassignments.assignedbyid -> userprofiles were not measured: anti-join skipped: subassignments.assignedbyid is unindexed and its row count is unknown — subassignments has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — subassignments.removedbyid — `integrity.not-probed.subassignments.removedbyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for subassignments.removedbyid -> userprofiles were not measured: anti-join skipped: subassignments.removedbyid is unindexed and its row count is unknown — subassignments has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — synchistory.triggeredby — `integrity.not-probed.synchistory.triggeredby`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for synchistory.triggeredby -> userprofiles were not measured: anti-join skipped: synchistory.triggeredby is unindexed and its row count is unknown — synchistory has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — systemsettingshistory.changedby — `integrity.not-probed.systemsettingshistory.changedby`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for systemsettingshistory.changedby -> userprofiles were not measured: anti-join skipped: systemsettingshistory.changedby is unindexed and its row count is unknown — systemsettingshistory has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — taskdependencies.blockedbyid — `integrity.not-probed.taskdependencies.blockedbyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for taskdependencies.blockedbyid -> projecttasks were not measured: anti-join skipped: taskdependencies.blockedbyid is unindexed and its row count is unknown — taskdependencies has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — taskstateoverrides.userid — `integrity.not-probed.taskstateoverrides.userid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for taskstateoverrides.userid -> userprofiles were not measured: anti-join skipped: taskstateoverrides.userid is unindexed and its row count is unknown — taskstateoverrides has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — tasksyncrecords.pmconnectionid — `integrity.not-probed.tasksyncrecords.pmconnectionid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for tasksyncrecords.pmconnectionid -> pmsystemconnections were not measured: anti-join skipped: tasksyncrecords.pmconnectionid is unindexed and its row count is unknown — tasksyncrecords has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — tasksyncrecords.taskid — `integrity.not-probed.tasksyncrecords.taskid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for tasksyncrecords.taskid -> projecttasks were not measured: anti-join skipped: tasksyncrecords.taskid is unindexed and its row count is unknown — tasksyncrecords has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — themeblocks.createdbyid — `integrity.not-probed.themeblocks.createdbyid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for themeblocks.createdbyid -> userprofiles were not measured: anti-join skipped: themeblocks.createdbyid is unindexed and its row count is unknown — themeblocks has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — timeEntry.taskid — `integrity.not-probed.timeEntry.taskid`

**Rule**: `integrity.not-probed`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

Orphans for timeEntry.taskid -> projecttasks were not measured: anti-join skipped: timeEntry.taskid is unindexed and its row count is unknown — timeEntry has never been analyzed, so it is treated as exceeding the ceiling 2000000 out of caution. Re-run with --deep to probe it anyway..

**Why it needs changing**: This relationship is unverified, not verified-clean. Treating an unmeasured link as healthy is how an audit reports green while proving nothing about the rows it never looked at.

**Business impact**: The integrity of this relationship is unknown; it may hold orphans nobody has counted.

**Doing nothing**: This relationship remains unaudited.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: Re-running with --deep executes the anti-join and may be slow on a large unindexed table.

**Rollback**: n/a

**Evidence**

```sql
not executed
```

---

### INFO — tenant consistency coverage — `integrity.tenant-coverage-gap`

**Rule**: `integrity.tenant-coverage-gap`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

154 relationships could not be checked for cross-tenant consistency because the configured tenant column does not exist on one side — expected for a relationship that is not multi-tenant on both sides, and rolled up into this one finding rather than reported per relationship so it does not bury findings that matter under expected noise.

**Why it needs changing**: This is coverage information, not a defect by itself: it states how much of the schema the cross-tenant check could not examine, so the absence of a cross-tenant finding elsewhere in the report is never mistaken for proof that no leak exists among these relationships.

**Business impact**: None directly — this finding measures audit coverage rather than reporting a database defect.

**Doing nothing**: The coverage gap remains, and these relationships' cross-tenant consistency stays unmeasured.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None — informational only.

**Rollback**: n/a

**Evidence**

```sql
aggregate of tenant sub-probe skips classified column-missing
```

---

### INFO — database-wide bloat — `maintenance.bloat-unmeasurable`

**Rule**: `maintenance.bloat-unmeasurable`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

pgstattuple is not installed, so physical bloat cannot be measured. The usual alternative — estimating bloat from column statistics — is also unavailable for any table that has never been analyzed, which on this database is most of them. Bloat is therefore not reported rather than reported as zero.

**Why it needs changing**: Physical bloat is not measured here, not zero — its absence from this report must not be read as evidence these tables are unbloated; it is simply unknown.

**Business impact**: Bloat-driven disk growth and the query slowdown it causes could be present on any table and would not show up anywhere in this report.

**Doing nothing**: Physical bloat remains unmeasured and unmeasurable by this tool.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None — this finding is informational. Installing pgstattuple, if desired, is a separate operational decision outside this tool's scope.

**Rollback**: n/a

**Evidence**

```sql
select extname from pg_catalog.pg_extension where extname = 'pgstattuple'
```

---

### INFO — 15 index(es) — `performance.duplicate-check-skipped`

**Rule**: `performance.duplicate-check-skipped`  
**Severity**: info  
**Urgency**: deferred  
**Confidence**: proven

15 index(es) were excluded from duplicate-index detection because they are expression indexes or carry a partial WHERE predicate, neither of which this tool's column-list grouping can compare safely: aispecsessions.idx_aispecsessions_active, appauditconfiguration.appauditconfiguration_projectid_unique, customers.idx_customers_consultant_name_live, engagements.uk_engagements_open_pair, feedbacksubmissions.idx_feedbacksubmissions_errorfingerprint, feedbacksubmissions.uniq_feedbacksubmissions_auto_identity, gitcommandsessions.idx_git_command_sessions_active, projecttasks.idx_projecttasks_external, projectthemes.idx_projectthemes_designsystemslug, projecttimeentries.idx_projecttimeentries_aisession, and 5 more.

**Why it needs changing**: Two expression indexes both reporting the identical placeholder column name "(expression)" are not necessarily duplicates — lower(email) and upper(name) would collapse into one group under a naive column-list comparison despite indexing entirely different data — and a partial index's WHERE predicate changes which rows it covers even when its columns match a full index exactly. Grouping either kind by column list alone risks recommending DROP INDEX CONCURRENTLY against an index that is not actually redundant.

**Business impact**: These indexes are not checked for redundancy at all by this tool; a genuine duplicate among them would not be reported.

**Doing nothing**: These indexes remain unchecked for duplication by this tool.

**Remediation** (none, lock: n/a, duration: n/a)

_No statement is generated; this requires manual handling._

**Fix risk**: None — this finding is informational; review these indexes manually for redundancy if desired.

**Rollback**: n/a

**Evidence**

```sql
select indexrelid, pg_get_indexdef(indexrelid) from pg_catalog.pg_index where indexrelid in (select oid from pg_catalog.pg_class where relkind = 'i')
```

---
