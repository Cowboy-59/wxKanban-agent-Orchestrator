-- SPEC-113 / FR-011 (part 2 of 2) — GDPR control catalog
--
-- Companion to 0017. GDPR had 381 parser-derived rows, all stubs, 6 of 381 carrying a
-- control reference. Replaced with an authored catalog anchored to Articles.
--
-- FR-011 requires coverage of lawful basis, minimisation, subject rights, retention and
-- transfer. All five are present: Art. 6 and 9 (basis), Art. 5(1)(c) and 25(2)
-- (minimisation and by-default), Art. 15 through 22 (rights), Art. 5(1)(e) (storage
-- limitation), and Art. 44 through 49 (transfer).
--
-- ONE CHECK IS EXPECTED TO FAIL, AND THAT IS THE POINT. Art. 5(1)(c) is checked for
-- pseudonymisation or anonymisation and nothing in this tree does either — the pattern
-- returns absent, which is a real finding, not a defective check. It is the same shape
-- as the SOC 2 MFA checks in 0011: a control whose absence is worth reporting is worth
-- checking for.
--
-- REJECTED PATTERN, recorded so it is not reintroduced: `consent` for Art. 7. It
-- matches `prompt: "consent"` in the Jira OAuth adapter and a regex literal in
-- AuditTaskService. Neither has anything to do with a data subject consenting to
-- processing. That is the false-pass class FR-006 exists to prevent, so Art. 7 is
-- manual.
--
-- Reused patterns are identical to their SOC 2 / SSDF / ISO / HIPAA equivalents where
-- the same code evidences the control — crosswalk by hand, ahead of FR-007.
--
-- Idempotent.

BEGIN;

DELETE FROM complianceaudittasks WHERE framework = 'GDPR';

INSERT INTO complianceaudittasks
  (documentid, framework, category, controlreference, priority, tasktype, title,
   description, requirementtext, checkmethod, checkpattern, applicablephases,
   applicablefiletypes, isautomated)
SELECT d.id, 'GDPR', v.cat, v.ref, v.pri, v.ttype, v.title, v.descr, v.title,
       CASE WHEN v.pattern IS NULL THEN 'manual_review' ELSE 'regex_pattern' END,
       v.pattern, v.phases,
       CASE WHEN v.pattern IS NULL THEN NULL ELSE ARRAY['.ts', '.tsx'] END,
       v.pattern IS NOT NULL
FROM (
  SELECT id FROM wxkanbandocuments
  WHERE documenttype = 'compliance_framework' AND framework = 'GDPR' AND status = 'active'
  ORDER BY length(coalesce(filecontent, '')) DESC LIMIT 1
) d,
(VALUES
  -- Article 5 — Principles relating to processing
  ('Art.5(1)(a)','Privacy','high','documentation',NULL,ARRAY['design'],'Lawfulness, fairness and transparency','Processing is lawful, fair and transparent to the data subject. Transparency is a design property: it constrains what the interface must disclose, not only what the policy says.'),
  ('Art.5(1)(b)','Privacy','high','documentation',NULL,ARRAY['design'],'Purpose limitation','Data is collected for specified, explicit and legitimate purposes and not further processed in a manner incompatible with them.'),
  ('Art.5(1)(c)','Privacy','critical','code_pattern','(anonymi[sz]|pseudonymi[sz])',ARRAY['design','development','testing'],'Data minimisation','Data is adequate, relevant and limited to what is necessary. Where identifiability is not needed — analytics, test fixtures, logs — the data is pseudonymised or anonymised. Expected to FAIL: nothing in this tree does either, and that is the finding.'),
  ('Art.5(1)(d)','Privacy','medium','process',NULL,ARRAY['development'],'Accuracy','Personal data is accurate and kept up to date; inaccurate data is erased or rectified without delay.'),
  ('Art.5(1)(e)','Privacy','high','process',NULL,ARRAY['design','deployment'],'Storage limitation','Data is kept in identifiable form no longer than necessary. A retention period exists per data class and is enforced, not merely documented.'),
  ('Art.5(1)(f)','Access Control','critical','code_pattern','require(Admin|Role|SysAdmin)',ARRAY['development','deployment'],'Integrity and confidentiality','Processing is secured against unauthorised or unlawful processing and against accidental loss, using appropriate technical measures.'),
  ('Art.5(2)','Governance','high','documentation',NULL,ARRAY['design','deployment'],'Accountability','The controller is responsible for, and must be able to DEMONSTRATE, compliance. Demonstrability is the obligation — compliance you cannot evidence does not discharge it.'),

  -- Lawful basis
  ('Art.6(1)','Privacy','critical','documentation',NULL,ARRAY['design'],'Lawfulness of processing','At least one lawful basis applies to each processing activity, identified before processing begins rather than justified afterwards.'),
  ('Art.7','Privacy','high','process',NULL,ARRAY['design','development'],'Conditions for consent','Where consent is the basis, it is freely given, specific, informed, unambiguous, recorded, and as easy to withdraw as to give. Manual: no code pattern distinguishes GDPR consent from an OAuth consent prompt.'),
  ('Art.9','Privacy','critical','documentation',NULL,ARRAY['design'],'Special categories of personal data','Processing of health, biometric, racial, political, religious or sexual-orientation data is prohibited unless a specific Article 9(2) condition applies.'),

  -- Transparency and data subject rights
  ('Art.12','Privacy','high','process',NULL,ARRAY['design','development'],'Transparent information and modalities','Information and communications are concise, transparent, intelligible and in plain language, and requests are answered within one month.'),
  ('Art.13','Privacy','high','documentation',NULL,ARRAY['design'],'Information to be provided — collected from the subject','Identity of the controller, purposes, legal basis, recipients, retention period and rights are disclosed at the point of collection.'),
  ('Art.14','Privacy','medium','documentation',NULL,ARRAY['design'],'Information to be provided — not obtained from the subject','The same disclosures apply where data was obtained indirectly, plus the source.'),
  ('Art.15','Privacy','critical','process',NULL,ARRAY['development'],'Right of access','A data subject can obtain confirmation of processing and a copy of their data. Requires an export path that reaches every store holding their data, including logs and backups.'),
  ('Art.16','Privacy','high','process',NULL,ARRAY['development'],'Right to rectification','Inaccurate data is corrected without undue delay, and incomplete data completed.'),
  ('Art.17','Privacy','critical','process',NULL,ARRAY['development'],'Right to erasure','Data is erased without undue delay where a ground applies. Soft-delete that leaves the row readable is not erasure.'),
  ('Art.18','Privacy','medium','process',NULL,ARRAY['development'],'Right to restriction of processing','Processing can be restricted without deleting, and restricted data is marked so it is not processed further.'),
  ('Art.19','Privacy','medium','process',NULL,ARRAY['development'],'Notification obligation','Recipients are informed of rectification, erasure or restriction unless it proves impossible or disproportionate.'),
  ('Art.20','Privacy','high','process',NULL,ARRAY['development'],'Right to data portability','Data provided by the subject is exportable in a structured, commonly used, machine-readable format.'),
  ('Art.21','Privacy','medium','process',NULL,ARRAY['development'],'Right to object','A subject can object to processing based on legitimate interests, and to direct marketing at any time with no exception.'),
  ('Art.22','Privacy','medium','documentation',NULL,ARRAY['design'],'Automated individual decision-making','Decisions producing legal or similarly significant effects are not made solely by automated processing without safeguards, including human intervention.'),

  -- Privacy by design, processors, records
  ('Art.25(1)','Secure Development','critical','documentation',NULL,ARRAY['design'],'Data protection by design','Technical and organisational measures are implemented at the time of determining the means of processing, not retrofitted.'),
  ('Art.25(2)','Secure Development','critical','code_pattern','httpOnly',ARRAY['development'],'Data protection by default','By default only data necessary for each specific purpose is processed, and defaults are the protective option rather than the permissive one.'),
  ('Art.28','Vendor Management','high','process',NULL,ARRAY['design','deployment'],'Processor obligations','Processors are engaged under a contract meeting Article 28(3), and sub-processors only with authorisation.'),
  ('Art.30','Governance','high','documentation',NULL,ARRAY['design','deployment'],'Records of processing activities','A record of processing activities is maintained, covering purposes, categories, recipients, transfers and retention.'),

  -- Security of processing
  ('Art.32(1)(a)','Encryption','critical','code_pattern','create(Cipher|Decipher)iv',ARRAY['development','deployment'],'Pseudonymisation and encryption','Personal data is encrypted using an authenticated cipher appropriate to the risk.'),
  ('Art.32(1)(b)','Audit Logging','critical','code_pattern','companyauditlogs',ARRAY['development','deployment'],'Confidentiality, integrity, availability and resilience','Processing systems maintain ongoing confidentiality, integrity, availability and resilience, and their activity is recorded so those properties can be evidenced.'),
  ('Art.32(1)(c)','Business Continuity','high','process',NULL,ARRAY['deployment'],'Restore availability after an incident','Availability and access to personal data can be restored in a timely manner after a physical or technical incident.'),
  ('Art.32(1)(d)','Testing','high','process',NULL,ARRAY['testing'],'Regular testing of security measures','A process regularly tests, assesses and evaluates the effectiveness of the measures. Measures adopted and never measured are assumptions.'),

  -- Breach, DPIA, DPO
  ('Art.33','Incident Management','critical','process',NULL,ARRAY['deployment'],'Breach notification to the supervisory authority','A personal data breach is notified within 72 hours of becoming aware, unless unlikely to result in a risk to rights and freedoms.'),
  ('Art.34','Incident Management','high','process',NULL,ARRAY['deployment'],'Breach communication to the data subject','Where the breach is likely to result in a high risk, affected subjects are told without undue delay and in plain language.'),
  ('Art.35','Risk Management','high','process',NULL,ARRAY['design'],'Data protection impact assessment','A DPIA is carried out where processing is likely to result in a high risk, before processing begins.'),
  ('Art.37','Governance','medium','documentation',NULL,ARRAY['design'],'Designation of a data protection officer','A DPO is designated where the criteria in Article 37(1) are met, and their contact details are published.'),

  -- International transfers
  ('Art.44','Privacy','high','documentation',NULL,ARRAY['design','deployment'],'General principle for transfers','Any transfer to a third country or international organisation meets the Chapter V conditions, including onward transfers.'),
  ('Art.45','Privacy','medium','documentation',NULL,ARRAY['deployment'],'Transfers on the basis of an adequacy decision','Transfer to a third country covered by an adequacy decision requires no further authorisation, and the decision is re-checked as adequacy findings change.'),
  ('Art.46','Privacy','high','process',NULL,ARRAY['deployment'],'Transfers subject to appropriate safeguards','Absent adequacy, appropriate safeguards apply — standard contractual clauses or binding corporate rules — with enforceable rights and effective remedies.'),
  ('Art.49','Privacy','low','process',NULL,ARRAY['deployment'],'Derogations for specific situations','Derogations are used only for occasional, non-repetitive transfers and are documented; they are not a standing basis.')
) AS v(ref, cat, pri, ttype, pattern, phases, title, descr);

UPDATE wxkanbandocuments d
SET extractedtasks = (SELECT count(*) FROM complianceaudittasks t WHERE t.documentid = d.id)
WHERE d.documenttype = 'compliance_framework' AND d.framework = 'GDPR';

COMMIT;
