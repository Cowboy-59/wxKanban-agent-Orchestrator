# SCOPE-088 — Distributor Affiliate Onboarding & Referral Attribution

**Scope Number**: SCOPE-088
**Status**: `draft`
**Created**: 2026-07-05
**Depends On**: SCOPE-004 (registration / company-first signup — reused for account provisioning), SCOPE-023/067 (subscription lifecycle — FREE-tier billing bypass reused, not modified)
**Source**: `specs/Project-Scope/088-distributor-affiliate.md`

---

## Overview

wxKanban has no way to bring on distributors or to record who referred a customer. Every signup today is company-first through the public registration wizard, and there is no notion of a "distributor," no referral code, and no record of who introduced an account.

This scope adds a lightweight, attribution-only distributor program with two moving parts.

First, a **non-public distributor onboarding page**. A single unlisted, self-serve link (default `/distributor-signup`) is shared by email. A distributor who opens it creates a real, usable **FREE single-user** account — a `companies` row plus one ADMIN `userprofiles` user, with no Stripe/billing — that is marked as a distributor and issued an auto-generated **referral short code** shown on the success screen.

Second, **referral attribution at customer signup**. The normal registration wizard gains an optional "Referred by (code)" field. When a new customer enters a distributor's short code, it is validated and recorded on the new account's `companies.referredby`, so admins can see which distributor brought in each account.

The scope is deliberately **attribution-only**: it records and displays who referred whom. There are no commissions, payouts, or distributor dashboard in this pass. The data model is laid out so a future commission scope can build on it, but none of that is built here. FREE-tier billing already bypasses Stripe, so no billing work is required.

## Actors

Primary: the distributor — who self-onboards through a private link into a free, usable single-user account and receives a shareable referral code, with no charge and no manual account creation by wxperts.

Secondary: the wxperts admin/sysadmin — who needs to see, per account, whether it is a distributor and which distributor code (if any) referred it, without building or maintaining a commission system.

**Key value:** turns "share this link with your distributors" into self-serve free accounts that carry a referral code, and captures that code on any customer who signs up citing it — closing the gap between having distributors and knowing which customers they brought in.

## Scope Boundary

Included in this iteration:

- An unlisted, self-serve distributor signup page that provisions a FREE single-user account flagged as a distributor with a unique referral code.
- Additive `distributor` / `referralcode` / `referredby` columns on the `companies` table plus the generated migration.
- An optional "Referred by (code)" field in the existing registration wizard that validates and stores the code on the new account.
- Graceful handling of unknown/invalid codes so signup still succeeds.
- Read-only admin/sysadmin visibility of the distributor flag, referral code, and referred-by code.

## Out of Scope

Explicitly excluded from this iteration:

- Commissions, payouts, or any money movement.
- A distributor-facing dashboard, referral counts, or analytics beyond the code being visible.
- Per-distributor invite tokens or email issuance (single shared link only).
- CAPTCHA / rate-limiting on the public page.
- Any change to billing, Stripe, or paid-tier flows.
- Retroactive attribution of existing accounts.
- Resolving the pre-existing three-source `maxUsers` inconsistency.

---

## Functional Requirements

**FR-001 — Unlisted distributor page.** A public-but-unlinked route (default `/distributor-signup`, no `ProtectedRoute`, in no nav) renders a distributor signup form, mirroring the existing `ConsultantProvisionForm` unlisted-page pattern. It is reachable only via the shared link.

**FR-002 — Distributor form fields.** The form collects business/company name, full name, email, password (min 8), and an accept-terms checkbox. No tier selector and no payment step.

**FR-003 — FREE distributor provisioning.** On submit the system provisions a FREE single-user account via the existing registration service path (not a parallel implementation): a `companies` row with `billingplan=FREE`, `distributor=true`, a generated unique `referralcode`, and `subscriptionstatus=ACTIVE` (FREE bypasses Stripe — no `companysubscriptions` row), plus one ADMIN `userprofiles` user. Distributor accounts pin to 1 seat via the existing FREE seat mapping.

**FR-004 — Referral code reveal.** After success the page shows the distributor their referral code prominently with copy-to-clipboard and a short "share this code with people you refer" explainer. The code is also viewable later as a read-only field on the distributor's account/company view.

**FR-005 — Access control & abuse guard.** The shared, rotatable secret path is the only access control. Standard duplicate-email / duplicate-company-name checks from the registration service apply. No CAPTCHA in this scope (deferred). The link grants only a free single-user account.

**FR-006 — Referral code generation.** Generate a 6–8 character uppercase alphanumeric code excluding ambiguous characters (0/O, 1/I/L), checked for uniqueness against `companies.referralcode` and regenerated on collision. The distributor's own `referredby` stays null (a distributor is not referred by anyone).

**FR-007 — Optional referral field at signup.** The public registration wizard (company/first step) gains an optional "Referred by (code)" text input. Empty is allowed and normal.

**FR-008 — Referral validation & graceful failure.** An entered code is uppercased and trimmed, then validated against existing distributor `referralcode`s. A match is stored in the new account's `companies.referredby`. A non-match does not block registration — signup still succeeds, the code is discarded, and the response/log notes it was unrecognized. No signup ever fails because of a bad code.

**FR-009 — API surface.** `POST /auth/register` accepts an optional `referredBy` field in `registerSchema`; the registration service resolves/validates it and writes `companies.referredby`. Distributor provisioning is triggered by a gated `distributor` flag on the registration path that the public wizard cannot set (only the distributor page can).

**FR-010 — Admin visibility.** The sysadmin company view exposes, read-only, whether an account is a distributor, its `referralcode` (if any), and its `referredby` code (if any). No new dashboard — these fields are surfaced where accounts are already shown.

**FR-011 — Referral code auto-fill via URL (Amendment A).** The public registration wizard reads an optional `?ref=` query parameter on load and pre-fills the "Referred by (code)" field (FR-007) with it, uppercased and trimmed, so a distributor can share a single link (`/register?ref=<code>`) and the customer never has to type the code by hand. The field stays a normal, editable text input — a customer may still clear or change it. An unrecognized or malformed code in the URL behaves exactly as an unrecognized typed code under FR-008: signup still succeeds, nothing blocks. No server-side change: this is a client-side pre-fill of the existing FR-007 input, the existing FR-008/FR-009 validation path is untouched.

---

## Amendment A — Referral link auto-fill (2026-11-11)

**Trigger:** A distributor (Data Down Under / Geoff Spillane) needed a single link to send customers that carries his referral code, instead of asking them to copy/type an 8-character code. The field existed (FR-007) but had no URL-driven pre-fill.

**Change:** Added FR-011 above. Client-only — `RegistrationPage.tsx` reads `?ref=` and seeds the existing `referredBy` form state with it. No schema, API, or validation changes; FR-008's graceful-failure behavior already covers a bad/unknown code arriving this way.

## Success Metrics

- **SM-001 — Distributor provisioning:** 100% of successful distributor-page submissions result in an active FREE single-user account with `distributor=true` and a non-null, unique `referralcode` (verified by integration test on the provisioning path).
- **SM-002 — Attribution capture:** ≥ 99% of signups that enter a valid distributor code persist that exact uppercased code to `companies.referredby`, and 0% of registrations are blocked by an invalid or unknown code (verified by tests covering valid, invalid-format, and unknown-but-well-formed codes).
- **SM-003 — Admin readability:** 100% of distributor-referred accounts show the correct referring code to an admin within a single API read (1 field, 0 joins required at read time).

## Open Questions

None outstanding — all design decisions were resolved during scoping:

- Access model: single unlisted self-serve link (not per-distributor tokens).
- Distributor identity: FREE single-user account marked with a `distributor` flag (not a referral-only entity).
- Referral depth: attribution only in this iteration (no commissions/payouts).
- Storage location: `referredby` and `referralcode` on the `companies` table (account-level), not on `userprofiles`.
- Code format: 6–8 uppercase alphanumerics excluding ambiguous characters; entered codes uppercased+trimmed before match.

---

## Dependencies & Risks

**Dependencies**

- **Registration service (SCOPE-004).** Distributor provisioning and `referredBy` capture extend the existing `RegistrationService` company-first path and its duplicate checks rather than adding a parallel implementation. If that path changes, this rides along.
- **FREE-tier billing bypass (SCOPE-023/067).** `getDefaultSubscriptionStatus` already treats FREE as always-ACTIVE with no Stripe/`companysubscriptions` row. This scope relies on that and does not modify billing.
- **Unlisted-page pattern.** Reuses the `ConsultantProvisionForm` / public-token-page convention in `App.tsx` for a route that renders without `ProtectedRoute` and is absent from nav.
- **Schema/migration path.** Additive columns land in `src/db/schema/company.ts` with a generated migration under `src/db/migrations` (app schema dir; no MCP-side migration).

**Risks**

- **Shared link leak.** The single secret path could be shared beyond intended distributors. Mitigation: it grants only a free single-user account; the path is rotatable; CAPTCHA/rate-limiting is a flagged follow-up, not built here.
- **Referral code collisions.** Mitigated by a unique constraint on `referralcode` plus regenerate-on-collision at creation.
- **Code stored as string, not FK.** `referredby` holds the code text (attribution-only). A future commission scope would upgrade this to a proper FK/join; called out so that scope knows the migration path.
- **Case / whitespace mismatch.** Codes are uppercase; entered codes are uppercased+trimmed before validation and storage so `wx7k2q` matches `WX7K2Q`.
- **Seat-limit inconsistency (pre-existing).** The three-source `maxUsers` divergence (`companies.maxusers` default, `getMaxUsersForTier`, `TIER_CONFIG`) is untouched here; distributor accounts explicitly pin to the FREE = 1 mapping to avoid depending on the ambiguous value.

**Deferred (future scopes, not built here)**

- Commission/payout tracking and a distributor-facing dashboard.
- Per-distributor invite tokens and email issuance.
- CAPTCHA / rate-limiting on the public distributor page.
- Retroactive attribution of existing accounts.
