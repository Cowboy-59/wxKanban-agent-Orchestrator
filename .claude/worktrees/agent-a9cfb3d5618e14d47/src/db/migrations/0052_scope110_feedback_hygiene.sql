-- [SCOPE 110 / T001] Feedback Queue Hygiene — removal + reopen visibility state.
-- Additive and idempotent (ADD COLUMN IF NOT EXISTS). The unique error-identity
-- index is a SEPARATE migration (0053) applied AFTER the T006 merge — applying it
-- to un-merged duplicate data fails loudly by design.
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS dismissedat timestamp;
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS dismissedbyid uuid;
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS submitterhiddenat timestamp;
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS reopenedat timestamp;

-- Default not-dismissed queue support (FR-006).
CREATE INDEX IF NOT EXISTS idx_feedbacksubmissions_project_notdismissed
  ON feedbacksubmissions (projectid, dismissedat);
