-- [SCOPE 110] Hosted MCP DB migration — feedback queue hygiene.
--
-- The hosted MCP runs a SEPARATE database from the application. It must gain the
-- same feedbacksubmissions hygiene columns, the not-dismissed index, the new
-- companyauditlogs table (for the T011 submitter self-delete audit — FR-005), and
-- the unique error-identity index. Auto-error capture is app-side, so this DB
-- typically holds no source='auto' rows: the merge is a safe no-op here and the
-- unique index applies cleanly. Idempotent — safe to re-run.
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS dismissedat timestamp;
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS dismissedbyid uuid;
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS submitterhiddenat timestamp;
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS reopenedat timestamp;

CREATE INDEX IF NOT EXISTS idx_feedbacksubmissions_project_notdismissed
  ON feedbacksubmissions (projectid, dismissedat);

-- companyauditlogs mirror (app already has this table; the MCP DB does not).
CREATE TABLE IF NOT EXISTS companyauditlogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companyid uuid NOT NULL,
  action varchar(100) NOT NULL,
  changedby uuid,
  previousvalue jsonb,
  newvalue jsonb,
  description text,
  "timestamp" timestamp NOT NULL DEFAULT now()
);

-- FR-009 uniqueness (run the merge first if this DB somehow holds auto duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_feedbacksubmissions_auto_identity
  ON feedbacksubmissions (projectid, errorfingerprint)
  WHERE source = 'auto' AND errorfingerprint IS NOT NULL;
