-- SCOPE-064 (Marketing Dashboard) / T004 — Newsletter compose + send.
-- newsletterissues: one authored issue (draft → sending → sent/failed) with rolled-up counts.
-- newslettersends:  per-(issue, recipient) send log backing the tallies + audit/retry.
-- Also adds marketingcontacts.unsubscribedat so newsletter recipient selection can
-- exclude unsubscribed contacts (set by the public HMAC unsubscribe route).
-- Applied via the pg.Client transaction pattern. ids generated app-side (uuid v7).

CREATE TABLE IF NOT EXISTS "newsletterissues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"segment" varchar(40) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"recipientcount" integer DEFAULT 0 NOT NULL,
	"sentcount" integer DEFAULT 0 NOT NULL,
	"failedcount" integer DEFAULT 0 NOT NULL,
	"createdbyid" uuid,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL,
	"sentat" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "newslettersends" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issueid" uuid NOT NULL,
	"contactid" uuid,
	"email" varchar(320) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error" text,
	"sentat" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "newsletterissues" ADD CONSTRAINT "newsletterissues_createdbyid_userprofiles_id_fk" FOREIGN KEY ("createdbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "newslettersends" ADD CONSTRAINT "newslettersends_issueid_newsletterissues_id_fk" FOREIGN KEY ("issueid") REFERENCES "public"."newsletterissues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "newslettersends" ADD CONSTRAINT "newslettersends_contactid_marketingcontacts_id_fk" FOREIGN KEY ("contactid") REFERENCES "public"."marketingcontacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_newsletterissues_status" ON "newsletterissues" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_newsletterissues_createdat" ON "newsletterissues" USING btree ("createdat");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_newslettersends_issueid" ON "newslettersends" USING btree ("issueid");--> statement-breakpoint
ALTER TABLE "marketingcontacts" ADD COLUMN IF NOT EXISTS "unsubscribedat" timestamptz;
