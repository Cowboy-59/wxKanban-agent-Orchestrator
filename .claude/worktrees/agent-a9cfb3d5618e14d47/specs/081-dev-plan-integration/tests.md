# Test Plan: Dev Plan Integration

**Spec Number**: 081
**Date Generated**: 2026-06-30
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

### UT-001 — T001: devplan-generator module (MCP server)

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T001: devplan-generator module (MCP server) — happy path | Success response | pending |
| 2 | T001: devplan-generator module (MCP server) — validation error | Error with details | pending |
| 3 | T001: devplan-generator module (MCP server) — edge case | Graceful handling | pending |

### UT-002 — T002: Dependency edges via the SCOPE-073 scope-edges resolver

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T002: Dependency edges via the SCOPE-073 scope-edges resolver — happy path | Success response | pending |
| 2 | T002: Dependency edges via the SCOPE-073 scope-edges resolver — validation error | Error with details | pending |
| 3 | T002: Dependency edges via the SCOPE-073 scope-edges resolver — edge case | Graceful handling | pending |

### UT-003 — T003: Auto-refresh on the lifecycle triggers (DB-only doctype)

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T003: Auto-refresh on the lifecycle triggers (DB-only doctype) — happy path | Success response | pending |
| 2 | T003: Auto-refresh on the lifecycle triggers (DB-only doctype) — validation error | Error with details | pending |
| 3 | T003: Auto-refresh on the lifecycle triggers (DB-only doctype) — edge case | Graceful handling | pending |

### UT-004 — T004: dev-plan skill ships via .claude/skills kit-sync

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T004: dev-plan skill ships via .claude/skills kit-sync — happy path | Success response | pending |
| 2 | T004: dev-plan skill ships via .claude/skills kit-sync — validation error | Error with details | pending |
| 3 | T004: dev-plan skill ships via .claude/skills kit-sync — edge case | Graceful handling | pending |

### UT-005 — T005: Cockpit "Development Plan" panel

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T005: Cockpit "Development Plan" panel — happy path | Success response | pending |
| 2 | T005: Cockpit "Development Plan" panel — validation error | Error with details | pending |
| 3 | T005: Cockpit "Development Plan" panel — edge case | Graceful handling | pending |

### UT-006 — T006: dev-plan in the Cockpit help catalog + command wrapper

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T006: dev-plan in the Cockpit help catalog + command wrapper — happy path | Success response | pending |
| 2 | T006: dev-plan in the Cockpit help catalog + command wrapper — validation error | Error with details | pending |
| 3 | T006: dev-plan in the Cockpit help catalog + command wrapper — edge case | Graceful handling | pending |

### UT-007 — T007: Bump COCKPIT + repackage VSIX

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T007: Bump COCKPIT + repackage VSIX — happy path | Success response | pending |
| 2 | T007: Bump COCKPIT + repackage VSIX — validation error | Error with details | pending |
| 3 | T007: Bump COCKPIT + repackage VSIX — edge case | Graceful handling | pending |

### UT-008 — T008: GET /api/admin/doc-status — add devplan field

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T008: GET /api/admin/doc-status — add devplan field — happy path | Success response | pending |
| 2 | T008: GET /api/admin/doc-status — add devplan field — validation error | Error with details | pending |
| 3 | T008: GET /api/admin/doc-status — add devplan field — edge case | Graceful handling | pending |

### UT-009 — T009: "Development Plan" ReportLinkCard on the Admin dashboard

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T009: "Development Plan" ReportLinkCard on the Admin dashboard — happy path | Success response | pending |
| 2 | T009: "Development Plan" ReportLinkCard on the Admin dashboard — validation error | Error with details | pending |
| 3 | T009: "Development Plan" ReportLinkCard on the Admin dashboard — edge case | Graceful handling | pending |

### UT-010 — T010: Development Plan viewer route + in-app review/print

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T010: Development Plan viewer route + in-app review/print — happy path | Success response | pending |
| 2 | T010: Development Plan viewer route + in-app review/print — validation error | Error with details | pending |
| 3 | T010: Development Plan viewer route + in-app review/print — edge case | Graceful handling | pending |

### UT-011 — T011: POST /api/admin/projects/:id/devplan/regenerate

**Linked Task**: T011
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T011: POST /api/admin/projects/:id/devplan/regenerate — happy path | Success response | pending |
| 2 | T011: POST /api/admin/projects/:id/devplan/regenerate — validation error | Error with details | pending |
| 3 | T011: POST /api/admin/projects/:id/devplan/regenerate — edge case | Graceful handling | pending |

### UT-012 — T012: Unit tests — devplan-generator determinism + coverage

**Linked Task**: T012
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T012: Unit tests — devplan-generator determinism + coverage — happy path | Success response | pending |
| 2 | T012: Unit tests — devplan-generator determinism + coverage — validation error | Error with details | pending |
| 3 | T012: Unit tests — devplan-generator determinism + coverage — edge case | Graceful handling | pending |

### UT-013 — T013: Integration tests — endpoints + auto-refresh + fail-open

**Linked Task**: T013
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T013: Integration tests — endpoints + auto-refresh + fail-open — happy path | Success response | pending |
| 2 | T013: Integration tests — endpoints + auto-refresh + fail-open — validation error | Error with details | pending |
| 3 | T013: Integration tests — endpoints + auto-refresh + fail-open — edge case | Graceful handling | pending |

### UT-014 — T014: Docs — CLAUDE.md devplan doctype + dashboard conventions

**Linked Task**: T014
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T014: Docs — CLAUDE.md devplan doctype + dashboard conventions — happy path | Success response | pending |
| 2 | T014: Docs — CLAUDE.md devplan doctype + dashboard conventions — validation error | Error with details | pending |
| 3 | T014: Docs — CLAUDE.md devplan doctype + dashboard conventions — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Dev Plan Integration workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Dev Plan Integration | Success | pending |
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
