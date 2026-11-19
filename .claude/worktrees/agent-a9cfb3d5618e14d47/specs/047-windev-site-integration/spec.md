# Spec 047: Marketing — windev.wxperts.com Integration

**Spec Number**: 047
**Status**: `draft`
**Created**: 2026-06-08
**Parent Scope**: spec 045 (Marketing — umbrella; this is Spec 2 of the 5-spec split, **launch-critical** for July 5 2026)
**Depends On**: spec 046 (Lead Capture & Funnel — the `POST /api/marketing/leads` endpoint this site posts to), spec 048 (In-App Marketing Module — **creates the dedicated public-read S3 bucket** this spec serves assets from), spec 004 (LandingPage), spec 044 (landing-docs — the `wxkanban.wxperts.com/docs` video pages whose MP4 assets this site references)
**Blocked-by (asset-serving only)**: spec 048 — the public-read S3 bucket is created in 048; until it exists, 047 ships the **capture-form integration first** and **asset-serving second** (see Scope Boundary + Build Order).
**Source**: `specs/Project-Scope/045-marketing.md` (Section 9, Spec 2; capability C1)

---

## Overview

The second launch-critical slice of the Marketing scope: wire the **already-live** windev.wxperts.com site (on S3/CloudFront/Route53, the WinDev→AI-dev wedge) to the lead-capture funnel built in spec 046, serve the site's public binary assets from the dedicated public-read S3 bucket, and make the site locale-aware. windev.wxperts.com is the sharp beachhead property; this spec turns it from a static brochure into a working top of the launch funnel. The site embeds the **shared public signup/lead form**, posting to `POST /api/marketing/leads` (spec 046) with `sourceproperty="windev"`, the July-5 campaign slug, and the visitor's locale; the server derives `segment="windev"` and persists the lead. The site then shows a **locale-aware confirmation / thank-you** state (en-US authored, fallback to en-US). Public images and the existing video MP4s are served from the new bucket via the existing CloudFront pattern, and windev pageviews are hooked to the existing pageview lambda so they are attributable.

This spec **extends — does not replace** — the existing `marketing/site/` deploy pipeline (`marketing/site/deploy/*`, `redeploy.ps1`), using AWS profile `Andy`. It deliberately ships only the windev integration: the capture endpoint itself (046), the in-app module + bucket creation (048), the wxperts.com migration (049), and the analytics surfaces (050) are separate specs.

## Business Problem

The July 5 launch points its sharpest message — the WinDev→AI-dev wedge — at windev.wxperts.com, but the live site today is a static property with no working capture, no link to the funnel, and no attributable analytics. A visitor who is convinced has nowhere to convert, the team gets no lead, and there is no way to tell windev traffic apart from any other source. This spec closes that gap: it embeds the shared capture form pointed at the 046 endpoint with full attribution (`sourceproperty="windev"`, campaign, locale), serves the site's public assets (including the video MP4s) from the dedicated bucket via CloudFront, and ensures the site emits attributable pageviews — making windev the measurable, conversion-ready top of the launch funnel without rebuilding the deploy pipeline.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | Site visitor / prospect on windev.wxperts.com — submits the embedded signup/lead form. |
| **Secondary Actors** | **wxKanban server** (owns `POST /api/marketing/leads` — spec 046 — which this site posts to); **CloudFront / public-read S3 bucket** (serves the site's public binary assets; bucket created in 048); **existing pageview lambda** (analytics source the site links/emits to). |
| **Key Value** | Turns the live WinDev beachhead site into a working, attributable top of the launch funnel — capture posted to 046 with `sourceproperty="windev"` + campaign + locale, locale-aware confirmation, public assets served via CloudFront, pageviews attributable. |
| **Transport** | The site is **static** (S3/CloudFront). It calls the **public REST** endpoint `POST /api/marketing/leads` (spec 046) cross-origin. The windev origin MUST be on that endpoint's CORS allowlist (env config). **Not MCP** — public web traffic. |
| **Source of truth** | The `marketingleads` DB row, owned and written by spec 046. This spec **produces** that row by posting the form; it adds no new system of record. |
| **Segment derivation** | Server-side (spec 046, FR-003): `sourceproperty="windev"` → `segment="windev"`. The site asserts only `sourceproperty`, campaign, and locale — never the segment. |
| **i18n** | The embedded form labels/placeholders and the confirmation/thank-you state are **locale-keyed** with **en-US fallback** (en-US authored). Visitor locale is sent on the capture POST as `locale`. A missing translation resolves to en-US, never a broken/404 page. |
| **Assets** | Public images + the existing video MP4s the site references are served from the **dedicated public-read S3 bucket via the existing CloudFront pattern**. The **bucket is created in spec 048** — until then, capture-form integration ships first and asset-serving second (graceful staging). |
| **Pipeline** | The existing `marketing/site/` deploy flow (`marketing/site/deploy/*`, `redeploy.ps1`, AWS profile `Andy`) is **extended, not replaced** — the form snippet, locale resources, asset references, and pageview hook deploy through it. |
| **Scope Boundary** | **IN**: embed the shared capture form on windev.wxperts.com posting to `POST /api/marketing/leads` with `sourceproperty="windev"` + July-5 campaign + visitor `locale`; locale-aware confirmation/thank-you state (en-US authored, en-US fallback); serve public images + video MP4s from the dedicated public-read bucket via the existing CloudFront pattern (depends on 048's bucket); add the windev origin to the 046 CORS allowlist (env); hook windev pageviews to the existing pageview lambda so they are attributable; extend the existing `marketing/site/deploy/*` + `redeploy.ps1` pipeline (profile `Andy`). **OUT (other specs)**: the capture endpoint + funnel + notifications (046); the in-app marketing module + **bucket creation** + asset library/upload (048); wxperts.com hosting migration + integration (049); analytics dashboards / stats surfaces (050); email-drip / marketing automation; in-app WYSIWYG/CMS site-content editing; non-EN translation content (lands per language wave). |

---

## Functional Requirements

**Capture-form integration**

- **FR-001** windev.wxperts.com MUST embed the **shared public signup/lead capture form** (email required; optional name; optional qualifying fields `company`, `platformfrom`) and submit it to `POST /api/marketing/leads` (spec 046).
- **FR-002** Every submission from windev MUST send `sourceproperty="windev"`, the **July-5 launch campaign** slug/id, and the visitor's `locale`; the site MUST NOT assert `segment` (the server derives it — spec 046 FR-003).
- **FR-003** The form MUST include the **honeypot** field expected by the 046 endpoint (FR-006) so anti-spam works end-to-end; the site MUST NOT add its own CAPTCHA in v1.
- **FR-004** On a successful capture response the site MUST show a **locale-aware confirmation / thank-you** state inline (no full reload required); on a validation/error response it MUST surface the locale-keyed error returned by the endpoint.

**Locale awareness**

- **FR-005** All form labels, placeholders, and the confirmation/thank-you copy MUST be **locale-keyed** with **en-US fallback** (en-US authored first; structure ready for fr-FR/es/pt-BR/it/de); a missing translation MUST resolve to en-US and never render a broken/404 state.
- **FR-006** The site MUST determine the visitor `locale` (e.g. from the browser/Accept-Language or a path/param convention) and pass it on the capture POST so the persisted lead records the correct `locale`.

**Public asset serving**

- **FR-007** Public binary assets referenced by the site (images and the existing video MP4s) MUST be served from the **dedicated public-read S3 bucket via the existing CloudFront pattern**, not from the API server or an ad-hoc location.
- **FR-008** Because the public-read bucket is **created in spec 048**, this spec MUST allow capture-form integration to ship **before** asset-serving: if the bucket is not yet available, the site continues serving its current assets and the asset-serving cutover lands as a separate, isolated deploy once 048 provides the bucket. This dependency MUST be documented and the staging MUST be non-blocking for the capture funnel.

**CORS**

- **FR-009** The windev.wxperts.com origin MUST be present on the spec 046 `POST /api/marketing/leads` **CORS allowlist** (env-configured, no wildcard) so the cross-origin capture POST is accepted; the allowlist change MUST be coordinated with the 046 env config.

**Analytics attribution**

- **FR-010** windev pageviews MUST be wired to the **existing pageview lambda** so windev traffic is attributable (the in-app stats surface is spec 050; this spec only ensures the site emits/links analytics — it builds no dashboard).

**Deploy pipeline**

- **FR-011** All site changes (form snippet, locale resources, asset references, pageview hook) MUST deploy through the **existing** `marketing/site/deploy/*` + `redeploy.ps1` pipeline using AWS profile `Andy`; the pipeline is **extended, not replaced**.

---

## Entities

**No new database tables.** This spec adds no system of record. The lead it produces is persisted to the **`marketingleads`** table owned by spec 046 (via `POST /api/marketing/leads`); campaign attribution uses the **`campaigns`** row seeded in 046 (the July-5 launch campaign). All DB writes are server-side in 046 — windev is a static site that posts to that endpoint.

Static/config artifacts introduced by this spec (not DB):
- Locale-keyed string resources for the embedded form + confirmation (en-US authored; en-US fallback).
- Public-asset references pointed at the CloudFront distribution over the 048 public-read bucket.
- CORS allowlist entry for the windev origin (env config consumed by spec 046).

DB naming conventions (plural lowercase, no underscores/camelCase, UUID v7 PKs, FK = parent + `id`, `companyid` on every table) are honored by the 046 tables this spec reuses; 047 introduces none.

---

## Success Metrics

1. A visitor on windev.wxperts.com can submit the embedded form and receive a **localized confirmation within 3 seconds**; the lead persists to `marketingleads` (spec 046) with `sourceproperty="windev"`, `segment="windev"` (server-derived), the July-5 `campaignid`, and the correct `locale`.
2. The cross-origin capture POST from the windev origin is **accepted** (CORS allowlist) while non-allowlisted origins remain rejected; the honeypot/anti-spam works end-to-end.
3. A missing translation on the site falls back to **en-US** and never renders a broken/404 state.
4. Public images and the video MP4s render from the **dedicated public-read bucket via CloudFront** once 048 provides the bucket; until then the capture funnel works regardless (non-blocking staging).
5. windev pageviews are **attributable** through the existing pageview lambda.
6. Every site change deploys through the **existing** `marketing/site/deploy/*` + `redeploy.ps1` pipeline (profile `Andy`) — no pipeline replacement.

---

## Out of Scope (deferred to other 045 specs)

The capture endpoint + funnel + new-lead notifications (046); the in-app marketing module + **public-read S3 bucket creation** + asset library/presigned upload + posts board + campaign management UI (048); wxperts.com hosting migration + integration (049); analytics/stats dashboards (050); Segment 2 broad audience + non-EN translation content (050); email-drip / marketing automation, social auto-posting, in-app WYSIWYG/CMS content editing, CAPTCHA.
