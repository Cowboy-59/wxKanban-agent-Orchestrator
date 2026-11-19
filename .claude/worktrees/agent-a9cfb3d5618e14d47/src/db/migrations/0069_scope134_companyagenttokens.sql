-- [SCOPE 134 / T026] BEGIN — companyagenttokens: the agent's admission ticket
--
-- ============================================================================
-- APPLY BY HAND. APPLIED 2026-09-25 (verified; see SCOPE-117 schema-change-log).
--
-- Do NOT run `drizzle-kit push` against this database (SCOPE-117): it reconciles
-- the database TO the declared schema and would propose dropping the ~19
-- undeclared-but-live tables, including `marketingcontacts`.
-- ============================================================================
--
-- WHY A SEPARATE TABLE AND NOT A COLUMN ON mcpapitokens
--
-- `mcpapitokens.projectid` is NOT NULL with an FK, and that is load-bearing rather than
-- incidental: `scoped-query.ts` refuses every project-scoped read or write unless BOTH a
-- project and a customer resolve, and a CI check forbids bypassing the module. Spec 028
-- Phase 11 removed project-less tokens on purpose, and `/api/user/tokens` went with them.
--
-- The credential here is a different animal, which is the whole reason it fits without
-- reopening any of that. It CANNOT read or write project data. Its entire power is:
--
--   * prove that this third-party agent is permitted to connect to this company at all
--   * list the projects that company has granted it
--
-- Because it never reaches project data, it never meets `scoped-query`, so nothing that
-- was hardened for SOC 2 H-3 moves. Putting it in `mcpapitokens` would have forced a
-- nullable projectid and dragged the whole authorization layer along with it.
--
-- WHAT BOUNDS IT
--
-- The per-project grant, not this token. A leaked admission ticket can enumerate grants
-- and connect; it can only ever reach what has been ticked. That is the trade, taken
-- deliberately, and it is why the grant is a visible checkbox rather than a config value.
--
-- SHAPE NOTES
--
--   tokenhash    SHA-256 only. The raw token is shown once and never persists, matching
--                mcpapitokens. A credential that can be re-read from the database is a
--                credential that can be read by anything reaching the database.
--   tokenprefix  first 12 chars, so a human can tell two tokens apart in a list without
--                the value being recoverable from it.
--   agentname    KAIN, ALIS. Matches the `NAME:` half of mcpapitokens.clientbinding so
--                one agent reads the same in both places.
--   revokedat    soft revoke, matching every other credential and grant in this schema
--                (projectusers uses removedat for the same reason): who revoked what and
--                when is a question worth being able to answer later.
--
-- Unique on (companyid, agentname) WHERE NOT revoked: one live ticket per agent per
-- company. Re-issuing revokes the old one rather than accumulating, which is the failure
-- mode YappChatt's never-revoking agent tokens already demonstrate.
--
-- SAFETY
--
-- One new table. Nothing existing is altered, nothing is dropped, no data is touched.
-- Idempotent; re-running is a no-op.
--
-- VERIFY:
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='companyagenttokens'
--    order by ordinal_position;
--
--   select conname from pg_constraint
--    where conrelid = 'companyagenttokens'::regclass and contype in ('u','f');
--   -- expect the tokenhash unique and the companies FK
-- ============================================================================

CREATE TABLE IF NOT EXISTS "companyagenttokens" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyid"   uuid        NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "agentname"   varchar(64) NOT NULL,
  "tokenhash"   text        NOT NULL,
  "tokenprefix" text        NOT NULL,
  "label"       varchar(200),
  "issuedbyid"  uuid        NOT NULL,
  "issuedat"    timestamp with time zone NOT NULL DEFAULT now(),
  "lastusedat"  timestamp with time zone,
  "revokedat"   timestamp with time zone,
  "revokedbyid" uuid,
  CONSTRAINT "companyagenttokens_tokenhash_key" UNIQUE ("tokenhash")
);

-- One LIVE ticket per agent per company. Revoked rows are kept for the audit trail and
-- are deliberately excluded, so re-issuing after a revoke is not blocked by history.
CREATE UNIQUE INDEX IF NOT EXISTS "companyagenttokens_live_agent_key"
  ON "companyagenttokens" ("companyid", "agentname")
  WHERE "revokedat" IS NULL;

CREATE INDEX IF NOT EXISTS "companyagenttokens_companyid_idx"
  ON "companyagenttokens" ("companyid");

COMMENT ON TABLE "companyagenttokens" IS
  'SCOPE-134: a third-party agent''s admission ticket for one company. Proves the agent may CONNECT and lets it list its per-project grants. It CANNOT read or write project data — that is what keeps it out of mcpapitokens and away from scoped-query. Reach is bounded by the per-project grant, not by this token.';

COMMENT ON COLUMN "companyagenttokens"."tokenhash" IS
  'SCOPE-134: SHA-256 only. The raw token is shown once at creation and never persists.';

COMMENT ON COLUMN "companyagenttokens"."agentname" IS
  'SCOPE-134: e.g. KAIN. Matches the NAME half of mcpapitokens.clientbinding so one agent reads the same in both places.';

-- [SCOPE 134 / T026] END
