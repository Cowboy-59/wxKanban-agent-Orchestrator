-- SPEC-112 / FR-001 — per-project compliance framework enablement
--
-- Additive only. `appid` (company-keyed) is retained so pre-cutover readers keep
-- working; new per-project rows carry `appid = projectid` to satisfy the existing
-- NOT NULL + UNIQUE constraint without colliding with company rows.
--
-- `companyprojects.audittype` is NOT dropped here. That is migration step 4 and
-- requires the reader cutover (SPEC-112 T005/T006/T007) to land first.
--
-- Hand-written rather than drizzle-kit generated: the snapshot at
-- src/db/migrations/meta/0009_snapshot.json tracks 83 tables against 98 schema
-- files and 127 live tables, so `drizzle-kit generate` opens an interactive
-- table-conflict prompt and would emit far more than this change.

BEGIN;

ALTER TABLE appauditconfiguration
  ADD COLUMN IF NOT EXISTS projectid uuid
  REFERENCES companyprojects(id) ON DELETE CASCADE;

ALTER TABLE appauditconfiguration
  ADD COLUMN IF NOT EXISTS nistssdfenabled boolean NOT NULL DEFAULT false;

ALTER TABLE appauditconfiguration
  ADD COLUMN IF NOT EXISTS iso27001enabled boolean NOT NULL DEFAULT false;

-- Partial unique: one config per project, while legacy company rows keep projectid null.
CREATE UNIQUE INDEX IF NOT EXISTS appauditconfiguration_projectid_unique
  ON appauditconfiguration (projectid)
  WHERE projectid IS NOT NULL;

COMMIT;
