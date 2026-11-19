-- [SCOPE 005 / T026] BEGIN — projecttimeentries.line accepts dba, management and meeting (SCOPE-005 Amendment D; FR-003)
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` against this database (SCOPE-117).
-- Use the owner connection; the local `wxkanban_app` credential cannot alter the table
-- (H-9 least privilege) and the apply rolls back cleanly if tried with it.
-- ============================================================================
--
-- WHAT THIS IS FOR
--
-- Time & Billing gains three project lines beside Brainstorming: DBA, Management and
-- Meetings. They take Developer (people) time only. The application writes them as
-- line = 'dba' | 'management' | 'meeting' (all fit varchar(12)).
--
-- SAFETY
--
-- Widens one CHECK: every value it allowed before is still allowed, so every existing row
-- passes and nothing is rewritten. One transaction; re-running it is a no-op.
--
-- ORDER: apply and verify this BEFORE the app version that writes the new lines is deployed —
-- until then, starting a timer on DBA / Management / Meetings would fail with 23514.
--
-- VERIFY (read-only):
--   SELECT pg_get_constraintdef(oid), convalidated FROM pg_constraint
--    WHERE conname = 'projecttimeentries_line_check';
--   -- expect: CHECK (line IS NULL OR line IN ('scope','brainstorm','process','dba','management','meeting')), true

BEGIN;

ALTER TABLE "projecttimeentries" DROP CONSTRAINT IF EXISTS "projecttimeentries_line_check";
ALTER TABLE "projecttimeentries" ADD CONSTRAINT "projecttimeentries_line_check"
  CHECK ("line" IS NULL OR "line" IN ('scope', 'brainstorm', 'process', 'dba', 'management', 'meeting'));

COMMENT ON COLUMN "projecttimeentries"."line" IS
  'SPEC-005 FR-003: scope (specid set) | brainstorm | process | dba | management | meeting.';

COMMIT;
-- [SCOPE 005 / T026] END
