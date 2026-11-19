-- [SCOPE 074 / T001] System Capability Index — pgvector table + indexes.
--
-- APPLY TARGET: the HOSTED MCP production database (App Runner console creds),
-- NOT the local .env database. There is no local migration runner for mcp-server;
-- apply this out-of-band (psql / pg.Client) against the hosted MCP DB, then deploy
-- the mcp-server code that registers project.index_capabilities / search_capabilities.
--
-- Embedding dim 768 = Gemini gemini-embedding-001 truncated to 768 via outputDimensionality
-- (the v1 default, SCOPE-074; text-embedding-004 is retired). A different model/dim = re-index.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS capabilityindex (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projectid       uuid NOT NULL,
  sourcetype      varchar(16)  NOT NULL,   -- scope | app | code (extensible)
  sourceref       varchar(128) NOT NULL,   -- e.g. '073' or 'app:billing@alitho'
  owner           varchar(255) NOT NULL,
  capabilitytype  varchar(32)  NOT NULL,   -- process|table|route|doctype|command|workflow
  name            varchar(255) NOT NULL,
  description     text         NOT NULL,
  embedding       vector(768),
  createdat       timestamptz  NOT NULL DEFAULT now(),
  updatedat       timestamptz  NOT NULL DEFAULT now()
);

-- replace-by-source lookups (re-indexing a unit deletes its rows by projectid+sourceref)
CREATE INDEX IF NOT EXISTS idx_capabilityindex_project_sourceref
  ON capabilityindex (projectid, sourceref);

-- cosine similarity ANN index. Using HNSW — confirmed supported on this RDS instance
-- (wxkanban, PostgreSQL 15.17 → pgvector >= 0.5.0). HNSW gives better recall and needs
-- no ANALYZE-after-load step. DROP-first so re-running converts an earlier ivfflat index.
DROP INDEX IF EXISTS idx_capabilityindex_embedding_cosine;
CREATE INDEX IF NOT EXISTS idx_capabilityindex_embedding_cosine
  ON capabilityindex USING hnsw (embedding vector_cosine_ops);
