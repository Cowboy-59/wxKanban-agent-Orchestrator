-- SCOPE-107 (Block Composer) / T004 — the Block Library.
-- themeblocks: a COLLECTION per company of named, drag-drop-composed block trees.
-- `block` is the structured node tree ({ nodes }) as jsonb.
-- Applied via the pg.Client transaction pattern. ids generated app-side (uuid v7).

CREATE TABLE IF NOT EXISTS "themeblocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"companyid" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"block" jsonb NOT NULL,
	"createdbyid" uuid,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "themeblocks" ADD CONSTRAINT "themeblocks_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "themeblocks" ADD CONSTRAINT "themeblocks_createdbyid_userprofiles_id_fk" FOREIGN KEY ("createdbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_themeblocks_company_name" ON "themeblocks" USING btree ("companyid","name");
