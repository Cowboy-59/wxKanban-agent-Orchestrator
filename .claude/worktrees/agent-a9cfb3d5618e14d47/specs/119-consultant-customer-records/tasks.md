# Tasks: Consultant Customer Records (Spec 119)

## Task index — machine-readable

The orchestrator's task index (`wxkanban-agent/core/orchestrator/task-id-index.ts`) reads only
lines beginning with `|` or `###`; it **ignores `- [ ]` checkbox rows**. Code fences reference
tasks by ID, so without this table every fence in this spec would report `UNKNOWN_TASK`. Keep it
in step with the checklist below. Task IDs are `Tnnn` — the fence grammar is `(T\d+)` and cannot
express any other form.

| Task | Status | Summary |
| ---- | ------ | ------- |
| T001 | done — 2026-07-31 | Apply `0059_scope119_customers.sql` to production |
| T002 | done — 2026-07-31 | Drizzle schema for `customers` |
| T003 | done — 2026-07-31 | Declare `customerid` on `companyprojects` |
| T004 | done — 2026-07-31 | Customer CRUD endpoints |
| T005 | done — 2026-07-31 | Archive and restore endpoints |
| T006 | done — 2026-07-31 | Tenant link — `/link` and `/unlink`, owner or Company Admin |
| T007 | done — 2026-07-31 | Engagement visibility |
| T008 | done — 2026-07-31 | Project-to-customer association |
| T009 | done — 2026-07-31 | Access control — extracted to `lib/customerAccess.ts` as a pure rule |
| T010 | done — 2026-07-31 | Ownership transfer for offboarding |
| T011 | done — 2026-07-31 | Design the customer screens (`wxDesigner 119`) → `page.md` |
| T012 | done — 2026-07-31 | Build the customer list and detail pages |
| T013 | done — 2026-07-31 | Restore the Consultant Dashboard Customers rail |
| T014 | done — 2026-07-31 | `customers.*` i18n namespace |
| T015 | done — 2026-07-31 | Access + validation tests — 23 passing |
| T016 | done — 2026-07-31 | `CustomerFormDialog` — the create/edit form T011 named as a separate design pass |
| T017 | done — 2026-07-31 | `CustomerTransferDialog` — the transfer surface for T010, likewise deferred by T011 |

---

## Phase 1: Schema

- [x] [T001] [P1] Apply `src/db/migrations/0059_scope119_customers.sql` by hand per SCOPE-117 — creates `customers` with four indexes and adds the nullable `customerid` column to `companyprojects`. **DONE 2026-07-31**: applied by the operator; `npm run db:drift` exits 0 and `customers` reports as an undeclared-but-live table, which is the expected state until T002 lands.
- [x] [T002] [P1] Create `src/db/schema/customer.ts` — `id` (UUID v7 app-side via `$defaultFn(() => uuidv7())`), `consultantid`, `companyid`, `clientcompanyid`, `name`, `company`, `email`, `phone`, `billingaddress`, `taxid`, `archivedat`, `createdat`, `updatedat`. Export from the schema barrel. Must match the applied DDL exactly.
- [x] [T003] [P1] Declare `customerid` on `src/db/schema/companyproject.ts` referencing `customers.id`. Safe now that the DDL is applied — Drizzle emits every declared column in its SELECT list, so declaring ahead of the DDL would produce `42703` on every `companyprojects` query.
- [x] [T003a] [P2] Record the change in `specs/117-production-schema-integrity/schema-change-log.md`.

## Phase 2: API

- [x] [T004] [P1] Customer CRUD — GET/POST/PATCH `/api/consultant/customers` (FR-001, FR-002). Name required and unique per consultant among live rows; email format validated; `consultantid`/`companyid` stamped from the authenticated request, never the body. List supports search and an `includearchived` flag.
- [x] [T005] [P1] Archive and restore — POST `/api/consultant/customers/:id/archive` and `/restore` (FR-003). No DELETE endpoint is created.
- [x] [T006] [P1] Optional tenant link (FR-004). Validate the target company exists **and** that the consultant's company already has an Engagement with it, so the field cannot enumerate companies.
- [x] [T007] [P2] Engagement visibility on the detail response (FR-005) — read-only, ended engagements included, most recent first.
- [x] [T008] [P1] Extend PATCH `/api/projects/:id` to accept `customerid` (FR-006). Reassignment must not rewrite historical time entries.
- [x] [T009] [P1] Access control across all nine endpoints (FR-007) — owner read/write/archive, Company Admin read-only, everyone else nothing. Checked against the record, never inferred from the request.
- [x] [T010] [P1] Ownership transfer (FR-011) — POST `/api/consultant/customers/:id/transfer` and `/transfer-all`. Company Admin only; moves `consultantid` alone; audit-logged with old owner, new owner, count and actor. Deleting a consultant who still owns live customers must fail with a message naming the count, not a raw foreign-key error.

## Phase 3: UI

- [x] [T011] [P1] Run `wxDesigner 119` and get the design approved before building any UI. **DONE 2026-07-31** — approved and saved to [`page.md`](page.md): master-detail on one route, tenant link deliberately recessed with an explicit "grants nothing" disclaimer, no delete anywhere, Archive on `--danger` rather than the AA-failing `--destructive`. No new tokens. The **create/edit form** and the **transfer dialog** are named as separate design passes and are NOT covered.
- [x] [T012] [P2] Build `/dashboard/consultant/customers` from the approved design — list with search and archived filter, detail with the editable record, its projects, and read-only engagement history. SPEC-017's connection manager mounts here later.
- [x] [T013] [P2] Restore the Consultant Dashboard Customers rail and revert to the 7/5 container-query split (FR-008). The Connections tile stays absent until SPEC-017's connection layer exists.
- [x] [T014] [P2] Add the `customers.*` i18n namespace to `src/client/i18n/locales/en-US.ts` (SCOPE-052). No bare literals; `npm run lint:i18n` must pass.
- [x] [T016] [P1] Build `CustomerFormDialog` — the create/edit form. T011's approved `page.md` explicitly excluded this surface from its design pass, so it was designed and built together on 2026-07-31.
- [x] [T017] [P1] Build `CustomerTransferDialog` — the Company-Admin transfer surface for T010, likewise excluded from T011's pass.
- [x] [T012a] [P1] **Entrance fix, 2026-08-01.** T012's nav entry was added to `TEAM_NAV` only, so an ADMIN had no link to the Customers page — the route is a plain `ProtectedRoute`, not role-gated, so it worked for anyone who typed the URL and was invisible to everyone else. Fixed in `AppShell.tsx` by adding it to `ADMIN_NAV`; recorded in full as SCOPE-017 / T148, since the same edit restored SPEC-017's My Day entry. **Adding a page means adding it to both nav arrays.**
- [ ] [T018] [P2] Translate the `customers.*` namespace into the other five locales — `de-DE`, `es-ES`, `fr-FR`, `it-IT`, `pt-BR` have no `customers` namespace, so those users see English on this screen. SPEC-017's `consultantdash.*` has the identical gap (its T062a); do both in one pass.

## Phase 4: Tests

- [x] [T015] [P1] Isolation and link-confers-nothing tests — zero cross-consultant reads/writes/enumerations through any endpoint; setting `clientcompanyid` grants zero additional permissions. Plus archive-preserves-history coverage.

---

## Task Completion Tracking

| Phase | Total | Complete | Progress |
| ----- | ----- | -------- | -------- |
| Phase 1: Schema | 4 | 4 | 100% |
| Phase 2: API | 7 | 7 | 100% |
| Phase 3: UI | 8 | 7 | 88% |
| Phase 4: Tests | 1 | 1 | 100% |
| **Total** | **20** | **19** | **95%** |

Revised 2026-08-01. Phase 3 gained T016 and T017 — both were built on 2026-07-31 and fenced, but
never listed, so their fences resolved to `UNKNOWN_TASK`. T018 (the five missing locales) is the
one piece of this scope that is genuinely not done.

## Notes

- The DDL was applied **before** this spec existed, which is unusual but deliberate: SCOPE-017 Phase 1 was hard-blocked on the missing table and the operator applied `0059` as soon as the RESTRICT-vs-CASCADE question was settled.
- T003 is the ordering hazard. DDL first, code second — see the banner in `0059_scope119_customers.sql`.
- Code fences use `[SCOPE 119 / Tnnn]`. Never hand-author them outside the orchestrator path.
