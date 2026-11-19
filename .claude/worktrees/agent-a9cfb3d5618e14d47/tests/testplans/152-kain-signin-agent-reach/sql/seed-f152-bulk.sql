-- Scale data for TC-DB-016. Run after seed-f152-parents.sql and seed-f152-devices.sql. Disposable clone only.
-- 1x = 50 Projects, 10x = 500, 100x = 5000 in company OWN: re-run the INSERT with the range changed and ANALYZE between runs.
BEGIN;
INSERT INTO companyprojects (id, userid, companyid, name, allowremote)
SELECT ('f1520000-0000-7000-8000-' || lpad(to_hex(1000000 + g), 12, '0'))::uuid, 'f1520000-0000-7000-8000-000000000011', 'f1520000-0000-7000-8000-000000000001', 'bulk-own-' || g, true FROM generate_series(1, 5000) AS g;
-- 500 client Projects with a whole-Project assignment each under engagement E1
INSERT INTO companyprojects (id, userid, companyid, name, allowremote)
SELECT ('f1520000-0000-7000-8000-' || lpad(to_hex(2000000 + g), 12, '0'))::uuid, 'f1520000-0000-7000-8000-000000000021', 'f1520000-0000-7000-8000-000000000002', 'bulk-c1-' || g, true FROM generate_series(1, 500) AS g;
INSERT INTO engagementassignments (id, engagementid, scopeid, projectid, addedbyid)
SELECT ('f1520000-0000-7000-8000-' || lpad(to_hex(3000000 + g), 12, '0'))::uuid, 'f1520000-0000-7000-8000-000000000e01', NULL, ('f1520000-0000-7000-8000-' || lpad(to_hex(2000000 + g), 12, '0'))::uuid, 'f1520000-0000-7000-8000-000000000021' FROM generate_series(1, 500) AS g;
-- 500 users with 20 revoked devices each = 10000 device rows
INSERT INTO userprofiles (id, emailaddr, fullname, password, active, usertype, companyid)
SELECT ('f1520000-0000-7000-8000-' || lpad(to_hex(4000000 + g), 12, '0'))::uuid, 'f152-bulk-' || g || '@example.test', 'Bulk ' || g, '$2b$10$FIXTUREFIXTUREFIXTUREFIXTUREFIXTUREFIXTUREFIXTUREFIXTURE', true, 'TEAM_MEMBER', 'f1520000-0000-7000-8000-000000000001' FROM generate_series(1, 500) AS g;
INSERT INTO agentdevicetokens (id, userid, companyid, devicename, tokenhash, createdat, revokedat, revokedbyid, revokereason)
SELECT ('f1520000-0000-7000-8000-' || lpad(to_hex(5000000 + (u * 100) + k), 12, '0'))::uuid, ('f1520000-0000-7000-8000-' || lpad(to_hex(4000000 + u), 12, '0'))::uuid, 'f1520000-0000-7000-8000-000000000001', 'bulk-' || u || '-' || k, encode(sha256(convert_to('f152-bulk-' || u || '-' || k, 'UTF8')), 'hex'), now() - interval '10 days', now() - interval '5 days', 'f1520000-0000-7000-8000-000000000011', 'revoked' FROM generate_series(1, 500) AS u, generate_series(1, 20) AS k;
COMMIT;
ANALYZE companyprojects; ANALYZE engagementassignments; ANALYZE agentdevicetokens;
