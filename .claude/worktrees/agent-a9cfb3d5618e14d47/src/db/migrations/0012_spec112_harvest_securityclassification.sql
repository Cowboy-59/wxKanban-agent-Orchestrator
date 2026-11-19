-- SPEC-112 / T010 (part 1 of 2) — harvest securityclassification, then cleanse it
--
-- T010 as written says "overwrite framework values in securityclassification to null".
-- Doing only that would destroy live signal. The 0010 backfill read `audittype`, which
-- is a single varchar; `securityclassification` is a comma-separated list and carries
-- framework intent that `audittype` could not express:
--
--   * 9 projects name a framework in securityclassification and have NO
--     appauditconfiguration row at all, because their audittype was null —
--     Magazijnbeheer (GDPR), LabDriver (GDPR,HIPAA), Hello World (HIPAA),
--     ImpulseRetailing-WebSocket, yappChat, ScanDash, Futuretrans,
--     VS Code Interface and wxHUB (SOC2).
--   * "Proactive By DDES" holds SOC2,HITRUST,GDPR but only HITRUST was backfilled,
--     from its audittype. SOC2 and GDPR were dropped on the floor.
--
-- So: harvest first, cleanse second. Enablement is OR-ed, never cleared — the same
-- rule the 0010 company fan-out followed, because over-applying a framework is visible
-- and reversible by an admin while a silent disablement is neither.
--
-- 'NONE' and 'HIGH' are genuine data-classification values, not frameworks. They are
-- left in place; the column keeps its classification meaning once the framework names
-- are out of it (SPEC-112 open question 2).
--
-- Idempotent: harvesting is OR-based and the cleanse is filtered on framework names.

BEGIN;

-- ─── 1. Create a config row for projects that name a framework but have none ──
-- appid is NOT NULL UNIQUE and predates the project grain; new rows carry
-- appid = projectid, matching what the 0010 backfill established.
INSERT INTO appauditconfiguration (appid, projectid)
SELECT p.id, p.id
FROM companyprojects p
WHERE p.securityclassification IS NOT NULL
  AND p.securityclassification ~* '(SOC2|HIPAA|HITRUST|GDPR)'
  AND NOT EXISTS (SELECT 1 FROM appauditconfiguration ac WHERE ac.projectid = p.id)
  AND NOT EXISTS (SELECT 1 FROM appauditconfiguration ac WHERE ac.appid = p.id);

-- ─── 2. OR the named frameworks onto the project's config ────────────────────
UPDATE appauditconfiguration ac
SET soc2enabled    = ac.soc2enabled    OR p.securityclassification ~* '(^|,)\s*SOC2\s*($|,)',
    hipaaenabled   = ac.hipaaenabled   OR p.securityclassification ~* '(^|,)\s*HIPAA\s*($|,)',
    hitrustenabled = ac.hitrustenabled OR p.securityclassification ~* '(^|,)\s*HITRUST\s*($|,)',
    gdprenabled    = ac.gdprenabled    OR p.securityclassification ~* '(^|,)\s*GDPR\s*($|,)',
    updatedat      = now()
FROM companyprojects p
WHERE ac.projectid = p.id
  AND p.securityclassification IS NOT NULL
  AND p.securityclassification ~* '(SOC2|HIPAA|HITRUST|GDPR)';

-- ─── 3. Cleanse framework names out of the classification column ─────────────
-- Only rows whose value is entirely framework names are cleared. A value mixing a
-- real classification with a framework would need a judgement call rather than a
-- regex, so it is left for a human — none exist today.
UPDATE companyprojects
SET securityclassification = NULL,
    updatedat = now()
WHERE securityclassification IS NOT NULL
  AND securityclassification ~* '^\s*(SOC2|HIPAA|HITRUST|GDPR)(\s*,\s*(SOC2|HIPAA|HITRUST|GDPR))*\s*$';

COMMIT;
