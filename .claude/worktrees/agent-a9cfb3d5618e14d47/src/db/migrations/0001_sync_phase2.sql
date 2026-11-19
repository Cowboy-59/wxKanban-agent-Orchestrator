-- 0001_sync_phase2: idempotent baseline-sync migration.
-- Generated 2026-04-18 to close the drift between drizzle's stale 0000_baseline
-- snapshot and the live DB. All objects here already exist in production (they
-- were applied out-of-band, e.g. 0019_create_projectproposals.sql). This file
-- uses IF NOT EXISTS / DO-blocks so it is a no-op when re-run.

CREATE TABLE IF NOT EXISTS "complianceflags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taskid" uuid NOT NULL,
	"ruletype" varchar(50) NOT NULL,
	"triggeredbyid" uuid,
	"flaggedat" timestamp DEFAULT now() NOT NULL,
	"resolvedat" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projectproposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companyid" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"estimatedeffort" varchar(100),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"rejectionreason" text,
	"proposeddate" timestamp DEFAULT now() NOT NULL,
	"source" varchar(255) NOT NULL,
	"projectid" uuid,
	"createdbyid" uuid NOT NULL,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "complianceflags" ADD CONSTRAINT "complianceflags_taskid_projecttasks_id_fk" FOREIGN KEY ("taskid") REFERENCES "public"."projecttasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "complianceflags" ADD CONSTRAINT "complianceflags_triggeredbyid_userprofiles_id_fk" FOREIGN KEY ("triggeredbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "projectproposals" ADD CONSTRAINT "projectproposals_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "projectproposals" ADD CONSTRAINT "projectproposals_projectid_companyprojects_id_fk" FOREIGN KEY ("projectid") REFERENCES "public"."companyprojects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "projectproposals" ADD CONSTRAINT "projectproposals_createdbyid_userprofiles_id_fk" FOREIGN KEY ("createdbyid") REFERENCES "public"."userprofiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_complianceflags_taskid" ON "complianceflags" USING btree ("taskid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_complianceflags_ruletype" ON "complianceflags" USING btree ("ruletype");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_complianceflags_resolvedat" ON "complianceflags" USING btree ("resolvedat");
