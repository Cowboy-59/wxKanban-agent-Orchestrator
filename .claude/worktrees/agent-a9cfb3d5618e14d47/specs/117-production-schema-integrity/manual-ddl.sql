-- SCOPE 117 / FR-001 — Manual DDL
--
-- All schema changes for this scope are applied MANUALLY by the operator.
-- This file is the reviewed statement set. It is additive except for one
-- RENAME, and drops nothing.
--
-- BEFORE RUNNING
--   1. Confirm the connection target. The repo .env DATABASE_URL points at
--      PRODUCTION. Know which database you are attached to.
--   2. Capture the baseline:
--        select count(*) from information_schema.tables where table_schema='public';  -- expect 125
--        select count(*) from marketingcontacts;                                      -- expect 1006
--        select count(*) from capabilityindex;                                        -- expect 4002
--   3. Run inside a transaction so a mid-way failure rolls back cleanly.
--
-- AFTER RUNNING
--        select count(*) from information_schema.tables where table_schema='public';  -- expect 131
--        select count(*) from marketingcontacts;                                      -- expect 1006 (unchanged)
--        select count(*) from capabilityindex;                                        -- expect 4002 (unchanged)
--
-- Do NOT run `drizzle-kit push` against this database at any point: it
-- reconciles to the declared schema and would propose dropping the 27 orphan
-- tables, including marketingcontacts.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Rename the one git-command table that already exists (3 rows).
--    Its two siblings do not exist yet and are created below with the
--    convention-compliant names. Index names are intentionally left alone —
--    they are internal identifiers, and renaming them adds manual work
--    without changing behaviour.
-- ---------------------------------------------------------------------------
ALTER TABLE git_command_sessions RENAME TO gitcommandsessions;

-- ---------------------------------------------------------------------------
-- 2. complianceflags — the table behind the 2026-07-30 Consultant Hub 500s.
--    This is the only one of the six that a live route currently queries.
-- ---------------------------------------------------------------------------
CREATE TABLE complianceflags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taskid        uuid NOT NULL REFERENCES projecttasks(id) ON DELETE CASCADE,
  ruletype      varchar(50) NOT NULL,
  triggeredbyid uuid REFERENCES userprofiles(id) ON DELETE SET NULL,
  flaggedat     timestamp NOT NULL DEFAULT now(),
  resolvedat    timestamp
);
CREATE INDEX idx_complianceflags_taskid     ON complianceflags (taskid);
CREATE INDEX idx_complianceflags_ruletype   ON complianceflags (ruletype);
CREATE INDEX idx_complianceflags_resolvedat ON complianceflags (resolvedat);

-- ---------------------------------------------------------------------------
-- 3. gitcommandlogs
-- ---------------------------------------------------------------------------
CREATE TABLE gitcommandlogs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command           varchar(100) NOT NULL,
  subcommand        varchar(100),
  args              text[],
  working_directory text NOT NULL,
  user_id           uuid,
  username          varchar(255),
  branch            varchar(255),
  commit_hash       varchar(40),
  status            varchar(20) NOT NULL DEFAULT 'pending',
  exit_code         integer,
  start_time        timestamptz NOT NULL DEFAULT now(),
  end_time          timestamptz,
  duration_ms       integer,
  remote_url        text,
  repository_name   varchar(255),
  session_id        varchar(255),
  parent_command_id uuid,
  error_message     text,
  error_stack       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_git_command_logs_user_id    ON gitcommandlogs (user_id);
CREATE INDEX idx_git_command_logs_status     ON gitcommandlogs (status);
CREATE INDEX idx_git_command_logs_start_time ON gitcommandlogs (start_time);
CREATE INDEX idx_git_command_logs_command    ON gitcommandlogs (command);
CREATE INDEX idx_git_command_logs_session    ON gitcommandlogs (session_id);
CREATE INDEX idx_git_command_logs_branch     ON gitcommandlogs (branch);
CREATE INDEX idx_git_command_logs_user_time  ON gitcommandlogs (user_id, start_time);

-- ---------------------------------------------------------------------------
-- 4. gitcommandstats
-- ---------------------------------------------------------------------------
CREATE TABLE gitcommandstats (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command               varchar(100) NOT NULL,
  subcommand            varchar(100),
  repository_name       varchar(255),
  total_executions      integer NOT NULL DEFAULT 0,
  successful_executions integer NOT NULL DEFAULT 0,
  failed_executions     integer NOT NULL DEFAULT 0,
  avg_duration_ms       integer,
  min_duration_ms       integer,
  max_duration_ms       integer,
  period_start          timestamptz NOT NULL,
  period_end            timestamptz NOT NULL,
  period_type           varchar(20) NOT NULL,
  last_updated          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_git_command_stats
    UNIQUE (command, subcommand, repository_name, period_type, period_start)
);
CREATE INDEX idx_git_command_stats_period  ON gitcommandstats (period_type, period_start);
CREATE INDEX idx_git_command_stats_command ON gitcommandstats (command);

-- ---------------------------------------------------------------------------
-- 5. mcpdriftevents
-- ---------------------------------------------------------------------------
CREATE TABLE mcpdriftevents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projectid         uuid NOT NULL REFERENCES companyprojects(id) ON DELETE CASCADE,
  projectidentifier varchar(255) NOT NULL,
  mcpversionmain    varchar(50) NOT NULL,
  mcpversionkit     varchar(50) NOT NULL,
  changedpaths      jsonb NOT NULL DEFAULT '[]'::jsonb,
  severity          varchar(20) NOT NULL,
  githubfeedbackref varchar(500),
  resolvedstatus    varchar(20) NOT NULL DEFAULT 'open',
  resolvedat        timestamptz,
  createdat         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. mcpparityconfig
-- ---------------------------------------------------------------------------
CREATE TABLE mcpparityconfig (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gatemode             varchar(20) NOT NULL DEFAULT 'advisory',
  advisorystartedat    timestamptz,
  mandatoryactivatedat timestamptz,
  rollbackat           timestamptz,
  rollbackby           uuid REFERENCES userprofiles(id) ON DELETE SET NULL,
  createdat            timestamptz NOT NULL DEFAULT now(),
  updatedat            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. mcpupdateadoptions
-- ---------------------------------------------------------------------------
CREATE TABLE mcpupdateadoptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projectid         uuid NOT NULL REFERENCES companyprojects(id) ON DELETE CASCADE,
  mcpversion        varchar(50) NOT NULL,
  decisionstate     varchar(20) NOT NULL DEFAULT 'pending',
  decidedat         timestamptz,
  maintenancewindow jsonb,
  nextreminderat    timestamptz,
  deferralcount     integer NOT NULL DEFAULT 0,
  createdat         timestamptz NOT NULL DEFAULT now(),
  updatedat         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mcpupdateadoptions_projectid_mcpversion_key UNIQUE (projectid, mcpversion)
);

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (run after COMMIT)
-- ---------------------------------------------------------------------------
-- select table_name from information_schema.tables
--  where table_schema='public'
--    and table_name in ('complianceflags','gitcommandlogs','gitcommandstats',
--                       'gitcommandsessions','mcpdriftevents','mcpparityconfig',
--                       'mcpupdateadoptions')
--  order by 1;   -- expect 7 rows
--
-- select count(*) from gitcommandsessions;  -- expect 3 (data preserved by the rename)
