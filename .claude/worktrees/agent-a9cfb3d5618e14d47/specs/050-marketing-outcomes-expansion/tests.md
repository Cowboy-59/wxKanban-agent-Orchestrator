# Test Plan: Marketing — Outcomes & Expansion

**Spec**: 050 | **Created**: 2026-06-08
**Maps to**: spec.md functional requirements FR-001 … FR-014

---

## Unit / Integration (Vitest)

| ID | Covers | Test |
|----|--------|------|
| TT-01 | FR-001, FR-004 | `GET …/stats` returns per-campaign and per-channel signup counts aggregated from `marketingleads`; a campaign and a channel with zero signups appear with a zero count, not omitted. |
| TT-02 | FR-002 | Stats response includes pageview counts read from the existing pageview lambda store; no new pageview/analytics rows are written to the app DB. |
| TT-03 | FR-003 | `GET …/stats` honors `campaignid`/`segment`/`sourceproperty`/date-range filters; admin auth required (401/403 without). |
| TT-04 | FR-005 | With the pageview lambda store forced unreachable, the endpoint still returns signup aggregates and marks pageviews unavailable (no failed response). |
| TT-05 | FR-007 | Capture derivation: a broad-market `wxperts`-property campaign derives `segment="broad"`; client-supplied segment is ignored. |
| TT-06 | FR-008 | Campaign and asset `targetsegment` accept and persist `broad`; the value round-trips through the targeting endpoint. |
| TT-07 | FR-009 | Funnel and stats segment filters return `broad` leads/outcomes correctly and exclude other segments when filtered. |
| TT-08 | FR-011, FR-012 | An authored `(assetkey, locale="fr-FR")` row is stored as a sibling of the en-US asset via the 048 asset endpoint; no machine-translation engine is invoked. |
| TT-09 | FR-013 | Requesting a locale with an existing sibling serves that variant; requesting a locale with no sibling falls back to the en-US asset and never 404s. |
| TT-10 | FR-014 | *(Conditional)* If `assetsegments` is implemented: an asset can be associated with multiple segments and `(assetid, segment)` is unique. Skipped while the single-field model stands. |

## E2E (Playwright)

| ID | Covers | Scenario |
|----|--------|----------|
| E2E-01 | FR-001…FR-006 | Admin opens SysAdmin → Marketing → Stats; sees per-campaign/-channel signups + pageviews; filters by segment/source/campaign/date and the numbers reconcile with the leads funnel. |
| E2E-02 | FR-007…FR-010 | A broad-market wxperts.com signup is captured as `segment="broad"`, appears in the funnel filtered to `broad`, and is counted on the stats surface under `broad`. |
| E2E-03 | FR-011…FR-013 | A page requested in `fr-FR` serves the authored French variant; the same page requested in `it` (no sibling authored) serves the en-US fallback without error. |

## Manual / Post-launch verification

- Stats reconciliation: pick a known campaign, confirm the stats signup count matches a direct `marketingleads` query and the pageview number matches the lambda store.
- Lambda-outage path exercised against the live read: signups still render, pageviews show unavailable.
- Broad-segment round-trip on wxperts.com: submit → `broad` derived → funnel filter → stats count.
- Locale delivery: verify fr-FR/es/pt-BR served where authored, and en-US fallback for an un-authored locale (never 404).

## Exit Criteria

All TT-* (excluding the conditional TT-10 unless `assetsegments` is implemented) and E2E-* pass; `check-types` clean for new files; `auditfences` 0 violations; no new analytics infrastructure introduced; stats reconcile against the funnel; en-US fallback verified.
