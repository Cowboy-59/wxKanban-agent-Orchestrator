-- [SCOPE 144 / T016] BEGIN — Consultant approvers flag on engagements and invitations
--
-- ============================================================================
-- APPLY BY HAND. NOT YET APPLIED.
--
-- Applied manually by the owner on the owner connection (SCOPE-117: there is no
-- migration ledger and nothing auto-applies DDL). Record the apply and its
-- verification in specs/117-production-schema-integrity/schema-change-log.md.
--
-- Do NOT run `drizzle-kit push` against this database (SCOPE-117).
-- ============================================================================
--
-- SPEC-144 FR-012 / contracts D6 (owner-approved amendment, 2026-10-24).
--
--   engagements           consultantapprovers — the client lets the consulting company's
--                         ADMINs and TEAM_MANAGERs act as Room Approvers. Off by default.
--   engagementinvitations consultantapprovers — the choice made in the invitation, copied
--                         to the engagement when the invitation is accepted.
--
-- Additive only: NOT NULL with a constant DEFAULT, so existing rows read false and every
-- existing INSERT keeps working. Declare the columns in src/db/schema ONLY after this has
-- been applied and `npm run db:drift` passes (declaring first = 500s).

BEGIN;

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS consultantapprovers boolean NOT NULL DEFAULT false;

ALTER TABLE engagementinvitations
  ADD COLUMN IF NOT EXISTS consultantapprovers boolean NOT NULL DEFAULT false;

COMMIT;

-- Verify (expect two rows, data_type boolean, column_default false, is_nullable NO):
--   SELECT table_name, column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE column_name = 'consultantapprovers'
--     AND table_name IN ('engagements', 'engagementinvitations');
--
-- Roll back (only if nothing reads the columns yet):
--   ALTER TABLE engagements DROP COLUMN IF EXISTS consultantapprovers;
--   ALTER TABLE engagementinvitations DROP COLUMN IF EXISTS consultantapprovers;

-- [SCOPE 144 / T016] END
