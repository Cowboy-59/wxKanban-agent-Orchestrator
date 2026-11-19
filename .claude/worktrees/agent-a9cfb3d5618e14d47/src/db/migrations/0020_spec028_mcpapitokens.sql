-- Spec 028 / T001 — Hosted MCP API tokens
CREATE TABLE IF NOT EXISTS mcpapitokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customerid uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  projectid uuid NOT NULL REFERENCES companyprojects(id) ON DELETE CASCADE,
  tokenhash text NOT NULL,
  tokenprefix text NOT NULL,
  name text NOT NULL,
  issuedbyid uuid NOT NULL REFERENCES userprofiles(id) ON DELETE RESTRICT,
  issuedat timestamptz NOT NULL DEFAULT now(),
  expiresat timestamptz,
  revokedat timestamptz,
  revokedbyid uuid REFERENCES userprofiles(id) ON DELETE SET NULL,
  lastusedat timestamptz,
  createdat timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS mcpapitokens_tokenhash_unique ON mcpapitokens (tokenhash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mcpapitokens_customer_project_idx ON mcpapitokens (customerid, projectid);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mcpapitokens_project_revokedat_idx ON mcpapitokens (projectid, revokedat);
