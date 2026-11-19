-- [SCOPE 143 / T027] BEGIN — idx_projecttimeentries_agentpull keyed by company too (SPEC-005 Amendment E; SPEC-143 FR-014, FR-017)
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` against this database (SCOPE-117).
-- Use the owner connection; the local `wxkanban_app` credential cannot alter the table
-- (H-9 least privilege) and the apply rolls back cleanly if tried with it.
-- ============================================================================
--
-- WHAT THIS IS FOR
--
-- The agent-run pull now runs per billing company (agentruns.companyid, migration 0075), and an
-- engaged client project is pulled for the consultant as well as for the client's own runs. The
-- old unique key (project, line, scope, day, model) has no company, so the two companies' pulls
-- for the same project, day and model would land on ONE row and overwrite each other's hours.
-- The key gains companyid; each company keeps its own Resource entry.
--
-- SAFETY
--
-- The new key is the old key plus one column, so every set of rows unique before is still
-- unique: the CREATE cannot fail on existing data. The index is rebuilt inside one transaction
-- (the table is briefly locked against writes; it is small). Re-running it is a no-op.
--
-- ORDER: apply and verify this BEFORE the app version whose pull names companyid in its
-- ON CONFLICT target is deployed — until then every pull fails with 42P10 (no matching index).
--
-- VERIFY (read-only):
--   SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_projecttimeentries_agentpull';
--   -- expect: CREATE UNIQUE INDEX idx_projecttimeentries_agentpull ON public.projecttimeentries USING btree
--   --         (companyid, projectid, line, COALESCE(specid, '00000000-0000-0000-0000-000000000000'::uuid), workdate, model)
--   --         WHERE ((source)::text = 'agentrun'::text)

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_projecttimeentries_agentpull'
       AND indexdef LIKE '%(companyid, projectid,%'
  ) THEN
    DROP INDEX IF EXISTS "idx_projecttimeentries_agentpull";
    CREATE UNIQUE INDEX "idx_projecttimeentries_agentpull"
      ON "projecttimeentries" (
        "companyid",
        "projectid",
        "line",
        COALESCE("specid", '00000000-0000-0000-0000-000000000000'::uuid),
        "workdate",
        "model"
      )
      WHERE "source" = 'agentrun';
  END IF;
END
$$;

COMMIT;
-- [SCOPE 143 / T027] END
