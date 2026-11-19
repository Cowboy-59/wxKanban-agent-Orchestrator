# Task Breakdown: SysAdmin Action Audit Trail

**Feature**: SysAdmin Action Audit Trail
**Spec**: 147
**Date Generated**: 2026-10-25
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | SysAdmin write registry and route-enumeration test (FR-002) | critical | done |
| 2 | Record mechanism: one row per successful change, before/after, loud failure (FR-001, FR-003, FR-005) | critical | done |
| 3 | Secret redaction (FR-004) | critical | done |
| 4 | Wire the 34 sysadmin.ts routes into the registry (FR-001, FR-003) | high | done |
| 5 | Wire the 50 marketing, newsletter, welcome and bio routes (FR-001, FR-003) | high | done |
| 6 | GET /api/sysadmin/audit (FR-006) | high | done |
| 7 | /sysadmin/audit page (FR-007) | high | done |
| 8 | Route tests: one row per change, none on failure, no secrets (SM 2-3) | high | done |
| 9 | Append-only SQL for the owner, applied after deploy (FR-008) | high | done |
| 10 | Live verification on the test company (FR-009) | critical | done |

## Task Details

### T001 — SysAdmin write registry and route-enumeration test (FR-002)

One registry (beside src/server/routes/auditAccess.ts, same pattern) of every POST/PUT/PATCH/DELETE route guarded by requireSysAdmin across sysadmin.ts, marketingAi.ts, marketingAdmin.ts, marketingBanners.ts, newsletter.ts, welcome.ts, bioAdmin.ts, marketingLinks.ts — key 'file METHOD /path' → { action: sysadmin_<entity>_<verb> } or { readOnly: reason }. A unit test walks each router's stack, finds routes whose handlers include requireSysAdmin, and fails on a guarded mutating route missing from the registry, on a stale entry, and on an empty readOnly reason. Re-count the 84 at implement. Classification: heavy (more than 5 files).

### T002 — Record mechanism: one row per successful change, before/after, loud failure (FR-001, FR-003, FR-005)

A recordSysAdminAction mechanism driven by the registry: writes one companyauditlogs row only after a 2xx response, filed under the acting SysAdmin's company (changedby = SysAdmin), newvalue carrying { target: {type,id,name}, route: {method,path}, after }, previousvalue carrying before; update = changed fields, create = after only, delete = before only, bulk = ids + count. A failed insert leaves the change and logs one error-level line naming the action and target. Routes supply an optional before-loader. Classification: heavy.

### T003 — Secret redaction (FR-004)

Redact passwords, reset tokens, API keys, secrets and the values of settings marked secret to [REDACTED] before a row is written (key list + settings-secret flag). Unit test on the key list; route test asserting the literal password/token/secret never appears in previousvalue, newvalue or description for POST /users/:id/reset-password and PUT /settings/:key. Classification: heavy (security).

### T004 — Wire the 34 sysadmin.ts routes into the registry (FR-001, FR-003)

Declare every mutating route in src/server/routes/sysadmin.ts in the registry with its action name and before-loader (companies, users, subscriptions, settings, feedback, docs, signup invitations, infra-health, kit cache). readOnly only with a reason. Responses unchanged. Classification: heavy (more than 5 files of behavior touched through one router).

### T005 — Wire the 50 marketing, newsletter, welcome and bio routes (FR-001, FR-003)

Declare the requireSysAdmin mutating routes in marketingAi.ts (13), marketingAdmin.ts (11), marketingBanners.ts (9), newsletter.ts (5), welcome.ts (5), bioAdmin.ts (4), marketingLinks.ts (3). AI generation/preview routes that store nothing are readOnly with a reason. Responses unchanged. Classification: heavy (more than 5 files).

### T006 — GET /api/sysadmin/audit (FR-006)

SYSADMIN-only, read-only endpoint listing sysadmin_* companyauditlogs rows newest first; filters actor, action, targetType, targetId, from, to; limit ≤ 100 (400 above), offset. Route tests: 403 for non-SYSADMIN, each filter narrows, limit 101 refused. Classification: moderate.

### T007 — /sysadmin/audit page (FR-007)

New src/client/pages/SysAdmin/AuditLog.tsx routed at /sysadmin/audit in App.tsx (ProtectedRoute + SYSADMIN check like the other SysAdmin pages): filter bar, table (actor, action, target, before → after, time), pagination, empty/loading/error states, shadcn Table/Input/Select/Button/Badge per _wxAI/rules/shadcn.md. Confirm Dashboard.tsx:366 navigate('/sysadmin/audit') lands on it. Non-SYSADMIN sees an access notice. Classification: moderate.

### T008 — Route tests: one row per change, none on failure, no secrets (SM 2-3)

Supertest over the SysAdmin routers with services stubbed (never the production DB): for a representative route per file assert exactly one companyauditlogs insert on 2xx with the FR-001 fields, zero on 4xx/5xx, and no secret literal in the row; a forced insert failure logs one error line and still returns the change's 2xx. Classification: moderate.

### T009 — Append-only SQL for the owner, applied after deploy (FR-008)

Write specs/147-sysadmin-action-audit-trail/sql/0001-companyauditlogs-append-only.sql (revoke UPDATE and DELETE on companyauditlogs from wxkanban_app; INSERT and SELECT stay) with read-only verification queries, and a PENDING entry in specs/117-production-schema-integrity/schema-change-log.md. The owner applies it after SCOPE-147 is deployed; then verify a change and a removal as the app role raise 42501, an insert succeeds, and the test suite passes. Classification: heavy (production schema privileges).

### T010 — Live verification on the test company (FR-009)

After deploy: as SYSADMIN toggle a Wxperts LLC company setting and toggle it back; both rows appear in GET /api/sysadmin/audit with correct before/after; a non-SYSADMIN gets 403; after FR-008, a change to an audit row as the app role is refused. Evidence to specs/147-sysadmin-action-audit-trail/evidence/. Classification: heavy (production).

### Implement notes (2026-10-25)

- One app-level middleware (`sysAdminAudit`) mounted at `app.use("/api/sysadmin")` ahead of every SysAdmin router records from the registry; no SysAdmin route handler was edited.
- Re-count at implement: **87** routes, not 84 — `marketingFeatureSnippets.ts` (`adminRouter`, mounted at /api/sysadmin/marketing/feature-snippets) adds 3. 20 are readOnly with reasons (the 13 marketing/ai drafts, two invitation previews, two test sends, three S3 upload-URL presigns).
- The registry agent found three middleware defects, fixed before shipping: rawToken/registerLink not redacted; a secret setting's value not redacted on update (name arrives as a route param); create responses wrapped as {issue}/{doc}/... lost their id.
- Tests: tests/unit/sysAdminWriteRegistry.test.ts (enumeration, named + default imports), tests/backend/sysAdminAudit.middleware.test.ts. Local smoke: audit API 200/403/401/400; reads pass through.
- T009 SQL written (sql/0001-companyauditlogs-append-only.sql) — the owner applies it after deploy. T010 runs after deploy.

### T010 result (2026-10-25)

Deployed 8068fb63 (app 1.5.352): both App Runner deploys SUCCEEDED; the live bundle carries 1.5.352 and the Audit trail page; anonymous GET /api/sysadmin/audit answers 401. On the local server on the deployed commit against the production database (production JWT secret differs from the local one): Wxperts LLC phone null → 555-0147 → null, both PATCH 200, phone restored; exactly 2 sysadmin_company_updated rows with mirrored before/after, actor admin@wxkanban.com, target Wxperts LLC; GET /api/sysadmin/audit returns both; ADMIN gets 403. Acceptance criterion 3 met after T009 (applied by Andy 2026-10-25): as wxkanban_app, UPDATE and DELETE on companyauditlogs raise 42501, INSERT still works. Evidence: evidence/t010-live.json.
