# Spec 038: Consulting Marketplace & Profiles

**Spec Number**: 038
**Status**: `charter-expanded` — **needs `buildscope 038` before implementation**
**Created**: 2026-05-26
**Depends On**: 037 (Consultants Management — Engagement Core)
**Source**: `specs/Project-Scope/038-consulting-marketplace.md`

---

## ⚠️ Status Notice

This spec was generated from a **charter stub** via `createSpecs 038` on 2026-05-26 at the user's direction, despite the originating charter being explicitly marked "not yet ready for createSpecs." The content below carries the charter forward and inserts `[NEEDS CLARIFICATION]` markers at every point where real interactive design work has not happened.

**Before any implementation work begins**, run `buildscope 038` interactively (same BA-driven flow that produced scope 037) and let it rewrite this spec.md. The current content is a placeholder, not a finished specification.

---

## Overview

Adds a discoverable marketplace surface on top of the Engagement Core (spec 037). Client Companies can search and browse Consulting Companies by skill, past-engagement portfolio, and ratings; Consulting Companies maintain public-facing profile pages with bio, portfolio of past clients/work, and star-rating + free-text reviews.

This scope was split out of the original "Consultants Management" conversation on 2026-05-26 to keep 037 foundational and shippable. The marketplace surface is *not* required for the bilateral invite-by-email path in 037.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | `[NEEDS CLARIFICATION — Client ADMIN browsing? Consulting ADMIN curating profile? Both equally?]` |
| **Secondary Actors** | `[NEEDS CLARIFICATION]` |
| **Key Value** | Discovery — Client Companies can find Consulting Companies they don't already know, based on capability and reputation |
| **Scope Boundary** | **IN**: search/discovery UI, public Consulting Co. profile pages, portfolio of past engagements, star-rating + review submission, review moderation, featured listings, categorization. **OUT**: pre-sales negotiation (→ 039), payment processing (→ 040), cross-engagement reporting (→ 041), verified-badge programs (depends on 039 background-check work). |

---

## User Scenarios

`[NEEDS CLARIFICATION — buildscope 038 must produce concrete scenarios for: (1) Client searches and engages a previously-unknown Consulting Co.; (2) Consulting Co. updates their profile; (3) Client submits a star review after engagement end; (4) Consulting Co. responds to or disputes a review.]`

---

## Functional Requirements

`[NEEDS CLARIFICATION — buildscope 038 must produce FRs covering at minimum: search/filter, profile management, portfolio display, review submission, review moderation, abuse prevention.]`

---

## Open Questions Inherited from Charter

These must be answered during `buildscope 038`:

1. Are reviews tied to a *completed* Engagement (i.e. engagement reached `ended` state) or any engagement state?
2. Can a Consulting Company hide an unflattering review, or is the platform editorial?
3. Is the marketplace gated by tenant tier (e.g. only ENTERPRISE Client tier can search)?
4. What's the abuse-prevention story for fake reviews and review-bombing?

## Additional Open Questions Surfaced

5. `[NEEDS CLARIFICATION — Are profile updates moderated by the platform before going live, or self-published?]`
6. `[NEEDS CLARIFICATION — Portfolio of past clients: opt-in disclosure by Consulting Co., or auto-populated from completed engagements with Client consent?]`
7. `[NEEDS CLARIFICATION — Search ranking algorithm — most reviews? Most recent? Best-rated? Paid promotion?]`
8. `[NEEDS CLARIFICATION — Can Consulting Cos. respond to reviews publicly?]`

---

## Technical Specifications

`[NEEDS CLARIFICATION — data model, API routes, frontend components all pending buildscope]`

### Tentative Data Model

The following entities are likely needed but their fields are not yet specified:

- `consultingprofiles` — public profile data per Consulting Company
- `consultingreviews` — star + text reviews keyed by engagement and reviewer
- `consultingreviewresponses` — Consulting Co. replies to reviews (if allowed)
- `consultingmoderationevents` — moderation actions audit trail

---

## Success Criteria

`[NEEDS CLARIFICATION — buildscope 038 must produce measurable criteria. Likely areas: search latency, profile completeness rate, review submission rate post-engagement, abuse incident rate.]`

---

## Constraints & Notes

- **037 dependency**: requires 037 shipped (Engagement Core) — reviews are tied to engagements.
- **Trust surface**: review systems are a meaningful trust and abuse surface; deserves serious adversarial design, not a rushed createSpecs pass.

---

## Compliance Requirements

`[NEEDS CLARIFICATION — SOC 2 considerations for user-submitted public content, content moderation policies. To be elaborated during buildscope.]`

---

## Next Steps

1. **Run `buildscope 038`** to flesh this spec out interactively. The current content is a structural placeholder.
2. Once buildscope completes, re-run `createSpecs 038` to regenerate spec.md / plan.md / tasks.md from the proper scope content.
3. Do not begin implementation against this charter-expanded version.
