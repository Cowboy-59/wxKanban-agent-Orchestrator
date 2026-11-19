-- [SCOPE 002 / T070] BEGIN — companies.vatnumber (SPEC-002 Amendment A, FR-012a)
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` against this database (SCOPE-117):
-- it reconciles the database TO the declared schema and would propose dropping the
-- ~19 undeclared-but-live tables, including `marketingcontacts`.
--
-- The local `DATABASE_URL` names `wxkanban_app`, which does not own `companies`.
-- An apply with the local credential is refused with `must be owner of table
-- companies` and rolls back cleanly (H-9 least privilege). Use the owner connection.
-- ============================================================================
--
-- WHAT THIS IS FOR
--
-- An optional VAT registration number on the company record, as entered
-- (e.g. DE123456789). It is stored and shown only; it does not calculate tax. Formats
-- differ by country, so there is no CHECK constraint. The app trims the input, turns
-- empty input into NULL, and rejects anything longer than 50 characters.
--
-- SAFETY
--
-- Purely additive: one nullable column, no default, no constraint, no index, no data
-- touched. ADD COLUMN with a NULL default does not rewrite the table, so it takes only
-- a brief ACCESS EXCLUSIVE lock. Idempotent; re-running is a no-op.
--
-- ORDER: apply and verify this BEFORE SPEC-002 T072 declares `vatnumber` in
-- src/db/schema/company.ts. Drizzle names every declared column in each `companies`
-- SELECT, and `companies` is read on nearly every authenticated request, so declaring
-- first returns 500 across the whole application.
--
-- VERIFY (`npm run db:drift` compares TABLES only and passes whether or not this
-- column exists):
--
--   select column_name, data_type, character_maximum_length, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='companies'
--      and column_name='vatnumber';
--
--   -- expect 1 row: vatnumber | character varying | 50 | YES
-- ============================================================================

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "vatnumber" varchar(50);

COMMENT ON COLUMN "companies"."vatnumber" IS
  'SPEC-002 Amendment A (FR-012a): VAT registration number as entered. Optional; trimmed, empty stored as NULL, max 50. No format validation; display only, no tax calculation.';

-- [SCOPE 002 / T070] END
