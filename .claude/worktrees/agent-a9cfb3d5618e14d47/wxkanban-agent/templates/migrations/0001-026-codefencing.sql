-- wxkanban-agent kit migration 0001 — spec 026 code fencing
-- Creates the four orchestrator-owned tables that back `implement` / `auditfences`.
-- Applied to the CONSUMER project's DATABASE_URL (NOT the kit author DB).
-- The projectid column is a plain uuid; consumers may add their own FK after
-- this migration runs, pointing at their projects/companyprojects table.

CREATE TABLE IF NOT EXISTS "taskfences" (
    "id" uuid PRIMARY KEY NOT NULL,
    "projectid" uuid NOT NULL,
    "filepath" text NOT NULL,
    "unitkind" text NOT NULL,
    "unitname" text NOT NULL,
    "ownerscope" text NOT NULL,
    "ownertask" text NOT NULL,
    "description" text NOT NULL,
    "contenthash" text NOT NULL,
    "linestart" integer NOT NULL,
    "lineend" integer NOT NULL,
    "createdat" timestamp DEFAULT now() NOT NULL,
    "updatedat" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "taskfencemodifications" (
    "id" uuid PRIMARY KEY NOT NULL,
    "taskfenceid" uuid NOT NULL,
    "modifierscope" text NOT NULL,
    "modifiertask" text NOT NULL,
    "description" text NOT NULL,
    "contenthashbefore" text NOT NULL,
    "contenthashafter" text NOT NULL,
    "createdat" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "taskfencehistory" (
    "id" uuid PRIMARY KEY NOT NULL,
    "projectid" uuid NOT NULL,
    "filepath" text NOT NULL,
    "unitkind" text NOT NULL,
    "unitname" text NOT NULL,
    "priorownerscope" text NOT NULL,
    "priorownertask" text NOT NULL,
    "replacedbyscope" text NOT NULL,
    "replacedbytask" text NOT NULL,
    "closedat" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "taskfenceslegacy" (
    "id" uuid PRIMARY KEY NOT NULL,
    "projectid" uuid NOT NULL,
    "filepath" text NOT NULL,
    "contenthash" text NOT NULL,
    "baselinedat" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'taskfencemodifications_taskfenceid_fk'
    ) THEN
        ALTER TABLE "taskfencemodifications"
            ADD CONSTRAINT "taskfencemodifications_taskfenceid_fk"
            FOREIGN KEY ("taskfenceid") REFERENCES "taskfences"("id") ON DELETE CASCADE;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "taskfences_unique_unit"
    ON "taskfences" ("projectid", "filepath", "unitkind", "unitname");

CREATE INDEX IF NOT EXISTS "taskfences_projectid_idx"
    ON "taskfences" ("projectid");

CREATE INDEX IF NOT EXISTS "taskfences_owner_idx"
    ON "taskfences" ("ownerscope", "ownertask");

CREATE INDEX IF NOT EXISTS "taskfencemodifications_fence_idx"
    ON "taskfencemodifications" ("taskfenceid");

CREATE INDEX IF NOT EXISTS "taskfencemodifications_chrono_idx"
    ON "taskfencemodifications" ("taskfenceid", "createdat");

CREATE INDEX IF NOT EXISTS "taskfencehistory_projectid_idx"
    ON "taskfencehistory" ("projectid");

CREATE INDEX IF NOT EXISTS "taskfencehistory_unit_idx"
    ON "taskfencehistory" ("projectid", "filepath", "unitname");

CREATE UNIQUE INDEX IF NOT EXISTS "taskfenceslegacy_unique_file"
    ON "taskfenceslegacy" ("projectid", "filepath");

CREATE INDEX IF NOT EXISTS "taskfenceslegacy_projectid_idx"
    ON "taskfenceslegacy" ("projectid");
