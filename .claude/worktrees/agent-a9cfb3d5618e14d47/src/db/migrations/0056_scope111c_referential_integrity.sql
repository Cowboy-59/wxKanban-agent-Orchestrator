-- [SCOPE 111 / Amendment C] Referential integrity + index hygiene on the test tables.
--
-- Remediates findings the scope's own schema analysis raised against the tables
-- SCOPE-111 shipped in migration 0054. Three classes of defect, all additive and
-- idempotent; no data is moved and no existing column changes type or nullability.
--
--   1. Three UUID columns named like foreign keys but never declared as any:
--      testplanitems.parentitemid, testplanitems.lastrunid, testruns.currentitemid.
--      Nothing stopped a row pointing at an id that never existed, and nothing
--      cleaned them up when the target was deleted.
--   2. Four tables carrying createdat but no updatedat, though their rows mutate.
--   3. Foreign keys with no covering index. Postgres does not create these
--      automatically, so a DELETE on the parent sequentially scans the child.
--
-- Deliberately NOT changed, for the record:
--   - testrunresults and testitemsubjects get no updatedat. Both are append-only
--     by design (testrunresults is documented "never overwritten"); a column
--     guaranteed to equal createdat forever would only mislead a reader.
--   - No bare index on the low-cardinality status columns the analysis suggested
--     (testplans.status, testrunresults.status, testsignoffs.status). Every gate
--     query filters status alongside a project, cycle or item that is already
--     indexed, so a standalone index would carry write cost and never be chosen.
--   - The analysis also reported 12 foreign keys as "no onDelete rule". All 12
--     already carry an explicit rule; its parser cannot see `{ onDelete: ... }`
--     when it sits on the line after the .references() call. No action needed.

-- ---------------------------------------------------------------------------
-- 1. Adopt the three implicit foreign keys.
-- ---------------------------------------------------------------------------

-- Any row already pointing at a vanished target has to be cleared first, or
-- ADD CONSTRAINT fails on legacy data. Both columns are nullable and both are
-- convenience pointers, so nulling an orphan loses nothing authoritative.
UPDATE testplanitems SET parentitemid = NULL
 WHERE parentitemid IS NOT NULL
   AND parentitemid NOT IN (SELECT id FROM testplanitems);

UPDATE testplanitems SET lastrunid = NULL
 WHERE lastrunid IS NOT NULL
   AND lastrunid NOT IN (SELECT id FROM testruns);

UPDATE testruns SET currentitemid = NULL
 WHERE currentitemid IS NOT NULL
   AND currentitemid NOT IN (SELECT id FROM testplanitems);

-- A variant of a deleted item has nothing left to vary, so this one cascades.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_testplanitems_parentitem'
  ) THEN
    ALTER TABLE testplanitems
      ADD CONSTRAINT fk_testplanitems_parentitem
      FOREIGN KEY (parentitemid) REFERENCES testplanitems(id) ON DELETE CASCADE;
  END IF;
END $$;

-- The remaining two are denormalised pointers and must NOT cascade: deleting a
-- run cannot be allowed to delete the items it ran, and deleting an item cannot
-- delete the run record along with every other item's results.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_testplanitems_lastrun'
  ) THEN
    ALTER TABLE testplanitems
      ADD CONSTRAINT fk_testplanitems_lastrun
      FOREIGN KEY (lastrunid) REFERENCES testruns(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_testruns_currentitem'
  ) THEN
    ALTER TABLE testruns
      ADD CONSTRAINT fk_testruns_currentitem
      FOREIGN KEY (currentitemid) REFERENCES testplanitems(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. updatedat on the four tables whose rows actually mutate.
-- ---------------------------------------------------------------------------
ALTER TABLE testcycles   ADD COLUMN IF NOT EXISTS updatedat timestamp NOT NULL DEFAULT now();
ALTER TABLE testruns     ADD COLUMN IF NOT EXISTS updatedat timestamp NOT NULL DEFAULT now();
ALTER TABLE testsignoffs ADD COLUMN IF NOT EXISTS updatedat timestamp NOT NULL DEFAULT now();
ALTER TABLE testretests  ADD COLUMN IF NOT EXISTS updatedat timestamp NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 3. Covering indexes for every foreign key not already led by one.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_testplans_generatedby       ON testplans(generatedbyid);
CREATE INDEX IF NOT EXISTS idx_testcycles_promotedby       ON testcycles(promotedbyid);
CREATE INDEX IF NOT EXISTS idx_testplanitems_task          ON testplanitems(taskid);
CREATE INDEX IF NOT EXISTS idx_testplanitems_parent        ON testplanitems(parentitemid);
CREATE INDEX IF NOT EXISTS idx_testplanitems_lastrun       ON testplanitems(lastrunid);
CREATE INDEX IF NOT EXISTS idx_testruns_testplan           ON testruns(testplanid);
CREATE INDEX IF NOT EXISTS idx_testruns_spec               ON testruns(specid);
CREATE INDEX IF NOT EXISTS idx_testruns_currentitem        ON testruns(currentitemid);
CREATE INDEX IF NOT EXISTS idx_testruns_triggeredby        ON testruns(triggeredbyid);
CREATE INDEX IF NOT EXISTS idx_testrunresults_bugreport    ON testrunresults(bugreportid);
CREATE INDEX IF NOT EXISTS idx_testsignoffs_signedby       ON testsignoffs(signedbyid);
CREATE INDEX IF NOT EXISTS idx_testsignoffs_run            ON testsignoffs(runid);
CREATE INDEX IF NOT EXISTS idx_testretests_reachedsubject  ON testretests(reachedsubjectid);
CREATE INDEX IF NOT EXISTS idx_testretests_dismissedby     ON testretests(dismissedbyid);

-- ---------------------------------------------------------------------------
-- 4. Drop two indexes that are left-prefixes of existing composites.
-- ---------------------------------------------------------------------------
-- Postgres uses the leading column of a composite index for single-column
-- lookups, so each of these duplicates an index that already exists. Both sit on
-- tables written on every generation and every run, where the wasted write cost
-- is real. Dropped last so the composites are proven present first.
DROP INDEX IF EXISTS idx_testplanitems_plan;      -- ⊂ idx_testplanitems_plan_itemkey (testplanid, itemkey)
DROP INDEX IF EXISTS idx_testitemsubjects_item;   -- ⊂ idx_testitemsubjects_item_source (itemid, sourcepath)
