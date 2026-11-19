-- Spec 048 / T001 — Marketing: In-App Module.
-- Extends campaigns (from 046) and adds marketingassets + campaignposts.
-- Applied via the pg.Client transaction pattern. ids generated app-side (uuid v7).

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "goal" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "startdate" timestamp;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "createdbyid" uuid;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "marketingassets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"companyid" uuid,
	"assetkey" varchar(120) NOT NULL,
	"locale" varchar(35) NOT NULL,
	"type" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text,
	"fileurl" varchar(1000),
	"targetsegment" varchar(20),
	"campaignid" uuid,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"createdbyid" uuid,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_marketingassets_assetkey_locale" UNIQUE("assetkey","locale")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaignposts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"companyid" uuid,
	"campaignid" uuid NOT NULL,
	"assetid" uuid,
	"channel" varchar(20) NOT NULL,
	"locale" varchar(35) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"scheduledat" timestamp,
	"liveurl" varchar(1000),
	"publishedat" timestamp,
	"createdbyid" uuid,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketingassets" ADD CONSTRAINT "marketingassets_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketingassets" ADD CONSTRAINT "marketingassets_campaignid_campaigns_id_fk" FOREIGN KEY ("campaignid") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignposts" ADD CONSTRAINT "campaignposts_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignposts" ADD CONSTRAINT "campaignposts_campaignid_campaigns_id_fk" FOREIGN KEY ("campaignid") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignposts" ADD CONSTRAINT "campaignposts_assetid_marketingassets_id_fk" FOREIGN KEY ("assetid") REFERENCES "public"."marketingassets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marketingassets_campaignid" ON "marketingassets" USING btree ("campaignid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marketingassets_status" ON "marketingassets" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaignposts_campaignid" ON "campaignposts" USING btree ("campaignid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaignposts_status" ON "campaignposts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaignposts_scheduledat" ON "campaignposts" USING btree ("scheduledat");
