# Requirements Checklist: Spec 118 — Fence Audit Gate Restoration

**Spec Number**: 118
**Created**: 2026-07-31
**Source**: `specs/118-fence-audit-gate-restoration/spec.md`
**Scope**: `specs/Project-Scope/118-fence-audit-gate-restoration.md`
**Preflight Score**: 100 / 100 (`valid`)

---

## Specification Quality

- [x] Overview states WHAT and WHY, not HOW
- [x] Business problem is measured, not asserted (1,893 errors / 4,074 files / 839 fences)
- [x] Actors use canonical `- Primary:` / `- Secondary:` labels
- [x] Functional requirements numbered FR-001 … FR-005
- [x] Success criteria measurable — every metric carries a number
- [x] Scope boundary and out-of-scope both explicit
- [x] Open questions recorded rather than papered over
- [x] No TODO / TBD / NEEDS CLARIFICATION markers

## Completeness

- [x] Primary actor identified
- [x] Key value proposition stated
- [x] ≥ 3 functional requirements (5)
- [x] ≥ 3 success criteria (7)
- [x] Constraints documented (C-1 … C-7 in scope doc)
- [x] Compliance mapped (SOC2 CC8.1, CC7.1)
- [x] Tasks created and linked to spec (9)

## Readiness for Implementation

- [x] Preflight passed (score 100)
- [x] Measured baseline captured before any change
- [x] Tasks phased so noise is removed before backlog is judged
- [ ] Implementation begun

## Safety Gates — check at execution time

- [ ] Scanned-file count compared before/after; every dropped file justified *(T002 — a gate going quiet is more dangerous than a noisy one)*
- [ ] Gate observed **failing** on an induced violation before being trusted green *(T005)*
- [ ] Baseline records **what** was deferred, with a date and count — not only hashes *(T004)*
- [ ] Flip-to-blocking trigger recorded with a named release boundary and review date *(T007)*
- [ ] At least one consumer verified before the kit release *(T008)*
- [ ] Consumer with no `.gitignore` behaves identically *(T008)*
- [ ] No fence hand-authored — orchestrator only *(C-5)*

## Known Debt Accepted By This Spec

- ~795 genuine un-fenced declarations suppressed via baseline. **Deliberate debt, not a fix.**
- 213 broken fence references demoted to warnings, triage deferred (Open Question 1).
- The gate runs advisory for one release; it enforces nothing until the T007 trigger fires.

---

## Next Steps

1. `implement 118/T001`
2. T002 immediately after — do not let the gate go quiet unverified
3. T005 before trusting any green result
4. Kit release only after T008
