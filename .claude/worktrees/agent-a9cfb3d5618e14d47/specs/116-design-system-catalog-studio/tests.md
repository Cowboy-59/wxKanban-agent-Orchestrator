# Test Plan: Design System Catalog Studio And Bundle

**Spec Number**: 116
**Date Generated**: 2026-07-29
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

### UT-001 — Catalog read routes (src/server/routes/designSystems.ts)

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Catalog read routes (src/server/routes/designSystems.ts) — happy path | Success response | pending |
| 2 | Catalog read routes (src/server/routes/designSystems.ts) — validation error | Error with details | pending |
| 3 | Catalog read routes (src/server/routes/designSystems.ts) — edge case | Graceful handling | pending |

### UT-002 — Pick route: copy catalog entry into themetemplates

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Pick route: copy catalog entry into themetemplates — happy path | Success response | pending |
| 2 | Pick route: copy catalog entry into themetemplates — validation error | Error with details | pending |
| 3 | Pick route: copy catalog entry into themetemplates — edge case | Graceful handling | pending |

### UT-003 — Carry-across on apply-template and template PUT

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Carry-across on apply-template and template PUT — happy path | Success response | pending |
| 2 | Carry-across on apply-template and template PUT — validation error | Error with details | pending |
| 3 | Carry-across on apply-template and template PUT — edge case | Graceful handling | pending |

### UT-004 — DesignSystemCard component

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | DesignSystemCard component — happy path | Success response | pending |
| 2 | DesignSystemCard component — validation error | Error with details | pending |
| 3 | DesignSystemCard component — edge case | Graceful handling | pending |

### UT-005 — DesignSystemCatalog tab body

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | DesignSystemCatalog tab body — happy path | Success response | pending |
| 2 | DesignSystemCatalog tab body — validation error | Error with details | pending |
| 3 | DesignSystemCatalog tab body — edge case | Graceful handling | pending |

### UT-006 — DesignSystemShowcaseDialog (sandboxed preview)

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | DesignSystemShowcaseDialog (sandboxed preview) — happy path | Success response | pending |
| 2 | DesignSystemShowcaseDialog (sandboxed preview) — validation error | Error with details | pending |
| 3 | DesignSystemShowcaseDialog (sandboxed preview) — edge case | Graceful handling | pending |

### UT-007 — UseDesignSystemDialog + ThemeStudioPage third tab

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | UseDesignSystemDialog + ThemeStudioPage third tab — happy path | Success response | pending |
| 2 | UseDesignSystemDialog + ThemeStudioPage third tab — validation error | Error with details | pending |
| 3 | UseDesignSystemDialog + ThemeStudioPage third tab — edge case | Graceful handling | pending |

### UT-008 — Extended theme.css + tailwind.theme.ts renderers

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Extended theme.css + tailwind.theme.ts renderers — happy path | Success response | pending |
| 2 | Extended theme.css + tailwind.theme.ts renderers — validation error | Error with details | pending |
| 3 | Extended theme.css + tailwind.theme.ts renderers — edge case | Graceful handling | pending |

### UT-009 — Control renderers: 6 core files + threshold variants

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Control renderers: 6 core files + threshold variants — happy path | Success response | pending |
| 2 | Control renderers: 6 core files + threshold variants — validation error | Error with details | pending |
| 3 | Control renderers: 6 core files + threshold variants — edge case | Graceful handling | pending |

### UT-010 — DESIGN.md renderer + execute wiring with colour-only fallback

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | DESIGN.md renderer + execute wiring with colour-only fallback — happy path | Success response | pending |
| 2 | DESIGN.md renderer + execute wiring with colour-only fallback — validation error | Error with details | pending |
| 3 | DESIGN.md renderer + execute wiring with colour-only fallback — edge case | Graceful handling | pending |

### UT-011 — Contract, regex and end-to-end test suite

**Linked Task**: T011
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Contract, regex and end-to-end test suite — happy path | Success response | pending |
| 2 | Contract, regex and end-to-end test suite — validation error | Error with details | pending |
| 3 | Contract, regex and end-to-end test suite — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Design System Catalog Studio And Bundle workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Design System Catalog Studio And Bundle | Success | pending |
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
