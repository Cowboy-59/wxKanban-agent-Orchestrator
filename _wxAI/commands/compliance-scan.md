---
description: Retroactive compliance analysis. Run when compliance frameworks are enabled after specs and scopes already exist, or for a periodic compliance audit across all project documentation.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
---

# /compliance-scan

Analyse existing scopes, specs, and compound documents against the currently active compliance frameworks. Identifies gaps, flags non-compliant requirements, and produces a remediation plan.

## When to Run

- A compliance framework was just enabled on a project that already has scopes/specs
- Pre-audit review (SOC 2, HIPAA, HiTrust, GDPR assessment)
- Periodic compliance health check
- After a major feature release that touches sensitive data

## Usage

```
/compliance-scan                        # Scan all scopes and specs for this project
/compliance-scan --scope NNN            # Scan one specific scope
/compliance-scan --framework hipaa      # Check one framework only
/compliance-scan --mode report          # Report only — no changes to any files
```

---

## Phase 0 — Load Active Frameworks

1. Call `project.get_audit_config` MCP tool for this project
2. For each enabled framework, load the full rules file:
   - `soc2enabled` → `SOC2_SDLC_Compliance_Rules.md`
   - `hipaaenabled` → `HIPAA_SDLC_Compliance_Rules.md`
   - `hitrustenabled` → `HITRUST_SDLC_Compliance_Rules.md`
   - `gdprenabled` → `GDPR_SDLC_Compliance_Rules.md`

**If no frameworks are active → stop. Report: "No compliance frameworks enabled for this project."**

---

## Phase 1 — Discover Documents

Collect all documents to scan:

- All scope files: `specs/Project-Scope/*.md`
- All spec files: `specs/*/spec.md`, `specs/*/plan.md`
- All compound learnings: `specs/*/learnings/*.md`, `docs/learnings/*.md`
- DB records: query `projectdocuments` for all docs linked to this project

Group by scope number for reporting.

---

## Phase 2 — Analyse Each Document

For each document, run in parallel:

### Compliance Gap Checker

For each active framework, check:

**SOC2:**
- Are change management controls described? (who reviews, who approves, separation of duties)
- Are access controls defined for any new data or endpoints?
- Is audit logging specified for security-relevant events?
- Are data retention requirements addressed?

**HIPAA:**
- Does this scope handle PHI (any of the 18 identifiers)?
  - If yes: is encryption at rest specified? Is access control defined? Is audit logging required?
- Are Business Associate Agreement implications noted if third parties are involved?
- Is breach notification scope addressed?

**HITRUST:**
- Are the separation of duties requirements met? (Developer ≠ QA ≠ Final Acceptance Reviewer ≠ Publisher)
- Is secure development environment specified?
- Are all HIPAA + SOC2 controls present (HITRUST is a superset)?

**GDPR:**
- Does this scope process personal data of EU residents?
  - If yes: is lawful basis for processing stated? Is data minimization applied?
- Are data subject rights addressed (access, erasure, portability)?
- Is cross-border data transfer flagged if applicable?
- Is data retention period specified?
- Is Privacy by Design documented?

### Severity Classification

For each gap found:

| Severity | Meaning |
|----------|---------|
| **Critical** | Scope/spec touches regulated data with no compliance controls defined |
| **High** | Compliance control is mentioned but incomplete or ambiguous |
| **Medium** | Best-practice compliance measure missing but not a hard rule violation |
| **Low** | Documentation gap — control likely exists but isn't recorded |

---

## Phase 3 — Generate Remediation Plan

For each Critical or High finding, produce a specific remediation action:

```
SCOPE: NNN-scope-name
FRAMEWORK: HIPAA
GAP: Scope stores user health data but does not specify encryption at rest
SEVERITY: Critical
REMEDIATION: Add FR to spec.md: "All PHI fields in [table] must be encrypted 
             at rest using AES-256-GCM. Encryption key managed via [key store]."
ACTION: Update spec + run /compound to document the control
```

---

## Phase 4 — Produce Report

```
COMPLIANCE SCAN REPORT
Project: [name]  Date: [YYYY-MM-DD]
Active Frameworks: [SOC2] [HIPAA] [HITRUST] [GDPR]

════════════════════════════════════════
SUMMARY
════════════════════════════════════════
Scopes scanned:     N
Specs scanned:      N
Learnings scanned:  N

Critical gaps:  N
High gaps:      N
Medium gaps:    N
Low gaps:       N

════════════════════════════════════════
CRITICAL — MUST REMEDIATE
════════════════════════════════════════
[Scope / Framework / Gap / Remediation]

════════════════════════════════════════
HIGH — SHOULD REMEDIATE
════════════════════════════════════════
[...]

════════════════════════════════════════
COMPLIANT SCOPES
════════════════════════════════════════
[List of scopes with no critical/high gaps]

════════════════════════════════════════
RECOMMENDED NEXT STEPS
════════════════════════════════════════
1. Address all Critical findings before next release
2. Update affected specs with compliance requirements
3. Run /compound after each remediation to create audit evidence
4. Re-run /compliance-scan --mode report to verify before audit
```

---

## Phase 5 — Apply Remediations (if not --mode report)

For each Critical or High finding, ask the user:

```
[Scope NNN] HIPAA Critical — PHI encryption not specified.

Suggested addition to spec.md:
  "FR-XXX: All PHI fields must be encrypted at rest (AES-256-GCM)"

[A] Apply this addition
[S] Skip — I'll handle manually  
[E] Edit the suggestion first
```

After any spec update:
- Re-run `project.create_specs` to sync the updated spec to the DB
- Recommend running `/compound` to document the compliance control as audit evidence

---

## Key Rule

This scan **never removes or weakens** existing requirements. It only adds or flags missing ones. If it finds a compliance control already in place but undocumented, it suggests a `/compound` run — not a spec change.
