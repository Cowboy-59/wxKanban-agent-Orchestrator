# Spec 112: Compliance Enablement Repair

## Overview

Band A of SCOPE-113. Establish a single per-project source of truth for compliance framework enablement, correct the reader the agent pipeline depends on, deliver framework rules files to consumer projects, and stop the audit engine reporting unearned passes.

This spec makes the existing compliance feature *work*. It adds no new frameworks and no new reporting — those are SPEC-113. It is a prerequisite for everything downstream: shipping rules files or adding NIST and ISO is pointless while the reader always answers "inactive".

**Source scope**: `specs/Project-Scope/113-compliance-coverage-generated-products.md` (FR-001 through FR-006).

## Business Problem

wxKanban sells compliance-aware development: a customer enables a framework and expects the SDLC to enforce it. That promise is broken end to end, and has been since the feature shipped.

Framework enablement is split across three fields in two stores with no authority — `companyprojects.audittype` (per-project, single-framework, drives `AuditReportService`), `appauditconfiguration.*enabled` (per-company, keyed `appid`, drives `AuditEngineService`), and `companyprojects.securityclassification` (holding framework names on some rows).

The MCP reader `project.get_audit_config` queries the company-keyed `appid` column with a project ID. Verified against production: 19 of 21 `appid` values resolve to a company and 0 resolve to a project, so the predicate has never matched. `_wxAI/rules/compliance-context.md` Step 1 therefore always concludes compliance context is INACTIVE, and `buildscope`, `createSpecs` and `implement` have never once loaded compliance rules — including for 21 projects with `audittype` set (17 SOC2, 3 HITRUST, 1 GDPR) and two paying companies, CPC Solutions and Quarkza Ltd.

Compounding it, the rules files never reach consumer projects so Step 2 could not resolve there either, and `AuditEngineService.checkRegexPattern` scans the whole `src` tree and returns `pass` on the first match anywhere — comments, dead code, unrelated modules included — manufacturing false audit assurance. A compliance feature that reports success while doing nothing is the worst possible failure mode, because customers make decisions on its output.

## Actors

- Primary: Project owner who enables a compliance framework on a project and expects the development workflow to enforce it and record evidence.
- Secondary: Compliance officer configuring frameworks, and the agent pipeline itself which consumes `project.get_audit_config` to decide whether compliance context loads.

## Success Metrics

1. 100% of projects with at least one framework enabled return `complianceActive: true` from `project.get_audit_config`, against a verified baseline today of 0% because 0 of 21 configuration rows are reachable by the reader.
2. Zero projects that had a framework enabled before migration end up with fewer frameworks after — covering 21 projects via `audittype` plus every project owned by the 2 affected companies — verified by a before/after diff the migration itself emits.
3. Zero controls render as satisfied without a traceable artifact; 100% of `pass` results are sampled on the first post-ship audit run, each confirmed to resolve to a file and a date.
4. 100% of kit-provisioned projects with a framework enabled have the rules file resolvable at project root, with a missing file producing a visible error in 100% of cases rather than a silent "inactive".

## Scope Boundary

This iteration changes: `src/db/schema/appauditconfiguration.ts` (re-key `appid` to `projectid`, add `nistssdfenabled` and `iso27001enabled`), `src/db/schema/companyproject.ts` (retire `audittype`, cleanse `securityclassification`), the migration and backfill, `src/server/services/AuditConfigService.ts`, `src/server/routes/audit.ts` (re-scope from `req.companyid` to a project parameter), `src/server/routes/projects.ts` (retire the `audittype` zod enum), `src/server/services/AuditReportService.ts` (single-framework `COMPLIANCE_FILES` lookup becomes a loop over enabled frameworks, sourced from `wxkanbandocuments` rather than disk — Amendment A), `src/server/services/AuditEngineService.ts` (`checkRegexPattern` becomes file-scoped), `src/client/components/audit/AuditConfigPanel.tsx` plus the three `audittype` bindings in `ProjectWorkspacePage.tsx` and the displays in `AdminDashboard.tsx` and `DashboardProjectGrid.tsx`, and `mcp-server/src/server.ts` (`project.get_audit_config` re-key plus the new `project.get_compliance_context` tool). **Amendment A removes the kit-allowlist change from this boundary — no rules file is shipped.**

## Out of Scope

Excluded from this iteration and deferred to SPEC-113: the control crosswalk, the evidence export, NIST SSDF and ISO 27001 catalogs, HIPAA and GDPR engine backfill, coverage disclosure, and `validateScope` compliance awareness. Deferred to SPEC-114: the findings register, ISMS documents, MFA and token lifecycle. Permanently out of reach of this product: customer ISMS artifacts, infrastructure, people and physical controls, and any claim that a generated product is certified.

## Open Questions

1. Do CPC Solutions and Quarkza get notified proactively about the move to per-project enablement, or discover it on next login? Affects support load, not delivery.
2. Should `securityclassification`, once cleansed of framework values, be repurposed as a genuine data-classification axis or dropped entirely? Resolves during implementation.
3. Amendment A: is `project.get_compliance_context` entitlement-gated like `project.get_command_prompt`? Recommended yes — compliance is premium — but the gate refusal must say so explicitly, because the halt-loudly rule turns a silent gate into a hard stop.

## Amendment A — Rules are served from the database, not shipped as files

**Date**: 2026-07-28. **Amends**: FR-005, T009. **Status**: accepted.

FR-005 originally required the kit to deliver each enabled framework's `*_SDLC_Compliance_Rules.md` into the consumer's repository via both root-file allowlists. That requirement was wrong on the facts, and implementing it would have entrenched the defect it was meant to fix.

**What the codebase already contains.** `src/db/schema/wxkanbandocuments.ts` declares itself the *"Master document store for compliance framework documents and audit reports"*, carrying `framework`, `version`, `effectivedate`, `status` (`active` / `superseded` / `draft`) and a SHA-256 `filehash` for tamper evidence, with full-text search over `filecontent`. All four framework documents are already loaded there at full length — SOC2 19,056 bytes, HIPAA 31,204, HITRUST 36,450, GDPR 37,923 — with 1,221 requirements extracted into `complianceaudittasks`, each tagged with `applicablephases`. `AuditEngineService` already resolves its checks from that table rather than from any file. The file-based path is the legacy half of a cutover that was never completed, not the intended architecture.

**What shipping files would have cost.** The four documents already exist in four locations: this repository's root, `resources/`, `specs/`, and the orchestrator's `resources/`. FR-005 as written would have created a fifth and sixth copy inside every consumer repository, and bound us to re-syncing them on every kit release — the same drift that left `wxkanban-agent/templates/.gitignore.snippet` covering 12 entries against a shipped surface of over a hundred files.

**What replaces it.** A new MCP tool, `project.get_compliance_context`, serves rule content directly from `wxkanbandocuments` and `complianceaudittasks`. The shipped `_wxAI/rules/compliance-context.md` becomes a thin stub that calls it — the pattern `project.get_command_prompt` already established, where the body lives only on the server and the shipped command is a stub. Because `_wxAI/` is already inside both allowlists, **the kit gains no new file and neither allowlist changes**.

**Decisions.**

- **Two modes from day one.** `mode: 'full'` returns `wxkanbandocuments.filecontent` with its `version` and `filehash`, giving immediate content parity with what the files would have carried. `mode: 'summary'` returns `complianceaudittasks` rows filtered by `applicablephases` and optional keywords. SOC 2 content is authored to make `summary` genuinely useful; the other three frameworks remain `full`-only until SPEC-113 FR-011.
- **Halt loudly, no fallback.** No local cache and no `ai-settings.json` fallback. A second copy that can drift is the failure mode being removed, so reintroducing one as a resilience measure defeats the amendment.
- **Grain follows FR-001.** The tool resolves frameworks per project, from the `projectid` column FR-001 adds.

**Consequential finding.** `complianceaudittasks.checkpattern` is `NULL` on all 1,221 rows while 1,157 carry `isautomated: true` and `checkmethod: 'regex_pattern'`. `checkRegexPattern` returns `not_applicable` when the pattern is null, so the engine has no checks to run and FR-006's corrected engine grades everything `not_applicable`. `description` equals `title` on all 1,221 rows and `controlreference` is populated on 7. The corpus is the output of a markdown checklist parser, not authored controls. Authoring the SOC 2 subset is therefore part of this amendment rather than a later refinement — without it, `summary` mode has nothing worth returning and FR-006 has nothing to evidence.

## Functional Requirements

### FR-001 — Per-project framework enablement is the single source of truth

`appauditconfiguration` is re-keyed to `projectid`; multiple frameworks may be active on one project simultaneously.

**Acceptance Criteria**:
- [ ] `appauditconfiguration.projectid` references `companyprojects.id`, unique per project
- [ ] All existing config fields (schedule, threshold, retention, fail-on-critical) survive at project grain
- [ ] `companyprojects.audittype` is no longer read by any code path
- [ ] `securityclassification` no longer holds framework names
- [ ] A project can have SOC 2, NIST SSDF and ISO 27001 all true at once

### FR-002 — Migration preserves existing customer intent

**Acceptance Criteria**:
- [ ] Every project whose company had a framework enabled receives a row with those flags true
- [ ] Every project with `audittype` set receives the matching flag true
- [ ] Company-level schedule, threshold and retention carry to each fanned-out project unchanged
- [ ] The two orphan rows are quarantined, not fanned out
- [ ] Migration is idempotent and produces a written before/after row count

### FR-003 — Per-project compliance settings UI

**Acceptance Criteria**:
- [ ] Settings are reached in a project context, not company-wide
- [ ] Only ADMIN can change enablement; non-admins see current state read-only
- [ ] A one-time notice explains the move from company to project grain
- [ ] Saving is confirmed against a re-read, not the optimistic local object

### FR-004 — The MCP reader returns the truth

**Acceptance Criteria**:
- [ ] `project.get_audit_config(projectId)` returns the frameworks actually enabled on that project
- [ ] `complianceActive` is true whenever at least 1 framework is enabled
- [ ] A regression test asserts a project with SOC 2 on returns `activeFrameworks: ["SOC2"]`, and that test fails against today's code
- [ ] Returns an explicit "no configuration" signal, distinguishable from "configured, all off"

### FR-005 — Framework rules reach consumer projects

> **AMENDED — Amendment A, 2026-07-28.** The original criteria shipped the rules
> files into the consumer's repository via both kit allowlists. Superseded; see
> **Amendment A** below for the reasoning. Original text retained struck through
> for traceability.

~~The kit delivers the rules file for each enabled framework to the consumer project root.
Both kit root-file allowlists are updated.~~

**Acceptance Criteria**:
- [ ] `project.get_compliance_context(projectId)` returns the rule content for each enabled framework, sourced from `wxkanbandocuments`
- [ ] `compliance-context.md` Step 2 resolves in a consumer project with **no rules file on disk and no new kit file**
- [ ] Only rules for enabled frameworks are returned
- [ ] When `complianceActive` is true and the call fails, the agent halts and reports; it never proceeds silently and never falls back to a local copy
- [ ] No `*_SDLC_Compliance_Rules.md` is added to either kit allowlist

### FR-006 — The audit engine never reports an unearned pass

**Acceptance Criteria**:
- [ ] A check evaluates the file under evaluation, not the first match anywhere in the tree
- [ ] A pattern found in a comment, a dead file, or an unrelated module does not produce a pass for that file
- [ ] Where a check cannot conclusively verify, it returns `needs_review` with a stated reason
- [ ] `pass` requires positive evidence; absence of a pattern is never a pass
- [ ] The regression suite includes the false-pass case that exists today

## Data Requirements

| Change | Detail |
| --- | --- |
| `appauditconfiguration` | Re-key `appid` to `projectid` referencing `companyprojects.id`, unique. Add `nistssdfenabled`, `iso27001enabled` booleans (columns land now, consumed by SPEC-113) |
| `companyprojects.audittype` | Dropped after all eight readers migrate |
| `companyprojects.securityclassification` | Framework values overwritten to null; classification axis only |

Migration order: (1) add `projectid` and the new framework columns additively; (2) backfill from `audittype` and company fan-out, quarantining the two orphan rows; (3) cut readers over with `AuditReportService` last; (4) drop `audittype` only once step 3 is verified.

Known `audittype` readers to migrate: `db/schema/companyproject.ts`, `shared/types/projects.ts`, `server/routes/projects.ts`, `server/services/AuditReportService.ts`, `client/components/Dashboard/DashboardProjectGrid.tsx`, `client/pages/AdminDashboard.tsx`, and three bindings in `client/pages/ProjectWorkspacePage.tsx`.

## API Routes

| Route | Change |
| --- | --- |
| `GET/PUT /api/audit/config` | Re-scoped from `req.companyid` to a project parameter; ADMIN-gated on write |
| `GET /api/audit/tasks/relevant` | Re-scoped from `req.companyid` to a project parameter |
| `PATCH /api/projects/:id` | `audittype` enum retired |
| `project.get_audit_config` (MCP) | Re-keyed to `projectid`; returns `nistssdfenabled` and `iso27001enabled` |
| `project.get_compliance_context` (MCP) | New — Amendment A. Serves rule content per enabled framework in `summary` or `full` mode |

## Frontend Components

| Component | Change |
| --- | --- |
| `AuditConfigPanel` | Moves to project context; loses the company-wide assumption |
| `ProjectWorkspacePage` | Three `audittype` bindings replaced by the framework set |
| `AdminDashboard`, `DashboardProjectGrid` | `audittype` display replaced with multi-framework badges |

## Integration Context

This spec must align with existing systems rather than standing alone. SCOPE-013 owns `AuditEngineService`, `AuditReportService` and `complianceaudittasks`; FR-006 is explicitly remediation of 013's delivered behaviour and does not supersede it. `AuditReportService` is the only compliance path currently producing real customer output, so it migrates last. `complianceoverride` is already `projectid`-keyed, confirming per-project was the intended grain elsewhere in the same feature. SCOPE-093 owns `_wxAI/rules/compliance-context.md`, whose Step 2 resolution FR-005 rewrites.

Amendment A adds two integration constraints. The MCP server does not import from `src/`; it maintains a hand-written schema mirror in `mcp-server/src/db/schema.ts`, so `wxkanbandocuments` and `complianceaudittasks` are mirrored there rather than reusing `AuditTaskService`. A `shared/` package is deliberately not created for the shared query, because `shared/` is packed into the kit and the kit must not gain `pg` or `drizzle` dependencies. Registration is three-part — handler case, tool-definitions entry, and `PERMISSION_MATRIX` in `mcp-server/src/auth/role-checker.ts`; omitting the last surfaces as `Unknown tool` rather than a permission error. SPEC-113's crosswalk later moves framework resolution off `complianceaudittasks.framework`, so this amendment leaves that column untouched.

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-07-28 (Amendment A)
- **Phase**: implementing
