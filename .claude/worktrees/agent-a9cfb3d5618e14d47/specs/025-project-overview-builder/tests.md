# Test Plan: Project Overview Builder

**Spec Number**: 025
**Date Generated**: 2026-04-24
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

### UT-001 — T001: Create overviewdrafts Drizzle schema + migration

**Linked Task**: T001
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T001: Create overviewdrafts Drizzle schema + migration — happy path | Success response | pending |
| 2 | T001: Create overviewdrafts Drizzle schema + migration — validation error | Error with details | pending |
| 3 | T001: Create overviewdrafts Drizzle schema + migration — edge case | Graceful handling | pending |

### UT-002 — T002: Create overviewtranscripts Drizzle schema + migration

**Linked Task**: T002
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T002: Create overviewtranscripts Drizzle schema + migration — happy path | Success response | pending |
| 2 | T002: Create overviewtranscripts Drizzle schema + migration — validation error | Error with details | pending |
| 3 | T002: Create overviewtranscripts Drizzle schema + migration — edge case | Graceful handling | pending |

### UT-003 — T003: Create importcache Drizzle schema + migration

**Linked Task**: T003
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T003: Create importcache Drizzle schema + migration — happy path | Success response | pending |
| 2 | T003: Create importcache Drizzle schema + migration — validation error | Error with details | pending |
| 3 | T003: Create importcache Drizzle schema + migration — edge case | Graceful handling | pending |

### UT-004 — T004: Schema validation tests (Vitest + test Postgres)

**Linked Task**: T004
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T004: Schema validation tests (Vitest + test Postgres) — happy path | Success response | pending |
| 2 | T004: Schema validation tests (Vitest + test Postgres) — validation error | Error with details | pending |
| 3 | T004: Schema validation tests (Vitest + test Postgres) — edge case | Graceful handling | pending |

### UT-005 — T005: Shared BA persona prompt module

**Linked Task**: T005
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T005: Shared BA persona prompt module — happy path | Success response | pending |
| 2 | T005: Shared BA persona prompt module — validation error | Error with details | pending |
| 3 | T005: Shared BA persona prompt module — edge case | Graceful handling | pending |

### UT-006 — T006: Atomic file+DB persistence utility

**Linked Task**: T006
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T006: Atomic file+DB persistence utility — happy path | Success response | pending |
| 2 | T006: Atomic file+DB persistence utility — validation error | Error with details | pending |
| 3 | T006: Atomic file+DB persistence utility — edge case | Graceful handling | pending |

### UT-007 — T007: URL fetcher with host allowlist + DNS-rebind defense (C14 SSRF guard)

**Linked Task**: T007
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T007: URL fetcher with host allowlist + DNS-rebind defense (C14 SSRF guard) — happy path | Success response | pending |
| 2 | T007: URL fetcher with host allowlist + DNS-rebind defense (C14 SSRF guard) — validation error | Error with details | pending |
| 3 | T007: URL fetcher with host allowlist + DNS-rebind defense (C14 SSRF guard) — edge case | Graceful handling | pending |

### UT-008 — T008: Text chunking utility with 80-call hard cap

**Linked Task**: T008
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T008: Text chunking utility with 80-call hard cap — happy path | Success response | pending |
| 2 | T008: Text chunking utility with 80-call hard cap — validation error | Error with details | pending |
| 3 | T008: Text chunking utility with 80-call hard cap — edge case | Graceful handling | pending |

### UT-009 — T009: POST /api/overview/draft — Create (A1)

**Linked Task**: T009
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T009: POST /api/overview/draft — Create (A1) — happy path | Success response | pending |
| 2 | T009: POST /api/overview/draft — Create (A1) — validation error | Error with details | pending |
| 3 | T009: POST /api/overview/draft — Create (A1) — edge case | Graceful handling | pending |

### UT-010 — T010: GET /api/overview/draft/:id — Load (A2)

**Linked Task**: T010
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T010: GET /api/overview/draft/:id — Load (A2) — happy path | Success response | pending |
| 2 | T010: GET /api/overview/draft/:id — Load (A2) — validation error | Error with details | pending |
| 3 | T010: GET /api/overview/draft/:id — Load (A2) — edge case | Graceful handling | pending |

### UT-011 — T011: PUT /api/overview/draft/:id — Save with atomic persistence + concurrent-save race (A3, N3)

**Linked Task**: T011
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T011: PUT /api/overview/draft/:id — Save with atomic persistence + concurrent-save race (A3, N3) — happy path | Success response | pending |
| 2 | T011: PUT /api/overview/draft/:id — Save with atomic persistence + concurrent-save race (A3, N3) — validation error | Error with details | pending |
| 3 | T011: PUT /api/overview/draft/:id — Save with atomic persistence + concurrent-save race (A3, N3) — edge case | Graceful handling | pending |

### UT-012 — T012: POST /api/overview/draft/:id/ai-message — SSE BA interview (A4, N4)

**Linked Task**: T012
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T012: POST /api/overview/draft/:id/ai-message — SSE BA interview (A4, N4) — happy path | Success response | pending |
| 2 | T012: POST /api/overview/draft/:id/ai-message — SSE BA interview (A4, N4) — validation error | Error with details | pending |
| 3 | T012: POST /api/overview/draft/:id/ai-message — SSE BA interview (A4, N4) — edge case | Graceful handling | pending |

### UT-013 — T013: POST /api/overview/draft/:id/paste-analyze — Paste flow with C15 bug-report fallback (A9)

**Linked Task**: T013
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T013: POST /api/overview/draft/:id/paste-analyze — Paste flow with C15 bug-report fallback (A9) — happy path | Success response | pending |
| 2 | T013: POST /api/overview/draft/:id/paste-analyze — Paste flow with C15 bug-report fallback (A9) — validation error | Error with details | pending |
| 3 | T013: POST /api/overview/draft/:id/paste-analyze — Paste flow with C15 bug-report fallback (A9) — edge case | Graceful handling | pending |

### UT-014 — T014: POST /api/overview/draft/:id/import — File/URL import with chunking (A10)

**Linked Task**: T014
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T014: POST /api/overview/draft/:id/import — File/URL import with chunking (A10) — happy path | Success response | pending |
| 2 | T014: POST /api/overview/draft/:id/import — File/URL import with chunking (A10) — validation error | Error with details | pending |
| 3 | T014: POST /api/overview/draft/:id/import — File/URL import with chunking (A10) — edge case | Graceful handling | pending |

### UT-015 — T015: POST /api/overview/draft/:id/import/refresh — Re-import (A11)

**Linked Task**: T015
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T015: POST /api/overview/draft/:id/import/refresh — Re-import (A11) — happy path | Success response | pending |
| 2 | T015: POST /api/overview/draft/:id/import/refresh — Re-import (A11) — validation error | Error with details | pending |
| 3 | T015: POST /api/overview/draft/:id/import/refresh — Re-import (A11) — edge case | Graceful handling | pending |

### UT-016 — T016: POST /api/overview/draft/:id/submit-proposal — Handoff to spec-024 (A5, C7)

**Linked Task**: T016
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T016: POST /api/overview/draft/:id/submit-proposal — Handoff to spec-024 (A5, C7) — happy path | Success response | pending |
| 2 | T016: POST /api/overview/draft/:id/submit-proposal — Handoff to spec-024 (A5, C7) — validation error | Error with details | pending |
| 3 | T016: POST /api/overview/draft/:id/submit-proposal — Handoff to spec-024 (A5, C7) — edge case | Graceful handling | pending |

### UT-017 — T017: POST /api/overview/draft/:id/create-project — Create project + first file write (A6)

**Linked Task**: T017
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T017: POST /api/overview/draft/:id/create-project — Create project + first file write (A6) — happy path | Success response | pending |
| 2 | T017: POST /api/overview/draft/:id/create-project — Create project + first file write (A6) — validation error | Error with details | pending |
| 3 | T017: POST /api/overview/draft/:id/create-project — Create project + first file write (A6) — edge case | Graceful handling | pending |

### UT-018 — T018: GET /api/overview/draft/:id/pdf — Reuse Puppeteer pipeline with Mermaid fidelity (A7)

**Linked Task**: T018
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T018: GET /api/overview/draft/:id/pdf — Reuse Puppeteer pipeline with Mermaid fidelity (A7) — happy path | Success response | pending |
| 2 | T018: GET /api/overview/draft/:id/pdf — Reuse Puppeteer pipeline with Mermaid fidelity (A7) — validation error | Error with details | pending |
| 3 | T018: GET /api/overview/draft/:id/pdf — Reuse Puppeteer pipeline with Mermaid fidelity (A7) — edge case | Graceful handling | pending |

### UT-019 — T019: PDF parser using pdf-parse (src/server/parsers/pdf-parser.ts)

**Linked Task**: T019
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T019: PDF parser using pdf-parse (src/server/parsers/pdf-parser.ts) — happy path | Success response | pending |
| 2 | T019: PDF parser using pdf-parse (src/server/parsers/pdf-parser.ts) — validation error | Error with details | pending |
| 3 | T019: PDF parser using pdf-parse (src/server/parsers/pdf-parser.ts) — edge case | Graceful handling | pending |

### UT-020 — T020: DOCX parser using mammoth (src/server/parsers/docx-parser.ts)

**Linked Task**: T020
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T020: DOCX parser using mammoth (src/server/parsers/docx-parser.ts) — happy path | Success response | pending |
| 2 | T020: DOCX parser using mammoth (src/server/parsers/docx-parser.ts) — validation error | Error with details | pending |
| 3 | T020: DOCX parser using mammoth (src/server/parsers/docx-parser.ts) — edge case | Graceful handling | pending |

### UT-021 — T021: HTML parser using html-to-text (src/server/parsers/html-parser.ts)

**Linked Task**: T021
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T021: HTML parser using html-to-text (src/server/parsers/html-parser.ts) — happy path | Success response | pending |
| 2 | T021: HTML parser using html-to-text (src/server/parsers/html-parser.ts) — validation error | Error with details | pending |
| 3 | T021: HTML parser using html-to-text (src/server/parsers/html-parser.ts) — edge case | Graceful handling | pending |

### UT-022 — T022: Route /overview/:draftId + OverviewEditorPage (FR-001, N1)

**Linked Task**: T022
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T022: Route /overview/:draftId + OverviewEditorPage (FR-001, N1) — happy path | Success response | pending |
| 2 | T022: Route /overview/:draftId + OverviewEditorPage (FR-001, N1) — validation error | Error with details | pending |
| 3 | T022: Route /overview/:draftId + OverviewEditorPage (FR-001, N1) — edge case | Graceful handling | pending |

### UT-023 — T023: MarkdownEditorPane — @uiw/react-md-editor with raw Mermaid (FR-002, C5, N2)

**Linked Task**: T023
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T023: MarkdownEditorPane — @uiw/react-md-editor with raw Mermaid (FR-002, C5, N2) — happy path | Success response | pending |
| 2 | T023: MarkdownEditorPane — @uiw/react-md-editor with raw Mermaid (FR-002, C5, N2) — validation error | Error with details | pending |
| 3 | T023: MarkdownEditorPane — @uiw/react-md-editor with raw Mermaid (FR-002, C5, N2) — edge case | Graceful handling | pending |

### UT-024 — T024: EditorToolbar — save status + commit button + PDF export (FR-008, FR-011, FR-012)

**Linked Task**: T024
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T024: EditorToolbar — save status + commit button + PDF export (FR-008, FR-011, FR-012) — happy path | Success response | pending |
| 2 | T024: EditorToolbar — save status + commit button + PDF export (FR-008, FR-011, FR-012) — validation error | Error with details | pending |
| 3 | T024: EditorToolbar — save status + commit button + PDF export (FR-008, FR-011, FR-012) — edge case | Graceful handling | pending |

### UT-025 — T025: AIPane — three entry modes + SSE chat + transcript (FR-004/005/006)

**Linked Task**: T025
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T025: AIPane — three entry modes + SSE chat + transcript (FR-004/005/006) — happy path | Success response | pending |
| 2 | T025: AIPane — three entry modes + SSE chat + transcript (FR-004/005/006) — validation error | Error with details | pending |
| 3 | T025: AIPane — three entry modes + SSE chat + transcript (FR-004/005/006) — edge case | Graceful handling | pending |

### UT-026 — T026: PasteAnalyzeDialog — 10k counter + overflow handoff (FR-013)

**Linked Task**: T026
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T026: PasteAnalyzeDialog — 10k counter + overflow handoff (FR-013) — happy path | Success response | pending |
| 2 | T026: PasteAnalyzeDialog — 10k counter + overflow handoff (FR-013) — validation error | Error with details | pending |
| 3 | T026: PasteAnalyzeDialog — 10k counter + overflow handoff (FR-013) — edge case | Graceful handling | pending |

### UT-027 — T027: ImportDialog — two tabs + client-side allowlist + chunk progress (FR-014)

**Linked Task**: T027
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T027: ImportDialog — two tabs + client-side allowlist + chunk progress (FR-014) — happy path | Success response | pending |
| 2 | T027: ImportDialog — two tabs + client-side allowlist + chunk progress (FR-014) — validation error | Error with details | pending |
| 3 | T027: ImportDialog — two tabs + client-side allowlist + chunk progress (FR-014) — edge case | Graceful handling | pending |

### UT-028 — T028: SectionWriteConfirm — Replace/Merge/Skip with diff preview (FR-013 AC6, FR-014 AC7)

**Linked Task**: T028
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T028: SectionWriteConfirm — Replace/Merge/Skip with diff preview (FR-013 AC6, FR-014 AC7) — happy path | Success response | pending |
| 2 | T028: SectionWriteConfirm — Replace/Merge/Skip with diff preview (FR-013 AC6, FR-014 AC7) — validation error | Error with details | pending |
| 3 | T028: SectionWriteConfirm — Replace/Merge/Skip with diff preview (FR-013 AC6, FR-014 AC7) — edge case | Graceful handling | pending |

### UT-029 — T029: Core draft hooks A1-A8 (src/client/hooks/overview/)

**Linked Task**: T029
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T029: Core draft hooks A1-A8 (src/client/hooks/overview/) — happy path | Success response | pending |
| 2 | T029: Core draft hooks A1-A8 (src/client/hooks/overview/) — validation error | Error with details | pending |
| 3 | T029: Core draft hooks A1-A8 (src/client/hooks/overview/) — edge case | Graceful handling | pending |

### UT-030 — T030: Paste + import hooks A9-A11

**Linked Task**: T030
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T030: Paste + import hooks A9-A11 — happy path | Success response | pending |
| 2 | T030: Paste + import hooks A9-A11 — validation error | Error with details | pending |
| 3 | T030: Paste + import hooks A9-A11 — edge case | Graceful handling | pending |

### UT-031 — T031: AdminDashboard — New Project + New Proposal launch buttons (FR-009)

**Linked Task**: T031
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T031: AdminDashboard — New Project + New Proposal launch buttons (FR-009) — happy path | Success response | pending |
| 2 | T031: AdminDashboard — New Project + New Proposal launch buttons (FR-009) — validation error | Error with details | pending |
| 3 | T031: AdminDashboard — New Project + New Proposal launch buttons (FR-009) — edge case | Graceful handling | pending |

### UT-032 — T032: ProposalList — Edit action + Export PDF menu (FR-010, FR-012 AC1)

**Linked Task**: T032
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T032: ProposalList — Edit action + Export PDF menu (FR-010, FR-012 AC1) — happy path | Success response | pending |
| 2 | T032: ProposalList — Edit action + Export PDF menu (FR-010, FR-012 AC1) — validation error | Error with details | pending |
| 3 | T032: ProposalList — Edit action + Export PDF menu (FR-010, FR-012 AC1) — edge case | Graceful handling | pending |

### UT-033 — T033: Extend GET /api/proposals — editEligibility + lastEditedAt (A8)

**Linked Task**: T033
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T033: Extend GET /api/proposals — editEligibility + lastEditedAt (A8) — happy path | Success response | pending |
| 2 | T033: Extend GET /api/proposals — editEligibility + lastEditedAt (A8) — validation error | Error with details | pending |
| 3 | T033: Extend GET /api/proposals — editEligibility + lastEditedAt (A8) — edge case | Graceful handling | pending |

### UT-034 — T034: Unit tests — G2 utilities + G1 schema

**Linked Task**: T034
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T034: Unit tests — G2 utilities + G1 schema — happy path | Success response | pending |
| 2 | T034: Unit tests — G2 utilities + G1 schema — validation error | Error with details | pending |
| 3 | T034: Unit tests — G2 utilities + G1 schema — edge case | Graceful handling | pending |

### UT-035 — T035: Integration tests — draft CRUD + AI interview

**Linked Task**: T035
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T035: Integration tests — draft CRUD + AI interview — happy path | Success response | pending |
| 2 | T035: Integration tests — draft CRUD + AI interview — validation error | Error with details | pending |
| 3 | T035: Integration tests — draft CRUD + AI interview — edge case | Graceful handling | pending |

### UT-036 — T036: Integration tests — paste-analyze (A9) + C15 bug-report fallback

**Linked Task**: T036
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T036: Integration tests — paste-analyze (A9) + C15 bug-report fallback — happy path | Success response | pending |
| 2 | T036: Integration tests — paste-analyze (A9) + C15 bug-report fallback — validation error | Error with details | pending |
| 3 | T036: Integration tests — paste-analyze (A9) + C15 bug-report fallback — edge case | Graceful handling | pending |

### UT-037 — T037: Integration tests — import (A10/A11) + security

**Linked Task**: T037
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T037: Integration tests — import (A10/A11) + security — happy path | Success response | pending |
| 2 | T037: Integration tests — import (A10/A11) + security — validation error | Error with details | pending |
| 3 | T037: Integration tests — import (A10/A11) + security — edge case | Graceful handling | pending |

### UT-038 — T038: Integration tests — submit + create-project + spec-024 handoff

**Linked Task**: T038
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T038: Integration tests — submit + create-project + spec-024 handoff — happy path | Success response | pending |
| 2 | T038: Integration tests — submit + create-project + spec-024 handoff — validation error | Error with details | pending |
| 3 | T038: Integration tests — submit + create-project + spec-024 handoff — edge case | Graceful handling | pending |

### UT-039 — T039: Integration tests — proposals extension (A8) matrix

**Linked Task**: T039
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T039: Integration tests — proposals extension (A8) matrix — happy path | Success response | pending |
| 2 | T039: Integration tests — proposals extension (A8) matrix — validation error | Error with details | pending |
| 3 | T039: Integration tests — proposals extension (A8) matrix — edge case | Graceful handling | pending |

### UT-040 — T040: E2E Playwright tests — US1-US4 + paste + import happy paths

**Linked Task**: T040
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T040: E2E Playwright tests — US1-US4 + paste + import happy paths — happy path | Success response | pending |
| 2 | T040: E2E Playwright tests — US1-US4 + paste + import happy paths — validation error | Error with details | pending |
| 3 | T040: E2E Playwright tests — US1-US4 + paste + import happy paths — edge case | Graceful handling | pending |

### UT-041 — T041: Update CLAUDE.md conventions + Claude Projects N7 help text

**Linked Task**: T041
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T041: Update CLAUDE.md conventions + Claude Projects N7 help text — happy path | Success response | pending |
| 2 | T041: Update CLAUDE.md conventions + Claude Projects N7 help text — validation error | Error with details | pending |
| 3 | T041: Update CLAUDE.md conventions + Claude Projects N7 help text — edge case | Graceful handling | pending |

### UT-042 — T042: Late-bound AC verification + lifecycle sync + status flip

**Linked Task**: T042
**Status**: pending

| # | Test Case | Expected | Status |
|---|-----------|----------|--------|
| 1 | T042: Late-bound AC verification + lifecycle sync + status flip — happy path | Success response | pending |
| 2 | T042: Late-bound AC verification + lifecycle sync + status flip — validation error | Error with details | pending |
| 3 | T042: Late-bound AC verification + lifecycle sync + status flip — edge case | Graceful handling | pending |

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| 1 | Full Project Overview Builder workflow | End-to-end | All steps succeed | pending |
| 2 | Error handling | Error paths | Proper error responses | pending |
| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| 1 | Primary flow | User completes Project Overview Builder | Success | pending |
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
