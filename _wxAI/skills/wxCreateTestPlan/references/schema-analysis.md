# Schema analysis — referential integrity, field mapping, orphans, and index hygiene

A second deliverable the skill produces alongside the test plan: a **static analysis of the Drizzle
schema** in `src/db/schema/*.ts`. A companion deterministic script parses every `pgTable` definition
and emits two artifacts — `SCHEMA-ANALYSIS.md` (human) and `schema-analysis.json` (machine). This
reference explains how to read those artifacts, how each score and finding is computed, and what to
do with them. The script is the source of truth for the numbers; this file is the rubric behind them.

The analysis is **schema-shape only** — it reads the table definitions, not the data. The one place
it touches data is the opt-in orphan-data pass (§3, `--live`), which is **read-only** and runs
against a **non-prod DB only**, under the same prod-RDS guard the rest of the harness uses.

Findings are actionable by construction: every deduction and every flag carries a `file:line` so a
reader can jump straight to the declaration. Example shorthand used throughout:
`src/db/schema/campaignposts.ts:40 createdbyid — unenforced FK`.

The wxKanban DB conventions in `CLAUDE.md` **are** the review criteria — plural lowercase table names,
no camelCase, no underscores, UUID-v7 `id` PKs, `parent+id` foreign keys declared with `.references()`,
`createdat`/`updatedat` timestamps. Every rule below traces back to one of those conventions.

---

## What the script parses

Per `pgTable("name", { …columns }, (table) => ({ …indexes }))` it extracts:

- **table name** (the string literal, not the export identifier) and its `file:line`
- **columns** — name, type (`uuid`/`varchar`/`text`/`timestamp`/`integer`/`boolean`/…), `varchar` length,
  `notNull`, default, and any trailing `// comment` (used to spot enum-like columns)
- **declared FKs** — every `.references(() => parent.id, { onDelete })` with its target table and rule
- **indexes** — `index("idx_…").on(table.col, …)` and `uniqueIndex("uq_…").on(…)`, with their column sets
- **imports** — which other schema modules this file pulls in (feeds the orphan-table test in §3)

It then derives, per table: **FK candidates** (columns whose name ends in `id` and isn't the PK `id`),
**declared FKs**, **unenforced FKs** (FK candidate with no `.references()`), and the index coverage of
each FK column. These derived sets drive all five dimensions.

---

## The five dimensions

### 1. Referential integrity — a 0–10 score

One headline number per run, plus a per-table breakdown. It answers: *how much of this schema's
referential integrity is actually enforced by the database, versus merely implied by a column name?*

**FK candidates** are the denominator: every non-PK column whose name ends in `id`
(`companyid`, `userid`, `createdbyid`, `campaignid`, …). Each candidate can incur up to weight **3**:

| Penalty | Condition | Weight |
|---|---|---:|
| **Unenforced FK** | an `*id` column with **no** `.references()` — the parent link exists in name only | **3** |
| **Missing `onDelete`** | a real `.references()` with no `{ onDelete }` rule (delete behavior is undefined/`no action`) | **1** |
| **No covering index** | an FK column (enforced or not) with no `index`/`uniqueIndex` whose left-most column is it | **1** |

A single column can stack penalties — an unenforced FK with no index scores 3 + 1 = 4 of its
possible 3-and-then-some; the formula clamps, so no single column can push the aggregate negative.

```
score = clamp( 10 − 10 × (Σ weighted penalties) / (fkCandidates × 3), 0, 10 )
```

rounded to **1 decimal**. The denominator `fkCandidates × 3` is the worst case (every candidate
maximally unenforced), so a schema where every `*id` is a real, indexed, `onDelete`-ruled FK scores a
clean **10.0**. The `SCHEMA-ANALYSIS.md` prints the component breakdown so the number is never a black
box:

```
Referential integrity: 8.4 / 10
  FK candidates ......... 61
  Unenforced FKs ........ 4   (weight 3 → 12)
  Missing onDelete ...... 3   (weight 1 → 3)
  FK cols w/o index ..... 9   (weight 1 → 9)
  Σ weighted ............ 24  of possible 183
  → 10 − 10 × 24/183 = 8.7 ... rounded 8.7
```

**Band legend:**

| Score | Band | Reading |
|---|---|---|
| **9.0 – 10** | solid | integrity is enforced in the DB; deductions are index-level polish |
| **7.0 – 8.9** | minor gaps | a handful of unindexed or ruleless FKs; no islands of unenforced linkage |
| **4.0 – 6.9** | material risk | several unenforced FKs — the DB can hold rows pointing at nothing |
| **< 4.0** | serious | referential integrity is largely name-only; treat as a data-integrity defect |

Every deduction is itemized with its `file:line` in the artifact, so the score is a jumping-off point,
not a verdict. Unenforced FKs are listed first — they are the **#1 referential-integrity defect** in
this codebase (see below) and each is worth 3× an index gap for a reason.

> **The gotcha — unenforced / implicit FKs.** A column named like a foreign key but declared without
> `.references()` looks like a relationship and behaves like a loose `uuid`. The database will happily
> store a `createdbyid` that matches no `users.id`, and no `ON DELETE` ever fires. This is the single
> most common integrity defect here. Real example, live in the tree today:
> ```ts
> // src/db/schema/campaignposts.ts:40
> createdbyid: uuid("createdbyid"),          // ← no .references() — unenforced FK
> ```
> versus the correct sibling two lines up:
> ```ts
> // src/db/schema/campaignposts.ts:24
> companyid: uuid("companyid").references(() => companies.id, { onDelete: "cascade" }),
> ```
> Every such column is flagged as **`unenforced FK`** with weight 3, listed with its `file:line`, and
> is a candidate `project_submit_feedback`. The fix is either to add the `.references()` (with an
> `onDelete` rule) or, if the column is deliberately a soft/optional reference, to document that intent
> in a comment so the flag reads as a known exemption rather than a defect.

### 2. Field mapping & table-definition review

Convention conformance, column by column. Each row of the artifact's field-review table is one
actionable line naming the declaration and the fix.

| Flag | Rule it violates | Fix |
|---|---|---|
| **underscore in name** | no underscores for word separation — concatenate | rename `created_by_id` → `createdbyid` (needs a migration) |
| **camelCase name** | lowercase only, no camelCase | rename `companyStatus` column → `companystatus` |
| **singular table** | tables are plural | `campaignpost` → `campaignposts` |
| **PK not UUID-v7** | `id` must be `uuid("id").primaryKey().$defaultFn(() => uuidv7())` | replace serial/text/`defaultRandom` PK with the UUID-v7 pattern |
| **missing `createdat`/`updatedat`** | audit timestamps expected on persistent tables | add `timestamp("createdat").defaultNow().notNull()` and matching `updatedat` |
| **`varchar` without length** | bounded strings should declare a length | add `{ length: N }` sized to the domain |
| **`text` where `varchar` fits** | unbounded `text` for a short bounded value | narrow to `varchar` with a length (e.g. a 20-char `channel`) |
| **nullable that should be `notNull`** | required links/fields left nullable | add `.notNull()` (e.g. an `*id` that is always present, like a nullable `companyid` on a tenant-scoped row) |
| **enum-like `varchar`** | allowed values live only in a trailing comment | promote to a pg enum or add a `CHECK`, or at minimum keep the comment authoritative |

The enum-like case is worth calling out — it's pervasive here and easy to miss:
```ts
// src/db/schema/campaignposts.ts:36
status: varchar("status", { length: 20 }).default("draft").notNull(), // draft|scheduled|published
```
The three legal values exist only in the `//` comment; nothing stops `status = "banana"` reaching the
row. Flagged as **enum-like `varchar`** — candidate for a check constraint or a pg enum so the
database enforces the domain the comment merely describes.

Naming-convention flags that would require a **column rename** are High-friction (they need a
migration and touch every query) — the artifact marks them so the reader weighs the churn. A missing
`notNull` or a `varchar` length is low-friction and usually worth doing.

### 3. Orphaned tables & data

Two distinct notions of "orphan" — one detectable from the schema, one only against live data.

**Orphan TABLE (an island).** A table with **no incoming FK** (nothing `.references()` it) **and no
outgoing FK** (it `.references()` nothing) — *and/or* whose module is imported nowhere else in
`src/db/schema/*`. An island is either dead (drop it) or missing a relationship it should have. The
script lists each with its `file:line` and both edge counts, so a genuinely standalone lookup table
(legitimately edge-free) can be told apart from a table that lost its wiring. An island is a
**finding, not an automatic delete** — confirm intent before proposing removal.

**Orphan DATA (dangling rows).** Rows whose FK column points at a parent `id` that no longer exists.
This is invisible to a schema parse — it needs the live table. So for **every real (enforced) FK**,
the script emits a **ready-to-run, READ-ONLY** anti-join:

```sql
-- campaignposts.companyid → companies.id : rows pointing at a missing company
SELECT COUNT(*) AS orphans
FROM campaignposts c
LEFT JOIN companies p ON p.id = c.companyid
WHERE c.companyid IS NOT NULL
  AND p.id IS NULL;
```

These are pure `SELECT COUNT(*)` — never a write, never a `DELETE`. They are emitted into the
artifact for a human to run by default. With **`--live`** the script runs them itself, but **only**
against a verified non-prod DB (MCP-UAT, or `TEST_DATABASE_URL`); the harness's prod-RDS guard still
applies and a target resolving to production is refused. Unenforced FKs (§1) are exactly the columns
most likely to have accumulated orphans, so the anti-join SQL is generated for **unenforced FK
candidates too** (best-effort — it infers the parent from the `*id` name), clearly labelled as
inferred rather than declared.

A non-zero orphan count is a data-integrity finding filed as feedback with the count and the SQL; it
is **never auto-remediated** — deleting dangling rows is a data decision for the owner.

### 4. Missing indexes

Postgres does **not** auto-create an index for a foreign-key column (it indexes the *referenced* PK,
not the referencing column). So every FK column that participates in joins and cascade deletes should
have its own covering index, and the script flags each one that doesn't:

- **every FK column with no covering index** — the primary target. `campaignposts` indexes
  `campaignid`, `status`, `scheduledat` but **not** `companyid`, so `companyid` is flagged.
- **common filter/sort columns** with no index — `status`, any `*at` timestamp used for ordering
  (`createdat`, `scheduledat`, `publishedat`), and `locale`. These are heuristic (the script can't see
  the queries) so they're flagged as *suggested*, lower-confidence than the FK-column flags.

Remediation is printed ready to paste, following the project's `idx_<table>_<col>` naming:

```sql
CREATE INDEX idx_campaignposts_companyid ON campaignposts(companyid);
```

Add these as a Drizzle `index(...)` in the table's third `pgTable` arg (so the migration is generated
the normal way), not as raw SQL — the artifact notes both forms.

### 5. Excessive / redundant indexes

The mirror of §4 — indexes that cost write throughput and storage without earning it:

| Flag | Condition | Remediation |
|---|---|---|
| **duplicate index** | two indexes over the **same column set** (same columns, same order) | drop one |
| **left-prefix redundant** | a single-column index `(a)` made redundant by a composite `(a, b)` — the composite already serves `a`-only lookups | drop the single-column index |
| **shadowed by unique** | a non-unique index on the same columns as a `uniqueIndex` — the unique one already provides the access path | drop the non-unique index |

```sql
DROP INDEX idx_campaignposts_status;   -- redundant: covered by idx_campaignposts_status_scheduledat (status left-prefix)
```

**Confirm before dropping.** A static parse proves an index is *structurally* redundant, not that it's
*unused*. Before dropping anything, check the live catalog — a shadowed index may still be the one the
planner picks. Verify `idx_scan = 0` in `pg_stat_user_indexes` on the non-prod DB (again read-only):

```sql
SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE relname = 'campaignposts'
ORDER BY idx_scan;
```

Only drop indexes that are both structurally redundant **and** show `idx_scan = 0` under representative
load. The DROP suggestions are advisory findings, never applied by the script.

---

## Filing the results

The analysis lands in wxKanban through the orchestrator, exactly like the test-plan artifacts:

- **The report** → `project_upsert_document` with **doctype `schemaanalysis`** (non-empty doctype is
  required). Body is the rendered `SCHEMA-ANALYSIS.md`; it carries the generated-output watermark if
  the project requires one.
- **Each material finding** → `project_submit_feedback`, one per unenforced FK, orphan table, non-zero
  orphan-data count, or convention violation worth acting on. The referential-integrity score and the
  aggregate index counts go in the document; individual defects go in feedback so they can be triaged.

Every filed finding references `file:line` so it's directly actionable, e.g.
`src/db/schema/campaignposts.ts:40 createdbyid — unenforced FK (no .references(); parent inferred: users)`.
Low-confidence heuristic flags (suggested indexes, inferred-parent orphan SQL) are filed as feedback
too but labelled *suggested* so triage can weigh them against the enforced findings.

---

## How to run

```
node _wxAI/skills/wxCreateTestPlan/scripts/schema-analyze.mjs \
  --root src/db/schema --out tests/testplans/<target>/schema-analysis.json \
  --md tests/testplans/<target>/SCHEMA-ANALYSIS.md [--live]
```

- `--root` — the Drizzle schema directory to parse (default `src/db/schema`).
- `--out` — machine-readable JSON (scores, per-table breakdowns, every finding with `file:line`).
- `--md` — the rendered human report (filed as doctype `schemaanalysis`).
- `--live` — **opt-in.** Runs the read-only orphan-data anti-joins against a **NON-PROD DB only**
  (a verified MCP-UAT connection, or `TEST_DATABASE_URL`); the prod-RDS guard still refuses a
  production target. **Without `--live`** the SQL is emitted into the report for a human to run — the
  schema-shape analysis (dimensions 1, 2, 4, 5, and orphan *tables*) needs no DB at all.

Nothing this script does writes to a database. `--live` issues only `SELECT COUNT(*)` anti-joins and
`pg_stat_user_indexes` reads; the DROP/CREATE/rename remediations are printed as suggestions for a
human to apply through the normal migration path.
