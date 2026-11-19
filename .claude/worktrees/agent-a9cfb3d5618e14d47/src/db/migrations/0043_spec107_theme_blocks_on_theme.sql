-- SCOPE-107 / T006 — attach an ordered list of blocks to a project theme + a template.
-- Nullable jsonb (NamedBlock[]): a project/template without blocks is unchanged (backward
-- compatible with SCOPE-062/106). Lets a template carry blocks (FR-009) and a project
-- execute them to real component code.
ALTER TABLE "projectthemes" ADD COLUMN IF NOT EXISTS "blocks" jsonb;--> statement-breakpoint
ALTER TABLE "themetemplates" ADD COLUMN IF NOT EXISTS "blocks" jsonb;
