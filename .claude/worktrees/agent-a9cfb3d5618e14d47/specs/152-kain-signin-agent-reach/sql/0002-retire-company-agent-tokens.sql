-- [SCOPE 152 / T002] BEGIN — retire Company Access Tokens
--
-- SPEC-152 / FR-069 (SCOPE-132 Amendment F) — retire Company Access Tokens, softly.
--
-- APPLY AT RELEASE, by hand, AFTER the app deploy that ships K.A.I.N. sign-in (and with SpokAI's
-- sign-in panel released): before that, revoking these strands every running K.A.I.N.
--
-- A data change, not DDL. Rows are revoked, never deleted, so who held which ticket stays
-- answerable. companyagenttokens has no reason column, so the reason is written as one
-- companyauditlogs row per revoked token. projectagentgrants is left exactly as it is: after this
-- release nothing reads it (FR-069), and its rows stay for audit.
--
-- Safe to re-run: only live rows are touched, and the audit insert only covers rows this run revokes.

BEGIN;

WITH retired AS (
  UPDATE companyagenttokens
     SET revokedat = now()
   WHERE revokedat IS NULL
  RETURNING id, companyid, agentname, tokenprefix
)
INSERT INTO companyauditlogs (id, companyid, action, changedby, previousvalue, newvalue, description, timestamp)
SELECT gen_random_uuid(), r.companyid, 'agent.token.retired', NULL,
       jsonb_build_object('tokenId', r.id, 'agentName', r.agentname, 'tokenPrefix', r.tokenprefix, 'live', true),
       jsonb_build_object('live', false, 'reason', 'replaced_by_signin'),
       'Company Access Token retired: K.A.I.N. now signs in as the person (SCOPE-132 Amendment F).',
       now()
  FROM retired r;

COMMIT;

-- VERIFICATION (read-only). Expected: live_tokens = 0; retired_audit_rows = the number revoked.
SELECT
  (SELECT count(*) FROM companyagenttokens WHERE revokedat IS NULL) AS live_tokens,
  (SELECT count(*) FROM companyauditlogs WHERE action = 'agent.token.retired') AS retired_audit_rows;

-- [SCOPE 152 / T002] END
