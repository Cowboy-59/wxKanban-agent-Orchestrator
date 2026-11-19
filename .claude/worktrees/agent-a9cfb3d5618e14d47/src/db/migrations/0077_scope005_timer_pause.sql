-- [SCOPE 005 / T028] BEGIN — timer Pause/Resume: projecttimeentries.pausedat and pausedseconds (SPEC-005 Amendment F, FR-006)
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` against this database (SCOPE-117).
-- Use the owner connection; the local `wxkanban_app` credential cannot alter the table
-- (H-9 least privilege) and the apply rolls back cleanly if tried with it.
-- ============================================================================
--
-- WHAT THIS IS FOR
--
-- The Time & Billing timer card gets Pause and Resume. A pause holds the clock and Resume continues
-- the SAME entry, so the entry is rounded up to 15 minutes once, at Stop, on its active time only.
--   pausedat      when the running timer was paused; NULL while it runs (and on every stopped entry)
--   pausedseconds total seconds this entry spent paused; 0 for every existing row
--
-- SAFETY
--
-- Both columns are additive. pausedseconds has a constant DEFAULT, so PostgreSQL 11+ adds it without
-- rewriting the table, and every existing row reads 0. Nothing is dropped or renamed. Re-running it is
-- a no-op (IF NOT EXISTS, and the CHECK is added only when missing).
--
-- ORDER: apply and verify this BEFORE the app version that declares the two columns (SPEC-005 T029) is
-- deployed — Drizzle selects every declared column, so declaring them first returns 500s on every
-- Time & Billing read.
--
-- VERIFY (read-only):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'projecttimeentries'
--      AND column_name IN ('pausedat', 'pausedseconds') ORDER BY column_name;
--   -- expect: pausedat      | timestamp without time zone | YES | NULL
--   --         pausedseconds | integer                     | NO  | 0
--   SELECT pg_get_constraintdef(oid), convalidated FROM pg_constraint
--    WHERE conname = 'chk_projecttimeentries_pausedseconds';
--   -- expect: CHECK ((pausedseconds >= 0)) | true

BEGIN;

ALTER TABLE "projecttimeentries" ADD COLUMN IF NOT EXISTS "pausedat" timestamp NULL;
ALTER TABLE "projecttimeentries" ADD COLUMN IF NOT EXISTS "pausedseconds" integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projecttimeentries_pausedseconds') THEN
    ALTER TABLE "projecttimeentries"
      ADD CONSTRAINT "chk_projecttimeentries_pausedseconds" CHECK ("pausedseconds" >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN "projecttimeentries"."pausedat" IS 'Timer paused at (SPEC-005 FR-006 Amendment F); NULL while running and on stopped entries';
COMMENT ON COLUMN "projecttimeentries"."pausedseconds" IS 'Total seconds the timer entry spent paused; excluded from its duration';

COMMIT;
-- [SCOPE 005 / T028] END
