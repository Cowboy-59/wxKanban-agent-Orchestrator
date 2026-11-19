# Tasks: Consultant Dashboard (Spec 017)

## Task index — machine-readable (added 2026-07-31)

The orchestrator's task index (`wxkanban-agent/core/orchestrator/task-id-index.ts`) only reads
lines beginning with `|` or `###`; it **ignores `- [ ]` checkbox rows**. Every task below is
written as a checkbox, so without this table the index sees zero tasks for scope 017 and every
code fence referencing one reports `UNKNOWN_TASK`. The same table-only parser limits `dbpush`.

This table exists so implemented work resolves. Add a row when a task produces code.

**Numbering correction 2026-08-01.** The connection layer was fenced `T100`–`T112`, but Phase 5
already defined those IDs as security middleware, health-check jobs and wxAI slash commands. Code
fences are written by the orchestrator and are never hand-edited — rewriting one silently
reassigns authorship — so the *tasks* moved, not the fences: `T100`/`T101` kept their original
meanings (they matched what was built), `T102`–`T112` are redefined below as the connection layer,
and the eleven displaced Phase 5 definitions were renumbered to **`T135`–`T145`**. The old
Connection / Sync-and-Health IDs (`T029`–`T042`) that describe the same endpoints are struck
through as superseded, so they are not counted as work remaining.

| Task | Status | Implements |
| ---- | ------ | ---------- |
| T001 | done — 2026-07-31 | `src/db/migrations/0060_scope017_connections.sql` — reviewed DDL for all four connection tables + 15 indexes, applied by hand per SCOPE-117. Fences T002/T003/T004/T009 too (one migration file, one fence) |
| T002 | done — 2026-07-31 | `credentialauditlogs` DDL — in the T001 migration. `ON DELETE SET NULL` on both FKs, correcting the spec's `CASCADE` (an audit trail that a delete can erase is not an audit trail) |
| T003 | done — 2026-07-31 | `synchistory` DDL — in the T001 migration; cascades from its connection (operational telemetry, not audit) |
| T004 | done — 2026-07-31 | `connectionhealth` DDL — in the T001 migration; cascades from its connection |
| T005 | done — 2026-07-31 | `src/db/schema/externalconnection.ts` |
| T006 | done — 2026-07-31 | `src/db/schema/credentialauditlog.ts` |
| T007 | done — 2026-07-31 | `src/db/schema/synchistory.ts` |
| T008 | done — 2026-07-31 | `src/db/schema/connectionhealth.ts` |
| T009 | done — 2026-07-31 | 15 indexes — in the T001 migration |
| T009a | done — 2026-07-31 | `npm run db:drift` exits 0; 110/129 declared/deployed; recorded in the SCOPE-117 schema change log |
| T047 | done — 2026-07-31 | Consultant Dashboard, path (c): `GET /api/consultant/dashboard`, `ConsultantDashboardPage`, `/dashboard/consultant` route, `appnav.myDay`. Also fences T015, T016, T048, T049, T053, T054a, T055, T060, T061, T062 |
| T071 | done — 2026-08-01 | `ConnectionFormDialog` — create a connection with a credential scope selector; wires the T111 Add button, which shipped inert |
| T147 | done — 2026-08-01 | **Production 500 fix.** `GET /api/consultant/dashboard` failed for every consultant with ≥1 project; the two `ANY(...)` project filters became `inArray()`. Regression test `tests/unit/consultantDashboardQuery.test.ts` |
| T148 | done — 2026-08-01 | **Entrance fix.** My Day and Customers were in `TEAM_NAV` only, so an ADMIN had no link to either page despite neither being role-gated. Added both to `ADMIN_NAV` |
| T149 | done — 2026-08-01 | **Second production 500 in the same handler.** Raw `Date` objects bound into `sql` templates → `ERR_INVALID_ARG_TYPE`. Bound as ISO strings |
| T150 | done — 2026-08-01 | **Endpoint-level test suite** `tests/integration/consultantSurface.test.ts` + `tests/setup.env.ts` — the thing that should have existed before any of T147/T149 shipped |
| T100 | done — 2026-07-31 | `src/server/lib/credentialAccess.ts` — credential scope policy as a pure rule, tested independently of Express |
| T101 | done — 2026-07-31 | Credential audit-trail append (FR-012) — snapshots connection name and actor email so the row survives both deletions |
| T102 | done — 2026-07-31 | `GET /api/consultant/customers/:id/connections` (FR-010) — supersedes T029. Router mounted in `app.ts` |
| T103 | done — 2026-07-31 | `POST /api/consultant/customers/:id/connections` (FR-007) — supersedes T030 |
| T104 | done — 2026-07-31 | `GET /api/consultant/connections/:id` — metadata only, never credentials (FR-010) — supersedes T032 |
| T105 | done — 2026-07-31 | `PATCH /api/consultant/connections/:id` — credential rotation (FR-007) — supersedes T033 |
| T106 | done — 2026-07-31 | `DELETE /api/consultant/connections/:id` — soft delete (FR-010) — supersedes T034 |
| T107 | done — 2026-07-31 | `POST /api/consultant/connections/:id/test` (FR-013) — supersedes T031 and T039 |
| T108 | done — 2026-07-31 | `GET /api/consultant/connections/:id/audit-log` (FR-012) — supersedes T038 |
| T109 | done — 2026-07-31 | `GET /api/consultant/connections/:id/sync-history`, last 10 runs (FR-011) — supersedes T037 |
| T110 | done — 2026-07-31 | `GET /api/consultant/dashboard/connection-health` (FR-013) — supersedes T041 |
| T111 | done — 2026-07-31 | `ConnectionsPanel` — the connection list for a customer, mounted in SCOPE-119's customer detail exactly where its `page.md` reserved the slot. Supersedes T072/T073 |
| T112 | done — 2026-07-31 | Consultant Dashboard Connections tile (FR-013) — the fourth stat tile the design always specified, rendered only when connections exist |

## Phase 1: Database & API Foundation

> ✅ **UNBLOCKED 2026-07-31.** Phase 1 was blocked because `T001` declares
> `customerid UUID NOT NULL REFERENCES customers(id)` and no `customers` table existed —
> `plan.md` had listed it under "Existing Infrastructure", which was false. **SCOPE-119**
> supplied the table the same day (`0059_scope119_customers.sql`, applied by hand), which closed
> **Gate 5** in `plan.md`. `0060_scope017_connections.sql` followed and all four connection
> tables are live in production; see the SCOPE-017 entry in
> `specs/117-production-schema-integrity/schema-change-log.md`.

### Database Schema

> **Table names corrected 2026-07-31.** The original spec used `snake_case`
> (`external_connections`, `credential_audit_log`, …), which violates the DB convention in
> CLAUDE.md: lowercase, plural, **no underscores**, compound names concatenated. Columns follow
> the same rule — `customerid`, `consultantid`, `credentialscope`, `lastsyncat`, `createdat`.
>
> **Schema is applied MANUALLY (SCOPE-117).** There is no migration ledger and nothing
> auto-applies DDL, and the local `.env` `DATABASE_URL` points at **production**.
> `drizzle-kit push` is PROHIBITED against this database. The workflow for every task below is:
> edit `src/db/schema/` → produce reviewed SQL → apply by hand → verify `npm run db:drift` →
> record in `specs/117-production-schema-integrity/schema-change-log.md`.

- [x] [T001] [P1] Produce reviewed DDL for `externalconnections` table (manual apply). **DONE 2026-07-31** — `0060_scope017_connections.sql` covers all four tables; the spec's `users(id)` references were corrected to `userprofiles(id)`, which do exist.
- [x] [T002] [P1] Produce reviewed DDL for `credentialauditlogs` table (manual apply). **DONE 2026-07-31** — both FKs `SET NULL`, not `CASCADE`; see the change-log entry.
- [x] [T003] [P1] Produce reviewed DDL for `synchistory` table (manual apply). **DONE 2026-07-31**
- [x] [T004] [P1] Produce reviewed DDL for `connectionhealth` table (manual apply). **DONE 2026-07-31**
- [x] [T005] [P1] Create Drizzle schema for `externalconnections`
- [x] [T006] [P1] Create Drizzle schema for `credentialauditlogs`
- [x] [T007] [P1] Create Drizzle schema for `synchistory`
- [x] [T008] [P1] Create Drizzle schema for `connectionhealth`
- [x] [T009] [P1] Add indexes for performance optimization — 15 across the four tables
- [x] [T009a] [P1] Verify with `npm run db:drift` and record all four tables in the SCOPE-117 schema change log. **DONE 2026-07-31** — exit 0, 110/129 declared/deployed, delete rules queried in production.

### Encryption Service

- [~] [T010] [P1] ~~Create encryption service with AES-256-GCM~~ — **RETIRED 2026-07-31**: `src/server/lib/crypto.ts` already ships AES-256-GCM. `externalconnections.credentialsencrypted` stores its `iv:authTag:ciphertext` format. Building a second one would put two key derivations in production.
- [~] [T011] [P1] ~~Implement credential encryption method~~ — **RETIRED 2026-07-31**: reuses `crypto.ts` per T010.
- [~] [T012] [P1] ~~Implement credential decryption method~~ — **RETIRED 2026-07-31**: reuses `crypto.ts` per T010.
- [ ] [T013] [P1] Add key rotation support — **still open.** T105 rotates a connection's *credentials*; rotating the *encryption key* across every stored credential is not built.
- [~] [T014] [P2] ~~Write encryption service tests~~ — **RETIRED 2026-07-31**: covered where `crypto.ts` is tested; no new service to test.

### Dashboard API

- [x] [T015] [P1] Create consultant routes file — `src/server/routes/consultantDashboard.ts` (fenced T047)
- [x] [T016] [P1] Implement GET /api/consultant/dashboard endpoint (fenced T047)
- [~] [T017] [P1] ~~Implement GET /api/consultant/projects endpoint~~ — **FOLDED into T016**: projects arrive in the dashboard summary payload, one query, per the 3-second budget in page.md.
- [ ] [T018] [P1] Implement GET /api/consultant/projects/:id/tasks endpoint
- [~] [T019] [P1] ~~Implement POST /api/consultant/time-entries endpoint~~ — **RETIRED 2026-07-31**: `POST /api/time-tracking/start` already ships (SCOPE-020). Reuse it.
- [~] [T020] [P1] ~~Implement PATCH /api/consultant/time-entries/:id endpoint~~ — **RETIRED 2026-07-31**: `POST /api/time-tracking/stop/:id` already ships (SCOPE-020). Reuse it.
- [~] [T021] [P1] ~~Implement GET /api/consultant/time-entries/today endpoint~~ — **RETIRED 2026-07-31**: today's totals are folded into the T016 dashboard summary payload (one query, per the 3-second budget in page.md).
- [ ] [T022] [P1] Implement GET /api/consultant/earnings endpoint
- [ ] [T023] [P1] Add dashboard API tests

### Customer API

> **Retired 2026-07-31 — the customer layer moved to SCOPE-119.** SPEC-017 declared `customers`
> as existing infrastructure, which was false and blocked this entire phase. SCOPE-119 owns the
> Customer record and shipped all nine endpoints in `src/server/routes/consultantCustomers.ts`.
> SPEC-017 consumes them; it does not redefine them.

- [~] [T024] [P1] ~~Implement GET /api/consultant/customers endpoint~~ — **RETIRED 2026-07-31**: shipped as SCOPE-119 / T004.
- [~] [T025] [P1] ~~Implement POST /api/consultant/customers endpoint~~ — **RETIRED 2026-07-31**: shipped as SCOPE-119 / T004.
- [~] [T026] [P1] ~~Implement GET /api/consultant/customers/:id endpoint~~ — **RETIRED 2026-07-31**: shipped as SCOPE-119 / T004.
- [~] [T027] [P1] ~~Implement PATCH /api/consultant/customers/:id endpoint~~ — **RETIRED 2026-07-31**: shipped as SCOPE-119 / T004.
- [~] [T028] [P1] ~~Add customer API tests~~ — **RETIRED 2026-07-31**: shipped as SCOPE-119 / T015 (`tests/unit/consultantCustomersAccess.test.ts`).

### Connection API

> **Superseded 2026-07-31 by T102–T110.** The connection layer was built and fenced under the
> `T1xx` range; these earlier IDs describe the same endpoints. They are struck through so the
> work is not double-counted. See the numbering correction at the top of this file.

- [~] [T029] [P1] ~~Implement GET /api/consultant/customers/:id/connections endpoint~~ — **SUPERSEDED by T102.**
- [~] [T030] [P1] ~~Implement POST /api/consultant/customers/:id/connections endpoint~~ — **SUPERSEDED by T103.**
- [~] [T031] [P1] ~~Implement POST /api/consultant/customers/:id/connections/test endpoint~~ — **SUPERSEDED by T107**, which tests a saved connection at `/connections/:id/test`. Testing credentials before they are saved is not built.
- [~] [T032] [P1] ~~Implement GET /api/consultant/connections/:id endpoint~~ — **SUPERSEDED by T104.**
- [~] [T033] [P1] ~~Implement PATCH /api/consultant/connections/:id endpoint~~ — **SUPERSEDED by T105.**
- [~] [T034] [P1] ~~Implement DELETE /api/consultant/connections/:id endpoint~~ — **SUPERSEDED by T106.**
- [ ] [T035] [P1] Add connection API tests — **still open.** `tests/unit/credentialAccess.test.ts` covers the T100 scope rule; the ten endpoints have no route-level tests.

### Sync & Health API

- [ ] [T036] [P1] Implement POST /api/consultant/connections/:id/sync endpoint — **still open.** T109 reads sync history; nothing writes it yet.
- [~] [T037] [P1] ~~Implement GET /api/consultant/connections/:id/sync-history endpoint~~ — **SUPERSEDED by T109.**
- [~] [T038] [P1] ~~Implement GET /api/consultant/connections/:id/audit-log endpoint~~ — **SUPERSEDED by T108.**
- [~] [T039] [P1] ~~Implement POST /api/consultant/connections/:id/test endpoint~~ — **SUPERSEDED by T107.**
- [ ] [T040] [P1] Implement GET /api/consultant/connections/:id/health endpoint — **still open.** T110 returns the dashboard roll-up; per-connection health history is not exposed.
- [~] [T041] [P1] ~~Implement GET /api/consultant/dashboard/connection-health endpoint~~ — **SUPERSEDED by T110.**
- [ ] [T042] [P1] Add sync and health API tests

### Reporting API
- [ ] [T043] [P2] Implement GET /api/consultant/projects/:id/time-entries endpoint
- [ ] [T044] [P2] Implement GET /api/consultant/projects/:id/billing endpoint
- [ ] [T045] [P2] Implement POST /api/consultant/reports/export endpoint
- [ ] [T046] [P2] Add reporting API tests

## Phase 2: Dashboard UI

> **`page.md` is the authority for this phase.** The approved design composes the dashboard as a
> single page with three local sub-components (`StatTile`, `ProjectRow`, `DashboardSkeleton`)
> rather than the eight separate widgets originally listed. The tasks below are re-pointed to
> match; the design's TSX is the implementation input.
>
> **Scope decision 2026-07-31 — this screen orients, the Work Hub executes.** SCOPE-020's
> `/dashboard/work-hub` already ships FR-002 (timer), FR-003 (task queue) and FR-009 (time
> drill-down) in production. The dashboard links to it and does **not** redraw them.

### Core Dashboard Components

- [x] [T047] [P1] Create ConsultantDashboardPage shell — header, ledger, exceptions band, 7/5 container-query split (per page.md § Layout). **DONE 2026-07-31**; the 7/5 split was restored by SCOPE-119 / T013 once customers existed.
- [x] [T048] [P1] Create StatTile sub-component — Today / This week / Period earnings / Connections. **DONE 2026-07-31**; the fourth (Connections) tile landed with T112.
- [x] [T049] [P1] Create ProjectRow sub-component — completion bar, task counts, inline due badge, Open link
- [~] [T050] [P1] ~~Create TimeTracker component with timer~~ — **RETIRED 2026-07-31**: shipped by SCOPE-020 in `ConsultantWorkHubPage.tsx`. Building it here would put a second timer in production.
- [~] [T051] [P1] ~~Create EarningsWidget component~~ — **FOLDED into T048**: earnings are the third stat tile, not a separate widget.
- [~] [T052] [P1] ~~Create TaskSummary component~~ — **FOLDED into T049**: the design carries due dates inline on the project row and escalates overdue items to the exceptions band, rather than a separate deadline panel (page.md § Hierarchy).
- [x] [T053] [P1] Create the designed empty state — icon, copy, "Add your first customer" + "Open Work Hub"
- [~] [T054] [P1] ~~Create HealthStatusWidget component~~ — **FOLDED into T048 + T063**: health is the fourth stat tile's roll-up plus a per-customer status line; failures escalate to the exceptions band.
- [x] [T054a] [P1] Create the exceptions band — renders **only** when non-empty (overdue tasks + connection errors). **DONE 2026-07-31** for overdue tasks (`data.alerts`). Connection errors are not yet a source: the server assembles `alerts` from overdue work only, so a failing connection surfaces on the T112 tile but does not escalate to the band. Tracked as T146.

### Dashboard Hooks

- [x] [T055] [P1] Create useDashboard hook (`GET /api/consultant/dashboard`)
- [~] [T056] [P1] ~~Create useProjects hook~~ — **FOLDED into T055**: projects arrive in the dashboard summary payload.
- [~] [T057] [P1] ~~Create useTimeEntries hook~~ — **RETIRED 2026-07-31**: time totals arrive in the summary payload; per-entry reads belong to the Work Hub's `TimeLogDrawer` (SCOPE-020).
- [~] [T058] [P1] ~~Create useEarnings hook~~ — **FOLDED into T055**.
- [~] [T059] [P1] ~~Create useTimer hook for running timer~~ — **RETIRED 2026-07-31**: shipped by SCOPE-020 (`/api/time-tracking/active`).

### Dashboard Pages

- [x] [T060] [P1] Wire ConsultantDashboardPage to the summary query with loading / empty / error states
- [x] [T061] [P1] Add `/dashboard/consultant` route to `App.tsx` (see page.md § Open questions — spec.md said `/consultant/dashboard`; app convention is `/dashboard/*`)
- [x] [T062] [P1] Add consultant navigation to AppShell
- [ ] [T062a] [P2] Add i18n keys under `consultantdash.*` for all six locales (SCOPE-052 — no bare string literals). **PARTIAL 2026-07-31** — `en-US.ts` only. `de-DE`, `es-ES`, `fr-FR`, `it-IT` and `pt-BR` have no `consultantdash` namespace, so five locales fall back to English on this screen. The same gap applies to SCOPE-119's `customers.*`.

## Phase 3: Customer & Connection UI

### Customer Components

> **Retired 2026-07-31 — the customer UI moved to SCOPE-119** along with the record itself.
> `ConsultantCustomersPage` ships master-detail on one route per its approved `page.md`, and
> SPEC-017's connection manager mounts inside its detail pane (T111).

- [~] [T063] [P1] ~~Create CustomerPanel component~~ — **RETIRED 2026-07-31**: shipped as SCOPE-119 / T012 + T013.
- [~] [T064] [P1] ~~Create CustomerForm component~~ — **RETIRED 2026-07-31**: shipped as SCOPE-119 / T016 (`CustomerFormDialog`).
- [~] [T065] [P1] ~~Create CustomerCard component~~ — **RETIRED 2026-07-31**: folded into SCOPE-119 / T012's master-detail list.
- [~] [T066] [P1] ~~Create CustomerActions component~~ — **RETIRED 2026-07-31**: archive/restore/transfer ship as SCOPE-119 / T012 and T017.

### Customer Hooks

- [~] [T067] [P1] ~~Create useCustomers hook~~ — **RETIRED 2026-07-31**: shipped as SCOPE-119 / T012.
- [~] [T068] [P1] ~~Create useCreateCustomer hook~~ — **RETIRED 2026-07-31**: shipped as SCOPE-119 / T016.
- [~] [T069] [P1] ~~Create useUpdateCustomer hook~~ — **RETIRED 2026-07-31**: shipped as SCOPE-119 / T016.

### Connection Components

- [ ] [T070] [P1] Create ConnectionManager component — **still open.** With T071 landed, create works. **Edit and delete still have no UI**, so `PATCH` (T105) and `DELETE` (T106) are unreachable from the app — including credential rotation, which FR-007 wants every 90 days.
- [x] [T071] [P1] Create ConnectionForm with scope selector. **DONE 2026-08-01** — `ConnectionFormDialog`, wired to the previously inert Add button in T111. Name, system type, HTTPS-validated endpoint, token (+ optional account email), and PERSONAL/TEAM as radios stating each option's consequence rather than its label. Endpoint validated client-side with the server's own test so plaintext `http` never leaves the browser. Uses the native `LegacySelect`, not the composed `Select` in the same file — that one renders options as click-only `<div>`s with no role, no `aria-expanded` and no keyboard handling, which is not acceptable on a credential form. Credentials are posted as an opaque `{apitoken, accountemail?}` object; the server encrypts the JSON whole.
- [~] [T072] [P1] ~~Create ConnectionList component~~ — **SUPERSEDED by T111.**
- [~] [T073] [P1] ~~Create ConnectionCard component~~ — **SUPERSEDED by T111**: the row is drawn inline in the panel.
- [~] [T074] [P1] ~~Create CredentialScopeBadge component~~ — **FOLDED into T111**: drawn inline, neutral ink, `Lock`/`Users` by scope. Extract only when a second surface needs it.
- [~] [T075] [P1] ~~Create HealthIndicator component~~ — **FOLDED into T111**: drawn inline from `HEALTH_TONE`, with an explicit `unknown` state.

### Connection Hooks

- [~] [T076] [P1] ~~Create useConnections hook~~ — **FOLDED into T111**: one `useQuery` inside the panel, its only consumer.
- [ ] [T077] [P1] Create useCreateConnection hook — blocked on T071.
- [ ] [T078] [P1] Create useUpdateConnection hook — blocked on T071.
- [ ] [T079] [P1] Create useDeleteConnection hook — blocked on T070.
- [~] [T080] [P1] ~~Create useTestConnection hook~~ — **FOLDED into T111**: one `useMutation`, invalidating both the panel and the dashboard health tile.

### Customer & Connection Pages

- [~] [T081] [P1] ~~Create CustomerManagementPage~~ — **RETIRED 2026-07-31**: shipped as SCOPE-119 / T012 (`ConsultantCustomersPage`, master-detail on one route).
- [ ] [T082] [P1] Create ConnectionDetailPage — **still open.** T104 and T108 return detail and audit-log payloads that nothing renders.
- [~] [T083] [P1] ~~Add customer and connection routes~~ — **FOLDED into SCOPE-119 / T012**: connections live inside the customer detail pane (T111), not on their own route. Revisit if T082 lands.

## Phase 4: Sync & Audit Features

### Sync Components
- [ ] [T084] [P1] Create SyncDialog component
- [ ] [T085] [P1] Create SyncProgress component
- [ ] [T086] [P1] Create SyncResults component

### Audit Components
- [ ] [T087] [P1] Create AuditLogViewer component
- [ ] [T088] [P1] Create AuditLogEntry component
- [ ] [T089] [P2] Create AuditLogFilters component

### Sync & Audit Hooks
- [ ] [T090] [P1] Create useSync hook
- [ ] [T091] [P1] Create useSyncHistory hook
- [ ] [T092] [P1] Create useAuditLog hook
- [ ] [T093] [P1] Create useHealth hook

### Time & Billing Components

- [~] [T094] [P2] ~~Create TimeDetailModal component~~ — **RETIRED 2026-07-31**: shipped by SCOPE-020 as `TimeLogDrawer` (`src/client/components/consultant/TimeLogDrawer.tsx`).
- [ ] [T095] [P2] Create BillingReport component
- [ ] [T096] [P2] Create ExportDialog component

### Time & Billing Hooks
- [ ] [T097] [P2] Create useProjectTimeEntries hook
- [ ] [T098] [P2] Create useProjectBilling hook
- [ ] [T099] [P2] Create useExportReport hook

## Phase 5: Connection Layer (T100–T112, shipped 2026-07-31)

> **This phase was renumbered on 2026-08-01.** The connection layer was implemented and fenced
> `T100`–`T112`, colliding with the security / health-job / slash-command tasks that previously
> held those IDs. Fences are authored by the orchestrator and are never hand-edited, so the task
> definitions moved to match the code. The displaced work is now **Phase 5b (T135–T145)** below
> and has lost none of its content.

### Security & Access Control

- [x] [T100] [P1] Implement credential scope checking middleware — **DONE 2026-07-31** as `src/server/lib/credentialAccess.ts`, a pure rule rather than Express middleware so it is testable without a request. `PERSONAL` credentials are readable only by their owner; `TEAM` by the owning company. Covered by `tests/unit/credentialAccess.test.ts`.
- [x] [T101] [P1] Add audit logging to all credential operations — **DONE 2026-07-31** (FR-012). Snapshots `connectionname` and `useremail` onto every row so the entry stays readable after the connection and the actor are both deleted, which is what makes the `SET NULL` foreign keys safe.

### Connection API — as built

- [x] [T102] [P1] `GET /api/consultant/customers/:id/connections` — list for a customer (FR-010). Router mounted at `/api/consultant` in `app.ts`.
- [x] [T103] [P1] `POST /api/consultant/customers/:id/connections` — create (FR-007). Credentials encrypted with the existing `crypto.ts` before insert.
- [x] [T104] [P1] `GET /api/consultant/connections/:id` — detail, **metadata only**; `credentialsencrypted` is never in the select list.
- [x] [T105] [P1] `PATCH /api/consultant/connections/:id` — credential rotation (FR-007), audit-logged with a `rotated` flag.
- [x] [T106] [P1] `DELETE /api/consultant/connections/:id` — soft delete (FR-010), so the audit trail keeps its referent.
- [x] [T107] [P1] `POST /api/consultant/connections/:id/test` — verify credentials (FR-013). Gated on `cansecrets`: a reachability check run with someone else's secret is a leak by proxy.
- [x] [T108] [P1] `GET /api/consultant/connections/:id/audit-log` — the trail (FR-012).
- [x] [T109] [P1] `GET /api/consultant/connections/:id/sync-history` — last 10 runs (FR-011).
- [x] [T110] [P1] `GET /api/consultant/dashboard/connection-health` — the roll-up behind the dashboard tile (FR-013).

### Connection UI

- [x] [T111] [P1] `ConnectionsPanel` — the connection list for a customer, mounted in SCOPE-119's customer detail pane where its `page.md` reserved the slot. **Ships with a dead "Add connection" button — see T071.**
- [x] [T112] [P1] Consultant Dashboard Connections tile (FR-013) — the design's fourth stat tile, absent in path (c) only because the tables did not exist. Renders **only** when there are connections; "0 of 0 healthy" is a permanent dead region.

## Phase 5b: Security Hardening & Background Jobs

> Renumbered from T102–T112 on 2026-08-01 (see above). None of this is built.

### Security Implementation

- [ ] [T135] [P1] Implement rate limiting for sync operations — 10/hour per connection, 50/hour per user
- [ ] [T136] [P1] Add IP address logging to audit log
- [ ] [T137] [P2] Create credential access notification system

### Health Monitoring

- [ ] [T138] [P1] Create health check service
- [ ] [T139] [P1] Implement automatic health check job (15 min interval) — nothing currently writes `connectionhealth` except T107's manual test
- [ ] [T140] [P1] Add health status change notifications
- [ ] [T141] [P2] Implement automatic retry with exponential backoff

### wxAI Commands

- [ ] [T142] [P2] Implement /consultant-status command
- [ ] [T143] [P2] Implement /connection-status command
- [ ] [T144] [P2] Implement /sync-now command
- [ ] [T145] [P2] Implement /connection-audit command

### Carried Forward

- [ ] [T146] [P2] Escalate connection errors into the dashboard exceptions band — `GET /dashboard` assembles `alerts` from overdue work only, so a failing connection shows on the T112 tile but never reaches the band the design put it in (completes T054a)

### Defects Found In Use (2026-08-01)

Both were found the first time the shipped screens were opened by a real user with
real data. Neither was caught by the build, the type checker, or the test suite.

- [x] [T147] [P1] **`GET /api/consultant/dashboard` returned 500 for every consultant with at least one project.** Both project filters passed the id array straight into a `sql` template as `= ANY(...)`. Drizzle interpolates a JS array into a `sql` template as a parenthesised **bind-param list** — `IN` syntax — so `ANY()` was handed a scalar (1 id → `ANY(($1))` → **22P02**, `array_in`: *"Array value must start with {"*) or a row constructor (2+ ids → `ANY(($1, $2))` → **42809**). Fixed to `inArray()`, which emits `in ($1, $2)`. Verified against the live database, both arities.
  - **Why it hid:** the call site guards with `projectids.length ? ... : []`, so the query only runs for someone who *has* projects. Every test account and every empty-state path took the `[]` branch, and the endpoint looked healthy.
  - **Where the pattern was already right:** `inArray` is used at six other server sites, including `inArray(projecttasks.projectid, projectIds)` in `src/server/routes/admin.ts` — same column, same shape. These two lines were the only `ANY(${...})` in the entire server.
  - **Guard:** `tests/unit/consultantDashboardQuery.test.ts`, written red before the fix. Uses drizzle's driverless `QueryBuilder`, so it needs no database and no env and runs in CI. It also pins the broken form's emitted SQL, so a future drizzle change surfaces here rather than as a production 500.
  - **Fence:** recorded as `MODIFIED-BY: [SCOPE 017 / T147]` on the T047 block; T047's own label was left alone.
- [x] [T148] [P1] **My Day and Customers had no entrance for an ADMIN.** `AppShell.tsx` selects `usertype === "TEAM_MEMBER" ? TEAM_NAV : ADMIN_NAV`, and both entries had been added to `TEAM_NAV` only. Neither route is role-gated — both are plain `ProtectedRoute` — so the pages worked perfectly for anyone who knew the URL and were invisible to everyone else. Added both to `ADMIN_NAV`, ordered to mirror `TEAM_NAV` (orient → act → records). `Work Hub` was already in both lists, so consultant surfaces in the admin nav are the established pattern.
  - This is the delivery half of SCOPE-017 / T047 and SCOPE-119 / T012 — the code shipped, the door didn't. Worth a standing check: **adding a page means adding it to *both* nav arrays**, or deciding in writing that it belongs to one.
  - SCOPE-119 names Company Admin a **read-only** actor and `customerAccess.ts` enforces that server-side, so an admin reaching the Customers page is correct by design. If its create/edit controls render enabled and then 403 on save, that is a separate permissions-reflection defect — file it, don't hide the controls.

- [x] [T149] [P1] **A second fatal bug in the same handler, found only after T147 was fixed.** The time-ledger aggregate bound four `Date` objects straight into `sql` templates (`starttime >= ${today}` and five more). A `sql` template carries no column type, so drizzle cannot encode a `Date` and passes it to the driver's string encoder: `ERR_INVALID_ARG_TYPE — The "string" argument must be of type string or an instance of Buffer or ArrayBuffer. Received an instance of Date`. Bound as `.toISOString()` strings instead, which Postgres casts against the column.
  - **Same root cause class as T147**: a raw JS value interpolated into a `sql` template with no type information. T147 was the array case, T149 the date case. Anywhere a `sql` template takes a JS value that is not a column reference, ask what type Postgres will infer.
  - **This is the important part**: T147 was declared fixed on the strength of a green unit test and a green build. It was not fixed — the endpoint still returned 500, now for a different reason, and that was only discovered because the operator clicked the screen again. Fixing one bug revealed the next.
- [x] [T150] [P1] **Endpoint-level tests, which should have preceded all of the above.** `tests/integration/consultantSurface.test.ts` calls the real routes over HTTP with a minted JWT and asserts status + full response shape for `/dashboard`, `/dashboard/connection-health`, `/customers`, `/customers/:id/connections`, plus a 401 check on each. It deliberately selects a subject **who has at least one project**, because both T147 and T149 only fire on a non-empty list — a fixture-empty account passes while production burns. All GETs; it creates no rows.
  - Also added `tests/setup.env.ts` (registered as vitest `setupFiles`) to load `.env`. Without it, any test importing `src/server/config.ts` died at import — `config.ts` calls `process.exit(1)` on missing vars, and vitest reported "Failed Suite — process.exit unexpectedly called with 1" and no test names. **Endpoint tests were impossible in this repo until this existed.**
  - **Consequence, stated plainly:** `tests/unit/companyInvariants.test.ts` and `engagementPermissionIsolation.test.ts` had been dying at import for exactly that reason. They now run — and 11 of their tests fail, because their database mocks no longer take effect and they issue real queries. Those failures are **pre-existing and were previously invisible**: the suites contributed zero coverage while looking like an environment problem. Suite totals moved from "734 passed / 3 failed" to "753 passed / 14 failed" — the extra red is disclosure, not regression. Both suites are read-only (no insert/update/delete). Fixing their mocks is separate, unclaimed work.

### Note for anyone editing a legacy file (SCOPE-118 gate)

`auditfences` exempts legacy un-fenced code by **whole-file SHA-256**, not per declaration:
`loadLegacyHashes` reads `.wxai/auditfences-legacy.json` → `files` and builds a set of hash
*values*. So changing **one character** in a baselined file voids its exemption entirely, and
every pre-existing un-fenced declaration in it turns into an error at once. T148 touched
`AppShell.tsx` (5 legacy declarations) and T147 touched `app.ts` (1), which is why the error count
jumped 1 → 6 for edits that added no declarations at all.

The `deferred` array in that file is **documentation only** — the scanner never reads it. Editing
it changes nothing.

Resolved by re-hashing exactly those two files, after first proving every error was a declaration
the baseline already forgave at some other line (novel count: **0**). Re-running
`auditfences --baseline` would have been the wrong move: it re-hashes all 2,832 files and would
silently absorb any genuinely new un-fenced code anywhere in the tree.

**The gate flips to `--strict` on 2026-08-14.** Until the exemption is per-declaration rather than
per-file, every routine edit to an old file will present as a burst of errors that are not defects.
Worth fixing in the kit before that date.

## Phase 6: Testing & Documentation

### Unit Tests
- [ ] [T113] [P1] Write encryption service tests
- [ ] [T114] [P1] Write earnings calculation tests
- [ ] [T115] [P1] Write time entry validation tests
- [ ] [T116] [P1] Write credential scope permission tests

### Integration Tests
- [ ] [T117] [P1] Test all dashboard API endpoints
- [ ] [T118] [P1] Test all customer API endpoints
- [ ] [T119] [P1] Test all connection API endpoints
- [ ] [T120] [P1] Test sync operations
- [ ] [T121] [P1] Test external system connection tests

### E2E Tests
- [ ] [T122] [P1] E2E test: Dashboard load and navigation
- [~] [T123] [P1] ~~E2E test: Time tracking workflow~~ — **RETIRED 2026-07-31**: covered by `tests/e2e/consultant-hub.spec.ts` (SCOPE-020).
- [ ] [T124] [P1] E2E test: Customer CRUD operations
- [ ] [T125] [P1] E2E test: Connection setup and sync
- [ ] [T126] [P1] E2E test: Audit log viewing

### Security Tests
- [ ] [T127] [P1] Test credential encryption/decryption
- [ ] [T128] [P1] Test unauthorized access prevention
- [ ] [T129] [P2] Test SQL injection prevention
- [ ] [T130] [P2] Test XSS protection

### Documentation
- [ ] [T131] [P2] Create API documentation
- [ ] [T132] [P2] Create user guide for consultants
- [ ] [T133] [P2] Create admin guide for team managers
- [ ] [T134] [P2] Document security procedures

## Dependencies

### Phase 1 Dependencies
- Database migration system
- Drizzle ORM configured
- Express server running
- Existing time tracking tables

### Phase 2 Dependencies
- Phase 1 API complete
- React Query configured
- UI component library available
- Authentication system

### Phase 3 Dependencies
- Phase 2 dashboard UI complete
- Customer API endpoints
- Connection API endpoints

### Phase 4 Dependencies
- Phase 3 customer/connection UI complete
- Sync API endpoints
- Audit logging system

### Phase 5 Dependencies
- All previous phases complete
- Notification system
- Job scheduling system

### Phase 6 Dependencies
- All implementation complete
- Test environment ready
- Documentation tools

## Parallel Execution Opportunities

1. **Frontend & Backend Parallel**: UI components can be built with mock data while API is being developed
2. **Customer & Connection Parallel**: Customer and connection features can be developed simultaneously
3. **Testing Parallel**: Unit tests can be written alongside component development
4. **Documentation Parallel**: Documentation can be written during implementation

## Suggested MVP

**Core MVP (Days 1-3):**
- Database schema (4 tables)
- Dashboard API and UI
- Customer management
- Basic connection management

**Full Feature (Days 4-6):**
- Sync functionality
- Audit logging
- Health monitoring
- wxAI commands
- Complete test coverage

## Task Completion Tracking

Reconciled 2026-07-31 against the SCOPE-020 overlap, and again 2026-08-01 against SCOPE-119 and
the shipped connection layer. "Retired / folded" = shipped elsewhere, superseded by a `T1xx` ID,
or folded into a sibling task; none of it is work remaining, and each is struck through above
with a reason. Percentages are of **active** tasks, not of the original list.

| Phase | Entries | Retired / folded | Active | Complete | Progress |
| ----- | ------- | ---------------- | ------ | -------- | -------- |
| Phase 1: Database & API | 47 | 23 | 24 | 12 | 50% |
| Phase 2: Dashboard UI | 18 | 8 | 10 | 9 | 90% |
| Phase 3: Customer & Connection UI | 21 | 15 | 6 | 1 | 17% |
| Phase 4: Sync & Audit | 16 | 1 | 15 | 0 | 0% |
| Phase 5: Connection Layer (T100–T112) | 13 | 0 | 13 | 13 | 100% |
| Phase 5b: Security & Jobs (T135–T146) | 12 | 0 | 12 | 0 | 0% |
| Phase 5c: Defects found in use (T147–T150) | 4 | 0 | 4 | 4 | 100% |
| Phase 6: Testing & Docs | 22 | 1 | 21 | 0 | 0% |
| **Total** | **153** | **48** | **105** | **39** | **37%** |

**What the 36% is not.** The API surface is well ahead of the UI: ten connection endpoints ship
behind a panel that can now create, list and test — but **not edit or delete** (T070), so
credential rotation has no route through the app. Nothing writes `synchistory` or
`connectionhealth` on a schedule — T036 and T139 are both unbuilt — so the health tile reports
whatever the last manual test left behind. Read the Phase 3 and Phase 5b lists before quoting
this figure to anyone.

**And treat "complete" with suspicion here.** T047 was marked done on 2026-07-31 with a green
build and a green suite. Opening it once with real data produced **two** independent 500s in the
same handler (T147, T149) and a page with no link to it (T148). Everything in this file marked
done has been built, not exercised — the first three test phases (T113–T130) are entirely
unstarted.

**Standing rule adopted 2026-08-01:** every new or changed feature gets a test that exercises the
**real endpoint**, not only its parts. Unit tests on SQL shape passed while the handler had never
once been executed. T150 is the first such test in this spec; the same treatment is owed to the
ten connection endpoints (T035, still open) and to the customer endpoints.

## Task Dependencies Graph

Updated 2026-08-01 for the T1xx renumbering and the SCOPE-119 handover. `✔` = shipped.

```text
✔ T001 → ✔ T005 → ✔ T015 → ✔ T047 → ✔ T060
✔ T001 → ✔ T006 → ✔ T101 → ✔ T108 → T087 → T092
✔ T001 → ✔ T007 → ✔ T109 → T036 (nothing writes synchistory yet)
✔ T001 → ✔ T008 → ✔ T110 → ✔ T112 → T146 (errors reach the tile, not the band)

crypto.ts (existing) → ✔ T103 → ✔ T105        [T010–T012 retired: reuse, don't rebuild]
✔ T100 → ✔ T102 → ✔ T111 → ✔ T071             [Add button wired 2026-08-01]
✔ T103 → ✔ T071 ;  T105 → T070 → T077/T078    [edit + rotate still have no UI]
✔ T100 → ✔ T107 → T138 → T139                 [manual test only; no scheduled health job]

SCOPE-119 / T004 → ✔ T102                      [connections hang off customers]
SCOPE-119 / T012 → ✔ T111                      [the panel mounts in the customer detail pane]
```

## Notes

- All credential operations must go through encryption service
- Audit logging is required for every credential access
- Health checks run automatically every 15 minutes
- Sync operations are manual only (no scheduled sync)
- Rate limiting: 10 sync/hour per connection, 50/hour per user
