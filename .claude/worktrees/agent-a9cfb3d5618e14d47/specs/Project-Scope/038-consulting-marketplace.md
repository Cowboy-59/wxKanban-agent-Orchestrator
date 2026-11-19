# Spec 038: Consulting Marketplace & Profiles (charter stub)

**Spec Number**: 038
**Status**: `charter` (placeholder; not yet ready for createSpecs)
**Created**: 2026-05-26
**Depends On**: 037 (Consultants Management — Engagement Core)
**Source**: `specs/Project-Scope/038-consulting-marketplace.md`

---

## Charter

Adds a discoverable marketplace surface on top of the Engagement Core (spec 037). Client Companies can search and browse Consulting Companies by skill, past-engagement portfolio, and ratings; Consulting Companies maintain public-facing profile pages with bio, portfolio of past clients/work, and star-rating + free-text reviews.

This scope was split out of the original "Consultants Management" scope conversation on 2026-05-26 to keep 037 foundational and shippable. The marketplace surface is *not* required for the bilateral invite-by-email path in 037.

## In Scope (planned)

- Discovery / search / filter UI for Client ADMINs looking for consulting capacity
- Public Consulting Company profile pages (about, skills, portfolio of past clients/projects)
- Star-rating + review-text submission by Client ADMINs after engagement completion
- Review moderation / dispute flow at the platform level
- Featured listings / categorization

## Out of Scope (deferred or rejected)

- Pre-sales negotiation / proposals (→ 039)
- Payment processing / escrow (→ 040)
- Cross-engagement reporting (→ 041)
- Verified-badge programs (would need spec 039 background-check work first)

## Open Questions to Resolve at buildscope-time

- Are reviews tied to a *completed* Engagement (i.e. engagement reached `ended` state) or any engagement state?
- Can a Consulting Company hide an unflattering review, or is the platform editorial?
- Is the marketplace gated by tenant tier (e.g. only ENTERPRISE Client tier can search)?
- What's the abuse-prevention story for fake reviews and review-bombing?

## Reference

Conversation that produced this charter: 2026-05-26 buildscope session for scope 037; user explicitly approved a split rather than a mega-scope.
