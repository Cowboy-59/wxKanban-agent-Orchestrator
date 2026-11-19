# Requirements Checklist: Spec 122 — Spec Status Vocabulary

## Functional Requirements

- [ ] **FR-001** — All eight `SpecStatusSchema` values map to a column (`qa`→Phase 3,
      `human_testing`→Phase 4, `beta`→Phase 5, `archived`→hidden). Existing app-side mappings
      unchanged.
- [ ] **FR-002** — Column assignment uses a resolver with a visible fallback; no status can be
      filtered from every column at once.
- [ ] **FR-003** — `project.update_spec_status` rejects values outside the shared vocabulary, naming
      the value and listing the valid set.
- [ ] **FR-004** — Read-only audit confirms zero production rows hold an unaccounted status. No
      writes performed.
- [ ] **FR-005** — Build-failing guard pins the MCP vocabulary to the app's column map.
- [ ] **FR-006** — The false comment above `SpecStatusSchema` is corrected.
- [ ] **FR-007** — `archived` is hidden by an explicit, documented rule, distinct from the FR-002
      fallback path.
- [ ] **FR-008** — The filter bar can reveal archived scopes in one interaction.

## Success Metrics

- [ ] 8 of 8 statuses map to a board outcome (from 4 of 8).
- [ ] 0 production rows hold a status the board cannot account for.
- [ ] 100% of invalid statuses rejected at write time.
- [ ] Reporting customer sees 9 of 9 scopes, 8 `beta` in Phase 5, with 0 writes to their data.
- [ ] 0 tolerated vocabulary drift — guard fails the build.
- [ ] An unmapped status renders in a visible fallback within 1 render.
- [ ] An archived scope is retrievable in 1 interaction.

## Quality Gates

- [ ] `npm run typecheck` clean.
- [ ] `npx vitest run` — new tests pass; existing suite not regressed.
- [ ] `cd mcp-server && npx vitest run` — failures remain at the known baseline of 14.
- [ ] Test U5 asserts the card appears in **exactly 1** column, not merely "in some column".
- [ ] The drift guard (U12) has been observed failing before being trusted.
- [ ] Verified against the real board, not only unit tests — the defect was a legal write that passed
      every existing test.

## Out of Scope Confirmed

- [ ] No drag-and-drop transition rules changed.
- [ ] No `PhaseService` or phase-advance workflow changes.
- [ ] `specificationphases` neither revived nor deleted.
- [ ] No rename of the app's `ScopeStatus` union.
- [ ] No writes to customer data.

## Open Items

- [ ] Should `deferred` be added to the MCP vocabulary? The app has it, the MCP does not. Deferred to
      a later decision; the asymmetry is recorded rather than silently accepted.
