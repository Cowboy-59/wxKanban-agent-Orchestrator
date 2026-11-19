-- Spec 043 / T001 — feedbacksubmissions table (User Feedback: bug reports & suggestions).
-- Hand-authored + applied via the pg.Client transaction pattern (the repo's drizzle
-- journal is frozen at 0008; scope-named migrations are applied directly). DB row is
-- the source of truth; fan-out legs (artifact + notification) carry pending|done|failed.
CREATE TABLE "feedbacksubmissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"projectid" uuid NOT NULL,
	"userid" uuid NOT NULL,
	"companyid" uuid,
	"type" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"details" jsonb NOT NULL,
	"context" jsonb,
	"classification" varchar(20),
	"severity" varchar(20),
	"duplicateofid" uuid,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"declinereason" text,
	"internalnotes" text,
	"clarificationquestion" text,
	"clarificationanswer" text,
	"notificationchannel" varchar(20) DEFAULT 'inapp' NOT NULL,
	"artifactstatus" varchar(20) DEFAULT 'pending' NOT NULL,
	"artifactpath" varchar(500),
	"notifystatus" varchar(20) DEFAULT 'pending' NOT NULL,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"firsttriagedat" timestamp,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedbacksubmissions" ADD CONSTRAINT "feedbacksubmissions_projectid_companyprojects_id_fk" FOREIGN KEY ("projectid") REFERENCES "public"."companyprojects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacksubmissions" ADD CONSTRAINT "feedbacksubmissions_userid_userprofiles_id_fk" FOREIGN KEY ("userid") REFERENCES "public"."userprofiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacksubmissions" ADD CONSTRAINT "feedbacksubmissions_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacksubmissions" ADD CONSTRAINT "feedbacksubmissions_duplicateofid_feedbacksubmissions_id_fk" FOREIGN KEY ("duplicateofid") REFERENCES "public"."feedbacksubmissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_feedbacksubmissions_projectid" ON "feedbacksubmissions" USING btree ("projectid");--> statement-breakpoint
CREATE INDEX "idx_feedbacksubmissions_userid_status" ON "feedbacksubmissions" USING btree ("userid","status");--> statement-breakpoint
CREATE INDEX "idx_feedbacksubmissions_status" ON "feedbacksubmissions" USING btree ("status");
