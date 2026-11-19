-- Marketing contacts captured from windev.wxperts.com (launch-notify signups).
-- Follows wxKanban DB conventions: plural lowercase table, no underscores,
-- no camelCase columns. Run once against the target Postgres database.
--
--   psql "$DATABASE_URL" -f marketing/site/deploy/sql/marketingcontacts.sql
--
-- The Lambda (marketing/site/deploy/lambda/index.mjs) inserts one row per signup.
-- name + email are required; cell (phone) is optional.

CREATE TABLE IF NOT EXISTS marketingcontacts (
  id            uuid PRIMARY KEY,
  name          text        NOT NULL,
  email         text        NOT NULL,
  cell          text,
  platform      text,
  language      text,
  signuplist    text        NOT NULL DEFAULT 'launch-notify',
  wantshandson  boolean     NOT NULL DEFAULT false,
  sourceip      text,
  payload       jsonb,
  submittedat   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketingcontactsemailidx   ON marketingcontacts (email);
CREATE INDEX IF NOT EXISTS marketingcontactshandsonidx ON marketingcontacts (wantshandson);
CREATE INDEX IF NOT EXISTS marketingcontactslistidx    ON marketingcontacts (signuplist);
