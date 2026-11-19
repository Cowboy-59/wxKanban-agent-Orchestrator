-- [SCOPE 043 / audit] BEGIN — record the REQUESTED project on each MCP audit row
--
-- WHY THIS EXISTS: mcprequestaudit records `projectid` from the caller's TOKEN
-- (middleware/audit.ts). It does not record which project the caller actually
-- ASKED for. Those two are the same for well-behaved traffic and different for
-- exactly the traffic an audit trail exists to catch.
--
-- Concretely: the cross-tenant feedback disclosure found 2026-08-02 turned on
-- list_my_feedback honouring a caller-supplied `projectId` that was never checked
-- against the token. Across 387,805 audit rows there is no way to reconstruct which
-- project any caller requested, so whether that path was ever exercised cannot be
-- determined in either direction. The access check (utils/project-access.ts) closes
-- the hole going forward; this column is what makes the next one answerable.
--
-- Nullable on purpose. Historic rows genuinely do not have this value and must not
-- be backfilled with a guess — a fabricated value here would be worse than a null,
-- because it would read as evidence.
--
-- Strictly ADDITIVE and idempotent. One nullable column on one table. No existing
-- column changes type, nothing needs backfill, no rewrite (catalog-only on PG 11+).
-- Safe to re-run.
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` against this database (SCOPE-117).
-- The local .env DATABASE_URL points at PRODUCTION, and push would propose dropping
-- the ~19 undeclared-but-live tables, including marketingcontacts.
--
-- ORDER MATTERS — reversing it silently stops MCP audit logging:
--
--   1. Apply THIS FILE to the database.
--   2. Verify THE COLUMN — run this and expect exactly one row:
--
--        select column_name, data_type
--          from information_schema.columns
--         where table_schema = 'public'
--           and table_name   = 'mcprequestaudit'
--           and column_name  = 'requestedprojectid';
--
--      Do NOT use `npm run db:drift` for this step. That check is TABLE-level only
--      ("every declared TABLE exists") and never inspects columns — verified
--      2026-08-02, when it exited 0 while BOTH this column and the already-missing
--      projecttimeentries.phaseid were absent from production. A green drift run
--      says nothing about whether this migration landed.
--
--   3. THEN deploy the code that writes `requestedprojectid`.
--
-- The audit INSERT names its columns explicitly. If the code ships before this DDL
-- lands, every insert fails with 42703 — and because asyncWriteAudit swallows the
-- error into a logger.warn so as not to block responses, audit logging would stop
-- WITHOUT any request failing. Silent loss of the audit trail is the worst possible
-- failure mode for this particular table, which is why the ordering is stated here
-- rather than assumed.
-- ============================================================================

ALTER TABLE "mcprequestaudit"
  ADD COLUMN IF NOT EXISTS "requestedprojectid" uuid;

COMMENT ON COLUMN "mcprequestaudit"."requestedprojectid" IS
  'The projectId carried in the request payload, as asked for by the caller. Compare against projectid (the token''s project) to detect cross-project requests. NULL for rows written before 2026-08-02, and for requests that carry no projectId.';

-- [SCOPE 043 / audit] END
