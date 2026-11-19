-- SPEC-058 (SCOPE-058) / T001 — Scope check-out claim columns on projectspecifications.
-- Optimistic scope claim: who is currently working a scope (claimedbyid) and when it
-- was claimed (claimedat). Both nullable; FK to userprofiles, set null on delete.
-- Applied via the pg.Client transaction pattern (scripts/apply-spec058-migration.ts).
-- Idempotent: ADD COLUMN IF NOT EXISTS + DO-block guard on the FK.

ALTER TABLE "projectspecifications" ADD COLUMN IF NOT EXISTS "claimedbyid" uuid;--> statement-breakpoint
ALTER TABLE "projectspecifications" ADD COLUMN IF NOT EXISTS "claimedat" timestamp;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projectspecifications" ADD CONSTRAINT "projectspecifications_claimedbyid_userprofiles_id_fk" FOREIGN KEY ("claimedbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
