-- [SCOPE 111 / T009] Test Suite Lifecycle — AI execution, user signoff, release gating.
--
-- Strictly ADDITIVE and idempotent: new tables plus new nullable/defaulted columns
-- on the existing testplans stub. No existing column changes type and no existing
-- row requires backfill. The two legacy testplans jsonb columns are left in place
-- and unused — the scope-delete cascade and the merge_scope raw-SQL reassignment
-- both reference this table.
--
-- Hand-authored to match this repository's actual practice: drizzle-kit snapshots
-- stop at 0009 while migrations run to 0053, so `generate` cannot diff and would
-- prompt for rename resolution. Keep this file and src/db/schema/* in step by hand.

-- ---------------------------------------------------------------------------
-- T001 — extend testplans
-- ---------------------------------------------------------------------------
ALTER TABLE testplans ADD COLUMN IF NOT EXISTS projectid uuid REFERENCES companyprojects(id) ON DELETE CASCADE;
ALTER TABLE testplans ADD COLUMN IF NOT EXISTS status varchar(50) NOT NULL DEFAULT 'active';
ALTER TABLE testplans ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'ai';
ALTER TABLE testplans ADD COLUMN IF NOT EXISTS generatedbyid uuid REFERENCES userprofiles(id) ON DELETE SET NULL;
ALTER TABLE testplans ADD COLUMN IF NOT EXISTS generatedat timestamp;
ALTER TABLE testplans ADD COLUMN IF NOT EXISTS itemcount integer NOT NULL DEFAULT 0;
ALTER TABLE testplans ADD COLUMN IF NOT EXISTS forcetest boolean NOT NULL DEFAULT false;
ALTER TABLE testplans ADD COLUMN IF NOT EXISTS updatedat timestamp NOT NULL DEFAULT now();

-- One plan per scope (FR-001).
CREATE UNIQUE INDEX IF NOT EXISTS idx_testplans_spec ON testplans (specid);
CREATE INDEX IF NOT EXISTS idx_testplans_project ON testplans (projectid);

-- ---------------------------------------------------------------------------
-- T002 — testplanitems
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testplanitems (
  id                uuid PRIMARY KEY,
  testplanid        uuid NOT NULL REFERENCES testplans(id) ON DELETE CASCADE,
  projectid         uuid NOT NULL REFERENCES companyprojects(id) ON DELETE CASCADE,
  specid            uuid REFERENCES projectspecifications(id) ON DELETE SET NULL,
  taskid            uuid REFERENCES projecttasks(id) ON DELETE SET NULL,
  itemkey           varchar(100) NOT NULL,
  title             varchar(255) NOT NULL,
  requirementid     varchar(50),
  specref           varchar(500),
  fenceref          varchar(100),
  gate              varchar(20) NOT NULL,
  layer             varchar(20) NOT NULL DEFAULT 'app',
  variant           varchar(20) NOT NULL DEFAULT 'happy',
  parentitemid      uuid,
  priority          varchar(10) NOT NULL DEFAULT 'P2',
  risktier          varchar(10) NOT NULL DEFAULT 'MEDIUM',
  testlevel         varchar(20) NOT NULL DEFAULT 'integration',
  tier              varchar(20) NOT NULL DEFAULT 'unit-mocked',
  automation        varchar(20) NOT NULL DEFAULT 'automatable',
  automationref     varchar(500),
  blockedreason     text,
  executor          varchar(10) NOT NULL,
  origin            varchar(10) NOT NULL DEFAULT 'ai',
  released          boolean NOT NULL DEFAULT false,
  releasedat        timestamp,
  forcetest         boolean,
  lastresultstatus  varchar(20),
  lastresultat      timestamp,
  lastrunid         uuid,
  detail            jsonb NOT NULL,
  createdat         timestamp NOT NULL DEFAULT now(),
  updatedat         timestamp NOT NULL DEFAULT now()
);

-- Re-generation upserts on (plan, itemkey) so results and signoffs survive (FR-007).
CREATE UNIQUE INDEX IF NOT EXISTS idx_testplanitems_plan_itemkey ON testplanitems (testplanid, itemkey);
-- FK target for the testsignoffs composite reference — this is what makes
-- "a person cannot sign a machine test" a database constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_testplanitems_id_executor ON testplanitems (id, executor);
CREATE INDEX IF NOT EXISTS idx_testplanitems_plan ON testplanitems (testplanid);
CREATE INDEX IF NOT EXISTS idx_testplanitems_spec ON testplanitems (specid);
CREATE INDEX IF NOT EXISTS idx_testplanitems_project_gate ON testplanitems (projectid, executor, forcetest);

-- ---------------------------------------------------------------------------
-- T003 — testitemsubjects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testitemsubjects (
  id          uuid PRIMARY KEY,
  itemid      uuid NOT NULL REFERENCES testplanitems(id) ON DELETE CASCADE,
  projectid   uuid NOT NULL REFERENCES companyprojects(id) ON DELETE CASCADE,
  sourcepath  varchar(500) NOT NULL,
  sourceline  integer,
  unitid      varchar(500),
  role        varchar(20) NOT NULL DEFAULT 'primary',
  createdat   timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_testitemsubjects_item_source ON testitemsubjects (itemid, sourcepath);
CREATE INDEX IF NOT EXISTS idx_testitemsubjects_item ON testitemsubjects (itemid);
CREATE INDEX IF NOT EXISTS idx_testitemsubjects_project_source ON testitemsubjects (projectid, sourcepath);

-- ---------------------------------------------------------------------------
-- T004 — testcycles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testcycles (
  id                      uuid PRIMARY KEY,
  projectid               uuid NOT NULL REFERENCES companyprojects(id) ON DELETE CASCADE,
  version                 varchar(50) NOT NULL,
  status                  varchar(20) NOT NULL DEFAULT 'open',
  commitsha               varchar(100),
  buildref                varchar(255),
  openedat                timestamp NOT NULL DEFAULT now(),
  promotedtouatat         timestamp,
  promotedtoproductionat  timestamp,
  supersededat            timestamp,
  promotedbyid            uuid REFERENCES userprofiles(id) ON DELETE SET NULL,
  notes                   text,
  createdat               timestamp NOT NULL DEFAULT now()
);

-- One cycle per project per version — makes "open on first sight" safe under
-- concurrent callers.
CREATE UNIQUE INDEX IF NOT EXISTS idx_testcycles_project_version ON testcycles (projectid, version);
CREATE INDEX IF NOT EXISTS idx_testcycles_project_status ON testcycles (projectid, status);

-- ---------------------------------------------------------------------------
-- T005 — testruns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testruns (
  id               uuid PRIMARY KEY,
  cycleid          uuid NOT NULL REFERENCES testcycles(id) ON DELETE CASCADE,
  projectid        uuid NOT NULL REFERENCES companyprojects(id) ON DELETE CASCADE,
  testplanid       uuid REFERENCES testplans(id) ON DELETE SET NULL,
  specid           uuid REFERENCES projectspecifications(id) ON DELETE SET NULL,
  runnertype       varchar(20) NOT NULL,
  runnerref        varchar(500),
  isregression     boolean NOT NULL DEFAULT false,
  gate             varchar(20),
  environment      varchar(20) NOT NULL DEFAULT 'local',
  status           varchar(20) NOT NULL DEFAULT 'queued',
  startedat        timestamp NOT NULL DEFAULT now(),
  endedat          timestamp,
  lastheartbeatat  timestamp NOT NULL DEFAULT now(),
  totalitems       integer NOT NULL DEFAULT 0,
  passeditems      integer NOT NULL DEFAULT 0,
  faileditems      integer NOT NULL DEFAULT 0,
  skippeditems     integer NOT NULL DEFAULT 0,
  blockeditems     integer NOT NULL DEFAULT 0,
  declareditemids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  currentitemid    uuid,
  triggeredbyid    uuid REFERENCES userprofiles(id) ON DELETE SET NULL,
  createdat        timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_testruns_cycle ON testruns (cycleid);
CREATE INDEX IF NOT EXISTS idx_testruns_project_started ON testruns (projectid, startedat);
CREATE INDEX IF NOT EXISTS idx_testruns_status ON testruns (projectid, status);

-- ---------------------------------------------------------------------------
-- T006 — testrunresults
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testrunresults (
  id           uuid PRIMARY KEY,
  runid        uuid NOT NULL REFERENCES testruns(id) ON DELETE CASCADE,
  itemid       uuid NOT NULL REFERENCES testplanitems(id) ON DELETE CASCADE,
  cycleid      uuid NOT NULL REFERENCES testcycles(id) ON DELETE CASCADE,
  status       varchar(20) NOT NULL,
  bucket       varchar(20),
  evidence     text,
  durationms   integer,
  bugreportid  uuid REFERENCES feedbacksubmissions(id) ON DELETE SET NULL,
  startedat    timestamp,
  endedat      timestamp,
  createdat    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_testrunresults_run ON testrunresults (runid);
-- The regression baseline lookup: an item's OWN results, newest first (FR-052).
CREATE INDEX IF NOT EXISTS idx_testrunresults_item_created ON testrunresults (itemid, createdat);
CREATE INDEX IF NOT EXISTS idx_testrunresults_cycle ON testrunresults (cycleid);

-- ---------------------------------------------------------------------------
-- T007 — testsignoffs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testsignoffs (
  id                     uuid PRIMARY KEY,
  cycleid                uuid NOT NULL REFERENCES testcycles(id) ON DELETE CASCADE,
  itemid                 uuid NOT NULL,
  itemexecutor           varchar(10) NOT NULL,
  signofftype            varchar(10) NOT NULL,
  status                 varchar(20) NOT NULL,
  signedbyid             uuid REFERENCES userprofiles(id) ON DELETE SET NULL,
  signedbylabel          varchar(100),
  runid                  uuid REFERENCES testruns(id) ON DELETE SET NULL,
  signedagainstversion   varchar(50),
  signedagainstbuildref  varchar(255),
  notes                  text,
  superseded             boolean NOT NULL DEFAULT false,
  supersededat           timestamp,
  signedat               timestamp NOT NULL DEFAULT now(),
  createdat              timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fk_testsignoffs_item_executor
    FOREIGN KEY (itemid, itemexecutor)
    REFERENCES testplanitems (id, executor) ON DELETE CASCADE,
  -- The only two legal pairings. A human signoff on a machine test, or an AI
  -- signoff on a human test, is refused by the database (FR-018).
  CONSTRAINT chk_testsignoffs_executor_match CHECK (
       (itemexecutor = 'machine' AND signofftype = 'ai')
    OR (itemexecutor = 'human'   AND signofftype = 'user')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_testsignoffs_item_cycle_type ON testsignoffs (itemid, cycleid, signofftype);
CREATE INDEX IF NOT EXISTS idx_testsignoffs_item ON testsignoffs (itemid, signofftype);
CREATE INDEX IF NOT EXISTS idx_testsignoffs_cycle ON testsignoffs (cycleid);

-- ---------------------------------------------------------------------------
-- T008 — testretests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testretests (
  id                uuid PRIMARY KEY,
  cycleid           uuid NOT NULL REFERENCES testcycles(id) ON DELETE CASCADE,
  itemid            uuid NOT NULL REFERENCES testplanitems(id) ON DELETE CASCADE,
  reason            varchar(20) NOT NULL,
  triggerpath       varchar(500),
  triggerfence      varchar(100),
  triggerunit       varchar(500),
  reachedsubjectid  uuid REFERENCES testitemsubjects(id) ON DELETE SET NULL,
  chain             text,
  pathlength        integer,
  appliedat         timestamp NOT NULL DEFAULT now(),
  resolution        varchar(20),
  resolvedat        timestamp,
  dismissedbyid     uuid REFERENCES userprofiles(id) ON DELETE SET NULL,
  dismissreason     text,
  createdat         timestamp NOT NULL DEFAULT now()
);

-- One mark per item per cycle — a change reaching an item by five paths is still
-- one request to re-test it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_testretests_cycle_item ON testretests (cycleid, itemid);
-- The gate's lookup: unanswered marks in the current cycle.
CREATE INDEX IF NOT EXISTS idx_testretests_cycle_resolution ON testretests (cycleid, resolution);
CREATE INDEX IF NOT EXISTS idx_testretests_item ON testretests (itemid);
