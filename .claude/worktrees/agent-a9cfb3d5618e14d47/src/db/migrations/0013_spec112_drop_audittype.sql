-- SPEC-112 / T010 (part 2 of 2) — drop companyprojects.audittype
--
-- ⚠ DO NOT RUN THIS BEFORE THE SPEC-112 CODE IS DEPLOYED. ⚠
--
-- This is migration step 4 of the order set out in the spec: "drop `audittype` only
-- once step 3 is verified". Step 3 — the reader cutover — is complete in the working
-- tree but NOT deployed. Production is still serving the pre-cutover build.
--
-- Why the ordering is load-bearing rather than tidy: drizzle emits an explicit column
-- list from the schema definition compiled into the running bundle. The deployed
-- bundle's `companyprojects` still declares `audittype`, so every
-- `db.select().from(companyprojects)` it issues names that column. Dropping it now
-- makes each of those queries fail with "column does not exist" — that is the project
-- list, the dashboard, the workspace page and the phase engine, all at once, on a
-- database that is otherwise healthy. The schema being AHEAD of the code was safe for
-- 0010 through 0012 because every one of those changes was additive. This one is not.
--
-- Run order:
--   1. Merge and push the SPEC-112 reader cutover.
--   2. Confirm the deploy is live and serving (App Runner health check green).
--   3. Confirm no deployed code references audittype:
--        grep -rn "audittype" --include=*.ts --include=*.tsx src/ shared/ mcp-server/src/
--      Comments are fine; a select, insert, update or zod schema is not.
--   4. Then run this file.
--
-- The data is not lost by dropping: every framework `audittype` carried was migrated
-- into appauditconfiguration by 0010 (from audittype) and 0012 (from
-- securityclassification, which held more than audittype ever could).

-- ⚠ THIS FILE ONCE TOOK PRODUCTION DOWN. ⚠
--
-- On 2026-07-28 the drop ran while the deployed bundle still declared `audittype`.
-- Drizzle names every declared column in its SELECTs, so `ProjectService.getUserProjects`
-- began failing with `column "audittype" does not exist` at 12:34:49Z, 500ing every
-- signed-in dashboard load and tripping the wxkanban-cloudfront-5xx alarm. Recovery was
-- `ALTER TABLE companyprojects ADD COLUMN audittype varchar(50)` — additive and
-- immediate, and lossless because 0010 and 0012 had already migrated every value into
-- appauditconfiguration.
--
-- The original protection was a comment saying "do not run this yet". A comment is not
-- a guard. The file now refuses to execute unless the operator explicitly asserts the
-- precondition, so running it by accident — by hand, by a runner that globs *.sql, or
-- by an editor's "execute file" — raises instead of dropping.
--
-- To run it deliberately, AFTER the reader cutover is deployed AND the `audittype`
-- declaration is removed from src/db/schema/companyproject.ts:
--
--   SET wxkanbandrop.confirm_audittype = 'yes';
--   \i src/db/migrations/0013_spec112_drop_audittype.sql
--
BEGIN;

-- Guard 1 — explicit operator intent. Absent the setting this always raises, which is
-- what makes accidental execution impossible rather than merely discouraged.
DO $$
BEGIN
  IF coalesce(current_setting('wxkanbandrop.confirm_audittype', true), '') <> 'yes' THEN
    RAISE EXCEPTION
      'Refusing to drop audittype: this migration is deploy-gated. Confirm the reader cutover is LIVE and the column is removed from the drizzle schema, then re-run with: SET wxkanbandrop.confirm_audittype = ''yes'';';
  END IF;
END $$;

-- Guard 2 — refuse to drop while any project still carries a value that has not been
-- represented in appauditconfiguration. Belt and braces — 0010 and 0012 should have
-- left this at zero.
DO $$
DECLARE
  unmigrated int;
BEGIN
  SELECT count(*) INTO unmigrated
  FROM companyprojects p
  WHERE p.audittype IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM appauditconfiguration ac
      WHERE ac.projectid = p.id
        AND (ac.soc2enabled OR ac.hipaaenabled OR ac.hitrustenabled OR ac.gdprenabled)
    );

  IF unmigrated > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop audittype: % project(s) still carry a value with no enabled framework in appauditconfiguration. Re-run 0010/0012 first.',
      unmigrated;
  END IF;
END $$;

ALTER TABLE companyprojects DROP COLUMN IF EXISTS audittype;

COMMIT;
