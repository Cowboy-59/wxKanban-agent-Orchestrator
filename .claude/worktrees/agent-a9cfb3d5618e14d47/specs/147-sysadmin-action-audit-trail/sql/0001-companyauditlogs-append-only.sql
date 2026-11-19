-- SCOPE-147 / T009 (FR-008) — make companyauditlogs append-only for the application role.
-- Apply by hand (owner), AFTER SCOPE-147 is deployed and verified. Nothing in the application
-- changes or removes audit rows (code search 2026-10-25), and company-delete cascades still work:
-- referential actions run with the table owner's rights, not the caller's.
--
-- Before: wxkanban_app holds DELETE, INSERT, SELECT, UPDATE on companyauditlogs (verified 2026-10-25).
-- After:  wxkanban_app holds INSERT, SELECT only.

BEGIN;
REVOKE UPDATE, DELETE ON companyauditlogs FROM wxkanban_app;
COMMIT;

-- ── Verification (read-only) ────────────────────────────────────────────────────────────────
-- 1. The app role keeps INSERT and SELECT only (expect exactly: INSERT,SELECT):
SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_name = 'companyauditlogs' AND grantee = 'wxkanban_app'
GROUP BY grantee;

-- 2. Run as wxkanban_app (the app's own connection) inside a transaction that is rolled back —
--    each statement must fail with SQLSTATE 42501 (insufficient_privilege):
--      BEGIN; UPDATE companyauditlogs SET description = description WHERE false; ROLLBACK;
--    (the WHERE false makes it touch no row even if the revoke had not applied)

-- 3. Inserts still work: the next SysAdmin change made in the app appears in
--    GET /api/sysadmin/audit (FR-009).

-- Record the results in specs/117-production-schema-integrity/schema-change-log.md.
