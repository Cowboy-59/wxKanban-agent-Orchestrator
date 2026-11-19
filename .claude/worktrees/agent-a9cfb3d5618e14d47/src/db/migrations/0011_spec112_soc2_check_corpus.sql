-- SPEC-112 Amendment A / T011 — author the SOC 2 check corpus
--
-- `complianceaudittasks` was populated by a markdown checklist parser: it turned every
-- `- [ ] X` line in SOC2_SDLC_Compliance_Rules.md into a row with title = description,
-- no control reference, and no check pattern — yet flagged `isautomated = true` and
-- `checkmethod = 'regex_pattern'` on nearly all of them. Because checkRegexPattern
-- returns not_applicable on a null pattern, the engine had no checks to run at all;
-- SPEC-112 FR-006's corrected engine graded everything not_applicable.
--
-- This migration makes the corpus honest:
--   1. Removes two test documents seeded during development, and their rows.
--   2. Removes an exact duplicate row.
--   3. Assigns the governing Trust Services Criterion to each control.
--   4. Replaces description = title with authored guidance.
--   5. Re-categorises rows the parser dumped into 'General'.
--   6. Sets `isautomated = true` ONLY where a regex honestly evidences the control,
--      and `false` everywhere else. Presence of a pattern is the engine's only notion
--      of proof, so a control that cannot be proven by presence is manual by definition.
--   7. Separates audit-engagement logistics ("prepare conference room", "maintain
--      professional demeanor") from software controls. These came from the source
--      document's Audit Preparation Checklist and are not SDLC requirements; they are
--      retained for traceability but marked so they never present as code controls.
--
-- Patterns were verified by running them through evaluateRegexEvidence against this
-- repository, and three were rewritten because the first draft reproduced the very
-- false-pass class FR-006 removed:
--   * `\b(mfa|totp|...)\b` matched a regex LITERAL in AuditTaskService.ts that happens
--     to list "mfa" as a keyword. Now matches implementation identifiers (otplib,
--     totpsecret) instead of the acronym.
--   * `aes-256-gcm` matched a German marketing string in the locale bundle asserting
--     AES-256-GCM encryption. A translated product claim is not evidence of a cipher.
--     Now matches the crypto call itself.
--   * The default file set included committed tsc output inside src/ (see step 3b).
-- The MFA checks are expected to be ABSENT and to FAIL: no MFA exists anywhere in the
-- product (SOC 2 finding H-3) and a check reporting otherwise would be a lie.
--
-- Idempotent: re-running produces the same state.
--
-- Hand-written rather than drizzle-kit generated — no schema change here, data only.

BEGIN;

-- ─── 1. Remove development test documents (rows cascade) ──────────────────────
DELETE FROM wxkanbandocuments
WHERE documenttype = 'compliance_framework'
  AND framework = 'SOC2'
  AND filename IN ('soc2-test.md', 'test-api.md');

-- ─── 2. Remove exact duplicate rows, keeping the earliest ─────────────────────
DELETE FROM complianceaudittasks a
USING complianceaudittasks b
WHERE a.framework = 'SOC2'
  AND b.framework = 'SOC2'
  AND a.title = b.title
  AND a.documentid = b.documentid
  AND a.id > b.id;

-- ─── 3. Author the corpus ─────────────────────────────────────────────────────
WITH authored (title, ctrl, cat, ttype, pattern, descr) AS (VALUES
  -- Access control — CC6
  ('Logical access controls with MFA', 'CC6.1', 'Access Control', 'code_pattern', '(otplib|speakeasy|authenticator\.(generate|verify)|totpsecret|mfasecret|mfaenabled)', 'Interactive access to the system must require a second factor. Expected to FAIL until MFA is implemented — that failure is the finding, not a defect in the check.'),
  ('Production access requires MFA and justification', 'CC6.1', 'Access Control', 'code_pattern', '(otplib|speakeasy|authenticator\.(generate|verify)|totpsecret|mfasecret|mfaenabled)', 'Production access requires a second factor and a recorded business justification. Expected to FAIL until MFA exists.'),
  ('Authentication and authorization design', 'CC6.1', 'Access Control', 'documentation', NULL, 'The design must state how identity is established and how authorisation decisions are made, before implementation begins. Reviewed at design, not detectable in code.'),
  ('Principle of least privilege', 'CC6.3', 'Access Control', 'code_pattern', 'require(Admin|Role|SysAdmin)', 'Every privileged route must be gated by an explicit role guard rather than assuming an authenticated caller is entitled.'),
  ('Regular access reviews', 'CC6.3', 'Access Control', 'process', NULL, 'User entitlements are re-certified on a defined cadence and revocations actioned. Evidence is the review record, not the code.'),
  ('Complete any pending access reviews', 'CC6.3', 'Access Control', 'process', NULL, 'No access review may be left open across an audit period; an overdue review is itself the exception.'),
  ('Production access restricted and monitored', 'CC6.1', 'Access Control', 'process', NULL, 'Production access is limited to named individuals and every session is logged and reviewable.'),
  ('No direct human access to build servers', 'CC6.1', 'Access Control', 'process', NULL, 'Build infrastructure is reached through automation only; interactive login is an exception requiring approval.'),
  ('Access controls on artifact repositories', 'CC6.1', 'Access Control', 'process', NULL, 'Publish rights to artifact storage are separated from read access and held by the pipeline identity, not by developers.'),
  ('Audit logging for all system access', 'CC7.2', 'Audit Logging', 'code_pattern', 'companyauditlogs', 'Access events are written to a durable audit store that the acting user cannot alter.'),
  ('Test system access for auditors', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),

  -- Audit logging and monitoring — CC7
  ('Audit trail of all changes', 'CC7.2', 'Audit Logging', 'code_pattern', 'companyauditlogs', 'Every state-changing action records who did what and when, in a store separate from the record being changed.'),
  ('Security log monitoring', 'CC7.2', 'Audit Logging', 'code_pattern', 'createLogger', 'Security-relevant events emit structured log records that can be queried and alerted on.'),
  ('Security monitoring and alerting', 'CC7.2', 'Audit Logging', 'process', NULL, 'Alerts route to a named owner with a defined response time. Detectable in infrastructure configuration, not in application source.'),
  ('Monitoring and alerting configured', 'CC7.2', 'Audit Logging', 'process', NULL, 'Availability and error-rate alarms exist and are wired to a notification channel someone reads.'),
  ('Continuous vulnerability monitoring', 'CC7.1', 'Audit Logging', 'process', NULL, 'Dependency and platform advisories are monitored continuously rather than at release boundaries.'),
  ('Vulnerability findings tracked to resolution', 'CC7.1', 'Audit Logging', 'process', NULL, 'Each finding carries an owner, a severity and a closure record; silent ageing is the failure mode this control prevents.'),
  ('Regular environment configuration audits', 'CC7.1', 'Audit Logging', 'process', NULL, 'Deployed configuration is compared against its declared source on a cadence, to catch drift applied by hand.'),
  ('All changes documented in change tracking system', 'CC8.1', 'Change Management', 'process', NULL, 'Every production change traces to a tracked item recording what changed, why, and who approved it.'),
  ('Brief team on audit process', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),

  -- Encryption — CC6.7
  ('Data encryption (at rest and in transit)', 'CC6.7', 'Encryption', 'code_pattern', 'create(Cipher|Decipher)iv', 'Sensitive data is encrypted with an authenticated cipher at rest, and transported only over TLS.'),
  ('Encryption implementation design', 'CC6.7', 'Encryption', 'documentation', NULL, 'The design names the algorithm, the key source and the rotation path before code is written. Reviewed at design.'),

  -- Secure development — CC8.1 / CC6.1
  ('Input validation requirements', 'CC6.1', 'Secure Development', 'code_pattern', 'z\.(object|string|number|enum|array)\(', 'Every external input is parsed through a schema at the boundary rather than trusted and coerced downstream.'),
  ('Secure session management', 'CC6.1', 'Secure Development', 'code_pattern', 'httpOnly', 'Session material is held in cookies inaccessible to script, and invalidated on logout and privilege change.'),
  ('Error handling without information disclosure', 'CC6.1', 'Secure Development', 'code_pattern', 'errorHandler', 'Failures return a safe message to the caller while the detail goes to the log; stack traces never reach a response body.'),
  ('Output encoding standards', 'CC6.1', 'Secure Development', 'process', NULL, 'Untrusted values are encoded for their destination context. Presence cannot prove this — the risk is the one place it was skipped, so it is reviewed rather than scanned.'),
  ('OWASP Top 10 compliance', 'CC6.1', 'Secure Development', 'process', NULL, 'The codebase is assessed against each Top 10 category. Too broad for a single pattern; reviewed per release.'),
  ('Secure coding standards enforced', 'CC8.1', 'Secure Development', 'process', NULL, 'A written standard exists and review rejects code that departs from it.'),
  ('Language-specific security guidelines', 'CC8.1', 'Secure Development', 'documentation', NULL, 'Guidance specific to the stack in use, not generic advice — for TypeScript this covers strictness, type escapes and dependency trust.'),
  ('Fail-safe defaults', 'CC6.1', 'Secure Development', 'process', NULL, 'The default outcome of any access decision is denial; permission is granted explicitly.'),
  ('Defense in depth architecture', 'CC6.1', 'Secure Development', 'documentation', NULL, 'No single control failure exposes the system; the design states which layers back each other up.'),
  ('Open design (security not dependent on secrecy)', 'CC6.1', 'Secure Development', 'documentation', NULL, 'Security rests on keys and access decisions, never on an attacker not knowing how the system works.'),
  ('Secrets management solution', 'CC6.1', 'Secure Development', 'process', NULL, 'Secrets come from a managed store at runtime. Presence of a secrets call proves nothing about the hard-coded value elsewhere, so this is reviewed rather than scanned.'),
  ('Different credentials per environment', 'CC6.1', 'Secure Development', 'process', NULL, 'A credential valid in staging must not be valid in production; shared credentials collapse environment separation.'),
  ('Environment separation', 'CC6.1', 'Deployment', 'process', NULL, 'Development, test and production are separate at the network and credential level, not by convention.'),
  ('Network segmentation between environments', 'CC6.6', 'Deployment', 'process', NULL, 'Environments cannot reach each other; verified in infrastructure configuration, not application source.'),
  ('Data classification defined', 'CC3.2', 'Risk Management', 'code_pattern', 'securityclassification', 'Data is classified so that handling requirements follow from the classification rather than from individual judgement.'),
  ('Data flow diagrams created', 'CC3.2', 'Risk Management', 'documentation', NULL, 'Where regulated data enters, rests and leaves is documented, because controls follow the flow.'),
  ('Threat modeling performed for new capabilities', 'CC3.2', 'Risk Management', 'process', NULL, 'New capability is assessed for how it could be abused before it is built, not after it ships.'),
  ('Risk assessment completed', 'CC3.1', 'Risk Management', 'process', NULL, 'Risks are identified, rated and either mitigated or accepted by a named owner.'),
  ('Risk assessment completed for each change', 'CC3.1', 'Risk Management', 'process', NULL, 'Change risk is assessed per change; a blanket assessment does not satisfy this.'),
  ('Security requirements documented for each feature', 'CC3.1', 'Secure Development', 'documentation', NULL, 'Security requirements are written with the functional ones, so they are testable rather than assumed.'),
  ('Security requirements in every project', 'CC3.1', 'Secure Development', 'documentation', NULL, 'No project proceeds without stated security requirements, however brief.'),
  ('Security architecture review', 'CC3.1', 'Secure Development', 'process', NULL, 'A reviewer independent of the author signs off the security design before build.'),
  ('Architecture review board approval', 'CC1.3', 'Governance', 'process', NULL, 'Material architectural decisions carry a recorded approval from the accountable body.'),
  ('Security team review and approval', 'CC1.3', 'Governance', 'process', NULL, 'Security review is a gate with a named approver, not an advisory comment.'),
  ('Secure SDLC with security reviews', 'CC8.1', 'Secure Development', 'process', NULL, 'Security review is a defined stage of the lifecycle with an entry and exit condition.'),
  ('Regular security training for developers', 'CC1.4', 'Governance', 'process', NULL, 'Developers receive role-relevant security training on a cadence, with attendance recorded.'),
  ('Documented policies and procedures', 'CC2.2', 'Governance', 'documentation', NULL, 'Policies exist in writing, are current, and are reachable by the people expected to follow them.'),
  ('Review and update all policies', 'CC2.2', 'Governance', 'process', NULL, 'Policies are reviewed on a defined cycle; an unreviewed policy is treated as stale.'),
  ('Separation of duties', 'CC5.2', 'Access Control', 'code_pattern', 'dutyassignment', 'No single identity can both author and approve the same change.'),
  ('Segregation of duties (build vs. deploy)', 'CC5.2', 'Deployment', 'process', NULL, 'The identity that builds an artifact is not the identity that promotes it to production.'),

  -- Change management — CC8.1
  ('Formal change management process', 'CC8.1', 'Change Management', 'process', NULL, 'Changes follow a defined path from request through approval to verification; emergency changes are a documented exception, not an absence of process.'),
  ('Change advisory board approval', 'CC8.1', 'Change Management', 'process', NULL, 'Significant changes carry a recorded approval from the accountable body before release.'),
  ('Code review process (including security)', 'CC8.1', 'Change Management', 'process', NULL, 'Every change is reviewed by someone other than its author, with security explicitly in scope.'),
  ('Peer code reviews mandatory', 'CC8.1', 'Change Management', 'process', NULL, 'Review is required, not optional; enforced by branch protection rather than by convention.'),
  ('Security-focused code reviews', 'CC8.1', 'Change Management', 'process', NULL, 'Reviews of security-relevant code carry an explicit security pass, not just a functional one.'),
  ('Review approval before merge', 'CC8.1', 'Change Management', 'process', NULL, 'Merge is blocked until an approval is recorded against the change.'),
  ('Post-implementation review for significant changes', 'CC8.1', 'Change Management', 'process', NULL, 'Significant changes are reviewed after release against what they were expected to achieve.'),
  ('All code in version control system', 'CC8.1', 'Change Management', 'process', NULL, 'No production artifact originates outside version control. Not detectable from within the tree being scanned.'),
  ('Version control for all code and config', 'CC8.1', 'Change Management', 'process', NULL, 'Configuration is versioned alongside code so a deployed state can be reconstructed.'),
  ('Signed commits for integrity', 'CC8.1', 'Change Management', 'configuration', NULL, 'Commit signatures establish authorship. Verified in repository settings, not in source.'),
  ('Branch protection rules enforced', 'CC8.1', 'Change Management', 'configuration', NULL, 'Protected branches reject unreviewed and unsigned pushes. Verified in repository settings.'),
  ('No direct commits to main/production branches', 'CC8.1', 'Change Management', 'configuration', NULL, 'All change reaches the release branch through a reviewed request. Verified in repository settings.'),
  ('Pipeline as code (version controlled)', 'CC8.1', 'Deployment', 'configuration', NULL, 'The pipeline definition is itself reviewed and versioned, so build behaviour cannot change unobserved.'),

  -- Testing — CC7.1 / CC8.1
  ('Automated security scanning in pipeline', 'CC7.1', 'Testing', 'configuration', NULL, 'Security scanning runs on every build and can fail it. Verified in pipeline configuration.'),
  ('Automated security testing in CI/CD', 'CC7.1', 'Testing', 'configuration', NULL, 'Security tests run automatically rather than on request.'),
  ('Automated static analysis (SAST)', 'CC7.1', 'Testing', 'configuration', NULL, 'Static analysis runs against every change. Verified in pipeline configuration, not in application source.'),
  ('Dynamic Application Security Testing (DAST)', 'CC7.1', 'Testing', 'process', NULL, 'The running application is tested, not just its source.'),
  ('Software Composition Analysis (SCA) for dependencies', 'CC7.1', 'Testing', 'configuration', NULL, 'Third-party components are inventoried and checked against advisories.'),
  ('Vulnerability scanning of containers/packages', 'CC7.1', 'Testing', 'configuration', NULL, 'Images and packages are scanned before promotion.'),
  ('Fuzz testing where applicable', 'CC7.1', 'Testing', 'process', NULL, 'Parsers and boundary handlers are exercised with malformed input.'),
  ('Penetration testing for major releases', 'CC7.1', 'Testing', 'process', NULL, 'An independent tester attacks the system before a major release.'),
  ('Security regression testing', 'CC7.1', 'Testing', 'process', NULL, 'Every fixed vulnerability gains a test so it cannot silently return.'),
  ('Security test coverage metrics', 'CC7.1', 'Testing', 'process', NULL, 'Coverage of security-relevant paths is measured, not assumed.'),
  ('Test plans include security test cases', 'CC7.1', 'Testing', 'documentation', NULL, 'Security cases are written into the plan rather than improvised during execution.'),
  ('All security tests passed', 'CC7.1', 'Testing', 'process', NULL, 'Release is blocked on outstanding security test failures.'),
  ('Test results documented and retained', 'CC7.1', 'Testing', 'process', NULL, 'Results are retained as evidence for the audit period, not discarded with the build.'),
  ('No high/critical vulnerabilities in production code', 'CC7.1', 'Testing', 'process', NULL, 'High and critical findings block release; anything accepted carries a recorded, time-bound acceptance.'),
  ('Vulnerability scan clean or accepted risks documented', 'CC7.1', 'Testing', 'process', NULL, 'A non-clean scan is permitted only with documented, owned acceptance.'),
  ('Review and close outstanding vulnerabilities', 'CC7.1', 'Testing', 'process', NULL, 'Open findings are driven to closure rather than carried indefinitely.'),
  ('Vulnerability management program', 'CC7.1', 'Testing', 'process', NULL, 'Discovery, rating, remediation and verification are defined as a standing programme.'),
  ('Regular security patches', 'CC7.1', 'Deployment', 'process', NULL, 'Platform and dependency patches are applied on a defined cadence with an expedited path for critical ones.'),
  ('Separate environments (dev, test, staging, prod)', 'CC6.1', 'Deployment', 'process', NULL, 'Distinct environments exist with distinct data and credentials.'),
  ('No production data in non-production (or anonymized)', 'C1.1', 'Privacy', 'process', NULL, 'Production data is not copied into lower environments unless irreversibly anonymised.'),

  -- Build and release — CC8.1
  ('Build servers isolated and hardened', 'CC6.6', 'Deployment', 'process', NULL, 'Build infrastructure is separated from developer workstations and production, and minimally exposed.'),
  ('Build environments immutable/infrastructure as code', 'CC8.1', 'Deployment', 'configuration', NULL, 'Build environments are rebuilt from declared source rather than modified in place.'),
  ('Immutable artifacts', 'CC8.1', 'Deployment', 'process', NULL, 'A built artifact is never modified after creation; a change produces a new artifact with a new identity.'),
  ('Artifact signing and verification', 'CC8.1', 'Deployment', 'process', NULL, 'Artifacts are signed at build and the signature is verified before deployment.'),
  ('Build artifacts signed and checksum verified', 'CC8.1', 'Deployment', 'process', NULL, 'Both signature and checksum are checked, so substitution in transit is detectable.'),
  ('Dependency pinning and verification', 'CC8.1', 'Deployment', 'configuration', NULL, 'Dependencies resolve to fixed, verified versions so a build is reproducible.'),
  ('Retention policies for artifacts', 'A1.2', 'Deployment', 'process', NULL, 'Artifacts are retained long enough to support rollback and audit, and no longer.'),
  ('Deployment automation (Infrastructure as Code)', 'CC8.1', 'Deployment', 'configuration', NULL, 'Deployment is executed by automation from declared source, not by hand.'),
  ('Deployment approval workflows', 'CC8.1', 'Deployment', 'process', NULL, 'Promotion to production requires a recorded approval distinct from the change approval.'),
  ('Approval gates for production deployments', 'CC8.1', 'Deployment', 'process', NULL, 'The pipeline stops for an explicit human decision before production.'),
  ('Production deployment approvals', 'CC8.1', 'Deployment', 'process', NULL, 'The approver is named and the approval is retained as evidence.'),
  ('Automated rollback capabilities', 'A1.2', 'Deployment', 'process', NULL, 'Reverting a bad release is an automated path, not an improvised one.'),
  ('Rollback plan documented and tested', 'A1.3', 'Business Continuity', 'documentation', NULL, 'The rollback path is written down and proven to work before it is needed.'),
  ('Rollback procedures tested', 'A1.3', 'Business Continuity', 'process', NULL, 'Rollback is exercised, because an untested recovery path is an assumption.'),
  ('Backup and recovery procedures', 'A1.2', 'Business Continuity', 'process', NULL, 'Backups exist, are protected, and restoration is verified on a cadence.'),

  -- Incident management — CC7.3 / CC7.4
  ('Incident response procedures', 'CC7.4', 'Incident Management', 'documentation', NULL, 'A written procedure states who is called, what is preserved, and how the event is closed.'),
  ('Incident response readiness', 'CC7.4', 'Incident Management', 'process', NULL, 'On-call, contact paths and escalation are current — readiness is the control, not the document.'),
  ('Test incident response procedures', 'CC7.4', 'Incident Management', 'process', NULL, 'The procedure is exercised so gaps surface in a drill rather than an incident.'),
  ('Provide timely responses to requests', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),

  -- Privacy — P / C1
  ('Compliance requirements identified (GDPR, CCPA, etc.)', 'P1.1', 'Privacy', 'documentation', NULL, 'Applicable privacy regimes are identified per product, because the obligations differ by jurisdiction and data.'),
  ('Privacy impact assessments completed', 'P1.1', 'Privacy', 'process', NULL, 'Processing of personal data is assessed for necessity and proportionality before it begins.'),
  ('Privacy officer sign-off for PII handling', 'P1.1', 'Privacy', 'process', NULL, 'A named accountable person approves new personal-data handling.'),
  ('Third-party integration security review', 'CC9.2', 'Vendor Management', 'process', NULL, 'A third party gaining access or data is assessed before integration and re-assessed on a cadence.'),

  -- Audit engagement logistics — retained for traceability, not SDLC controls
  ('Prepare conference room and resources', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),
  ('Prepare evidence repository', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),
  ('Verify all evidence is current', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),
  ('Ensure key personnel availability', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),
  ('Communication plan for stakeholders', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),
  ('Communication plan executed', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),
  ('Maintain professional demeanor', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),
  ('Clarify scope when needed', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),
  ('Escalate issues promptly', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),
  ('Document any findings immediately', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.'),
  ('Complete mediation', NULL, 'Audit Preparation', 'process', NULL, 'Audit-engagement logistics from the source document''s preparation checklist. Not an SDLC control.')
)
UPDATE complianceaudittasks t
SET controlreference = a.ctrl,
    category         = a.cat,
    tasktype         = a.ttype,
    description      = a.descr,
    requirementtext  = COALESCE(NULLIF(t.requirementtext, t.title), t.title),
    checkpattern     = a.pattern,
    checkmethod      = CASE WHEN a.pattern IS NULL THEN 'manual_review' ELSE 'regex_pattern' END,
    isautomated      = a.pattern IS NOT NULL
FROM authored a
WHERE t.framework = 'SOC2'
  AND t.title = a.title;

-- ─── 3b. Automated checks scan TypeScript sources only ───────────────────────
-- checkRegexPattern defaults to ['.ts', '.tsx', '.js'] when applicablefiletypes is
-- null. This tree carries committed tsc output beside its sources — src/lib/validation.js
-- next to validation.ts, src/middleware/rbac.js next to rbac.ts — so the default set
-- lets a check evidence a control from build output rather than from source. FR-006
-- excluded generated declarations and dist; these stragglers live inside src/ and slip
-- past that filter, so the authored checks narrow the file set instead.
UPDATE complianceaudittasks
SET applicablefiletypes = ARRAY['.ts', '.tsx']
WHERE framework = 'SOC2'
  AND checkpattern IS NOT NULL;

-- ─── 4. Anything unauthored is manual, never a silent automated no-op ─────────
-- A row the mapping above did not reach must not keep claiming isautomated with a
-- null pattern: that combination is exactly what produced 1,157 checks the engine
-- could not run.
UPDATE complianceaudittasks
SET isautomated = false,
    checkmethod = 'manual_review'
WHERE framework = 'SOC2'
  AND checkpattern IS NULL
  AND isautomated = true;

-- ─── 5. Keep the document's extracted-task count truthful ─────────────────────
UPDATE wxkanbandocuments d
SET extractedtasks = (
      SELECT count(*) FROM complianceaudittasks t WHERE t.documentid = d.id
    )
WHERE d.documenttype = 'compliance_framework'
  AND d.framework = 'SOC2';

COMMIT;
