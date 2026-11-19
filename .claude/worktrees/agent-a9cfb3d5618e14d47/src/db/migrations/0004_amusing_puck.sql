-- Spec 025 — Project Overview Builder
-- G1 schemas: overviewdrafts, overviewtranscripts, importcache
--
-- NOTE: drizzle-kit generated this migration alongside drift fixes for
-- companysubscriptions, passwordresettokens, subscriptionbillingevents,
-- subscriptionbillinghistory, and a companies.billingexempt column —
-- those schema files exist in code but their snapshots are missing from
-- src/db/migrations/meta/ (0002_snapshot.json and 0003_snapshot.json
-- absent). Those drift fixes were stripped out of this migration; they
-- belong to a separate snapshot-repair task. This migration ships ONLY
-- the three new tables + index needed by spec 025 G1.

CREATE TABLE "overviewdrafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"projectid" uuid,
	"proposalid" uuid,
	"authoruserid" uuid NOT NULL,
	"companyid" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overviewtranscripts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"overviewdraftid" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sectionkey" text,
	"sourceuri" text,
	"createdat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importcache" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sourceuri" text NOT NULL,
	"companyid" uuid NOT NULL,
	"content" text NOT NULL,
	"contenthash" text NOT NULL,
	"fetchedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "overviewdrafts" ADD CONSTRAINT "overviewdrafts_projectid_companyprojects_id_fk" FOREIGN KEY ("projectid") REFERENCES "public"."companyprojects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overviewdrafts" ADD CONSTRAINT "overviewdrafts_proposalid_projectproposals_id_fk" FOREIGN KEY ("proposalid") REFERENCES "public"."projectproposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overviewdrafts" ADD CONSTRAINT "overviewdrafts_authoruserid_userprofiles_id_fk" FOREIGN KEY ("authoruserid") REFERENCES "public"."userprofiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overviewdrafts" ADD CONSTRAINT "overviewdrafts_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overviewtranscripts" ADD CONSTRAINT "overviewtranscripts_overviewdraftid_overviewdrafts_id_fk" FOREIGN KEY ("overviewdraftid") REFERENCES "public"."overviewdrafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importcache" ADD CONSTRAINT "importcache_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "importcache_sourceuri_companyid_uq" ON "importcache" USING btree ("sourceuri","companyid");
