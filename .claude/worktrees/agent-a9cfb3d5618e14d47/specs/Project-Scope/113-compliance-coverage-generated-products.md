# Spec 113: Compliance Coverage for Generated Products — Multi-Framework SDLC Coverage, Crosswalk & Auditor Evidence

**Spec Number**: 113
**Status**: `draft`
**Created**: 2026-07-27
**Depends On**: SCOPE-013 (Audit Management), SCOPE-093 (Always-On Core / compliance-context rule)
**Source**: `specs/Project-Scope/113-compliance-coverage-generated-products.md`

---

## Overview

Repair wxKanban's compliance subsystem so that enabling a framework on a project genuinely governs that project's SDLC and yields auditor-acceptable evidence — then extend it to NIST SSDF (SP 800-218) and ISO/IEC 27001:2022 development controls via a control crosswalk where one check feeds many frameworks, and close wxKanban's own certification gap.

The work runs in three bands. **Repair**: establish a single per-project source of truth for framework enablement, correct the reader the agent pipeline depends on, deliver framework rules to consumer projects, and fix the audit engine's check accuracy so it stops reporting unearned passes. **Extend**: introduce a control crosswalk so one check satisfies many frameworks, add NIST SSDF then ISO 27001 development controls on top of it, backfill HIPAA and GDPR engine depth, and export an auditor-ready evidence bundle. **Attest**: close wxKanban's own open findings, stand up the ISMS document set, and ship MFA as the certification prerequisite.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | Project owner delivering a product that must satisfy a compliance framework |
| **Secondary Actors** | External auditor receiving the evidence bundle; compliance officer configuring frameworks per project; wxKanban operator running the certification program |
| **Key Value** | Switching on a framework actually enforces it and produces auditor-ready evidence — compliance as a byproduct of normal development rather than paperwork |
| **Enablement granularity** | **Per-project.** `appauditconfiguration` re-keyed from company to project; `companyprojects.audittype` retired |
| **Framework multiplicity** | Multiple frameworks active simultaneously on one project |
| **Crosswalk model** | One check → N `(framework, controlreference)` pairs. The reusable unit is the **evidence**, not the requirement text |
| **Coverage claim** | The **SDLC slice only** — ~100% of NIST SSDF, ~15 of ISO 27001's 93 Annex A controls, SOC 2's change-management and access clusters |
| **Delivery order** | Band A Repair → Band B Extend (NIST SSDF before ISO 27001) → Band C Attest |

### The problem being solved

wxKanban sells compliance-aware development: a customer switches on a framework and expects the SDLC to enforce it and produce evidence. Today that promise is broken end to end.

Framework enablement is split across **three fields in two stores with no authority**:

| Store | Grain | Drives | State |
|-------|-------|--------|-------|
| `companyprojects.audittype` | per-project, single-framework | `AuditReportService` | Works |
| `appauditconfiguration.*enabled` | per-company (`appid`) | `AuditEngineService` | Hollow for 2 of 4 frameworks |
| `companyprojects.securityclassification` | per-project | nothing | Holds framework names on some rows |

The MCP reader `project.get_audit_config` queries the **company-keyed** `appid` column with a **project ID**. Verified against production: **19 of 21 `appid` values resolve to a company, 0 to a project.** The predicate has never matched.

Consequently `_wxAI/rules/compliance-context.md` Step 1 always concludes compliance context is INACTIVE, and **`buildscope`, `createSpecs` and `implement` have never once loaded compliance rules** — for anyone, including 21 projects with `audittype` set (17 SOC2, 3 HITRUST, 1 GDPR) and two paying companies (CPC Solutions, Quarkza Ltd.) who enabled flags in the settings panel.

Downstream: the `*_SDLC_Compliance_Rules.md` files never reach consumer projects, so Step 2 cannot resolve there either; `AuditEngineService.checkRegexPattern` scans the entire `src` tree and returns `pass` on the first match anywhere — including comments, dead code and unrelated modules — manufacturing false audit assurance; HIPAA and GDPR have database flags but limited rule-engine implementation; and there is no way to hand an external auditor an evidence bundle.

**The result is a compliance feature that reports success while doing nothing** — the worst possible failure mode, because customers make decisions on its output.

---

## Scope Boundary

In scope for this iteration:

- **Band A — Repair.** Re-key `appauditconfiguration` from company to project with unique `projectid`; add `nistssdfenabled` and `iso27001enabled`; retire `companyprojects.audittype` after migrating all eight readers; cleanse `securityclassification` of framework values; migrate and backfill preserving customer intent by fanning company-level flags out to owned projects; quarantine the two orphan rows; per-project ADMIN-gated settings UI; correct `project.get_audit_config` with a regression test that fails against today's code; deliver framework rules files to consumer projects via both kit allowlists with loud failure when absent; make the audit engine file-scoped so `pass` requires positive evidence and unverifiable checks return `needs_review`.
- **Band B — Extend.** `compliancecontrolmappings` crosswalk so one check maps to N framework/control pairs and runs once; `compliancecontrolexclusions` immutable table requiring written justification and named approver; auditor-ready PDF evidence export rendering every control as evidenced, gap or not-applicable; NIST SSDF PO/PS/PW/RV catalog first, ISO 27001 development controls second; HIPAA and GDPR engine backfill participating in the crosswalk; coverage boundary disclosed and quantified wherever a framework is named; `validateScope` compliance awareness.
- **Band C — Attest.** Close C-2, H-1, H-3–H-9 and M-1–M-12 with linked remediation evidence; ISMS document set including Statement of Applicability across all 93 Annex A controls; TOTP multi-factor authentication for administrative access; public claims gated on a clean findings register.

## Out of Scope

Explicitly excluded from this iteration:

- **Customer ISMS artifacts** — policies, risk registers, training records, management review. These are the customer's own management system and roughly 40% of ISO 27001.
- **Infrastructure, people and physical controls**, inherited from AWS or owned by the customer and unreachable by this product.
- **NIST SP 800-53 Rev 5 full control baseline** and FedRAMP authorization. (The SDLC slice of 800-53 is in scope as FR-019, Amendment A.)
- **FIPS 140-3** cryptographic module validation.
- **EU data residency migration.** Production remains `us-east-2`; the transfer question needs either Standard Contractual Clauses with a transfer impact assessment, or an EU region. Both are architecture decisions outside this scope.
- **Any claim that a wxKanban-generated product is "certified" or "compliant"**, as opposed to covered for the SDLC control slice.
- **Achieving certification itself**, which requires an accredited certification body for ISO 27001 and self-attestation for NIST CSF/SSDF — neither producible by code.
- **Superseding SCOPE-013**, which retains ownership of the underlying audit infrastructure this scope repairs and extends.

---

## User Scenarios & Testing

### US1 — Enable a framework on a project and have the SDLC actually enforce it

**Actor**: Project owner working in their own repo via the kit.

**Scenario**:
1. Opens project settings → Compliance, ticks **SOC 2**, **NIST SSDF** and **ISO 27001**, saves.
2. In their repo, runs `buildscope` for a new feature that touches user credentials.
3. The interview asks framework-relevant discovery questions (data types, access patterns, retention, audit events).
4. The generated scope carries a `## Compliance Requirements` section citing `CC6.1`, `A.8.5` and `PW.9` against specific FRs.
5. `createSpecs` carries those into the spec; `implement` flags the credential-handling code as compliance-relevant.

**Expected outcome**: `project.get_audit_config` returns all three frameworks as active; the rules files are present at the consumer project root; the scope document contains control-referenced, testable requirements that were not hand-written.

### US2 — Hand an auditor an evidence bundle

**Actor**: Project owner preparing for a customer's supplier review.

**Scenario**:
1. Requests an evidence export for a project and date range.
2. Selects which enabled frameworks to render.

**Expected outcome**: One PDF bundle per framework. Each control resolves to exactly one of three states — **evidenced** (control → requirement → implementing fence/commit → test result → date → approver), **gap** (no evidence, with what is missing), or **not applicable** (with written justification and named approver). No control is ever rendered as satisfied without a traceable artifact.

### US3 — One check, many frameworks

**Actor**: The audit engine, on a project with SOC 2 and ISO 27001 both enabled.

**Scenario**:
1. The change-management check runs **once**.
2. Its result is emitted against `CC8.1`, `A.8.32`, `PW.7` and `PW.8` via the crosswalk.
3. The owner later enables NIST SSDF on the same project.

**Expected outcome**: No duplicate checks are authored or executed. Enabling a third framework increases coverage using existing evidence — it does not trigger a re-run or require new check definitions for controls already mapped.

### US4 — A check that cannot be verified must say so

**Actor**: The audit engine.

**Scenario**:
1. A check runs where the pattern is absent, ambiguous, or only present outside the file under evaluation.

**Expected outcome**: Result is `needs_review` with a stated reason, or `fail` — **never `pass`**. A pattern found in an unrelated file, a comment, or dead code does not produce a pass for the file under evaluation. The evidence bundle renders it as unevidenced, and the overall score does not count it as satisfied.

### US5 — Existing customer through the migration

**Actor**: CPC Solutions admin (SOC 2 + HIPAA + HITRUST enabled today at company level).

**Scenario**:
1. Opens any of their projects after the migration.

**Expected outcome**: All three frameworks show enabled on every project the company owns — intent preserved, nothing silently switched off. A one-time notice explains that enablement is now per-project and can be adjusted. Previously-configured schedule, severity threshold and retention carry across intact.

### US6 — wxKanban's own certification posture

**Actor**: wxKanban operator.

**Scenario**:
1. Reviews the open findings register.
2. Works C-2, H-1, H-3–H-9 and M-1–M-12 to closed, each with a linked remediation artifact.
3. Assembles the ISMS document set — scope statement, risk methodology, risk treatment plan, Statement of Applicability, internal audit programme.

**Expected outcome**: Every open Critical, High and Medium finding is closed with evidence; the SoA justifies all 93 Annex A controls in or out; the register is exportable to a third-party auditor. Certification claims on public surfaces are gated on this register being clean.

---

## Functional Requirements

### Band A — Repair

### FR-001 — Per-project framework enablement is the single source of truth

`appauditconfiguration` is re-keyed to `projectid`; multiple frameworks may be active on one project simultaneously.

**Acceptance Criteria**:
- [ ] `appauditconfiguration.projectid` references `companyprojects.id`, unique per project
- [ ] All existing per-company config fields (schedule, threshold, retention, fail-on-critical) survive at project grain
- [ ] `companyprojects.audittype` is no longer read by any code path
- [ ] `securityclassification` no longer holds framework names; classification and framework are separate axes
- [ ] A project can have SOC 2, NIST SSDF and ISO 27001 all true at once

### FR-002 — Migration preserves existing customer intent

**Acceptance Criteria**:
- [ ] Every project whose company had a framework enabled receives a row with those flags true (fan-out)
- [ ] Every project with `audittype` set receives the matching flag true
- [ ] Company-level schedule, threshold and retention carry to each fanned-out project unchanged
- [ ] The two orphan rows (`550e8400-…` RFC seed, `019c777f-a949-…`) are quarantined, not fanned out
- [ ] Migration is idempotent and produces a written before/after row count

### FR-003 — Per-project compliance settings UI

**Acceptance Criteria**:
- [ ] Settings are reached in a project context, not company-wide
- [ ] Only ADMIN can change enablement; non-admins see current state read-only
- [ ] A one-time notice explains the move from company to project grain
- [ ] Saving is confirmed against a re-read, not the optimistic local object

### FR-004 — The MCP reader returns the truth

**Acceptance Criteria**:
- [ ] `project.get_audit_config(projectId)` returns the frameworks actually enabled on that project
- [ ] `complianceActive` is true whenever ≥1 framework is enabled
- [ ] A regression test asserts a project with SOC 2 on returns `activeFrameworks: ["SOC2"]` — this test fails against today's code
- [ ] Returns an explicit "no configuration" signal, distinguishable from "configured, all off"

### FR-005 — Framework rules reach consumer projects

**Acceptance Criteria**:
- [ ] The kit delivers the rules file for each enabled framework to the consumer project root
- [ ] `compliance-context.md` Step 2 resolves in a consumer project without manual copying
- [ ] A missing rules file is reported loudly, never silently treated as "inactive"
- [ ] Only rules for enabled frameworks are delivered
- [ ] Both kit root-file allowlists are updated

### FR-006 — The audit engine never reports an unearned pass

**Acceptance Criteria**:
- [ ] A check evaluates the file under evaluation, not the first match anywhere in the tree
- [ ] A pattern found in a comment, a dead file, or an unrelated module does not produce a pass for that file
- [ ] Where a check cannot conclusively verify, it returns `needs_review` with a stated reason
- [ ] `pass` requires positive evidence; absence of a pattern is never a pass
- [ ] The engine's regression suite includes the false-pass case that exists today

### Band B — Extend

### FR-007 — Control crosswalk

New `compliancecontrolmappings` (`taskid`, `framework`, `controlreference`) — many rows per check.

**Acceptance Criteria**:
- [ ] One check maps to N `(framework, controlreference)` pairs
- [ ] A check runs once regardless of how many enabled frameworks reference it
- [ ] Enabling an additional framework surfaces coverage from existing evidence with no re-run
- [ ] Adding a framework requires no duplicate check definitions for already-mapped controls
- [ ] Existing `complianceaudittasks` rows are mapped, not rewritten

### FR-008 — Auditor-ready evidence export

**Acceptance Criteria**:
- [ ] One PDF bundle per selected framework, for a project and date range
- [ ] Every control resolves to exactly one of **evidenced / gap / not-applicable**
- [ ] Evidenced rows carry control → requirement → implementing fence or commit → test result → date → approver
- [ ] Not-applicable requires a written justification **and** a named approver, stored immutably in `compliancecontrolexclusions`
- [ ] No control renders as satisfied without a traceable artifact
- [ ] The bundle states the coverage boundary from FR-012 on its face

### FR-009 — NIST SSDF (SP 800-218) control catalog

**Acceptance Criteria**:
- [ ] PO, PS, PW and RV practice groups present as checks with `controlreference` values (e.g. `PW.7.1`)
- [ ] Every SSDF practice is either mapped to a check or explicitly marked out-of-tool with reason
- [ ] Enabling SSDF on a project already running SOC 2 reuses mapped evidence

### FR-010 — ISO/IEC 27001:2022 development controls

**Acceptance Criteria**:
- [ ] `A.5.3`, `A.8.4`, `A.8.15`, `A.8.16`, `A.8.24`, `A.8.25`–`A.8.34` present as checks
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
- [ ] Per-framework coverage is quantified (e.g. "ISO 27001: 15 of 93 Annex A controls")
- [ ] No surface uses "certified" or "compliant" for a generated product
- [ ] The uncovered remainder is named — ISMS, infrastructure, people, physical

### FR-013 — `validateScope` compliance awareness

**Acceptance Criteria**:
- [ ] When a project has ≥1 framework enabled, a scope lacking a Compliance Requirements section **fails** — not warns
- [ ] Every `controlreference` cited resolves to a known control of an enabled framework
- [ ] Unrecognised or malformed control references report as critical
- [ ] Scopes on projects with no framework enabled are unaffected

### Band C — Attest

### FR-014 — Findings register with closure evidence

**Acceptance Criteria**:
- [ ] C-2 and H-1, H-3 through H-9 closed with linked remediation artifacts
- [ ] M-1 through M-12 closed, including M-3 (plaintext App Runner secrets) and M-12 (no login lockout)
- [ ] Register is exportable for a third-party auditor
- [ ] Each closure references the check that now prevents regression

### FR-015 — ISMS document set

**Acceptance Criteria**:
- [ ] Scope statement, risk methodology, risk treatment plan, internal audit programme, management review record
- [ ] Statement of Applicability justifies all 93 Annex A controls in or out
- [ ] Personnel and physical controls documented as inherited or owned, with evidence source

### FR-016 — Public claims gated on the register

**Acceptance Criteria**:
- [ ] No public surface claims certification wxKanban does not hold
- [ ] Certification language is permitted only once FR-014 is clean and an accredited certificate exists
- [ ] The landing-page correction already applied is captured as the baseline

### FR-017 — Multi-factor authentication (certification prerequisite)

wxKanban has no MFA today. Required by `IA-2(1)` (NIST) and `A.8.5` (ISO); without it no certificate issues regardless of FR-014 and FR-015.

**MFA applies once, at the human moment — never per-call.** Both standards require multi-factor for *interactive privileged access*, not for machine identities. A non-interactive token inherits its assurance from the MFA-verified session that minted it (the GitHub PAT / AWS IAM model). The daily dev loop — `buildscope`, `createSpecs`, `implement`, `dbpush` — must never prompt.

**Acceptance Criteria**:
- [ ] ADMIN accounts can enrol a TOTP second factor
- [ ] Single-use recovery codes issued at enrolment, regenerable
- [ ] Interactive administrative operations require a verified second factor
- [ ] A 30-day trusted-device option prevents per-visit prompting
- [ ] **Zero MFA prompts occur in any non-interactive MCP or CLI path**
- [ ] Enrolment state and last-verification are auditable
- [ ] Mapped through the crosswalk to `IA-2(1)`, `A.8.5`, `CC6.1`
- [ ] Complements M-12 account lockout rather than replacing it

**Depends on**: FR-014's closure of H-3 — a role column is inert while `mcp-server/src/server.ts:5` hard-defaults every caller to `editor`.

### FR-018 — Token lifecycle and least privilege

Machine credentials carry the compensating controls that make FR-017's model defensible. Today there are **175 active never-expiring tokens**, no way to express a token's privilege, and any token can mint another.

**Acceptance Criteria**:
- [ ] `mcpapitokens` gains a `role` column (`read_only` / `editor` / `admin`), set at issuance
- [ ] The MCP resolves role from the token record; the hard-coded `'editor'` fallback is removed
- [ ] `project.create_api_token` and `project.revoke_api_token` require `admin`
- [ ] `admin` is never issued as a token — **a token cannot mint a token**; minting requires an MFA-verified web session
- [ ] New tokens cannot be issued without a bounded `expiresat`
- [ ] The 175 existing never-expiring tokens receive a horizon, with warnings at 30 / 7 / 1 days in-app and by email
- [ ] Tokens never used past an age threshold are auto-revoked — 93 of 182 have never made a call, so this carries no user impact
- [ ] Expiry yields an actionable error naming the renewal path, and the Cockpit surfaces pending expiry before it bites
- [ ] Mapped through the crosswalk to `IA-2(1)`, `AC-2`, `A.5.15`, `A.5.18`, `A.8.5`

### FR-019 — NIST SP 800-53 Rev 5, SDLC slice (Amendment A, 2026-10-18)

The crosswalk gains a NIST SP 800-53 Rev 5 catalog limited to the controls software delivery can evidence: SA-3, SA-8, SA-10, SA-11, SA-15, SA-17, CM-3, CM-4, CM-5, CM-8, RA-5, SI-2, SI-10, AC-6, AU-2 and AU-12. Each is mapped to the checks that already provide its evidence wherever they exist (one check, many frameworks). A per-project toggle `nist80053enabled` joins `appauditconfiguration` (manual DDL under SCOPE-117), the settings UI, the MCP reader and `project.get_compliance_context`. SCOPE-140's nightly evidence maps to this catalog when the toggle is on. The full baseline, FedRAMP, and the families software cannot evidence (physical, personnel, contingency) stay out.

**Acceptance Criteria**:
- [ ] Each of the 16 controls is mapped to at least one check, or marked out-of-tool with a reason
- [ ] Enabling 800-53 on a project already running NIST SSDF reuses the mapped evidence, with no re-execution
- [ ] Every report or artifact naming 800-53 states that it covers the SDLC slice, never the baseline, and never says compliant
- [ ] The toggle column is applied by hand, verified with `npm run db:drift`, and recorded in the schema change log

---

## Data Requirements

| Change | Detail |
|--------|--------|
| `appauditconfiguration` | Re-key `appid` → `projectid` → `companyprojects.id`, unique. Add `nistssdfenabled`, `iso27001enabled` booleans |
| `compliancecontrolmappings` *(new)* | `id`, `taskid` → `complianceaudittasks.id`, `framework`, `controlreference`, `createdat`. Many rows per check |
| `compliancecontrolexclusions` *(new)* | `id`, `projectid`, `framework`, `controlreference`, `reason`, `approvedby` → `userprofiles.id`, `createdat`. Immutable, modelled on `complianceoverride` |
| `complianceaudittasks` | No schema change — `controlreference` already accepts `PW.7.1` / `A.8.28`. Framework moves to the mapping table |
| `companyprojects.audittype` | Dropped **after** all readers migrate |
| `companyprojects.securityclassification` | Framework values overwritten to null; classification only |

**Migration order**:
1. Add `projectid` + new framework columns (additive, nothing reads them yet)
2. Backfill from `audittype` **and** company fan-out; quarantine the two orphans
3. Cut readers over — `AuditReportService` last, since it is the one with real behaviour
4. Drop `audittype` only once step 3 is verified

**Known `audittype` readers to migrate (8)**: `db/schema/companyproject.ts`, `shared/types/projects.ts`, `server/routes/projects.ts` (zod enum), `server/services/AuditReportService.ts`, `client/components/Dashboard/DashboardProjectGrid.tsx`, `client/pages/AdminDashboard.tsx`, `client/pages/ProjectWorkspacePage.tsx` (three bindings).

---

## API Routes

| Route | Change |
|-------|--------|
| `GET/PUT /api/audit/config` | Re-scoped from `req.companyid` to a project parameter; ADMIN-gated on write |
| `PATCH /api/projects/:id` | `audittype` enum retired; framework enablement moves to the audit-config route |
| `GET /api/audit/evidence/:projectid` | **New** — evidence bundle per framework and date range |
| `POST /api/audit/exclusions` | **New** — record a not-applicable with reason + approver |
| `project.get_audit_config` (MCP) | No handler change; correctness follows from the re-key. Returns the new frameworks |

---

## Frontend Components

| Component | Change |
|-----------|--------|
| `AuditConfigPanel` | Moves to project context; gains NIST SSDF + ISO 27001; loses company-wide assumption |
| `ProjectWorkspacePage` | Three `audittype` bindings (view, edit form, quick-set) replaced by the framework set |
| `AdminDashboard`, `DashboardProjectGrid` | `audittype` display replaced with multi-framework badges |
| Evidence export view | **New** — select frameworks + range, render evidenced / gap / not-applicable |

---

## wxAI Commands

| Command | Change |
|---------|--------|
| `compliance-context.md` | Framework→rules-file table gains NIST SSDF + ISO 27001; loud failure when a file is absent |
| `compliance-scan.md` | Phase 0 framework list extended; per-framework gap checks added |
| `validateScope` | Compliance awareness per FR-013 |
| Kit distribution | Rules files added to both root-file allowlists so consumer projects receive them |

---

## Success Criteria

1. **SC-1 — Compliance context reaches the agent.** 100% of projects with ≥1 framework enabled return `complianceActive: true` from `project.get_audit_config`, against a verified baseline today of 0% because 0 of 21 configuration rows are reachable by the reader.
2. **SC-2 — No customer loses compliance in the migration.** Zero projects that had a framework enabled before migration — 21 via `audittype` plus every project owned by CPC Solutions and Quarkza Ltd. — end up with fewer frameworks after, verified by a before/after diff the migration itself emits. **Achieved 2026-07-27**: 24 project rows backfilled (21 from `audittype`, 3 from CPC fan-out), 0 regressions, idempotent on re-run.
3. **SC-3 — No unearned passes.** Zero controls render as satisfied without a traceable artifact. 100% of `pass` results are sampled on the first post-ship audit run and 20 passes per run thereafter, each confirmed to resolve to a file, a fence or commit, and a date. Any untraceable pass is a defect, not a finding.
4. **SC-4 — The crosswalk pays for itself.** Adding ISO 27001 to a project already running SOC 2 requires demonstrably sublinear new check definitions against the framework-siloed baseline of roughly 90, with zero re-execution of already-mapped checks. The hard figure is set once NIST SSDF lands.
5. **SC-5 — Consumer projects load their rules.** 100% of kit-provisioned projects with a framework enabled have the corresponding rules file resolvable at project root and `compliance-context` Step 2 completes without manual copying, with a missing file producing a visible error in 100% of cases rather than a silent "inactive".
6. **SC-6 — The bundle survives an auditor.** Every control in an exported PDF carries exactly one of evidenced, gap, or not-applicable, with 100% of not-applicable entries carrying both a written justification and a named approver, and every evidenced control traceable to its artifact without leaving the document.
7. **SC-7 — Own findings closed.** C-2, H-1, H-3 through H-9 and M-1 through M-12 all closed with linked remediation evidence, and the Statement of Applicability justifies 93 of 93 Annex A controls in or out, exportable to a third-party auditor without rework.
8. **SC-8 — No claim exceeds coverage.** Zero public or exported surfaces assert certification not held or describe a generated product as "certified" or "compliant", and per-framework coverage is quantified wherever a framework is named.

---

## Key Entities

| Entity | Role in this scope |
|--------|--------------------|
| `appauditconfiguration` | Per-project framework enablement and audit execution settings. Re-keyed from company to project |
| `complianceaudittasks` | The check definitions. Unchanged structurally; `framework` responsibility moves to the mapping table |
| `compliancecontrolmappings` | **New.** Maps one check to N framework/control pairs — the crosswalk |
| `compliancecontrolexclusions` | **New.** Immutable not-applicable justifications with named approver |
| `complianceoverride` | Existing, already `projectid`-keyed. Provides the reason + approver + immutable pattern |
| `auditresults` | Per-execution check outcomes; joined through the mapping to render per-framework reports |
| `companyprojects` | `audittype` retired; `securityclassification` cleansed of framework values |
| `mcpapitokens` | Gains a `role` column; `expiresat` becomes mandatory at issuance. Already project-scoped, hashed at rest, attributed via `issuedbyid`, usage-tracked via `lastusedat` |

---

## Constraints

1. **`AuditReportService` migrates last.** It is the only compliance path currently producing real output for customers. Its single-framework `COMPLIANCE_FILES[audittype]` lookup becomes a loop over enabled frameworks; until that lands, `audittype` stays readable.
2. **The migration touches live customer configuration.** CPC Solutions and Quarkza Ltd. have frameworks enabled today. Fan-out is chosen; the migration must emit its own before/after diff as the verification artifact.
3. **wxKanban covers the SDLC slice, and nothing beyond it.** ~100% of NIST SSDF, ~15 of ISO 27001's 93 Annex A controls, SOC 2's change-management and access clusters. ISMS, infrastructure, people and physical controls are permanently out of reach of this product.
4. **Certification cannot be shipped.** ISO 27001 requires an accredited certification body (Stage 1 + Stage 2, three-year cycle). NIST CSF/SSDF is self-attested. FIPS 140-3 is a separate cryptographic module validation.
5. **NIST SSDF lands before ISO 27001.** SC-4's real figure is set from SSDF's actual mapping cost, not the estimate.
6. **Score regression is expected and accepted.** The first audit run after FR-006 will score materially lower than the last run before it. That is the fix working. No transition or side-by-side mode.
7. **Kit distribution has two allowlists.** The rules files must be added to both.
8. **The kit must not gain database dependencies.** Export runs server-side; the kit consumes the result.
9. **Two orphan config rows are quarantined, not migrated.** `550e8400-e29b-41d4-a716-446655440000` (RFC example UUID, seed data with SOC2+HIPAA true) and `019c777f-a949-76b1-bf52-81e3c6391b63` (matches no company).

---

## Risks

| ID | Risk | Handling |
|----|------|----------|
| R-1 | **Band C cannot complete without MFA.** Zero MFA exists anywhere (verified by grep for TOTP/otplib/speakeasy/`mfaenabled` across `src` and `mcp-server`). `IA-2(1)` and `A.8.5` both mandate it | FR-017 brings MFA into this scope |
| R-2 | **EU data residency** caps the commercial value of the ISO work while production remains `us-east-2` | Explicitly out of scope; needs SCCs + transfer impact assessment, or an EU region |
| R-3 | **Fan-out may over-apply** frameworks to projects under CPC Solutions and Quarkza that never wanted them | Chosen over silent disablement because over-application is visible and reversible; expect support contact |
| R-4 | **SC-4's target is unvalidated** until SSDF lands | Held as direction, not gate |
| R-5 | **`validateScope` has no compliance awareness** — a compliance-enabled project could inject nothing and still score an A | FR-013 closes this |

---

## Integration Context

This scope must align with existing workflows and systems rather than standing alone:

- **SCOPE-013 (Audit Management)** owns `wxkanbandocuments` storage, `complianceaudittasks` extraction, `AuditEngineService`, `AuditReportService`, report generation and manual review. This scope aligns with 013 by repairing and extending it in place.
- **Three existing compliance paths must be merged, not paralleled** — `AuditReportService` (per-project, single-framework, working), `AuditEngineService` (per-company, hollow for HIPAA/GDPR), and the MCP reader (never matched).
- **`complianceoverride`** is already `projectid`-keyed with a `reason` + `overriddenby` immutable shape, and supplies the pattern for `compliancecontrolexclusions`.
- **`complianceaudittasks.controlreference`** already carries `CC6.1` and `Article 32` style values and accepts `PW.7.1` / `A.8.28` with no schema change.
- **`server/routes/projects.ts`** pins the framework allowlist as `z.enum(["GDPR","HIPAA","HITRUST","SOC2"])` and must widen.
- **The kit** maintains two separate root-file allowlists, both of which must receive the rules files, and must not gain `pg` or `drizzle` dependencies — export runs server-side.
- **PDF rendering** reuses the existing `@sparticuz/chromium` App Runner path.

---

## Open Questions

| # | Question | Blocking? |
|---|----------|-----------|
| Q1 | SC-4's crosswalk efficiency target is an estimate derived from the SOC 2 ↔ ISO overlap. The real figure is set once NIST SSDF lands — what threshold becomes the gate? | No — resolves during Band B |
| Q2 | On migration fan-out, do CPC Solutions and Quarkza get notified proactively, or discover the per-project change on next login? | No — but affects support load |
| Q3 | Does the CRA (Reg. EU 2024/2847) reporting obligation from 11 Sept 2026 apply to the VSIX extension as a "product with digital elements"? Needs legal input, not engineering judgement | No — separate track |
| Q4 | Should `securityclassification`, once cleansed, be repurposed as a genuine data-classification axis, or dropped entirely? | No — resolves in Band A |
| Q5 | What expiry horizon for new tokens — 365 days, or shorter for `admin`-adjacent scopes? | No — resolves in FR-018 |

**Resolved during authoring:** whether MFA extends to MCP tokens or web sessions only. **Decision: MFA gates token *issuance*, never token *use*.** Machine credentials inherit assurance from the MFA-verified session that minted them, and carry compensating controls instead (role scoping, bounded expiry, revocation, attribution, usage logging). No MFA prompt ever appears in a non-interactive path. See FR-017 and FR-018.

---

## Dependencies

- **SCOPE-013 (Audit Management)** owns the existing audit infrastructure. This scope repairs and extends it; FR-006 and FR-011 are explicitly remediation of 013's delivered behaviour. **013 is not superseded.**
- **SCOPE-093** owns `_wxAI/rules/compliance-context.md`, modified by FR-005.
- PDF export reuses the existing `@sparticuz/chromium` App Runner path.

---

## Notes

- Three independent compliance paths were discovered during investigation and must be merged rather than paralleled: `AuditReportService` (per-project, single-framework, works), `AuditEngineService` (per-company, hollow for 2 of 4), and the MCP reader (never matched). That history is recorded here so it is not re-derived.
- `complianceoverride` is already `projectid`-keyed with a `reason` + `overriddenby` immutable shape — confirming per-project was the intended grain elsewhere in the same feature. `appauditconfiguration` is the outlier.
- `complianceaudittasks.controlreference` is already a free-text varchar carrying `CC6.1` and `Article 32` style values, and accepts `PW.7.1` and `A.8.28` with no schema change.
- `server/routes/projects.ts` pins the framework allowlist as `z.enum(["GDPR","HIPAA","HITRUST","SOC2"])` and must widen.
- **The landing-page claim correction was applied out of band on 2026-07-27** during scope authoring: six locale files corrected ("SOC 2 Type II — Certified" → "SOC 2 Aligned", "HIPAA Compliant" → "HIPAA-Aware Controls", "third-party audits" claim removed), client rebuilt, bundle verified clean. **Not committed, not pushed.** FR-016 captures it as the baseline.
- **Amendment A (2026-10-18):** the NIST SP 800-53 Rev 5 SDLC slice is added as FR-019; the owner chose it over the full baseline or leaving 800-53 out. Written directly because `project.buildscope` Edit Mode ignores functional requirements (reported to the kit feedback queue).
- This scope was built through the interactive `buildscope` interview with section-by-section approval. The `project.buildscope` MCP tool has no parameter for user scenarios or functional requirements, so those sections could not be written by the tool and were materialized from the approved interview content. See the accompanying defect note.
