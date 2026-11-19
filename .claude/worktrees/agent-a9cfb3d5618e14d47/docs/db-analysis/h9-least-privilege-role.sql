-- ============================================================================
-- H-9 — Least-privilege database role for wxKanban
-- ============================================================================
-- Target: PostgreSQL 15.17 (RDS), database "wxKanban".
-- Authored 2026-08-02. Applied and verified in production the same day.
--
-- ONE ROLE: `wxkanban_app`. It runs the application AND the /preTest clone engine.
--
--   * DML on all 129 public tables, USAGE on all 18 sequences
--   * CONNECT and CREATE on database "wxKanban" — CREATE is what permits CREATE SCHEMA,
--     so it can build and drop its own `wxktest_*` clones
--   * NO CREATE on schema `public`; owns nothing in `public`
--   * NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
--
-- ── WHY ONE ROLE AND NOT TWO (decided 2026-08-02) ──────────────────────────────
-- The first draft split this into `wxkanban_app` (DML only) and `wxkanban_test`
-- (schema creation, but READ-ONLY on `public`). That is a stronger posture: an escaped
-- seed writing outside its clone would fail with a hard 42501 instead of silently
-- mutating production.
--
-- It was rejected, deliberately. wxKanban ships as a kit, and a customer adopting it
-- will almost always have ONE connection string. Requiring two roles would mean the
-- author's own instance runs a configuration nobody else runs — so the single-role
-- path, the one everyone else is on, would never be exercised. That is the opposite of
-- dogfooding.
--
-- What that costs: the write-isolation guarantee is code-level again, enforced by
-- tests/seeds/harness.ts refusing any schema outside `wxktest_` and verifying
-- current_schema(). That is exactly the protection a customer has.
--
-- What it does NOT cost: `CREATE ON DATABASE` is not `CREATE ON SCHEMA public`. The
-- role still cannot create objects in `public` and still owns nothing there, so the RLS
-- precondition survives — clone tables live in `wxktest_*`, never in `public`. Given
-- the role already holds full DML on every table, schema creation is a small increment.
--
-- `wxkanban_test` was created on 2026-08-02 and dropped the same day. The removal
-- procedure is at the end under "REMOVING wxkanban_test".
-- ───────────────────────────────────────────────────────────────────────────────
--
-- ============================================================================
-- WHY THIS RUNS IN TWO SESSIONS — read before running
-- ============================================================================
-- `ccscowboy` and `postgres` are SIBLINGS, not parent and child. Both are members of
-- `rds_superuser`, but neither is a member of the other — verified:
--     pg_has_role('ccscowboy','postgres','MEMBER') = false
--     pg_has_role('postgres','ccscowboy','MEMBER') = false
-- `rds_superuser` is not a real superuser and confers no implicit membership.
--
-- Consequently NO single session can complete this script:
--
--   Only `postgres` can do these         | Only `ccscowboy` can do these
--   ------------------------------------ | ---------------------------------------
--   GRANT ... ON DATABASE "wxKanban"     | GRANT on the 115 tables it owns
--     (postgres OWNS the database)       | ALTER DEFAULT PRIVILEGES for its own
--   GRANT USAGE ON SCHEMA public         |   future tables
--     (public is owned by                |
--      pg_database_owner = postgres)     |
--   GRANT on the 14 tables it owns       |
--   ALTER DEFAULT PRIVILEGES for its own |
--     future tables                      |
--
-- `SET ROLE` cannot bridge the gap. `ALTER DEFAULT PRIVILEGES FOR ROLE x` requires
-- membership in x — attempting it produced `ERROR: must be member of role "ccscowboy"`.
-- Both sessions below use the bare form, which applies to the current role.
--
-- ============================================================================
-- WHY THIS EXISTS
-- ============================================================================
-- The application previously connected as `ccscowboy`: CREATEDB, CREATEROLE, a member
-- of `rds_superuser`, and the OWNER of 115 of the 129 public tables. Two consequences:
--
--   1. Blast radius. A SQL-injection or a leaked credential inherited DDL rights over
--      the whole database, plus CREATEROLE.
--   2. It made RLS impossible to adopt honestly (SOC 2 NEW-5). Row-level security does
--      NOT apply to a table's owner unless FORCE ROW LEVEL SECURITY is also set, so
--      policies added while the app connected as the owner would have silently enforced
--      nothing. A non-owner application role is the prerequisite that makes RLS bite.
--      (Note `ccscowboy` is NOT a Postgres superuser and does NOT hold BYPASSRLS —
--      ownership was the blocker, not the usual superuser bypass.)
--
-- WHAT THE APPLICATION ACTUALLY NEEDS — verified, not assumed (2026-08-02):
--   * DML only, at runtime. All 133 raw-SQL sites under src/server were checked: zero
--     CREATE/DROP/ALTER/TRUNCATE/GRANT. Drizzle issues DML exclusively.
--   * Schema creation, for /preTest only — CREATE SCHEMA, CREATE TABLE (LIKE ...),
--     DROP SCHEMA CASCADE, all confined to `wxktest_*`.
--   * LISTEN/NOTIFY (src/server/lib/pgNotifyListener.ts) — unprivileged, no grant.
--   * The 118 routines in `public` are ALL from the `vector` extension. Postgres grants
--     EXECUTE on functions to PUBLIC by default, so no function grant is required.
--
-- TWO TABLE OWNERS. `ccscowboy` owns 115; `postgres` owns 14, and those 14 are live
-- application tables, not legacy:
--     capabilityindex, complianceflags, connectionhealth, credentialauditlogs,
--     customers, externalconnections, gitcommandlogs, gitcommandstats,
--     marketingcontacts, mcpdriftevents, mcpparityconfig, mcpupdateadoptions,
--     scopedependencies, synchistory
-- Miss them and the app 500s on the Consultant Dashboard, customers and marketing the
-- moment you cut over. The DO blocks below grant per-owner and RAISE NOTICE the count,
-- so a session run as the wrong role reports 0 instead of failing silently — the plain
-- `GRANT ... ON ALL TABLES` form emits a warning per skipped table and buries it.
--
-- ============================================================================
-- HOW TO RUN
-- ============================================================================
--   1. Replace the password placeholder. Generate it; do not reuse an existing
--      credential. PG 15 stores passwords SCRAM-SHA-256 by default.
--   2. SESSION 1 — connect to "wxKanban" as the `postgres` master user. Run Session 1.
--      (Note the capital K: the database name MUST stay double-quoted.)
--   3. SESSION 2 — reconnect as `ccscowboy`. Run Session 2.
--   4. Run SESSION 3 (verification) in either session and READ THE OUTPUT.
--   5. Only then change DATABASE_URL. See CUTOVER at the bottom.
--
-- Every statement is idempotent — the whole file can be re-run safely.
-- It grants only; nothing is taken from `ccscowboy`, which remains the table owner and
-- the role that applies schema changes by hand under SCOPE-117.
-- ============================================================================


-- ############################################################################
-- SESSION 1 — connect as `postgres` (the master user)
-- ############################################################################

-- ---------------------------------------------------------------------------
-- 1.1 The role
-- ---------------------------------------------------------------------------
-- Guarded because a bare CREATE ROLE is the one non-idempotent statement here; re-running
-- the file used to abort the whole pgAdmin batch with
--     ERROR:  role "wxkanban_app" already exists
-- making it look as though nothing had worked.
--
-- NOTE: if the role exists this does NOT reset its password or attributes. To change a
-- password later: ALTER ROLE wxkanban_app WITH PASSWORD '...';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wxkanban_app') THEN
    RAISE NOTICE 'wxkanban_app already exists — leaving it as is';
  ELSE
    CREATE ROLE wxkanban_app WITH
      LOGIN
      PASSWORD '<SET-A-STRONG-PASSWORD>'
      NOSUPERUSER
      NOCREATEDB      -- cannot create databases
      NOCREATEROLE    -- cannot create or alter roles
      NOBYPASSRLS     -- must obey row-level security once NEW-5 policies land
      NOINHERIT       -- no memberships; NOINHERIT keeps it that way if one is added
      CONNECTION LIMIT -1;
    RAISE NOTICE 'created wxkanban_app';
  END IF;
END $$;

-- CONNECTION LIMIT -1 (unlimited) is deliberate. A finite cap is (App Runner instance
-- count x pg Pool max, default 10) and guessing it low is an outage under scale-out.
-- Tighten later with: ALTER ROLE wxkanban_app CONNECTION LIMIT <n>;

-- Pin schema resolution. Without this, a schema earlier in search_path could shadow a
-- table with a hostile one of the same name.
ALTER ROLE wxkanban_app SET search_path = public;

-- IMPORTANT: the role name is lowercase. Postgres folds unquoted identifiers at CREATE
-- ROLE time, but connection-string usernames are case-sensitive and are NOT folded. A
-- URL saying `wxKanban_app` fails with `28P01 password authentication failed` — which
-- points at the password and is not the problem. PG reports a bad username that way on
-- purpose, so the error cannot be used to enumerate valid roles.


-- ---------------------------------------------------------------------------
-- 1.2 Database-level grants — ONLY postgres can do these (it owns the database)
-- ---------------------------------------------------------------------------
-- This RDS instance hosts 8 other databases (HAWLDuffers, TCIInspections, TWIROLB,
-- ebusiness, yappchat, ...). Granting CONNECT on "wxKanban" alone confines the role to
-- this application's database.
GRANT CONNECT ON DATABASE "wxKanban" TO wxkanban_app;

-- CREATE on the DATABASE permits CREATE SCHEMA — this is what lets /preTest build its
-- `wxktest_*` clones under the single-role model. See the decision note in the header.
--
-- Caveat, stated plainly: Postgres cannot constrain WHICH schema names a role may
-- create. The `wxktest_` prefix is enforced in application code (clone-guard.mjs and
-- tests/seeds/harness.ts both refuse anything else), never by the database.
GRANT CREATE ON DATABASE "wxKanban" TO wxkanban_app;


-- ---------------------------------------------------------------------------
-- 1.3 Schema access — ONLY postgres can do this
-- ---------------------------------------------------------------------------
-- Schema `public` is owned by `pg_database_owner`, which resolves to the database owner
-- — postgres. `ccscowboy` cannot grant on it despite owning 115 tables inside it.
GRANT USAGE ON SCHEMA public TO wxkanban_app;

-- DELIBERATELY NOT GRANTED: CREATE ON SCHEMA public.
-- PG 15 already revokes CREATE-on-public from PUBLIC by default (verified false), so
-- the role cannot create objects in it. That is what keeps it a non-owner of everything
-- in `public` forever, which is what makes RLS effective. Do not add it.
-- This is a DIFFERENT privilege from the CREATE ON DATABASE granted in 1.2 — see 3d.


-- ---------------------------------------------------------------------------
-- 1.4 Table and sequence grants for what postgres owns (expect 14 tables)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t record; n int := 0;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
            WHERE schemaname = 'public' AND tableowner = current_user
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO wxkanban_app', t.tablename);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'session 1: granted on % tables owned by %', n, current_user;
END $$;
-- Expect "granted on 14 tables owned by postgres". If 0, you are not connected as
-- postgres — stop and reconnect.

DO $$
DECLARE s record; n int := 0;
BEGIN
  FOR s IN SELECT sequencename FROM pg_sequences
            WHERE schemaname = 'public' AND sequenceowner = current_user
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO wxkanban_app', s.sequencename);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'session 1: granted on % sequences owned by %', n, current_user;
END $$;

-- DELIBERATELY NOT GRANTED anywhere: TRUNCATE, REFERENCES, TRIGGER.
-- No application code path uses them; TRUNCATE in particular is unrecoverable and
-- bypasses the audit trail SOC 2 CC7.2 depends on.


-- ---------------------------------------------------------------------------
-- 1.5 Default privileges for FUTURE objects created BY postgres
-- ---------------------------------------------------------------------------
-- Bare form — applies to the current role. `FOR ROLE ccscowboy` here is what produced
-- "must be member of role ccscowboy"; ccscowboy declares its own in Session 2.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wxkanban_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO wxkanban_app;

-- ######################## END OF SESSION 1 ################################


-- ############################################################################
-- SESSION 2 — reconnect as `ccscowboy`
-- ############################################################################
-- Nothing here can run as postgres, and nothing in Session 1 can run here.
--
-- ── STAYING IN THE SAME pgAdmin CONNECTION (optional) ──────────────────────
-- `postgres` is not a member of ccscowboy, but it holds CREATEROLE, and on PG 15 a
-- CREATEROLE role may grant membership in any non-superuser role. So, in the Session 1
-- window:
--     GRANT ccscowboy TO postgres;      -- one-time, revoked at the end
--     SET ROLE ccscowboy;
--     SELECT current_user;              -- MUST print ccscowboy before continuing
--     ... run all of Session 2 ...
--     RESET ROLE;
--     REVOKE ccscowboy FROM postgres;
--
-- SET ROLE changes current_user, so the DO blocks select ccscowboy's 115 tables and
-- ALTER DEFAULT PRIVILEGES records against ccscowboy — both correct.
--
-- Risk: pgAdmin may silently open a NEW connection, resetting the role to postgres. The
-- RAISE NOTICE counts are the guard — Session 2 must report 115. If it reports 14, the
-- role was lost; re-run it. Re-running is safe, GRANT is idempotent.
-- ───────────────────────────────────────────────────────────────────────────

-- ---------------------------------------------------------------------------
-- 2.1 Table grants for the 115 tables ccscowboy owns
-- ---------------------------------------------------------------------------
DO $$
DECLARE t record; n int := 0;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
            WHERE schemaname = 'public' AND tableowner = current_user
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO wxkanban_app', t.tablename);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'session 2: granted on % tables owned by %', n, current_user;
END $$;
-- Expect "granted on 115 tables owned by ccscowboy".

-- ---------------------------------------------------------------------------
-- 2.2 Sequences (expect 18)
-- ---------------------------------------------------------------------------
-- 18 sequences back 16 identity/serial `id` columns. Every one of those 16 is an
-- UNDECLARED legacy table (clientgroups, departments, fees, socketdata, systemlog, ...)
-- — no Drizzle-declared table uses serial, since the convention is UUID v7. So this
-- grant is very likely unnecessary today.
--
-- Included anyway because the failure mode is asymmetric: an unused grant on legacy
-- tables is near-zero risk, whereas omitting it turns any future serial column into a
-- hard INSERT failure in production.
DO $$
DECLARE s record; n int := 0;
BEGIN
  FOR s IN SELECT sequencename FROM pg_sequences
            WHERE schemaname = 'public' AND sequenceowner = current_user
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO wxkanban_app', s.sequencename);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'session 2: granted on % sequences owned by %', n, current_user;
END $$;

-- ---------------------------------------------------------------------------
-- 2.3 Default privileges for FUTURE objects created BY ccscowboy
-- ---------------------------------------------------------------------------
-- Schema changes are applied by hand under SCOPE-117. Without these, the next
-- hand-applied CREATE TABLE is invisible to the application and surfaces as a 42501 at
-- runtime, long after the DDL was reviewed and forgotten.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wxkanban_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO wxkanban_app;

-- ######################## END OF SESSION 2 ################################


-- ############################################################################
-- SESSION 3 — VERIFY. Run in either session. Read the output; do not skip.
-- ############################################################################
--
-- ⚠ THREE TRAPS THESE QUERIES EXIST TO AVOID. Each produces a FALSE ALL-CLEAR, not an
-- error, which is why they are called out rather than just worked around.
--
-- (a) DO NOT use information_schema.table_privileges. It only returns rows where the
--     QUERYING role is grantor or grantee, so it hides every cross-owner grant: as
--     ccscowboy it reports all 14 postgres-owned tables as failures, and as postgres all
--     115 ccscowboy-owned ones. Confirmed 2026-08-02 — it showed NOTHING for `customers`
--     while relacl read `wxkanban_app=arwd/postgres`. has_table_privilege() is not
--     visibility-filtered and is the same check the executor performs.
-- (b) Pass OIDs, not constructed name strings. `has_table_privilege(role,
--     'public.'||tablename, ...)` fails with `relation "public.pg_statistic" does not
--     exist` — the planner may evaluate the function before the schema filter.
-- (c) For sequences, wrap the filter in WITH ... AS MATERIALIZED. The flat form fails
--     with `"pg_stats_ext" is not a sequence` for the same reason.
-- (d) `has_*_privilege()` answers "CAN this role do it?", NOT "does it hold a direct
--     grant?" — and privileges held by the PUBLIC pseudo-role count. On this database
--     PUBLIC holds CONNECT+TEMP on the database and USAGE on schema `public`:
--         datacl  {=Tc/postgres, postgres=CTc/postgres, wxkanban_app=Cc/postgres, ...}
--         nspacl  {pg_database_owner=UC/…, =U/…, wxkanban_app=U/…, ...}
--     An entry beginning with a bare `=` IS the PUBLIC grant. So after fully revoking a
--     role, `has_database_privilege(role,'wxKanban','CONNECT')` and
--     `has_schema_privilege(role,'public','USAGE')` still return TRUE — inherited, not
--     direct. Hit 2026-08-02 while dropping `wxkanban_test`: they looked like blockers
--     and were not; DROP ROLE succeeded immediately. To ask the direct-grant question,
--     inspect `datacl` / `nspacl` for the role name instead:
--         SELECT datacl::text LIKE '%myrole%' FROM pg_database WHERE datname='wxKanban';


-- ---------------------------------------------------------------------------
-- 3-CLONE. Post-cutover: prove the /preTest path works under the single role.
-- ---------------------------------------------------------------------------
-- Privilege flags cannot tell you this — only doing it can. Run AS wxkanban_app (point
-- a psql/pgAdmin session at the app credential, not ccscowboy). Safe: it touches only
-- its own throwaway schema and drops it at the end. If any step fails, /preTest is
-- broken and the failure names which privilege is missing.
--
--   DROP SCHEMA IF EXISTS wxktest_h9probe CASCADE;
--   CREATE SCHEMA wxktest_h9probe;
--   -- clone from BOTH owner families; they need SELECT on the source and fail
--   -- independently, so testing one proves nothing about the other
--   CREATE TABLE wxktest_h9probe.companies (LIKE public.companies INCLUDING ALL);
--   CREATE TABLE wxktest_h9probe.customers (LIKE public.customers INCLUDING ALL);
--   ALTER TABLE  wxktest_h9probe.companies ADD CONSTRAINT probe_chk CHECK (true);
--   INSERT INTO  wxktest_h9probe.companies
--     (id,name,contactemail,billingplan,maxusers,activeflag,billingexempt)
--     VALUES ('01998000-0000-7000-8000-0000000000ff','H9 Probe',
--             'probe@invalid.test','CONSULTANT',5,true,true);
--   SELECT count(*) FROM public.companies;   -- must be UNCHANGED — nothing leaked out
--
--   -- THIS ONE MUST FAIL with 42501 permission denied for schema public.
--   -- If it succeeds the role can create in `public`, it will start owning objects
--   -- there, and the RLS precondition is silently gone.
--   CREATE TABLE public.h9_probe_should_fail (id int);
--
--   DROP SCHEMA wxktest_h9probe CASCADE;
--
-- Verified green 2026-08-02: all steps passed, the public CREATE was refused 42501,
-- clone tables owned by wxkanban_app, production `companies` unchanged at 43 rows.

-- 3a. THE important one. Returns ONLY failures — zero rows means correct.
--     Any row here is a table the app will 500 on after cutover.
SELECT c.relname AS tablename,
       pg_get_userbyid(c.relowner) AS tableowner,
       has_table_privilege('wxkanban_app', c.oid, 'SELECT') AS sel,
       has_table_privilege('wxkanban_app', c.oid, 'INSERT') AS ins,
       has_table_privilege('wxkanban_app', c.oid, 'UPDATE') AS upd,
       has_table_privilege('wxkanban_app', c.oid, 'DELETE') AS del
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND NOT (has_table_privilege('wxkanban_app', c.oid, 'SELECT')
        AND has_table_privilege('wxkanban_app', c.oid, 'INSERT')
        AND has_table_privilege('wxkanban_app', c.oid, 'UPDATE')
        AND has_table_privilege('wxkanban_app', c.oid, 'DELETE'))
 ORDER BY 2, 1;

-- 3a-summary. After BOTH sessions this must read 129 / 0.
--   After Session 1 only, expect  14 ready / 115 missing.
--   After Session 2 only, expect 115 ready /  14 missing.
SELECT count(*) FILTER (WHERE ok)     AS ready,
       count(*) FILTER (WHERE NOT ok) AS missing
  FROM (SELECT has_table_privilege('wxkanban_app', c.oid, 'SELECT')
           AND has_table_privilege('wxkanban_app', c.oid, 'INSERT')
           AND has_table_privilege('wxkanban_app', c.oid, 'UPDATE')
           AND has_table_privilege('wxkanban_app', c.oid, 'DELETE') AS ok
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r') x;

-- 3b. Role attributes. All four booleans must be false.
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolconnlimit
  FROM pg_roles WHERE rolname = 'wxkanban_app';

-- 3c. THE KEY DISTINCTION, and the easiest thing to get wrong. The role must NOT be
--     able to create objects in `public` (false) but MUST be able to create its own
--     schemas (true). Different privileges: CREATE ON SCHEMA vs CREATE ON DATABASE.
--     Confusing them either breaks /preTest or silently destroys the RLS precondition.
SELECT has_schema_privilege('wxkanban_app','public','CREATE')     AS in_public_MUST_BE_FALSE,
       has_database_privilege('wxkanban_app','wxKanban','CREATE') AS new_schema_MUST_BE_TRUE;

-- 3d. The role must own nothing in `public` — the RLS precondition. Must be 0.
--     Clone tables in `wxktest_*` are expected and do not appear here.
--     If this is ever non-zero, RLS silently stops applying to those tables and NEW-5
--     regresses with no visible symptom.
SELECT count(*) AS owned_in_public_must_be_zero
  FROM pg_tables WHERE schemaname='public' AND tableowner='wxkanban_app';

-- 3e. Both owner families reachable. Both must be true. `companies` is ccscowboy-owned;
--     `customers` is postgres-owned. They fail independently — which is the entire
--     reason for the two-session split, and why cutover must exercise both.
SELECT has_table_privilege('wxkanban_app','public.companies','SELECT') AS ccscowboy_owned_ok,
       has_table_privilege('wxkanban_app','public.customers','SELECT') AS postgres_owned_ok;

-- 3f. Sequence coverage. Expect 18 of 18. MATERIALIZED per trap (c) above.
WITH seqs AS MATERIALIZED (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'S'
)
SELECT count(*) FILTER (WHERE has_sequence_privilege('wxkanban_app', oid, 'USAGE')) AS granted,
       count(*) AS total
  FROM seqs;

-- 3g. Default privileges must be recorded for BOTH owners. Expect 2 distinct roles.
SELECT pg_get_userbyid(defaclrole) AS for_role, defaclobjtype AS objtype, defaclacl::text
  FROM pg_default_acl ORDER BY 1, 2;

-- 3h. Post-cutover: who is actually connected? This is the real proof, not the config.
--     Expect zero AWS-sourced connections as ccscowboy.
SELECT usename, client_addr::text, count(*)::int AS conns
  FROM pg_stat_activity
 WHERE datname = 'wxKanban' AND usename IS NOT NULL
 GROUP BY usename, client_addr ORDER BY usename, client_addr;


-- ============================================================================
-- CUTOVER — only after 3a returns zero rows
-- ============================================================================
-- DATABASE_URL must change in every place it appears, and they drift easily. As of
-- 2026-08-02 that is THREE:
--   1. AWS App Runner service `wxKanban`            (the app)
--   2. AWS App Runner service `wxkanban-mcp-prod`   (the hosted MCP)
--   3. The local repo-root .env, which also points at PRODUCTION
-- (`wxkanban-mcp-staging` was deleted 2026-08-02; it was on a separate Supabase
-- database and never on this RDS.)
--
-- ⚠ App Runner services here use ConfigurationSource: API, which means update-service
-- REPLACES the entire environment-variable map — it does not merge. A CLI update
-- passing only DATABASE_URL wipes the other 46 vars on the app service, including
-- JWT_SECRET, ENCRYPTION_KEY, SETTINGS_ENCRYPTION_KEY and the Stripe keys. Use the
-- console, or read the full map and write it back with one value changed.
--
-- Keep `sslmode=require`. Percent-encode reserved characters in the password
-- ($ becomes %24) or the URL parses wrong and fails looking like an auth error.
-- And use the lowercase role name — see the note in 1.1.
--
-- Verify with a REAL REQUEST, not a unit test: hit an endpoint backed by a
-- postgres-OWNED table (the Consultant Dashboard reads `customers` and
-- `externalconnections`) AND one backed by a ccscowboy-owned table (signin reads
-- `userprofiles`). Those two families fail independently.
--
-- Do NOT delete or demote `ccscowboy`. It remains the table owner and the role that
-- applies schema changes by hand under SCOPE-117.
--
-- WHAT THIS UNBLOCKS: with the app connecting as a non-owner, SOC 2 NEW-5 (RLS) can be
-- adopted for real — policies apply without FORCE ROW LEVEL SECURITY on all 129 tables.
-- Start with the 27 tables carrying a `companyid` column. RLS also needs `SET LOCAL`
-- per TRANSACTION — per-connection context leaks between requests under a pool.


-- ============================================================================
-- WIRING /preTest
-- ============================================================================
-- Nothing to do. Leave TEST_DATABASE_URL unset and every clone script falls through to
-- DATABASE_URL — `wxkanban_app`, which can create and own its `wxktest_*` schemas.
-- clone-test-schema.mjs, clone-guard.mjs, apply-ddl.mjs and tests/seeds/harness.ts all
-- read `TEST_DATABASE_URL ?? DATABASE_URL`; smoke.ts reads DATABASE_URL directly, which
-- is correct under the single-role model and needs no change.
--
-- KNOWN LIMITATION for when RLS lands: `CREATE TABLE (LIKE ... INCLUDING ALL)` does not
-- copy row-level security policies, and the role owns its clone tables, so RLS would not
-- apply inside a clone even if policies were copied. The pre-test gate will therefore
-- not exercise RLS. Worth solving when RLS is adopted — not before.


-- ============================================================================
-- REMOVING `wxkanban_test` (the abandoned second role)
-- ============================================================================
-- Kept for the record: the two-role design was applied on 2026-08-02 and reversed the
-- same day (see the header). If that role still exists, remove it as follows. It holds
-- grants from BOTH owners, so the removal splits exactly like the grant did.
--
-- SESSION A, as postgres:
--   DO $$ DECLARE t record; n int := 0; BEGIN
--     FOR t IN SELECT tablename FROM pg_tables
--               WHERE schemaname='public' AND tableowner=current_user
--     LOOP EXECUTE format('REVOKE ALL ON public.%I FROM wxkanban_test', t.tablename);
--          n := n+1; END LOOP;
--     RAISE NOTICE 'revoked on % tables owned by %', n, current_user;  -- expect 14
--   END $$;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM wxkanban_test;
--   REVOKE ALL ON SCHEMA public FROM wxkanban_test;
--   REVOKE ALL ON DATABASE "wxKanban" FROM wxkanban_test;
--
-- SESSION B, as ccscowboy:
--   DO $$ DECLARE t record; n int := 0; BEGIN
--     FOR t IN SELECT tablename FROM pg_tables
--               WHERE schemaname='public' AND tableowner=current_user
--     LOOP EXECUTE format('REVOKE ALL ON public.%I FROM wxkanban_test', t.tablename);
--          n := n+1; END LOOP;
--     RAISE NOTICE 'revoked on % tables owned by %', n, current_user;  -- expect 115
--   END $$;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM wxkanban_test;
--
-- THEN, either session:
--   DROP ROLE wxkanban_test;
--
-- DROP ROLE refuses while any privilege remains and names what is left — that is a
-- feature. Drop any standing `wxktest_*` schemas it owns first, if it created any.
-- Confirm gone:  SELECT count(*) FROM pg_roles WHERE rolname='wxkanban_test';  -- 0


-- ============================================================================
-- ROLLBACK — undoing wxkanban_app entirely
-- ============================================================================
-- Point DATABASE_URL back at ccscowboy FIRST, in all three places, and confirm the app
-- is healthy. Then run the matching half in each session — same split, same reason.
--
-- SESSION 1 (as postgres):
--   REVOKE ALL ON SCHEMA public   FROM wxkanban_app;
--   REVOKE ALL ON DATABASE "wxKanban" FROM wxkanban_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM wxkanban_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM wxkanban_app;
--   DO $$ DECLARE t record; BEGIN
--     FOR t IN SELECT tablename FROM pg_tables
--               WHERE schemaname='public' AND tableowner=current_user
--     LOOP EXECUTE format('REVOKE ALL ON public.%I FROM wxkanban_app', t.tablename); END LOOP;
--   END $$;
--
-- SESSION 2 (as ccscowboy): the same DO block, plus
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM wxkanban_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM wxkanban_app;
--
-- Then, after dropping any `wxktest_*` schemas it owns:
--   DROP ROLE wxkanban_app;
-- ============================================================================
