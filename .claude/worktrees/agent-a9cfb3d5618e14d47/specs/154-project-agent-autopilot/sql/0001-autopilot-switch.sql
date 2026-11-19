-- [SCOPE 154 / T001] BEGIN — Autopilot switch columns
-- SPEC-154 / FR-001, FR-008 (SCOPE-132 Amendment H) — the per-project Autopilot switch, plus the
-- field the server uses to tell an active unattended run from an idle agent.
--
-- APPLIED BY HAND by the owner (no migration ledger exists; nothing auto-applies DDL;
-- `drizzle-kit push` is PROHIBITED against this database — it is production).
-- APPLY THIS BEFORE the code that declares/uses these columns is pushed: adding a Drizzle
-- declaration ahead of the column existing 500's every query against the table (see
-- companyproject.ts's `audittype` note and projectagentconnections's own 0001 script for why
-- the order matters).
--
-- Safe to re-run (IF NOT EXISTS everywhere). Adds two columns only; changes nothing existing.
-- No GRANT needed: wxkanban_app already holds SELECT/INSERT/UPDATE on both tables.

BEGIN;

-- companyprojects.autopilotenabled (FR-001) — off by default. Settable only where
-- allowremote is already on, and only by the same roles that can change allowremote
-- (enforced in the API route, not the database). Turning allowremote off also turns this off
-- (enforced in the API route).
ALTER TABLE companyprojects
  ADD COLUMN IF NOT EXISTS autopilotenabled boolean NOT NULL DEFAULT false;

-- projectagentconnections.autopilotrunactive (FR-008) — nullable; distinguishes an active
-- unattended run from an idle agent connection, so the server can derive a missed-heartbeat
-- alert from this record alone, with no second table.
ALTER TABLE projectagentconnections
  ADD COLUMN IF NOT EXISTS autopilotrunactive boolean NULL;

COMMIT;

-- ---------------------------------------------------------------------------------------
-- VERIFICATION (read-only). Expected: both columns present with the types/defaults above.
-- Column-level, because db:drift is table-level only and would pass with columns missing.
-- ---------------------------------------------------------------------------------------
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('companyprojects', 'autopilotenabled'),
    ('projectagentconnections', 'autopilotrunactive')
  )
ORDER BY table_name, column_name;
-- [SCOPE 154 / T001] END
