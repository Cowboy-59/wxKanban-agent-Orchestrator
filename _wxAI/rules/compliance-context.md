# Compliance Context Rule

## Auto-Discovery (REQUIRED at start of every spec, scope, and documentation task)

Before beginning any `buildscope`, `createSpecs`, `implement`, `compound`, or `code-review` work, load the active compliance frameworks for this project.

### Step 1 — Query Active Frameworks

Call `project.get_audit_config` MCP tool with the current projectId.

Returns flags: `soc2enabled`, `hipaaenabled`, `hitrustenabled`, `gdprenabled`

If MCP is unavailable, check `ai-settings.json` for a `compliance` block.

**If ALL flags are false → compliance context is INACTIVE. Skip all compliance steps.**

### Step 2 — Load Active Rule Files

For each enabled framework, read the corresponding rules file from the project root:

| Flag | File |
|------|------|
| `soc2enabled: true` | `SOC2_SDLC_Compliance_Rules.md` |
| `hipaaenabled: true` | `HIPAA_SDLC_Compliance_Rules.md` |
| `hitrustenabled: true` | `HITRUST_SDLC_Compliance_Rules.md` |
| `gdprenabled: true` | `GDPR_SDLC_Compliance_Rules.md` |

Load only the SDLC-relevant sections for the current phase:
- **Design/Scope** → Requirements and Design phase sections
- **Implementation** → Development phase sections
- **Testing** → Testing phase sections
- **Release** → Deployment and Maintenance phase sections

### Step 3 — Build Compliance Context

Produce a summary for use in subsequent steps:

```
ACTIVE FRAMEWORKS: [SOC2] [HIPAA] [HITRUST] [GDPR]

PHASE-RELEVANT REQUIREMENTS:
  SOC2:    [key requirements for this phase]
  HIPAA:   [key requirements for this phase]
  HITRUST: [key requirements for this phase]
  GDPR:    [key requirements for this phase]

DATA TRIGGERS (flag if scope touches any of these):
  - Authentication / authorization / access control
  - Personal data (PII), health data (PHI), financial data
  - Encryption, key management, secrets
  - Audit logging or monitoring
  - Data retention or deletion
  - Third-party integrations or OAuth tokens
  - Cross-border data transfer (GDPR)
  - Separation of duties in workflow (SOC2 / HITRUST)
```

### Step 4 — Inject into Work

- **buildscope**: Surface relevant requirements during discovery; add to Functional Requirements; add Compliance section to scope document
- **createSpecs**: Compliance requirements from scope flow through automatically
- **implement**: Flag compliance-relevant code areas; check separation of duties rules
- **compound**: Populate Compliance Evidence section using active framework requirements
- **code-review**: Activate Compliance Reviewer with framework-specific checklist

### If Frameworks Are Enabled AFTER Specs Exist

Run `/compliance-scan` to retroactively analyse existing scopes and specs.
This is a separate command, not part of the normal flow.
