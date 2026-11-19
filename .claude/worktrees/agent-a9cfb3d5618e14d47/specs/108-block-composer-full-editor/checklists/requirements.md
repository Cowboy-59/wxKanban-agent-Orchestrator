# Requirements Checklist: Theme Header & Footer Designer (Spec 108)

**Spec Number**: 108
**Created**: 2026-07-21 · **Retargeted**: 2026-07-21
**Source**: `specs/108-block-composer-full-editor/spec.md` (scope: `specs/Project-Scope/108-block-composer-full-editor.md`)

---

## Specification Quality

- [x] Overview states WHAT and WHY (not HOW)
- [x] Canonical spec headings present in order (Overview → Business Problem → Actors → Success Metrics → Scope Boundary → Out of Scope → Open Questions → Functional Requirements)
- [x] Actors use `- Primary:` / `- Secondary:` line labels
- [x] Functional requirements numbered FR-001…FR-007, each with acceptance criteria
- [x] ≥3 measurable Success Metrics (5, each with a digit/percentage/timing threshold)
- [x] Scope boundary + Out of Scope defined
- [x] No TODO/TBD/placeholder markers

## Completeness

- [x] Primary actor identified (Theme author; ADMIN governs; downstream app-build consumer)
- [x] Key value / business problem stated (theme carries a look but not its header/footer)
- [x] ≥3 functional requirements (7)
- [x] Constraints / technical notes documented
- [x] Dependencies identified (SCOPE-107/106/062, marketing-assets S3)

## Readiness for Implementation

- [x] 12 tasks defined (T001–T012), grouped by phase (A model+UI, B emit, C verify)
- [x] Open Questions captured (persistence column, Execute emit site, extend-vs-wrap ThemePreview, landmark wrappers)
- [x] Fences convention noted (`[SCOPE 108 / T00x]`) + `auditfences` gate
- [ ] DB spec 108 row renamed + status set (supersedes the old canvas-improvement rows)
- [ ] Implementation begun (via `implement`)
- [ ] Build clean + Tailwind literal-class check (T012)
- [ ] auditfences clean + wire-the-entrance verified in the built bundle (T012)

---

## Next Steps

1. `implement 108/T001` (Phase A — BusinessChrome header/footer trees + `seedChromeTrees`).
2. Proceed T001 → T012, lift-then-delete the old canvas (T005 before T007); keep fences intact; `auditfences` before any push.
3. Operator runs the live visual pass in Theme Studio → Layout.
