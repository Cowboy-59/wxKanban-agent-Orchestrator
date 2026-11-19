CREATE TABLE "taskfences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"projectid" uuid NOT NULL,
	"filepath" text NOT NULL,
	"unitkind" text NOT NULL,
	"unitname" text NOT NULL,
	"ownerscope" text NOT NULL,
	"ownertask" text NOT NULL,
	"description" text NOT NULL,
	"contenthash" text NOT NULL,
	"linestart" integer NOT NULL,
	"lineend" integer NOT NULL,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taskfencemodifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"taskfenceid" uuid NOT NULL,
	"modifierscope" text NOT NULL,
	"modifiertask" text NOT NULL,
	"description" text NOT NULL,
	"contenthashbefore" text NOT NULL,
	"contenthashafter" text NOT NULL,
	"createdat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taskfencehistory" (
	"id" uuid PRIMARY KEY NOT NULL,
	"projectid" uuid NOT NULL,
	"filepath" text NOT NULL,
	"unitkind" text NOT NULL,
	"unitname" text NOT NULL,
	"priorownerscope" text NOT NULL,
	"priorownertask" text NOT NULL,
	"replacedbyscope" text NOT NULL,
	"replacedbytask" text NOT NULL,
	"closedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taskfenceslegacy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"projectid" uuid NOT NULL,
	"filepath" text NOT NULL,
	"contenthash" text NOT NULL,
	"baselinedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taskfences" ADD CONSTRAINT "taskfences_projectid_companyprojects_id_fk" FOREIGN KEY ("projectid") REFERENCES "public"."companyprojects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taskfencemodifications" ADD CONSTRAINT "taskfencemodifications_taskfenceid_taskfences_id_fk" FOREIGN KEY ("taskfenceid") REFERENCES "public"."taskfences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taskfencehistory" ADD CONSTRAINT "taskfencehistory_projectid_companyprojects_id_fk" FOREIGN KEY ("projectid") REFERENCES "public"."companyprojects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taskfenceslegacy" ADD CONSTRAINT "taskfenceslegacy_projectid_companyprojects_id_fk" FOREIGN KEY ("projectid") REFERENCES "public"."companyprojects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "taskfences_unique_unit" ON "taskfences" USING btree ("projectid","filepath","unitkind","unitname");--> statement-breakpoint
CREATE INDEX "taskfences_projectid_idx" ON "taskfences" USING btree ("projectid");--> statement-breakpoint
CREATE INDEX "taskfences_owner_idx" ON "taskfences" USING btree ("ownerscope","ownertask");--> statement-breakpoint
CREATE INDEX "taskfencemodifications_fence_idx" ON "taskfencemodifications" USING btree ("taskfenceid");--> statement-breakpoint
CREATE INDEX "taskfencemodifications_chrono_idx" ON "taskfencemodifications" USING btree ("taskfenceid","createdat");--> statement-breakpoint
CREATE INDEX "taskfencehistory_projectid_idx" ON "taskfencehistory" USING btree ("projectid");--> statement-breakpoint
CREATE INDEX "taskfencehistory_unit_idx" ON "taskfencehistory" USING btree ("projectid","filepath","unitname");--> statement-breakpoint
CREATE UNIQUE INDEX "taskfenceslegacy_unique_file" ON "taskfenceslegacy" USING btree ("projectid","filepath");--> statement-breakpoint
CREATE INDEX "taskfenceslegacy_projectid_idx" ON "taskfenceslegacy" USING btree ("projectid");