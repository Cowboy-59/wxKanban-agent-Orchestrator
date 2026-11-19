-- SCOPE-109 (Customer Welcome Message) / SPEC-109 FR-001, FR-004, FR-007, T001.
-- Two new tables: welcomemessages (the single standing message) and welcomesends
-- (one row per recipient attempt).
--
-- welcomemessages holds exactly ONE row, unlike newsletterissues which holds one
-- row per authored issue. The welcome is a standing message that the two triggers
-- (subscription activation, invitation acceptance) send automatically.
--
-- linkcapacity / linkconsumed model the finite YappChatt join link. linkconsumed
-- is incremented ONLY by a successful delivery, via a conditional UPDATE guarded
-- on linkconsumed < linkcapacity executed in the same transaction as the
-- welcomesends insert. A failed send releases the claim it provisionally took, so
-- a run of failures cannot silently drain the link.
--
-- THE PARTIAL UNIQUE INDEX BELOW IS THE POINT OF THIS MIGRATION.
-- The once-per-person guarantee (FR-007) is scoped to SUCCESSFUL sends only:
--   UNIQUE (lower(email)) WHERE status = 'sent'
-- A blanket unique index on lower(email) would be wrong and dangerous here. The
-- sender is direct SES with no queue-level retry or dead-letter net, so a single
-- transient failure would write a 'failed' row that permanently barred that
-- person from ever being welcomed, with no recourse. Scoping the constraint to
-- successful sends lets a 'failed' row coexist with a later 'sent' one, which is
-- exactly what makes FR-011 (retry failed sends) possible.
--
-- Drizzle's generator does not reliably express partial indexes, so this index is
-- hand-written and must survive any future `db:generate` regeneration.
--
-- welcomesends.userid is ON DELETE SET NULL, not CASCADE: deleting an account
-- must not erase the record that they were welcomed, or a re-created account
-- would be welcomed twice.
--
-- Applied via the pg.Client transaction pattern.

CREATE TABLE IF NOT EXISTS "welcomemessages" (
  "id" uuid PRIMARY KEY NOT NULL,
  "subject" varchar(255) NOT NULL,
  "body" text NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "joinlink" varchar(1000),
  "linkcapacity" integer DEFAULT 0 NOT NULL,
  "linkconsumed" integer DEFAULT 0 NOT NULL,
  "publishedat" timestamp,
  "updatedbyid" uuid,
  "createdat" timestamp DEFAULT now() NOT NULL,
  "updatedat" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "welcomesends" (
  "id" uuid PRIMARY KEY NOT NULL,
  "welcomemessageid" uuid NOT NULL,
  "userid" uuid,
  "email" varchar(320) NOT NULL,
  "status" varchar(20) DEFAULT 'failed' NOT NULL,
  "error" text,
  "trigger" varchar(20) NOT NULL,
  "sentat" timestamp,
  "createdat" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "welcomemessages"
    ADD CONSTRAINT "welcomemessages_updatedbyid_userprofiles_id_fk"
    FOREIGN KEY ("updatedbyid") REFERENCES "userprofiles"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "welcomesends"
    ADD CONSTRAINT "welcomesends_welcomemessageid_welcomemessages_id_fk"
    FOREIGN KEY ("welcomemessageid") REFERENCES "welcomemessages"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "welcomesends"
    ADD CONSTRAINT "welcomesends_userid_userprofiles_id_fk"
    FOREIGN KEY ("userid") REFERENCES "userprofiles"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FR-007: at most one SUCCESSFUL welcome per person, case-insensitive.
-- Partial (WHERE status = 'sent') so a failed attempt stays retryable.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_welcomesends_email_sent"
  ON "welcomesends" (lower("email")) WHERE "status" = 'sent';

CREATE INDEX IF NOT EXISTS "idx_welcomesends_messageid" ON "welcomesends" ("welcomemessageid");
CREATE INDEX IF NOT EXISTS "idx_welcomesends_status" ON "welcomesends" ("status");
CREATE INDEX IF NOT EXISTS "idx_welcomesends_userid" ON "welcomesends" ("userid");

-- Guard: the standing message is a single row. Enforced by a unique index on a
-- constant expression so a second row cannot be inserted even by mistake.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_welcomemessages_singleton"
  ON "welcomemessages" ((1));
