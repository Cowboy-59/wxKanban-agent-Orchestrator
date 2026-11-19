-- [SCOPE 143 / T023] BEGIN — agentruns.companyid (who bills the run) and route narrowed to official (SCOPE-143 Amendment A; FR-002, FR-017)
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` against this database (SCOPE-117).
-- Use the owner connection; the local `wxkanban_app` credential cannot alter the table
-- (H-9 least privilege) and the apply rolls back cleanly if tried with it.
-- ============================================================================
--
-- WHAT THIS IS FOR
--
-- Every AI agent run is billed to the company that ran it (D2). A consultant's run on an
-- engaged client project belongs to the consultant's company, not the project's owner, so
-- the project alone cannot say who bills it. The server sets companyid from the token that
-- sent the run and never trusts a value in the record (FR-017).
--
-- OmniRoute is removed (D1): every run goes through the official client, so the route CHECK
-- accepts 'official' only.
--
-- SAFETY
--
-- agentruns holds 0 rows today, so companyid is added NOT NULL with no backfill. The script
-- REFUSES (and rolls back) if the column is still missing while the table holds any row, or if
-- any row has a route other than 'official'. Nothing existing is rewritten.
-- One transaction; re-running it after a successful apply is a no-op.
--
-- ORDER (DROP/ADD rule): apply and verify this BEFORE the app version that declares
-- agentruns.companyid (SPEC-143 T024) is deployed. Drizzle selects every declared column, so
-- declaring it first returns 500s on every agentruns read.
--
-- VERIFY (read-only), expected values in the comments:
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'agentruns' AND column_name = 'companyid';
--   -- expect: companyid | uuid | NO
--   SELECT conname, pg_get_constraintdef(oid), convalidated FROM pg_constraint
--    WHERE conrelid = 'public.agentruns'::regclass
--      AND conname IN ('fk_agentruns_company', 'chk_agentruns_route');
--   -- expect: fk_agentruns_company | FOREIGN KEY (companyid) REFERENCES companies(id) ON DELETE CASCADE | true
--   --         chk_agentruns_route  | CHECK (((route)::text = 'official'::text))                    | true
--   SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_agentruns_company_start';
--   -- expect: CREATE INDEX idx_agentruns_company_start ON public.agentruns USING btree (companyid, starttime)
--   SELECT has_table_privilege('wxkanban_app', 'public.agentruns', 'SELECT,INSERT,UPDATE');
--   -- expect: true
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'agentruns';
--   -- expect: 25 (the 24 of agentruns.sql plus companyid)

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'agentruns' AND column_name = 'companyid'
  ) AND EXISTS (SELECT 1 FROM "agentruns") THEN
    RAISE EXCEPTION 'agentruns holds rows; companyid cannot be added NOT NULL without a backfill. Nothing applied.';
  END IF;
  IF EXISTS (SELECT 1 FROM "agentruns" WHERE "route" <> 'official') THEN
    RAISE EXCEPTION 'agentruns holds rows with a route other than official; chk_agentruns_route cannot be narrowed. Nothing applied.';
  END IF;
END
$$;

ALTER TABLE "agentruns" ADD COLUMN IF NOT EXISTS "companyid" uuid NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.agentruns'::regclass AND conname = 'fk_agentruns_company'
  ) THEN
    ALTER TABLE "agentruns" ADD CONSTRAINT "fk_agentruns_company"
      FOREIGN KEY ("companyid") REFERENCES "companies"("id") ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "idx_agentruns_company_start" ON "agentruns" ("companyid", "starttime");

ALTER TABLE "agentruns" DROP CONSTRAINT IF EXISTS "chk_agentruns_route";
ALTER TABLE "agentruns" ADD CONSTRAINT "chk_agentruns_route" CHECK ("route" = 'official');

COMMENT ON COLUMN "agentruns"."companyid" IS
  'SPEC-143 FR-017: the company that bills the run, set by the server from the sending token; never taken from the record.';
COMMENT ON COLUMN "agentruns"."route" IS
  'SPEC-143 FR-002: always official (OmniRoute removed, Amendment A / D1).';

-- The application role reads, inserts and updates runs, as agentruns.sql requires (table-level
-- grants already cover the new column; re-granted so the apply leaves the privilege explicit).
-- No DELETE: the app never deletes a run; the companies/projects FK cascades run as the owner.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wxkanban_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "agentruns" TO wxkanban_app;
  END IF;
END
$$;

COMMIT;
-- [SCOPE 143 / T023] END
