# Spec 126: Customer Data Sovereignty & Audit Readiness — make wxKanban answer the data-protection question natively for all 45 customers, so a compliance-sensitive customer (SOC 2, ISO 27001, GDPR) never needs a white-label. Four pillars: (1) secure-by-default kit landing — every install/upgrade writes and probe-verifies a deny baseline, then re-evaluates project posture automatically; (2) tenant-controlled inference — per-tenant LLM and embeddings endpoints wired through the existing SCOPE-099 resolveEndpoint seam in both the app and the MCP server, fail-closed abstain, keys stored in a key-id-prefixed encrypted format; (3) rotation readiness — a wxRotateCredentials skill (adapters: wxkanban-express, dotnet-wpf, generic interview fallback) generating a project-specific, blast-radius-tiered, document-only rotation runbook, validated against the hand-built wxKanban golden reference; (4) continuous audit — per-implement compliance evaluation surfacing findings before the test gate, phase-boundary PDF artifacts carrying destination evidence, and a posture mode for /compliance-scan separating document-compliance from real project posture. Everything ships inert at deploy and activates only at kit installation/upgrade.

**Spec Number**: 126
**Status**: `draft`
**Created**: 2026-08-13
**Depends On**: None
**Source**: `specs/Project-Scope/126-customer-data-sovereignty-audit-readines.md`

## Overview
Customer Data Sovereignty & Audit Readiness — make wxKanban answer the data-protection question natively for all 45 customers, so a compliance-sensitive customer (SOC 2, ISO 27001, GDPR) never needs a white-label. Four pillars: (1) secure-by-default kit landing — every install/upgrade writes and probe-verifies a deny baseline, then re-evaluates project posture automatically; (2) tenant-controlled inference — per-tenant LLM and embeddings endpoints wired through the existing SCOPE-099 resolveEndpoint seam in both the app and the MCP server, fail-closed abstain, keys stored in a key-id-prefixed encrypted format; (3) rotation readiness — a wxRotateCredentials skill (adapters: wxkanban-express, dotnet-wpf, generic interview fallback) generating a project-specific, blast-radius-tiered, document-only rotation runbook, validated against the hand-built wxKanban golden reference; (4) continuous audit — per-implement compliance evaluation surfacing findings before the test gate, phase-boundary PDF artifacts carrying destination evidence, and a posture mode for /compliance-scan separating document-compliance from real project posture. Everything ships inert at deploy and activates only at kit installation/upgrade. gives wxKanban a clearly defined business workflow with accountable outcomes. Customers building on wxKanban hold material that must not leave their control — source code, credentials, business data — and increasingly must PROVE it: SOC 2 in the US, ISO 27001 in the EU, GDPR for EU personal data. Today the product gives them nothing for either half. (1) No secure default: a new project starts with the AI assistant able to read .env, tracked credential files, and key material; nobody notices until someone goes looking — demonstrated 2026-08-13 when an audit session read 80 keys plus four live App Runner env maps into a model context. (2) No way to keep server-side inference inside their boundary: the per-tenant endpoint seam (SCOPE-099, resolveEndpoint baseUrl/apiKey overrides) exists in code and is wired to nothing; MCP-server AI paths (feedback triage → Groq, capability embeddings → Google) have no seam at all — and embeddings fire automatically on every capability-index refresh and buildscope reuse check, carrying customer scope text. (3) No procedure when a credential does leak: the existing rotation runbook had been silently wrong for months (dead region, deleted staging service, 3 of 5 DATABASE_URL consumers missing) and one key (SETTINGS_ENCRYPTION_KEY) destroys data if rotated naively. (4) Compliance tooling audits the paperwork, not the project: /compliance-scan reads scopes and specs; a project passes it with credentials committed to git. The cost today: every such question is answered per-customer, by hand, differently each time — and the first customer far enough along (Alitho, SOC 2 + HITRUST, leaning toward their own LLM) is being quoted a white-label: a permanent per-customer deployment, second release train, and support surface. At 45 customers this does not scale. This scope pre-empts the issue before the deadline forces it. This scope covers Fifteen functional requirements across four pillars, plus cross-cutting items. PILLAR 1 — SECURE-BY-DEFAULT KIT LANDING. FR-001 Baseline write: kit init writes the deny baseline (.env*, *.pem/*.key/*.pfx/id_rsa*, *.tfvars, tracked credential-bearing config such as ai-settings.json); upgrade MERGES, never clobbers customer settings (SCOPE-121 rule). FR-002 Baseline proof: init verifies each rule holds via safe probe (a nonexistent path matching the pattern — a rule failure returns file-not-found, never a secret) and emits an init report naming what was written and each probe result; the report doubles as the baseline manifest that gates activation. FR-003 Landing re-evaluation: the posture engine runs automatically on EVERY kit install and upgrade; findings report, never block. PILLAR 2 — TENANT-CONTROLLED INFERENCE. FR-004 Per-tenant endpoints: tenant LLM endpoint/key/model AND embeddings endpoint stored as one row (tenantaiendpoints); all server-side AI resolves per-tenant → env → preset through the existing resolveEndpoint seam; switching embeddings endpoints triggers a bounded reindex of that tenant's capability vectors, search abstains until complete; phase 1 config is sysadmin-set (self-serve UI deferred, sysadmin panel optional/non-blocking). FR-005 Credential custody: tenant AI keys encrypted at rest in a key-id-prefixed ciphertext format (keyid:iv:authTag:ciphertext) — per SOC 2 CC6.7 the design names algorithm, key source, and rotation path before code is written; no repeat of the versionless format. FR-006 Destination evidence: every server-side AI call logs its resolved destination at the single seam; rendered into the PDF artifact by query — no separate evidence store. FR-007 MCP parity: the MCP server's AI paths (feedback triage, capability embeddings) read the SAME tenantaiendpoints row (shared database, tenant identity already on every call via token scope) — no separate MCP config surface; if a path cannot honor the tenant endpoint it ABSTAINS (skips for that tenant) rather than falling back to a global provider. PILLAR 3 — ROTATION READINESS. FR-008 Generator skill: wxRotateCredentials — SKILL.md + adapters (wxkanban-express, dotnet-wpf, generic interview fallback), adapters are method documents modeled on wxCreateTestPlan, delivered as one copy plus the MCP prompt-registry twin. FR-009 Discovery: finds env read sites; classifies import-time-cached (restart required) vs per-call reads; maps every deploy surface requiring lockstep update. FR-010 Blast-radius tiers: output classifies every secret into tiers including DO-NOT-ROTATE with the data-destruction mechanism spelled out; phase 1 is document-only, no --Execute. The rotation-runbook-exists-and-is-current check lives in the FR-013 posture checklist mapped to the key-rotation control (the finding IS the audit wiring — no separate mechanism). PILLAR 4 — CONTINUOUS AUDIT AND EVIDENCE. FR-011 Per-implement audit: an incremental compliance slice (posture + machine-checked pattern controls scoped to the changed surface) runs on every implement run, surfacing findings before the test gate; the full audit runs at lifecycle phase boundaries and on demand. FR-012 PDF artifact: generated via the existing MarkdownPdfRenderer/JsReport machinery per phase and on demand; deterministic on unchanged input; carries the FR-006 destination-evidence table. FR-013 Posture mode: /compliance-scan --posture audits the REAL project (deny baseline present and holding, secrets in tracked files, rotation runbook currency, tenant endpoint config), separates document-compliance from project posture, maps each gap to a control reference, and emits remediation items into the existing SCOPE-013 audit-task flow. One posture engine, three triggers: kit install, kit upgrade, on-demand. CROSS-CUTTING. FR-014 GDPR offboarding: when GDPR is active, tenant departure destroys the tenantaiendpoints row and stored keys, writing a tenanterasurerecords row as Article-17 evidence. FR-015 Framework toggle parity: iso27001enabled/nistssdfenabled exist in the MCP schema but not the main-app enums — ISO 27001 must be togglable and visible on both surfaces. DATA/SCHEMA: new tables tenantaiendpoints and tenanterasurerecords (plural, lowercase, no underscores); manual SQL per SCOPE-117 (reviewed, hand-applied, schema-change-log, db:drift-verified); tenantaiendpoints declared in BOTH the app schema and the MCP partial mirror in the same change. API: sysadmin-scoped endpoint-config CRUD; posture report + PDF download extending SCOPE-013's audit routes; destination-evidence query. KIT: baseline writer + probe + posture trigger at init/upgrade; new commands surface in the Cockpit; VSIX rebuilt. 1. The ISMS. ISO 27001 is a management-system standard; coverage is 15 of 93 Annex A controls, SDLC slice only. No generated artifact ever says "certified" or "compliant" — the PDF states what was checked and what was found. This constraint exists so sales language cannot outrun the product. 2. Executing rotation: phase 1 emits the procedure; a human runs it. A gated --Execute mode is a later phase. 3. Hosting or choosing the customer's model: wxperts accepts an endpoint, never operates one. 4. Replacing /compliance-scan: it is extended with a posture mode, not replaced. 5. The SETTINGS_ENCRYPTION_KEY re-encrypt migration: named blocker, built separately; this scope must not create pressure to rotate that key, and existing ciphertext columns are untouched. 6. White-label / per-customer single-tenant deployment: the explicit non-goal — this scope exists to make it unnecessary. 7. Self-serve tenant endpoint UI: deferred; phase 1 is sysadmin-set (panel optional, non-blocking). 8. Tenant offboarding beyond the GDPR-active case. 9. Client-side AI provider choice (which coding assistant a customer runs against their source) — the customer's own contractual/tooling decision; this scope covers the kit baseline that limits what any client can read, not which client they use.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Customer technical lead — accountable both for keeping their material inside their boundary and for proving it to an auditor |
| **Secondary Actors** | Tenant admin — chooses where the tenant's data is processed (BYO inference/embeddings endpoints), External auditor — consumes the PDF evidence artifacts, wxperts sysadmin — phase-1 endpoint configuration (self-serve UI deferred) |
| **Key Value** | Customers building on wxKanban hold material that must not leave their control — source code, credentials, business data — and increasingly must PROVE it: SOC 2 in the US, ISO 27001 in the EU, GDPR for EU personal data. Today the product gives them nothing for either half. (1) No secure default: a new project starts with the AI assistant able to read .env, tracked credential files, and key material; nobody notices until someone goes looking — demonstrated 2026-08-13 when an audit session read 80 keys plus four live App Runner env maps into a model context. (2) No way to keep server-side inference inside their boundary: the per-tenant endpoint seam (SCOPE-099, resolveEndpoint baseUrl/apiKey overrides) exists in code and is wired to nothing; MCP-server AI paths (feedback triage → Groq, capability embeddings → Google) have no seam at all — and embeddings fire automatically on every capability-index refresh and buildscope reuse check, carrying customer scope text. (3) No procedure when a credential does leak: the existing rotation runbook had been silently wrong for months (dead region, deleted staging service, 3 of 5 DATABASE_URL consumers missing) and one key (SETTINGS_ENCRYPTION_KEY) destroys data if rotated naively. (4) Compliance tooling audits the paperwork, not the project: /compliance-scan reads scopes and specs; a project passes it with credentials committed to git. The cost today: every such question is answered per-customer, by hand, differently each time — and the first customer far enough along (Alitho, SOC 2 + HITRUST, leaning toward their own LLM) is being quoted a white-label: a permanent per-customer deployment, second release train, and support surface. At 45 customers this does not scale. This scope pre-empts the issue before the deadline forces it. |
| **Scope Boundary** | Fifteen functional requirements across four pillars, plus cross-cutting items. PILLAR 1 — SECURE-BY-DEFAULT KIT LANDING. FR-001 Baseline write: kit init writes the deny baseline (.env*, *.pem/*.key/*.pfx/id_rsa*, *.tfvars, tracked credential-bearing config such as ai-settings.json); upgrade MERGES, never clobbers customer settings (SCOPE-121 rule). FR-002 Baseline proof: init verifies each rule holds via safe probe (a nonexistent path matching the pattern — a rule failure returns file-not-found, never a secret) and emits an init report naming what was written and each probe result; the report doubles as the baseline manifest that gates activation. FR-003 Landing re-evaluation: the posture engine runs automatically on EVERY kit install and upgrade; findings report, never block. PILLAR 2 — TENANT-CONTROLLED INFERENCE. FR-004 Per-tenant endpoints: tenant LLM endpoint/key/model AND embeddings endpoint stored as one row (tenantaiendpoints); all server-side AI resolves per-tenant → env → preset through the existing resolveEndpoint seam; switching embeddings endpoints triggers a bounded reindex of that tenant's capability vectors, search abstains until complete; phase 1 config is sysadmin-set (self-serve UI deferred, sysadmin panel optional/non-blocking). FR-005 Credential custody: tenant AI keys encrypted at rest in a key-id-prefixed ciphertext format (keyid:iv:authTag:ciphertext) — per SOC 2 CC6.7 the design names algorithm, key source, and rotation path before code is written; no repeat of the versionless format. FR-006 Destination evidence: every server-side AI call logs its resolved destination at the single seam; rendered into the PDF artifact by query — no separate evidence store. FR-007 MCP parity: the MCP server's AI paths (feedback triage, capability embeddings) read the SAME tenantaiendpoints row (shared database, tenant identity already on every call via token scope) — no separate MCP config surface; if a path cannot honor the tenant endpoint it ABSTAINS (skips for that tenant) rather than falling back to a global provider. PILLAR 3 — ROTATION READINESS. FR-008 Generator skill: wxRotateCredentials — SKILL.md + adapters (wxkanban-express, dotnet-wpf, generic interview fallback), adapters are method documents modeled on wxCreateTestPlan, delivered as one copy plus the MCP prompt-registry twin. FR-009 Discovery: finds env read sites; classifies import-time-cached (restart required) vs per-call reads; maps every deploy surface requiring lockstep update. FR-010 Blast-radius tiers: output classifies every secret into tiers including DO-NOT-ROTATE with the data-destruction mechanism spelled out; phase 1 is document-only, no --Execute. The rotation-runbook-exists-and-is-current check lives in the FR-013 posture checklist mapped to the key-rotation control (the finding IS the audit wiring — no separate mechanism). PILLAR 4 — CONTINUOUS AUDIT AND EVIDENCE. FR-011 Per-implement audit: an incremental compliance slice (posture + machine-checked pattern controls scoped to the changed surface) runs on every implement run, surfacing findings before the test gate; the full audit runs at lifecycle phase boundaries and on demand. FR-012 PDF artifact: generated via the existing MarkdownPdfRenderer/JsReport machinery per phase and on demand; deterministic on unchanged input; carries the FR-006 destination-evidence table. FR-013 Posture mode: /compliance-scan --posture audits the REAL project (deny baseline present and holding, secrets in tracked files, rotation runbook currency, tenant endpoint config), separates document-compliance from project posture, maps each gap to a control reference, and emits remediation items into the existing SCOPE-013 audit-task flow. One posture engine, three triggers: kit install, kit upgrade, on-demand. CROSS-CUTTING. FR-014 GDPR offboarding: when GDPR is active, tenant departure destroys the tenantaiendpoints row and stored keys, writing a tenanterasurerecords row as Article-17 evidence. FR-015 Framework toggle parity: iso27001enabled/nistssdfenabled exist in the MCP schema but not the main-app enums — ISO 27001 must be togglable and visible on both surfaces. DATA/SCHEMA: new tables tenantaiendpoints and tenanterasurerecords (plural, lowercase, no underscores); manual SQL per SCOPE-117 (reviewed, hand-applied, schema-change-log, db:drift-verified); tenantaiendpoints declared in BOTH the app schema and the MCP partial mirror in the same change. API: sysadmin-scoped endpoint-config CRUD; posture report + PDF download extending SCOPE-013's audit routes; destination-evidence query. KIT: baseline writer + probe + posture trigger at init/upgrade; new commands surface in the Cockpit; VSIX rebuilt. 1. The ISMS. ISO 27001 is a management-system standard; coverage is 15 of 93 Annex A controls, SDLC slice only. No generated artifact ever says "certified" or "compliant" — the PDF states what was checked and what was found. This constraint exists so sales language cannot outrun the product. 2. Executing rotation: phase 1 emits the procedure; a human runs it. A gated --Execute mode is a later phase. 3. Hosting or choosing the customer's model: wxperts accepts an endpoint, never operates one. 4. Replacing /compliance-scan: it is extended with a posture mode, not replaced. 5. The SETTINGS_ENCRYPTION_KEY re-encrypt migration: named blocker, built separately; this scope must not create pressure to rotate that key, and existing ciphertext columns are untouched. 6. White-label / per-customer single-tenant deployment: the explicit non-goal — this scope exists to make it unnecessary. 7. Self-serve tenant endpoint UI: deferred; phase 1 is sysadmin-set (panel optional, non-blocking). 8. Tenant offboarding beyond the GDPR-active case. 9. Client-side AI provider choice (which coding assistant a customer runs against their source) — the customer's own contractual/tooling decision; this scope covers the kit baseline that limits what any client can read, not which client they use. |


## User Scenarios & Testing

### US1 — Customer Data Sovereignty Audit Readines primary workflow

**Actor**: Customer technical lead — accountable both for keeping their material inside their boundary and for proving it to an auditor

**Scenario**:
1. Customer technical lead — accountable both for keeping their material inside their boundary and for proving it to an auditor initiates the primary customer data sovereignty & audit readiness — make wxkanban answer the data-protection question natively for all 45 customers, so a compliance-sensitive customer (soc 2, iso 27001, gdpr) never needs a white-label. four pillars: (1) secure-by-default kit landing — every install/upgrade writes and probe-verifies a deny baseline, then re-evaluates project posture automatically; (2) tenant-controlled inference — per-tenant llm and embeddings endpoints wired through the existing scope-099 resolveendpoint seam in both the app and the mcp server, fail-closed abstain, keys stored in a key-id-prefixed encrypted format; (3) rotation readiness — a wxrotatecredentials skill (adapters: wxkanban-express, dotnet-wpf, generic interview fallback) generating a project-specific, blast-radius-tiered, document-only rotation runbook, validated against the hand-built wxkanban golden reference; (4) continuous audit — per-implement compliance evaluation surfacing findings before the test gate, phase-boundary pdf artifacts carrying destination evidence, and a posture mode for /compliance-scan separating document-compliance from real project posture. everything ships inert at deploy and activates only at kit installation/upgrade. workflow inside wxKanban.
2. Customer technical lead — accountable both for keeping their material inside their boundary and for proving it to an auditor completes the in-scope steps defined for the first iteration and confirms the expected business rules.
3. The system records the result and exposes the updated state to the affected stakeholders.

**Expected outcome**: SC-1 Init is provably safe: fresh kit init on a clean repo produces an active deny baseline BEFORE the first AI turn — probe denied, report emitted. Binary pass/fail.

### US2 — Customer Data Sovereignty Audit Readines review and coordination flow

**Actor**: Tenant admin — chooses where the tenant's data is processed (BYO inference/embeddings endpoints), External auditor — consumes the PDF evidence artifacts, wxperts sysadmin — phase-1 endpoint configuration (self-serve UI deferred)

**Scenario**:
1. A secondary actor reviews the result produced by the primary workflow.
2. The actor confirms that the information needed for the next downstream step is available and aligned with the agreed scope boundary.
3. The workflow remains visible and understandable across the affected teams.

**Expected outcome**: SC-2 Zero-leak for BYO tenants: with tenant endpoints configured, exercising every server-side AI feature (scope generation, interview, triage, reuse check) yields a destination log showing 100% tenant-endpoint-or-abstain and 0 global-provider calls across BOTH codebases; the log renders into the PDF artifact.

### US3 — Customer Data Sovereignty Audit Readines exception handling

**Actor**: Customer technical lead — accountable both for keeping their material inside their boundary and for proving it to an auditor

**Scenario**:
1. The primary workflow encounters a missing dependency, invalid state, or out-of-scope request.
2. The system keeps the scope boundary visible and prevents accidental overbuild or silent failure.
3. Follow-up actions, risks, or approval decisions are captured for later review.

**Expected outcome**: SC-3 Generator matches the hand-built reference: running wxRotateCredentials against wxKanban itself and diffing against infra/secrets-rotation-runbook.md rediscovers all 5 DATABASE_URL consumers, the import-time-captured secrets, and SETTINGS_ENCRYPTION_KEY classified DO-NOT-ROTATE with its destruction mechanism. Self-test only: read-only discovery in our own repo, document output, zero customer contact.

## Functional Requirements

Sixteen functional requirements across four pillars, plus cross-cutting items. Every
server-side requirement ships **inert at deploy** and activates per-project only once the
FR-002 baseline manifest exists (see Constraints).

### PILLAR 1 — Secure-by-default kit landing

### FR-001 — Baseline write

Kit init MUST write the deny baseline into the project's Claude settings: `.env*`,
`*.pem` / `*.key` / `*.pfx` / `id_rsa*`, `*.tfvars`, and tracked credential-bearing config
such as `ai-settings.json`. Kit **upgrade MUST merge, never clobber** customer settings
(the SCOPE-121 rule).

Pattern-based deny rules alone are **not sufficient** and MUST NOT be shipped as the whole
baseline. They name the reader, not the target: a rule denying `Bash(cat .env*)` is bypassed
by `grep`, `head`, `tail`, `sed`, `awk`, `strings`, `python -c`, or `node -e`. Demonstrated
2026-08-13, when `grep -rn "…" --include=*.env .` printed live key material into a session
transcript on a machine whose deny rules were correctly installed. The baseline MUST therefore
also install a **target-matching command hook** (PreToolUse over Bash and the search tools)
that blocks on the file being referenced regardless of which binary references it. Reference
implementation: `~/.claude/hooks/block-secret-reads.sh`.

**Acceptance Criteria**:
- [ ] A fresh init on a clean repo leaves both the deny rules and the command hook in place.
- [ ] An upgrade over customer-modified settings preserves every pre-existing rule and hook.
- [ ] Reading a baseline-covered file is blocked through at least six distinct reader binaries.
- [ ] Searching *for* the text `.env` (without reading a matching file) is NOT blocked.

### FR-002 — Baseline proof

Init MUST verify each rule actually holds, using a safe probe — a **nonexistent** path that
matches the pattern, so a working rule denies and a broken rule returns file-not-found rather
than a secret. It MUST emit an init report naming every rule written and each probe result.
That report **doubles as the baseline manifest** and is the per-project activation key for
every server-side feature in this scope.

**Acceptance Criteria**:
- [ ] The report distinguishes rule-denied from file-absent; a silently inert rule fails the probe.
- [ ] No probe can emit secret content on any outcome.
- [ ] The manifest is machine-readable and its absence is detectable by server-side callers.

### FR-003 — Landing re-evaluation

The posture engine MUST run automatically on **every** kit install and upgrade. Findings
report; they MUST NOT block the install or upgrade.

**Acceptance Criteria**:
- [ ] Install and upgrade both trigger evaluation without an explicit command.
- [ ] A failing posture never prevents the kit from landing.

### PILLAR 2 — Tenant-controlled inference

### FR-004 — Per-tenant endpoints

Tenant LLM endpoint/key/model **and** embeddings endpoint MUST be stored as one
`tenantaiendpoints` row. All server-side AI MUST resolve per-tenant → env → preset through the
existing `resolveEndpoint` seam ([llm-provider.ts:135](src/server/ai/llm-provider.ts#L135)),
whose `baseUrl`/`apiKey` overrides exist today and are passed by no call site. Switching a
tenant's embeddings endpoint MUST trigger a bounded reindex of that tenant's capability
vectors, with search abstaining until it completes. Phase-1 configuration is sysadmin-set.

**Note:** embeddings currently have **no tenant seam at all** — all call sites use the
process-wide env config, so a BYO tenant would still ship embeddings to the default provider.
Closing that is part of this FR, not an assumption.

**Acceptance Criteria**:
- [ ] Both LLM and embeddings resolve per-tenant; neither silently falls back to the global provider.
- [ ] Resolution order is per-tenant → env → preset, and is asserted by test.
- [ ] Capability search abstains rather than returning mixed-vector-space results during reindex.

### FR-005 — Credential custody

Tenant AI keys MUST be encrypted at rest in a key-id-prefixed ciphertext format
(`keyid:iv:authTag:ciphertext`, AES-256-GCM). Per SOC 2 CC6.7 the design MUST name algorithm,
key source, and rotation path **before code is written** — no repeat of the versionless format.

**Acceptance Criteria**:
- [ ] No plaintext tenant key is persisted or logged on any path.
- [ ] The stored format carries a key id, so a future rotation can identify what it must re-encrypt.

### FR-006 — Destination evidence

Every server-side AI call MUST log its resolved destination at the single seam. The log is
rendered into the PDF artifact **by query** — no separate evidence store.

**Acceptance Criteria**:
- [ ] Every AI call site produces exactly one destination record.
- [ ] The evidence table can be produced for an arbitrary company and date range.

### FR-007 — MCP parity

The MCP server's AI paths MUST read the **same** `tenantaiendpoints` row (shared database;
tenant identity is already on every call via token scope) — no separate MCP config surface.
A path that cannot honor the tenant endpoint MUST **abstain** (skip for that tenant) rather
than fall back to a global provider. Known paths: feedback triage (currently `api.groq.com`,
`llama-3.3-70b-versatile`) and capability embeddings (currently Google Gemini by code default).

**Acceptance Criteria**:
- [ ] A configured tenant produces zero global-provider calls from the MCP server.
- [ ] An unsupported path abstains visibly (logged, surfaced) rather than failing open.

### PILLAR 3 — Rotation readiness

### FR-008 — Generator skill

`wxRotateCredentials` MUST ship as SKILL.md plus adapters (wxkanban-express, dotnet-wpf,
generic interview fallback). Adapters are **method documents**, modeled on wxCreateTestPlan —
not an adapter framework. Delivery is one copy plus the MCP prompt-registry twin.

**Acceptance Criteria**:
- [ ] The skill runs against a project with no adapter, via the interview fallback.
- [ ] Delivery matches the one-copy-plus-prompt-twin map; consumers receive the twin.

### FR-009 — Discovery

The generator MUST find env read sites, classify **import-time-cached (restart required)**
versus per-call reads, and map every deploy surface requiring lockstep update.

**Acceptance Criteria**:
- [ ] A secret captured at import time is reported as restart-required.
- [ ] Every deploy surface consuming a given secret appears in its entry.

### FR-010 — Blast-radius tiers

Output MUST classify every secret into tiers, including **DO-NOT-ROTATE** with the
data-destruction mechanism spelled out. Phase 1 is document-only — no `--Execute`. The
"rotation runbook exists and is current" check lives in the FR-013 posture checklist mapped to
the key-rotation control; the finding **is** the audit wiring, so no separate mechanism is built.

**Acceptance Criteria**:
- [ ] `SETTINGS_ENCRYPTION_KEY` is classified DO-NOT-ROTATE with its destruction mechanism named.
- [ ] No code path can execute a rotation in phase 1.

### PILLAR 4 — Continuous audit and evidence

### FR-011 — Per-implement audit

An incremental compliance slice — posture plus machine-checked pattern controls, **scoped to
the changed surface** — MUST run on every `implement` run, surfacing findings before the test
gate. The full audit runs at lifecycle phase boundaries and on demand.

**Acceptance Criteria**:
- [ ] A seeded violation surfaces during implement, before QA sees the change.
- [ ] The slice stays cheap enough not to be routinely ignored (scoped to changed files only).
- [ ] With no baseline manifest present, the slice no-ops silently.

### FR-012 — PDF artifact

Generated via the existing MarkdownPdfRenderer/JsReport machinery, per phase and on demand.
MUST be deterministic on unchanged input and MUST carry the FR-006 destination-evidence table.

**Acceptance Criteria**:
- [ ] Regenerating on unchanged input produces a byte-identical document.
- [ ] The artifact never states "certified" or "compliant" (see Constraints).

### FR-013 — Posture mode

`/compliance-scan --posture` MUST audit the **real project** — deny baseline present and
holding, secrets in tracked files, rotation-runbook currency, tenant endpoint config — separate
document-compliance from project posture, map each gap to a control reference, and emit
remediation items into the existing SCOPE-013 audit-task flow. One posture engine, three
triggers: kit install, kit upgrade, on demand.

**Acceptance Criteria**:
- [ ] A project whose specs describe a compliant system but whose repo has committed credentials FAILS posture while PASSING document-compliance, and the report says so distinctly.
- [ ] Every gap carries a control reference from a catalog already in the database.

### Cross-cutting

### FR-014 — GDPR offboarding

When GDPR is active, tenant departure MUST destroy the `tenantaiendpoints` row and stored keys,
writing a `tenanterasurerecords` row as Article-17 evidence.

**Acceptance Criteria**:
- [ ] Departure leaves no recoverable tenant key material.
- [ ] The erasure record is append-only and survives the tenant's deletion.

### FR-015 — Framework toggle parity

`iso27001enabled` / `nistssdfenabled` exist in the MCP schema but not the main-app enums.
ISO 27001 MUST be togglable and visible on **both** surfaces.

**Acceptance Criteria**:
- [ ] Toggling on either surface is reflected on the other.
- [ ] No enum value exists on one side only.

### FR-016 — Enforce the content boundary server-side

*(Added 2026-08-13, after a three-agent egress audit confirmed the documentation-only boundary
holds architecturally but is enforced only by the client.)*

The stated customer boundary is **"only documentation reaches wxKanban — no source, no
secrets."** The code sustains it: the kit's code-emitting handler imports no network client, and
`project.implement` has no field capable of carrying code. **One path contradicts it.**
`project_submit_feedback` accepts verbatim file content
([schemas.ts:130-138](mcp-server/src/utils/schemas.ts#L130-L138)) — persisted to
`feedbacksubmissions.details` and excerpted into a third-party LLM prompt. The VS Code extension
restricts file type and redacts credentials, but the **server enforces neither**: any caller may
attach any UTF-8 content under any filename, and `redactions` is a self-reported client number
the server never verifies. The allowlist also admits `.json`, `.yml`, `.conf`, and `.ini` —
where connection strings live.

The server MUST become the enforcement point:

1. A server-side file-type allowlist on `FeedbackAttachmentSchema`, rejecting source-code
   extensions rather than trusting the client to have done so.
2. A server-side credential scan on attachment content, rejecting or masking on hit, independent
   of the client-reported `redactions` count.
3. Rejection of binary content.
4. The same reasoning applied to the unbounded free-text fields that can carry code by
   accident — `capture_event.rawContent` (no max), `testrunresults.evidence`,
   `upsert_document.bodyMarkdown`.

The schema's own comment already argues size caps must be re-asserted server-side *"because the
client is not the enforcement point"*; this FR applies that same reasoning to content.

**Acceptance Criteria**:
- [ ] A direct MCP call (bypassing the extension) attaching a `.ts` file is rejected by the server.
- [ ] An attachment containing a live-format credential is rejected or masked even when the client reports `redactions: 0`.
- [ ] No attachment content reaches a third-party LLM prompt without passing both checks.
- [ ] The boundary statement given to a customer is verifiable by test, not by convention.

## Data Requirements

**New tables** (plural, lowercase, no underscores; UUID v7 `id`; manual SQL per SCOPE-117 — reviewed, hand-applied, recorded in `specs/117-production-schema-integrity/schema-change-log.md`, verified with `npm run db:drift`):

- **`tenantaiendpoints`** — one row per tenant: `companyid` (FK `companies.id`), `llmbaseurl`, `llmapikeyencrypted`, `llmmodel`, `embeddingsbaseurl`, `embeddingsapikeyencrypted`, `embeddingsmodel`, `keyid`, `createdat`, `updatedat`. Read by BOTH the app (FR-004) and the MCP server (FR-007) — **must be declared in the app schema and the MCP partial schema mirror in the same change**, or MCP reads return `undefined` silently.
- **`tenanterasurerecords`** — FR-014 evidence: `companyid`, `erasedat`, `erasedbyid`, `framework`, `itemsdestroyed` (jsonb), `reason`. Append-only.

**Format and enum changes:**

- Ciphertext format v2 for NEW credential columns only: `keyid:iv:authTag:ciphertext` (AES-256-GCM). Existing encrypted columns untouched — the SETTINGS_ENCRYPTION_KEY migration is explicitly out of scope.
- FR-015 enum parity: add `ISO27001` / `NISTSSDF` to the main-app framework enums that lack them (`complianceaudittasks`, `wxkanbandocuments`, and siblings), matching the MCP schema's existing `iso27001enabled`/`nistssdfenabled` columns.
- SCOPE-013 audit tables (`auditexecutions`, `auditresults`, `auditreportmetadata`): additive use only, no structural changes.
## API Routes

- `GET/PUT/DELETE /api/sysadmin/tenants/:companyid/aiendpoints` — sysadmin-scoped CRUD for tenant endpoint config (phase-1 surface). `DELETE` writes a `tenanterasurerecords` row when GDPR is active (FR-014).
- `GET /api/audit/executions/:id/pdf` — phase-boundary / on-demand PDF artifact download; extends SCOPE-013's existing audit routes, no parallel route family.
- `GET /api/audit/posture/:projectid` — posture report (document-compliance vs project-posture, control-mapped gaps).
- `GET /api/sysadmin/aidestinations?companyid=&from=&to=` — destination-evidence query feeding the PDF table. Reads the seam's log; no separate evidence store.
## Frontend Components

Optional and non-blocking by decision: a small SysAdmin panel for tenant endpoint configuration may ship if convenient, but script/DB-only configuration is the required phase-1 minimum. No customer-facing UI in phase 1 (self-serve tenant UI is explicitly deferred). No other frontend work in this scope.
## Success Criteria

1. SC-1 Init is provably safe: fresh kit init on a clean repo produces an active deny baseline BEFORE the first AI turn — probe denied, report emitted. Binary pass/fail.
2. SC-2 Zero-leak for BYO tenants: with tenant endpoints configured, exercising every server-side AI feature (scope generation, interview, triage, reuse check) yields a destination log showing 100% tenant-endpoint-or-abstain and 0 global-provider calls across BOTH codebases; the log renders into the PDF artifact.
3. SC-3 Generator matches the hand-built reference: running wxRotateCredentials against wxKanban itself and diffing against infra/secrets-rotation-runbook.md rediscovers all 5 DATABASE_URL consumers, the import-time-captured secrets, and SETTINGS_ENCRYPTION_KEY classified DO-NOT-ROTATE with its destruction mechanism. Self-test only: read-only discovery in our own repo, document output, zero customer contact.
4. SC-4 Audit beats the test gate: a seeded violation (hardcoded secret, plaintext credential column) surfaces during implement, before QA; the phase-boundary PDF regenerates byte-identical on unchanged input.
5. SC-5 Retroactive scan separates paperwork from posture: on a project with known gaps, the report distinguishes document-compliance from project-posture and emits control-mapped remediation items.
6. SC-6 White-label averted: one shared deployment serves all 45 customers including BYO tenants; the count of per-customer deployments stays zero.
7. SC-7 No passive customer impact: a project that has not updated its kit shows byte-identical behavior after all server-side pieces deploy — verified by exercising implement on a pre-scope kit against the updated server.

## Key Entities

- **Security Baseline** — the deny-rule set the kit writes at install/upgrade; its **manifest** (the FR-002 init report) is the per-project activation key for every server-side feature in this scope.
- **Tenant AI Endpoint** — a tenant's chosen inference + embeddings destination; one `tenantaiendpoints` row, read by both codebases, resolution order per-tenant → env → preset.
- **Destination Log Entry** — one record per server-side AI call naming the resolved endpoint; the raw material of the evidence table in the PDF artifact.
- **Posture Report** — output of the posture engine (one engine, three triggers: install, upgrade, on-demand); separates document-compliance from project posture, maps gaps to control references.
- **PDF Audit Artifact** — the phase-boundary/on-demand evidence document; deterministic on unchanged input; carries findings + destination evidence; never says "certified" or "compliant".
- **Rotation Runbook** — the wxRotateCredentials output: per-secret consumers, restart requirements, deploy surfaces, blast-radius tier.
- **Blast-Radius Tier** — the classification of a secret by rotation consequence, including DO-NOT-ROTATE for keys whose rotation destroys data.
- **Erasure Record** — the `tenanterasurerecords` row proving GDPR-active offboarding destroyed a tenant's endpoint config and keys.
## Constraints

- MUST deliver only the behavior described within the scope boundary: Fifteen functional requirements across four pillars, plus cross-cutting items. PILLAR 1 — SECURE-BY-DEFAULT KIT LANDING. FR-001 Baseline write: kit init writes the deny baseline (.env*, *.pem/*.key/*.pfx/id_rsa*, *.tfvars, tracked credential-bearing config such as ai-settings.json); upgrade MERGES, never clobbers customer settings (SCOPE-121 rule). FR-002 Baseline proof: init verifies each rule holds via safe probe (a nonexistent path matching the pattern — a rule failure returns file-not-found, never a secret) and emits an init report naming what was written and each probe result; the report doubles as the baseline manifest that gates activation. FR-003 Landing re-evaluation: the posture engine runs automatically on EVERY kit install and upgrade; findings report, never block. PILLAR 2 — TENANT-CONTROLLED INFERENCE. FR-004 Per-tenant endpoints: tenant LLM endpoint/key/model AND embeddings endpoint stored as one row (tenantaiendpoints); all server-side AI resolves per-tenant → env → preset through the existing resolveEndpoint seam; switching embeddings endpoints triggers a bounded reindex of that tenant's capability vectors, search abstains until complete; phase 1 config is sysadmin-set (self-serve UI deferred, sysadmin panel optional/non-blocking). FR-005 Credential custody: tenant AI keys encrypted at rest in a key-id-prefixed ciphertext format (keyid:iv:authTag:ciphertext) — per SOC 2 CC6.7 the design names algorithm, key source, and rotation path before code is written; no repeat of the versionless format. FR-006 Destination evidence: every server-side AI call logs its resolved destination at the single seam; rendered into the PDF artifact by query — no separate evidence store. FR-007 MCP parity: the MCP server's AI paths (feedback triage, capability embeddings) read the SAME tenantaiendpoints row (shared database, tenant identity already on every call via token scope) — no separate MCP config surface; if a path cannot honor the tenant endpoint it ABSTAINS (skips for that tenant) rather than falling back to a global provider. PILLAR 3 — ROTATION READINESS. FR-008 Generator skill: wxRotateCredentials — SKILL.md + adapters (wxkanban-express, dotnet-wpf, generic interview fallback), adapters are method documents modeled on wxCreateTestPlan, delivered as one copy plus the MCP prompt-registry twin. FR-009 Discovery: finds env read sites; classifies import-time-cached (restart required) vs per-call reads; maps every deploy surface requiring lockstep update. FR-010 Blast-radius tiers: output classifies every secret into tiers including DO-NOT-ROTATE with the data-destruction mechanism spelled out; phase 1 is document-only, no --Execute. The rotation-runbook-exists-and-is-current check lives in the FR-013 posture checklist mapped to the key-rotation control (the finding IS the audit wiring — no separate mechanism). PILLAR 4 — CONTINUOUS AUDIT AND EVIDENCE. FR-011 Per-implement audit: an incremental compliance slice (posture + machine-checked pattern controls scoped to the changed surface) runs on every implement run, surfacing findings before the test gate; the full audit runs at lifecycle phase boundaries and on demand. FR-012 PDF artifact: generated via the existing MarkdownPdfRenderer/JsReport machinery per phase and on demand; deterministic on unchanged input; carries the FR-006 destination-evidence table. FR-013 Posture mode: /compliance-scan --posture audits the REAL project (deny baseline present and holding, secrets in tracked files, rotation runbook currency, tenant endpoint config), separates document-compliance from project posture, maps each gap to a control reference, and emits remediation items into the existing SCOPE-013 audit-task flow. One posture engine, three triggers: kit install, kit upgrade, on-demand. CROSS-CUTTING. FR-014 GDPR offboarding: when GDPR is active, tenant departure destroys the tenantaiendpoints row and stored keys, writing a tenanterasurerecords row as Article-17 evidence. FR-015 Framework toggle parity: iso27001enabled/nistssdfenabled exist in the MCP schema but not the main-app enums — ISO 27001 must be togglable and visible on both surfaces. DATA/SCHEMA: new tables tenantaiendpoints and tenanterasurerecords (plural, lowercase, no underscores); manual SQL per SCOPE-117 (reviewed, hand-applied, schema-change-log, db:drift-verified); tenantaiendpoints declared in BOTH the app schema and the MCP partial mirror in the same change. API: sysadmin-scoped endpoint-config CRUD; posture report + PDF download extending SCOPE-013's audit routes; destination-evidence query. KIT: baseline writer + probe + posture trigger at init/upgrade; new commands surface in the Cockpit; VSIX rebuilt.
- MUST keep the following work out of scope for this iteration: 1. The ISMS. ISO 27001 is a management-system standard; coverage is 15 of 93 Annex A controls, SDLC slice only. No generated artifact ever says "certified" or "compliant" — the PDF states what was checked and what was found. This constraint exists so sales language cannot outrun the product. 2. Executing rotation: phase 1 emits the procedure; a human runs it. A gated --Execute mode is a later phase. 3. Hosting or choosing the customer's model: wxperts accepts an endpoint, never operates one. 4. Replacing /compliance-scan: it is extended with a posture mode, not replaced. 5. The SETTINGS_ENCRYPTION_KEY re-encrypt migration: named blocker, built separately; this scope must not create pressure to rotate that key, and existing ciphertext columns are untouched. 6. White-label / per-customer single-tenant deployment: the explicit non-goal — this scope exists to make it unnecessary. 7. Self-serve tenant endpoint UI: deferred; phase 1 is sysadmin-set (panel optional, non-blocking). 8. Tenant offboarding beyond the GDPR-active case. 9. Client-side AI provider choice (which coding assistant a customer runs against their source) — the customer's own contractual/tooling decision; this scope covers the kit baseline that limits what any client can read, not which client they use.
- MUST preserve guided, reviewable workflow decisions instead of relying on undocumented implementation assumptions.
- MUST keep user-visible outcomes aligned with the measurable success criteria defined in this scope.

## Notes

- Integration context: Extends, and must not fork: SCOPE-013 Automated Audit Engine (auditexecutions/auditresults/auditreportmetadata tables and audit-run/audit-check/audit-report/audit-tasks commands — pillar 4 lands here); SCOPE-099 LLM provider portability (resolveEndpoint is the single seam; its baseUrl/apiKey overrides are the documented per-tenant hook, currently unused at both call sites); SCOPE-074 Capability Index (per-tenant embeddings change the vector space — bounded per-tenant reindex on endpoint switch); /compliance-scan (gains --posture mode); SCOPE-125 Conversion Credential Redaction (boundary per CONTEXT.md glossary: 125 SURFACES what must be rotated, 126 generates HOW — neither executes); wxCreateTestPlan (the skill+adapters delivery pattern and the one-copy-plus-MCP-prompt-twin delivery map); SCOPE-121 kit upgrade file preservation (merge-not-clobber); SCOPE-117 production schema integrity (manual SQL workflow); the hosted MCP auto-deploys on push to main and get_command_prompt is fetched live — the delivery vector that makes the inert-at-deploy constraint necessary. Compliance catalogs already in the database: SOC 2 (119 controls), ISO 27001 (15), NIST SSDF (42), HIPAA (48), GDPR (37) — posture findings map to these, no new catalog authored.
- Constraints and risks: CONSTRAINTS. (1) INERT AT DEPLOY, ACTIVE AT KIT LANDING: every server-side piece ships dormant; activation is per-project, keyed to the baseline manifest FR-002 writes at kit install/upgrade. A project that has not updated its kit sees byte-identical behavior — the per-implement audit slice checks for the manifest and no-ops silently when absent. Required because the hosted MCP auto-deploys on every push and command prompts are fetched live at runtime, so an ungated prompt change would reach all 45 customers on their next implement run. (2) Coverage honesty: 15/93 Annex A, SDLC slice, no ISMS, never "certified"/"compliant". (3) Manual schema changes only (SCOPE-117); tenantaiendpoints in both app schema and MCP partial mirror in the same change or MCP reads return undefined silently. (4) Existing ciphertext untouched; new credentials use keyid-prefixed format. (5) Fail closed, never leak: BYO-tenant paths that cannot honor the endpoint abstain; posture findings report, never block installs/upgrades. (6) Document-only rotation in phase 1. (7) Merge-never-clobber on kit upgrade. (8) Adapters are method documents, not code — no adapter framework. (9) Skill delivery: one copy + MCP prompt-registry twin; Cockpit surfacing + VSIX rebuild on new commands. RISKS. (1) Alitho's actual requirement (server-side inference vs client-side source access) is unconfirmed — both flows are in scope, but the answer sequences the pillars; question is with the customer. (2) Per-tenant key custody lands on encryption-key hygiene — mitigated by the keyid-prefixed format and by keeping the SETTINGS_ENCRYPTION_KEY migration explicitly out. (3) Per-implement audit noise: if the incremental slice is slow or noisy it will be ignored — the fate of all noisy gates; slice must stay cheap and scoped to the changed surface. (4) Embeddings reindex windows: capability search abstains during a tenant's reindex — brief feature degradation for BYO tenants, stated rather than hidden. (5) Origin note: 2026-08-13 exposure audit; the hand-built infra/secrets-rotation-runbook.md is the golden reference for the generator.
- Customer-visible or operator-visible history should be limited to outcomes that materially affect workflow review and support.

## Clarifications

### Session 2026-08-13

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | Customers building on wxKanban hold material that must not leave their control — source code, credentials, business data — and increasingly must PROVE it: SOC 2 in the US, ISO 27001 in the EU, GDPR for EU personal data. Today the product gives them nothing for either half. (1) No secure default: a new project starts with the AI assistant able to read .env, tracked credential files, and key material; nobody notices until someone goes looking — demonstrated 2026-08-13 when an audit session read 80 keys plus four live App Runner env maps into a model context. (2) No way to keep server-side inference inside their boundary: the per-tenant endpoint seam (SCOPE-099, resolveEndpoint baseUrl/apiKey overrides) exists in code and is wired to nothing; MCP-server AI paths (feedback triage → Groq, capability embeddings → Google) have no seam at all — and embeddings fire automatically on every capability-index refresh and buildscope reuse check, carrying customer scope text. (3) No procedure when a credential does leak: the existing rotation runbook had been silently wrong for months (dead region, deleted staging service, 3 of 5 DATABASE_URL consumers missing) and one key (SETTINGS_ENCRYPTION_KEY) destroys data if rotated naively. (4) Compliance tooling audits the paperwork, not the project: /compliance-scan reads scopes and specs; a project passes it with credentials committed to git. The cost today: every such question is answered per-customer, by hand, differently each time — and the first customer far enough along (Alitho, SOC 2 + HITRUST, leaning toward their own LLM) is being quoted a white-label: a permanent per-customer deployment, second release train, and support surface. At 45 customers this does not scale. This scope pre-empts the issue before the deadline forces it. |
| 2 | Who are the primary and secondary actors? | Primary actor: Customer technical lead — accountable both for keeping their material inside their boundary and for proving it to an auditor. Secondary actors: Tenant admin — chooses where the tenant's data is processed (BYO inference/embeddings endpoints), External auditor — consumes the PDF evidence artifacts, wxperts sysadmin — phase-1 endpoint configuration (self-serve UI deferred). |
| 3 | What is in scope? | Fifteen functional requirements across four pillars, plus cross-cutting items. PILLAR 1 — SECURE-BY-DEFAULT KIT LANDING. FR-001 Baseline write: kit init writes the deny baseline (.env*, *.pem/*.key/*.pfx/id_rsa*, *.tfvars, tracked credential-bearing config such as ai-settings.json); upgrade MERGES, never clobbers customer settings (SCOPE-121 rule). FR-002 Baseline proof: init verifies each rule holds via safe probe (a nonexistent path matching the pattern — a rule failure returns file-not-found, never a secret) and emits an init report naming what was written and each probe result; the report doubles as the baseline manifest that gates activation. FR-003 Landing re-evaluation: the posture engine runs automatically on EVERY kit install and upgrade; findings report, never block. PILLAR 2 — TENANT-CONTROLLED INFERENCE. FR-004 Per-tenant endpoints: tenant LLM endpoint/key/model AND embeddings endpoint stored as one row (tenantaiendpoints); all server-side AI resolves per-tenant → env → preset through the existing resolveEndpoint seam; switching embeddings endpoints triggers a bounded reindex of that tenant's capability vectors, search abstains until complete; phase 1 config is sysadmin-set (self-serve UI deferred, sysadmin panel optional/non-blocking). FR-005 Credential custody: tenant AI keys encrypted at rest in a key-id-prefixed ciphertext format (keyid:iv:authTag:ciphertext) — per SOC 2 CC6.7 the design names algorithm, key source, and rotation path before code is written; no repeat of the versionless format. FR-006 Destination evidence: every server-side AI call logs its resolved destination at the single seam; rendered into the PDF artifact by query — no separate evidence store. FR-007 MCP parity: the MCP server's AI paths (feedback triage, capability embeddings) read the SAME tenantaiendpoints row (shared database, tenant identity already on every call via token scope) — no separate MCP config surface; if a path cannot honor the tenant endpoint it ABSTAINS (skips for that tenant) rather than falling back to a global provider. PILLAR 3 — ROTATION READINESS. FR-008 Generator skill: wxRotateCredentials — SKILL.md + adapters (wxkanban-express, dotnet-wpf, generic interview fallback), adapters are method documents modeled on wxCreateTestPlan, delivered as one copy plus the MCP prompt-registry twin. FR-009 Discovery: finds env read sites; classifies import-time-cached (restart required) vs per-call reads; maps every deploy surface requiring lockstep update. FR-010 Blast-radius tiers: output classifies every secret into tiers including DO-NOT-ROTATE with the data-destruction mechanism spelled out; phase 1 is document-only, no --Execute. The rotation-runbook-exists-and-is-current check lives in the FR-013 posture checklist mapped to the key-rotation control (the finding IS the audit wiring — no separate mechanism). PILLAR 4 — CONTINUOUS AUDIT AND EVIDENCE. FR-011 Per-implement audit: an incremental compliance slice (posture + machine-checked pattern controls scoped to the changed surface) runs on every implement run, surfacing findings before the test gate; the full audit runs at lifecycle phase boundaries and on demand. FR-012 PDF artifact: generated via the existing MarkdownPdfRenderer/JsReport machinery per phase and on demand; deterministic on unchanged input; carries the FR-006 destination-evidence table. FR-013 Posture mode: /compliance-scan --posture audits the REAL project (deny baseline present and holding, secrets in tracked files, rotation runbook currency, tenant endpoint config), separates document-compliance from project posture, maps each gap to a control reference, and emits remediation items into the existing SCOPE-013 audit-task flow. One posture engine, three triggers: kit install, kit upgrade, on-demand. CROSS-CUTTING. FR-014 GDPR offboarding: when GDPR is active, tenant departure destroys the tenantaiendpoints row and stored keys, writing a tenanterasurerecords row as Article-17 evidence. FR-015 Framework toggle parity: iso27001enabled/nistssdfenabled exist in the MCP schema but not the main-app enums — ISO 27001 must be togglable and visible on both surfaces. DATA/SCHEMA: new tables tenantaiendpoints and tenanterasurerecords (plural, lowercase, no underscores); manual SQL per SCOPE-117 (reviewed, hand-applied, schema-change-log, db:drift-verified); tenantaiendpoints declared in BOTH the app schema and the MCP partial mirror in the same change. API: sysadmin-scoped endpoint-config CRUD; posture report + PDF download extending SCOPE-013's audit routes; destination-evidence query. KIT: baseline writer + probe + posture trigger at init/upgrade; new commands surface in the Cockpit; VSIX rebuilt. |
| 4 | What is out of scope? | 1. The ISMS. ISO 27001 is a management-system standard; coverage is 15 of 93 Annex A controls, SDLC slice only. No generated artifact ever says "certified" or "compliant" — the PDF states what was checked and what was found. This constraint exists so sales language cannot outrun the product. 2. Executing rotation: phase 1 emits the procedure; a human runs it. A gated --Execute mode is a later phase. 3. Hosting or choosing the customer's model: wxperts accepts an endpoint, never operates one. 4. Replacing /compliance-scan: it is extended with a posture mode, not replaced. 5. The SETTINGS_ENCRYPTION_KEY re-encrypt migration: named blocker, built separately; this scope must not create pressure to rotate that key, and existing ciphertext columns are untouched. 6. White-label / per-customer single-tenant deployment: the explicit non-goal — this scope exists to make it unnecessary. 7. Self-serve tenant endpoint UI: deferred; phase 1 is sysadmin-set (panel optional, non-blocking). 8. Tenant offboarding beyond the GDPR-active case. 9. Client-side AI provider choice (which coding assistant a customer runs against their source) — the customer's own contractual/tooling decision; this scope covers the kit baseline that limits what any client can read, not which client they use. |
| 5 | How is success measured? | SC-1 Init is provably safe: fresh kit init on a clean repo produces an active deny baseline BEFORE the first AI turn — probe denied, report emitted. Binary pass/fail. SC-2 Zero-leak for BYO tenants: with tenant endpoints configured, exercising every server-side AI feature (scope generation, interview, triage, reuse check) yields a destination log showing 100% tenant-endpoint-or-abstain and 0 global-provider calls across BOTH codebases; the log renders into the PDF artifact. SC-3 Generator matches the hand-built reference: running wxRotateCredentials against wxKanban itself and diffing against infra/secrets-rotation-runbook.md rediscovers all 5 DATABASE_URL consumers, the import-time-captured secrets, and SETTINGS_ENCRYPTION_KEY classified DO-NOT-ROTATE with its destruction mechanism. Self-test only: read-only discovery in our own repo, document output, zero customer contact. SC-4 Audit beats the test gate: a seeded violation (hardcoded secret, plaintext credential column) surfaces during implement, before QA; the phase-boundary PDF regenerates byte-identical on unchanged input. SC-5 Retroactive scan separates paperwork from posture: on a project with known gaps, the report distinguishes document-compliance from project-posture and emits control-mapped remediation items. SC-6 White-label averted: one shared deployment serves all 45 customers including BYO tenants; the count of per-customer deployments stays zero. SC-7 No passive customer impact: a project that has not updated its kit shows byte-identical behavior after all server-side pieces deploy — verified by exercising implement on a pre-scope kit against the updated server. |
| 6 | What existing workflow must this align with? | Extends, and must not fork: SCOPE-013 Automated Audit Engine (auditexecutions/auditresults/auditreportmetadata tables and audit-run/audit-check/audit-report/audit-tasks commands — pillar 4 lands here); SCOPE-099 LLM provider portability (resolveEndpoint is the single seam; its baseUrl/apiKey overrides are the documented per-tenant hook, currently unused at both call sites); SCOPE-074 Capability Index (per-tenant embeddings change the vector space — bounded per-tenant reindex on endpoint switch); /compliance-scan (gains --posture mode); SCOPE-125 Conversion Credential Redaction (boundary per CONTEXT.md glossary: 125 SURFACES what must be rotated, 126 generates HOW — neither executes); wxCreateTestPlan (the skill+adapters delivery pattern and the one-copy-plus-MCP-prompt-twin delivery map); SCOPE-121 kit upgrade file preservation (merge-not-clobber); SCOPE-117 production schema integrity (manual SQL workflow); the hosted MCP auto-deploys on push to main and get_command_prompt is fetched live — the delivery vector that makes the inert-at-deploy constraint necessary. Compliance catalogs already in the database: SOC 2 (119 controls), ISO 27001 (15), NIST SSDF (42), HIPAA (48), GDPR (37) — posture findings map to these, no new catalog authored. |
| 7 | What constraints or risks matter right now? | CONSTRAINTS. (1) INERT AT DEPLOY, ACTIVE AT KIT LANDING: every server-side piece ships dormant; activation is per-project, keyed to the baseline manifest FR-002 writes at kit install/upgrade. A project that has not updated its kit sees byte-identical behavior — the per-implement audit slice checks for the manifest and no-ops silently when absent. Required because the hosted MCP auto-deploys on every push and command prompts are fetched live at runtime, so an ungated prompt change would reach all 45 customers on their next implement run. (2) Coverage honesty: 15/93 Annex A, SDLC slice, no ISMS, never "certified"/"compliant". (3) Manual schema changes only (SCOPE-117); tenantaiendpoints in both app schema and MCP partial mirror in the same change or MCP reads return undefined silently. (4) Existing ciphertext untouched; new credentials use keyid-prefixed format. (5) Fail closed, never leak: BYO-tenant paths that cannot honor the endpoint abstain; posture findings report, never block installs/upgrades. (6) Document-only rotation in phase 1. (7) Merge-never-clobber on kit upgrade. (8) Adapters are method documents, not code — no adapter framework. (9) Skill delivery: one copy + MCP prompt-registry twin; Cockpit surfacing + VSIX rebuild on new commands. RISKS. (1) Alitho's actual requirement (server-side inference vs client-side source access) is unconfirmed — both flows are in scope, but the answer sequences the pillars; question is with the customer. (2) Per-tenant key custody lands on encryption-key hygiene — mitigated by the keyid-prefixed format and by keeping the SETTINGS_ENCRYPTION_KEY migration explicitly out. (3) Per-implement audit noise: if the incremental slice is slow or noisy it will be ignored — the fate of all noisy gates; slice must stay cheap and scoped to the changed surface. (4) Embeddings reindex windows: capability search abstains during a tenant's reindex — brief feature degradation for BYO tenants, stated rather than hidden. (5) Origin note: 2026-08-13 exposure audit; the hand-built infra/secrets-rotation-runbook.md is the golden reference for the generator. |
