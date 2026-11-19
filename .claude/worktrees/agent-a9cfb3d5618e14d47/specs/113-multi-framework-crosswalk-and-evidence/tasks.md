# Task Breakdown: Multi-Framework Crosswalk and Evidence

**Feature**: Multi-Framework Crosswalk and Evidence
**Spec**: 113
**Date Generated**: 2026-07-27
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Create compliancecontrolmappings and map existing checks | critical | todo |
| 2 | Resolve checks through the mapping so each runs once | critical | todo |
| 3 | Build the evidence resolution service with three states | critical | todo |
| 4 | Create compliancecontrolexclusions for not-applicable justifications | high | todo |
| 5 | Render the evidence bundle to PDF | high | todo |
| 6 | Seed the NIST SSDF control catalog with mappings | high | partial |
| 7 | Seed the ISO 27001 development control catalog with mappings | high | partial |
| 8 | Backfill HIPAA and GDPR checks into the crosswalk | medium | partial |
| 9 | Build the evidence export UI | medium | todo |
| 10 | Disclose coverage boundary across all surfaces | medium | partial |
| 11 | Add compliance awareness to validateScope | medium | todo |

**Reconciled 2026-08-04.** Every row above read `todo` while four migrations were applied to production. `partial` is used rather than `done` deliberately, and rather than `todo` honestly:

- **Nothing here is `done`, and the reason is the same for all four.** T006, T007, T008 and T010 each delivered a real, applied artifact, and each *also* required the crosswalk — mappings, or a quantified per-framework coverage figure drawn from them. `compliancecontrolmappings` does not exist. Marking any of them complete would assert a crosswalk the product does not have, which is precisely the overstatement FR-012 exists to prevent.
- **`partial` is non-terminal to the tooling.** `TERMINAL_MD_STATUSES` in `sync-task-status.ts` is `{done, completed, complete, x, shipped}`, so these rows will not be pushed to the DB as complete. The status is documentation, not a silent state change.

Catalogs applied: NIST SSDF 42 practices / 5 machine-checked (`0014`), ISO 27001 15 of 93 Annex A / 6 (`0015`), HIPAA 48 / 9 (`0017`), GDPR 37 / 5 (`0018`). SOC 2 was 119 / 12 under SPEC-112 `0011`.

**T001 and T002 are the spine and are untouched.** Until the mapping table exists and `AuditEngineService` resolves through it, a shared check is evaluated once *per framework row* — correct output, but the "one check, N frameworks" property this spec is named for is absent. T003, T004, T005 and T009 together mean there is no evidence export at all, which is the artifact a compliance buyer actually purchases.

## Task Details

### T001 — Create compliancecontrolmappings and map existing checks

New table: id, taskid, framework, controlreference, createdat. Many rows per check. Map existing rows rather than rewriting; framework column stays during migration. FR-007.

### T002 — Resolve checks through the mapping so each runs once

Replace AuditEngineService inArray(framework, ...) with a mapping join. A check executes once regardless of framework count. FR-007.

### T003 — Build the evidence resolution service with three states

Every control resolves to exactly one of evidenced, gap, or not-applicable. No control renders satisfied without a traceable artifact. FR-008.

### T004 — Create compliancecontrolexclusions for not-applicable justifications

Immutable, modelled on complianceoverride. Not-applicable requires BOTH written justification and named approver. FR-008.

### T005 — Render the evidence bundle to PDF

One bundle per framework for a project and date range via the existing @sparticuz/chromium path. Coverage boundary on the face of the document. FR-008, FR-012.

### T006 — Seed the NIST SSDF control catalog with mappings

PO, PS, PW and RV practice groups with mappings. Land BEFORE ISO — it sets the real crosswalk efficiency figure. FR-009.

**Delivered 2026-07-28 (`0014_spec113_nistssdf_catalog.sql`, applied).** 42 practices, `PO.1.1` through `RV.3.4`, 5 machine-checked. PO practices that are organisational rather than code-observable ship as manual controls with `isautomated = false` rather than being omitted, so the gap is visible instead of silent. Patterns are only those already proven against this repository by `0011`.

**Outstanding — "with mappings".** Rows use the single `complianceaudittasks.framework` column. Where an SSDF practice is evidenced by the same code as a SOC 2 criterion the **same verified `checkpattern`** is reused, so the crosswalk relationship is recorded by hand ahead of the table that will express it — but the table is T001 and does not exist. The consequence for this task specifically: it was ordered before T007 to set the real crosswalk-efficiency figure, and that figure is therefore still unmeasured.

### T007 — Seed the ISO 27001 development control catalog with mappings

A.5.3, A.8.4, A.8.15, A.8.16, A.8.24 and A.8.25–A.8.34. Controls outside the SDLC slice enumerated as out-of-tool. FR-010.

**Delivered 2026-07-28 (`0015_spec113_iso27001_catalog.sql`, applied).** All 15 named controls present, 6 machine-checked — the highest automation *ratio* of any framework here (6 of 15 against SOC 2's 12 of 119), because the SDLC slice is disproportionately the part a codebase can evidence. The ~78 Annex A controls outside the slice are enumerated as out-of-tool in the rules document, so the output is usable as Statement of Applicability input for the covered subset without implying more.

One implementation detail is load-bearing and easy to undo by accident: `AuditReportService.extractChecklistItems` assigns an SDLC phase by substring-matching phase names against `##`/`###`/`####` headings, and a `####` match overrides the `###` section containing it. Annex A's own control names collide with that — "Secure Development Life Cycle" re-tagged every following item as Development, and "Separation of Development, Test and Production Environments" emptied the Deployment phase. Four `####` headings are therefore deliberately reworded. **The official control names are preserved verbatim in `complianceaudittasks.title`**, which is what the crosswalk and evidence export cite; only the in-document heading differs.

**Outstanding — "with mappings", as T006.**

### T008 — Backfill HIPAA and GDPR checks into the crosswalk

Checks proportionate to SOC 2’s rather than flags alone; both participate in the crosswalk. FR-011.

**Delivered 2026-07-28 (`0017` HIPAA, `0018` GDPR, both applied).** HIPAA 48 controls / 9 machine-checked, GDPR 37 / 5, replacing markdown-parser output that ran to 414 and 381 rows with `description` equal to `title` on every one and a control reference on 0 of 414 and 6 of 381. Every row now carries a regulatory citation, so a bundle entry resolves to 45 CFR §164.312(b) or Article 32(1)(a) rather than to a bullet point. HIPAA covers the Security Rule in full plus §164.314/316 and Breach Notification; GDPR covers lawful basis, minimisation, subject rights, retention and transfer.

"Proportionate to SOC 2's" is met on substance, not row count: SOC 2's 119 includes 14 audit-engagement-logistics rows and many unreferenced checklist fragments. The automated counts sit close together because the evidenceable surface is the *same codebase* — the ceiling is what a pattern can honestly prove, not how many controls a framework names.

**One check is designed to fail.** GDPR Art. 5(1)(c) probes for pseudonymisation or anonymisation and nothing in this tree does either. It reports `absent` — a finding, not a defective check, the same shape as the SOC 2 MFA checks.

**Two patterns were rejected as false passes**, both caught by running them through `evaluateRegexEvidence` before use: `consent` for Art. 7 matched an OAuth `prompt: "consent"` and a regex literal, and a bare `bcrypt` matched a German locale string. That third false pass traced to `src/client/i18n/locales/` forced an engine change — `isScannableSource` now excludes locale bundles, narrowly, covered by a regression test.

**Outstanding — "into the crosswalk".** Neither framework participates in a mapping, because there is none.

### T009 — Build the evidence export UI

Select frameworks and date range; render the three states. Add NIST SSDF and ISO 27001 toggles to AuditConfigPanel. FR-008.

### T010 — Disclose coverage boundary across all surfaces

Every export and settings surface states the SDLC-slice-only boundary with per-framework coverage quantified. FR-012.

**Partially delivered.** The boundary is stated in both new rules documents (`0014`, `0015`) and in `AuditConfigPanel`, which tells the reader it covers "controls of each framework, not your wider management system".

**Outstanding, and it is the harder half.** Not every export and settings surface carries the statement, and **per-framework coverage is nowhere quantified in the UI** — FR-012 asks for figures of the form "ISO 27001: 15 of 93 Annex A controls". Those figures depend on knowing what maps to what, so this task cannot fully close ahead of T001. The uncovered remainder — ISMS, infrastructure, people, physical — is named in the rules documents but not on the product surfaces.

### T011 — Add compliance awareness to validateScope

A framework-enabled project whose scope lacks compliance requirements FAILS rather than warns. Control references must resolve. FR-013.
