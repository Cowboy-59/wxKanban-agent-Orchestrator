# Quickstart: Consultant Customer Records (Spec 119)

## What this spec is for, in one line

A consultant needs to record who they work for, including clients who are not wxKanban tenants.
`customers` is that record. It is a CRM row, not a permission.

## Where things stand

The database is **already changed**. `0059_scope119_customers.sql` was applied by hand on
2026-07-31, so `customers` exists in production and `companyprojects` has a nullable `customerid`.
`npm run db:drift` exits 0. Nothing is declared in Drizzle yet — that is T002 and T003, and they
are the next things to do.

## Start here

```bash
# 1. Confirm the database state you are building against (read-only, safe)
npm run db:drift
#    Expect: exit 0, "DECLARED BUT NOT DEPLOYED (0) — none",
#    and `customers` listed under UNDECLARED IN DATABASE.
#    That last part is correct and expected until T002 lands.

# 2. Read the applied DDL before declaring anything — the schema must mirror it exactly
cat src/db/migrations/0059_scope119_customers.sql
```

Then work T002 → T003 → T003a in order. After that the API phase is unblocked.

## The three things that will bite you

**1. The table is `userprofiles`, not `users`.** SPEC-017's DDL said `users(id)` and would have
failed on its first statement. Projects are `companyprojects`, not `projects`. Time entries are
`projecttimeentries`.

**2. Declare `customerid` only after the DDL exists.** Drizzle emits every declared column in its
SELECT list. On this database the DDL is already applied so T003 is safe — but on a fresh
environment, declaring first means every query touching `companyprojects` returns `42703` and the
dashboard, Work Hub and project list all go down together.

**3. The Customer must never grant access.** Setting `clientcompanyid` points at a tenant; it
confers nothing. The moment it starts conferring permissions this spec has become a second, worse
copy of SCOPE-037. Test S9 in `tests.md` is the assertion that holds the line.

## Naming, so the review does not bounce

Lowercase, plural tables, **concatenated** — no underscores. `customers`, `consultantid`,
`clientcompanyid`, `billingaddress`, `taxid`, `archivedat`. UUID v7 generated app-side:

```ts
import { v7 as uuidv7 } from "uuid";
id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
```

Never `gen_random_uuid()` — it emits v4.

## Building the API

Follow `src/server/routes/consultantDashboard.ts`; it is the closest working precedent and was
written against this spec's sibling. Router-level `authenticateToken` + `requireAuth`, `AuthRequest`
for `userid`/`companyid`, `createLogger`, `serializeDbError` in the catch.

Resolve the record first, then check ownership against it. Never trust a `consultantid` from the
request body — U6 tests exactly that.

There is no DELETE endpoint. D2 asserts its absence so nobody adds one quietly.

## Building the UI

**Design first.** Run `wxDesigner 119` (T011) and get the design approved before writing a
component. The customer screens do not exist yet in any design;
`specs/017-consultant-dashboard/page.md` covers only the dashboard.

Every string goes through i18n under `customers.*`. `npm run lint:i18n` must pass.

## Verify before you call it done

```bash
npm run build          # both client and server
npx tsc --noEmit       # esbuild and vite do NOT typecheck
npm run lint:i18n      # no bare string literals
npm run db:drift       # schema still consistent
```

Fences are `[SCOPE 119 / Tnnn]` and are written by the orchestrator, never by hand.

## Related

- Scope: `specs/Project-Scope/119-consultant-customer-records.md`
- Migration: `src/db/migrations/0059_scope119_customers.sql`
- Unblocked by this spec: `specs/017-consultant-dashboard/` Phase 1
- Dashboard design of record: `specs/017-consultant-dashboard/page.md`
