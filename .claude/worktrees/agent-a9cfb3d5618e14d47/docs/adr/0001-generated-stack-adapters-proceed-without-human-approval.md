# ADR-0001: Generated stack adapters proceed without human approval

- **Status**: Accepted
- **Date**: 2026-08-22
- **Scope**: SCOPE-127 — Test Pipeline Stack Adapters
- **Deciders**: Project owner, in the SCOPE-127 buildscope interview

---

## Context

wxKanban's test pipeline runs through three layers — `wxCreateTestPlan`, `implement` Phase 5b, and `/preTest`. SCOPE-127 cuts an adapter seam through all three so the pipeline can serve any stack `/buildstack` produces, rather than only TypeScript/Express/Drizzle/hosted-Postgres/Playwright.

That leaves one question the seam cannot avoid: **what happens when no adapter matches the project's declared stack?**

`/buildstack` does not offer a fixed list of stacks — it interviews. A customer can land on Flutter+Firebase, Django, Rails, SwiftUI or Blazor, and wxperts will never have an adapter waiting. Three paying customers had already hit this and filed reports (`0e8e034d`, `0e39182f`, `7f33e279`) before this decision was taken.

Authoring one adapter per reported stack is a treadmill. So SCOPE-127 generates a candidate adapter from `stack.md` instead. The remaining question is whether a human must approve that generated adapter before the pipeline uses it.

## Decision

**A generated adapter is used immediately, with no approval gate. The run proceeds automatically.**

Approval still exists, but it was deliberately re-scoped: it promotes a *user-added* adapter from `provisional` to `approved` **after the fact**, via a status field in the adapter file. It never blocks a run.

Blocking and trust are separated. A provisional adapter runs; it simply announces that it is provisional every time it is resolved.

## Why this will look wrong without context

This decision reads as an oversight to anyone who knows this subsystem's history, and the objection is a good one.

The adapter model exists *because* of a silent-failure incident. Run against a C#/.NET repository, the TypeScript extractor walked 316 `.cs` files, matched nothing, wrote a valid-looking inventory of **zero units**, and exited 0. A confident empty result reads as a real result. The fix (commit `71ed91a1`, and later the under-count hard stop in `6c7d9a5c` / kit v1.7.55) was to make the tooling *stop* rather than guess.

Auto-generating an adapter and running on it without review appears to reintroduce exactly that: a machine guessing at machinery, unreviewed, with the pipeline trusting the guess.

## Why it was accepted anyway

**The status quo is not "safe", it is "no coverage".** The hard-stop works perfectly and hands off to nothing. All three reporting customers did the right thing — read the safety rule, refused to run the wrong stack's tooling, hand-rolled verification, filed a defect — and got no test coverage for it. The cost lands on the customer every time, and the queue grows with each new stack.

**An approval gate would not have caught the failure it appears to prevent.** The reviewer would be a developer who has just been told their stack is unsupported, reading a generated markdown document describing extraction machinery for their own stack. Approving it is the path of least resistance; the gate would collect a click, not a judgment. A gate that reliably produces "yes" is a liability, because it *transfers* responsibility without exercising it.

**The real risk is not an unreviewed adapter — it is an adapter that fails silently.** That risk is addressable by machine, and more reliably than by a human reader.

## Consequences

**FR-005 and FR-013 become load-bearing rather than defensive.** They are the entire safety story of SCOPE-127:

- **FR-005** — a UI driver must *prove* it drove something (a booted target plus a non-empty element tree or captured frame) before any UI-tier result is recorded. Absent proof, the run exits non-zero and records no pass. A fabricated driver fails closed instead of going green.
- **FR-013** — generation cannot bypass the existing guards. The under-count hard stop, the zero-unit stack guard, and `/preTest`'s `faithful:false` refusal all still fire on an adapter-driven run.
- **FR-008** — an adapter missing any of the six contract answers hard-stops rather than running partially.
- **FR-010** — every resolution announces its provenance, so a generated adapter is never mistaken for a shipped one.

**If any of those weakens, this decision becomes wrong.** They are not ordinary requirements that can be traded down under schedule pressure; they are the counterweight to everything else in SCOPE-127, which is otherwise uniformly *more* permissive than today's behavior.

**Anyone proposing to relax FR-005 should revisit this ADR first**, because the argument above depends on it entirely.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Human approves each generated adapter before use** | The reviewer is the least-equipped person to judge it, at the moment they are most motivated to click yes. Collects a click, not a judgment — and blocks the customer meanwhile. |
| **wxperts owns a fixed adapter set; unmatched stacks file a report and wait** | The treadmill. Its first lap is the current feedback queue, and it has no end because `/buildstack` interviews rather than offering a fixed list. |
| **Publish the contract; customers hand-author their own adapters** | Retained as the floor (FR-015) — hand-authoring stays first-class. Rejected as the *default* because it puts an hour of unplanned work between a customer and their test coverage. |
| **Let an adapter declare "no automated UI driver" and degrade to a human walkthrough** | Considered at length and rejected by the project owner in favor of universal real drivers (FR-004). Noted here because it is the alternative that would have made this ADR unnecessary: an adapter that can honestly say "I cannot drive this" has a safe fallback that does not depend on FR-005. |

## References

- `specs/Project-Scope/127-test-pipeline-stack-adapters.md` — FR-004, FR-005, FR-006, FR-008, FR-010, FR-013
- `_wxAI/adapters/README.md` — the six-question adapter contract and the zero-unit incident that motivated it
- Commit `71ed91a1` — stack adapters and fail-loud extractors
- Commit `6c7d9a5c` — router-binding resolution and the under-count hard stop (kit v1.7.55)
- Customer reports `0e8e034d`, `0e39182f`, `7f33e279`
