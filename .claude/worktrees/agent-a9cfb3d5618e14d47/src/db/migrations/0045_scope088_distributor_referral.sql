-- SCOPE-088 (Distributor Affiliate Onboarding & Referral Attribution) / SPEC-088 T001.
-- Three additive columns on companies (no new tables — attribution-only):
--   distributor  : account provisioned via the unlisted /distributor-signup page.
--   referralcode : this account's own shareable code (distributors only; unique).
--   referredby   : the distributor referralcode a customer entered at signup.
-- Existing rows backfill to distributor=false, referralcode=NULL, referredby=NULL.
-- Applied via the pg.Client transaction pattern.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "distributor" boolean DEFAULT false NOT NULL;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "referralcode" varchar(16);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "referredby" varchar(16);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_referralcode_unique'
  ) THEN
    ALTER TABLE "companies" ADD CONSTRAINT "companies_referralcode_unique" UNIQUE("referralcode");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_companies_referredby" ON "companies" ("referredby");
