-- Devices for fixture F152. Run after seed-f152-parents.sql. tokenhash is sha256('f152-<id>') so a test can derive the raw 'token' it needs.
BEGIN;
INSERT INTO agentdevicetokens (id, userid, companyid, devicename, tokenhash, createdat, lastusedat, revokedat, revokedbyid, revokereason) VALUES
  ('f1520000-0000-7000-8000-00000000d001', 'f1520000-0000-7000-8000-000000000011', 'f1520000-0000-7000-8000-000000000001', 'Phone', encode(sha256(convert_to('f152-d001', 'UTF8')), 'hex'), now() - interval '2 days', now() - interval '1 hour', NULL, NULL, NULL),
  ('f1520000-0000-7000-8000-00000000d002', 'f1520000-0000-7000-8000-000000000011', 'f1520000-0000-7000-8000-000000000001', 'Laptop', encode(sha256(convert_to('f152-d002', 'UTF8')), 'hex'), now() - interval '1 day', NULL, NULL, NULL, NULL),
  ('f1520000-0000-7000-8000-00000000d003', 'f1520000-0000-7000-8000-000000000011', 'f1520000-0000-7000-8000-000000000001', 'Old tablet', encode(sha256(convert_to('f152-d003', 'UTF8')), 'hex'), now() - interval '9 days', now() - interval '8 days', now() - interval '7 days', 'f1520000-0000-7000-8000-000000000011', 'revoked'),
  ('f1520000-0000-7000-8000-00000000d004', 'f1520000-0000-7000-8000-000000000014', 'f1520000-0000-7000-8000-000000000001', 'Sub phone', encode(sha256(convert_to('f152-d004', 'UTF8')), 'hex'), now() - interval '1 day', NULL, NULL, NULL, NULL),
  ('f1520000-0000-7000-8000-00000000d005', 'f1520000-0000-7000-8000-000000000022', 'f1520000-0000-7000-8000-000000000002', 'C1 phone', encode(sha256(convert_to('f152-d005', 'UTF8')), 'hex'), now() - interval '1 day', NULL, NULL, NULL, NULL);
COMMIT;
SELECT count(*) FILTER (WHERE revokedat IS NULL) AS live, count(*) FILTER (WHERE revokedat IS NOT NULL) AS revoked FROM agentdevicetokens WHERE id::text LIKE 'f1520000-%';  -- expected live = 4, revoked = 1
