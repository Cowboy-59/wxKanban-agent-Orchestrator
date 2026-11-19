-- [SCOPE 028 / Phase 11] BEGIN — Unify token store: copy live apitokens into mcpapitokens, drop apitokens
--
-- Spec 028 amendment 2026-05-23, FR-016 / FR-017.
--
-- Reason: the kit-download flow ships `WXKANBAN_API_TOKEN` from `apitokens`,
-- but the hosted MCP only validates `mcpapitokens`. Same wxk_live_… format,
-- incompatible stores. Bug report root cause #3 — kit-shipped token works for
-- /api/projects/:id/kit/upgrade (via apitokens) but NOT for mcp.wxperts.com
-- (which only knows mcpapitokens). Phase 11 retires apitokens and makes
-- mcpapitokens the single store.
--
-- Personal/user-level tokens (apitokens.projectid IS NULL) are NOT migrated;
-- they are dropped per the 2026-05-23 explicit decision. Revoked tokens
-- (revokedat IS NOT NULL) are also dropped — they were already terminal.
--
-- One-way migration. Rollback requires restoring from backup.

BEGIN;

-- Observability: log the row counts we're about to act on so post-hoc audit
-- can confirm what was dropped.
DO $$
DECLARE
    total_count integer;
    personal_count integer;
    revoked_count integer;
    migratable_count integer;
BEGIN
    SELECT count(*) INTO total_count FROM apitokens;
    SELECT count(*) INTO personal_count FROM apitokens WHERE projectid IS NULL;
    SELECT count(*) INTO revoked_count FROM apitokens WHERE revokedat IS NOT NULL;
    SELECT count(*) INTO migratable_count
      FROM apitokens
      WHERE projectid IS NOT NULL AND revokedat IS NULL;
    RAISE NOTICE 'spec028 phase11 unify-tokens: total=% personal_dropped=% revoked_dropped=% migrating=%',
      total_count, personal_count, revoked_count, migratable_count;
END $$;

-- Skip rows whose tokenhash already exists in mcpapitokens (would violate
-- the unique constraint). Two-store-during-transition projects may have
-- already-minted-twice tokens; favor the existing mcpapitokens row.
INSERT INTO mcpapitokens (
    id,
    customerid,
    projectid,
    tokenhash,
    tokenprefix,
    name,
    issuedbyid,
    issuedat,
    expiresat,
    revokedat,
    revokedbyid,
    lastusedat,
    createdat
)
SELECT
    gen_random_uuid()                       AS id,
    a.companyid                             AS customerid,
    a.projectid                             AS projectid,
    a.tokenhash                             AS tokenhash,
    -- apitokens.tokenprefix is varchar(20), mcpapitokens.tokenprefix is text;
    -- copy as-is. Fall back to first 12 chars of tokenhash if somehow null.
    COALESCE(NULLIF(a.tokenprefix, ''), substr(a.tokenhash, 1, 12)) AS tokenprefix,
    -- mcpapitokens.name is NOT NULL; default unnamed legacy rows.
    COALESCE(NULLIF(a.name, ''), 'Legacy Token (apitokens migration)') AS name,
    a.userid                                AS issuedbyid,
    a.createdat AT TIME ZONE 'UTC'          AS issuedat,
    NULL::timestamptz                       AS expiresat,
    NULL::timestamptz                       AS revokedat,
    NULL::uuid                              AS revokedbyid,
    a.lastusedat                            AS lastusedat,
    a.createdat AT TIME ZONE 'UTC'          AS createdat
FROM apitokens a
WHERE a.projectid IS NOT NULL
  AND a.revokedat IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM mcpapitokens m WHERE m.tokenhash = a.tokenhash
  );

-- Drop the source table. CASCADE handles any forgotten FK pointers, but
-- the only known FK is internal (none point AT apitokens).
DROP TABLE apitokens;

COMMIT;

-- [SCOPE 028 / Phase 11] END
