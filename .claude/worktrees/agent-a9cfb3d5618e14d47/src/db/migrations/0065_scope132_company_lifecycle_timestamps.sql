-- [SCOPE 132 / T001] BEGIN — companies lifecycle timestamps for suspend / cancel / archival
--
-- ============================================================================
-- APPLY BY HAND. Do NOT run `drizzle-kit push` against this database (SCOPE-117):
-- it reconciles the database TO the declared schema and would propose dropping the
-- ~19 undeclared-but-live tables, including `marketingcontacts`.
--
-- The local `DATABASE_URL` names `wxkanban_app`, which does not own `companies`
-- (owner: `ccscowboy`). An apply attempted with the local credential will be
-- refused with `must be owner of table companies` and roll back cleanly — that is
-- the H-9 least-privilege hardening working as designed, not a fault. This needs
-- the owner connection.
-- ============================================================================
--
-- WHAT THIS IS FOR
--
-- SCOPE-130 gives a company ADMIN a self-serve way to suspend or cancel their own
-- subscription, and then archives a cancelled company's data 30 days later.
-- Four dates drive that lifecycle, and none of them exist today:
--
--   cancelrequestedat  the ADMIN asked to cancel; Stripe is set to
--                      cancel_at_period_end. Access CONTINUES — the customer keeps
--                      the days they already paid for, and may still reverse it.
--   cancelledat        the cancellation became EFFECTIVE at period end. This is the
--                      only column the archival sweep selects on, and the 30-day
--                      clock starts here — never at the request.
--   pausedat           billing suspended via Stripe pause_collection. A paused
--                      company is walled but is NEVER archived and never acquires a
--                      cancelledat.
--   archivedat         the archival sweep completed for this company. Its presence
--                      makes a second archival a no-op.
--
-- WHY A COLUMN AND NOT A TIMER
--
-- `SysAdminCompanyService.deleteCompany()` already writes a `retentionDate` into a
-- jsonb metadata blob on `company_status_history`, and NOTHING in the codebase reads
-- it — grep returns zero readers. So the product already tells operators "data will
-- be retained for 30 days" and schedules nothing. A durable date on the row, swept
-- daily, is what makes that promise real: the alternative in this codebase is
-- `services/jobScheduler.ts`, which holds jobs in an in-memory Map of setTimeout
-- handles and silently forgets them on every App Runner redeploy. A 30-day timer
-- registered there would never fire once.
--
-- WHY NULLABLE, WITH NO DEFAULT AND NO BACKFILL HERE
--
-- Null means "this has not happened", which is the truth for all 47 current
-- companies. It also makes the sweep's central safety rule expressible: it acts only
-- on a non-null `cancelledat` and skips nulls unconditionally.
--
-- That rule matters because four companies are ALREADY in `CANCELED` (CPC,
-- McM Tech Solutions, MIRALTEC INFORMATICA S.L.L., JCA Software — 7 projects and 4
-- still-active users between them). Their only available date is `updatedat`, which
-- last moved between 2026-06-19 and 2026-08-27 for unrelated reasons. Any
-- updatedat-based heuristic would judge all four long overdue and archive them,
-- unreviewed, on the sweep's first armed run. Those four are stamped by a separate,
-- explicitly reviewed statement (SPEC-132 / T018) — deliberately NOT by this
-- migration, so that the backfill is a decision on the record rather than a side
-- effect of adding a column.
--
-- SAFETY
--
-- Purely additive: four nullable columns, no defaults, no constraints, no indexes,
-- no data touched. ADD COLUMN with a NULL default does not rewrite the table, so it
-- takes only a brief ACCESS EXCLUSIVE lock regardless of row count (47 rows here).
-- No deploy coordination is required: nothing selects these columns until SPEC-132
-- T002 declares them, which happens only AFTER this is applied — declaring first
-- would make drizzle name a non-existent column in every `companies` SELECT and
-- return production 500s (see the 2026-09-18 ordering note in the change log).
-- Idempotent; re-running is a no-op.
--
-- VERIFY (do NOT rely on `npm run db:drift` — it compares TABLES and passes whether
-- or not these columns exist; the same blind spot that hid `projecttimeentries.phaseid`):
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='companies'
--      and column_name in
--          ('cancelrequestedat','cancelledat','pausedat','archivedat')
--    order by column_name;
--
--   -- expect 4 rows, all "timestamp without time zone", all is_nullable = YES
--
--   -- and confirm nothing was stamped by accident:
--   select count(*) from companies
--    where cancelrequestedat is not null or cancelledat is not null
--       or pausedat is not null or archivedat is not null;
--   -- expect 0
-- ============================================================================

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "cancelrequestedat" timestamp,
  ADD COLUMN IF NOT EXISTS "cancelledat"       timestamp,
  ADD COLUMN IF NOT EXISTS "pausedat"          timestamp,
  ADD COLUMN IF NOT EXISTS "archivedat"        timestamp;

COMMENT ON COLUMN "companies"."cancelrequestedat" IS
  'SCOPE-132 T001: ADMIN requested cancellation; Stripe set to cancel_at_period_end. Access continues to period end and the request is reversible. NOT the archival clock.';

COMMENT ON COLUMN "companies"."cancelledat" IS
  'SCOPE-132 T001: cancellation became effective at period end. The 30-day archival clock starts here. The archival sweep selects on this column ALONE and skips NULL unconditionally — never infer it from updatedat.';

COMMENT ON COLUMN "companies"."pausedat" IS
  'SCOPE-132 T001: billing suspended via Stripe pause_collection. A paused company is walled but is never archived and never acquires a cancelledat.';

COMMENT ON COLUMN "companies"."archivedat" IS
  'SCOPE-132 T001: archival sweep completed — projects transferred out, company and users scrubbed. Presence makes re-archival a no-op. No row is ever deleted.';

-- [SCOPE 132 / T001] END
