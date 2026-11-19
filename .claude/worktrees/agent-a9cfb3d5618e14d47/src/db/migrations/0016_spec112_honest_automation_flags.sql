-- SPEC-112 / FR-006 — stop HIPAA, HITRUST and GDPR claiming automation they do not have
--
-- Migration 0011 fixed this for SOC 2 only, because authoring the SOC 2 corpus was the
-- scope of T011. The other three frameworks are still carrying the markdown-parser
-- defaults: 1,051 rows flagged `isautomated = true` with `checkmethod = 'regex_pattern'`
-- and `checkpattern IS NULL`.
--
-- checkRegexPattern returns `not_applicable` on a null pattern, so every one of those
-- rows resolves not_applicable. The count is the problem: a project enabling HIPAA sees
-- 395 "automated checks" that can never produce a verdict. FR-006 exists to stop the
-- engine reporting what it has not earned, and an automated-check count that cannot be
-- run is the same misstatement in a different column.
--
-- This does NOT author their content — that is SPEC-113 FR-011, which gives HIPAA and
-- GDPR check coverage proportionate to SOC 2's. This only makes the flags tell the
-- truth in the meantime: a control with no pattern is a manual control.
--
-- After this, `isautomated = true AND checkpattern IS NULL` is zero across every
-- framework, which is the invariant worth holding.
--
-- Idempotent.

BEGIN;

UPDATE complianceaudittasks
SET isautomated = false,
    checkmethod = 'manual_review'
WHERE checkpattern IS NULL
  AND isautomated = true;

COMMIT;
