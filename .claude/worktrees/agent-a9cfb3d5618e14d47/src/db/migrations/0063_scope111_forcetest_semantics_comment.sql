-- 0063 — SCOPE-111 / GAP-05: document the three-state semantics of forcetest
--
-- Context
-- -------
-- `testplanitems.forcetest` is a THREE-state column:
--
--     NULL   -> inherit testplans.forcetest
--     TRUE   -> force this item even if the plan does not
--     FALSE  -> do NOT force this item even if the plan does
--
-- (FR-030. Resolved in exactly one place: TestPlanService.resolveForce, and its
-- SQL twin COALESCE(testplanitems.forcetest, testplans.forcetest).)
--
-- Nothing at the schema level recorded that NULL is semantically meaningful. A
-- well-intentioned `SET NOT NULL DEFAULT false` — or an all-null-column cleanup —
-- would silently un-force every inheriting item at once, with no error and no
-- visible change. The failure fails OPEN: tests stop blocking the release rather
-- than starting to.
--
-- A CHECK constraint cannot express this: every one of the three states is legal.
-- The enforceable guards are therefore (a) this comment, which is what anyone
-- writing DDL against the column actually sees, and (b) the deployed-schema
-- assertions in tests/integration/test-suite-lifecycle.db.test.ts [SCOPE 111/T045].
--
-- This migration is METADATA ONLY. It adds no column, changes no type, touches no
-- row, and is reversible with `COMMENT ON COLUMN ... IS NULL`.

BEGIN;

COMMENT ON COLUMN testplanitems.forcetest IS
  'Three-state (FR-030). NULL = inherit testplans.forcetest. TRUE/FALSE = override it in either direction. DO NOT SET NOT NULL, DO NOT ADD A DEFAULT, DO NOT DROP AS AN UNUSED NULL COLUMN — any of those silently un-forces every inheriting item. Resolved by TestPlanService.resolveForce.';

COMMENT ON COLUMN testplans.forcetest IS
  'Plan-level default the item flag falls back to (FR-030). NOT NULL DEFAULT false by design — it is the COALESCE fallback, so it must always have a value. The opposite contract to testplanitems.forcetest.';

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (run after COMMIT)
-- ---------------------------------------------------------------------------
-- select c.relname, a.attname, col_description(c.oid, a.attnum) as comment
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   join pg_attribute a on a.attrelid = c.oid
--  where n.nspname = 'public'
--    and c.relname in ('testplanitems','testplans')
--    and a.attname = 'forcetest';   -- expect 2 rows, both comments non-null
--
-- Nullability must be UNCHANGED by this migration:
-- select table_name, is_nullable, column_default
--   from information_schema.columns
--  where table_schema='public' and column_name='forcetest'
--    and table_name in ('testplanitems','testplans');
--   -- expect testplanitems: YES / null   testplans: NO / false
