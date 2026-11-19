# Tasks: Brand Execution and Artifact Generation

**Spec**: 128
**Spec ID**: `8f5f4a0e-e5b0-4962-956e-eaab39aa2395`
**Parent Scope**: SCOPE-129
**Total**: 8 tasks
**Created**: 2026-09-18

Fence label for all code produced here: `[SCOPE 128 / Tnnn]`. Labels **must** be
`Tnnn` — an `FR-nnn` label silently fails the `T\d+` regex and registers as unfenced.

---

## Task Table

This table is the machine-readable source the orchestrator parses. Its shape is required:
a row number, then `Tnnn: Title`, then priority, then status. The checkbox detail below is
for humans and is not parsed.

| #  | Task | Priority | Status |
|----|------|----------|--------|
| 1 | T001: Per-mode stylesheet emission scoped to the shell root | high | done |
| 2 | T002: Combined font request across all modes | high | done |
| 3 | T003: Resting mode in the base stylesheet | high | done |
| 4 | T004: Shell contract and server-side mode emission | high | done |
| 5 | T005: Extend the theme bundle endpoint | high | done |
| 6 | T006: Extend Tailwind and component theme artifacts for modes | medium | done |
| 7 | T007: Generation tests | high | done |
| 8 | T008: Human-test checklist artifact | medium | done |

## Phase A — Emission

- [ ] **T001** — Per-mode stylesheet emission scoped to the shell root · `high`
     Emit one block per declared mode, scoped to the shell root. Assert no mode token reaches the
     document root.
- [ ] **T002** — Combined font request across all modes · `high`
     Build one request spanning every declared face in every mode. No per-mode requests, no
     bundled binaries.
- [ ] **T003** — Resting mode in the base stylesheet · `high`
     Write the resting mode's values into the base stylesheet as the guaranteed fallback for a
     failed mode layer.
- [ ] **T004** — Shell contract and server-side mode emission · `high`
     Resolve the mode server-side and emit it into the initial response. No client-side
     application after paint.
## Phase B — Bundle integration

- [ ] **T005** — Extend the theme bundle endpoint · `high`
     Add mode blocks, the combined font request and the shell contract to the existing bundle. Do
     not add a parallel generation path.
- [ ] **T006** — Extend Tailwind and component theme artifacts for modes · `medium`
     Carry mode awareness into the generated configuration and component theme so the artifacts
     agree with the stylesheet.
## Phase C — Verification

- [ ] **T007** — Generation tests · `high`
     Assert 0 mode tokens at the document root, 1 font request, every declared mode present in
     output, and the resting mode rendering with the mode layer disabled.
- [ ] **T008** — Human-test checklist artifact · `medium`
     Emit the four browser-dependent acceptance checks as an explicit checklist shipped with the
     bundle. Do not count them as automated.

## Completion route

These tasks did not go through `implement`. Recorded so the reason survives:

- **T005** — direct edit — modify-heavy route file (implement MODIFY corrupts UTF-8)
- **T007** — test file — the fencer rejects files with no top-level declaration
- **T008** — emitted by the T003 module, wired into the bundle in T005
