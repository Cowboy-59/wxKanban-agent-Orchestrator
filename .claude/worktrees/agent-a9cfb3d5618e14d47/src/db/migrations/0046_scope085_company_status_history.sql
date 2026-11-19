-- SCOPE-085 (Subscription Reconciliation) remediation.
-- The company_status_history + company_analytics tables were defined in the ORM
-- schema (src/db/schema/companyStatus.ts) and drizzle snapshots, but no .sql
-- migration was ever generated — so they never existed in ANY environment.
-- Consequence: resyncSubscriptionFromStripe (and the sysadmin "Recheck Stripe"
-- button) threw on the audit-row insert AFTER committing the status change,
-- surfacing as a 500 while silently half-applying. This creates both tables.
-- Idempotent (IF NOT EXISTS) + guarded FKs. Applied via the pg.Client transaction pattern.

CREATE TABLE IF NOT EXISTS "company_status_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "previous_status" varchar(50),
  "new_status" varchar(50) NOT NULL,
  "reason" text,
  "changed_at" timestamp DEFAULT now(),
  "changed_by" uuid,
  "changed_by_type" varchar(50) DEFAULT 'SYSADMIN' NOT NULL,
  "metadata" jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_status_history_company_id_companies_id_fk') THEN
    ALTER TABLE "company_status_history"
      ADD CONSTRAINT "company_status_history_company_id_companies_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_status_history_changed_by_userprofiles_id_fk') THEN
    ALTER TABLE "company_status_history"
      ADD CONSTRAINT "company_status_history_changed_by_userprofiles_id_fk"
      FOREIGN KEY ("changed_by") REFERENCES "userprofiles"("id") ON DELETE set null;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_company_status_history_company_id" ON "company_status_history" ("company_id");

CREATE TABLE IF NOT EXISTS "company_analytics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "total_users" integer DEFAULT 0 NOT NULL,
  "active_users" integer DEFAULT 0 NOT NULL,
  "last_login_at" timestamp,
  "total_projects" integer DEFAULT 0 NOT NULL,
  "active_projects" integer DEFAULT 0 NOT NULL,
  "completed_projects" integer DEFAULT 0 NOT NULL,
  "total_tasks" integer DEFAULT 0 NOT NULL,
  "completed_tasks" integer DEFAULT 0 NOT NULL,
  "overdue_tasks" integer DEFAULT 0 NOT NULL,
  "total_hours_logged" integer DEFAULT 0 NOT NULL,
  "billable_hours" integer DEFAULT 0 NOT NULL,
  "mrr" integer DEFAULT 0 NOT NULL,
  "total_billed" integer DEFAULT 0 NOT NULL,
  "total_paid" integer DEFAULT 0 NOT NULL,
  "health_score" integer DEFAULT 0 NOT NULL,
  "calculated_at" timestamp DEFAULT now(),
  "period_start" timestamp,
  "period_end" timestamp,
  "raw_data" jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_analytics_company_id_companies_id_fk') THEN
    ALTER TABLE "company_analytics"
      ADD CONSTRAINT "company_analytics_company_id_companies_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_company_analytics_company_id" ON "company_analytics" ("company_id");
