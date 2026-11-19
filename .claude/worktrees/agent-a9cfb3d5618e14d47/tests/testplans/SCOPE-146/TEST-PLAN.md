# Test Plan — SCOPE-146 Audit Route Access Control

**Spec**: `specs/146-audit-route-access-control/spec.md` (FR-001..FR-010) · **Commit**: 7c796612+working-tree
**Adapter**: wxkanban-express (shipped) · **Inventory**: `inventory.json` (46 units, 22 routes — matches the T001 route-enumeration test)
**Authored**: wxCreateTestPlan PLAN mode, 2026-10-25 · Phase 2A coverage approved by the owner.
**Source of truth**: `test-items.json` (this file renders from it; the JSON wins on any disagreement).

## Scope

In scope: the 22 `/api/audit` routes, the services behind them (DocumentService framework-only reads,
AuditTaskService replace-on-extract and task count), `requireSysAdmin`'s denial record, the per-project
tenant check (FR-009), the removal of the dead logger (FR-010), and the three client surfaces (project
Compliance tab, Documents sub-tab, `/admin/audit`).

Out of scope: auditing every SysAdmin action (its own scope next); customer-run audits via the kit;
the 4 same-named HITRUST controls; the dead `/sysadmin/audit` link.

## Test levels and tiers

| Tier | Items | What it touches |
|---|---|---|
| unit-mocked | 39 | Express app over real HTTP, services and db stubbed — nothing real |
| crud-nonprod | 4 | a faithful wxktest_ cloned schema only (EXECUTE mode) |
| manual | 6 | a person in the test environment, or the owner-approved T008 production write |
| live-readonly | 6 | the deployed app, read-only probes and fake-UUID denials |

Executor: **50 machine** (run in QA) · **5 human** (withheld until UAT promotion).

## Entry criteria

- SPEC-146 T001–T007, T009, T010 done; the three SPEC-146 suites green (120 tests); both bundles build.
- For `smoke` live items and T008: the deploy verified by bundle version **and** a live probe.
- For `crud-nonprod` items: `clone-test-schema.mjs --create` reports `faithful: true`, and `SELECT current_schema()` asserts the clone before the first write.

## Exit criteria

- 100% of P1 machine items pass; 0 `CODE-BUG` open on FR-001, FR-002, FR-003 or FR-009.
- Live: 0 of 14 SYSADMIN routes return 2xx to a customer role; the library counts are unchanged (6 / 119 / 304 / 565).
- Human UI items signed in UAT; the final signoff is the owner's.

## Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | T008 runs against production | fake-UUID denials; the only writes are one throwaway document, residue verified 0 (owner-approved) |
| 2 | Two concurrent re-extracts interleave | TC-DB-001-C1 on the clone; SYSADMIN-only, one SYSADMIN |
| 3 | Audit rows not atomic with the action | CLAR-01; observed behavior asserted |
| 4 | Consulting ADMIN sees enabled toggles that now 404 | CLAR-04 |
| 5 | Route tests stub services, so SQL is unproven there | TC-FN-001-B1 renders the real WHERE with PgDialect |

## Clarifications required

- **CLAR-01** (fn:recordAuditLibraryWrite) — Must the audit row be written in the same transaction as the action it records? *Assumed for now:* Observed: written after, failure logged and not raised.
- **CLAR-02** (fn:canReadProjectCompliance) — May a scope- or task-level consultant (not a whole-project grant) read a client project's compliance settings? *Assumed for now:* Observed: no — only whole-project grants read.
- **CLAR-03** (route:GET /documents/:id) — What status should a non-UUID :id return on the audit routes? *Assumed for now:* Not asserted.
- **CLAR-04** (route:PUT /config) — Should AuditConfigPanel disable the framework toggles for a consulting ADMIN, now that their PUT answers 404? *Assumed for now:* Not asserted; UX gap.

## Data-layer constraint gaps (DBA persona)

Business rules enforced **only in application code** — findings, not tests:

1. Only a SYSADMIN may write `wxkanbandocuments` / `complianceaudittasks` — no database role or RLS separates them; the application role can write both.
2. A non-SYSADMIN may read only `documenttype = 'compliance_framework'` — no view or policy enforces it at the database.
3. Only the owner company may change `appauditconfiguration` for a project — no tenant predicate at the database.

## Coverage by requirement

### FR-001 (6)

| ID | FR | Pri | Variant | Gate | Tier | Executor | Automation | Title |
|---|---|---|---|---|---|---|---|---|
| TC-SEC-001 | FR-001 | P1 | permission | unit | unit-mocked | machine | automated | Customer roles get 403 SYSADMIN on DELETE /documents/:id and nothing is written |
| TC-SEC-002-P1 | FR-001 | P1 | permission | unit | unit-mocked | machine | automated | Customer roles get 403 SYSADMIN on POST /documents/:id/extract and nothing is written |
| TC-SEC-003-P1 | FR-001 | P1 | permission | unit | unit-mocked | machine | automated | Customer roles get 403 SYSADMIN on POST /documents and nothing is written |
| TC-SEC-004-N1 | FR-001 | P1 | negative | unit | unit-mocked | machine | automated | A malformed body on POST /documents is refused with 403, not 400 |
| TC-SEC-005-P1 | FR-001 | P1 | permission | unit | unit-mocked | machine | automated | Every SYSADMIN route mounts requireSysAdmin as its first handler |
| TC-DB-002 | FR-001 | P1 | happy | crud | crud-nonprod | machine | blocked | Deleting a document cascades its compliance tasks |

### FR-002 (3)

| ID | FR | Pri | Variant | Gate | Tier | Executor | Automation | Title |
|---|---|---|---|---|---|---|---|---|
| TC-SEC-006 | FR-002 | P1 | permission | unit | unit-mocked | machine | automated | All 11 self-audit and report routes refuse every customer role |
| TC-SEC-007 | FR-002 | P1 | happy | unit | unit-mocked | machine | automated | SYSADMIN is never refused on any SYSADMIN route |
| TC-SEC-008-N1 | FR-002 | P1 | negative | unit | unit-mocked | machine | automated | A customer never receives an execution, result, code snippet, report or trend row |

### FR-003 (6)

| ID | FR | Pri | Variant | Gate | Tier | Executor | Automation | Title |
|---|---|---|---|---|---|---|---|---|
| TC-API-001 | FR-003 | P1 | happy | unit | unit-mocked | machine | automated | A non-SYSADMIN document list is narrowed to framework documents |
| TC-API-002-B1 | FR-003 | P1 | boundary | unit | unit-mocked | machine | automated | ?documenttype=db_analysis cannot widen a non-SYSADMIN list |
| TC-API-003-N1 | FR-003 | P1 | negative | unit | unit-mocked | machine | automated | An internal document by id answers a 404 identical to a missing one |
| TC-API-004 | FR-003 | P1 | happy | unit | unit-mocked | machine | automated | /documents/search is reachable and framework-only for a non-SYSADMIN |
| TC-FN-001-B1 | FR-003 | P1 | boundary | unit | unit-mocked | machine | automated | The framework-only predicate reaches the SQL of list, get and search |
| TC-API-005-P1 | FR-003 | P1 | permission | unit | unit-mocked | machine | automated | A SYSADMIN document list is not narrowed |

### FR-004 (4)

| ID | FR | Pri | Variant | Gate | Tier | Executor | Automation | Title |
|---|---|---|---|---|---|---|---|---|
| TC-SEC-009 | FR-004 | P1 | happy | unit | unit-mocked | machine | automated | Every registered audit route has exactly one access entry |
| TC-SEC-010-N1 | FR-004 | P1 | negative | unit | unit-mocked | machine | automated | An access entry naming an unregistered route fails the test |
| TC-SEC-011-B1 | FR-004 | P1 | boundary | unit | unit-mocked | machine | automated | The router registers exactly 22 audit routes |
| TC-SEC-012-P1 | FR-004 | P1 | permission | unit | unit-mocked | machine | automated | Each route's first guard matches its access entry |

### FR-005 (7)

| ID | FR | Pri | Variant | Gate | Tier | Executor | Automation | Title |
|---|---|---|---|---|---|---|---|---|
| TC-SEC-013 | FR-005 | P1 | happy | unit | unit-mocked | machine | automatable | Every SYSADMIN audit-library write leaves one companyauditlogs row |
| TC-SEC-014-B1 | FR-005 | P1 | boundary | unit | unit-mocked | machine | automated | A delete record carries the real cascaded task count, not the document counter |
| TC-SEC-015-N1 | FR-005 | P1 | negative | unit | unit-mocked | machine | automatable | A denial writes a warn record with userid, usertype, method and full path |
| TC-SEC-016-R1 | FR-005 | P1 | recovery | unit | unit-mocked | machine | automatable | A failed audit insert is logged as an error and does not fail the write (observed) |
| TC-SEC-017-N1 | FR-005 | P1 | negative | unit | unit-mocked | machine | automatable | A caller with no company writes no audit row and logs an error |
| TC-DB-004-N1 | FR-005 | P1 | negative | crud | crud-nonprod | machine | blocked | companyauditlogs rejects a row without companyid (SQLSTATE 23502) |
| TC-SEC-030 | FR-005 | P2 | permission | unit | unit-mocked | machine | automatable | Other requireSysAdmin routes still refuse non-SYSADMIN with the same 403 body |

### FR-006 (8)

| ID | FR | Pri | Variant | Gate | Tier | Executor | Automation | Title |
|---|---|---|---|---|---|---|---|---|
| TC-FN-002 | FR-006 | P1 | happy | unit | unit-mocked | machine | automated | A first extract adds the parsed tasks and removes none |
| TC-FN-003-B1 | FR-006 | P1 | boundary | unit | unit-mocked | machine | automated | Extracting the same document twice leaves the same task count |
| TC-FN-004-N1 | FR-006 | P1 | negative | unit | unit-mocked | machine | automated | A parse that finds no tasks throws NoTasksExtractedError and leaves the set |
| TC-FN-005-R1 | FR-006 | P1 | recovery | unit | unit-mocked | machine | automated | A failed insert rolls back the delete |
| TC-FN-006-B1 | FR-006 | P1 | boundary | unit | unit-mocked | machine | automated | Another document's tasks are never touched by an extract |
| TC-API-006-N1 | FR-006 | P1 | negative | unit | unit-mocked | machine | automated | Extract of a missing document answers 404 and extracts nothing; empty parse answers 422 |
| TC-DB-001-C1 | FR-006 | P1 | concurrency | crud | crud-nonprod | machine | blocked | Two concurrent re-extracts of one document leave exactly one task set (observed) |
| TC-DB-003-B1 | FR-006 | P1 | boundary | crud | crud-nonprod | machine | blocked | Replacing a document's tasks cascades their self-audit results |

### FR-007 (5)

| ID | FR | Pri | Variant | Gate | Tier | Executor | Automation | Title |
|---|---|---|---|---|---|---|---|---|
| TC-UI-001 | FR-007 | P2 | happy | ui-flow | manual | human | manual-only | A customer's Compliance tab shows Settings, Documents and Tasks only |
| TC-UI-002 | FR-007 | P2 | happy | ui-flow | manual | human | manual-only | Customer Documents sub-tab has no Upload, Extract or Delete control |
| TC-UI-003 | FR-007 | P2 | happy | ui-flow | manual | human | manual-only | /admin/audit shows a non-SYSADMIN the access-required notice and makes no /api/audit calls |
| TC-UI-004 | FR-007 | P2 | happy | ui-flow | manual | human | manual-only | SYSADMIN sees every Compliance sub-tab and every library control |
| TC-UI-005 | FR-007 | P2 | happy | ui-flow | manual | human | manual-only | Re-extract asks first and names the replacement |

### FR-008 (6)

| ID | FR | Pri | Variant | Gate | Tier | Executor | Automation | Title |
|---|---|---|---|---|---|---|---|---|
| TC-SEC-018 | FR-008 | P1 | happy | smoke | live-readonly | machine | manual-only | Live: each role gets its expected status on all 22 routes (fake-UUID probes) |
| TC-SEC-019-R1 | FR-008 | P1 | recovery | crud | manual | machine | manual-only | Live: a throwaway framework document survives upload, extract ×2, delete with no residue |
| TC-SEC-020-B1 | FR-008 | P1 | boundary | smoke | live-readonly | machine | manual-only | Live: the library is unchanged after the test (6 framework docs, SOC2 119, total 565) |
| TC-MCP-001 | FR-008 | P1 | happy | smoke | live-readonly | machine | manual-only | Live: MCP get_compliance_context returns the same SOC2 control count before and after release |
| TC-SEC-021-N1 | FR-008 | P1 | negative | smoke | live-readonly | machine | manual-only | Live: every denial in the live run has a warn log line in App Runner logs |
| TC-MCP-002 | FR-008 | P2 | happy | smoke | live-readonly | machine | manual-only | MCP compliance context still loads for a kit user after release |

### FR-009 (8)

| ID | FR | Pri | Variant | Gate | Tier | Executor | Automation | Title |
|---|---|---|---|---|---|---|---|---|
| TC-SEC-022 | FR-009 | P1 | permission | unit | unit-mocked | machine | automated | Another company's ADMIN gets 404 on PUT /config?projectId and the target is unchanged |
| TC-SEC-023-P1 | FR-009 | P1 | permission | unit | unit-mocked | machine | automated | Another company cannot read a project's settings or relevant tasks |
| TC-SEC-024-B1 | FR-009 | P1 | boundary | unit | unit-mocked | machine | automated | An engaged consulting company reads but cannot change (whole-project grants, observed) |
| TC-SEC-025 | FR-009 | P1 | happy | unit | unit-mocked | machine | automated | The owner company reads and its ADMIN writes, as before |
| TC-SEC-026-N1 | FR-009 | P1 | negative | unit | unit-mocked | machine | automated | An owner-company TEAM_MEMBER still gets 403 on PUT (requireAdmin unchanged) |
| TC-SEC-027-B1 | FR-009 | P1 | boundary | unit | unit-mocked | machine | automated | SYSADMIN reads any existing project; an unknown project answers 404 |
| TC-SEC-028 | FR-009 | P2 | happy | unit | unit-mocked | machine | automated | The legacy company-wide /config path is unchanged |
| TC-SEC-029-P1 | FR-009 | P1 | permission | smoke | live-readonly | machine | manual-only | Live: a cross-tenant PUT /config?projectId answers 404 and leaves the target byte-identical |

### FR-010 (2)

| ID | FR | Pri | Variant | Gate | Tier | Executor | Automation | Title |
|---|---|---|---|---|---|---|---|---|
| TC-FN-007 | FR-010 | P3 | happy | unit | unit-mocked | machine | automatable | No reference to sysadmin_audit_logs or the removed logger remains |
| TC-FN-008-N1 | FR-010 | P3 | negative | unit | unit-mocked | machine | automatable | Both bundles build and the SPEC-146 suites pass without the logger |

## Totals

```json
{
  "items": 55,
  "byVariant": {
    "permission": 11,
    "negative": 12,
    "happy": 18,
    "boundary": 10,
    "recovery": 3,
    "concurrency": 1
  },
  "byGate": {
    "unit": 39,
    "crud": 5,
    "ui-flow": 5,
    "smoke": 6
  },
  "byPriority": {
    "P1": 45,
    "P2": 8,
    "P3": 2
  },
  "byTier": {
    "unit-mocked": 39,
    "crud-nonprod": 4,
    "manual": 6,
    "live-readonly": 6
  },
  "byExecutor": {
    "machine": 50,
    "human": 5
  },
  "exemptionsByCode": {
    "N/A-READ-ONLY": 1,
    "N/A-STATELESS": 1,
    "N/A-NO-AUTH": 1
  },
  "deferredByCap": 0
}
```
