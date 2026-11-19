-- [SCOPE 005 / T001] BEGIN — Time and Billing schema (SCOPE-005 Amendment A; FR-002, FR-005, FR-007, FR-008, FR-009, FR-011, FR-012)
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` against this database (SCOPE-117):
-- it reconciles the database TO the declared schema and would propose dropping the
-- ~19 undeclared-but-live tables, including `marketingcontacts`.
--
-- The local `DATABASE_URL` names `wxkanban_app`, which does not own these tables.
-- An apply with the local credential is refused with `must be owner of table ...`
-- and rolls back cleanly (H-9 least privilege). Use the owner connection.
-- ============================================================================
--
-- WHAT THIS IS FOR
--
-- The Time & Billing page (/admin/time-billing) and the per-client statement. Time
-- entries stop requiring a task: an entry now sits on a scope line or on one of the
-- project's Brainstorming / Processes lines, is Developer or Resource time, and is
-- locked to the statement that billed it. Rates and ACH details live on the company,
-- the billed flag and rate overrides on the project, the billing cycle on the Customer.
--
-- SAFETY
--
-- Additive, one transaction, idempotent (every statement is IF NOT EXISTS or guarded),
-- so a failure part-way leaves nothing behind and re-running is a no-op.
--   * ADD COLUMN with a constant default (PG 11+) does not rewrite the table.
--   * `projecttimeentries.taskid` DROP NOT NULL relaxes a constraint; no data changes.
--   * `companies.hourlyrate` SET DEFAULT 150.00 affects NEW companies only. Existing
--     companies with NULL keep NULL; the application falls back to 150.00 (FR-008).
--     No billing data is backfilled.
--   * Foreign keys and CHECKs are added NOT VALID, then validated separately, so the
--     lock stays short regardless of table size. Every new column is NULL or defaulted
--     on existing rows, so validation cannot fail. Legacy task-timer entries have a NULL
--     `category` and pass every CHECK; they are excluded from the page by the app.
--   * Indexes are built inside the transaction (not CONCURRENTLY); projecttimeentries
--     and projectinvoices are small.
--   * No change to `agentruns` (owned by SPEC-143). No column holds prompt text, code
--     or file contents.
--
-- ORDER: apply and verify this BEFORE SPEC-005 T002 declares any of these columns in
-- src/db/schema/. Drizzle names every declared column in each SELECT, and `companies`
-- is read on nearly every authenticated request, so declaring first returns 500 across
-- the whole application (42703 column does not exist).
--
-- VERIFY: `npm run db:drift` compares TABLES only and passes whether or not these
-- columns exist. Run the column-level checks in the VERIFY block at the end of this file.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- companies — Resource rate and ACH details (FR-008, FR-012)
-- `hourlyrate` is reused as the company's default Developer rate.
-- ACH values are AES-256-GCM ciphertext from src/server/lib/crypto.ts, never plain text.
-- ---------------------------------------------------------------------------
ALTER TABLE "companies" ALTER COLUMN "hourlyrate" SET DEFAULT 150.00;

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "resourcerate"     numeric(10,2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS "achbankname"      text,
  ADD COLUMN IF NOT EXISTS "achroutingnumber" text,
  ADD COLUMN IF NOT EXISTS "achaccountnumber" text,
  ADD COLUMN IF NOT EXISTS "achaccountname"   text;

COMMENT ON COLUMN "companies"."resourcerate" IS
  'SPEC-005 FR-008: default Resource (AI agent) hourly rate. A project may override it (companyprojects.resourcerate).';
COMMENT ON COLUMN "companies"."achroutingnumber" IS
  'SPEC-005 FR-012: AES-256-GCM ciphertext (src/server/lib/crypto.ts). Never plain text, never logged.';
COMMENT ON COLUMN "companies"."achaccountnumber" IS
  'SPEC-005 FR-012: AES-256-GCM ciphertext (src/server/lib/crypto.ts). Never plain text, never logged; masked to last 4 except on the statement.';

-- ---------------------------------------------------------------------------
-- companyprojects — billed flag and Resource rate override (FR-002, FR-008)
-- `hourlyrate` is reused as the project's Developer rate override.
-- ---------------------------------------------------------------------------
ALTER TABLE "companyprojects"
  ADD COLUMN IF NOT EXISTS "billed"       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "resourcerate" numeric(10,2);

COMMENT ON COLUMN "companyprojects"."billed" IS
  'SPEC-005 FR-002: "Bill this project". Only billed projects with a Customer appear on statements.';

-- ---------------------------------------------------------------------------
-- customers — statement period (FR-009)
-- ---------------------------------------------------------------------------
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "billingcycle" varchar(10) NOT NULL DEFAULT 'weekly';

-- ---------------------------------------------------------------------------
-- projectinvoices — a statement is per Customer and period (FR-009)
-- `projectid` is already nullable: one statement covers all of a Customer's billed projects.
-- ---------------------------------------------------------------------------
ALTER TABLE "projectinvoices"
  ADD COLUMN IF NOT EXISTS "customerid"     uuid,
  ADD COLUMN IF NOT EXISTS "periodstart"    date,
  ADD COLUMN IF NOT EXISTS "periodend"      date,
  ADD COLUMN IF NOT EXISTS "developerhours" numeric(10,2),
  ADD COLUMN IF NOT EXISTS "resourcehours"  numeric(10,2);

-- ---------------------------------------------------------------------------
-- projecttimeentries — entries on scope and project lines (FR-005, FR-007, FR-009, FR-011)
-- `duration` stays integer minutes, rounded up to a multiple of 15 by the app.
-- ---------------------------------------------------------------------------
ALTER TABLE "projecttimeentries" ALTER COLUMN "taskid" DROP NOT NULL;

ALTER TABLE "projecttimeentries"
  ADD COLUMN IF NOT EXISTS "specid"        uuid,
  ADD COLUMN IF NOT EXISTS "category"      varchar(10),
  ADD COLUMN IF NOT EXISTS "line"          varchar(12),
  ADD COLUMN IF NOT EXISTS "model"         varchar(100),
  ADD COLUMN IF NOT EXISTS "enteredbyid"   uuid,
  ADD COLUMN IF NOT EXISTS "invoiceid"     uuid,
  ADD COLUMN IF NOT EXISTS "workdate"      date,
  ADD COLUMN IF NOT EXISTS "resourcecount" integer;

COMMENT ON COLUMN "projecttimeentries"."category" IS
  'SPEC-005: developer | resource. NULL = legacy task-timer entry, excluded from Time & Billing and statements.';
COMMENT ON COLUMN "projecttimeentries"."line" IS
  'SPEC-005 FR-003: scope (specid set) | brainstorm | process.';
COMMENT ON COLUMN "projecttimeentries"."workdate" IS
  'SPEC-005: the day the work counts on. Statements bucket by this, never by the no-tz starttime.';
COMMENT ON COLUMN "projecttimeentries"."invoiceid" IS
  'SPEC-005 FR-011: the statement that billed this entry. Set = read-only.';
COMMENT ON COLUMN "projecttimeentries"."resourcecount" IS
  'SPEC-005 FR-009: agents behind a Resource entry (distinct agent runs for an agent-pull entry, 1 for a manual entry). NULL for Developer entries.';

-- ---------------------------------------------------------------------------
-- Foreign keys (NOT VALID, then VALIDATE) and CHECKs.
--   invoiceid, projectinvoices.customerid  RESTRICT — a statement cannot be deleted out
--     from under its locked entries; customers are archive-only (as in 0059).
--   specid, enteredbyid                    SET NULL — the time survives the scope or person.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('projecttimeentries', 'projecttimeentries_specid_projectspecifications_id_fk',
       'FOREIGN KEY ("specid") REFERENCES "public"."projectspecifications"("id") ON DELETE SET NULL ON UPDATE NO ACTION'),
      ('projecttimeentries', 'projecttimeentries_enteredbyid_userprofiles_id_fk',
       'FOREIGN KEY ("enteredbyid") REFERENCES "public"."userprofiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION'),
      ('projecttimeentries', 'projecttimeentries_invoiceid_projectinvoices_id_fk',
       'FOREIGN KEY ("invoiceid") REFERENCES "public"."projectinvoices"("id") ON DELETE RESTRICT ON UPDATE NO ACTION'),
      ('projectinvoices', 'projectinvoices_customerid_customers_id_fk',
       'FOREIGN KEY ("customerid") REFERENCES "public"."customers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION'),
      ('projecttimeentries', 'projecttimeentries_category_check',
       'CHECK ("category" IS NULL OR "category" IN (''developer'', ''resource''))'),
      ('projecttimeentries', 'projecttimeentries_line_check',
       'CHECK ("line" IS NULL OR "line" IN (''scope'', ''brainstorm'', ''process''))'),
      ('projecttimeentries', 'projecttimeentries_resource_model_check',
       'CHECK ("category" IS DISTINCT FROM ''resource'' OR "model" IS NOT NULL)'),
      ('projecttimeentries', 'projecttimeentries_resourcecount_check',
       'CHECK ("resourcecount" IS NULL OR "resourcecount" >= 0)'),
      ('projecttimeentries', 'projecttimeentries_negative_needs_note_check',
       'CHECK ("duration" IS NULL OR "duration" >= 0 OR length(btrim(coalesce("notes", ''''))) > 0)'),
      ('customers', 'customers_billingcycle_check',
       'CHECK ("billingcycle" IN (''weekly'', ''biweekly''))')
    ) AS t(tbl, name, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s NOT VALID', c.tbl, c.name, c.def);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name AND NOT convalidated) THEN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', c.tbl, c.name);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- FR-007: the daily agent pull writes one entry per (project, line, scope, day, model).
-- COALESCE because Brainstorming/Processes entries have no specid and PostgreSQL treats
-- NULLs as distinct, which would let a re-pull duplicate them.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_projecttimeentries_agentpull"
  ON "projecttimeentries" (
    "projectid",
    "line",
    COALESCE("specid", '00000000-0000-0000-0000-000000000000'::uuid),
    "workdate",
    "model"
  )
  WHERE "source" = 'agentrun';

-- FR-003/FR-004: totals by company and date range (Time & Billing entries only).
CREATE INDEX IF NOT EXISTS "idx_projecttimeentries_company_workdate"
  ON "projecttimeentries" ("companyid", "workdate")
  WHERE "category" IS NOT NULL;

-- FR-011: locked-entry lookups, and the RESTRICT check when a statement is deleted.
CREATE INDEX IF NOT EXISTS "idx_projecttimeentries_invoice"
  ON "projecttimeentries" ("invoiceid")
  WHERE "invoiceid" IS NOT NULL;

-- FR-009: a Customer's last statement (the next period starts the day after it).
CREATE INDEX IF NOT EXISTS "idx_projectinvoices_customer_periodend"
  ON "projectinvoices" ("customerid", "periodend" DESC)
  WHERE "customerid" IS NOT NULL;

COMMIT;

-- ============================================================================
-- VERIFY (read-only; run after COMMIT)
--
-- 1. Columns — expect 23 rows:
--
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and (table_name, column_name) in (
--        ('companies','resourcerate'), ('companies','achbankname'),
--        ('companies','achroutingnumber'), ('companies','achaccountnumber'),
--        ('companies','achaccountname'), ('companies','hourlyrate'),
--        ('companyprojects','billed'), ('companyprojects','resourcerate'),
--        ('customers','billingcycle'),
--        ('projectinvoices','customerid'), ('projectinvoices','periodstart'),
--        ('projectinvoices','periodend'), ('projectinvoices','developerhours'),
--        ('projectinvoices','resourcehours'),
--        ('projecttimeentries','taskid'), ('projecttimeentries','specid'),
--        ('projecttimeentries','category'), ('projecttimeentries','line'),
--        ('projecttimeentries','model'), ('projecttimeentries','enteredbyid'),
--        ('projecttimeentries','invoiceid'), ('projecttimeentries','workdate'),
--        ('projecttimeentries','resourcecount'))
--    order by 1, 2;
--
--   -- Spot checks:
--   --   companies.hourlyrate        default 150.00
--   --   companies.resourcerate      NO  default 50.00
--   --   companyprojects.billed      NO  default false
--   --   customers.billingcycle      NO  default 'weekly'
--   --   projecttimeentries.taskid   YES (was NO)
--
-- 2. Constraints — expect 10 rows, every convalidated = true:
--
--   select conname, convalidated
--     from pg_constraint
--    where conname in (
--      'projecttimeentries_specid_projectspecifications_id_fk',
--      'projecttimeentries_enteredbyid_userprofiles_id_fk',
--      'projecttimeentries_invoiceid_projectinvoices_id_fk',
--      'projectinvoices_customerid_customers_id_fk',
--      'projecttimeentries_category_check',
--      'projecttimeentries_line_check',
--      'projecttimeentries_resource_model_check',
--      'projecttimeentries_resourcecount_check',
--      'projecttimeentries_negative_needs_note_check',
--      'customers_billingcycle_check')
--    order by 1;
--
-- 3. Indexes — expect 4 rows:
--
--   select indexname from pg_indexes
--    where schemaname = 'public'
--      and indexname in ('idx_projecttimeentries_agentpull',
--                        'idx_projecttimeentries_company_workdate',
--                        'idx_projecttimeentries_invoice',
--                        'idx_projectinvoices_customer_periodend')
--    order by 1;
--
-- 4. Existing rows untouched — expect 0:
--
--   select count(*) from projecttimeentries where category is not null;
--
-- 5. npm run db:drift — exit 0.
-- ============================================================================

-- [SCOPE 005 / T001] END
