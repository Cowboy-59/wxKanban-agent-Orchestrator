# Test Plan: Design System Catalog Data And Ingest

**Spec Number**: 115
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

### UT-001 — Rich token model (src/shared/design-system.ts)

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Rich token model (src/shared/design-system.ts) — happy path | Success response | pending |
| 2 | Rich token model (src/shared/design-system.ts) — validation error | Error with details | pending |
| 3 | Rich token model (src/shared/design-system.ts) — edge case | Graceful handling | pending |

### UT-002 — Curated 50-entry naming map (src/shared/designsystemcatalog.ts)

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Curated 50-entry naming map (src/shared/designsystemcatalog.ts) — happy path | Success response | pending |
| 2 | Curated 50-entry naming map (src/shared/designsystemcatalog.ts) — validation error | Error with details | pending |
| 3 | Curated 50-entry naming map (src/shared/designsystemcatalog.ts) — edge case | Graceful handling | pending |

### UT-003 — designsystems table + migration 0057

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | designsystems table + migration 0057 — happy path | Success response | pending |
| 2 | designsystems table + migration 0057 — validation error | Error with details | pending |
| 3 | designsystems table + migration 0057 — edge case | Graceful handling | pending |

### UT-004 — Carrier columns on themetemplates + projectthemes (migration 0058)

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Carrier columns on themetemplates + projectthemes (migration 0058) — happy path | Success response | pending |
| 2 | Carrier columns on themetemplates + projectthemes (migration 0058) — validation error | Error with details | pending |
| 3 | Carrier columns on themetemplates + projectthemes (migration 0058) — edge case | Graceful handling | pending |

### UT-005 — Frontmatter + showcase parser

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Frontmatter + showcase parser — happy path | Success response | pending |
| 2 | Frontmatter + showcase parser — validation error | Error with details | pending |
| 3 | Frontmatter + showcase parser — edge case | Graceful handling | pending |

### UT-006 — Colour utilities: flattenAlpha + hex to HSL triplet

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Colour utilities: flattenAlpha + hex to HSL triplet — happy path | Success response | pending |
| 2 | Colour utilities: flattenAlpha + hex to HSL triplet — validation error | Error with details | pending |
| 3 | Colour utilities: flattenAlpha + hex to HSL triplet — edge case | Graceful handling | pending |

### UT-007 — mapToProjectTheme — fixed mapping table

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | mapToProjectTheme — fixed mapping table — happy path | Success response | pending |
| 2 | mapToProjectTheme — fixed mapping table — validation error | Error with details | pending |
| 3 | mapToProjectTheme — fixed mapping table — edge case | Graceful handling | pending |

### UT-008 — synthesizeCounterpartMode with AA verification

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | synthesizeCounterpartMode with AA verification — happy path | Success response | pending |
| 2 | synthesizeCounterpartMode with AA verification — validation error | Error with details | pending |
| 3 | synthesizeCounterpartMode with AA verification — edge case | Graceful handling | pending |

### UT-009 — Idempotent seed script (scripts/seed-design-systems.ts)

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | Idempotent seed script (scripts/seed-design-systems.ts) — happy path | Success response | pending |
| 2 | Idempotent seed script (scripts/seed-design-systems.ts) — validation error | Error with details | pending |
| 3 | Idempotent seed script (scripts/seed-design-systems.ts) — edge case | Graceful handling | pending |

### UT-010 — 50-system regression suite (exit gate)

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | 50-system regression suite (exit gate) — happy path | Success response | pending |
| 2 | 50-system regression suite (exit gate) — validation error | Error with details | pending |
| 3 | 50-system regression suite (exit gate) — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Design System Catalog Data And Ingest workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Design System Catalog Data And Ingest | Success | pending |
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
