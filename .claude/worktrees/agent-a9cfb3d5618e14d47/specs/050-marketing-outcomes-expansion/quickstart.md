# Quickstart: Marketing — Outcomes & Expansion

**Spec**: 050 | **Created**: 2026-06-08

Integration scenarios that demonstrate the Phase-2 outcomes, broad-segment activation, and translations end-to-end. Runs **post-launch**, after 046/047/048/049 ship.

---

## Scenario 1 — Per-campaign / per-channel outcome stats

1. As an admin, `GET /api/sysadmin/marketing/stats`.
2. **Expect:** per-campaign and per-channel **signup counts** aggregated from `marketingleads` (grouped by `campaignid` / `sourceproperty` / `segment`) plus **pageviews read from the existing pageview lambda store**; campaigns/channels with zero signups appear with a zero count. No new analytics rows are written.

## Scenario 2 — Filtered, reconciled stats

1. `GET …/stats?segment=windev&campaignid=<july5>&from=…&to=…`.
2. **Expect:** numbers slice exactly like the leads funnel (046) for the same filters; the signup count matches a direct `marketingleads` query for that campaign.

## Scenario 3 — Pageview lambda outage (best-effort)

1. With the pageview lambda store unreachable, `GET …/stats`.
2. **Expect:** signup aggregates still returned; pageviews marked unavailable; the response does not fail.

## Scenario 4 — Activate the broad segment

1. Submit a broad-market signup from wxperts.com (broad-market campaign), `POST /api/marketing/leads` with `{ email, sourceproperty: "wxperts", campaign: "<broad-campaign>", locale: "en-US" }`.
2. **Expect:** server derives `segment="broad"` (client never asserts it); the lead is filterable as `broad` in the funnel and counted under `broad` on the stats surface.
3. In the SysAdmin campaign/asset targeting UI, select `broad` as the target segment → persists and round-trips.

## Scenario 5 — Authored translation + delivery fallback

1. Author a French content row for a key asset: store an `(assetkey, locale="fr-FR")` sibling of the en-US asset via the 048 SysAdmin asset endpoint (authored content — no machine translation).
2. Request that page in `fr-FR` → **the French variant is served**.
3. Request the same page in `it` (no Italian sibling authored) → **the en-US sibling is served as fallback**, never a 404.

## Scenario 6 — (conditional) Many-to-many targeting

1. *(Only if `assetsegments` is implemented because the single field proved insufficient.)* Associate one asset with both `windev` and `broad`.
2. **Expect:** the asset surfaces for both segments; `(assetid, segment)` is unique. By default this scenario is skipped — the single `targetsegment` field stands.
