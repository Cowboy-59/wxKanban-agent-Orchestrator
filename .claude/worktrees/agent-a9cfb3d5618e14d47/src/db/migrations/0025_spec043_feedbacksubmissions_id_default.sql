-- Spec 043 / T002 fix — feedbacksubmissions.id had no DB default (0024 modeled
-- the column on the main-app schema, which generates UUID v7 client-side). The
-- MCP server inserts via .defaultRandom() and relies on a DB default like every
-- other MCP-managed table, so inserts NULLed out the id. Add the default.
ALTER TABLE "feedbacksubmissions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
