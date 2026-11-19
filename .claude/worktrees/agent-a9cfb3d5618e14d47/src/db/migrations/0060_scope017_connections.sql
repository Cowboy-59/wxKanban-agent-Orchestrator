-- [SCOPE 017 / T001] BEGIN — external PM connections, audit, sync history, health
-- SCOPE-017 / T001–T004 — the external PM connection layer. Unblocked by SCOPE-119,
-- which supplied the `customers` table these all reference.
--
-- Strictly ADDITIVE: four new tables, no change to anything existing. Safe to
-- re-run; every statement is IF NOT EXISTS.
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` (SCOPE-117). The local .env
-- DATABASE_URL points at PRODUCTION.
--
--   1. Apply this file.
--   2. Verify:  npm run db:drift   (must exit 0)
--   3. THEN deploy the Drizzle declarations in src/db/schema/.
--   4. Record in specs/117-production-schema-integrity/schema-change-log.md
-- ============================================================================
--
-- TWO CORRECTIONS to the DDL in specs/017-consultant-dashboard/data-model.md:
--
-- 1. `users(id)` does not exist. The real table is `userprofiles`. The original
--    would have failed on its first foreign key.
--
-- 2. `credentialauditlogs.connectionid ... ON DELETE CASCADE` contradicted the
--    scope's own requirement that audit logs be "immutable and retained for 90
--    days minimum" (SCOPE-017 line 672). Under CASCADE, deleting a connection
--    destroys its entire credential-access trail — which hands anyone wanting to
--    erase evidence of credential access a one-step way to do it. Corrected to
--    SET NULL with denormalised name/email snapshots, so the record survives the
--    deletion of everything it points at. An audit log that can be deleted by
--    deleting its subject is not an audit log.

-- ---------------------------------------------------------------------------
-- externalconnections — a customer's PM system, with encrypted credentials.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS externalconnections (
  id UUID PRIMARY KEY,
  customerid UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- CASCADE is correct here: credentials scoped PERSONAL are the consultant's own,
  -- and deleting the user should destroy them rather than leave orphaned secrets.
  consultantid UUID NOT NULL REFERENCES userprofiles(id) ON DELETE CASCADE,
  companyid UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  systemtype VARCHAR(50) NOT NULL
    CHECK (systemtype IN ('jira','monday','trello','asana','azuredevops','custom')),
  apiendpoint VARCHAR(500) NOT NULL,
  -- AES-256-GCM. Stored as iv:authtag:ciphertext — never a raw secret, and never
  -- returned by any endpoint (FR-007).
  credentialsencrypted TEXT NOT NULL,
  credentialscope VARCHAR(20) NOT NULL DEFAULT 'PERSONAL'
    CHECK (credentialscope IN ('PERSONAL','TEAM')),
  status VARCHAR(20) NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected','disconnected','error')),
  lastsyncat TIMESTAMP,
  lastsyncresult JSONB,
  healthstatus VARCHAR(20) DEFAULT 'unknown'
    CHECK (healthstatus IN ('healthy','warning','error','unknown')),
  healthcheckedat TIMESTAMP,
  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deletedat TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_externalconnections_customerid   ON externalconnections(customerid);
CREATE INDEX IF NOT EXISTS idx_externalconnections_consultantid ON externalconnections(consultantid);
CREATE INDEX IF NOT EXISTS idx_externalconnections_companyid    ON externalconnections(companyid);
CREATE INDEX IF NOT EXISTS idx_externalconnections_status       ON externalconnections(status);
CREATE INDEX IF NOT EXISTS idx_externalconnections_healthstatus ON externalconnections(healthstatus);

-- ---------------------------------------------------------------------------
-- credentialauditlogs — every credential access, retained independently.
--
-- NOTHING cascades into this table. Both foreign keys are nullable with SET NULL,
-- and each carries a denormalised snapshot, so a row remains readable after the
-- connection AND the user it refers to are gone. That is the whole point of an
-- audit log: it outlives its subject.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credentialauditlogs (
  id UUID PRIMARY KEY,
  connectionid UUID REFERENCES externalconnections(id) ON DELETE SET NULL,
  connectionname VARCHAR(255) NOT NULL,   -- snapshot, survives the connection
  userid UUID REFERENCES userprofiles(id) ON DELETE SET NULL,
  useremail VARCHAR(255) NOT NULL,        -- snapshot, survives the user
  companyid UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL
    CHECK (action IN ('view','edit','test','delete','synctrigger','synccomplete')),
  actionresult VARCHAR(20) NOT NULL CHECK (actionresult IN ('success','failure')),
  ipaddress INET,
  useragent TEXT,
  details JSONB,
  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credentialauditlogs_connectionid ON credentialauditlogs(connectionid);
CREATE INDEX IF NOT EXISTS idx_credentialauditlogs_userid       ON credentialauditlogs(userid);
CREATE INDEX IF NOT EXISTS idx_credentialauditlogs_companyid    ON credentialauditlogs(companyid);
CREATE INDEX IF NOT EXISTS idx_credentialauditlogs_createdat    ON credentialauditlogs(createdat);
CREATE INDEX IF NOT EXISTS idx_credentialauditlogs_action       ON credentialauditlogs(action);

-- ---------------------------------------------------------------------------
-- synchistory — operational record of sync runs. CASCADE is correct here: this
-- is not audit data, and it is meaningless once its connection is gone.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synchistory (
  id UUID PRIMARY KEY,
  connectionid UUID NOT NULL REFERENCES externalconnections(id) ON DELETE CASCADE,
  triggeredby UUID REFERENCES userprofiles(id) ON DELETE SET NULL,
  synctype VARCHAR(20) NOT NULL CHECK (synctype IN ('incremental','full','automatic')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending','running','completed','failed')),
  startedat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completedat TIMESTAMP,
  itemsprocessed INTEGER NOT NULL DEFAULT 0,
  itemsadded INTEGER NOT NULL DEFAULT 0,
  itemsupdated INTEGER NOT NULL DEFAULT 0,
  itemsfailed INTEGER NOT NULL DEFAULT 0,
  errormessage TEXT,
  syncresult JSONB
);

CREATE INDEX IF NOT EXISTS idx_synchistory_connectionid ON synchistory(connectionid);
CREATE INDEX IF NOT EXISTS idx_synchistory_status       ON synchistory(status);
CREATE INDEX IF NOT EXISTS idx_synchistory_startedat    ON synchistory(startedat);

-- ---------------------------------------------------------------------------
-- connectionhealth — health-check results. Operational; CASCADE is correct.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connectionhealth (
  id UUID PRIMARY KEY,
  connectionid UUID NOT NULL REFERENCES externalconnections(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('healthy','warning','error')),
  checktype VARCHAR(20) NOT NULL CHECK (checktype IN ('automatic','manual')),
  responsetimems INTEGER,
  errorcode VARCHAR(100),
  errormessage TEXT,
  checkedat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_connectionhealth_connectionid ON connectionhealth(connectionid);
CREATE INDEX IF NOT EXISTS idx_connectionhealth_checkedat    ON connectionhealth(checkedat);

-- ---------------------------------------------------------------------------
-- Verification — expect 4, then 1 for each table.
-- ---------------------------------------------------------------------------
-- SELECT count(*) FROM information_schema.tables
--   WHERE table_name IN ('externalconnections','credentialauditlogs','synchistory','connectionhealth');
--
-- Confirm the audit log does NOT cascade (expect 'SET NULL' twice):
-- SELECT rc.delete_rule, kcu.column_name
--   FROM information_schema.referential_constraints rc
--   JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
--  WHERE kcu.table_name = 'credentialauditlogs' AND kcu.column_name IN ('connectionid','userid');

-- ---------------------------------------------------------------------------
-- Rollback — safe only before the Drizzle declarations deploy and while empty.
-- Order matters: children first.
-- ---------------------------------------------------------------------------
-- DROP TABLE IF EXISTS connectionhealth;
-- DROP TABLE IF EXISTS synchistory;
-- DROP TABLE IF EXISTS credentialauditlogs;
-- DROP TABLE IF EXISTS externalconnections;
-- [SCOPE 017 / T001] END
