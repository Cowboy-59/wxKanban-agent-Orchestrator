-- [SCOPE 110 / T007] FR-009 — the database guarantees at most one automatic
-- record per project per identity.
--
-- MUST run AFTER the T006 merge (scripts/scope110-merge-auto-duplicates.ts) has
-- collapsed existing duplicates. Applying this to un-merged data FAILS loudly on
-- the duplicate rows — that failure is intended and documented, not a defect.
--
-- Idempotent (IF NOT EXISTS). Supplements the existing non-unique SCOPE-061 index.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_feedbacksubmissions_auto_identity
  ON feedbacksubmissions (projectid, errorfingerprint)
  WHERE source = 'auto' AND errorfingerprint IS NOT NULL;
