# Implementation Plan: Consultant Customer Records (Spec 119)

## Gates — read before running `implement`

**Gate 1 — the DDL is already applied.** `src/db/migrations/0059_scope119_customers.sql` was
applied to production by hand on 2026-07-31. `npm run db:drift` exits 0, and `customers` currently
reports as **undeclared-but-live** — which is the correct intermediate state until T002 declares it
in Drizzle. Do not re-apply; the file is idempotent but there is nothing left to do.

**Gate 2 — ordering hazard on T003.** Drizzle emits every *declared* column in its SELECT list.
`customerid` must exist in the database before it is declared in
`src/db/schema/companyproject.ts`. The DDL is applied, so T003 is now safe — but if this spec is
ever replayed against a fresh database, apply the SQL first or every query touching
`companyprojects` fails with `42703`.

**Gate 3 — design before UI.** The customer list and detail screens are **not designed**.
`specs/017-consultant-dashboard/page.md` covers only the dashboard. Run `wxDesigner 119` (T011)
and get the design approved before T012. This is the sequence that caught the four-tile and rail
problem on SCOPE-017 before it was built rather than after.

**Gate 4 — never grant access.** A Customer is a record, not a relationship. The moment it starts
conferring permissions it has become a bad copy of Engagement and the two models diverge. Any
requirement that a Customer grant, restrict or scope access belongs to SCOPE-037.

## Technical Context

### Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend:** Express + TypeScript + Drizzle ORM
- **Database:** PostgreSQL 15, UUID v7 primary keys generated app-side
- **State:** TanStack Query
- **Logging:** Pino
- **i18n:** SCOPE-052 `useTranslation`, `en-US.ts` authored bundle

### Existing infrastructure — verified present

- `userprofiles` — the user table. **Note: not `users`.** SPEC-017's DDL referenced `users(id)`,
  which does not exist and would have failed on the first statement.
- `companies` — `id` is a primary key, so both `companyid` and `clientcompanyid` FKs are valid.
- `companyprojects` — the projects table. **Note: not `projects`.**
- `engagement`, `engagementassignment`, `engagementinvitation`, `engagementmodification` — SCOPE-037
  is shipped, with `/api/engagements` registered. FR-005 reads from these; it never writes.
- `/api/consultant/dashboard` — shipped 2026-07-31 as SCOPE-017 path (c). FR-008 modifies it.

## Constitution Check

### Project rules compliance

- Naming: tables plural and lowercase, fields lowercase, compound names **concatenated**, no
  underscores — `customers`, `consultantid`, `clientcompanyid`, `billingaddress`, `taxid`,
  `archivedat`. (SPEC-017 got this wrong by asserting snake_case was the convention; do not
  repeat it.)
- UUID v7 app-side via `$defaultFn(() => uuidv7())`, never `gen_random_uuid()`.
- TypeScript 100%, no `any`, no `@ts-ignore`.
- Pino only, never `console.log`.
- Schema applied manually per SCOPE-117; `drizzle-kit push` prohibited.
- Every user-facing string via i18n; `npm run lint:i18n` must pass.
- All code fenced `[SCOPE 119 / Tnnn]`, written by the orchestrator.

## Phase 1 — Schema (T001–T003a)

T001 is complete. T002 declares the table in Drizzle; T003 declares the column. Both must mirror
the applied DDL exactly — a mismatch between declaration and database is precisely the drift
SCOPE-117 exists to prevent. T003a records the change in the SCOPE-117 log.

## Phase 2 — API (T004–T010)

Nine endpoints under `/api/consultant/customers`, plus one extension to `PATCH /api/projects/:id`.
The route file follows the shape of `src/server/routes/consultantDashboard.ts`: `authenticateToken`
+ `requireAuth` at the router level, `AuthRequest` for `userid`/`companyid`, `createLogger`, and
`serializeDbError` on failure.

Authorization is the load-bearing part. Every handler resolves the record first and checks
ownership against it — never trusting a `consultantid` from the request body. Company Admin gets
read only. T015 proves it rather than asserting it.

There is deliberately **no** DELETE endpoint. Offering the verb invites someone to implement it,
and FR-003 forbids destruction because time entries and invoices reference these rows.

## Phase 3 — UI (T011–T014)

Design first (T011), then build (T012). The dashboard rail (T013) reverts the layout to the 7/5
container-query split in the approved design; the Connections tile stays out until SPEC-017's
connection layer exists, because it has nothing to count.

## Phase 4 — Tests (T015)

Two security properties get automated proof: cross-consultant isolation, and that
`clientcompanyid` confers nothing. Plus archive-preserves-history. These map directly to success
metrics 4, 5 and 6.

## Risks

| Risk | Mitigation |
|------|------------|
| Declaring `customerid` before the DDL exists on a fresh environment | Gate 2; the DDL banner states the order explicitly |
| The Customer model drifting into an access-control mechanism | Gate 4; FR-004 states the link grants nothing, T015 proves it |
| Offboarding blocked by `ON DELETE RESTRICT` with no way out | FR-011 transfer flow (T010) is the way out; the delete error must name the count and point at it |
| Duplicating SCOPE-037 | The link targets `clientcompanyid`, not an engagement — engagement history comes free and there is no rival relationship |

## Related Files

- Scope: `specs/Project-Scope/119-consultant-customer-records.md`
- Migration: `src/db/migrations/0059_scope119_customers.sql`
- Blocked by this spec: `specs/017-consultant-dashboard/` (Phase 1, Gate 5)
- Dashboard design of record: `specs/017-consultant-dashboard/page.md`
