# Compliance Context Rule

## Auto-Discovery (REQUIRED at start of every spec, scope, and documentation task)

Before beginning any `buildscope`, `createSpecs`, `implement`, `compound`, or `code-review` work, load the active compliance frameworks for this project.

Compliance rules live in the wxKanban database and are served over MCP. They are **not** files in your repository — do not look for `SOC2_SDLC_Compliance_Rules.md` or any sibling on disk. A local copy would drift silently against the authoritative version, which is the failure this design removes.

### Step 1 — Query Active Frameworks

Call `project.get_audit_config` with the current projectId.

Returns flags: `soc2enabled`, `hipaaenabled`, `hitrustenabled`, `gdprenabled`, `nistssdfenabled`, `iso27001enabled`, plus `activeFrameworks` and `complianceActive`.

**If `complianceActive` is false → compliance context is INACTIVE. Skip all compliance steps.**

You may skip straight to Step 2; `project.get_compliance_context` performs the same resolution and returns `complianceActive: false` when nothing is enabled.

### Step 2 — Load Active Rules

Call `project.get_compliance_context`:

| Argument | Use |
|---|---|
| `projectId` | required |
| `mode` | `summary` (default) for structured controls; `full` for the complete rules document |
| `phase` | the lifecycle phase you are working in — `Design`, `Implementation`, `QA`, `HumanTesting`, `Beta`, `Release` |
| `keywords` | what the work actually touches, e.g. `["authentication","tokens"]` |

**Use `summary` with a `phase` and `keywords`.** It returns only the controls that bear on the work in hand, which is a fraction of the tokens a whole framework document costs. Reach for `mode: "full"` only when you need the surrounding narrative — writing a compliance section for a scope, or answering a question the structured controls do not settle.

Each returned control carries `controlReference`, `category`, `priority`, `title`, `requirement`, `guidance` and `automated`.

### Step 2a — Failure is a HALT, not a warning

If `complianceActive` is true and the call fails, returns no document for an enabled framework, or reports `missingDocuments`:

**STOP. Report it. Do not continue the task.**

State which frameworks are enabled, that their rules could not be loaded, and that you are not proceeding. Do not treat the failure as INACTIVE, do not substitute your own knowledge of the framework, and do not fall back to any local file. A compliance-enabled project that silently proceeds without its rules produces work that looks reviewed and is not — which is worse than work that was never checked.

The one exception is an entitlement refusal. `project.get_compliance_context` is subscription-gated; if the refusal names an inactive subscription, report that specifically, because the fix is billing rather than configuration.

### Step 3 — Build Compliance Context

Produce a summary for use in subsequent steps:

```
ACTIVE FRAMEWORKS: [SOC2] [HIPAA] [HITRUST] [GDPR] [NIST_SSDF] [ISO27001]

PHASE-RELEVANT REQUIREMENTS:
  <framework>: <control reference where known> — <requirement>

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

Cite `controlReference` whenever the control carries one. An unreferenced control is still binding, but a referenced one is what an auditor can trace — prefer it when both cover the same ground.

### Step 4 — Inject into Work

- **buildscope**: Surface relevant requirements during discovery; add to Functional Requirements; add Compliance section to scope document
- **createSpecs**: Compliance requirements from scope flow through automatically
- **implement**: Flag compliance-relevant code areas; check separation of duties rules
- **compound**: Populate Compliance Evidence section using active framework requirements
- **code-review**: Activate Compliance Reviewer with framework-specific checklist

### If Frameworks Are Enabled AFTER Specs Exist

Run `/compliance-scan` to retroactively analyse existing scopes and specs.
This is a separate command, not part of the normal flow.
