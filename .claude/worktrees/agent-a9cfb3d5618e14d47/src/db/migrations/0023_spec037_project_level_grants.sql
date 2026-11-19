-- Spec 037 FR-006 amendment — three-level assignment granularity
--
-- Was: engagementassignments grants either a scope OR a task (exactly one
--      non-null). Original constraint: (scopeid is null) != (taskid is null).
-- Now: optionally both null = project-level grant (whole project assigned to
--      the consultant). At most one of (scopeid, taskid) may be non-null.
--
-- Existing rows are unaffected: every current row has exactly one of
-- (scopeid, taskid) populated, which still satisfies the new constraint.

ALTER TABLE engagementassignments
  DROP CONSTRAINT IF EXISTS chk_engagementassignments_scope_or_task;

ALTER TABLE engagementassignments
  ADD CONSTRAINT chk_engagementassignments_scope_or_task
  CHECK (NOT (scopeid IS NOT NULL AND taskid IS NOT NULL));
