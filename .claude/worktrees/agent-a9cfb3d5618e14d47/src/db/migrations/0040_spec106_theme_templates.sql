-- SCOPE-106 (Borrow-a-Look Business Template) / T003 — named reusable look+chrome templates.
-- themetemplates: a COLLECTION per company (many named templates, unlike the one-per-app-type
-- companythemeprofiles). Each row bundles a look (`theme`, a ProjectTheme jsonb) and the
-- business chrome (`chrome`, a BusinessChrome jsonb: logo + name + footer line).
-- Applied via the pg.Client transaction pattern. ids generated app-side (uuid v7).

CREATE TABLE IF NOT EXISTS "themetemplates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"companyid" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"theme" jsonb NOT NULL,
	"chrome" jsonb NOT NULL,
	"createdbyid" uuid,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "themetemplates" ADD CONSTRAINT "themetemplates_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "themetemplates" ADD CONSTRAINT "themetemplates_createdbyid_userprofiles_id_fk" FOREIGN KEY ("createdbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_themetemplates_company_name" ON "themetemplates" USING btree ("companyid","name");
