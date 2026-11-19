# Spec 127 collision — repair plan

**Raised**: 2026-09-20 · **Status**: **EXECUTED 2026-09-20 — Option A** · **Severity**: one spec record, recoverable

---

## Correction to what I reported first

My initial account was wrong twice, and both corrections shrink the problem.

1. I said "spec numbers 126–129 were already taken." They were taken **in a different project**
   (`Hourglass2` — the `WIN_*` conversion specs from 2026-08-03). Spec numbers are scoped per
   project, so those are not a collision at all. In the wxKanban project, 126, 128 and 129 were
   genuinely free and are correctly mine.

2. I implied all four were damaged. Only **127** is.

## What actually happened

| Spec row | Project | Created | Tasks | State |
| --- | --- | --- | --- | --- |
| `c6678562` #126 | wxKanban | 2026-09-18 | 10 | **Correct** — new row, mine |
| `ac79dae6` #127 | wxKanban | **2026-08-22** | **29** | **DAMAGED** |
| `8f5f4a0e` #128 | wxKanban | 2026-09-18 | 8 | **Correct** — new row, mine |
| `359531c4` #129 | wxKanban | 2026-09-18 | 11 | **Correct** — new row, mine |

Row `ac79dae6` predates this session. It was **SCOPE-127 — Test Pipeline Stack Adapters**, pushed
on 2026-08-22 with 19 tasks. My `project.create_specs` call matched it on
`(projectId, specNumber)` and:

- **overwrote its title** to "Brand Document Capture and Ingest"
- **appended my 10 tasks**, leaving 19 + 10 = 29 under one record
- **reported success** — the call returned `specId`, `docs=3`, `tasks=10`, no warning

Two unrelated specs now share one record. Nothing was deleted: all 19 original tasks are intact,
all still `todo`, all still named `[127-Tnnn] …`.

## Why the number was taken

This is the `SCOPE-NNN` / `SPEC-NNN` namespace collision, in the one place it cannot be expressed.
`SCOPE-127` (test adapters) was pushed to the database as `specnumber = '127'`. My `SPEC-127`
(brand capture) is a different thing that also wants 127. The database has a single `specnumber`
column and cannot hold both.

I chose 126–129 by running `ls specs/`, which shows the filesystem only. SCOPE-127's spec exists in
the **database** and not as a `specs/127-*` folder, so the filesystem could never have revealed it.

## A kit defect worth recording separately

`project.create_specs` silently overwrote an existing spec's title and merged foreign tasks into
it, and reported success. There was no "this spec number already exists" warning and no indication
that an update path had been taken rather than an insert. That is the same failure family already
recorded on this codebase: an operation that looks like a create, behaves like an update, and says
nothing.

---

## Recommended repair — Option A

**Restore `ac79dae6` to SCOPE-127. Move my brand-capture spec to 130.**

Preferred because the adapter spec was there first, 126/128/129 are correct and should not be
churned, and the project's spec numbering is already non-contiguous by design.

### Step 1 — record the current state

Capture `ac79dae6`'s row and the id + name of all 29 tasks to a file before anything changes.
This is the rollback source.

### Step 2 — create the new spec row for brand capture

Insert `SPEC-130 — Brand Document Capture and Ingest` in the wxKanban project. 130 is the next
free number, confirmed against the database.

### Step 3 — move my 10 tasks to it

```sql
UPDATE projecttasks
   SET specid = :new130
 WHERE specid = 'ac79dae6-28e9-4ed2-a3bf-2ac0d199dada'
   AND createdat >= '2026-09-15';
```

The date predicate is the discriminator: my tasks were created 2026-09-18, the adapter tasks
2026-08-22. Verify it selects exactly 10 rows **before** running it.

### Step 4 — restore the adapter spec's title

```sql
UPDATE projectspecifications
   SET title = 'Test Pipeline Stack Adapters — Adapter Seam Across All Three Layers'
 WHERE id = 'ac79dae6-28e9-4ed2-a3bf-2ac0d199dada';
```

Title taken from that scope's own document, `specs/Project-Scope/127-test-pipeline-stack-adapters.md`.

### Step 5 — rename the folder and its references

`specs/127-brand-document-capture-ingest/` → `specs/130-brand-document-capture-ingest/`, and update
the spec number inside `spec.md`, `plan.md`, `tasks.md`, `tests.md`, `quickstart.md`,
`lifecycle.json` and `checklists/requirements.md`. Also the generator
(`scripts/gen-scope129-specs.mts`), the payload JSON, and the three sibling specs' quickstart
tables, which name 127 in their fan-out map.

The parent scope `specs/Project-Scope/129-executable-brand-schema.md` also names the fan-out as
126–129 and needs an amendment note.

### Step 6 — sync task status

All 39 of my tasks read `todo` in the database while `tasks.md` reads `done`. `implement` updates
the file and not the row. Set them `done` against the correct spec ids, after the move.

### Step 7 — verify

- `ac79dae6` has exactly 19 tasks, all named `[127-Tnnn]`, title restored
- the new 130 row has exactly 10 tasks, all named `T0nn — …`
- no wxKanban spec row shares a number with another wxKanban spec row
- `Hourglass2` rows are untouched — they were never part of this

## Option B — the alternative

Keep 127 as brand capture and move the 19 adapter tasks to a new row. **Not recommended:** it
rewards the later writer over the earlier one, and SCOPE-127's scope document, its commits and the
project's own notes all refer to it as 127.

## Option C — leave it

**Not recommended.** The record stays wrong, SCOPE-127's 19 tasks remain invisible under a
misleading title, and anyone opening spec 127 sees a spec that is half one thing and half another.

---

## Risk

Low, and lower than it looks.

- Every statement is an `UPDATE` of `specid` or `title`. **Nothing is deleted.**
- Task rows are only re-pointed, never recreated, so history and ids survive.
- The discriminator is a creation date with a four-week gap, not a guess.
- Fully reversible from the Step 1 snapshot.

**The privilege constraint applies.** `DATABASE_URL` names `wxkanban_app`, which owns nothing.
These are DML rather than DDL, so they may succeed where the migration did not — that must be
confirmed rather than assumed, and a dry-run `SELECT` of each `WHERE` clause should be run first.

## Decisions needed

1. **Option A, B or C?** I recommend A.
2. **Are SCOPE-127's 19 adapter tasks still wanted?** They are all `todo` and the seam is recorded
   as not built. If that work is abandoned, the repair is simpler — restore the title and leave the
   tasks where they are, or close them.
3. **Should I execute, or produce the SQL for you to run?** The same question as the migration, and
   the same answer may apply.

---

## Outcome — executed 2026-09-20

Option A, in two verified transactions. Each verified its own result **before** committing and
would have rolled back whole on any mismatch. A rehearsal run (rollback-only) preceded each.

| Check | Result |
| --- | --- |
| `ac79dae6` #127 title and content restored | SCOPE-127 adapter spec |
| Tasks remaining on #127 | **19**, all `[127-Tnnn]`, untouched |
| New spec row #130 | `01a0bf87-9937-71d6-9f4a-fb1402e28858` |
| Brand-capture tasks moved to #130 | **10**, ids preserved |
| Duplicate spec numbers in wxKanban | **0** |
| Task status synced from files | **39 rows** set done; 0 left unsynced |

`content` had been overwritten as well as the title — a detail the plan did not anticipate. The
scope document on disk was the recovery source for it.

Files: `specs/127-brand-document-capture-ingest/` became `specs/130-…`, with the number corrected
inside all seven files, in the three sibling quickstart tables, and in the generator. The folder
could not be renamed with `mv` because Vite was running and holds directory handles on Windows;
copy-then-remove worked without disturbing the running app.

Rollback source: `docs/spec127-repair-snapshot.json` — the full pre-repair row plus all 29 task
rows.

## The lesson, for the next spec number

`ls specs/` is not sufficient. SCOPE-127's spec existed in the **database** with no folder on
disk, so the filesystem could not have revealed it. Take the next free number from the database,
scoped to the project:

```sql
SELECT MAX(specnumber::int) + 1
  FROM projectspecifications
 WHERE projectid = :project AND specnumber ~ '^[0-9]+$';
```

Note also that spec numbers are per-project: the `WIN_*` specs at 126–130 belong to `Hourglass2`
and were never a collision at all.
