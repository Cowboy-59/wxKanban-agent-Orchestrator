-- SCOPE-064 Amendment A — registered-user newsletter audience.
-- Adds a second, distinct newsletter audience (registered app users) alongside the
-- existing marketingcontacts audience, with per-user, per-category opt-in.
--
-- userprofiles: two nullable opt-out timestamps (NULL = subscribed) — symmetric with
--   marketingcontacts.unsubscribedat, so every existing user is opted-in with no backfill.
--     updatesunsubscribedat — Product updates & announcements
--     promosunsubscribedat  — Marketing / promotions
-- newsletterissues: which audience an issue targets (marketing|users|both) and, when it
--   includes registered users, which category (updates|promos) it belongs to.
-- newslettersends: userid so a per-recipient send row identifies its registered-user
--   recipient (contactid already nullable for the marketing side).
-- Applied via the pg.Client transaction pattern. Idempotent (IF NOT EXISTS + FK guard).

ALTER TABLE "userprofiles" ADD COLUMN IF NOT EXISTS "updatesunsubscribedat" timestamptz;--> statement-breakpoint
ALTER TABLE "userprofiles" ADD COLUMN IF NOT EXISTS "promosunsubscribedat" timestamptz;--> statement-breakpoint

ALTER TABLE "newsletterissues" ADD COLUMN IF NOT EXISTS "audience" varchar(20) DEFAULT 'marketing' NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletterissues" ADD COLUMN IF NOT EXISTS "usercategory" varchar(20);--> statement-breakpoint

ALTER TABLE "newslettersends" ADD COLUMN IF NOT EXISTS "userid" uuid;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "newslettersends" ADD CONSTRAINT "newslettersends_userid_userprofiles_id_fk" FOREIGN KEY ("userid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
