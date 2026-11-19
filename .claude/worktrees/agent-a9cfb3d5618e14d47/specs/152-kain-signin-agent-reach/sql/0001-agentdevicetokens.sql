-- [SCOPE 152 / T002] BEGIN — agentdevicetokens table, indexes and grant
--
-- SPEC-152 / FR-065 (SCOPE-132 Amendment F) — agentdevicetokens: one K.A.I.N. sign-in per person and
-- device. K.A.I.N. signs in with the person's own wxKanban email and password; wxKanban issues a device
-- token and stores only its SHA-256 here. The password is never stored.
--
-- APPLIED BY HAND by the owner (no migration ledger exists; nothing auto-applies DDL).
-- APPLY THIS BEFORE the code that declares/uses it is pushed: src/db/schema/index.ts and the
-- mcp-server mirror declare agentdevicetoken, and the sign-in route and the MCP re-check read it.
-- Declaring a table before it exists = prod 500s.
--
-- Safe to re-run (IF NOT EXISTS everywhere). Adds a table only; changes nothing existing.
-- The app generates the UUID v7 id (uuid package), so there is deliberately no DB default.

BEGIN;

CREATE TABLE IF NOT EXISTS agentdevicetokens (
  id            uuid PRIMARY KEY,
  userid        uuid         NOT NULL REFERENCES userprofiles(id) ON DELETE CASCADE,
  companyid     uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  devicename    varchar(100) NOT NULL,
  tokenhash     varchar(64)  NOT NULL,
  createdat     timestamptz  NOT NULL DEFAULT now(),
  lastusedat    timestamptz  NULL,
  revokedat     timestamptz  NULL,
  revokedbyid   uuid         NULL,
  revokereason  varchar(32)  NULL,
  CONSTRAINT chk_agentdevicetokens_revokereason
    CHECK (revokereason IS NULL OR revokereason IN ('revoked', 'replaced', 'password_changed')),
  CONSTRAINT chk_agentdevicetokens_revoked
    CHECK ((revokedat IS NULL) = (revokereason IS NULL))
);

-- A token is looked up by its hash on every K.A.I.N. call.
CREATE UNIQUE INDEX IF NOT EXISTS agentdevicetokens_tokenhash_key
  ON agentdevicetokens (tokenhash);
-- One live token per person and device name (FR-065): signing in again replaces, never stacks.
CREATE UNIQUE INDEX IF NOT EXISTS agentdevicetokens_user_device_live_key
  ON agentdevicetokens (userid, devicename) WHERE revokedat IS NULL;
-- The company ADMIN's device list (FR-071).
CREATE INDEX IF NOT EXISTS idx_agentdevicetokens_company
  ON agentdevicetokens (companyid, createdat DESC);

-- The app role reads and writes it; rows are revoked, never deleted.
GRANT SELECT, INSERT, UPDATE ON agentdevicetokens TO wxkanban_app;

COMMIT;

-- ---------------------------------------------------------------------------------------
-- VERIFICATION (read-only). Expected: table_exists = agentdevicetokens, columns = 10,
-- checks = 2, indexes = 4 (primary key + the three above), app_privileges = INSERT,SELECT,UPDATE.
-- Column-level, because db:drift is table-level only and would pass with columns missing.
-- ---------------------------------------------------------------------------------------
SELECT
  to_regclass('public.agentdevicetokens')::text AS table_exists,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agentdevicetokens'
      AND column_name IN ('id','userid','companyid','devicename','tokenhash','createdat','lastusedat',
        'revokedat','revokedbyid','revokereason')
  ) AS columns,
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.agentdevicetokens'::regclass AND contype = 'c') AS checks,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'agentdevicetokens') AS indexes,
  (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants
    WHERE table_name = 'agentdevicetokens' AND grantee = 'wxkanban_app') AS app_privileges;

-- [SCOPE 152 / T002] END
