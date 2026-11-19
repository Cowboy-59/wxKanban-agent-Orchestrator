-- SCOPE-078 (Infrastructure Health Monitor) / SPEC-078 T002 — one table.
-- infrahealthchecks: one row per check key, UPSERTED every monitor run (current-state model,
--                    not an append log). The four v1 checks (RDS connection headroom, RDS
--                    memory+CPU, RDS storage, App Runner instance-ceiling vs connection budget)
--                    each keep exactly one row; the sysadmin dashboard reads non-ok rows
--                    urgent-first plus an overall "last checked" from max(evaluatedat).
-- Applied via the pg.Client transaction pattern. ids generated app-side (uuid v7).

CREATE TABLE IF NOT EXISTS "infrahealthchecks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkkey" varchar(64) NOT NULL,
	"resource" varchar(128) NOT NULL,
	"status" varchar(10) NOT NULL,
	"title" varchar(200) NOT NULL,
	"detail" text,
	"solution" text,
	"readings" jsonb,
	"evaluatedat" timestamp DEFAULT now() NOT NULL,
	"createdat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "infrahealthchecks_checkkey_unique" UNIQUE("checkkey")
);

CREATE INDEX IF NOT EXISTS "idx_infrahealthchecks_status" ON "infrahealthchecks" ("status");
CREATE INDEX IF NOT EXISTS "idx_infrahealthchecks_evaluatedat" ON "infrahealthchecks" ("evaluatedat");
