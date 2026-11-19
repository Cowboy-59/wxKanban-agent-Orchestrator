-- SCOPE-070 (Banner Studio) / SPEC-067 T001 — three tables.
-- marketinglinks:      first-class tracked redirect link behind /r/:code (code → destination,
--                      denormalized clickcount; reusable outside a banner).
-- marketingbanners:    AI-composited clickable banner (background + overlay → versioned PNG)
--                      at a frozen size preset, pointing at a marketinglinks row.
-- marketinglinkclicks: per-/r/:code-hit event log (populated in SPEC-068); privacy-respecting
--                      (salted/truncated iphash, uaclass) with bots/previews counted=false.
-- Applied via the pg.Client transaction pattern. ids generated app-side (uuid v7).

CREATE TABLE IF NOT EXISTS "marketinglinks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"companyid" uuid,
	"campaignid" uuid,
	"code" varchar(32) NOT NULL,
	"destinationurl" varchar(1000) NOT NULL,
	"utmsource" varchar(80),
	"utmmedium" varchar(80),
	"utmcampaign" varchar(120),
	"clickcount" integer DEFAULT 0 NOT NULL,
	"assetid" uuid,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"createdbyid" uuid,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketingbanners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"companyid" uuid,
	"campaignid" uuid,
	"linkid" uuid,
	"title" varchar(255) NOT NULL,
	"sizepreset" varchar(20) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"layout" varchar(20) NOT NULL,
	"prompt" text,
	"headline" varchar(255),
	"subhead" varchar(500),
	"ctatext" varchar(80),
	"brandtokens" jsonb,
	"backgroundurl" varchar(1000),
	"renderedurl" varchar(1000),
	"frames" jsonb,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"targetsegment" varchar(20),
	"slot" varchar(40),
	"createdbyid" uuid,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketinglinkclicks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"linkid" uuid NOT NULL,
	"clickedat" timestamp DEFAULT now() NOT NULL,
	"iphash" varchar(64),
	"uaclass" varchar(10) DEFAULT 'human' NOT NULL,
	"referrer" varchar(1000),
	"counted" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "marketinglinks" ADD CONSTRAINT "marketinglinks_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "marketinglinks" ADD CONSTRAINT "marketinglinks_campaignid_campaigns_id_fk" FOREIGN KEY ("campaignid") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "marketinglinks" ADD CONSTRAINT "marketinglinks_assetid_marketingassets_id_fk" FOREIGN KEY ("assetid") REFERENCES "public"."marketingassets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "marketingbanners" ADD CONSTRAINT "marketingbanners_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "marketingbanners" ADD CONSTRAINT "marketingbanners_campaignid_campaigns_id_fk" FOREIGN KEY ("campaignid") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "marketingbanners" ADD CONSTRAINT "marketingbanners_linkid_marketinglinks_id_fk" FOREIGN KEY ("linkid") REFERENCES "public"."marketinglinks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "marketinglinkclicks" ADD CONSTRAINT "marketinglinkclicks_linkid_marketinglinks_id_fk" FOREIGN KEY ("linkid") REFERENCES "public"."marketinglinks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_marketinglinks_code" ON "marketinglinks" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marketinglinks_companyid" ON "marketinglinks" USING btree ("companyid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marketinglinks_campaignid" ON "marketinglinks" USING btree ("campaignid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marketinglinks_status" ON "marketinglinks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marketingbanners_campaignid" ON "marketingbanners" USING btree ("campaignid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marketingbanners_status" ON "marketingbanners" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marketingbanners_segment_slot" ON "marketingbanners" USING btree ("targetsegment","slot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marketinglinkclicks_linkid" ON "marketinglinkclicks" USING btree ("linkid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marketinglinkclicks_clickedat" ON "marketinglinkclicks" USING btree ("clickedat");
