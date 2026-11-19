-- [SCOPE 073 / T001] scopedependencies — cross-scope dependency edges for the scope-flow doc.
--
-- APPLY TARGET: the HOSTED MCP production database (App Runner console creds), NOT local .env.
-- Apply out-of-band (psql / pg.Client), then deploy the mcp-server code that registers
-- project.set_scope_dependencies and generates the `scopeflow` projectdocuments doctype.
-- Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS scopedependencies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projectid       uuid    NOT NULL,
  sourcescope     integer NOT NULL,        -- the scope citing the dependency
  targetnumber    integer NOT NULL,        -- the cited number
  targetnamespace varchar(16) NOT NULL,    -- scope | spec | specword | bare
  kind            varchar(16) NOT NULL,    -- dependsOn | related
  createdat       timestamptz NOT NULL DEFAULT now()
);

-- replace-by-source lookups (re-capturing a scope deletes its rows by projectid+sourcescope)
CREATE INDEX IF NOT EXISTS idx_scopedependencies_project_source
  ON scopedependencies (projectid, sourcescope);
