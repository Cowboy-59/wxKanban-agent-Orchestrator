# Adapter — wxKanban (TypeScript · Express · Drizzle · PostgreSQL)

**Stack:** TypeScript · Express · Drizzle ORM · PostgreSQL 15+ · Vitest + supertest · Playwright ·
custom bcrypt+JWT auth · optional hosted MCP tool surface.

This is the reference adapter — the stack `wxCreateTestPlan` was originally written against. Read
`SKILL.md` for the method; this file is only the machinery. See [`README.md`](README.md) for the
adapter contract.

---

## Inventory source (Phase 1)

Run the extractor. It auto-detects Express routes, exported functions, services, Drizzle tables,
class methods, and MCP `registerTool` sites:

```bash
node _wxAI/skills/wxCreateTestPlan/scripts/inventory-functions.mjs \
  --root src/server --out tests/testplans/<target>/inventory.json \
  --md tests/testplans/<target>/INVENTORY.md
```

Use the resolved target as `--root` (e.g. `src/server`, or a subtree for a path arg). For
requirement-driven runs, still inventory the code, then **join** each unit to its `FR-###` via the
code fence and route path.

The script **exits 3** if it finds no TypeScript under `--root`, naming what it found instead. That
is the wrong-stack signal — do not work around it with `--allow-empty` unless an empty result is
genuinely expected for that subtree.

**What this command misses** — reconcile by hand and say so:

- Dynamically-mounted routers and re-exports.
- The MCP tool surface when registered through a registry rather than inline `registerTool`.
  wxKanban's `mcp-server/` **uses a registry** — reconcile against it explicitly.
- Route counts: cross-check against the running server if launchable, or against
  `src/server/routes/*.ts` registration counts.

Schema tables are data, not behavior units — the script lists them as `drizzle-table` units for CRUD
targeting, but they carry no logic to unit-test.

---

## Schema source (Phase 1B)

The Drizzle schema under `src/db/schema` is the declaration of record. The auditor is static and
read-only, so it always runs in PLAN mode and feeds the DBA persona:

```bash
node _wxAI/skills/wxCreateTestPlan/scripts/schema-analyze.mjs \
  --root src/db/schema --out tests/testplans/<target>/schema-analysis.json \
  --md tests/testplans/<target>/SCHEMA-ANALYSIS.md
```

It emits `file:line`-referenced findings across five dimensions plus a **referential-integrity score
0–10** (rubric in `references/schema-analysis.md`):

1. **Referential integrity (0–10)** — unenforced FKs (`*id` columns with no `.references()`), FKs
   missing an `onDelete` rule, FK columns with no covering index.
2. **Field mapping & table definitions** — wxKanban naming conventions, PK is UUID v7, `createdat`/
   `updatedat` present, `varchar` lengths, type appropriateness.
3. **Orphaned tables & data** — island tables (no incoming/outgoing FK); plus ready-to-run READ-ONLY
   orphan-row SQL per FK (`--live` executes it against a **non-prod DB only** — same guard as the
   CRUD tier; without `--live` the SQL is emitted for a human).
4. **Missing indexes** — FK columns (and common filter columns) with no covering index, with the
   `CREATE INDEX` remediation.
5. **Excessive / redundant indexes** — duplicates, composite left-prefix redundancy, unique-shadowed
   indexes, with the `DROP INDEX` remediation (confirm `idx_scan=0` first).

It **exits 3** if the tree holds no TypeScript, or holds TypeScript but no `pgTable(...)`
definitions — it must never emit a referential-integrity score for a schema it did not read.

**Schema provenance caveat.** This repo's drizzle snapshots under `src/db/migrations/meta/` stop at
`0009` while migrations run past `0055`, and schema changes are applied **manually** with no
migration ledger. The declared schema is therefore the model, and the live database is the truth —
`npm run db:drift` compares them, but only at table level. Do not treat migration files as a
description of production.

---

## Harness (Phase 3)

Read `references/harness-setup.md` and follow it exactly — it encodes the gotchas that otherwise
break every generated test at import time:

1. Mock **both** DB drivers — the `pg` `Pool` in `src/db/client.ts` (DATABASE_URL needs
   `sslmode=require`) and the `postgres-js` client in `src/server/db/client.ts` — in a `setupFiles`
   module that runs before any `src/` import, so the unit tier never dials the prod RDS.
2. `src/server/config.ts` calls `process.exit(1)` at import on invalid env. The setup file must
   assign fake env with `=` (not `??=`) so real (prod-pointing) credentials can never leak in and the
   process can't exit under test.
3. Reuse the repo's existing `vitest.config.ts` aliases (`~`, `@`, `@client`, `@server`, `@shared`).
   Put new tests under `tests/**` so the existing `include` picks them up; keep live/CRUD tests in a
   suffix (`*.live.test.ts`) excluded from the default run.
4. Route handlers aren't exported, and routes mount under **`/api/...`**. Drive them through
   **supertest against the real Express app** (`src/server/app.ts` builds it via `createApp()`;
   `index.ts` is the entry — `index2.ts` is dead) so middleware, zod validation, and auth are
   exercised. Mint JWTs with the app's own signer (`signToken`) for authed cases.

Leave **drizzle real** so schema SQL is exercised; route tests stub the service layer rather than
faking postgres-js rows. Stub Stripe, SES, S3, Gemini, and PM-system SDKs. `vitest` is already a root
devDep — no per-package install needed.

### Running the CRUD tier against a cloned schema

When the CRUD tier is using a `wxktest_` clone, the harness needs three things and nothing else —
the application's own queries are unqualified, so they follow `search_path` without a single code
change:

1. **Set the search path on every connection**, not once globally:
   `SET search_path TO wxktest_<id>, public`. A pooled connection that misses this writes to
   `public` — i.e. production. Set it in a `beforeEach`/connection hook, never assume it persists.
2. **Seed a coherent FK chain first.** The clone is empty and enforces referential integrity
   exactly as production does, so parents must exist before children. Copy a *related* set
   (company → user → project → spec), not one arbitrary row per table.
3. **Drop the clone in teardown**, and treat failure to drop as a finding — an orphaned
   `wxktest_` schema is clutter in a production database. `--list` enumerates any left behind.

A test that mutates while `search_path` still points at `public` is the one failure mode this
arrangement cannot catch for you. Assert the path inside the harness:
`SELECT current_schema()` must return the clone before the first write.

---

## UI driver (UI/UX coverage)

**Playwright**, against the React client. The screens are URL-addressable, so the navigation edges
the inventory finds (`navigate("/x")`, `<Link to="/x">`, `<Route path="/x">`) are directly testable,
including browser-back, guarded-route redirect-then-return, and deep-link / hard-refresh on a nested
route. Assertions are machine-checkable (pathname equals, element visible, text equals), never a
subjective "looks right". These items carry `gate: ui-flow`.

---

## DB posture (Phase 0 step 3)

**wxKanban's local `.env` `DATABASE_URL` points at the production RDS.** This is confirmed project
reality, and every rule below follows from it.

- **Unit tier** — mock both drivers as in *Harness* above; external services (Stripe, SES, S3,
  Gemini, PM-system SDKs) stubbed; forced fake env. Touches nothing real. Always runs.
- **CRUD / live tier** — writes are allowed **only against a non-production database**, obtained one
  of three ways, and **never** the prod-pointing `.env`:

  - **MCP test-DB connection** — if the target exposes an MCP (it *may or may not*), the CRUD tier
    may use the MCP's test-DB connection. **Before using it you MUST verify the MCP's UAT capability
    is genuinely non-prod** — a reachable connection whose **host differs from the prod RDS host**.
    (Today the hosted MCP shares the same `wxkanban` RDS as `.env`, so this verification will *fail*
    until a real UAT connection exists — that is the correct outcome, not a reason to proceed.) If
    UAT capability cannot be verified, **hard-stop the CRUD tier** — do not fall back to the prod
    connection.
  - **Explicit `TEST_DATABASE_URL`** — a disposable non-prod URL the user sets for this session. The
    guard hard-refuses any URL resolving to the `.env` host or `*.rds.amazonaws.com` prod host.
  - **A cloned TEST SCHEMA (preferred when no separate host exists).** Postgres isolates by schema
    as well as by database, so the CRUD tier can run against a disposable schema in the *same*
    database without a second host and without touching production tables. **Offer this before
    hard-stopping** — a hard-stop when a safe path exists is a worse answer than using it.

    ```bash
    node _wxAI/skills/wxCreateTestPlan/scripts/clone-test-schema.mjs --create   # → wxktest_<id>
    # run the gate with:  SET search_path TO wxktest_<id>, public;
    node _wxAI/skills/wxCreateTestPlan/scripts/clone-test-schema.mjs --drop --name wxktest_<id>
    ```

    What it does and why it is trustworthy:
    - Clones the **live** schema (not the migration files — this repo's drizzle snapshots stop at
      `0009` while migrations run past `0055`, so the files no longer describe reality).
    - Two passes: `CREATE TABLE (LIKE … INCLUDING ALL)` for structure, indexes and CHECKs, then
      foreign keys re-emitted from `pg_constraint`. **`INCLUDING ALL` does not copy foreign keys** —
      a one-pass clone silently loses them, and a clone without FKs lets a test pass that production
      would reject.
    - **Verifies fidelity** and prints `clone / source` counts for tables, FKs, CHECKs and indexes.
      If they do not match it says `faithful: false` and exits non-zero — **do not run the CRUD gate
      against an unfaithful clone.**
    - Safety: every clone name carries the `wxktest_` prefix, and `--drop` refuses any name without
      it, so the teardown can never reach `public`.
    - The clone is **structure-only — it starts empty.** Seed a *coherent* FK chain before the first
      write (a naive one-row-per-table seed fails, because the clone enforces referential integrity
      exactly as production does). Each `layer: data` item's `seedScript` covers this.

    Verified on wxKanban 2026-07-25: 127/127 tables, 179/179 FKs, 342/342 indexes; the
    `chk_testsignoffs_executor_match` and `fk_testsignoffs_item_executor` constraints both fired
    inside the clone, and `public` row counts were unchanged.

- **Production is forced to UAT.** Any target that would resolve to production is redirected to UAT;
  there is no PROD write path.

The **Hard stops** that follow from this posture live in `SKILL.md` Phase 0 — they are policy, and
they apply on every stack.

---

## Test substitutes — what they cannot enforce

- **Mocked `pg` with drizzle left real** exercises the generated SQL against `src/db/schema/*`, but
  nothing executes it — so it proves the query is *built* correctly, never that the database would
  accept it. Constraint assertions do not belong in this tier.
- **Mocked `postgres-js`** is a hermetic safety net, not a fixture. Route tests should stub the
  **service layer** rather than fake postgres-js result rows; a test asserting against rows the test
  itself invented constrains nothing (report under `test-validity`).
- **The `wxktest_` clone** is the only tier that enforces real constraints, and only when
  `faithful: true`. It is also the only tier where a `search_path` mistake can reach production —
  assert `current_schema()` before the first write.
- **Vitest** runs test files in parallel workers by default. Anything mutating process-wide state
  (env, clock, a shared fixture name) must restore in a `finally`, not on the happy path only.
