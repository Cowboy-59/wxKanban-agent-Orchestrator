# Spec 041: Cross-Engagement Reporting & Quality (charter stub)

**Spec Number**: 041
**Status**: `charter` (placeholder; not yet ready for createSpecs)
**Created**: 2026-05-26
**Depends On**: 037 (Consultants Management — Engagement Core)
**Source**: `specs/Project-Scope/041-cross-engagement-reporting.md`

---

## Charter

Adds two complementary surfaces that span *across* engagements: a Consulting Company's view of all their client engagements over time, a Client Company's view of all consultants they've ever worked with, and the time-entry dispute / reject workflow that scope 037 explicitly deferred (FR-018).

This is the analytics + quality layer on top of the Engagement Core.

## In Scope (planned)

### Cross-engagement reporting (Consulting Co. side)

- Aggregate dashboard for the Consulting Co.: total clients, total billable hours, revenue by quarter, average engagement duration, churn signals
- Per-client breakdown (their own clients, not exposed to anyone else)
- Forecasting: estimated upcoming billable based on active sub-assignments and historical pacing

### Cross-engagement reporting (Client side)

- Aggregate dashboard for the Client: total Consulting Cos. engaged, total spend, average engagement value, spend trend over time
- Per-Consulting-Co. breakdown (limited to that Client's own engagements)
- Vendor-management signals: time-to-complete, quality-rating average from 038 reviews

### Time-entry dispute / reject workflow

The FR-018 follow-on. Client ADMIN can flag a specific time entry as disputed → Consulting Co. ADMIN reviews → resolution (accept, partial credit, escalate to support).

## Out of Scope

- Cross-tenant analytics (e.g. "show me what Consulting Cos. charge across the platform") — privacy-violating
- Public reporting / leaderboards
- AI-generated insights beyond simple aggregations (defer until clear product value identified)

## Open Questions to Resolve at buildscope-time

- Time-entry dispute: how is "partial credit" reflected in the original time entry? New offsetting entry, or a `disputestatus` column on the existing row?
- Statute of limitations on disputes — can a 6-month-old time entry be disputed?
- Should disputed entries block invoice generation, or be flagged on the invoice itself?
- Reporting on disputed entries: surfaced or hidden by default?

## Reference

Conversation that produced this charter: 2026-05-26 buildscope session for scope 037; user explicitly approved a split rather than a mega-scope.
