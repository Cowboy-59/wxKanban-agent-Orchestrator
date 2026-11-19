# Implementation Plan: Marketing — Outcomes & Expansion

**Spec**: 050 | **Parent Scope**: 045 (Marketing umbrella, Spec 5 of 5 — **Phase 2 / post-launch**)
**Status**: `draft`
**Created**: 2026-06-08

---

## Approach

A thin Phase-2 layer that **surfaces and aggregates data that already exists** rather than building anything new. Outcome stats are a read-side aggregation over `marketingleads` (046) plus a read of the existing pageview lambda store — no new analytics platform, no new tables for analytics. Segment 2 activation is mostly configuration of rules and enums already provisioned in 046/048: extend the server-side derivation, allow `broad` in targeting UIs, and expose it in funnel/stats filters. Translations are authored content rows added through the existing 048 asset endpoints using the `(assetkey, locale)` sibling model — site delivery already falls back to en-US. The only conditional schema change is an `assetsegments` join, included **only if** the single-primary-segment field proves insufficient (default: don't add it).

This spec is **not July-5 critical**; it lands after the launch funnel (046) is live and proven and after 047/048/049 ship.

## Key Decisions

- **REST on the main server, not MCP.** Internal admin stats + public site delivery. Mount routes via `src/server/app.ts` (prod entrypoint is `index.ts → app.ts`; `index2.ts` is dead — routes mounted there silently 404).
- **`db/client.ts` (postgres-js), never `lib/db.ts`.** The strict-TLS pg.Pool module breaks against RDS in prod.
- **No new analytics infrastructure.** Signups come from aggregating `marketingleads`; pageviews are **read from the existing pageview lambda store**. We never persist our own pageview/analytics rows and never stand up a GA-style platform.
- **Best-effort pageviews.** If the lambda store is unreachable, return signup aggregates and mark pageviews unavailable — never fail the whole stats response.
- **Compute, don't denormalize.** Stats are queried live (group-by) over `marketingleads`; no counter tables to drift.
- **Segment `broad` already exists** in the 046 enum — this spec puts it into *use* (derivation, targeting, filtering), not into the schema.
- **Authored translations only.** Non-English content rows are supplied/authored and stored as `(assetkey, locale)` siblings via 048's endpoints. No machine translation. en-US fallback on delivery already exists from 048/047/049.
- **KISS on segments.** Keep the single `targetsegment` field; add the `assetsegments` join table **only if** real many-to-many need is demonstrated by data.

## Known Gates / Constraints

- **Phase 2 / post-launch** — do not schedule against the July 5 critical path; depends on 046/047/048/049 being shipped first.
- **Pageview lambda contract:** the stats read depends on the existing lambda store's query interface/region/credentials (env vars, App Runner console convention) — confirm the read path before building FR-002.
- **Date-range/filter parity:** stats filters must match the funnel's segment/source/campaign semantics (046) so numbers reconcile.
- **PII:** stats are aggregates only — no per-lead PII exposed on the stats surface; admin-role access only.
- **i18n:** authored content rows must not regress the en-US fallback path delivered by 047/049 — a missing locale serves en-US, never 404.
- **Code fencing (spec 026):** all new top-level units fenced via the orchestrator `implement` path; run `auditfences` before push. (CLI dispatch is broken — use the direct-import wrapper / in-conversation implement; inline fences where the fence-emitter can't reach, per the 042/043 precedent.)

## Dependencies

- spec 046 (`marketingleads` attribution + `segment` enum incl. `broad`), spec 048 (`marketingassets` + `assetkey`/`locale` model + asset endpoints), spec 047 + 049 (site locale-variant delivery + broad-segment home property).
- Existing **pageview lambda store** — read-only analytics source for FR-002.
- Blocks: none (terminal spec).

## Build Order

1. **T001** stats aggregation API — `GET /api/sysadmin/marketing/stats` (group `marketingleads`; read pageview lambda; filters; zero-rows; best-effort pageviews).
2. **T002** SysAdmin stats surface UI (per-campaign / per-channel signups + pageviews, segment/source/campaign/date filters).
3. **T003** activate `segment="broad"` in capture derivation + funnel/stats filtering.
4. **T004** allow `broad` in campaign/asset targeting UI + wxperts.com home-property wiring.
5. **T005** author non-English asset content rows (fr-FR/es/pt-BR/it/de) via 048 endpoints; verify locale-variant delivery + en-US fallback.
6. **T006** *(conditional)* `assetsegments` join table — only if single-primary-segment proves insufficient.

## Verification

`npm run check-types` clean for new files; `auditfences` 0 violations on new declarations; quickstart scenarios in [quickstart.md](quickstart.md) pass against a local/live run; stats numbers reconcile against the funnel for a known campaign; lambda-outage path returns signups-only; a `broad` lead is derived, filtered, and counted end-to-end; a locale-variant asset is served and a missing one falls back to en-US (never 404).
