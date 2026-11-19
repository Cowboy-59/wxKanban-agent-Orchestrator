# Scope Analysis — 058 (Branch Check-out / Check-in)

**Mode:** single · **Target:** `specs/Project-Scope/058-BranchCheckinout.md` · **Analyzer:** `/analyzescope` (adversarial-auditor + mentor persona) · Read-only on the scope doc.

058 is the **strongest scope audited so far** — eight FRs each with concrete, testable acceptance criteria; resolved Open Questions with audit detail; properly-prefixed dependencies; and a model numbering note. Findings are minor (one real coverage gap, the rest cosmetic/metadata). **CRITICAL 0 · HIGH 0.**

## Findings

| ID | Severity | Location | Summary | Recommendation |
| -- | -------- | -------- | ------- | -------------- |
| COV-058-fr7fr8 | MEDIUM | FR-007 (L127), FR-008 (L143) vs Success Metrics (L39–44) | The four Success Metrics cover FR-002/003/004/005/006, but **FR-007 (no-bypass git-hook trap)** and **FR-008 (editor read-only)** — two substantial, security-adjacent FRs — have **no success metric**. They're only self-verified by their own acceptance criteria. | Add a metric for each: e.g. "raw-`git` branch to `scope/NNN` claims it in the DB" (FR-007) and "non-held scope docs are read-only in the editor" (FR-008). |
| STRUCT-058-scenarios | LOW | whole doc | No explicit **User Scenarios (US1–N)** section; the narrative lives in Success Metrics + per-FR acceptance criteria instead. Coverage is effectively present, but there's no story-level artifact for QA to trace to. | Optional: add 2–3 US (dev-B-sees-claim, force-override, clean round-trip) for QA traceability, or accept metric+FR coverage on the record. |
| META-058-status | LOW | `**Status**: draft` (L4) | Marked `draft`, but the feature is largely built + deployed + dogfooded (≈19/23 FRs). Status lags reality. | Advance to `implementing`/`implemented` to match. |
| NUM-058-self | LOW | L1, L3 `# Spec 058…` | Header says "Spec 058" rather than `SCOPE-058`. **Heavily mitigated** by the explicit Numbering note (L11) — this is a deliberate 1:1 scope↔spec share. Cosmetic consistency only. | Optional: retitle `# SCOPE-058` for header consistency; the note already removes any real ambiguity. |

*Why it matters (COV-058-fr7fr8):* FR-007 and FR-008 are exactly the "can't be bypassed" guarantees — the no-bypass hook trap and the read-only nudge. An FR with no metric is the one nobody writes an acceptance test for; for the *anti-bypass* features specifically, an untested guarantee is a guarantee that quietly regresses. Give each a metric so a future change that breaks the trap fails a check, not a customer.

## Section completeness

| Section | Present |
| ------- | ------- |
| Overview | ✅ |
| Business Problem | ✅ |
| Actors (primary/secondary) | ✅ |
| Success Metrics | ✅ |
| Scope Boundary / Out of Scope | ✅ |
| Open Questions (both RESOLVED w/ date) | ✅ |
| Functional Requirements (FR-001–008, all w/ acceptance criteria) | ✅ |
| Technical Sections (Data / MCP / Extension / Hooks / Preserved) | ✅ |
| Constraints & Notes / Dependencies | ✅ |
| User Scenarios (US1–N) | ⚠️ absent (see STRUCT-058-scenarios) |

## FR ↔ Success-Metric coverage

| FR | Success Metric |
| -- | -------------- |
| FR-001 claim columns | — (schema enabler; covered via FR-002/004) |
| FR-002 checkout + conflict | SM2, SM3 |
| FR-003 checkin + guard | SM4 |
| FR-004 claim in cockpit_summary | SM1 |
| FR-005 cockpit actions | SM2/SM3/SM4 |
| FR-006 visual state | SM1 |
| FR-007 git-hook no-bypass trap | — (gap) |
| FR-008 editor read-only | — (gap) |

## Dependency & convention check (single-doc)

- **Dependencies resolve + are properly prefixed** ✅ — `SCOPE-042` (Dev Cockpit), `SCOPE-037` (engagement model), `SCOPE-047/SPEC-055`, `SCOPE-043` all exist and use the disambiguated form. This is the convention done *right* (contrast 047/038's bare numbers).
- **Numbering note is exemplary** ✅ — L11 proactively documents the deliberate 1:1 scope↔spec share, the renumber from SCOPE-049, **and** explicitly distinguishes the unrelated `SPEC-049` (wxperts-site-migration). This is precisely the SCOPE/SPEC collision-avoidance the namespace rule exists for — pre-empted at authoring time.
- **DB naming** ✅ — `claimedbyid`, `claimedat`, `projectspecifications`, `userprofiles`: lowercase, concatenated, no underscores.
- **Open Questions resolved** ✅ — both struck through with resolution + date + audit-event detail; no TODO/TBD placeholders.

## Metrics

- FRs: **8** · with acceptance criteria: **8/8** (100%) · zero-criteria: **0**
- FR→metric coverage: **6/8** (FR-007, FR-008 uncovered) · Open questions: **0 open** (2/2 resolved)
- Ambiguity placeholders: **0** · Findings: **4** (MEDIUM 1 · LOW 3) · **CRITICAL 0 · HIGH 0**

## Next actions

- Add Success Metrics for **FR-007** and **FR-008** (the anti-bypass guarantees) — the one substantive gap.
- Advance `Status` from `draft` to match the deployed reality.
- Optional polish: explicit User Scenarios; retitle header `SCOPE-058`.
- This scope is in excellent shape — no blocker; treat the above as finishing touches.

*Remediation available on request — say the word and I'll draft the two Success-Metric additions + status/header edits (read-only until you approve).*
