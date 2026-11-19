-- SCOPE-023 (Stripe subscription operations) / FR-002a + FR-002b, Chunk I task I.6.
-- New table: signupinvitations — prospect-facing, invite-bound promotional signups.
--
-- Why a new table rather than reusing userinvitations: userinvitations has a
-- NOT NULL FK to companies.id and its accept path adds a user to an EXISTING
-- company. A signup invite has no company yet — that is the whole point.
--
-- tokenhash is sha256 of the raw token (64 hex chars), never the raw value.
-- The existing invite tables store tokens in plaintext; that precedent is
-- deliberately not followed here (a DB leak would expose every live invite).
--
-- Single-use is enforced at redemption by a conditional UPDATE guarded on
-- status='pending' (SignupInvitationService.burn), not by a constraint here.
--
-- Both FKs are ON DELETE SET NULL, not CASCADE: deleting the admin who issued
-- an invite, or the company it produced, must not erase the promotion record.
--
-- Applied via the pg.Client transaction pattern.

CREATE TABLE IF NOT EXISTS "signupinvitations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL,
  "billingplan" varchar(32) NOT NULL,
  "promodays" integer NOT NULL,
  "tokenhash" varchar(64) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "expiresat" timestamp with time zone NOT NULL,
  "invitedbyid" uuid,
  "invitedat" timestamp with time zone DEFAULT now() NOT NULL,
  "redeemedat" timestamp with time zone,
  "redeemedcompanyid" uuid,
  "createdat" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedat" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signupinvitations_invitedbyid_userprofiles_id_fk'
  ) THEN
    ALTER TABLE "signupinvitations"
      ADD CONSTRAINT "signupinvitations_invitedbyid_userprofiles_id_fk"
      FOREIGN KEY ("invitedbyid") REFERENCES "userprofiles"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signupinvitations_redeemedcompanyid_companies_id_fk'
  ) THEN
    ALTER TABLE "signupinvitations"
      ADD CONSTRAINT "signupinvitations_redeemedcompanyid_companies_id_fk"
      FOREIGN KEY ("redeemedcompanyid") REFERENCES "companies"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uk_signupinvitations_tokenhash" ON "signupinvitations" ("tokenhash");
CREATE INDEX IF NOT EXISTS "idx_signupinvitations_email" ON "signupinvitations" ("email");
CREATE INDEX IF NOT EXISTS "idx_signupinvitations_status" ON "signupinvitations" ("status");
