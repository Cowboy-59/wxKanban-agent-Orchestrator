# Test Plan: Landing-Page Docs

**Spec Number**: 044
**Date Generated**: 2026-06-05
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| Unit | Vitest | Schema/types, query filters, video-player fallback logic |
| Integration | Vitest + Supertest | Public docs endpoints, admin CRUD, draft visibility |
| E2E | Playwright | Visitor browse/watch, SysAdmin publish, draft hidden |

---

## Unit Tests

### UT-001 — Extend wxkanbanhelp schema + migration
**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | New columns present with correct types/defaults | summary/videourl/posterurl/sortorder exist; sortorder default 0 | pending |
| 2 | Migration is additive | Existing 016 records/columns unchanged | pending |
| 3 | category='docs' marker filter | Only docs records selected | pending |

### UT-002 — Public docs API endpoints
**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | List returns published docs ordered | Ascending sortorder, docs only | pending |
| 2 | Detail returns published doc by slug | summary/content/videourl/posterurl | pending |
| 3 | Draft/unknown slug | 404, no content leak | pending |

### UT-003 — DocsVideoPlayer fallback
**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | videourl + posterurl set | Player renders with poster | pending |
| 2 | videourl set, posterurl empty | Player renders, default placeholder, no broken image | pending |
| 3 | videourl empty | No player rendered, text-only clean | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Public index without auth | GET /api/help/docs | 200, ordered published docs | pending |
| 2 | Draft excluded everywhere | GET /api/help/docs + /:slug | Draft absent; :slug 404 | pending |
| 3 | Admin CRUD persists new fields | POST/PUT admin help | summary/videourl/posterurl/sortorder saved | pending |
| 4 | Admin endpoints auth | non-SysAdmin call | 401/403 | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | US1 visitor browse/watch | Landing → Docs → open topic → play video | Index < 2s, detail plays inline | pending |
| 2 | US2 SysAdmin publish | Create doc, set order, publish | Appears on /docs in position | pending |
| 3 | US3 no-video + draft | Save text-only doc; leave a draft | Text-only clean; draft not visible by list or URL | pending |
| 4 | FR-007 menu rewire | Click landing "Docs" (desktop + mobile) | Routes to internal /docs; no external link | pending |

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
- Critical user flows (US1–US3, FR-007) must have E2E tests
