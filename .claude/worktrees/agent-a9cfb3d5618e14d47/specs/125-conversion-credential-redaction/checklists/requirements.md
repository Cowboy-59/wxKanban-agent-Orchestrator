# Requirements Checklist: Conversion Credential Redaction

**Spec Number**: 125
**Created**: 2026-08-10
**Source**: `specs/Project-Scope/125-conversion-credential-redaction.md`
**Spec ID**: `b9b6771b-2176-400f-8cd1-45a5ca8f7674`

---

## Specification Quality

- [x] Overview clearly states WHAT and WHY (not HOW)
- [x] User scenarios cover primary, secondary, and edge cases — 4 scenarios in the umbrella scope
- [x] Functional requirements are numbered (FR-001 … FR-015)
- [x] Each FR has clear acceptance criteria
- [x] Success criteria are measurable and technology-agnostic — 8 metrics, each with a threshold
- [x] Scope boundaries are clearly defined
- [x] No implementation details in specification sections

## Completeness

- [x] Primary actor identified — the legacy-migration developer
- [x] Key value proposition stated
- [x] At least 3 user scenarios defined — 4
- [x] At least 3 functional requirements defined — 15
- [x] At least 3 success criteria defined — 8
- [x] Constraints documented — 11
- [x] Compliance requirements mapped — SOC 2 active (CC6.1 ×2, CC7.1)

## Readiness for Implementation

- [x] No `[NEEDS CLARIFICATION]` markers remain
- [x] Scope preflight passes — 100/100, 0 blocking, 0 placeholders
- [x] Spec preflight passes — 100/100, 0 blocking, 0 warnings
- [x] Dependencies on other scopes identified — SPEC-019, SCOPE-026, SCOPE-082, SCOPE-124
- [x] Tasks generated and linked to the spec — 19, passed inline at creation
- [x] Spec number verified free in both namespaces before claiming

## Verification-Specific Gates

- [ ] C-1 — MOJIBAKE table byte-verified after every edit to `pcsoft-doc-split.py`, in all three trees
- [ ] Watermark — `stamp_markdown` still applied to `.md` output after the funnel refactor
- [ ] Signal — negative fixture proves unquoted right-hand sides are not redacted
- [ ] Fidelity — element manifest byte-identical with redaction on and off
- [ ] Parity — all 9 module copies byte-identical under `auditfences --strict`
- [ ] No unmediated writes — 0 bare `open(..., "w")` across 54 scripts
- [ ] Sidecar — asserted to contain no credential value in any form, including masked

## Release Gates

- [ ] Kit release cut (rides or waits for the outstanding SCOPE-124 release)
- [ ] Release assets **explicitly verified present** on GitHub Releases, both channels
- [ ] Consumer upgrade confirmed delivering the module to all 3 family directories
- [ ] Feedback `f99e80aa-4afc-4d78-9541-ca0bf310fd7b` answered and closed with the shipped version

## Out of Band — Not Deliverable Here

- [ ] Rotation of the reporting project's affected legacy accounts — the only remedy for credentials
      already disclosed, and necessary regardless of what ships

---

## Notes

Two claims in the source report did not survive verification and both changed the design: the
confirmed leak artifacts have **no producer script** (so a Python-only fix would not have prevented
it), and **six of the nine named files have no write funnel** (so the proposed scrub had nothing to
attach to). A pattern gap was also found — bare `user` was omitted, and positional credential
arguments match no `key = value` shape.
