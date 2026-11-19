# Spec 040: Marketplace Payments (charter stub)

**Spec Number**: 040
**Status**: `charter` (placeholder; not yet ready for createSpecs)
**Created**: 2026-05-26
**Depends On**: 037 (Consultants Management — Engagement Core), 038 (Marketplace & Profiles), 039 (Pre-Sales), 023 (Stripe Subscription Operations)
**Source**: `specs/Project-Scope/040-marketplace-payments.md`

---

## Charter

Adds platform-mediated payments to the Engagement model. Today, 037's B2B invoice flow lets a Consulting Company send an invoice email to the Client Company's billing email — billing settlement happens *outside* wxKanban. Spec 040 brings settlement *inside* the platform: Client pays Consulting Co. through wxKanban's payment rails, with optional escrow, optional platform fee, and full audit trail.

This is the scope where wxKanban becomes a money-mover, not just a record-keeper. Regulatory and trust surface is significant.

## In Scope (planned)

- **Payment processor integration**: Stripe Connect (Express or Custom accounts) so Consulting Cos. receive payouts via Stripe; or equivalent (Wise, Adyen)
- **Escrow option**: Client funds the invoice on issue → held in escrow → released to Consulting Co. on milestone or Client approval
- **Platform fee**: configurable cut of the invoice value collected by wxKanban (zero by default)
- **Payment method management**: ACH / card / wire on the Client side; bank-account onboarding for Consulting Cos.
- **Refund / chargeback handling**: dispute resolution surface (overlaps with 041 time-entry dispute)
- **Tax handling**: 1099 issuance for US-based Consulting Cos.; international tax form support if applicable
- **Audit trail**: every payment-state transition logged in `companyauditlogs`

## Out of Scope

- The 037 email-invoice path stays available; this scope adds an *option*, doesn't replace it
- Cryptocurrency / blockchain rails
- Lending / financing products (BNPL for Clients)

## Open Questions to Resolve at buildscope-time

- Does the platform fee apply to all engagements, or only those discovered through 038 marketplace?
- Stripe Connect Express (less compliance burden) vs Custom (more control) — which model?
- What's the minimum payout schedule (instant / daily / weekly / monthly)?
- How are international payments handled (currency conversion, regulatory)?
- Do we hold a money-transmitter license, or operate as a marketplace under Stripe's umbrella?
- KYC/AML requirements for both Client and Consulting Co. before payments enabled
- What happens to in-flight escrow funds if a Consulting Co. is deactivated or sued?

## Risk Flags

- **Regulatory**: money transmission laws vary by US state and country. A serious legal review precedes implementation.
- **Reputational**: payment failures are high-impact bugs. SLO needs to be much tighter than the rest of the platform.
- **Operational**: customer support for payment disputes is a different muscle than for software bugs.

## Reference

Conversation that produced this charter: 2026-05-26 buildscope session for scope 037; user explicitly approved a split rather than a mega-scope.
