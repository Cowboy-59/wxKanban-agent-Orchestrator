-- [SCOPE 115 / T003] BEGIN — designsystems table + migration 0057
-- SCOPE-114 / T003 — designsystems: the global curated design-system catalog.
--
-- Strictly ADDITIVE and idempotent. One new table, three indexes, two CHECK constraints.
-- No existing table is touched and no row needs backfill, so this is safe to apply ahead
-- of the code that reads it.
--
-- Hand-authored to match this repository's actual practice: drizzle-kit snapshots stop at
-- 0009 while migrations run past 0056, so `generate` cannot diff and would prompt for
-- rename resolution. Keep this file and src/db/schema/designsystem.ts in step by hand.
--
-- NO `companyid` — deliberate, not an omission. This is wxKanban's own curated content,
-- identical for every customer: 50 rows total rather than 50 per company. It is the first
-- deliberately cross-tenant row set among the theme tables. Tenant ownership begins when a
-- user PICKS an entry, which copies it into that company's themetemplates.

-- ---------------------------------------------------------------------------
-- The catalog table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS designsystems (
  id uuid PRIMARY KEY,
  slug varchar(80) NOT NULL,
  name varchar(120) NOT NULL,
  description text NOT NULL DEFAULT '',
  -- Originating product name. Internal traceability ONLY: never selected into a
  -- client-bound payload, never written into a generated artifact.
  sourcebrand varchar(80),
  -- The single mode the source system defines. 40 of the 50 curated systems are light.
  nativemode varchar(10) NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The rich token set. The ONLY home for control specifications, the type scale,
  -- spacing and elevation — `theme` structurally cannot hold them.
  tokens jsonb NOT NULL,
  -- The derived 19-token light + dark ProjectTheme that every shipped consumer speaks.
  theme jsonb NOT NULL,
  -- Which mode was approximated rather than captured, so the UI can badge it honestly.
  synthesizedmode varchar(10) NOT NULL DEFAULT 'none',
  analysis text NOT NULL DEFAULT '',
  -- Roughly 25 KB per row. Served only by the dedicated showcase route, as text/html.
  showcasehtml text NOT NULL DEFAULT '',
  fontstack varchar(255) NOT NULL DEFAULT '',
  fontimporturl varchar(500),
  sortorder integer NOT NULL DEFAULT 0,
  createdat timestamp NOT NULL DEFAULT now(),
  updatedat timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- The upsert key. Re-seeding is idempotent because it conflicts on this.
CREATE UNIQUE INDEX IF NOT EXISTS uq_designsystems_slug ON designsystems (slug);

-- Browse orders by sortorder; the mode filter is the most-used facet.
CREATE INDEX IF NOT EXISTS idx_designsystems_sortorder ON designsystems (sortorder);
CREATE INDEX IF NOT EXISTS idx_designsystems_nativemode ON designsystems (nativemode);

-- ---------------------------------------------------------------------------
-- Enumerated-column guards
-- ---------------------------------------------------------------------------
-- Both columns are varchar rather than a pg enum, matching this schema's convention, so
-- the valid set is enforced here instead. Dropped-then-added so re-running is idempotent
-- and so the constraint definition can evolve with the migration rather than drifting.

ALTER TABLE designsystems DROP CONSTRAINT IF EXISTS chk_designsystems_nativemode;
ALTER TABLE designsystems
  ADD CONSTRAINT chk_designsystems_nativemode CHECK (nativemode IN ('light', 'dark'));

ALTER TABLE designsystems DROP CONSTRAINT IF EXISTS chk_designsystems_synthesizedmode;
ALTER TABLE designsystems
  ADD CONSTRAINT chk_designsystems_synthesizedmode
  CHECK (synthesizedmode IN ('light', 'dark', 'none'));
-- [SCOPE 115 / T003] END
