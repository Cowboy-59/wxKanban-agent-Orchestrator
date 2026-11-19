-- SCOPE-065 (Marketing AI Assist) / T009 — give campaignposts their own copy.
-- Posts previously stored only scheduling metadata + a channel; the actual post
-- text had no home. Add a nullable `content` column so AI-assisted, human-reviewed
-- post copy is persisted on the post itself. Idempotent.

ALTER TABLE "campaignposts" ADD COLUMN IF NOT EXISTS "content" text;
