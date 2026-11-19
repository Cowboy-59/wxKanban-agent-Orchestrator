-- [SCOPE 144 / T003] BEGIN — Company YappChatt account columns + projectrooms partial unique index
--
-- ============================================================================
-- APPLY BY HAND. NOT YET APPLIED.
--
-- Applied manually by the owner on the owner connection (SCOPE-117: there is no
-- migration ledger and nothing auto-applies DDL). Record the apply and its
-- verification in specs/117-production-schema-integrity/schema-change-log.md.
--
-- Do NOT run `drizzle-kit push` against this database (SCOPE-117): it reconciles
-- the database TO the declared schema and would propose dropping the ~19
-- undeclared-but-live tables, including `marketingcontacts`.
-- ============================================================================
--
-- SPEC-144 contract C2 (specs/144-company-yappchatt-account/contracts.md), verbatim.
-- FR-001, FR-003, FR-005, FR-007.
--
--   companies     yappchattuserid, yappchattemail, yappchattlinkedat, yappchattgroupid
--                 — the company's own YappChatt account and its corporate group.
--   userprofiles  yappchattuserid — each person's YappChatt user id, stored on sync.
--   projectrooms  owneryappchattid — the YappChatt account that owns the room;
--                 retiredat — set when an old room is retired (history kept).
--
-- All additive and nullable, no defaults: existing rows keep NULL and no table is
-- rewritten. The (projectid, agentname) unique constraint becomes a partial unique
-- index on non-retired rows, so "one live room per project and agent" still holds
-- and retired rows can stay.
--
-- ORDER: the declarations in src/db/schema/{company,userprofiles,projectroom}.ts
-- must not be pushed or deployed until this file is applied. Drizzle names every
-- declared column in its SELECTs, and `companies` / `userprofiles` are read on
-- nearly every request, so a declared-but-missing column 500s the application.
--
-- PRE-CHECK (read-only), before applying:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'projectrooms'::regclass AND contype = 'u';
--   -- expect: projectrooms_projectid_agentname_key
--
-- VERIFY (read-only), after applying — db:drift is table-level and cannot see these:
--   SELECT table_name, column_name, data_type, character_maximum_length, is_nullable
--     FROM information_schema.columns
--    WHERE (table_name = 'companies'    AND column_name IN ('yappchattuserid','yappchattemail','yappchattlinkedat','yappchattgroupid'))
--       OR (table_name = 'userprofiles' AND column_name = 'yappchattuserid')
--       OR (table_name = 'projectrooms' AND column_name IN ('owneryappchattid','retiredat'))
--    ORDER BY table_name, column_name;
--   -- expect 7 rows, all nullable
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'projectrooms' AND indexname = 'projectrooms_projectid_agentname_active_key';
--   -- expect 1 row: UNIQUE ... (projectid, agentname) WHERE (retiredat IS NULL)
--   SELECT count(*) FROM pg_constraint WHERE conname = 'projectrooms_projectid_agentname_key';
--   -- expect 0

BEGIN;

ALTER TABLE companies
  ADD COLUMN yappchattuserid   uuid,
  ADD COLUMN yappchattemail    varchar(255),
  ADD COLUMN yappchattlinkedat timestamptz,
  ADD COLUMN yappchattgroupid  uuid;

ALTER TABLE userprofiles
  ADD COLUMN yappchattuserid uuid;

ALTER TABLE projectrooms
  ADD COLUMN owneryappchattid uuid,
  ADD COLUMN retiredat        timestamptz;

ALTER TABLE projectrooms DROP CONSTRAINT projectrooms_projectid_agentname_key;
CREATE UNIQUE INDEX projectrooms_projectid_agentname_active_key
  ON projectrooms (projectid, agentname) WHERE retiredat IS NULL;

COMMIT;

-- [SCOPE 144 / T003] END
