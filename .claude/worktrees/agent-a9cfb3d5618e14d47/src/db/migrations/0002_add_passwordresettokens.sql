-- 0002_add_passwordresettokens: add passwordresettokens table for T039 forgot-password flow.
-- Idempotent: safe to re-run (IF NOT EXISTS + DO-block for FK constraint).

CREATE TABLE IF NOT EXISTS "passwordresettokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userid" uuid NOT NULL,
	"tokenhash" text NOT NULL,
	"expiresat" timestamp with time zone NOT NULL,
	"createdat" timestamp with time zone DEFAULT now(),
	"usedat" timestamp with time zone,
	"attemptcount" integer DEFAULT 0
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "passwordresettokens" ADD CONSTRAINT "passwordresettokens_userid_userprofiles_id_fk" FOREIGN KEY ("userid") REFERENCES "public"."userprofiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_passwordresettokens_userid" ON "passwordresettokens" USING btree ("userid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_passwordresettokens_expiresat" ON "passwordresettokens" USING btree ("expiresat");
