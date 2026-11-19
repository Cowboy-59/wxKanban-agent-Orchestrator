-- SPEC-155 / FR-003 (SCOPE-132 Amendment G, piece A) — the five columns that carry K.A.I.N.'s
-- masked rolling session status (summary, last entry, blockers, sharing, timestamp) on the
-- existing projectagentconnections record.
--
-- APPLIED BY HAND by the owner (no migration ledger exists; nothing auto-applies DDL;
-- `drizzle-kit push` is PROHIBITED against this database — it is production).
-- APPLY THIS BEFORE the code that declares/uses these columns is pushed: adding a Drizzle
-- declaration ahead of the columns existing 500's every query against projectagentconnections
-- (see 0078's note on the same table for why the order matters).
--
-- Safe to re-run (IF NOT EXISTS everywhere). Adds five columns only; changes nothing existing.
-- No GRANT needed: wxkanban_app already holds SELECT/INSERT/UPDATE on this table.

BEGIN;

-- sessionsummary (FR-002) — agent-maintained rolling summary, masked twice (hook + pre-upload),
-- capped at 1500 chars by the application layer; column allows headroom-free exact fit.
ALTER TABLE projectagentconnections
  ADD COLUMN IF NOT EXISTS sessionsummary varchar(1500);

-- lastentry (FR-002) — the single most recent masked turn summary, capped at 500 chars.
ALTER TABLE projectagentconnections
  ADD COLUMN IF NOT EXISTS lastentry varchar(500);

-- blockers (FR-002) — open blocker titles only (no bodies), as a JSON array; nullable.
ALTER TABLE projectagentconnections
  ADD COLUMN IF NOT EXISTS blockers jsonb;

-- sharing (FR-003, FR-005) — per-connection mirror of the Cockpit shareStatus setting at the time
-- of the last heartbeat; off by default so a connection never reports content before it opts in.
ALTER TABLE projectagentconnections
  ADD COLUMN IF NOT EXISTS sharing boolean NOT NULL DEFAULT false;

-- summaryat (FR-004, SC-27) — when sessionsummary/lastentry/blockers were last written, so the
-- status read can report "summary <= 60s old" without re-deriving it from heartbeat timing alone.
ALTER TABLE projectagentconnections
  ADD COLUMN IF NOT EXISTS summaryat timestamptz;

COMMIT;

-- ---------------------------------------------------------------------------------------
-- VERIFICATION (read-only). Expected: all five columns present with the types/defaults above.
-- Column-level, because db:drift is table-level only and would pass with columns missing.
-- ---------------------------------------------------------------------------------------
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'projectagentconnections'
  AND column_name IN ('sessionsummary', 'lastentry', 'blockers', 'sharing', 'summaryat')
ORDER BY column_name;
