# Spec 114: Certification and Access Hardening

## Overview

Band C of SCOPE-113. Close wxKanban's own open security findings, stand up the ISMS document set required for ISO 27001, gate public claims on a clean register, and ship the access controls that certification depends on — multi-factor authentication for interactive privileged access, plus the token lifecycle controls that make machine credentials defensible.

This band differs from SPEC-112 and SPEC-113 in kind. Roughly half is an organizational programme whose deliverables are documents and closed findings rather than code. The other half — MFA and token lifecycle — is a security workstream that must ship regardless of whether certification is ever pursued.

**Source scope**: `specs/Project-Scope/113-compliance-coverage-generated-products.md` (FR-014 through FR-018).

## Business Problem

wxKanban cannot answer a customer's supplier-security questionnaire, and its own security posture would fail the frameworks it sells coverage for.

A security audit dated 2026-06-22 left Critical finding C-2 and High findings H-1 and H-3 through H-9 open, alongside Medium findings M-1 through M-12. Every one is simultaneously a NIST SP 800-53 and ISO 27001 Annex A failure. Separately, ISO 27001 certifies a management system, not code — it requires a scope statement, risk methodology, risk treatment plan, Statement of Applicability covering all 93 Annex A controls, internal audit programme and management review, none of which exist.

The access position is worse than the findings suggest in isolation. There is no multi-factor authentication anywhere in the product, which `IA-2(1)` and `A.8.5` both effectively mandate for privileged access. `mcpapitokens` has no `role` column, and `mcp-server/src/server.ts` defaults every caller to `editor` because nothing populates a role — that is finding H-3, and it is structural rather than a bug in one code path. Since `project.create_api_token` permits `editor`, any token can mint further tokens. Combined with M-10, which writes tokens in plaintext to `.wxai/project.json` outside `.gitignore`, a leaked token is effectively permanent: revoking it does not help because replacements were already issued. Production currently holds 182 tokens, 175 of them active and never expiring.

## Actors

- Primary: wxKanban operator running the certification programme and closing the findings register.
- Secondary: Third-party auditor consuming the register and Statement of Applicability, and every developer or customer whose access is governed by the resulting authentication controls.

## Success Metrics

1. C-2, H-1, H-3 through H-9 and M-1 through M-12 are all closed with linked remediation evidence — 22 findings from open to closed.
2. The Statement of Applicability justifies 93 of 93 Annex A controls in or out, exportable to a third-party auditor without rework.
3. Zero MFA prompts occur in any non-interactive MCP or CLI path, measured across the full `buildscope`, `createSpecs`, `implement` and `dbpush` loop, while 100% of interactive administrative operations require a verified second factor.
4. Zero tokens can be issued without a bounded expiry, and 0 tokens can mint further tokens.
5. The 93 of 182 tokens that have never made a call are revoked, and the 175 never-expiring tokens carry an expiry horizon with warnings at 30, 7 and 1 days.
6. Zero public or exported surfaces claim certification wxKanban does not hold.

## Scope Boundary

This iteration covers the findings register and its closure evidence, the ISMS document set including the Statement of Applicability, claim gating on public surfaces, TOTP multi-factor authentication with recovery codes and a 30-day trusted-device option for interactive sessions, and token lifecycle hardening — a `role` column on `mcpapitokens`, removal of the hard-coded `editor` default, admin-only token issuance, mandatory bounded expiry, staged expiry for existing tokens, and dormant-token auto-revocation.

## Out of Scope

Achieving certification itself, which requires an accredited certification body running Stage 1 and Stage 2 audits on a three-year cycle for ISO 27001, and self-attestation for NIST CSF and SSDF. Neither is producible by code. FIPS 140-3 cryptographic module validation. NIST SP 800-53 full baseline and FedRAMP. EU data residency migration — production remains `us-east-2` and the transfer question needs Standard Contractual Clauses with a transfer impact assessment, or an EU region, both architecture decisions of their own. Customer-side ISMS artifacts. The compliance enablement mechanics of SPEC-112 and the crosswalk and evidence work of SPEC-113.

## Open Questions

1. What expiry horizon applies to new tokens — 365 days, or shorter for higher-privilege scopes?
2. Do the 175 existing never-expiring tokens get a uniform horizon, or one scaled by last use?
3. Which accredited certification body, and on what timeline? Commercial decision, not an engineering one.

## Data Requirements

| Change | Detail |
| --- | --- |
| `mcpapitokens` | Add a `role` column (`read_only`, `editor`, `admin`) set at issuance. `expiresat` becomes mandatory on new issuance. Already project-scoped, hashed at rest, attributed via `issuedbyid`, usage-tracked via `lastusedat` |
| MFA enrolment | TOTP secret stored encrypted at rest, single-use recovery codes, enrolment state and last-verification timestamp, all auditable |

## API Routes

| Route | Change |
| --- | --- |
| `project.create_api_token`, `project.revoke_api_token` (MCP) | Permission moves from `['editor','admin']` to `['admin']` |
| MFA enrolment and verification endpoints | New — enrol, verify, regenerate recovery codes, manage trusted devices |

## Frontend Components

| Component | Change |
| --- | --- |
| MFA enrolment and verification UI | New — enrolment, recovery codes, trusted-device management |
| Token management UI | Shows role and expiry; surfaces pending expiry before it bites |
| Dev Cockpit | Warns on token expiry ahead of failure |

## Integration Context

The certification programme consumes SPEC-113's evidence export as one input to the Statement of Applicability, but does not depend on it to start — findings closure is independent. The access-hardening half has a hard internal ordering: H-3 must close before a `role` column means anything, because `mcp-server/src/server.ts` currently hard-defaults every caller to `editor` and nothing populates a role. FR-018's admin-only issuance rule depends on that default being removed first. MFA gates token issuance only and must never appear in a non-interactive path, so the kit, CLI and agent loops are unaffected by design. M-12 account lockout, already in the findings list, complements MFA rather than being replaced by it.

## Functional Requirements

### FR-014 — Findings register with closure evidence

**Acceptance Criteria**:
- [ ] C-2 and H-1, H-3 through H-9 closed with linked remediation artifacts
- [ ] M-1 through M-12 closed, including M-3 plaintext App Runner secrets and M-12 login lockout
- [ ] Register is exportable for a third-party auditor
- [ ] Each closure references the check that now prevents regression

### FR-015 — ISMS document set

**Acceptance Criteria**:
- [ ] Scope statement, risk methodology, risk treatment plan, internal audit programme and management review record
- [ ] Statement of Applicability justifies all 93 Annex A controls in or out
- [ ] Personnel and physical controls documented as inherited or owned, with evidence source

### FR-016 — Public claims gated on the register

**Acceptance Criteria**:
- [ ] No public surface claims certification wxKanban does not hold
- [ ] Certification language is permitted only once FR-014 is clean and an accredited certificate exists
- [ ] The landing-page correction already applied is captured as the baseline

### FR-017 — Multi-factor authentication

MFA applies once, at the human moment, and never per-call. Both standards require multi-factor for interactive privileged access, not for machine identities; a non-interactive token inherits assurance from the MFA-verified session that minted it.

**Acceptance Criteria**:
- [ ] ADMIN accounts can enrol a TOTP second factor
- [ ] Single-use recovery codes issued at enrolment, regenerable
- [ ] Interactive administrative operations require a verified second factor
- [ ] A 30-day trusted-device option prevents per-visit prompting
- [ ] Zero MFA prompts occur in any non-interactive MCP or CLI path
- [ ] Enrolment state and last-verification are auditable
- [ ] Complements M-12 account lockout rather than replacing it

### FR-018 — Token lifecycle and least privilege

**Acceptance Criteria**:
- [ ] `mcpapitokens` gains a `role` column set at issuance
- [ ] The MCP resolves role from the token record; the hard-coded `editor` fallback is removed
- [ ] `project.create_api_token` and `project.revoke_api_token` require `admin`
- [ ] `admin` is never issued as a token, so a token cannot mint a token
- [ ] New tokens cannot be issued without a bounded expiry
- [ ] The 175 existing never-expiring tokens receive a horizon with warnings at 30, 7 and 1 days
- [ ] Tokens never used past an age threshold are auto-revoked, covering 93 of 182 with no user impact
- [ ] Expiry yields an actionable error naming the renewal path, surfaced in the Cockpit before it bites

## Phase

**Current Phase**: design
**Priority**: critical

## Status

- **Date**: 2026-07-27
- **Phase**: design
