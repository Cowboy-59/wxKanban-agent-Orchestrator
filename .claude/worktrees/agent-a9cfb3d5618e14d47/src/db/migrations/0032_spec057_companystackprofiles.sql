-- SPEC-057 (SCOPE-047 stack-style) / T001 — Company-Wide Stack Profiles.
-- One profile per (company, application type); at most 3 per company.
-- Applied via the pg.Client transaction pattern. ids generated app-side (uuid v7).

CREATE TABLE IF NOT EXISTS "companystackprofiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"companyid" uuid NOT NULL,
	"apptype" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"createdbyid" uuid,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companystackprofiles" ADD CONSTRAINT "companystackprofiles_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companystackprofiles" ADD CONSTRAINT "companystackprofiles_createdbyid_userprofiles_id_fk" FOREIGN KEY ("createdbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_companystackprofiles_company_apptype" ON "companystackprofiles" USING btree ("companyid","apptype");
