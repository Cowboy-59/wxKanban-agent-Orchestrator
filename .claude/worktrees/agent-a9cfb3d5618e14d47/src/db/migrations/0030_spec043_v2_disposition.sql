-- [SCOPE 043 / T011] BEGIN — v2 disposition + scope-seed columns on feedbacksubmissions
-- Web triage console decision layer (FR-011/012) + accept-to-scope seed (FR-013/015).
-- Idempotent: ADD COLUMN IF NOT EXISTS so re-running is safe.
ALTER TABLE "feedbacksubmissions" ADD COLUMN IF NOT EXISTS "aiproposeddisposition" varchar(20);--> statement-breakpoint
ALTER TABLE "feedbacksubmissions" ADD COLUMN IF NOT EXISTS "dispositionrationale" text;--> statement-breakpoint
ALTER TABLE "feedbacksubmissions" ADD COLUMN IF NOT EXISTS "disposition" varchar(20);--> statement-breakpoint
ALTER TABLE "feedbacksubmissions" ADD COLUMN IF NOT EXISTS "dispositionedat" timestamp;--> statement-breakpoint
ALTER TABLE "feedbacksubmissions" ADD COLUMN IF NOT EXISTS "dispositionedbyid" uuid;--> statement-breakpoint
ALTER TABLE "feedbacksubmissions" ADD COLUMN IF NOT EXISTS "linkedscopenumber" varchar(10);--> statement-breakpoint
ALTER TABLE "feedbacksubmissions" ADD COLUMN IF NOT EXISTS "scopeseed" jsonb;
-- [SCOPE 043 / T011] END
