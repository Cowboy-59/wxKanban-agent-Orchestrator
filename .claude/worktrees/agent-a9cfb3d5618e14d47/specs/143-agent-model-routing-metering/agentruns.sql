-- SPEC-143 / FR-002 — agentruns: one row per agent run or main-session command turn.
--
-- APPLIED BY HAND by the owner (no migration ledger exists; nothing auto-applies DDL).
-- APPLY THIS BEFORE the code that declares/uses it is pushed:
--   src/db/schema/agentrun.ts is NOT exported from src/db/schema/index.ts and
--   src/server/routes/agentRuns.ts is NOT mounted until this has run and the verification
--   query below returns the expected result. Declaring a table before it exists = prod 500s.
--
-- Safe to re-run (IF NOT EXISTS everywhere). Adds a table only; changes nothing existing.
-- No prompt text, code, file contents or customer data is stored: every column is an id,
-- a short label, a count, a flag or a timestamp.
-- The app generates the UUID v7 id (uuid package), so there is deliberately no DB default.
-- After applying, confirm the application's DB role can SELECT/INSERT/UPDATE on agentruns
-- (see PG privilege notes; a missing GRANT shows up as a permission error, not a missing table).

BEGIN;

CREATE TABLE IF NOT EXISTS agentruns (
  id                uuid PRIMARY KEY,
  projectid         uuid NOT NULL REFERENCES companyprojects(id) ON DELETE CASCADE,
  aispecsessionid   uuid NULL REFERENCES aispecsessions(id) ON DELETE SET NULL,
  taskid            uuid NULL REFERENCES projecttasks(id) ON DELETE SET NULL,
  command           varchar(100) NULL,
  kind              varchar(20)  NOT NULL,
  difficulty        varchar(20)  NULL,
  model             varchar(100) NOT NULL,
  provider          varchar(100) NOT NULL,
  route             varchar(20)  NOT NULL,
  inputtokens       integer NULL,
  outputtokens      integer NULL,
  cachereadtokens   integer NULL,
  cachewritetokens  integer NULL,
  activeseconds     integer NULL,
  waitingseconds    integer NULL,
  escalated         boolean NOT NULL DEFAULT false,
  comparisonid      uuid NULL,
  variant           varchar(20) NULL,
  firstpass         boolean NULL,
  neverbilled       boolean NOT NULL DEFAULT false,
  starttime        timestamp NOT NULL,
  endtime           timestamp NULL,
  createdat         timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_agentruns_kind       CHECK (kind IN ('session', 'subagent', 'command')),
  CONSTRAINT chk_agentruns_difficulty CHECK (difficulty IS NULL OR difficulty IN ('easy', 'moderate', 'heavy')),
  CONSTRAINT chk_agentruns_route      CHECK (route IN ('official', 'omniroute')),
  CONSTRAINT chk_agentruns_variant    CHECK (variant IS NULL OR variant IN ('current', 'candidate')),
  CONSTRAINT chk_agentruns_counts    CHECK (
    COALESCE(inputtokens, 0) >= 0 AND COALESCE(outputtokens, 0) >= 0
    AND COALESCE(cachereadtokens, 0) >= 0 AND COALESCE(cachewritetokens, 0) >= 0
    AND COALESCE(activeseconds, 0) >= 0 AND COALESCE(waitingseconds, 0) >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_agentruns_project_start ON agentruns (projectid, starttime);
CREATE INDEX IF NOT EXISTS idx_agentruns_aispecsession  ON agentruns (aispecsessionid)
  WHERE aispecsessionid IS NOT NULL;

COMMIT;

-- ---------------------------------------------------------------------------------------
-- VERIFICATION (read-only). Expected: table_exists = agentruns, columns = 24, checks = 5,
-- indexes = 3 (primary key + the two above).
-- Column-level, because db:drift is table-level only and would pass with columns missing.
-- ---------------------------------------------------------------------------------------
SELECT
  to_regclass('public.agentruns')::text AS table_exists,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agentruns'
      AND column_name IN ('id','projectid','aispecsessionid','taskid','command','kind','difficulty',
        'model','provider','route','inputtokens','outputtokens','cachereadtokens','cachewritetokens',
        'activeseconds','waitingseconds','escalated','comparisonid','variant','firstpass','neverbilled','starttime','endtime','createdat')
  ) AS columns,
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.agentruns'::regclass AND contype = 'c') AS checks,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'agentruns') AS indexes;
