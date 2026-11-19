-- [SCOPE 021 / T010] BEGIN — Database ER Diagram: PDF storage on the global doc table
-- Hand-written (drizzle snapshot is drifted); idempotent so it is safe to re-run.
ALTER TABLE "wxkanbandocuments" ADD COLUMN IF NOT EXISTS "pdfcontent" "bytea";
ALTER TABLE "wxkanbandocuments" ADD COLUMN IF NOT EXISTS "pdfgeneratedat" timestamp with time zone;
-- [SCOPE 021 / T010] END
