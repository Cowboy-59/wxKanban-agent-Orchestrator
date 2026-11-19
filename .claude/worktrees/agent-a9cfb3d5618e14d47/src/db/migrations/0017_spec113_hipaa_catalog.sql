-- SPEC-113 / FR-011 (part 1 of 2) — HIPAA Security Rule control catalog
--
-- HIPAA had 414 rows and none of them was a control: every one was a checklist line
-- lifted by the markdown parser, with description equal to title and zero of the 414
-- carrying a control reference. 0016 stopped them claiming automation they could not
-- perform; this replaces them with an authored catalog anchored to the actual
-- regulation, so a citation in an audit report resolves to 45 CFR rather than to a
-- bullet point.
--
-- Scope is the Security Rule (45 CFR §164.308/310/312/314/316) plus the Breach
-- Notification Rule, which is where an SDLC can produce evidence. The Privacy Rule's
-- individual-rights machinery is process and contract, not code, and is carried as
-- manual controls rather than dropped — a missing control is a gap, an absent one is
-- invisible.
--
-- Physical safeguards (§164.310) are largely out of tool. The two that a codebase can
-- speak to — workstation use and device/media disposal — are retained as manual; the
-- facility controls are named in the rules document as out-of-tool.
--
-- PATTERNS. Only patterns verified against this repository are used, and every one was
-- run through evaluateRegexEvidence before being written here. Two candidates were
-- REJECTED for being exactly the false-pass class FR-006 removed:
--   * `consent` — matches `prompt: "consent"` in the Jira OAuth adapter and a regex
--     literal in AuditTaskService. Neither is GDPR/HIPAA consent.
--   * `secure:\s*true` — no occurrence in the tree, and `httpOnly` is session
--     protection, not transmission security. §164.312(e) stays manual rather than
--     borrowing a pattern that proves something adjacent.
--   * bare `bcrypt` — matched `"bcrypt-Hashing mit JWT-Tokens…"` in the GERMAN LOCALE
--     BUNDLE before it reached src/server/lib/password.ts, and reported that string as
--     evidence with a file and line. Narrowed to `bcrypt\.(hash|compare)`, the call
--     itself, which cannot appear in prose. This was the third false pass traced to a
--     translation bundle, so isScannableSource now excludes i18n/locales/ outright.
--
-- The reused patterns are deliberately identical to their SOC 2 / SSDF / ISO
-- equivalents where the same code evidences the control — the crosswalk relationship
-- recorded by hand ahead of FR-007's mapping table.
--
-- Idempotent.

BEGIN;

DELETE FROM complianceaudittasks WHERE framework = 'HIPAA';

INSERT INTO complianceaudittasks
  (documentid, framework, category, controlreference, priority, tasktype, title,
   description, requirementtext, checkmethod, checkpattern, applicablephases,
   applicablefiletypes, isautomated)
SELECT d.id, 'HIPAA', v.cat, v.ref, v.pri, v.ttype, v.title, v.descr, v.title,
       CASE WHEN v.pattern IS NULL THEN 'manual_review' ELSE 'regex_pattern' END,
       v.pattern, v.phases,
       CASE WHEN v.pattern IS NULL THEN NULL ELSE ARRAY['.ts', '.tsx'] END,
       v.pattern IS NOT NULL
FROM (
  SELECT id FROM wxkanbandocuments
  WHERE documenttype = 'compliance_framework' AND framework = 'HIPAA' AND status = 'active'
  ORDER BY length(coalesce(filecontent, '')) DESC LIMIT 1
) d,
(VALUES
  -- Administrative Safeguards — 45 CFR §164.308
  ('164.308(a)(1)(i)','Risk Management','critical','process',NULL,ARRAY['design'],'Security Management Process','Policies and procedures to prevent, detect, contain and correct security violations exist as a standing process rather than a response to the last incident.'),
  ('164.308(a)(1)(ii)(A)','Risk Management','critical','documentation',NULL,ARRAY['design'],'Risk Analysis','An accurate and thorough assessment of the potential risks to the confidentiality, integrity and availability of ePHI the system holds.'),
  ('164.308(a)(1)(ii)(B)','Risk Management','critical','process',NULL,ARRAY['design','deployment'],'Risk Management','Security measures are implemented sufficient to reduce risks to a reasonable and appropriate level, and that level is stated rather than assumed.'),
  ('164.308(a)(1)(ii)(C)','Governance','medium','process',NULL,ARRAY['deployment'],'Sanction Policy','Sanctions are applied against workforce members who fail to comply with the security policies.'),
  ('164.308(a)(1)(ii)(D)','Audit Logging','critical','code_pattern','companyauditlogs',ARRAY['development','testing','deployment'],'Information System Activity Review','Records of system activity — audit logs, access reports, incident tracking — are produced and reviewed regularly.'),
  ('164.308(a)(2)','Governance','high','documentation',NULL,ARRAY['design'],'Assigned Security Responsibility','A named security official is responsible for developing and implementing the required policies and procedures.'),
  ('164.308(a)(3)(i)','Access Control','high','process',NULL,ARRAY['development','deployment'],'Workforce Security','Only workforce members who need ePHI to do their jobs have access to it, and those who do not are prevented from obtaining it.'),
  ('164.308(a)(3)(ii)(A)','Access Control','high','process',NULL,ARRAY['deployment'],'Authorization and/or Supervision','Workforce members working with ePHI are authorised or supervised; access is granted deliberately rather than inherited.'),
  ('164.308(a)(3)(ii)(C)','Access Control','high','process',NULL,ARRAY['deployment'],'Termination Procedures','Access to ePHI ends when employment ends. The gap between departure and revocation is the exposure this control closes.'),
  ('164.308(a)(4)(i)','Access Control','high','process',NULL,ARRAY['design','development'],'Information Access Management','Policies for authorising access to ePHI, consistent with the minimum necessary standard.'),
  ('164.308(a)(4)(ii)(B)','Access Control','critical','code_pattern','require(Admin|Role|SysAdmin)',ARRAY['development','deployment'],'Access Authorization','Access to ePHI is granted through an explicit authorisation mechanism rather than assumed from authentication.'),
  ('164.308(a)(4)(ii)(C)','Access Control','high','process',NULL,ARRAY['deployment'],'Access Establishment and Modification','Access rights are established, documented, reviewed and modified against a defined process.'),
  ('164.308(a)(5)(i)','Governance','medium','process',NULL,ARRAY['development'],'Security Awareness and Training','A security awareness and training programme covers all workforce members, including management.'),
  ('164.308(a)(5)(ii)(B)','Testing','high','process',NULL,ARRAY['deployment'],'Protection from Malicious Software','Procedures for guarding against, detecting and reporting malicious software.'),
  ('164.308(a)(5)(ii)(C)','Audit Logging','high','code_pattern','companyauditlogs',ARRAY['development','deployment'],'Log-in Monitoring','Login attempts and discrepancies are recorded and reviewable.'),
  ('164.308(a)(5)(ii)(D)','Access Control','critical','code_pattern','bcrypt\.(hash|compare)',ARRAY['development'],'Password Management','Procedures for creating, changing and safeguarding passwords. Credentials are stored under a deliberate one-way hash, never recoverable.'),
  ('164.308(a)(6)(i)','Incident Management','critical','documentation',NULL,ARRAY['design','deployment'],'Security Incident Procedures','Policies and procedures to address security incidents exist before one occurs.'),
  ('164.308(a)(6)(ii)','Incident Management','critical','process',NULL,ARRAY['deployment'],'Response and Reporting','Suspected or known incidents are identified and responded to, harmful effects mitigated to the extent practicable, and outcomes documented.'),
  ('164.308(a)(7)(i)','Business Continuity','high','documentation',NULL,ARRAY['design','deployment'],'Contingency Plan','Policies for responding to an emergency that damages systems containing ePHI.'),
  ('164.308(a)(7)(ii)(A)','Business Continuity','critical','process',NULL,ARRAY['deployment'],'Data Backup Plan','Retrievable exact copies of ePHI can be created and recovered. Retrievability is the control; the backup existing is not.'),
  ('164.308(a)(7)(ii)(B)','Business Continuity','high','process',NULL,ARRAY['deployment'],'Disaster Recovery Plan','Procedures to restore any loss of data.'),
  ('164.308(a)(7)(ii)(C)','Business Continuity','medium','process',NULL,ARRAY['deployment'],'Emergency Mode Operation Plan','Critical business processes protecting ePHI continue while operating in emergency mode.'),
  ('164.308(a)(7)(ii)(D)','Business Continuity','medium','process',NULL,ARRAY['testing'],'Testing and Revision Procedures','Contingency plans are periodically tested and revised. An untested recovery plan is an assumption.'),
  ('164.308(a)(8)','Testing','high','process',NULL,ARRAY['testing','deployment'],'Evaluation','Periodic technical and non-technical evaluation establishes the extent to which security policies still meet the requirements.'),

  -- Physical Safeguards — 45 CFR §164.310 (mostly out of the SDLC slice)
  ('164.310(b)','Deployment','medium','process',NULL,ARRAY['deployment'],'Workstation Use','The functions to be performed and the physical surroundings of workstations that access ePHI are specified.'),
  ('164.310(c)','Deployment','medium','process',NULL,ARRAY['deployment'],'Workstation Security','Physical safeguards restrict workstation access to authorised users.'),
  ('164.310(d)(2)(i)','Privacy','high','process',NULL,ARRAY['deployment'],'Disposal','ePHI and the hardware or media holding it are disposed of so the data cannot be reconstructed.'),
  ('164.310(d)(2)(ii)','Privacy','high','process',NULL,ARRAY['deployment'],'Media Re-use','ePHI is removed from electronic media before the media is made available for re-use.'),

  -- Technical Safeguards — 45 CFR §164.312 (the SDLC core)
  ('164.312(a)(1)','Access Control','critical','code_pattern','require(Admin|Role|SysAdmin)',ARRAY['development','deployment'],'Access Control','Technical policies permit access to ePHI only to those persons or software programs granted access rights under §164.308(a)(4).'),
  ('164.312(a)(2)(i)','Access Control','high','process',NULL,ARRAY['development'],'Unique User Identification','Each user has a unique name or number for identifying and tracking identity. Shared accounts defeat every downstream audit control.'),
  ('164.312(a)(2)(ii)','Access Control','medium','process',NULL,ARRAY['deployment'],'Emergency Access Procedure','Procedures for obtaining necessary ePHI during an emergency, without disabling the controls that protect it the rest of the time.'),
  ('164.312(a)(2)(iii)','Access Control','high','code_pattern','expiresIn',ARRAY['development'],'Automatic Logoff','Electronic sessions terminate after a predetermined time of inactivity.'),
  ('164.312(a)(2)(iv)','Encryption','critical','code_pattern','create(Cipher|Decipher)iv',ARRAY['development','deployment'],'Encryption and Decryption','ePHI is encrypted and decrypted through a deliberate mechanism using an authenticated cipher.'),
  ('164.312(b)','Audit Logging','critical','code_pattern','companyauditlogs',ARRAY['development','testing','deployment'],'Audit Controls','Hardware, software and procedural mechanisms record and examine activity in systems containing ePHI.'),
  ('164.312(c)(1)','Secure Development','high','process',NULL,ARRAY['development'],'Integrity','ePHI is protected from improper alteration or destruction.'),
  ('164.312(c)(2)','Secure Development','medium','process',NULL,ARRAY['development'],'Mechanism to Authenticate ePHI','A mechanism corroborates that ePHI has not been altered or destroyed in an unauthorised manner.'),
  ('164.312(d)','Access Control','critical','code_pattern','bcrypt\.(hash|compare)',ARRAY['development'],'Person or Entity Authentication','The identity of a person or entity seeking access is verified before access is granted.'),
  ('164.312(e)(1)','Encryption','critical','process',NULL,ARRAY['deployment'],'Transmission Security','ePHI transmitted over a network is guarded against unauthorised access. Verified in transport configuration, not application source — no code pattern proves TLS is enforced end to end.'),
  ('164.312(e)(2)(i)','Encryption','high','process',NULL,ARRAY['deployment'],'Integrity Controls','Transmitted ePHI is not improperly modified without detection.'),
  ('164.312(e)(2)(ii)','Encryption','critical','process',NULL,ARRAY['deployment'],'Transmission Encryption','ePHI is encrypted whenever deemed appropriate in transit.'),

  -- Organizational Requirements and Documentation — §164.314 / §164.316
  ('164.314(a)(1)','Vendor Management','high','process',NULL,ARRAY['design','deployment'],'Business Associate Contracts','A contract obtains satisfactory assurances that a business associate will appropriately safeguard ePHI.'),
  ('164.316(a)','Governance','medium','documentation',NULL,ARRAY['design'],'Policies and Procedures','Reasonable and appropriate policies and procedures are implemented to comply with the Security Rule.'),
  ('164.316(b)(1)','Governance','medium','documentation',NULL,ARRAY['deployment'],'Documentation','Policies, procedures, actions, activities and assessments are maintained in written or electronic form.'),
  ('164.316(b)(2)(i)','Governance','medium','process',NULL,ARRAY['deployment'],'Documentation Time Limit','Documentation is retained for six years from creation or last effective date, whichever is later.'),
  ('164.316(b)(2)(iii)','Governance','low','process',NULL,ARRAY['deployment'],'Documentation Updates','Documentation is reviewed periodically and updated in response to environmental or operational change.'),

  -- Breach Notification Rule — 45 CFR §§164.400-414
  ('164.404','Incident Management','critical','process',NULL,ARRAY['deployment'],'Notification to Individuals','Affected individuals are notified without unreasonable delay and no later than 60 days after discovery of a breach.'),
  ('164.408','Incident Management','high','process',NULL,ARRAY['deployment'],'Notification to the Secretary','HHS is notified of breaches, immediately for 500 or more individuals and annually below that threshold.'),
  ('164.410','Incident Management','high','process',NULL,ARRAY['deployment'],'Notification by a Business Associate','A business associate notifies the covered entity of a breach without unreasonable delay and no later than 60 days after discovery.')
) AS v(ref, cat, pri, ttype, pattern, phases, title, descr);

UPDATE wxkanbandocuments d
SET extractedtasks = (SELECT count(*) FROM complianceaudittasks t WHERE t.documentid = d.id)
WHERE d.documenttype = 'compliance_framework' AND d.framework = 'HIPAA';

COMMIT;
