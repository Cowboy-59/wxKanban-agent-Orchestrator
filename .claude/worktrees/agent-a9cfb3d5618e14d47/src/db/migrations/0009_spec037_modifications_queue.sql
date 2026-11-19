-- Spec 037 — T028: pending-modifications queue (FR-005 AC4)
-- Stores assignment modification requests made during paused/disabled
-- engagement states; drained on resume/enable transitions.

CREATE TABLE "engagementmodifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagementid" uuid NOT NULL,
	"operationtype" varchar(50) NOT NULL,
	"payload" jsonb NOT NULL,
	"queuedat" timestamp DEFAULT now() NOT NULL,
	"queuedbyid" uuid NOT NULL,
	"appliedat" timestamp,
	"failedat" timestamp,
	"erroredwith" text
);
--> statement-breakpoint
ALTER TABLE "engagementmodifications" ADD CONSTRAINT "engagementmodifications_engagementid_engagements_id_fk" FOREIGN KEY ("engagementid") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagementmodifications" ADD CONSTRAINT "engagementmodifications_queuedbyid_userprofiles_id_fk" FOREIGN KEY ("queuedbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_engagementmodifications_engagementid" ON "engagementmodifications" USING btree ("engagementid");--> statement-breakpoint
CREATE INDEX "idx_engagementmodifications_pending" ON "engagementmodifications" USING btree ("engagementid","appliedat");
