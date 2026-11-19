# Spec 113: Multi-Framework Crosswalk and Evidence

## Overview

Band B of SCOPE-113. Introduce a control crosswalk so one check satisfies many frameworks, add NIST SSDF then ISO 27001 development controls on top of it, backfill HIPAA and GDPR engine depth, export an auditor-ready evidence bundle, and make coverage claims honest and machine-checked.

This is where wxKanban's compliance offering becomes sellable: a customer can enable several frameworks at once, the checks run once, and the output is a document an external auditor accepts.

**Source scope**: `specs/Project-Scope/113-compliance-coverage-generated-products.md` (FR-007 through FR-013).
**Depends on**: SPEC-112 — every item here is inert while framework enablement is unreadable.

## Business Problem

Once SPEC-112 makes compliance enablement work, the feature still cannot do the job customers buy it for.

The existing design is framework-siloed: `complianceaudittasks` carries a single `framework` column, so covering a second framework means authoring a second full set of checks. SOC 2, NIST SSDF and ISO 27001 overlap by roughly 70 to 80 percent in the SDLC slice — a single change-management control satisfies `CC8.1`, `A.8.32`, `PW.7` and `PW.8` simultaneously. Built siloed, adding ISO 27001 costs roughly 90 new check definitions and re-runs work already done. Built crosswalked, it is a mapping exercise plus a small number of genuinely new checks.

Two of the four advertised frameworks are hollow: HIPAA and GDPR have database flags but limited rule-engine implementation, so a customer enabling them gets a toggle and little else. There is no way to hand an external auditor an evidence bundle, which is the actual artifact a compliance buyer needs. And nothing prevents a coverage claim exceeding what the tool does — `validateScope` verifies that requirements have acceptance criteria but has no compliance awareness at all, so a compliance-enabled project can inject nothing and still score an A.

## Actors

- Primary: Project owner delivering a product that must satisfy one or more compliance frameworks and needs evidence for an audit.
- Secondary: External auditor consuming the exported bundle, and the compliance officer who records not-applicable justifications.

## Success Metrics

1. Adding ISO 27001 to a project already running SOC 2 requires a demonstrably sublinear number of new check definitions against the framework-siloed baseline of roughly 90, with zero re-execution of already-mapped checks. The hard figure is set once NIST SSDF lands.
2. Every control in an exported PDF carries exactly one of evidenced, gap, or not-applicable, with 100% of not-applicable entries carrying both a written justification and a named approver.
3. 100% of evidenced controls trace to their artifact without leaving the document, and 0 controls render as satisfied without a traceable artifact.
4. HIPAA and GDPR each carry a check count proportionate to SOC 2's rather than flags alone, and both participate in the crosswalk with 0 duplicate check definitions.
5. Zero exported or public surfaces assert coverage exceeding the SDLC slice, with per-framework coverage quantified wherever a framework is named.

## Scope Boundary

This iteration adds `compliancecontrolmappings` (`taskid`, `framework`, `controlreference`) and `compliancecontrolexclusions` (immutable, modelled on `complianceoverride`), extends `src/server/services/AuditEngineService.ts` to resolve checks through the mapping rather than the `framework` column, adds a PDF evidence exporter reusing the existing `@sparticuz/chromium` App Runner path, seeds the NIST SSDF PO/PS/PW/RV catalog and then the ISO 27001 development controls into `complianceaudittasks` with mappings, backfills HIPAA and GDPR checks, adds an evidence export UI, and extends `_wxAI/rules/compliance-context.md`, `.claude/commands/compliance-scan.md` and `validateScope` for the new frameworks and for compliance awareness.

## Out of Scope

NIST SP 800-53 Rev 5 full baseline and FedRAMP. FIPS 140-3 module validation. ISO 27001 Annex A controls outside the SDLC slice — approximately 78 of 93 — which are enumerated as out-of-tool rather than silently absent. Customer ISMS artifacts, infrastructure, people and physical controls. Any claim that a generated product is certified or compliant. The findings register, ISMS document set, MFA and token lifecycle, all deferred to SPEC-114. Framework enablement mechanics, owned by SPEC-112.

## Open Questions

1. What threshold becomes the hard gate for crosswalk efficiency once NIST SSDF lands and the real mapping cost is known?
2. Does "proportionate to SOC 2's" for HIPAA and GDPR get a numeric floor, or stay judged at review?

## Delivery note — FR-009 and FR-010 catalogs landed ahead of FR-007 (2026-07-28)

SPEC-112 Amendment A added `nistssdfenabled` and `iso27001enabled` columns and surfaced both frameworks in the settings UI, the MCP tool and `get_audit_config`. That left two switches with nothing behind them: no rules document in `wxkanbandocuments`, zero rows in `complianceaudittasks`. A framework a customer can enable and which then does nothing is worse than one that is absent, because the toggle reads as coverage.

The catalogs were therefore authored ahead of FR-007's crosswalk, using the existing single `complianceaudittasks.framework` column rather than `compliancecontrolmappings`. This is deliberately compatible with FR-007 rather than a shortcut around it:

- FR-007's acceptance criteria already require that *"existing `complianceaudittasks` rows are mapped, not rewritten"*. These rows are exactly that — existing rows awaiting a mapping.
- No schema was added, so FR-007 introduces `compliancecontrolmappings` against an unchanged table.
- Where an SSDF or ISO control is evidenced by the same code as a SOC 2 control, the **same verified `checkpattern`** is reused. That is the crosswalk relationship recorded by hand in advance of the table that will express it, so FR-007's job becomes mapping rows that already agree rather than reconciling ones that do not.

What FR-007 still buys once it lands: a single check *execution* feeding N frameworks. Today the shared pattern is evaluated once per framework row, which is correct but not yet efficient. FR-007's success metric is unaffected — the mapping cost is now measurable rather than estimated.

## Delivery note — FR-011 (2026-07-28)

HIPAA and GDPR are backfilled on the same terms. Both were carrying markdown-parser output — 414 and 381 rows, every one with `description` equal to `title`, 0 of 414 and 6 of 381 with a control reference. Migration 0016 had already stopped them claiming automation they could not perform; 0017 and 0018 replace the rows with authored catalogs anchored to the regulations themselves, so a citation in an exported bundle resolves to 45 CFR §164.312(b) or Article 32(1)(a) rather than to a bullet point.

**Counts.** HIPAA 48 controls / 9 automated, GDPR 37 / 5, against SOC 2's 119 / 12. FR-011's "proportionate to SOC 2's, judged at review" is met on substance rather than row count: SOC 2's 119 includes 14 audit-engagement-logistics rows and many unreferenced checklist fragments, while every HIPAA and GDPR row here carries a regulatory citation. The automated counts are close because the *evidenceable surface is the same codebase* — the ceiling is what a regex can honestly prove, not how many controls a framework names.

**FR-011's named coverage is complete.** Lawful basis (Art. 6, 7, 9), minimisation (Art. 5(1)(c), 25(2)), subject rights (Art. 15–22), retention (Art. 5(1)(e)), transfer (Art. 44–46, 49). HIPAA covers the Security Rule in full — administrative §164.308, physical §164.310, technical §164.312 — plus §164.314/316 and the Breach Notification Rule.

**One check is designed to fail.** GDPR Art. 5(1)(c) checks for pseudonymisation or anonymisation and nothing in this tree does either. It reports `absent`, which is a finding, not a defective check — the same shape as the SOC 2 MFA checks, where a control worth having is worth reporting the absence of.

**Two patterns were rejected as false passes**, both caught by running them through `evaluateRegexEvidence` before use: `consent` for Art. 7 matched an OAuth `prompt: "consent"` and a regex literal, and a bare `bcrypt` matched a German locale string, `"bcrypt-Hashing mit JWT-Tokens…"`, reporting translated marketing copy as evidence of password hashing.

**That last one forced an engine change.** It was the third false pass traced to `src/client/i18n/locales/` — the bundles are product prose that happens to live in `.ts` files, and they describe the product's security properties in six languages. `isScannableSource` now excludes them. The exclusion is narrow: locale bundles only, not client code generally. Covered by a regression test.

## Data Requirements

| Change | Detail |
| --- | --- |
| `compliancecontrolmappings` (new) | `id`, `taskid` referencing `complianceaudittasks.id`, `framework`, `controlreference`, `createdat`. Many rows per check |
| `compliancecontrolexclusions` (new) | `id`, `projectid`, `framework`, `controlreference`, `reason`, `approvedby` referencing `userprofiles.id`, `createdat`. Immutable |
| `complianceaudittasks` | No schema change. `controlreference` already accepts `CC6.1` and `Article 32` style values and takes `PW.7.1` and `A.8.28` unchanged. Framework responsibility moves to the mapping table; existing rows are mapped, not rewritten |

## API Routes

| Route | Change |
| --- | --- |
| `GET /api/audit/evidence/:projectid` | New — evidence bundle per framework and date range, rendered to PDF |
| `POST /api/audit/exclusions` | New — record a not-applicable with reason and named approver |

## Frontend Components

| Component | Change |
| --- | --- |
| Evidence export view | New — select frameworks and date range, render evidenced / gap / not-applicable |
| `AuditConfigPanel` | Gains NIST SSDF and ISO 27001 toggles against the columns SPEC-112 added |

## Integration Context

This spec extends SCOPE-013's audit infrastructure rather than replacing it; FR-011 is explicitly remediation of 013's partially-delivered HIPAA and GDPR support. `complianceoverride` supplies the reason-plus-approver immutable pattern that `compliancecontrolexclusions` follows. `complianceaudittasks.controlreference` needs no schema change, and `AuditEngineService`'s existing `inArray(framework, ...)` query is the thing being replaced by a mapping join — which is why the `framework` column stays during migration rather than being dropped. PDF rendering reuses the `@sparticuz/chromium` path already working on App Runner. The kit must not gain `pg` or `drizzle` dependencies, so export runs server-side and the kit consumes the result.

## Functional Requirements

### FR-007 — Control crosswalk

**Acceptance Criteria**:
- [ ] One check maps to N `(framework, controlreference)` pairs
- [ ] A check runs once regardless of how many enabled frameworks reference it
- [ ] Enabling an additional framework surfaces coverage from existing evidence with no re-run
- [ ] Adding a framework requires no duplicate check definitions for already-mapped controls
- [ ] Existing `complianceaudittasks` rows are mapped, not rewritten

### FR-008 — Auditor-ready evidence export

**Acceptance Criteria**:
- [ ] One PDF bundle per selected framework, for a project and date range
- [ ] Every control resolves to exactly one of evidenced, gap, or not-applicable
- [ ] Evidenced rows carry control, requirement, implementing fence or commit, test result, date and approver
- [ ] Not-applicable requires a written justification and a named approver, stored immutably
- [ ] No control renders as satisfied without a traceable artifact
- [ ] The bundle states the coverage boundary from FR-012 on its face

### FR-009 — NIST SSDF (SP 800-218) control catalog

**Acceptance Criteria**:
- [ ] PO, PS, PW and RV practice groups present as checks with `controlreference` values such as `PW.7.1`
- [ ] Every SSDF practice is either mapped to a check or explicitly marked out-of-tool with a reason
- [ ] Enabling SSDF on a project already running SOC 2 reuses mapped evidence

### FR-010 — ISO/IEC 27001:2022 development controls

**Acceptance Criteria**:
- [ ] `A.5.3`, `A.8.4`, `A.8.15`, `A.8.16`, `A.8.24` and `A.8.25` through `A.8.34` present as checks
- [ ] Annex A controls outside the SDLC slice are enumerated as out-of-tool, not silently absent
- [ ] Output is usable as Statement of Applicability input for the covered subset

### FR-011 — HIPAA and GDPR engine backfill

**Acceptance Criteria**:
- [ ] Each has checks proportionate to SOC 2's, judged at review
- [ ] Both participate in the crosswalk
- [ ] GDPR covers lawful basis, minimisation, subject rights, retention and transfer
- [ ] HIPAA covers the Security Rule safeguards

### FR-012 — Coverage boundary is disclosed, not implied

**Acceptance Criteria**:
- [ ] Every export and settings surface states the tool covers the SDLC slice only
- [ ] Per-framework coverage is quantified, for example "ISO 27001: 15 of 93 Annex A controls"
- [ ] No surface uses "certified" or "compliant" for a generated product
- [ ] The uncovered remainder is named — ISMS, infrastructure, people, physical

### FR-013 — `validateScope` compliance awareness

**Acceptance Criteria**:
- [ ] When a project has at least 1 framework enabled, a scope lacking a Compliance Requirements section fails rather than warns
- [ ] Every `controlreference` cited resolves to a known control of an enabled framework
- [ ] Unrecognised or malformed control references report as critical
- [ ] Scopes on projects with no framework enabled are unaffected

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-07-27
- **Phase**: design
