-- Spec 046 / T001 — Marketing: Lead Capture & Funnel.
-- Hand-authored + applied via the pg.Client transaction pattern (the repo's drizzle
-- journal is frozen; scope-named migrations are applied directly). Two tables:
--   campaigns      — minimal here (extended in spec 048); leads attribute via campaignid.
--   marketingleads — captured signups; DB row is source of truth, notify is best-effort.
-- ids are generated app-side (uuid v7 via $defaultFn), so no DB default on id.

CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"companyid" uuid,
	"name" varchar(255) NOT NULL,
	"segment" varchar(20) NOT NULL,
	"launchdate" timestamp,
	"status" varchar(20) DEFAULT 'planned' NOT NULL,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketingleads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"companyid" uuid,
	"email" varchar(320) NOT NULL,
	"name" varchar(255),
	"sourceproperty" varchar(20) NOT NULL,
	"campaignid" uuid,
	"segment" varchar(20) NOT NULL,
	"locale" varchar(35) NOT NULL,
	"company" varchar(255),
	"platformfrom" varchar(100),
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"declinedreason" text,
	"notes" text,
	"notifystatus" varchar(20) DEFAULT 'pending' NOT NULL,
	"createdat" timestamp DEFAULT now() NOT NULL,
	"updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketingleads" ADD CONSTRAINT "marketingleads_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketingleads" ADD CONSTRAINT "marketingleads_campaignid_campaigns_id_fk" FOREIGN KEY ("campaignid") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_campaigns_status" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_marketingleads_status" ON "marketingleads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_marketingleads_segment" ON "marketingleads" USING btree ("segment");--> statement-breakpoint
CREATE INDEX "idx_marketingleads_campaignid" ON "marketingleads" USING btree ("campaignid");
