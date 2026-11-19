/**
 * One-off script: seed 3 CompoundLearning documents for the wxKanban project.
 * Run: npx tsx scripts/seed-learnings.ts
 */
import "dotenv/config";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { projectdocuments } from "../src/db/schema/projectdocuments.js";

const PROJECT_ID = "ba924193-0335-4080-9fa6-33cd6b81300a";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);

const docs = [
  {
    title: "Engineering Skills Framework Added to Kit",
    doctype: "CompoundLearning",
    filepath: ".claude/compound/learnings/engineering-skills-2026-05-02.md",
    content: `---
title: "Engineering Skills Framework Added to Kit"
type: KNOWLEDGE
date: "2026-05-02"
author: "andy@wxperts.com"
compliance_relevant: false
status: current
---

## What Was Solved / Decided

Added a structured set of engineering methodology skills to the wxKanban kit, drawn from Matt Pocock's engineering skills repo and EveryInc's compound-engineering-plugin. These teach professional thinking patterns to new developers using the tool.

## Context

The kit needed more than lifecycle management — it needed to teach developers *how professionals think* about debugging, testing, architecture, and issue management. Target customer: a smart career-changer who can already think in systems but needs the software vocabulary and professional habits.

## What Was Done

Added 7 skills to .claude/:
- **diagnose** — 6-phase disciplined bug diagnosis (reproduce → minimise → hypothesise → instrument → fix → post-mortem)
- **zoom-out** — one-liner to map all modules and callers before touching unfamiliar code
- **tdd** — test-driven development with vertical tracer-bullet slices; anti-pattern warning against horizontal slicing
- **triage** — issue state machine (needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix)
- **wxICA** (wxKanban Improve Codebase Architecture) — mechanical drift audit (dangling refs, cross-package imports, build-mode coverage, spec-interaction conflicts) + deletion-test deepening
- **compound** — document solved problems as searchable, compliance-ready knowledge
- **code-review** — parallel reviewer personas tuned for wxKanban stack (TypeScript, Express, Drizzle ORM)

Also added CONTEXT.md domain glossary and docs/adr/ convention.

## Why This Approach

All skills include a "Why This Matters" section written for someone with real-world problem-solving experience (e.g. an ex-mechanic), not CS theory. Every skill is explicitly tool-agnostic — methodology applies regardless of which AI assistant is used.

Core principle embedded throughout: **critical thinking and problem solving is the real job. The technology is the current set of tools.**

## What to Watch

- grill-with-docs skill not yet added — would complement buildscope's adversarial questioning
- compound skill requires project.get_audit_config MCP tool for compliance context loading
- Skills reference CONTEXT.md — needs population per project for full value
`,
  },
  {
    title: "Compliance Framework Integrated into SDLC Pipeline",
    doctype: "CompoundLearning",
    filepath: ".claude/compound/learnings/compliance-integration-2026-05-02.md",
    content: `---
title: "Compliance Framework Integrated into SDLC Pipeline"
type: COMPLIANCE
date: "2026-05-02"
author: "andy@wxperts.com"
compliance_relevant: true
compliance_frameworks: [SOC2, HIPAA, HITRUST, GDPR]
status: current
---

## What Was Solved / Decided

Wired SOC2/HIPAA/HITRUST/GDPR rules files into the SDLC pipeline so active frameworks are automatically consulted during scope building, spec creation, compound documentation, and code review.

## Context

Compliance rules files existed on disk but had no effect on what AI tools produced. Scopes and specs were being created without compliance requirements. Frameworks could be enabled in the DB but were invisible to the development workflow.

## What Was Done

### Controls Applied
- \`_wxAI/rules/compliance-context.md\` — shared loading pattern; reads appauditconfiguration via project.get_audit_config MCP before any spec/scope work
- \`project.get_audit_config\` MCP tool — returns active framework flags (soc2enabled, hipaaenabled, hitrustenabled, gdprenabled) and activeFrameworks list
- \`buildscope.md\` updated — loads compliance context first; surfaces requirements during discovery; adds Compliance Requirements section to scope output
- \`compound\` skill updated — Compliance Evidence section required when frameworks active; references specific rules from loaded files
- \`code-review\` skill updated — Compliance Reviewer activates with framework-specific checklist
- \`compliance-scan.md\` command — retroactive analysis of existing scopes/specs; mode:audit for pre-audit gap reports

### Data Handling
- Framework flags stored in appauditconfiguration table, per project (appid = projectid)
- Compound documents tagged with compliance_relevant and compliance_frameworks for searchability
- Documents pushed to projectdocuments (CompoundLearning doctype) and surfaced in dashboard Learnings panel

### Access Control
- project.get_audit_config requires valid WXKANBAN_API_TOKEN
- Only ADMIN/SYSADMIN can trigger compliance report regeneration endpoints

### Audit Trail
- All compliance-relevant compound documents tagged compliance_relevant: true with framework list
- Compliance Evidence section in each compound doc provides dated, specific, contextual audit evidence
- compliance-scan mode:audit produces read-only gap report for auditors

### Risk Assessment
- Risk: frameworks enabled after specs exist → mitigated by /compliance-scan retroactive analysis
- Risk: MCP offline → compliance context not loaded; mitigated by graceful degradation in compliance-context.md
- Residual: quality of evidence depends on developer discipline running /compound consistently

## Why This Approach

SOC2/HIPAA/HiTrust auditors need dated, specific, contextual evidence written at time of work. This makes compliance evidence a byproduct of normal development rather than extra paperwork — exactly what frameworks reward.

## What to Watch

- appauditconfiguration may not have a row for projects created before this feature — returns all-false; user must go to Compliance > Settings to create the record
- HIPAA and GDPR have DB flags but limited rule engine implementation (SOC2 and HITRUST are complete)
- Consumer projects need copies of the *_SDLC_Compliance_Rules.md files at project root
`,
  },
  {
    title: "SOC2 Gap Analysis — wxKanban Initial Assessment (38% Ready)",
    doctype: "CompoundLearning",
    filepath: ".claude/compound/learnings/soc2-gap-analysis-2026-05-02.md",
    content: `---
title: "SOC2 Gap Analysis — wxKanban Initial Assessment (38% Ready)"
type: COMPLIANCE
date: "2026-05-02"
author: "andy@wxperts.com"
compliance_relevant: true
compliance_frameworks: [SOC2]
status: current
---

## What Was Solved / Decided

First SOC2 compliance scan performed across key scopes (013, 005, 018, 019, 023) and auth middleware. Current readiness: **38%**. Critical gaps identified requiring action before a Type I assessment.

## Compliance Evidence

### Controls Verified in Code

**CC6.1 — Logical Access (Partial)**
- JWT authentication middleware validates all requests; extracts userid, email, companyid, usertype
- Role-based: ADMIN, TEAM_MANAGER, MEMBER enforced via token claim
- Company scoping: all queries filter by companyid from token
- Gap: no MFA enforced for privileged access

**CC6.2 — User Provisioning (Partial)**
- User registration flow with email verification
- Company scoping enforced on all data access
- Gap: no formal approval workflow for admin role assignment

**CC7.1 — Security Detection (Partial)**
- Pino structured logging captures auth failures with userid, timestamp
- Audit framework (Spec 013) detects compliance violations post-implementation
- Gap: successful authentications not logged; no SIEM integration

**CC7.4 — Change Management (Strong)**
- 6-phase lifecycle gates enforce design→implementation→QA→human→beta→release
- Kit update distribution (Spec 019 R9) implements accept/defer/escalate workflow
- Stage gates prevent unauthorized deployments

**CC7.5 — System Documentation (Strong)**
- projectdocuments table stores all specs, plans, lifecycle docs
- compound learnings create additional audit trail with dated entries
- Audit framework produces compliance reports stored in DB

### Critical Gaps

**CC6.6 — Encryption (CRITICAL)**
- Spec 019 R0 deferred: plaintext DB credentials in repo history — rotate immediately
- Spec 005 billing data: no encryption-at-rest requirement specified
- Spec 023 subscriptionbillingevents.payload: sensitive metadata potentially unencrypted
- Remediation: rotate credentials, implement AES-256-GCM for billing fields

**CC7.3 — SDLC Security Requirements (CRITICAL)**
- No mandatory security section in scope templates
- No threat modeling gate before spec approval
- No SAST/SCA in CI pipeline
- Remediation: add Design-stage security checklist; require threat model for auth/billing/external integration specs

**CC6.1 — MFA (HIGH)**
- JWT is single-factor only
- No MFA for admin operations
- Remediation: add TOTP/WebAuthn for admin users

**CC7.2 — Incident Response (HIGH)**
- No documented incident response procedures
- No escalation path for critical audit findings
- Remediation: create incident response SOP; auto-escalate critical findings from audit engine

**CC7.4 — Change Management Documentation (HIGH)**
- Lifecycle gates exist but no formal CAB documentation
- No rollback procedures documented
- Remediation: document CAB members, SLA, rollback criteria

### Data Handling
- JWT tokens: 24h expiry, httpOnly cookies — compliant
- OAuth tokens: AES-256-GCM encrypted in DB — compliant
- Billing data: encryption not yet specified — gap
- Audit logs: Pino JSON stdout — needs centralization to CloudWatch/ELK

### Access Control
- RBAC via JWT usertype claim: ADMIN, TEAM_MANAGER, MEMBER
- Company scoping on all DB queries
- Admin endpoints gated by requireAuth + usertype check
- Gap: no MFA, no session recording, no JIT elevation

### Risk Assessment

| Risk | Likelihood | Impact | Status |
|------|-----------|--------|--------|
| Plaintext DB creds in repo | High | Critical | Must rotate immediately |
| No MFA for admin | Medium | High | Pre-audit requirement |
| Billing data unencrypted | Medium | High | Before processing real billing |
| No incident response plan | Medium | High | Before Type I assessment |
| No SAST in CI | High | Medium | Before next sprint |

## Recommended Next Scopes

1. **SOC2 Security Hardening** — rotate credentials, MFA, SAST in CI, encrypt billing data
2. **Change Management Documentation** — CAB process, rollback procedures, incident response SOP
3. **SDLC Security Gate** — mandatory security checklist in buildscope for Design phase

## If This Ever Breaks

- Auditor asks for access control evidence → authenticateToken middleware + companyauditlogs table
- Auditor asks for encryption → TLS in transit (HTTPS) is covered; at-rest for billing/PHI is a documented gap
- Auditor asks for change management → lifecycle gate enforcement in wxkanban-agent + Spec 019 update distribution
- Auditor asks for incident response → gap; point to this document as evidence we identified it and created a remediation plan
`,
  },
];

async function main() {
  console.log(`Inserting ${docs.length} compound learning documents...`);
  for (const doc of docs) {
    await db.insert(projectdocuments).values({
      projectid: PROJECT_ID,
      doctype: doc.doctype,
      title: doc.title,
      content: doc.content,
      filepath: doc.filepath,
      isgenerated: false,
    });
    console.log(`  ✓ ${doc.title}`);
  }
  console.log("Done.");
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
