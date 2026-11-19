-- [SCOPE 115 / T004] BEGIN — Carrier columns on themetemplates + projectthemes (migratio…
-- SCOPE-114 / T004 — carry the rich design-system token set across BOTH theme tiers.
--
-- Strictly ADDITIVE and idempotent: two nullable columns on each of two existing tables.
-- No existing column changes type, no row needs backfill, and every existing row keeps
-- working with both columns NULL — a look that was hand-built or URL-derived continues to
-- execute to exactly today's colour-only artifact set.
--
-- Hand-authored to match this repository's actual practice: drizzle-kit snapshots stop at
-- 0009 while migrations run past 0056, so `generate` cannot diff. Keep this file,
-- src/db/schema/themetemplate.ts and src/db/schema/projecttheme.ts in step by hand.
--
-- WHY BOTH TIERS. The artifact chain has two hops and `execute` reads the PROJECT tier:
--
--   designsystems --(pick)--> themetemplates --(snapshot apply)--> projectthemes --(execute)--> bundle
--
-- Adding these columns to themetemplates alone would look correct in the Studio and then
-- lose the rich set at the project boundary, so the download would quietly emit colour
-- with no control files while every screen reported success. That is the single most
-- likely way to ship this feature broken, which is why both tables are altered here in
-- one migration rather than separately.
--
-- Both columns are nullable BY DESIGN. NULL is the honest representation of "this look did
-- not come from the catalog", and it is what the execute route branches on to choose
-- between the extended bundle and the pre-existing one.

-- ---------------------------------------------------------------------------
-- Company tier — the named profile a user picks a catalog entry into
-- ---------------------------------------------------------------------------

-- The rich DesignSystemTokens set: control specifications, the per-role type scale,
-- spacing, elevation and the radius steps. ProjectTheme structurally cannot hold these.
ALTER TABLE themetemplates ADD COLUMN IF NOT EXISTS tokens jsonb;

-- Provenance. A slug rather than a foreign key, deliberately: picking is a SNAPSHOT, so a
-- later edit to the catalog row must NOT propagate into this copy, and the copy must
-- survive its catalog entry being re-seeded or removed.
ALTER TABLE themetemplates ADD COLUMN IF NOT EXISTS designsystemslug varchar(80);

-- ---------------------------------------------------------------------------
-- Project tier — where `theme/execute` actually resolves from
-- ---------------------------------------------------------------------------

ALTER TABLE projectthemes ADD COLUMN IF NOT EXISTS tokens jsonb;
ALTER TABLE projectthemes ADD COLUMN IF NOT EXISTS designsystemslug varchar(80);

-- ---------------------------------------------------------------------------
-- Provenance lookup
-- ---------------------------------------------------------------------------
-- Partial indexes: the overwhelming majority of rows in both tables will have a NULL slug
-- (every pre-existing look, plus every hand-built one from here on), so indexing only the
-- non-NULL rows keeps these small. Supports "which projects use this catalog entry?",
-- which is what a future catalog-versioning or deprecation flow would need.

CREATE INDEX IF NOT EXISTS idx_themetemplates_designsystemslug
  ON themetemplates (designsystemslug)
  WHERE designsystemslug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projectthemes_designsystemslug
  ON projectthemes (designsystemslug)
  WHERE designsystemslug IS NOT NULL;
-- [SCOPE 115 / T004] END
