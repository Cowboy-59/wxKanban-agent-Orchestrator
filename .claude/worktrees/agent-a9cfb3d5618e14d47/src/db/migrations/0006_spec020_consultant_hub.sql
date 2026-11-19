CREATE TABLE "aispecsessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"specid" varchar(50) NOT NULL,
	"projectid" uuid NOT NULL,
	"userid" uuid NOT NULL,
	"companyid" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"starttime" timestamp DEFAULT now() NOT NULL,
	"endtime" timestamp,
	"overheadduration" integer DEFAULT 0 NOT NULL,
	"totalduration" integer,
	"taskcount" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taskstateoverrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taskid" uuid NOT NULL,
	"userid" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"reason" text,
	"resolvedat" timestamp,
	"createdat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasksyncrecords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taskid" uuid NOT NULL,
	"pmconnectionid" uuid NOT NULL,
	"pendingstatus" varchar(20),
	"lastsyncedat" timestamp,
	"lastsyncstatus" varchar(20),
	"lastsyncerror" text,
	"retrycount" integer DEFAULT 0 NOT NULL,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projecttimeentries" ADD COLUMN "aispecsessionid" uuid;--> statement-breakpoint
ALTER TABLE "projecttimeentries" ADD COLUMN "completionnotesummary" text;--> statement-breakpoint
ALTER TABLE "projecttimeentries" ADD COLUMN "source" varchar(20) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "aispecsessions" ADD CONSTRAINT "aispecsessions_projectid_companyprojects_id_fk" FOREIGN KEY ("projectid") REFERENCES "public"."companyprojects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aispecsessions" ADD CONSTRAINT "aispecsessions_userid_userprofiles_id_fk" FOREIGN KEY ("userid") REFERENCES "public"."userprofiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aispecsessions" ADD CONSTRAINT "aispecsessions_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taskstateoverrides" ADD CONSTRAINT "taskstateoverrides_taskid_projecttasks_id_fk" FOREIGN KEY ("taskid") REFERENCES "public"."projecttasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taskstateoverrides" ADD CONSTRAINT "taskstateoverrides_userid_userprofiles_id_fk" FOREIGN KEY ("userid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasksyncrecords" ADD CONSTRAINT "tasksyncrecords_taskid_projecttasks_id_fk" FOREIGN KEY ("taskid") REFERENCES "public"."projecttasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasksyncrecords" ADD CONSTRAINT "tasksyncrecords_pmconnectionid_pmsystemconnections_id_fk" FOREIGN KEY ("pmconnectionid") REFERENCES "public"."pmsystemconnections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_aispecsessions_active" ON "aispecsessions" USING btree ("specid","userid") WHERE "aispecsessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_taskstateoverrides_taskid" ON "taskstateoverrides" USING btree ("taskid");--> statement-breakpoint
CREATE INDEX "idx_tasksyncrecords_pending" ON "tasksyncrecords" USING btree ("lastsyncstatus") WHERE "tasksyncrecords"."lastsyncstatus" = 'pending';--> statement-breakpoint
ALTER TABLE "projecttimeentries" ADD CONSTRAINT "projecttimeentries_aispecsessionid_aispecsessions_id_fk" FOREIGN KEY ("aispecsessionid") REFERENCES "public"."aispecsessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_projecttasks_external" ON "projecttasks" USING btree ("sourcepmssystem","externalid") WHERE "projecttasks"."externalid" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_projecttimeentries_aisession" ON "projecttimeentries" USING btree ("aispecsessionid") WHERE "projecttimeentries"."aispecsessionid" IS NOT NULL;