-- [SCOPE 005 / T022] BEGIN — projectbillings: a consulting company's billing settings for an engaged client project (SCOPE-005 Amendment B; FR-014)
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` against this database (SCOPE-117).
-- Use the owner connection; the local `wxkanban_app` credential cannot create tables
-- (H-9 least privilege) and the apply rolls back cleanly if tried with it.
-- ============================================================================
--
-- WHAT THIS IS FOR
--
-- A consulting company bills its own projects through companyprojects.billed / hourlyrate /
-- resourcerate (0072). A CLIENT company's project, reached through an engagement (SCOPE-037),
-- belongs to the client: the consultant must never write to that row, and the client must
-- never see the consultant's billing state. This table holds the consultant's side instead —
-- one row per (billing company, project): the "Bill this project" flag, the Customer the
-- statement goes to, and the rate overrides.
--
-- The application only creates a row while an engagement between the two companies is not
-- ended and has a live assignment on the project; a CHECK cannot see other tables, so that
-- rule, and "customerid belongs to companyid", are enforced in the app and covered by the
-- cross-tenant isolation test (T024).
--
-- SAFETY
--
-- New table only: nothing existing is altered, no data is moved. One transaction,
-- idempotent (IF NOT EXISTS / guarded), so re-running is a no-op.
--
-- ORDER: apply and verify this BEFORE the table is declared in src/db/schema/.
--
-- VERIFY (db:drift is table-level; also run the column check):
--
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='projectbillings'
--    order by ordinal_position;
--   -- expect 10 columns: id, companyid, projectid, customerid, billed, hourlyrate,
--   --   resourcerate, updatedbyid, createdat, updatedat
--
--   select indexname from pg_indexes
--    where schemaname='public' and tablename='projectbillings';
--   -- expect projectbillings_pkey, projectbillings_company_project_key, projectbillings_projectid_idx
--
--   select has_table_privilege('wxkanban_app', 'public.projectbillings', 'SELECT,INSERT,UPDATE,DELETE');
--   -- expect t
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "projectbillings" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- the app writes UUID v7
  "companyid"    uuid NOT NULL REFERENCES "companies"("id")       ON DELETE CASCADE,  -- the BILLING (consulting) company
  "projectid"    uuid NOT NULL REFERENCES "companyprojects"("id") ON DELETE CASCADE,  -- the client's project
  "customerid"   uuid          REFERENCES "customers"("id")       ON DELETE SET NULL, -- a Customer of companyid
  "billed"       boolean NOT NULL DEFAULT false,
  "hourlyrate"   numeric(10,2),  -- Developer rate override; NULL = the billing company's default
  "resourcerate" numeric(10,2),  -- Resource rate override; NULL = the billing company's default
  "updatedbyid"  uuid          REFERENCES "userprofiles"("id")    ON DELETE SET NULL,
  "createdat"    timestamp with time zone NOT NULL DEFAULT now(),
  "updatedat"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "projectbillings_hourlyrate_check"
    CHECK ("hourlyrate" IS NULL OR ("hourlyrate" >= 0 AND "hourlyrate" <= 10000.00)),
  CONSTRAINT "projectbillings_resourcerate_check"
    CHECK ("resourcerate" IS NULL OR ("resourcerate" >= 0 AND "resourcerate" <= 10000.00))
);

-- One billing row per company per project.
CREATE UNIQUE INDEX IF NOT EXISTS "projectbillings_company_project_key"
  ON "projectbillings" ("companyid", "projectid");

-- FK lookups and ON DELETE CASCADE from companyprojects.
CREATE INDEX IF NOT EXISTS "projectbillings_projectid_idx"
  ON "projectbillings" ("projectid");

COMMENT ON TABLE "projectbillings" IS
  'SPEC-005 FR-014: a consulting company''s billing settings for a client project it is engaged on. Never read by the client company; the client''s companyprojects row is never written by the consultant.';
COMMENT ON COLUMN "projectbillings"."companyid" IS
  'SPEC-005 FR-014: the company that bills (the consultant), not the project''s owner.';
COMMENT ON COLUMN "projectbillings"."customerid" IS
  'SPEC-005 FR-014: the statement''s Customer, a customers row of companyid. Pre-filled from customers.clientcompanyid.';

-- The application role reads and writes it like every other app table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wxkanban_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "projectbillings" TO wxkanban_app;
  END IF;
END
$$;

COMMIT;

-- [SCOPE 005 / T022] END
