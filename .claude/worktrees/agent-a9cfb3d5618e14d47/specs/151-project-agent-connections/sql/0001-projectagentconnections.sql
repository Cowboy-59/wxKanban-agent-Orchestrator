-- SPEC-151 / FR-058 (SCOPE-132 Amendment D) — projectagentconnections: one row per project agent
-- connection, from start to stop. Tells KAIN which project agents are connected now, from which
-- machine and repo, and what each is doing.
--
-- APPLIED BY HAND by the owner (no migration ledger exists; nothing auto-applies DDL).
-- APPLY THIS BEFORE the code that declares/uses it is pushed: src/db/schema/index.ts exports
-- projectagentconnection.ts, and the project-agent routes and the MCP tool read and write it.
-- Declaring a table before it exists = prod 500s.
--
-- Safe to re-run (IF NOT EXISTS everywhere). Adds a table only; changes nothing existing.
-- No secret, no token and no full path is stored: `repo` is the folder name only.
-- The app generates the UUID v7 id (uuid package), so there is deliberately no DB default.

BEGIN;

CREATE TABLE IF NOT EXISTS projectagentconnections (
  id              uuid PRIMARY KEY,
  projectid       uuid NOT NULL REFERENCES companyprojects(id) ON DELETE CASCADE,
  conversationid  varchar(255) NULL,
  agenttag        varchar(100) NOT NULL,
  machine         varchar(255) NOT NULL,
  repo            varchar(255) NOT NULL,
  kitversion      varchar(50)  NULL,
  state           varchar(20)  NOT NULL DEFAULT 'idle',
  connectedat     timestamptz  NOT NULL DEFAULT now(),
  lastseenat      timestamptz  NOT NULL DEFAULT now(),
  disconnectedat  timestamptz  NULL,
  endreason       varchar(20)  NULL,
  CONSTRAINT chk_projectagentconnections_state     CHECK (state IN ('idle', 'working', 'waiting')),
  CONSTRAINT chk_projectagentconnections_endreason CHECK (endreason IS NULL OR endreason IN ('stopped', 'stale', 'replaced')),
  CONSTRAINT chk_projectagentconnections_closed    CHECK ((disconnectedat IS NULL) = (endreason IS NULL))
);

-- One open connection per project (FR-059): a second machine is refused, never stacked.
CREATE UNIQUE INDEX IF NOT EXISTS projectagentconnections_projectid_open_key
  ON projectagentconnections (projectid) WHERE disconnectedat IS NULL;
-- History reads ("who was connected, and when") by project, newest first.
CREATE INDEX IF NOT EXISTS idx_projectagentconnections_project_connected
  ON projectagentconnections (projectid, connectedat DESC);

-- The app role writes and reads it; nothing deletes rows except the project cascade.
GRANT SELECT, INSERT, UPDATE ON projectagentconnections TO wxkanban_app;

COMMIT;

-- ---------------------------------------------------------------------------------------
-- VERIFICATION (read-only). Expected: table_exists = projectagentconnections, columns = 12,
-- checks = 3, indexes = 3 (primary key + the two above), app_privileges = INSERT,SELECT,UPDATE.
-- Column-level, because db:drift is table-level only and would pass with columns missing.
-- ---------------------------------------------------------------------------------------
SELECT
  to_regclass('public.projectagentconnections')::text AS table_exists,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projectagentconnections'
      AND column_name IN ('id','projectid','conversationid','agenttag','machine','repo','kitversion',
        'state','connectedat','lastseenat','disconnectedat','endreason')
  ) AS columns,
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.projectagentconnections'::regclass AND contype = 'c') AS checks,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'projectagentconnections') AS indexes,
  (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants
    WHERE table_name = 'projectagentconnections' AND grantee = 'wxkanban_app') AS app_privileges;
