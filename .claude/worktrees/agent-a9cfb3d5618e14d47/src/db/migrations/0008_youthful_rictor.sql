CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientcompanyid" uuid NOT NULL,
	"consultingcompanyid" uuid NOT NULL,
	"state" varchar(20) DEFAULT 'active' NOT NULL,
	"invitationid" uuid NOT NULL,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"createdbyid" uuid NOT NULL,
	"acceptedat" timestamp NOT NULL,
	"acceptedbyid" uuid NOT NULL,
	"pausedat" timestamp,
	"disabledat" timestamp,
	"endedat" timestamp,
	"endedbyid" uuid
);
--> statement-breakpoint
CREATE TABLE "engagementassignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagementid" uuid NOT NULL,
	"scopeid" varchar(32),
	"taskid" uuid,
	"projectid" uuid NOT NULL,
	"addedat" timestamp DEFAULT now() NOT NULL,
	"addedbyid" uuid NOT NULL,
	"removedat" timestamp,
	"removedbyid" uuid,
	CONSTRAINT "chk_engagementassignments_scope_or_task" CHECK ((scopeid is null) != (taskid is null))
);
--> statement-breakpoint
CREATE TABLE "engagementinvitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientcompanyid" uuid NOT NULL,
	"invitedemail" varchar(255) NOT NULL,
	"invitedbyid" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"expiresat" timestamp NOT NULL,
	"invitedat" timestamp DEFAULT now() NOT NULL,
	"acceptedat" timestamp,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "mcpapitokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customerid" uuid NOT NULL,
	"projectid" uuid NOT NULL,
	"tokenhash" text NOT NULL,
	"tokenprefix" text NOT NULL,
	"name" text NOT NULL,
	"issuedbyid" uuid NOT NULL,
	"issuedat" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresat" timestamp with time zone,
	"revokedat" timestamp with time zone,
	"revokedbyid" uuid,
	"lastusedat" timestamp with time zone,
	"createdat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcprequestaudit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requestid" uuid NOT NULL,
	"tokenid" uuid,
	"customerid" uuid,
	"projectid" uuid,
	"tool" text,
	"methodpath" text NOT NULL,
	"durationms" integer NOT NULL,
	"outcome" text NOT NULL,
	"errorcode" text,
	"responsestatus" integer NOT NULL,
	"clientip" text,
	"useragent" text,
	"createdat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subassignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagementassignmentid" uuid NOT NULL,
	"consultingmemberid" uuid NOT NULL,
	"assignedat" timestamp DEFAULT now() NOT NULL,
	"assignedbyid" uuid NOT NULL,
	"removedat" timestamp,
	"removedbyid" uuid
);
--> statement-breakpoint
DROP TABLE "apitokens" CASCADE;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "billingemail" varchar(255);--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_clientcompanyid_companies_id_fk" FOREIGN KEY ("clientcompanyid") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_consultingcompanyid_companies_id_fk" FOREIGN KEY ("consultingcompanyid") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_invitationid_engagementinvitations_id_fk" FOREIGN KEY ("invitationid") REFERENCES "public"."engagementinvitations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_createdbyid_userprofiles_id_fk" FOREIGN KEY ("createdbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_acceptedbyid_userprofiles_id_fk" FOREIGN KEY ("acceptedbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_endedbyid_userprofiles_id_fk" FOREIGN KEY ("endedbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagementassignments" ADD CONSTRAINT "engagementassignments_engagementid_engagements_id_fk" FOREIGN KEY ("engagementid") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagementassignments" ADD CONSTRAINT "engagementassignments_taskid_projecttasks_id_fk" FOREIGN KEY ("taskid") REFERENCES "public"."projecttasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagementassignments" ADD CONSTRAINT "engagementassignments_projectid_companyprojects_id_fk" FOREIGN KEY ("projectid") REFERENCES "public"."companyprojects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagementassignments" ADD CONSTRAINT "engagementassignments_addedbyid_userprofiles_id_fk" FOREIGN KEY ("addedbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagementassignments" ADD CONSTRAINT "engagementassignments_removedbyid_userprofiles_id_fk" FOREIGN KEY ("removedbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagementinvitations" ADD CONSTRAINT "engagementinvitations_clientcompanyid_companies_id_fk" FOREIGN KEY ("clientcompanyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagementinvitations" ADD CONSTRAINT "engagementinvitations_invitedbyid_userprofiles_id_fk" FOREIGN KEY ("invitedbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcpapitokens" ADD CONSTRAINT "mcpapitokens_customerid_companies_id_fk" FOREIGN KEY ("customerid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcpapitokens" ADD CONSTRAINT "mcpapitokens_projectid_companyprojects_id_fk" FOREIGN KEY ("projectid") REFERENCES "public"."companyprojects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcpapitokens" ADD CONSTRAINT "mcpapitokens_issuedbyid_userprofiles_id_fk" FOREIGN KEY ("issuedbyid") REFERENCES "public"."userprofiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcpapitokens" ADD CONSTRAINT "mcpapitokens_revokedbyid_userprofiles_id_fk" FOREIGN KEY ("revokedbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcprequestaudit" ADD CONSTRAINT "mcprequestaudit_tokenid_mcpapitokens_id_fk" FOREIGN KEY ("tokenid") REFERENCES "public"."mcpapitokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subassignments" ADD CONSTRAINT "subassignments_engagementassignmentid_engagementassignments_id_fk" FOREIGN KEY ("engagementassignmentid") REFERENCES "public"."engagementassignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subassignments" ADD CONSTRAINT "subassignments_consultingmemberid_userprofiles_id_fk" FOREIGN KEY ("consultingmemberid") REFERENCES "public"."userprofiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subassignments" ADD CONSTRAINT "subassignments_assignedbyid_userprofiles_id_fk" FOREIGN KEY ("assignedbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subassignments" ADD CONSTRAINT "subassignments_removedbyid_userprofiles_id_fk" FOREIGN KEY ("removedbyid") REFERENCES "public"."userprofiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_engagements_clientcompanyid" ON "engagements" USING btree ("clientcompanyid");--> statement-breakpoint
CREATE INDEX "idx_engagements_consultingcompanyid" ON "engagements" USING btree ("consultingcompanyid");--> statement-breakpoint
CREATE INDEX "idx_engagements_state" ON "engagements" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_engagements_open_pair" ON "engagements" USING btree ("clientcompanyid","consultingcompanyid") WHERE state in ('active', 'paused', 'disabled');--> statement-breakpoint
CREATE INDEX "idx_engagementassignments_engagementid" ON "engagementassignments" USING btree ("engagementid");--> statement-breakpoint
CREATE INDEX "idx_engagementassignments_projectid" ON "engagementassignments" USING btree ("projectid");--> statement-breakpoint
CREATE INDEX "idx_engagementassignments_scopeid" ON "engagementassignments" USING btree ("scopeid");--> statement-breakpoint
CREATE INDEX "idx_engagementassignments_taskid" ON "engagementassignments" USING btree ("taskid");--> statement-breakpoint
CREATE INDEX "idx_engagementassignments_removedat" ON "engagementassignments" USING btree ("removedat");--> statement-breakpoint
CREATE INDEX "idx_engagementinvitations_clientcompanyid" ON "engagementinvitations" USING btree ("clientcompanyid");--> statement-breakpoint
CREATE INDEX "idx_engagementinvitations_status" ON "engagementinvitations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_engagementinvitations_invitedemail" ON "engagementinvitations" USING btree ("invitedemail");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_engagementinvitations_token" ON "engagementinvitations" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "mcpapitokens_tokenhash_unique" ON "mcpapitokens" USING btree ("tokenhash");--> statement-breakpoint
CREATE INDEX "mcpapitokens_customer_project_idx" ON "mcpapitokens" USING btree ("customerid","projectid");--> statement-breakpoint
CREATE INDEX "mcpapitokens_project_revokedat_idx" ON "mcpapitokens" USING btree ("projectid","revokedat");--> statement-breakpoint
CREATE INDEX "mcprequestaudit_token_createdat_idx" ON "mcprequestaudit" USING btree ("tokenid","createdat");--> statement-breakpoint
CREATE INDEX "mcprequestaudit_project_createdat_idx" ON "mcprequestaudit" USING btree ("projectid","createdat");--> statement-breakpoint
CREATE INDEX "mcprequestaudit_outcome_createdat_idx" ON "mcprequestaudit" USING btree ("outcome","createdat");--> statement-breakpoint
CREATE INDEX "idx_subassignments_assignmentid" ON "subassignments" USING btree ("engagementassignmentid");--> statement-breakpoint
CREATE INDEX "idx_subassignments_consultingmemberid" ON "subassignments" USING btree ("consultingmemberid");--> statement-breakpoint
CREATE INDEX "idx_subassignments_removedat" ON "subassignments" USING btree ("removedat");