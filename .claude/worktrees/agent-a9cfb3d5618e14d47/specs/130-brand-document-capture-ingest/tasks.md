# Tasks: Brand Document Capture and Ingest

**Spec**: 130
**Spec ID**: `PENDING-130`
**Parent Scope**: SCOPE-129
**Total**: 10 tasks
**Created**: 2026-09-18

Fence label for all code produced here: `[SCOPE 130 / Tnnn]`. Labels **must** be
`Tnnn` — an `FR-nnn` label silently fails the `T\d+` regex and registers as unfenced.

---

## Task Table

This table is the machine-readable source the orchestrator parses. Its shape is required:
a row number, then `Tnnn: Title`, then priority, then status. The checkbox detail below is
for humans and is not parsed.

| #  | Task | Priority | Status |
|----|------|----------|--------|
| 1 | T001: Brand instruction format reference | high | done |
| 2 | T002: Fillable brand instruction template | high | done |
| 3 | T003: Deterministic parser: tokens, modes, typefaces | high | done |
| 4 | T004: Parser: rules extraction and loud rejection | high | done |
| 5 | T005: Capture: extend rendered-styling extraction to emit a document | high | done |
| 6 | T006: Capture: measured versus inferred separation | high | done |
| 7 | T007: Capture: single resting mode | medium | done |
| 8 | T008: Import route reporting before store | high | done |
| 9 | T009: Reference corpus regression test | high | done |
| 10 | T010: Capture-to-parse round trip test | high | done |

## Phase A — Format and parser

- [ ] **T001** — Brand instruction format reference · `high`
     Write the format down from the real document before any parser exists. Cover the token
     contract block, per-mode blocks, typeface roles and rule sections.
- [ ] **T002** — Fillable brand instruction template · `high`
     Ship a real template artifact a customer can complete, matching the format reference exactly.
- [ ] **T003** — Deterministic parser: tokens, modes, typefaces · `high`
     Parse the contract block and per-mode blocks. No language model. Assert mode/token counts
     against the declared contract.
- [ ] **T004** — Parser: rules extraction and loud rejection · `high`
     Extract rule sections into structured BrandRule data. Reject unknown structure naming content
     and location. No partial imports.
## Phase B — Capture

- [ ] **T005** — Capture: extend rendered-styling extraction to emit a document · `high`
     Reuse the shipped headless extraction. Accept a reachable page OR a customer-supplied
     rendered page — never a credential. Emit a complete brand instruction document rather than a
     color-only theme.
- [ ] **T006** — Capture: measured versus inferred separation · `high`
     Mark every value as measured or defaulted. Emit every underivable rule section as an explicit
     unanswered prompt. Never fabricate a rule.
- [ ] **T007** — Capture: single resting mode · `medium`
     Produce exactly one mode. Assert that no alternative modes are ever synthesized from a single
     captured look.
## Phase C — Ingest and verification

- [ ] **T008** — Import route reporting before store · `high`
     Accept a document, parse, validate, return the report, and commit only on acceptance.
     Tenant-scoped through the existing project-in-company check.
- [ ] **T009** — Reference corpus regression test · `high`
     Commit the reference document as a fixture. Assert exactly 6 modes of 41 contract tokens, 0
     missing and 0 extra.
- [ ] **T010** — Capture-to-parse round trip test · `high`
     Assert a captured document parses cleanly through the ingest it was generated for. A
     generator and parser that disagree about their shared format is the defect this catches.

## Completion route

These tasks did not go through `implement`. Recorded so the reason survives:

- **T001** — format reference — a document, which the fencer rejects
- **T002** — template — a document
- **T009** — test file
- **T010** — test file
