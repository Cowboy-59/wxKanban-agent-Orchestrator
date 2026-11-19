-- The bulk rows share the f1520000- prefix, so the same statements remove them.
-- Removes exactly the F152 rows (and rows the tests created under them), in dependency order. Then asserts nothing is left.
-- Disposable clone only. A failure to reach 0 is itself a finding (an orphaned test fixture).
BEGIN;
DELETE FROM companyauditlogs WHERE companyid::text LIKE 'f1520000-%';
DELETE FROM mcpapitokens WHERE customerid::text LIKE 'f1520000-%' OR projectid::text LIKE 'f1520000-%';
DELETE FROM companyagenttokens WHERE companyid::text LIKE 'f1520000-%';
DELETE FROM passwordresettokens WHERE userid::text LIKE 'f1520000-%';
DELETE FROM agentdevicetokens WHERE userid::text LIKE 'f1520000-%' OR companyid::text LIKE 'f1520000-%';
DELETE FROM subassignments WHERE id::text LIKE 'f1520000-%';
DELETE FROM engagementassignments WHERE id::text LIKE 'f1520000-%';
DELETE FROM engagements WHERE id::text LIKE 'f1520000-%';
DELETE FROM engagementinvitations WHERE id::text LIKE 'f1520000-%';
DELETE FROM projectusers WHERE id::text LIKE 'f1520000-%';
DELETE FROM companyprojects WHERE id::text LIKE 'f1520000-%';
DELETE FROM userprofiles WHERE id::text LIKE 'f1520000-%';
DELETE FROM companies WHERE id::text LIKE 'f1520000-%';
COMMIT;
SELECT (SELECT count(*) FROM companies WHERE id::text LIKE 'f1520000-%') + (SELECT count(*) FROM userprofiles WHERE id::text LIKE 'f1520000-%') + (SELECT count(*) FROM companyprojects WHERE id::text LIKE 'f1520000-%') + (SELECT count(*) FROM agentdevicetokens WHERE userid::text LIKE 'f1520000-%') AS leftover;  -- expected 0
