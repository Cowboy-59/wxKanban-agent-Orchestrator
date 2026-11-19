-- [SCOPE 119 / T001] BEGIN — customers table + companyprojects.customerid (SCOPE-119 FR-010)
-- SCOPE-119 / T001 — the Customer record a consultant keeps for a client, and the
-- optional link from a Project to that client.
--
-- WHY THIS EXISTS: SPEC-017 declared `customers` under "Existing Infrastructure" and it
-- was never true. Its four connection tables (externalconnections, credentialauditlogs,
-- synchistory, connectionhealth) every one declare `customerid ... REFERENCES customers(id)`,
-- so SPEC-017 Phase 1 cannot run at all until this file has been applied. The Consultant
-- Dashboard shipped 2026-07-31 without its Customers rail for the same reason.
--
-- Strictly ADDITIVE and idempotent. One new table, and one NULLABLE column on one existing
-- table. No existing column changes type, nothing needs backfill, and every existing
-- companyprojects row keeps working with customerid NULL — a project that was never
-- assigned to a customer behaves exactly as it does today. Safe to re-run: every statement
-- is IF NOT EXISTS.
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` against this database (SCOPE-117).
-- The local .env DATABASE_URL points at PRODUCTION, and push would propose dropping
-- the ~19 undeclared-but-live tables, including marketingcontacts.
--
-- ORDER MATTERS — reversing it takes production down:
--
--   1. Apply THIS FILE to the database.
--   2. Verify:  npm run db:drift        (must exit 0)
--   3. THEN declare `customerid` in src/db/schema/companyproject.ts and deploy.
--
-- Drizzle emits every DECLARED column in its SELECT list. If the schema declaration
-- ships before this DDL lands, every query touching companyprojects — the Consultant
-- Dashboard, the Work Hub, the project list — fails with 42703 "column does not exist"
-- until the DDL catches up. This is the mirror image of the DROP COLUMN hazard.
--
--   4. Record the change in specs/117-production-schema-integrity/schema-change-log.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- customers — a consultant-owned CRM record. NOT a tenant, NOT an Engagement.
-- It carries no login, no seat, and grants no access to anything (SCOPE-119 FR-004).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  -- No DEFAULT on purpose. The application supplies a UUID v7 via
  -- $defaultFn(() => uuidv7()), matching the nine tables that already do this.
  -- A gen_random_uuid() default would silently emit v4 rows on any insert
  -- made outside the app.
  id UUID PRIMARY KEY,

  -- RESTRICT, not CASCADE (SCOPE-119 Clarification 6). CASCADE — what SPEC-017
  -- drafted — would let deleting a departing consultant destroy their customer
  -- rows, making every invoice that references those clients unresolvable.
  -- RESTRICT converts that silent data loss into a blocked offboarding, which
  -- FR-011's transfer flow exists to unblock.
  consultantid UUID NOT NULL REFERENCES userprofiles(id) ON DELETE RESTRICT,

  -- Tenant scoping. The consulting company this record belongs to.
  companyid UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- OPTIONAL link to a wxKanban tenant, for the case where the client is also a
  -- customer of ours (SCOPE-119 FR-004). NULL is the normal case. SET NULL on
  -- delete is deliberate: if that tenant is ever removed, the consultant's own
  -- record survives as an ordinary unlinked customer. Cascading here would
  -- destroy one user's data because of an event in someone else's account.
  clientcompanyid UUID REFERENCES companies(id) ON DELETE SET NULL,

  name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  billingaddress TEXT,
  taxid VARCHAR(100),

  -- Soft archive only (FR-003). There is deliberately no DELETE path: time
  -- entries and invoices reference these rows.
  archivedat TIMESTAMP,

  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_consultantid
  ON customers(consultantid);
CREATE INDEX IF NOT EXISTS idx_customers_companyid
  ON customers(companyid);
CREATE INDEX IF NOT EXISTS idx_customers_clientcompanyid
  ON customers(clientcompanyid);

-- Name uniqueness is per consultant (FR-001, Clarification 8) and PARTIAL — it
-- applies only to live rows, so archiving a customer frees the name for reuse
-- rather than reserving it forever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_consultant_name_live
  ON customers (consultantid, lower(name))
  WHERE archivedat IS NULL;

-- ---------------------------------------------------------------------------
-- companyprojects.customerid — a Project belongs to at most ONE Customer (FR-006).
--
-- One-to-many, not many-to-many: a time entry rolls up to a project, and if that
-- project had two customers nothing could say which one to invoice. A genuinely
-- shared engagement is modelled as two projects.
--
-- Nullable and unconstrained by default, so every existing project is untouched.
-- ---------------------------------------------------------------------------
ALTER TABLE companyprojects
  ADD COLUMN IF NOT EXISTS customerid UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_companyprojects_customerid
  ON companyprojects(customerid);

-- ---------------------------------------------------------------------------
-- Verification — run after applying. Expect 1, 5, 1 respectively.
-- The index count is 5, not 4: pg_indexes includes the implicit customers_pkey
-- alongside the four created above.
-- ---------------------------------------------------------------------------
-- SELECT count(*) FROM information_schema.tables
--   WHERE table_name = 'customers';
-- SELECT count(*) FROM pg_indexes
--   WHERE tablename = 'customers';
-- SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'companyprojects' AND column_name = 'customerid';

-- ---------------------------------------------------------------------------
-- Rollback — only safe BEFORE the Drizzle declaration is deployed, and only
-- while customers is still empty. Once rows exist, dropping the table destroys
-- consultant data; once the schema declares customerid, dropping the column
-- produces 42703 on every companyprojects query.
-- ---------------------------------------------------------------------------
-- ALTER TABLE companyprojects DROP COLUMN IF EXISTS customerid;
-- DROP TABLE IF EXISTS customers;
-- [SCOPE 119 / T001] END
