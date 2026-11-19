# Tasks: wxBrand Entrance and Rule Enforcement

**Spec**: 129
**Spec ID**: `359531c4-4968-497d-be83-96015db818fa`
**Parent Scope**: SCOPE-129
**Total**: 11 tasks
**Created**: 2026-09-18

Fence label for all code produced here: `[SCOPE 129 / Tnnn]`. Labels **must** be
`Tnnn` — an `FR-nnn` label silently fails the `T\d+` regex and registers as unfenced.

---

## Task Table

This table is the machine-readable source the orchestrator parses. Its shape is required:
a row number, then `Tnnn: Title`, then priority, then status. The checkbox detail below is
for humans and is not parsed.

| #  | Task | Priority | Status |
|----|------|----------|--------|
| 1 | T001: Delivery channel decision | high | done |
| 2 | T002: wxBrand command in every mirror | high | done |
| 3 | T003: wxBrand skill in every mirror | high | done |
| 4 | T004: Rules as data with a mechanical flag | high | done |
| 5 | T005: Rule delivery to implement | high | done |
| 6 | T006: Rule delivery to the design skill | high | done |
| 7 | T007: Rule delivery to the code review skill | medium | done |
| 8 | T008: Structural-property lint | high | done |
| 9 | T009: Style-literal lint | high | done |
| 10 | T010: Schema announcement | high | done |
| 11 | T011: Mirror parity verification | medium | done |

## Phase A — Entrance

- [ ] **T001** — Delivery channel decision · `high`
     Decide and record whether wxBrand needs a hosted prompt twin. This gates T002 and T003
     because it changes release mechanics.
- [ ] **T002** — wxBrand command in every mirror · `high`
     Author the command following the established naming and structure. Apply to every mirror and
     compare afterward.
- [ ] **T003** — wxBrand skill in every mirror · `high`
     Four modes: capture (primary), ingest, interview, execute. Document the boundary against the
     design skill and the theme surfaces.
## Phase B — Rule delivery

- [ ] **T004** — Rules as data with a mechanical flag · `high`
     Structure rules as identifier, text, kind and mechanical flag. The flag drives the split
     between gate and checklist.
- [ ] **T005** — Rule delivery to implement · `high`
     Supply applicable rules as build context for UI-bearing tasks in a schema-bearing project.
- [ ] **T006** — Rule delivery to the design skill · `high`
     Cross the design skill's current unawareness of the schema layer so designs compose against
     real brand tokens and rules.
- [ ] **T007** — Rule delivery to the code review skill · `medium`
     Supply rules as review criteria so drift is caught on the diff.
## Phase C — Lints and announcement

- [ ] **T008** — Structural-property lint · `high`
     Fail any mode selector setting display, grid template, order, position or content. Name the
     selector and the property.
- [ ] **T009** — Style-literal lint · `high`
     Fail any component carrying a colour literal, pixel radius, row height or font stack,
     exempting token blocks. Name the file and the literal.
- [ ] **T010** — Schema announcement · `high`
     State on every rule-consuming run whether a schema is active and name it, and state plainly
     when one is declared but unresolved. Do not trim this as noise.
- [ ] **T011** — Mirror parity verification · `medium`
     Compare every skill and command copy after the change and assert zero divergence.

## Completion route

These tasks did not go through `implement`. Recorded so the reason survives:

- **T001** — decision record
- **T002** — command markdown, written to both mirrors
- **T003** — skill markdown, written to both mirrors
- **T004** — satisfied by the SPEC-126 model, the SPEC-130 extractor and the T005 delivery module
- **T006** — skill edit, both mirrors
- **T007** — skill edit — single-copy by design, per the delivery map
- **T011** — parity script plus a verified run
