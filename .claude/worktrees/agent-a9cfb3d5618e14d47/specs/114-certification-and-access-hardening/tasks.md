# Task Breakdown: Certification and Access Hardening

**Feature**: Certification and Access Hardening
**Spec**: 114
**Date Generated**: 2026-07-27
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Close H-3 by resolving token role from the record | critical | todo |
| 2 | Add a role column to mcpapitokens and set it at issuance | critical | todo |
| 3 | Restrict token issuance to admin so a token cannot mint a token | critical | todo |
| 4 | Build TOTP MFA enrolment with recovery codes | critical | todo |
| 5 | Gate interactive admin operations on MFA with zero non-interactive prompts | critical | todo |
| 6 | Close Critical and High findings C-2 and H-1, H-4 through H-9 | critical | todo |
| 7 | Make bounded expiry mandatory on new token issuance | high | todo |
| 8 | Apply staged expiry to the 175 existing never-expiring tokens | high | todo |
| 9 | Auto-revoke dormant tokens | high | todo |
| 10 | Close Medium findings M-1 through M-12 | high | todo |
| 11 | Produce the ISMS document set and Statement of Applicability | high | todo |
| 12 | Gate public certification claims on a clean register | medium | todo |

## Task Details

### T001 — Close H-3 by resolving token role from the record

server.ts hard-defaults every caller to editor and middleware/auth.ts never sets role. Resolve from the token record and remove the fallback. MUST land before the role column means anything. FR-018.

### T002 — Add a role column to mcpapitokens and set it at issuance

read_only, editor or admin, set when minted. Depends on H-3 closure. FR-018.

### T003 — Restrict token issuance to admin so a token cannot mint a token

Move create/revoke_api_token to admin-only and never issue admin as a token. Closes the self-perpetuation loop that makes a leaked token permanent. FR-018.

### T004 — Build TOTP MFA enrolment with recovery codes

Enrolment, secret encrypted at rest, single-use regenerable recovery codes, 30-day trusted device, auditable state. FR-017.

### T005 — Gate interactive admin operations on MFA with zero non-interactive prompts

Verify by test that ZERO MFA prompts occur across buildscope, createSpecs, implement and dbpush. The dev loop must never prompt. FR-017.

### T006 — Close Critical and High findings C-2 and H-1, H-4 through H-9

Committed admin JWTs, unauthenticated Stripe endpoints, tenant bypass, shell injection, plaintext OAuth tokens, JWT in localStorage, DB TLS disabled, RDS-superuser role. FR-014.

### T007 — Make bounded expiry mandatory on new token issuance

No token issued without an expiry. Horizon is an open question. FR-018.

### T008 — Apply staged expiry to the 175 existing never-expiring tokens

Horizon with warnings at 30, 7 and 1 days. Expiry yields an actionable error naming the renewal path, surfaced in the Cockpit first. FR-018.

### T009 — Auto-revoke dormant tokens

93 of 182 tokens have never made a call. Revoke never-used tokens past an age threshold via lastusedat. Zero user impact; independent of the rest. FR-018.

### T010 — Close Medium findings M-1 through M-12

Includes M-3 App Runner secrets, M-10 plaintext tokens outside .gitignore, M-12 login lockout, M-6 AES key without KDF, M-7 auth-bypass failing open, M-9 missing signin rate limit. FR-014.

### T011 — Produce the ISMS document set and Statement of Applicability

Scope statement, risk methodology, risk treatment plan, internal audit programme, management review, and a SoA justifying all 93 Annex A controls. FR-015.

### T012 — Gate public certification claims on a clean register

No public surface may claim certification not held. Landing-page correction already applied is the baseline. FR-016.
