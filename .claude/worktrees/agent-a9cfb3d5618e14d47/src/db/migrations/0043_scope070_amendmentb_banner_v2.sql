-- [SCOPE 070 / Amendment-B] Banner Studio v2 — rich-overlay columns + AI background version history.
-- All additive + nullable, so the currently-deployed app (which does not select these) is unaffected.
ALTER TABLE "marketingbanners"
  ADD COLUMN IF NOT EXISTS "eyebrow" varchar(255),
  ADD COLUMN IF NOT EXISTS "headlinesegments" jsonb,
  ADD COLUMN IF NOT EXISTS "badge" varchar(120),
  ADD COLUMN IF NOT EXISTS "bulletslabel" varchar(120),
  ADD COLUMN IF NOT EXISTS "bullets" jsonb,
  ADD COLUMN IF NOT EXISTS "ctaurl" varchar(200),
  ADD COLUMN IF NOT EXISTS "overlayanchor" varchar(20),
  ADD COLUMN IF NOT EXISTS "bgversions" jsonb;
