-- SCOPE-124 Amendment C / T026 (FR-011 step 1) — document kind and retire columns.
-- Apply by hand (owner). Additive only: four nullable columns, no default, no rewrite of the
-- 16,153 existing rows, no index. Nothing declares these columns until T027 — declaring first
-- makes drizzle SELECT a column that does not exist and 500s every projectdocuments read.
--
-- Step 2 (the unique live-document index, T032) is NOT here: it runs only after the T031
-- cleanup reports zero live duplicate groups, or it fails on today's duplicates.

BEGIN;

ALTER TABLE projectdocuments
  ADD COLUMN IF NOT EXISTS kind          varchar(50),   -- spec | plan | tests | tasks | lifecycle ... from the file name (FR-010)
  ADD COLUMN IF NOT EXISTS retiredat     timestamptz,   -- NULL = live (FR-013)
  ADD COLUMN IF NOT EXISTS retiredbyid   uuid REFERENCES userprofiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retiredreason text;

COMMIT;

-- ── Verification (read-only) ────────────────────────────────────────────────────────────────
-- 1. The four columns exist with the right types (expect 4 rows):
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'projectdocuments'
  AND column_name IN ('kind', 'retiredat', 'retiredbyid', 'retiredreason')
ORDER BY column_name;
--    kind           character varying         YES
--    retiredat      timestamp with time zone  YES
--    retiredbyid    uuid                      YES
--    retiredreason  text                      YES

-- 2. The foreign key exists (expect 1 row, ON DELETE SET NULL):
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'projectdocuments'::regclass AND contype = 'f'
  AND pg_get_constraintdef(oid) LIKE '%retiredbyid%';

-- 3. Existing rows are untouched (expect total = 16153 or more, retired = 0, kinded = 0):
SELECT count(*) AS total,
       count(retiredat) AS retired,
       count(kind) AS kinded
FROM projectdocuments;

-- 4. The application role can read and write the new columns (expect SELECT and UPDATE for
--    each of the four columns for wxkanban_app):
SELECT column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_name = 'projectdocuments'
  AND grantee = 'wxkanban_app'
  AND column_name IN ('kind', 'retiredat', 'retiredbyid', 'retiredreason')
ORDER BY column_name, privilege_type;

-- Then: npm run db:drift (table-level, expect exit 0) — and record the results in
-- specs/117-production-schema-integrity/schema-change-log.md under the 2026-10-25 entry.
