-- SPEC-113 / FR-010 — ISO/IEC 27001:2022 development-control rules document and catalog
--
-- Companion to 0014. Same reasoning: SPEC-112 Amendment A surfaced `iso27001enabled`
-- with no document and no controls behind it.
--
-- FR-010 is explicit that this is the SDLC slice only — approximately 15 of the 93
-- Annex A controls — and that the remainder must be "enumerated as out-of-tool, not
-- silently absent". The rules document therefore names what is NOT covered as
-- prominently as what is, so the output can be used as Statement of Applicability
-- input for the covered subset without implying more.
--
-- Controls carried, per FR-010: A.5.3, A.8.4, A.8.15, A.8.16, A.8.24, and A.8.25
-- through A.8.34.
--
-- Where an Annex A control is evidenced by the same code as a SOC 2 criterion or an
-- SSDF practice, the SAME verified checkpattern from 0011 is reused — the crosswalk
-- relationship recorded by hand ahead of FR-007's mapping table.
--
-- HEADING CONVENTION, and it is load-bearing: AuditReportService.extractChecklistItems
-- assigns an SDLC phase by substring-matching phase names against `##`/`###`/`####`
-- headings, and a `####` match OVERRIDES the `###` section it sits inside. Annex A's
-- own control names collide with that — "Secure Development Life Cycle" under the
-- Design phase re-tagged every following item as Development, and "Separation of
-- Development, Test and Production Environments" emptied the Deployment phase
-- entirely. Four `####` headings are therefore phrased to avoid the words
-- Requirements / Design / Development / Testing / Deployment / Maintenance unless the
-- control genuinely belongs to that phase. The official control names are preserved
-- verbatim in `complianceaudittasks.title`, which is what the crosswalk and the
-- evidence export cite; only the in-document heading is reworded. The parser itself is
-- shared with SOC 2, HIPAA, HITRUST and GDPR and is not changed here.
--
-- Idempotent.

BEGIN;

-- ─── 1. Rules document ────────────────────────────────────────────────────────
DELETE FROM complianceaudittasks WHERE framework = 'ISO27001';
DELETE FROM wxkanbandocuments
WHERE documenttype = 'compliance_framework' AND framework = 'ISO27001';

INSERT INTO wxkanbandocuments
  (documenttype, title, description, filename, framework, version, status, filecontent, filehash, effectivedate)
SELECT
  'compliance_framework',
  'ISO/IEC 27001:2022 — Development Controls (SDLC Slice)',
  'The Annex A controls of ISO/IEC 27001:2022 that bear on the software development lifecycle. Approximately 15 of 93 controls; the remainder are enumerated as out-of-tool.',
  'ISO27001_SDLC_Compliance_Rules.md',
  'ISO27001',
  '2022',
  'active',
  content,
  encode(sha256(content::bytea), 'hex'),
  CURRENT_DATE
FROM (SELECT $rules$# ISO/IEC 27001:2022 — Development Controls (SDLC Slice)

## Overview

ISO/IEC 27001:2022 specifies requirements for an Information Security Management
System. Annex A lists 93 controls across four themes: Organizational (A.5),
People (A.6), Physical (A.7) and Technological (A.8).

This document covers **only** the controls that bear on the software development
lifecycle — approximately 15 of the 93.

### What Is Covered

A.5.3, A.8.4, A.8.15, A.8.16, A.8.24, and A.8.25 through A.8.34.

### What Is NOT Covered — Enumerated, Not Silently Absent

The following are outside this tool entirely. Each requires evidence that does not
exist in a codebase, and certification depends on all of them:

- **The ISMS itself** — scope statement, risk assessment methodology, risk treatment
  plan, Statement of Applicability, management review, internal audit programme.
  Clauses 4 through 10 are the certifiable core and none of them are software.
- **Organizational controls (A.5, excluding A.5.3)** — policies, roles, supplier
  relationships, threat intelligence, classification, incident management process,
  legal and contractual requirements, continuity.
- **People controls (A.6)** — screening, terms of employment, awareness and training,
  disciplinary process, post-employment responsibilities.
- **Physical controls (A.7)** — perimeters, entry, equipment siting, secure disposal,
  clear desk and screen.
- **Technological controls outside the SDLC slice (A.8)** — endpoint devices,
  privileged access management, identity and authentication, capacity, malware
  protection, backup, redundancy, network security and segregation, web filtering,
  data leakage prevention, information deletion, masking.

A passing result here is evidence for the development-control subset and nothing more.
It is not certification, and it is not a Statement of Applicability.

## SDLC Requirements for ISO/IEC 27001:2022

### 1. Requirements Phase

#### A.8.26 — Application Security Requirements

- [ ] Information security requirements are identified and specified when developing or acquiring applications
- [ ] Requirements cover authentication, authorisation, integrity of transactions and protection of the data handled

### 2. Design Phase

#### A.8.25 — Secure SDLC Rules

- [ ] Rules for secure development are established and applied to the whole lifecycle
- [ ] Security is a stage of the lifecycle with defined entry and exit conditions, not an activity performed when time allows

#### A.8.27 — Secure System Architecture and Engineering Principles

- [ ] Principles for engineering secure systems are established, documented and applied
- [ ] The design applies least privilege, defence in depth and fail-safe defaults, and states where each is relied upon

#### A.5.3 — Segregation of Duties

- [ ] Conflicting duties and areas of responsibility are segregated
- [ ] No single identity can both author and approve the same change to production

### 3. Development Phase

#### A.8.28 — Secure Coding

- [ ] Secure coding principles are applied to software development
- [ ] Input is validated at the trust boundary and output is encoded for its destination context
- [ ] Errors returned to a caller do not disclose internal state

#### A.8.4 — Access to Source Code

- [ ] Read and write access to source code, development tools and libraries is appropriately managed
- [ ] Access follows least privilege and is reviewed on a defined cadence

#### A.8.24 — Use of Cryptography

- [ ] Rules for the effective use of cryptography, including key management, are defined and implemented
- [ ] Data at rest is protected with an authenticated cipher and data in transit is protected with current TLS

#### A.8.30 — Outsourced Software Engineering

- [ ] Outsourced development is directed, monitored and reviewed
- [ ] The same secure development rules apply to outsourced work as to in-house work

### 4. Testing Phase

#### A.8.29 — Security Acceptance Criteria

- [ ] Security testing processes are defined and implemented in the development lifecycle
- [ ] Acceptance criteria include security tests, and release is blocked on their failure

#### A.8.33 — Test Information

- [ ] Test information is appropriately selected, protected and managed
- [ ] Production data is not used in test environments unless irreversibly anonymised

#### A.8.34 — Protection of Information Systems During Audit Testing

- [ ] Audit tests on operational systems are planned and agreed between tester and management
- [ ] Audit activity that could affect availability is scheduled and scoped in advance

### 5. Deployment Phase

#### A.8.31 — Environment Separation

- [ ] Development, test and production environments are separated and secured
- [ ] Credentials valid in one environment are not valid in another

#### A.8.32 — Change Management

- [ ] Changes to information processing facilities and systems are subject to change management procedures
- [ ] Every production change carries a recorded approval distinct from its authorship

### 6. Maintenance Phase

#### A.8.15 — Logging

- [ ] Logs recording activities, exceptions, faults and other relevant events are produced, stored, protected and analysed
- [ ] Audit records are held where the acting user cannot alter them

#### A.8.16 — Monitoring Activities

- [ ] Networks, systems and applications are monitored for anomalous behaviour
- [ ] Appropriate actions are taken to evaluate potential security incidents

## Document Control

Standard: ISO/IEC 27001:2022, Annex A. Coverage: the SDLC slice, approximately 15 of
93 controls. This document supports development-control evidence and is not an
attestation of ISO/IEC 27001 certification.
$rules$::text AS content) src;

-- ─── 2. Control catalog ───────────────────────────────────────────────────────
INSERT INTO complianceaudittasks
  (documentid, framework, category, controlreference, priority, tasktype, title,
   description, requirementtext, checkmethod, checkpattern, applicablephases,
   applicablefiletypes, isautomated)
SELECT d.id, 'ISO27001', v.cat, v.ref, v.pri, v.ttype, v.title, v.descr, v.title,
       CASE WHEN v.pattern IS NULL THEN 'manual_review' ELSE 'regex_pattern' END,
       v.pattern, v.phases,
       CASE WHEN v.pattern IS NULL THEN NULL ELSE ARRAY['.ts', '.tsx'] END,
       v.pattern IS NOT NULL
FROM wxkanbandocuments d,
(VALUES
  ('A.5.3','Access Control','high','code_pattern','dutyassignment',ARRAY['design','development'],'Segregation of duties','Conflicting duties are separated so no single identity both authors and approves the same change to production.'),
  ('A.8.4','Access Control','high','code_pattern','require(Admin|Role|SysAdmin)',ARRAY['development','deployment'],'Access to source code','Read and write access to code, tools and libraries follows least privilege and is enforced at the point of access.'),
  ('A.8.15','Audit Logging','critical','code_pattern','companyauditlogs',ARRAY['development','testing','deployment'],'Logging','Events are recorded in a durable store the acting user cannot alter, and retained long enough to be analysed.'),
  ('A.8.16','Audit Logging','high','code_pattern','createLogger',ARRAY['development','deployment'],'Monitoring activities','Systems emit structured records that can be queried and alerted on, so anomalous behaviour is detectable rather than merely loggable.'),
  ('A.8.24','Encryption','critical','code_pattern','create(Cipher|Decipher)iv',ARRAY['design','development','deployment'],'Use of cryptography','Data at rest is protected with an authenticated cipher; keys come from a managed source and are rotatable.'),
  ('A.8.25','Secure Development','high','process',NULL,ARRAY['design','development','testing','deployment'],'Secure development life cycle','Secure development rules apply across the whole lifecycle, with security as a stage carrying entry and exit conditions.'),
  ('A.8.26','Secure Development','high','documentation',NULL,ARRAY['design'],'Application security requirements','Security requirements are specified with the functional ones, covering authentication, authorisation, transaction integrity and data protection.'),
  ('A.8.27','Secure Development','high','documentation',NULL,ARRAY['design'],'Secure system architecture and engineering principles','Least privilege, defence in depth and fail-safe defaults are stated in the design, and the design says where each is relied upon.'),
  ('A.8.28','Secure Development','critical','code_pattern','z\.(object|string|number|enum|array)\(',ARRAY['development'],'Secure coding','Input is validated at the trust boundary through a schema rather than trusted and coerced downstream.'),
  ('A.8.29','Testing','high','process',NULL,ARRAY['testing'],'Security testing in development and acceptance','Security tests are part of acceptance, and release is blocked on their failure rather than noted alongside it.'),
  ('A.8.30','Vendor Management','medium','process',NULL,ARRAY['development'],'Outsourced development','Outsourced work is directed, monitored and reviewed against the same secure development rules as in-house work.'),
  ('A.8.31','Deployment','high','process',NULL,ARRAY['development','testing','deployment'],'Separation of development, test and production environments','Environments are separated at the network and credential level; a credential valid in one is not valid in another.'),
  ('A.8.32','Change Management','critical','process',NULL,ARRAY['development','deployment'],'Change management','Every production change follows a defined path from request through approval to verification, with approval distinct from authorship.'),
  ('A.8.33','Privacy','high','process',NULL,ARRAY['testing'],'Test information','Test data is selected, protected and managed; production data is not used in lower environments unless irreversibly anonymised.'),
  ('A.8.34','Audit Preparation','medium','process',NULL,ARRAY['testing','deployment'],'Protection of information systems during audit testing','Audit tests against operational systems are planned and agreed in advance so assurance activity does not itself cause an incident.')
) AS v(ref, cat, pri, ttype, pattern, phases, title, descr)
WHERE d.documenttype = 'compliance_framework' AND d.framework = 'ISO27001';

-- ─── 3. Keep the document's extracted-task count truthful ────────────────────
UPDATE wxkanbandocuments d
SET extractedtasks = (SELECT count(*) FROM complianceaudittasks t WHERE t.documentid = d.id)
WHERE d.documenttype = 'compliance_framework' AND d.framework = 'ISO27001';

COMMIT;
