-- Spec 028 / T002 — Hosted MCP per-request audit log
CREATE TABLE IF NOT EXISTS mcprequestaudit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requestid uuid NOT NULL,
  tokenid uuid REFERENCES mcpapitokens(id) ON DELETE SET NULL,
  customerid uuid,
  projectid uuid,
  tool text,
  methodpath text NOT NULL,
  durationms integer NOT NULL,
  outcome text NOT NULL,
  errorcode text,
  responsestatus integer NOT NULL,
  clientip text,
  useragent text,
  createdat timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mcprequestaudit_token_createdat_idx ON mcprequestaudit (tokenid, createdat);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mcprequestaudit_project_createdat_idx ON mcprequestaudit (projectid, createdat);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mcprequestaudit_outcome_createdat_idx ON mcprequestaudit (outcome, createdat);
