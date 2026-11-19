-- SCOPE-062 (Project Theme) / T003 — per-project + company-wide visual themes.
-- projectthemes: one active theme per (project, app type).
-- companythemeprofiles: company-wide default theme per app type (≤3 per company).
-- `theme` is the structured ProjectTheme object (jsonb), not markdown.
-- Applied via the pg.Client transaction pattern. ids generated app-side (uuid v7).

CREATE TABLE IF NOT EXISTS "projectthemes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"projectid" uuid NOT NULL,
	"apptype" varchar(20) NOT NULL,
	"theme" jsonb NOT NULL,
	"createdbyid" uuid,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companythemeprofiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"companyid" uuid NOT NULL,
	"apptype" varchar(20) NOT NULL,
	"theme" jsonb NOT NULL,
	"createdbyid" uuid,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "projectthemes" ADD CONSTRAINT "projectthemes_projectid_companyprojects_id_fk" FOREIGN KEY ("projectid") REFERENCES "public"."companyprojects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "projectthemes" ADD CONSTRAINT "projectthemes_createdbyid_userprofiles_id_fk" FOREIGN KEY ("createdbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "companythemeprofiles" ADD CONSTRAINT "companythemeprofiles_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "companythemeprofiles" ADD CONSTRAINT "companythemeprofiles_createdbyid_userprofiles_id_fk" FOREIGN KEY ("createdbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_projectthemes_project_apptype" ON "projectthemes" USING btree ("projectid","apptype");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_companythemeprofiles_company_apptype" ON "companythemeprofiles" USING btree ("companyid","apptype");
