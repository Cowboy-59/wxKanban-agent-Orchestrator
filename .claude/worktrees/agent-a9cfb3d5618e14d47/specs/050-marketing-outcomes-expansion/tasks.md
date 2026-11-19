# Task Breakdown: Marketing — Outcomes & Expansion

**Feature**: Marketing — Outcomes & Expansion
**Spec**: 050
**Date Generated**: 2026-06-08
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Outcome stats API (GET /api/sysadmin/marketing/stats) | medium | todo |
| 2 | T002 SysAdmin Marketing stats surface UI | medium | todo |
| 3 | T003 Activate broad segment in capture derivation + funnel/stats filtering | medium | todo |
| 4 | T004 Allow broad in campaign/asset targeting + wxperts.com home property | medium | todo |
| 5 | T005 Author non-English asset content rows (fr-FR/es/pt-BR/it/de) + verify delivery fallback | medium | todo |
| 6 | T006 (conditional) assetsegments many-to-many join table | low | todo |

## Task Details

### T001 — Outcome stats API (GET /api/sysadmin/marketing/stats)

Add the admin-authed `GET /api/sysadmin/marketing/stats` route on the main server (`src/server`, mounted via app.ts — not the dead index2.ts). Aggregate **signups from `marketingleads`** grouped by `campaignid`, `sourceproperty`, and `segment`, exposing per-campaign and per-channel counts (channel dimension from `campaignposts.channel`) (FR-001, FR-004); zero-count campaigns/channels MUST still appear. **Read pageview counts from the existing pageview lambda store** — do NOT persist any pageview/analytics rows or stand up new analytics infra (FR-002). Support `campaignid`/`segment`/`sourceproperty`/date-range filters matching funnel semantics (FR-003). If the lambda store is unreachable, return signup aggregates with pageviews marked unavailable, never failing the response (FR-005). Use `db/client.ts`.

### T002 — SysAdmin Marketing stats surface UI

Add a **stats surface** to the SysAdmin Marketing area (introduced in 046/048): per-campaign and per-channel signup counts plus pageviews, with segment / source / campaign / date-range filters (FR-006). Display pageviews-unavailable gracefully when the lambda read fails. Aggregates only — no per-lead PII on this surface. Internal UI English-only.

### T003 — Activate broad segment in capture derivation + funnel/stats filtering

Extend the server-side **segment derivation rules** (046 FR-003) so broad-market campaigns on the `wxperts` property derive `segment="broad"`; the client still never asserts segment (FR-007). Add `broad` to the leads-funnel (046) and stats-surface (FR-006) segment filters so broad leads and outcomes slice correctly (FR-009). No schema change — the enum already includes `broad` from 046.

### T004 — Allow broad in campaign/asset targeting + wxperts.com home property

Make `targetsegment`/`segment` accept and persist `broad` on campaigns and assets, and offer `broad` as a selectable option in the SysAdmin campaign/asset targeting UI (FR-008). Wire broad-segment campaigns/assets to the **wxperts.com** home property for targeting and delivery, consistent with the 049 integration (FR-010).

### T005 — Author non-English asset content rows + verify delivery fallback

Author/supply **non-English content rows** for key marketing assets in `fr-FR`, `es`, `pt-BR`, `it`, `de` as `(assetkey, locale)` siblings of the en-US assets, stored via the existing 048 SysAdmin asset endpoints — **no machine translation**, no new table (FR-011, FR-012). Verify site delivery (047/049) serves the requested locale's variant when present and **falls back to the en-US sibling** when absent, never 404 (FR-013).

### T006 — (conditional) assetsegments many-to-many join table

**Only if** the single-primary-`targetsegment` field proves insufficient for real multi-segment targeting: add an `assetsegments` join table (`id` uuid v7, `companyid`, `assetid` FK, `segment`, `createdat`; `(assetid, segment)` unique) for true asset→segment many-to-many, generate the migration via drizzle-kit, and apply via the pg.Client + transaction pattern (FR-014). Default (KISS): **do not implement** — keep the single field.

---

## Sequencing

Phase 2 / post-launch — runs after 046/047/048/049 ship; **not** on the July 5 critical path. **T001 → T002** deliver the outcome surface; **T003 → T004** activate the broad segment end-to-end (derivation before targeting/filtering relies on it); **T005** lands translation content and verifies delivery fallback independently. **T006** is dormant — implement only if data demonstrates many-to-many need.
