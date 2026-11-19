# Specification: Banner Studio — Tracking & Redirect

**Spec**: 068
**Feature**: Banner Studio — Tracking & Redirect
**Status**: planned
**Phase**: design → implementation
**Created**: 2026-06-24
**Scope**: [`specs/Project-Scope/070-banner-studio.md`](../Project-Scope/070-banner-studio.md)
**Depends on**: **SPEC-067** (`marketinglinks` + `marketinglinkclicks` tables, the shared host-allowlist helper, `marketingBanners.ts`); SCOPE-064 (`SysAdminMarketingOverviewService`/`getMarketingOverview` — replaces its deferred engagement placeholder); the newsletter-unsubscribe public-route + signed-link precedent (`src/server/routes/marketing.ts`).
**Part of**: SCOPE-070 fan-out — SPEC-067 (pipeline & data) → **SPEC-068 (this — tracking & redirect)** → SPEC-069 (export, embed & UI)

> **Numbering note:** **SPEC-068** (implementation spec) is distinct from **SCOPE-068** (the multiproject-gateway-isolation *scope* doc) — integer collision only.

---

## Summary

The first **click-tracking subsystem in the product** (engagement tracking was explicitly *deferred* in SCOPE-064 — realized here). It turns the `marketinglinks` rows created in SPEC-067 into working tracked links: a public `/r/:code` endpoint that 302-redirects to the stored destination (appending UTM non-destructively), records every hit, increments a denormalized counter for genuine human clicks, and flags bots/previews so they don't inflate the count. It adds standalone links CRUD (the link is a first-class, reusable entity) and surfaces a counter-based links/clicks rollup in the Marketing Overview.

The redirect is on the **hot path** (every click, at the 1k+ launch), so it does one indexed lookup → 302 and writes clicks through an in-process micro-batch queue — never a DB connection per click. It is **open-redirect-proof**: the URL carries only `:code`; the destination is read server-side from the DB, never from the URL.

No UI in this spec (the Banner Studio tab is SPEC-069) — verified via direct HTTP.

## Requirements (from SCOPE-070)

- **FR-015** — `GET /r/:code` 302-redirects to the link's destination, read server-side from the stored link, never from the URL (open-redirect prevention); unknown code → clean 404.
- **FR-016** — Append UTM (source/medium/campaign) only when absent, preserving existing query like `?tier=`.
- **FR-017** — The tracked link is a first-class entity reusable outside a banner image (text link, email CTA, social post) — standalone links CRUD.
- **FR-018** — On admin write, the destination host is validated against an allowlist (reuses the SPEC-067 shared helper).
- **FR-019** — Every `/r/:code` hit is recorded; the denormalized `clickcount` increments for genuine human clicks.
- **FR-020** — Click events store a salted/truncated IP hash, a coarse human/bot/preview class, and referrer — no PII.
- **FR-021** — Bot/preview/prefetch hits (scanners, unfurlers, `HEAD`) are stored but `counted=false`.
- **FR-022** — Click writes are batched/async so the redirect stays fast and doesn't open a DB connection per click.
- **FR-028** — The Marketing Overview rollup gains a counter-based links/clicks summary, replacing the SCOPE-064 engagement placeholder.

## Acceptance

SCOPE-070 Success Criteria #4, #5, #6, #8 are the bar:

1. `/r/:code` 302s to the destination with UTM appended (preserving `?tier=`); a `counted=true` row appears, `clickcount` increments, and the Overview reflects it. *(FR-015, FR-016, FR-019, FR-028)*
2. No URL manipulation can redirect to an arbitrary host; a non-allowlisted destination is rejected at write; the same tracked link works outside a banner. *(FR-015, FR-017, FR-018)*
3. A bot/`HEAD` hit is stored `counted=false` and does not move the counter; click data carries no PII. *(FR-020, FR-021)*
4. The redirect doesn't await per-click inserts; writes are batched (timer + opportunistic + on shutdown) and reads use the counter, not `COUNT(*)` — no connection storm. *(FR-022)*

## Out of Scope (other specs)

- The tables themselves, banner CRUD, generate/render → **SPEC-067**.
- Export endpoints, public on-site banner read, the Banner Studio UI (incl. displaying the per-banner click count, FR-029) → **SPEC-069**.
- Detailed per-click analytics dashboards/charts — event rows are stored, but only the **count** is surfaced (Phase 1).

## Notes / risks

- **Hot-path connection storm** — App Runner CPU-throttles after the response, so true fire-and-forget is unsafe (the SCOPE-043 lesson in `marketing.ts`). The micro-batch writer flushes on a timer, opportunistically at the next request, and on SIGTERM. Protects the postgres-js pool and the RDS db.t3.small ~200-conn ceiling.
- **Counter drift** — the `clickcount` counter is the read path; a periodic reconcile from `counted=true` rows is the safety net (a follow-up job, not required for Phase 1).
- **Bot inflation** — UA + `HEAD`/prefetch classification with a same-IP dedupe window; rate-limit the *logging*, not the redirect, so real users behind shared NAT aren't blocked.
