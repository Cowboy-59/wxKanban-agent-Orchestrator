-- Spec 044 / T001 — Landing-Page Docs fields on wxkanbanhelp.
-- Additive only: extends the existing Scope 016 help table so records with
-- category = 'docs' can be surfaced on the public /docs page. Does NOT alter or
-- drop any existing column, so Scope 016 help records and the authenticated help
-- panel are unaffected. Hand-authored + applied via the pg.Client transaction
-- pattern (the repo's drizzle journal is frozen at 0008).
ALTER TABLE "wxkanbanhelp" ADD COLUMN IF NOT EXISTS "summary" text;
ALTER TABLE "wxkanbanhelp" ADD COLUMN IF NOT EXISTS "videourl" varchar(1000);
ALTER TABLE "wxkanbanhelp" ADD COLUMN IF NOT EXISTS "posterurl" varchar(1000);
ALTER TABLE "wxkanbanhelp" ADD COLUMN IF NOT EXISTS "sortorder" integer DEFAULT 0 NOT NULL;

-- Index the public docs listing path: published docs ordered by sortorder.
CREATE INDEX IF NOT EXISTS "idx_wxkanbanhelp_docs"
  ON "wxkanbanhelp" ("category", "status", "sortorder");
 