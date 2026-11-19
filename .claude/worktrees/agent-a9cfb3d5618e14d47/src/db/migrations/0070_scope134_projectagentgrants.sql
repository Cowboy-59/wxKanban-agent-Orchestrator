-- [SCOPE 134 / T027] BEGIN — projectagentgrants: the checkbox that bounds an agent
--
-- ============================================================================
-- APPLY BY HAND. APPLIED 2026-09-25 (verified; see SCOPE-117 schema-change-log).
--
-- Do NOT run `drizzle-kit push` against this database (SCOPE-117): it reconciles
-- the database TO the declared schema and would propose dropping the ~19
-- undeclared-but-live tables, including `marketingcontacts`.
-- ============================================================================
--
-- WHAT THIS IS, AND WHY IT IS THE IMPORTANT ONE
--
-- A Company Access Token (0069) proves an agent may CONNECT to a company. It deliberately
-- carries no project and can read no project data. What decides which projects that agent
-- may actually see is this table, one row per grant, created by a human ticking a box.
--
-- That split is the whole safety argument. The credential is company-wide; its REACH is
-- an explicit allowlist somebody chose, can see, and can withdraw. Without this table the
-- company token is either useless or unbounded, and neither is acceptable.
--
-- WHY PER AGENT, NOT PER PROJECT
--
-- `(projectid, agentname)` rather than a single "allow agents" flag. A second agent
-- arriving does not inherit the first one's access, and one can be allowed without the
-- other. The alternative silently grants every future agent everything the first one had.
--
-- WHY SOFT REVOKE
--
-- `revokedat` rather than DELETE, matching `projectusers.removedat`. Who granted an agent
-- access to a project, who withdrew it, and when, all stay answerable — which is the
-- point of a grant being a deliberate act rather than a config value.
--
-- The unique index covers only LIVE rows, so re-granting after a revoke is not blocked by
-- history while two simultaneous grants remain impossible.
--
-- ENFORCEMENT NOTE
--
-- The grant is re-checked on EVERY call, not once at session start: unticking the box has
-- to stop an agent that is already working, or it is a preference rather than a control.
-- That puts this table on the hot path, which is what the index below is for.
--
-- SAFETY
--
-- One new table. Nothing existing is altered or dropped, no data is touched. Idempotent.
--
-- VERIFY:
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='projectagentgrants'
--    order by ordinal_position;
--
--   select indexname from pg_indexes
--    where schemaname='public' and tablename='projectagentgrants';
--   -- expect the live-grant unique index and the lookup index
-- ============================================================================

CREATE TABLE IF NOT EXISTS "projectagentgrants" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectid"   uuid        NOT NULL REFERENCES "companyprojects"("id") ON DELETE CASCADE,
  "agentname"   varchar(64) NOT NULL,
  "grantedbyid" uuid        NOT NULL,
  "grantedat"   timestamp with time zone NOT NULL DEFAULT now(),
  "revokedat"   timestamp with time zone,
  "revokedbyid" uuid
);

-- One LIVE grant per agent per project. Revoked rows stay for the audit trail and are
-- excluded, so re-granting later is not blocked by what happened before.
CREATE UNIQUE INDEX IF NOT EXISTS "projectagentgrants_live_key"
  ON "projectagentgrants" ("projectid", "agentname")
  WHERE "revokedat" IS NULL;

-- The hot path: "may this agent act on this project, right now".
CREATE INDEX IF NOT EXISTS "projectagentgrants_lookup_idx"
  ON "projectagentgrants" ("agentname", "projectid")
  WHERE "revokedat" IS NULL;

COMMENT ON TABLE "projectagentgrants" IS
  'SCOPE-134: one row per project an agent has been allowed to see. A Company Access Token proves an agent may CONNECT; this table decides what it may REACH. Re-checked on every call so unticking stops work already in progress.';

COMMENT ON COLUMN "projectagentgrants"."agentname" IS
  'SCOPE-134: e.g. KAIN. Matches companyagenttokens.agentname and the NAME half of mcpapitokens.clientbinding, so one agent reads the same everywhere.';

COMMENT ON COLUMN "projectagentgrants"."revokedat" IS
  'SCOPE-134: soft revoke, matching projectusers.removedat. Set when the box is unticked; the row is kept so who withdrew access, and when, stays answerable.';

-- [SCOPE 134 / T027] END
