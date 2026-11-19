-- [SCOPE 134 / T004] BEGIN — projectrooms, superseding the columns added in 0067
--
-- ============================================================================
-- APPLY BY HAND. APPLIED 2026-09-25 (verified; see SCOPE-117 schema-change-log).
--
-- Do NOT run `drizzle-kit push` against this database (SCOPE-117): it reconciles
-- the database TO the declared schema and would propose dropping the ~19
-- undeclared-but-live tables, including `marketingcontacts`.
-- ============================================================================
--
-- WHAT THIS CHANGES, AND WHY NOW
--
-- 0067 put `conversationid` and `agenttokenencrypted` directly on `companyprojects`.
-- That works, and it hard-codes ONE ROOM PER PROJECT — which silently answers
-- SCOPE-132's OQ-7, "does ALIS share KAIN's room or get its own?", as "shares",
-- by construction rather than by decision.
--
-- This supersedes that shape before it sets. The window is narrow and it is open
-- right now: those two columns are applied to production but declared in NO schema
-- file, so nothing SELECTs them and dropping them is a single statement. Once
-- SPEC-134/T004 declares them, removal becomes the three-deploys-apart sequence,
-- because Drizzle names every declared column in every `companyprojects` SELECT.
--
-- NO DATA MOVES. `select count(conversationid) from companyprojects` returned 0 of
-- 174 on 2026-09-23 — no project has ever had a room. Had any row been populated,
-- this migration would need a backfill step before the DROP, and it deliberately
-- does not have one: the DROP is safe only because the columns are empty, and that
-- is a precondition to re-check, not an assumption to carry.
--
-- WHY A TABLE
--
--   - Rows exist only where a room exists. 174 projects do not each carry fields
--     they will never use.
--   - `(projectid, agentname)` is unique, so a second agent can hold its own room in
--     the same project. That is not a hypothetical: YappChatt keys its agent
--     principal PER ROOM — `claude+<conversationid>@agent.yappchat.internal`, display
--     name "Claude" — so two agents sharing one room ARE the same users row and
--     cannot be told apart at the platform level. A separate room is the only
--     mechanism that distinguishes them; prefix tagging is a content convention
--     layered on top.
--   - A shared room is still expressible: two rows, same `conversationid`, different
--     `agentname`.
--
-- HOW A ROW GETS HERE — lazily, server-side, on first connect
--
-- Nothing pre-populates this table. On an agent's first connect for a project the
-- broker creates the room and writes the row:
--
--   lookup (projectid, agentname)
--     HIT  -> return conversationid
--     MISS -> POST /api/chats {groupingid, title}  -> conversationid   (YappChatt)
--             POST /api/chats/:id/agent            -> yca_ token       (YappChatt)
--             INSERT here
--
-- The room is therefore resolved from a TOKEN-RESOLVED projectId and written by the
-- server — which is what makes it authoritative rather than a client-supplied id to
-- be distrusted. `groupingid` is the one input that cannot be derived: YappChatt's
-- `createRoomInGrouping` calls `requireOwnGrouping`, so the room must be filed under
-- a grouping the brokered identity owns. That is per-account configuration in
-- wxKanban. A solo room also REQUIRES a title (`name_required` 400 otherwise).
--
-- WHY THERE IS NO TOKEN COLUMN
--
-- 0067 stored the `yca_` agent token encrypted. Decided 2026-09-23 that KAIN keeps
-- it instead, matching SCOPE-102, where the bridge holds `YAPPCHATT_TOKEN` in its own
-- `.env`. So no credential is stored here, none crosses the wire on a normal session
-- start, and this table gains no dependency on the encryption key whose rotation is
-- already recorded as data-destroying.
--
-- KAIN cannot mint the token itself — `POST /api/chats/:id/agent` runs through
-- `engineContext()` and needs a user session, which only the broker can produce. So
-- the broker mints it and returns it ONCE, at first bind; KAIN persists it from then
-- on and later sessions receive only the `conversationid`.
--
-- The accepted cost of that choice, recorded so it is not rediscovered: YappChatt's
-- `connectClaudeToConversation` INSERTS a new token per call and NEVER revokes, and
-- there is no expiry. A KAIN that loses its copy — reinstall, new machine, fresh
-- container — mints another, and the previous one stays live against that room
-- forever. `agenttokenmintedat` exists to make that visible: it is set on each mint,
-- so a room whose timestamp keeps moving is leaking credentials. It prevents nothing;
-- it means nobody has to guess.
--
-- SAFETY
--
-- One new table, plus a DROP of two empty, undeclared columns. The FK cascades on
-- project delete, matching how a project's other children behave. Idempotent:
-- `IF NOT EXISTS` / `IF EXISTS` throughout, so re-running is a no-op.
--
-- VERIFY (do NOT rely on `npm run db:drift` for the columns — it compares TABLES and
-- exits 0 whether or not a column exists; it WILL see the new table):
--
--   -- 1. the columns are gone
--   select count(*) as should_be_zero
--     from information_schema.columns
--    where table_schema='public' and table_name='companyprojects'
--      and column_name in ('conversationid','agenttokenencrypted');
--
--   -- 2. the table is shaped as intended
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='projectrooms'
--    order by ordinal_position;
--
--   -- 3. one room per agent per project is enforced
--   select conname from pg_constraint
--    where conrelid = 'projectrooms'::regclass and contype = 'u';
--   -- expect projectrooms_projectid_agentname_key
--
--   -- 4. no credential column crept back in
--   select count(*) as should_be_zero
--     from information_schema.columns
--    where table_schema='public' and table_name='projectrooms'
--      and column_name like '%encrypted%';
-- ============================================================================

CREATE TABLE IF NOT EXISTS "projectrooms" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectid"           uuid         NOT NULL REFERENCES "companyprojects"("id") ON DELETE CASCADE,
  "agentname"           varchar(64)  NOT NULL,
  "conversationid"      varchar(255) NOT NULL,
  "agenttokenmintedat"  timestamp with time zone,
  "createdat"           timestamp with time zone NOT NULL DEFAULT now(),
  "updatedat"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "projectrooms_projectid_agentname_key" UNIQUE ("projectid", "agentname")
);

CREATE INDEX IF NOT EXISTS "projectrooms_projectid_idx" ON "projectrooms" ("projectid");

COMMENT ON TABLE "projectrooms" IS
  'SCOPE-134: binds a project to the YappChatt room an agent uses. Written server-side by the broker on first connect, from a token-resolved projectId, so a room is authoritative and never a client claim. Holds NO credential. Supersedes the companyprojects columns added in 0067.';

COMMENT ON COLUMN "projectrooms"."agentname" IS
  'SCOPE-134: the agent this room serves, e.g. KAIN. Unique with projectid: one room per agent per project. Two agents may share a room by holding two rows with the same conversationid.';

COMMENT ON COLUMN "projectrooms"."conversationid" IS
  'SCOPE-134: the YappChatt room conversationId. NOT NULL — a row exists only once a room is bound.';

COMMENT ON COLUMN "projectrooms"."agenttokenmintedat" IS
  'SCOPE-134: when a yca_ agent token was last minted for this room. The token itself is NOT stored — the agent keeps it, as the SCOPE-102 bridge does. This column exists because YappChatt never revokes and sets no expiry, so an agent that loses its copy mints another and the old one stays live forever. A timestamp that keeps moving means that room is accumulating credentials. Observability, not prevention.';

-- Superseding 0067. Safe ONLY because these columns are empty and declared nowhere —
-- re-check `select count(conversationid) from companyprojects` before applying.
ALTER TABLE "companyprojects"
  DROP COLUMN IF EXISTS "conversationid",
  DROP COLUMN IF EXISTS "agenttokenencrypted";

-- [SCOPE 134 / T004] END
