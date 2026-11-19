# Test Plan: Compliance Enablement Repair

**Spec Number**: 112
**Date Generated**: 2026-07-27
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| Unit | Vitest | Core logic, services, utilities |
| Integration | Vitest + Supertest | API endpoints, DB operations |
| E2E | Playwright | User workflows, critical paths |

---

## Unit Tests

### UT-001 — Add projectid and new framework columns to appauditconfiguration

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Add projectid and new framework columns to appauditconfiguration — happy path | Success response | pending |
| 2 | Add projectid and new framework columns to appauditconfiguration — validation error | Error with details | pending |
| 3 | Add projectid and new framework columns to appauditconfiguration — edge case | Graceful handling | pending |

### UT-002 — Backfill migration with before/after diff

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Backfill migration with before/after diff — happy path | Success response | pending |
| 2 | Backfill migration with before/after diff — validation error | Error with details | pending |
| 3 | Backfill migration with before/after diff — edge case | Graceful handling | pending |

### UT-003 — Fix project.get_audit_config with a failing regression test

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Fix project.get_audit_config with a failing regression test — happy path | Success response | pending |
| 2 | Fix project.get_audit_config with a failing regression test — validation error | Error with details | pending |
| 3 | Fix project.get_audit_config with a failing regression test — edge case | Graceful handling | pending |

### UT-004 — Fix checkRegexPattern to be file-scoped with no false passes

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Fix checkRegexPattern to be file-scoped with no false passes — happy path | Success response | pending |
| 2 | Fix checkRegexPattern to be file-scoped with no false passes — validation error | Error with details | pending |
| 3 | Fix checkRegexPattern to be file-scoped with no false passes — edge case | Graceful handling | pending |

### UT-005 — Re-scope AuditConfigService and /api/audit/config to project

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Re-scope AuditConfigService and /api/audit/config to project — happy path | Success response | pending |
| 2 | Re-scope AuditConfigService and /api/audit/config to project — validation error | Error with details | pending |
| 3 | Re-scope AuditConfigService and /api/audit/config to project — edge case | Graceful handling | pending |

### UT-006 — Migrate the seven non-AuditReportService audittype readers

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Migrate the seven non-AuditReportService audittype readers — happy path | Success response | pending |
| 2 | Migrate the seven non-AuditReportService audittype readers — validation error | Error with details | pending |
| 3 | Migrate the seven non-AuditReportService audittype readers — edge case | Graceful handling | pending |

### UT-007 — Migrate AuditReportService to loop over enabled frameworks

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Migrate AuditReportService to loop over enabled frameworks — happy path | Success response | pending |
| 2 | Migrate AuditReportService to loop over enabled frameworks — validation error | Error with details | pending |
| 3 | Migrate AuditReportService to loop over enabled frameworks — edge case | Graceful handling | pending |

### UT-008 — Build per-project compliance settings UI

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Build per-project compliance settings UI — happy path | Success response | pending |
| 2 | Build per-project compliance settings UI — validation error | Error with details | pending |
| 3 | Build per-project compliance settings UI — edge case | Graceful handling | pending |

### UT-009 — Ship framework rules files to consumer projects

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Ship framework rules files to consumer projects — happy path | Success response | pending |
| 2 | Ship framework rules files to consumer projects — validation error | Error with details | pending |
| 3 | Ship framework rules files to consumer projects — edge case | Graceful handling | pending |

### UT-010 — Cleanse securityclassification and drop audittype

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Cleanse securityclassification and drop audittype — happy path | Success response | pending |
| 2 | Cleanse securityclassification and drop audittype — validation error | Error with details | pending |
| 3 | Cleanse securityclassification and drop audittype — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Compliance Enablement Repair workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Compliance Enablement Repair | Success | pending |
| 2 | Error recovery | User encounters and recovers from error | Guided recovery | pending |

## Test Automation

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

## Coverage Requirements

- Unit test coverage: >= 80%
- All acceptance criteria from spec must have at least one test
- All API endpoints must have integration tests
- Critical user flows must have E2E tests
