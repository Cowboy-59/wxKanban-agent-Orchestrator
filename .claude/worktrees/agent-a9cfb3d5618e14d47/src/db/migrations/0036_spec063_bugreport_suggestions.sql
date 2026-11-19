-- [SCOPE 063 / T001] BEGIN — customer per-project bug-report triage: AI-suggested fix + linked task
-- Adds four nullable columns to feedbacksubmissions. Backward-compatible (additive),
-- idempotent (IF NOT EXISTS). No data backfill required.
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS suggestedsolution text;
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS suggestedsolutionrationale text;
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS suggestedat timestamp;
ALTER TABLE feedbacksubmissions ADD COLUMN IF NOT EXISTS linkedtaskid uuid;
-- [SCOPE 063 / T001] END
