-- [SCOPE 126 / T006] BEGIN — Migration adding brandschema to three tables
-- SCOPE-129 / SPEC-126 T006 — carry a brand schema across ALL THREE theme resolution tiers.
--
-- Strictly ADDITIVE and idempotent: one nullable jsonb column on each of three existing tables.
-- No existing column changes type, no row needs a backfill, and every existing row keeps working
-- with the column NULL — a look that was hand-built, URL-derived or picked from the catalog
-- continues to execute to exactly today's artifact set.
--
-- Hand-authored to match this repository's actual practice: the drizzle-kit snapshots stop long
-- before the live migration numbers, so `generate` cannot diff. Keep this file and the three
-- schema files in src/db/schema/ in step by hand.
--
-- WHY ALL THREE TIERS. Theme resolution is project -> company -> default, and today only the
-- project tier carries rich data. resolveTheme() says so in as many words:
--
--     "The company and default tiers have no rich token set by construction — neither table
--      carries the carrier columns — so both resolve to a colour-only bundle."
--
-- SCOPE-129's capture flow ends in a brand being selected COMPANY-WIDE. Adding this column to
-- the project tier alone would look correct in the Studio and then lose the schema at the
-- company boundary, so every project that had not imported the brand individually would quietly
-- resolve to bare colours while every screen reported success. That is the single most likely
-- way to ship this feature broken, which is why all three tables are altered together here.
--
-- themetemplates      — the company-scoped named gallery; where a tenant's own brand lives.
-- projectthemes       — the per-project applied snapshot; what `execute` reads.
-- companythemeprofiles — the company default tier; what company-wide selection resolves through.
--
-- The `designsystems` catalog is deliberately NOT altered: it is global, read-only and
-- system-owned, which makes it the wrong home for a single tenant's brand.


ALTER TABLE themetemplates
  ADD COLUMN IF NOT EXISTS brandschema jsonb;

ALTER TABLE projectthemes
  ADD COLUMN IF NOT EXISTS brandschema jsonb;

ALTER TABLE companythemeprofiles
  ADD COLUMN IF NOT EXISTS brandschema jsonb;

COMMENT ON COLUMN themetemplates.brandschema IS
  'SCOPE-129: BrandSchema — base theme, extension tokens, typefaces, named modes under a declared token contract, and the brand rules. NULL for every look that predates SCOPE-129.';

COMMENT ON COLUMN projectthemes.brandschema IS
  'SCOPE-129: BrandSchema snapshot copied on apply. Read by execute. Must be carried in the insert values AND the ON CONFLICT DO UPDATE set clause, or a re-apply silently drops it.';

COMMENT ON COLUMN companythemeprofiles.brandschema IS
  'SCOPE-129: BrandSchema for a company-wide brand selection. Without this column the company tier resolves to a colour-only bundle by construction.';
-- [SCOPE 126 / T006] END

