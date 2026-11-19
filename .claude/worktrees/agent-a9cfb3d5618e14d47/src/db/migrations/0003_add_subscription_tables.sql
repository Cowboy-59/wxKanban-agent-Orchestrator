-- 0003_add_subscription_tables: spec 023 chunk A foundation.
-- Adds three Stripe-backed subscription tables and the companies.billingexempt
-- column used to short-circuit billing for internal / dogfooding accounts.
-- Idempotent: CREATE TABLE / COLUMN IF NOT EXISTS + DO-block guards for FKs.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "billingexempt" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Backfill billing exemption for internal / dogfooding accounts that must not
-- be charged even while sitting on a paid billingplan tier.
UPDATE "companies" SET "billingexempt" = true
  WHERE name IN ('Wxperts LLC', 'American Litho') AND "billingexempt" = false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companysubscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companyid" uuid NOT NULL,
	"stripesubscriptionid" text NOT NULL,
	"stripecustomerid" text NOT NULL,
	"planname" text NOT NULL,
	"planamount" numeric(10,2) NOT NULL,
	"activeuserlimit" integer,
	"overageamount" numeric(10,2),
	"promotrialdays" integer,
	"status" text NOT NULL,
	"currentperiodstart" timestamp with time zone,
	"currentperiodend" timestamp with time zone,
	"canceledat" timestamp with time zone,
	"createdat" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptionbillingevents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companysubscriptionid" uuid NOT NULL,
	"eventtype" text NOT NULL,
	"eventstatus" text NOT NULL,
	"stripeeventid" text,
	"payload" jsonb,
	"createdat" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptionbillinghistory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companysubscriptionid" uuid NOT NULL,
	"historytype" text NOT NULL,
	"amount" numeric(10,2),
	"referencedocid" text,
	"displaylabel" text NOT NULL,
	"occurredat" timestamp with time zone NOT NULL,
	"createdat" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "companysubscriptions" ADD CONSTRAINT "companysubscriptions_companyid_companies_id_fk" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "subscriptionbillingevents" ADD CONSTRAINT "subscriptionbillingevents_companysubscriptionid_companysubscriptions_id_fk" FOREIGN KEY ("companysubscriptionid") REFERENCES "public"."companysubscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "subscriptionbillinghistory" ADD CONSTRAINT "subscriptionbillinghistory_companysubscriptionid_companysubscriptions_id_fk" FOREIGN KEY ("companysubscriptionid") REFERENCES "public"."companysubscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_companysubscriptions_companyid" ON "companysubscriptions" USING btree ("companyid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_companysubscriptions_status" ON "companysubscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscriptionbillingevents_subscriptionid" ON "subscriptionbillingevents" USING btree ("companysubscriptionid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscriptionbillinghistory_subscriptionid" ON "subscriptionbillinghistory" USING btree ("companysubscriptionid");
