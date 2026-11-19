-- [SCOPE 117 / drift] BEGIN — restore projecttimeentries.phaseid (+ its declared FK)
--
-- ⚠️ PART 1 WAS FILED AFTER APPLICATION. The operator applied the ADD COLUMN by hand
-- on 2026-08-02 before any migration file existed; that half is recorded here after
-- the fact rather than back-dated, because the schema-change-log's purpose is
-- defeated by a tidy fiction. Verified present in production (uuid, nullable).
--
-- ⚠️ PART 2 IS NOT YET APPLIED. The declared FOREIGN KEY was NOT part of what was run.
-- Until it is, the column exists but the referential integrity the schema declares
-- does not — drift in the opposite direction.
--
-- WHY THIS EXISTS: `phaseid` was declared in src/db/schema/projecttimeentry.ts but
-- absent from the deployed table — the same declared-but-not-deployed class as the six
-- tables SCOPE-117 reconciled on 2026-07-31, missed because that pass compared TABLES
-- and this gap was a COLUMN.
--
-- Impact while missing: drizzle projects every DECLARED column, so bare
-- `db.select().from(projecttimeentries)` — the dominant read pattern in this codebase —
-- failed with 42703, while partial selects naming only the columns they need kept
-- working. Not an outage but something harder to diagnose: intermittent and
-- endpoint-specific. A candidate cause of the unexplained ~9 daily 500-bursts.
--
-- Found by wxDBAnalyze (`schema.missing-column`, critical). Worth recording that
-- `npm run db:drift` and `auditfences --schema` did NOT and structurally COULD NOT find
-- it — both compare tables only. See the change-log entry for 2026-08-02.
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` against this database (SCOPE-117).
--
-- No deploy coordination is needed for either part. Unlike migration 0061, the code
-- side shipped long ago and PRODUCTION was the broken side, so applying this DDL
-- strictly repairs live reads.
--
-- Verify (do NOT rely on db:drift — it is table-level and passes regardless):
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='projecttimeentries'
--      and column_name='phaseid';
--
--   select conname, convalidated from pg_constraint
--    where conname = 'projecttimeentries_phaseid_projectphases_id_fk';
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART 1 — the column. ALREADY APPLIED 2026-08-02. Idempotent; re-running is a no-op.
-- ---------------------------------------------------------------------------
ALTER TABLE "projecttimeentries"
  ADD COLUMN IF NOT EXISTS "phaseid" uuid;

-- ---------------------------------------------------------------------------
-- PART 2 — the declared foreign key. NOT YET APPLIED.
--
-- projecttimeentry.ts declares:
--     phaseid: uuid("phaseid").references(() => projectphases.id, { onDelete: "set null" })
-- so the column alone does not satisfy the declaration. Name matches drizzle's
-- convention, as used by the sibling FK on this same table in migration 0006
-- (`projecttimeentries_aispecsessionid_aispecsessions_id_fk`).
--
-- Added NOT VALID first, then validated as a separate statement. NOT VALID takes only
-- a brief SHARE ROW EXCLUSIVE lock and does not scan; VALIDATE takes the weaker SHARE
-- UPDATE EXCLUSIVE and does not block reads or writes. Validation cannot fail here —
-- every phaseid is NULL, since the column was created moments ago and nothing writes
-- it yet — but the two-step form keeps the lock short regardless of table size, which
-- a single ADD CONSTRAINT would not.
--
-- Wrapped in DO blocks because Postgres has no ADD CONSTRAINT IF NOT EXISTS, and this
-- file claims to be safe to re-run.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'projecttimeentries_phaseid_projectphases_id_fk'
  ) THEN
    ALTER TABLE "projecttimeentries"
      ADD CONSTRAINT "projecttimeentries_phaseid_projectphases_id_fk"
      FOREIGN KEY ("phaseid") REFERENCES "public"."projectphases"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'projecttimeentries_phaseid_projectphases_id_fk'
       AND NOT convalidated
  ) THEN
    ALTER TABLE "projecttimeentries"
      VALIDATE CONSTRAINT "projecttimeentries_phaseid_projectphases_id_fk";
  END IF;
END $$;

-- [SCOPE 117 / drift] END
