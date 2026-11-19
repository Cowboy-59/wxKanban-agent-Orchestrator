# Plan: Audit Route Access Control

**Spec Number**: 146
**Date**: 2026-10-25
**Scope**: `specs/Project-Scope/146-audit-route-access-control.md` (validatescope 100)
**Ships**: alone, ahead of the kit write-safety batch — app push only (server + client). No kit, no VSIX, no DDL.

## Implementation Plan

### Phase 1 — Server guards (T001, T002, T003, T005)

1. **T001** — the route access table and the route-enumeration test land first; every later task is checked against them.
2. **T002** — `requireSysAdmin` on the 14 SYSADMIN routes, mounted **before** `validateBody` / `validateQuery` in each route's middleware list.
3. **T003** — framework-only reads in `DocumentService`, plus moving `GET /documents/search` above `GET /documents/:id`.
4. **T005** — the `method` field on the `requireSysAdmin` warn record; `logSysAdminAction` on every SYSADMIN write.

### Phase 2 — Re-extract (T004)

Parse first; 0 tasks → 422 with nothing changed; otherwise delete-and-insert in one `db.transaction`.

### Phase 3 — Client (T006)

Hide what a role cannot use; the `/admin/audit` notice for non-SYSADMIN. Build both bundles.

### Phase 4 — Verification (T007, T008)

- T007, the route tests per role, runs locally and in CI.
- T008, the live endpoint test, runs after the owner pushes and the deploy is verified (bundle version + a live probe, never the version string alone).

## Gates

- `wxkanban-agent auditfences` exits 0 for the touched files before the push.
- The route-enumeration test (T001) and the role suite (T007) are green.
- `npm run build` (both bundles) succeeds.
- **Owner approval to push**: a push deploys production, and the MCP redeploys on the same push.
- T008 is the release acceptance; the scope is not done until it passes on the deployed app.

## Known Issues

- **`GET /documents/search` is unreachable today.** It is registered after `GET /documents/:id` (`src/server/routes/audit.ts:225` vs `:267`), so Express matches "search" as an id. T003 reorders them, and T007 covers search.
- **`requireSysAdmin` is shared middleware** (used by the SysAdmin routes). T005 only adds a `method` field to its warn record. Behavior is unchanged for its other callers, and the Change Impact boundary will ask.
- **Unit tests can hit the production DB.** Some suites mock the wrong module (memory: unit tests hit prod). T007 mocks the service layer explicitly, or runs inside a rolled-back transaction, and never deletes or extracts against a live row.
- **The re-extract cascade.** Deleting a document's tasks cascades to their `auditresults` (0 rows in production today). The SYSADMIN confirm states it (T006).
- **`logSysAdminAction`'s `targetType`** is `USER | COMPANY | SYSTEM | SETTINGS`. Audit-library actions use `SYSTEM`, and new `AuditAction` values are added if the enum lacks them.
- **HITRUST** has 304 rows but only 300 distinct title+control keys. This predates the scope and is out of scope, so do not "fix" it during T004.

## Compliance (SOC2)

| Control | Requirement | Where it is met |
|---|---|---|
| CC6.3 | Least privilege | T002, T003; kept true for new routes by T001 |
| CC6.1 | Authorization design stated before implementation | The scope's API Routes table, implemented by T001 |
| CC7.2 | Audit trail | T005 |
| CC7.2 | Security log monitoring | T005 |
| CC5.2 | Separation of duties | Not applied (owner decision) |
