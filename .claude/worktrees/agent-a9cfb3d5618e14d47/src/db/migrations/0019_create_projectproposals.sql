-- Spec 024: Pending Projects — Create projectproposals table
-- Run manually: psql $DATABASE_URL -f src/db/migrations/0019_create_projectproposals.sql

CREATE TABLE IF NOT EXISTS projectproposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  companyid       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  priority        VARCHAR(20) NOT NULL DEFAULT 'medium',
  estimatedeffort VARCHAR(100),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  rejectionreason TEXT,
  proposeddate    TIMESTAMPTZ NOT NULL DEFAULT now(),
  source          VARCHAR(255) NOT NULL,
  projectid       UUID REFERENCES companyprojects(id) ON DELETE SET NULL,
  createdbyid     UUID NOT NULL REFERENCES userprofiles(id) ON DELETE CASCADE,
  createdat       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedat       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_projectproposals_companyid ON projectproposals(companyid);
CREATE INDEX IF NOT EXISTS idx_projectproposals_status ON projectproposals(status);
CREATE INDEX IF NOT EXISTS idx_projectproposals_companyid_status ON projectproposals(companyid, status);
