-- SPEC-113 / FR-009 — NIST SSDF (SP 800-218 v1.1) rules document and control catalog
--
-- SPEC-112 Amendment A added `nistssdfenabled` and surfaced NIST SSDF in the settings
-- panel, project.get_audit_config and project.get_compliance_context — with nothing
-- behind it: no wxkanbandocuments row, zero complianceaudittasks rows. A framework a
-- customer can switch on which then does nothing is worse than one that is absent,
-- because the toggle itself reads as coverage.
--
-- Catalog uses the existing single `framework` column rather than SPEC-113 FR-007's
-- `compliancecontrolmappings`, which is not built. FR-007 already requires that
-- "existing complianceaudittasks rows are mapped, not rewritten" — these are those
-- rows. Where an SSDF practice is evidenced by the same code as a SOC 2 criterion, the
-- SAME verified checkpattern is reused, so the crosswalk will map rows that already
-- agree rather than reconcile ones that do not.
--
-- Patterns are only those already proven against this repository by 0011. No new
-- pattern is introduced here without that evidence, and every practice that cannot be
-- honestly evidenced by presence is isautomated = false.
--
-- Coverage boundary (FR-012): the SDLC slice only. PO practices that are organisational
-- rather than code-observable are present as manual controls, not omitted, so the gap
-- is visible rather than silent.
--
-- Idempotent: content is upserted on (documenttype, framework, filename) and control
-- rows are deleted-then-inserted for this framework only.

BEGIN;

-- ─── 1. Rules document ────────────────────────────────────────────────────────
DELETE FROM complianceaudittasks WHERE framework = 'NISTSSDF';
DELETE FROM wxkanbandocuments
WHERE documenttype = 'compliance_framework' AND framework = 'NISTSSDF';

INSERT INTO wxkanbandocuments
  (documenttype, title, description, filename, framework, version, status, filecontent, filehash, effectivedate)
SELECT
  'compliance_framework',
  'NIST SSDF (SP 800-218) Secure Software Development Framework',
  'NIST Secure Software Development Framework v1.1 — SDLC practices for Prepare the Organization, Protect the Software, Produce Well-Secured Software, and Respond to Vulnerabilities.',
  'NISTSSDF_SDLC_Compliance_Rules.md',
  'NISTSSDF',
  '1.1',
  'active',
  content,
  encode(sha256(content::bytea), 'hex'),
  CURRENT_DATE
FROM (SELECT $rules$# NIST SSDF (SP 800-218 v1.1) — Secure Software Development Framework

## Overview

The Secure Software Development Framework describes a set of practices a producer
follows to reduce the number of vulnerabilities in released software, reduce the impact
of those not caught, and address root causes so recurrence is prevented.

SSDF is deliberately outcome-based rather than prescriptive: it names *what* must be
achieved, not the tool that achieves it. It is organised into four practice groups.

### Practice Groups

- **PO — Prepare the Organization.** People, process and technology are ready to
  develop secure software at the organisation level.
- **PS — Protect the Software.** All components are protected from tampering and
  unauthorised access.
- **PW — Produce Well-Secured Software.** Software has minimal security vulnerabilities
  on release.
- **RV — Respond to Vulnerabilities.** Residual vulnerabilities are identified and
  remediated, and root causes are addressed.

### Coverage Boundary

This tool covers the SDLC slice of SSDF: the practices observable in a software
development lifecycle it participates in. Organisational practices — role definition,
training programmes, toolchain procurement, supplier agreements — are present as manual
controls because evidence for them lives outside the codebase. Nothing here constitutes
an attestation of SSDF conformance.

## SDLC Requirements for NIST SSDF

### 1. Requirements Phase

#### PO.1 — Define Security Requirements for Software Development

- [ ] PO.1.1 Security requirements for software development are identified and documented
- [ ] PO.1.2 Security requirements are communicated to all third parties who provide commercial software components
- [ ] PO.1.3 Requirements are reviewed and updated on a defined cadence and on material change

#### PO.2 — Implement Roles and Responsibilities

- [ ] PO.2.1 Roles and responsibilities for the SDLC are defined, with separation of duties where a single actor could both introduce and approve a change
- [ ] PO.2.2 Personnel receive role-appropriate secure development training
- [ ] PO.2.3 Management commitment to secure development is documented and communicated

#### PW.1 — Design Software to Meet Security Requirements

- [ ] PW.1.1 Risk models are used to inform design — threat modelling, attack surface analysis, or equivalent
- [ ] PW.1.2 Standardised security features are used in preference to bespoke implementations
- [ ] PW.1.3 Design decisions and their security rationale are recorded

### 2. Design Phase

#### PO.3 — Implement Supporting Toolchains

- [ ] PO.3.1 Toolchain components are selected and deployed to automate secure development practices
- [ ] PO.3.2 Toolchains produce artifacts and logs that support later evidence gathering
- [ ] PO.3.3 Toolchain configuration is itself managed and protected

#### PO.5 — Implement and Maintain Secure Environments

- [ ] PO.5.1 Development, build, test and production environments are separated and each is protected
- [ ] PO.5.2 Endpoints used for software development are hardened and monitored

#### PW.2 — Review the Software Design

- [ ] PW.2.1 Design is reviewed by a qualified party other than the author to confirm it meets the security requirements and addresses the identified risks

### 3. Development Phase

#### PS.1 — Protect All Forms of Code from Unauthorized Access and Tampering

- [ ] PS.1.1 Access to source code and configuration is restricted to authorised actors, with least privilege enforced at the point of access

#### PS.2 — Provide a Mechanism for Verifying Software Release Integrity

- [ ] PS.2.1 Releases carry an integrity mechanism — signature or verified checksum — that a consumer can validate

#### PS.3 — Archive and Protect Each Software Release

- [ ] PS.3.1 Each release and its provenance data are archived and protected for the required retention period
- [ ] PS.3.2 Provenance data for all components is collected and made available

#### PW.4 — Reuse Existing, Well-Secured Software

- [ ] PW.4.1 Well-secured components are acquired and reused in preference to writing new code
- [ ] PW.4.2 Well-secured components created in-house are made available for reuse
- [ ] PW.4.4 The security of all third-party components is verified before use and monitored thereafter

#### PW.5 — Create Source Code by Adhering to Secure Coding Practices

- [ ] PW.5.1 Source code adheres to secure coding practices — input is validated at the boundary, output is encoded for its context, and errors do not disclose internal state

#### PW.6 — Configure the Compilation, Interpreter and Build Processes

- [ ] PW.6.1 Compiler, interpreter and build tools are configured to improve executable security
- [ ] PW.6.2 Those settings are applied consistently and reproducibly across builds

#### PW.7 — Review and/or Analyze Human-Readable Code

- [ ] PW.7.1 Code review or analysis criteria are defined, and reviewers are equipped to apply them
- [ ] PW.7.2 Human-readable code is reviewed or analysed against those criteria before release

### 4. Testing Phase

#### PW.8 — Test Executable Code

- [ ] PW.8.1 Testing criteria for executable code are defined
- [ ] PW.8.2 Executable code is tested against those criteria — functional, negative and security cases

#### PW.9 — Configure Software to Have Secure Settings by Default

- [ ] PW.9.1 Secure settings are defined as the default configuration, including session and transport protection
- [ ] PW.9.2 The security implications of changing a default are documented for the operator

### 5. Deployment Phase

#### PO.4 — Define and Use Criteria for Software Security Checks

- [ ] PO.4.1 Criteria for software security checks are defined and gathered as part of the lifecycle
- [ ] PO.4.2 Information is gathered and safeguarded to support the security-check criteria

#### RV.1 — Identify and Confirm Vulnerabilities on an Ongoing Basis

- [ ] RV.1.1 Vulnerability information is gathered continuously from all available sources
- [ ] RV.1.2 A policy exists for addressing reports of vulnerabilities from any source
- [ ] RV.1.3 Released software is reviewed for previously undetected vulnerabilities on a defined cadence

### 6. Maintenance Phase

#### RV.2 — Assess, Prioritize and Remediate Vulnerabilities

- [ ] RV.2.1 Each vulnerability is analysed to determine severity, exploitability and required response
- [ ] RV.2.2 Remediation is planned, executed and verified

#### RV.3 — Analyze Vulnerabilities to Identify Their Root Causes

- [ ] RV.3.1 Root cause analysis is performed for each vulnerability
- [ ] RV.3.2 Root causes are reviewed for classes of vulnerability across the codebase, not only the reported instance
- [ ] RV.3.3 The SDLC is adjusted to prevent recurrence of the identified root cause
- [ ] RV.3.4 Recurrence prevention is reviewed for effectiveness

## Document Control

Framework: NIST SP 800-218 v1.1. Note PW.3 does not exist in v1.1 — third-party
software verification is covered by PW.4.4 and PO.1.2.

Coverage: SDLC slice only. This document supports development-practice evidence and is
not an attestation of SSDF conformance.
$rules$::text AS content) src;

-- ─── 2. Control catalog ───────────────────────────────────────────────────────
INSERT INTO complianceaudittasks
  (documentid, framework, category, controlreference, priority, tasktype, title,
   description, requirementtext, checkmethod, checkpattern, applicablephases,
   applicablefiletypes, isautomated)
SELECT d.id, 'NISTSSDF', v.cat, v.ref, v.pri, v.ttype, v.title, v.descr, v.title,
       CASE WHEN v.pattern IS NULL THEN 'manual_review' ELSE 'regex_pattern' END,
       v.pattern, v.phases,
       CASE WHEN v.pattern IS NULL THEN NULL ELSE ARRAY['.ts', '.tsx'] END,
       v.pattern IS NOT NULL
FROM wxkanbandocuments d,
(VALUES
  -- PO — Prepare the Organization
  ('PO.1.1','Governance','high','documentation',NULL,ARRAY['design'],'Security requirements for development are defined','Security requirements are written down before development starts, so they are testable rather than assumed.'),
  ('PO.1.2','Vendor Management','medium','process',NULL,ARRAY['design'],'Security requirements communicated to third-party suppliers','A supplier who is not told the requirement cannot meet it; this is the control that makes PW.4.4 enforceable.'),
  ('PO.1.3','Governance','medium','process',NULL,ARRAY['design','deployment'],'Requirements reviewed and updated on a cadence','Requirements that are never revisited drift out of alignment with the threat they were written against.'),
  ('PO.2.1','Access Control','high','code_pattern','dutyassignment',ARRAY['design','development'],'Roles and responsibilities defined with separation of duties','No single identity both authors and approves the same change.'),
  ('PO.2.2','Governance','medium','process',NULL,ARRAY['design','development'],'Role-appropriate secure development training','Training is role-specific and attendance is recorded; generic awareness training does not satisfy this.'),
  ('PO.2.3','Governance','low','documentation',NULL,ARRAY['design'],'Management commitment documented and communicated','Secure development competes with delivery pressure; documented commitment is what a team points at when it does.'),
  ('PO.3.1','Testing','high','configuration',NULL,ARRAY['design','development'],'Toolchain automates secure development practices','Practices enforced by a tool survive schedule pressure; practices enforced by intention do not.'),
  ('PO.3.2','Audit Logging','high','code_pattern','createLogger',ARRAY['development','testing','deployment'],'Toolchain produces artifacts and logs supporting evidence','Evidence must be a by-product of the process, not something assembled retrospectively for an auditor.'),
  ('PO.3.3','Deployment','medium','configuration',NULL,ARRAY['deployment'],'Toolchain configuration is managed and protected','A build tool whose configuration anyone can change is not a control.'),
  ('PO.4.1','Testing','medium','process',NULL,ARRAY['testing','deployment'],'Criteria for software security checks are defined','Without defined criteria, a security check reports activity rather than a verdict.'),
  ('PO.4.2','Testing','medium','process',NULL,ARRAY['testing','deployment'],'Information gathered and safeguarded to support security checks','The data a check depends on is itself protected, or the check can be defeated by editing its input.'),
  ('PO.5.1','Deployment','high','process',NULL,ARRAY['development','testing','deployment'],'Development, build, test and production environments are separated','Separation is at the network and credential level, not by naming convention.'),
  ('PO.5.2','Deployment','medium','process',NULL,ARRAY['development'],'Development endpoints are hardened and monitored','The developer workstation is part of the supply chain and is frequently its weakest link.'),

  -- PS — Protect the Software
  ('PS.1.1','Access Control','critical','code_pattern','require(Admin|Role|SysAdmin)',ARRAY['development','deployment'],'Access to code and configuration restricted to authorised actors','Privileged paths are gated by an explicit role guard rather than assuming an authenticated caller is entitled.'),
  ('PS.2.1','Deployment','high','process',NULL,ARRAY['deployment'],'Release integrity is verifiable by the consumer','A signature or verified checksum a consumer can validate; without it, substitution in transit is undetectable.'),
  ('PS.3.1','Deployment','medium','process',NULL,ARRAY['deployment'],'Each release and its provenance are archived and protected','Retention long enough to support rollback and investigation, and protected against alteration.'),
  ('PS.3.2','Deployment','medium','process',NULL,ARRAY['deployment'],'Provenance data for all components is collected','You cannot answer "are we affected" for a component you never recorded shipping.'),

  -- PW — Produce Well-Secured Software
  ('PW.1.1','Risk Management','high','process',NULL,ARRAY['design'],'Risk models inform design','New capability is assessed for how it could be abused before it is built, not after it ships.'),
  ('PW.1.2','Secure Development','medium','process',NULL,ARRAY['design','development'],'Standardised security features preferred over bespoke ones','Hand-rolled cryptography and session handling are where this control earns its place.'),
  ('PW.1.3','Secure Development','low','documentation',NULL,ARRAY['design'],'Design decisions and security rationale are recorded','A decision without recorded rationale is re-litigated or silently reversed.'),
  ('PW.2.1','Change Management','high','process',NULL,ARRAY['design'],'Design reviewed by a qualified party other than the author','Independence is the control; a self-review confirms the author''s own assumptions.'),
  ('PW.4.1','Secure Development','low','process',NULL,ARRAY['development'],'Well-secured components reused rather than rewritten','Reuse concentrates scrutiny on fewer implementations.'),
  ('PW.4.2','Secure Development','low','process',NULL,ARRAY['development'],'In-house secure components made available for reuse','Otherwise each team solves the same problem with varying success.'),
  ('PW.4.4','Vendor Management','high','process',NULL,ARRAY['development','deployment'],'Third-party component security verified before use and monitored after','Verification at adoption is necessary but not sufficient — advisories arrive later.'),
  ('PW.5.1','Secure Development','critical','code_pattern','z\.(object|string|number|enum|array)\(',ARRAY['development'],'Source code adheres to secure coding practices','External input is parsed through a schema at the boundary rather than trusted and coerced downstream.'),
  ('PW.6.1','Deployment','medium','configuration',NULL,ARRAY['development','deployment'],'Build tools configured to improve executable security','Compiler and bundler hardening options are enabled deliberately rather than left at default.'),
  ('PW.6.2','Deployment','medium','configuration',NULL,ARRAY['deployment'],'Build settings applied consistently and reproducibly','A build that cannot be reproduced cannot be verified.'),
  ('PW.7.1','Change Management','high','process',NULL,ARRAY['development'],'Code review criteria are defined and reviewers equipped','Review without criteria finds what the reviewer happens to notice.'),
  ('PW.7.2','Change Management','critical','process',NULL,ARRAY['development'],'Human-readable code is reviewed or analysed before release','Every change is reviewed by someone other than its author, with security explicitly in scope.'),
  ('PW.8.1','Testing','high','process',NULL,ARRAY['testing'],'Testing criteria for executable code are defined','Criteria written in advance; otherwise passing means "nothing obvious broke".'),
  ('PW.8.2','Testing','high','process',NULL,ARRAY['testing'],'Executable code is tested against the defined criteria','Includes negative and security cases, not only the happy path.'),
  ('PW.9.1','Secure Development','high','code_pattern','httpOnly',ARRAY['development','deployment'],'Secure settings are the default configuration','Session material is held in cookies inaccessible to script; the secure option is the one you get without asking.'),
  ('PW.9.2','Secure Development','medium','documentation',NULL,ARRAY['deployment'],'Security implications of changing a default are documented','An operator who weakens a setting should not have to guess what they gave up.'),

  -- RV — Respond to Vulnerabilities
  ('RV.1.1','Testing','high','process',NULL,ARRAY['deployment'],'Vulnerability information gathered continuously','Advisories arrive between releases; monitoring only at release boundaries misses the window that matters.'),
  ('RV.1.2','Incident Management','high','documentation',NULL,ARRAY['deployment'],'Policy exists for addressing vulnerability reports','Including reports from outside the organisation, which arrive without warning and often publicly.'),
  ('RV.1.3','Testing','medium','process',NULL,ARRAY['deployment'],'Released software reviewed for previously undetected vulnerabilities','What was clean at release is not clean indefinitely.'),
  ('RV.2.1','Incident Management','high','process',NULL,ARRAY['deployment'],'Each vulnerability is assessed and prioritised','Severity, exploitability and required response determined per finding rather than by blanket rule.'),
  ('RV.2.2','Incident Management','high','process',NULL,ARRAY['deployment'],'Remediation is planned, executed and verified','Verification is the step most often skipped, and the one that makes the other two meaningful.'),
  ('RV.3.1','Incident Management','medium','process',NULL,ARRAY['deployment'],'Root cause analysis performed for each vulnerability','The reported instance is a symptom; the root cause is what recurs.'),
  ('RV.3.2','Incident Management','medium','process',NULL,ARRAY['deployment'],'Root causes reviewed for classes across the codebase','If one instance of a pattern was exploitable, the others are candidates.'),
  ('RV.3.3','Governance','medium','process',NULL,ARRAY['deployment'],'SDLC adjusted to prevent recurrence','A fix that does not change the process guarantees the next occurrence.'),
  ('RV.3.4','Governance','low','process',NULL,ARRAY['deployment'],'Recurrence prevention reviewed for effectiveness','A control adopted and never measured is an assumption.')
) AS v(ref, cat, pri, ttype, pattern, phases, title, descr)
WHERE d.documenttype = 'compliance_framework' AND d.framework = 'NISTSSDF';

-- ─── 3. Keep the document's extracted-task count truthful ────────────────────
UPDATE wxkanbandocuments d
SET extractedtasks = (SELECT count(*) FROM complianceaudittasks t WHERE t.documentid = d.id)
WHERE d.documenttype = 'compliance_framework' AND d.framework = 'NISTSSDF';

COMMIT;
