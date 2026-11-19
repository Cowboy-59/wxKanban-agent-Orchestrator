-- [SCOPE 096 / T001] marketingfeaturesnippets — per-feature config sidecar for the
-- Marketing Feature Snippets manager. The snippet copy + on/off live in
-- marketingassets (type='synopsis', assetkey='feature-<slug>', status); this table
-- holds the per-feature attributes that are NOT per-locale: CTA link, carousel
-- dwell, enhanced/featured flag, display order, and the source scope it was drafted
-- from. One row per feature, keyed 1:1 to the marketingassets assetkey. Additive.
CREATE TABLE IF NOT EXISTS "marketingfeaturesnippets" (
  "id" uuid PRIMARY KEY NOT NULL,
  "assetkey" varchar(120) NOT NULL,
  "ctaurl" varchar(1000),
  "dwellms" integer DEFAULT 5000 NOT NULL,
  "enhanced" boolean DEFAULT false NOT NULL,
  "sortorder" integer DEFAULT 0 NOT NULL,
  "sourcescope" varchar(120),
  "createdat" timestamp DEFAULT now() NOT NULL,
  "updatedat" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "uq_marketingfeaturesnippets_assetkey" UNIQUE ("assetkey")
);
CREATE INDEX IF NOT EXISTS "idx_marketingfeaturesnippets_sortorder"
  ON "marketingfeaturesnippets" ("sortorder");
