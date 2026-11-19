-- [profile self-service] Add profile photo URL + a pending (unverified) email
-- address to userprofiles. Both nullable and additive — safe on existing rows.
ALTER TABLE "userprofiles" ADD COLUMN IF NOT EXISTS "avatarurl" varchar(1024);
ALTER TABLE "userprofiles" ADD COLUMN IF NOT EXISTS "pendingemail" varchar(80);
