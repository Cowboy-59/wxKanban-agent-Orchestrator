# Spec 039: Engagement Pre-Sales (charter stub)

**Spec Number**: 039
**Status**: `charter` (placeholder; not yet ready for createSpecs)
**Created**: 2026-05-26
**Depends On**: 037 (Consultants Management — Engagement Core)
**Source**: `specs/Project-Scope/039-engagement-presales.md`

---

## Charter

Layers a pre-sales workflow on top of the Engagement Core (spec 037). Today, 037 jumps straight from "Client invites" to "Engagement is `active`." Spec 039 introduces a deliberate negotiation phase between those two states: scope-of-work proposals, hourly rate negotiation, optional background checks, and contract / NDA / legal-doc lifecycle.

## In Scope (planned)

- **Proposal lifecycle**: Client drafts a request → Consulting Co. counters with a proposal (hourly rate, scope-of-work statement, timeline) → Client accepts/rejects/counters
- **Engagement state extension**: adds a `proposed` state preceding `active` in the lifecycle from 037
- **Rate negotiation**: hourly rate per Engagement (overrides Consulting Co.'s default), stored separately from billing-rate defaults
- **Background checks (optional)**: integration with a third-party verification service; pass/fail status surfaced on Consulting Co. profile (visibility into 038)
- **NDAs / legal documents**: upload, e-sign, version, retain. Tied to an Engagement.
- **Contract templates**: reusable boilerplate documents the Client can attach to a proposal

## Out of Scope

- Payment processing for verification services (→ 040)
- Marketplace discovery (→ 038)
- Public display of contracts (always private)

## Open Questions to Resolve at buildscope-time

- Which background-check vendor (Checkr / Onfido / etc.) and what's the cost model passed to the Consulting Co.?
- E-sign provider — DocuSign / HelloSign / built-in?
- Does a Client require a signed NDA *before* the Consulting Co. can see the proposal details, or after?
- How does the `proposed` state interact with FR-008 (concurrent consultants on same scope) — can a Client send proposals to multiple Consulting Cos. simultaneously? If yes, what happens when one accepts?
- Retention period for executed NDAs / contracts (SOC 2 / legal hold considerations)

## Reference

Conversation that produced this charter: 2026-05-26 buildscope session for scope 037; user explicitly approved a split rather than a mega-scope.
