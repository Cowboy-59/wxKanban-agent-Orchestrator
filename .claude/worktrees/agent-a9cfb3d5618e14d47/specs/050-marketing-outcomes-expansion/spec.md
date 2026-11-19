# Spec 050: Marketing — Outcomes & Expansion

**Spec Number**: 050
**Status**: `draft`
**Created**: 2026-06-08
**Parent Scope**: spec 045 (Marketing — umbrella; this is Spec 5 of the 5-spec split, **Phase 2 / post-launch** — NOT July-5 critical)
**Depends On**: spec 046 (Lead Capture & Funnel — provides `marketingleads` attribution fields + the `segment` enum incl. `broad`), spec 048 (In-App Marketing Module — provides `marketingassets` + the `assetkey`+`locale` sibling model this spec authors translation rows against), spec 047 (windev.wxperts.com integration — site delivery this spec serves locale variants through), spec 049 (wxperts.com migration + integration — broad-segment home property + site delivery)
**Blocks**: none (terminal spec in the 045 family)
**Source**: `specs/Project-Scope/045-marketing.md` (Section 9, Spec 5)

---

## Overview

The Phase 2 / post-launch slice of the Marketing scope, built on top of the funnel (046), the module + assets (048), and the two integrated sites (047/049). It adds three things and **no new infrastructure**: (1) **Outcome signals (A4)** — a SysAdmin stats surface showing per-campaign / per-channel signups aggregated from the existing `marketingleads` attribution (`campaignid`, `sourceproperty`, `segment`) plus pageviews **read from the existing pageview lambda store** — explicitly *not* a new analytics platform; (2) **Segment 2 activation** — the broad non-AI→AI converts audience (`segment="broad"`, home property wxperts.com), putting the already-defined enum value into active use across campaign/asset targeting, capture-time segment derivation, and funnel filtering; (3) **Translations** — authored (never machine-translated) locale-content rows for key marketing assets via the `assetkey`+`locale` sibling model from 048 (fr-FR, es, pt-BR, it, de), with site delivery serving the right variant and en-US fallback.

This spec deliberately ships *after* the July 5 launch is live and the Phase-1 funnel is proven. It surfaces and aggregates data that already exists rather than building new capture or new storage; its only conditional new table is a many-to-many `assetsegments` join, included **only if** the single-primary-segment model from 048 proves insufficient (default KISS keeps the single field).

## Business Problem

After July 5 the funnel is capturing leads with full attribution (segment, source, campaign, locale), but the team has no consolidated view of *what worked* — which campaign and which channel produced signups, and how those map to the pageviews already collected by the existing lambda. Separately, Phase 1 shipped only two audience segments with concrete messaging (WinDev converts, career-changers); the broad non-AI→AI segment is defined in the enum but not yet targeted, so the wider market the launch opens can't be addressed without one-size-fits-all messaging. And the marketing content is authored en-US-first with the structure ready for translations, but the actual non-English content rows the heavily-French WinDev community needs don't exist yet. This spec closes those three Phase-2 gaps using data and machinery that already exist.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | wxperts platform admin — reads outcome stats in SysAdmin, targets the broad segment in campaigns/assets, authors/uploads translation content rows. |
| **Secondary Actors** | **wxKanban server** (aggregates `marketingleads`, reads the existing pageview lambda store, derives `broad` segment at capture, serves locale-correct assets); **existing pageview lambda** (the *only* analytics source — read, never rebuilt); **site visitor / prospect** (now reachable as the broad segment, and served translated content with en-US fallback). |
| **Key Value** | Per-campaign / per-channel outcome visibility, an activated third audience, and real non-English content — all from existing data, attribution, and asset machinery; no new analytics platform, no new capture, no machine translation. |
| **Transport** | REST under `/api`. `GET /api/sysadmin/marketing/stats` behind admin auth. Asset translation rows authored through the existing 048 SysAdmin asset endpoints. **Not MCP** — internal admin + public site delivery. |
| **Source of truth** | Signups: existing `marketingleads` rows (046). Pageviews: the **existing pageview lambda store** (read-only; not copied into our DB). Translation content: `marketingassets` rows keyed by `(assetkey, locale)` (048). |
| **Analytics rule** | **NO new analytics infra.** Stats are computed by aggregating `marketingleads` (group by `campaignid` / `sourceproperty` / `segment`) and reading pageview counts from the existing lambda store. We surface numbers; we do not rebuild GA. |
| **Segment activation** | `segment="broad"` (already in the 046 enum) becomes a *used* value: capture-time derivation rules route the wxperts property's broad-market campaigns to `broad`; campaign/asset `targetsegment` accepts it; the funnel + stats filter on it. |
| **i18n** | Authored translation content only (fr-FR, es, pt-BR, it, de) as `(assetkey, locale)` siblings; site delivery serves the requested locale variant with **en-US fallback**, never 404. **No machine-translation engine** — translations are authored/supplied, stored, served. |
| **Scope Boundary** | **IN**: `GET /api/sysadmin/marketing/stats` (per-campaign/-channel signups from `marketingleads` + pageviews from the existing lambda) + a SysAdmin stats surface; activating `segment="broad"` in capture derivation, campaign/asset targeting, and funnel/stats filtering; authoring non-English asset content rows (fr-FR/es/pt-BR/it/de) via the 048 `assetkey`+`locale` model; site delivery serving the correct locale variant with en-US fallback; **conditional** `assetsegments` join table **only if** single-primary-segment proves insufficient (default: do not add it). **OUT**: the capture funnel (046); the module + public bucket (048); site capture wiring (047/049); email-drip / automation; social auto-posting; **machine translation**; CRM scoring; paid ads; building our own analytics platform. |

---

## Functional Requirements

**Outcome signals (A4)**

- **FR-001** The system MUST expose admin-authed `GET /api/sysadmin/marketing/stats` returning, per campaign and per channel, the **count of signups** aggregated from `marketingleads` (grouped by `campaignid`, `sourceproperty`, and `segment`).
- **FR-002** The stats endpoint MUST also return **pageview counts read from the existing pageview lambda store**; it MUST NOT persist its own pageview/analytics records or stand up any new analytics infrastructure.
- **FR-003** The stats endpoint MUST support filtering by `campaignid`, `segment`, `sourceproperty`, and a date range, so outcomes can be sliced consistently with the funnel (046).
- **FR-004** Signup aggregation MUST be computed by querying `marketingleads` (no denormalized counter table); a campaign or channel with zero signups MUST appear with a zero count, not be omitted.
- **FR-005** If the pageview lambda store is unreachable, the endpoint MUST still return signup aggregates and surface pageviews as unavailable (best-effort), never failing the whole response.
- **FR-006** A new **SysAdmin Marketing stats surface** MUST present per-campaign / per-channel signups and pageviews with the segment / source / campaign / date-range filters, reachable from the SysAdmin Marketing area introduced in 046/048.

**Segment 2 activation (broad)**

- **FR-007** The capture-time **segment derivation rules** (server-side, 046 FR-003) MUST be extended so that broad-market campaigns on the `wxperts` property derive `segment="broad"`; the client still never asserts segment.
- **FR-008** Campaign and asset `targetsegment` MUST accept and persist `broad`, and the SysAdmin campaign/asset targeting UI MUST offer it as a selectable segment.
- **FR-009** The leads funnel (046) and the stats surface (FR-006) MUST allow filtering by `segment="broad"`, slicing broad-segment leads and outcomes.
- **FR-010** Broad-segment campaigns/assets MUST use the **wxperts.com** home property for targeting and delivery (per 045 Section 3), consistent with the 049 integration.

**Translations**

- **FR-011** The system MUST support **authored** non-English content rows for key marketing assets in locales `fr-FR`, `es`, `pt-BR`, `it`, and `de`, stored as `(assetkey, locale)` siblings of the en-US asset via the existing 048 `marketingassets` model — **no new table** for translations.
- **FR-012** Translation content MUST be authored/supplied and stored through the existing 048 SysAdmin asset endpoints; the system MUST NOT invoke any machine-translation engine.
- **FR-013** Site delivery (047/049) MUST serve the requested locale's asset variant when an `(assetkey, locale)` row exists, and **fall back to the en-US sibling** when it does not, never 404-ing on a missing translation.

**Conditional many-to-many targeting**

- **FR-014** *(Conditional)* IF the single-primary-`targetsegment` field on `marketingassets`/`campaigns` proves insufficient for real multi-segment targeting, the system MAY add an `assetsegments` join table for true asset→segment many-to-many. Default (KISS): **do not add it**; keep the single field. This requirement is dormant unless data warrants it.

---

## Entities

**No new required tables.** This spec reuses existing tables introduced in 046/048:

- **`marketingleads`** (existing, 046) — read-only here: aggregated by `campaignid` / `sourceproperty` / `segment` for signup outcomes (FR-001, FR-004); broad-segment rows produced by extended derivation (FR-007).
- **`campaigns`** (existing, 046/048) — `targetsegment`/`segment` now accepts `broad` (FR-008); referenced by stats grouping.
- **`marketingassets`** (existing, 048) — new authored `(assetkey, locale)` sibling rows for fr-FR/es/pt-BR/it/de (FR-011); `targetsegment` accepts `broad`.
- **`campaignposts`** (existing, 048) — `channel` provides the per-channel dimension for stats grouping (FR-001).
- **Pageview lambda store** (existing, external) — read-only analytics source (FR-002); not modeled in our DB.

**`assetsegments`** *(conditional, FR-014 — created only if single-primary-segment proves insufficient)* — `id` (uuid v7 PK), `companyid` (FK), `assetid` (FK → marketingassets), `segment` (`windev`|`careerchanger`|`broad`), `createdat`. `(assetid, segment)` unique.

Conventions: plural lowercase, no underscores/camelCase, UUID v7 PKs, FK = parent + `id`, `companyid` on every table.

---

## Success Metrics

1. An admin can open the SysAdmin Marketing stats surface and see **per-campaign and per-channel signup counts** (from `marketingleads`) alongside **pageviews from the existing lambda**, sliced by segment / source / campaign / date range — with zero-count campaigns/channels still shown.
2. **No new analytics infra:** stats are computed purely from `marketingleads` aggregation + the existing pageview lambda read; a lambda outage degrades to signups-only, never a failed response.
3. The `broad` segment is **active end-to-end**: a broad-market wxperts.com campaign derives `segment="broad"` at capture, is selectable as a targeting segment, and is filterable in both the funnel and the stats surface.
4. Key marketing assets exist in **fr-FR/es/pt-BR/it/de** as authored `(assetkey, locale)` siblings; site delivery serves the requested locale and falls back to en-US (never 404) when a translation is missing.
5. No machine-translation engine is introduced; all translation content is authored/supplied, stored, and served.
6. The single-primary-segment model is retained unless data demonstrably requires many-to-many, in which case (and only then) the `assetsegments` join is added.

---

## Out of Scope (covered by other 045 specs or explicitly excluded)

The capture funnel + public capture endpoint (046); the in-app module, asset library, posts board, and public S3 bucket (048); embedding the capture form and asset-serving on the live sites (047 windev, 049 wxperts.com); email-drip / marketing-automation / sequences / A/B; social-media auto-posting / scheduling; **machine translation**; CRM-grade lead scoring; paid-ads management; building our own analytics platform (the existing pageview lambda is the only analytics source).
