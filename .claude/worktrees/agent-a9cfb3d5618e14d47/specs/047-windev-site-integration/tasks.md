# Task Breakdown: Marketing — windev.wxperts.com Integration

**Feature**: Marketing — windev.wxperts.com Integration
**Spec**: 047
**Date Generated**: 2026-06-08
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Add windev origin to 046 CORS allowlist (env) | high | todo |
| 2 | T002 Embed shared capture form posting to /api/marketing/leads | high | todo |
| 3 | T003 Locale-aware confirmation/thank-you + error states | high | todo |
| 4 | T004 Hook windev pageviews to existing pageview lambda | medium | todo |
| 5 | T005 Extend existing marketing/site deploy pipeline | high | todo |
| 6 | T006 Serve public assets (images + MP4s) from 048 bucket via CloudFront | medium | todo |

## Task Details

### T001 — Add windev origin to 046 CORS allowlist (env)

Add the `windev.wxperts.com` origin to the env-configured **CORS allowlist** on the spec 046 `POST /api/marketing/leads` endpoint (no wildcard) so the cross-origin capture POST from the live site is accepted (FR-009). This is a cross-spec config change — coordinate the env update (App Runner console convention) with the 046 deploy so the allowlist is live before the windev form goes public. Verify allowlisted-accept / other-reject.

### T002 — Embed shared capture form posting to /api/marketing/leads

Embed the **shared public signup/lead capture form** on windev.wxperts.com (email required; optional name; optional qualifying fields `company`, `platformfrom`) submitting to `POST /api/marketing/leads` (spec 046) (FR-001). Every submission MUST send `sourceproperty="windev"`, the **July-5 launch campaign** slug/id, and the visitor `locale`; the site MUST NOT assert `segment` — the server derives it (FR-002). Include the **honeypot** field the 046 endpoint expects so anti-spam works end-to-end; no CAPTCHA in v1 (FR-003). Deploys through the existing pipeline (T005).

### T003 — Locale-aware confirmation/thank-you + error states

On a successful capture response, show a **locale-aware confirmation / thank-you** state inline (no full reload); on a validation/error response, surface the locale-keyed error returned by the endpoint (FR-004). Externalize all form labels, placeholders, and confirmation copy into **locale-keyed** resources with **en-US fallback** (en-US authored; structure ready for fr-FR/es/pt-BR/it/de); a missing translation resolves to en-US and never renders a broken/404 state (FR-005). Determine the visitor `locale` (browser/Accept-Language or path/param convention) and pass it on the capture POST so the persisted lead records the correct `locale` (FR-006).

### T004 — Hook windev pageviews to existing pageview lambda

Wire windev pageviews to the **existing pageview lambda** so windev traffic is attributable (FR-010). This task only ensures the site emits/links analytics — it builds **no dashboard** (the in-app stats surface is spec 050). Confirm windev pageviews are distinguishable from other sources.

### T005 — Extend existing marketing/site deploy pipeline

Extend — **do not replace** — the existing `marketing/site/deploy/*` + `redeploy.ps1` pipeline (AWS profile `Andy`) to deploy the form snippet, locale resources, pageview hook, and (later) asset references (FR-011). Keep the known-good deploy flow intact; add only what the new artifacts need.

### T006 — Serve public assets (images + MP4s) from 048 bucket via CloudFront

*(After spec 048 creates the bucket.)* Repoint the site's public binary assets (images + the existing video MP4s) to the **dedicated public-read S3 bucket via the existing CloudFront pattern** (FR-007). Because the bucket is created in **048**, this lands as an **isolated second deploy**: if 048 is not ready, the site keeps serving its current assets and the capture funnel is unaffected — this task is **non-blocking** for the launch funnel (FR-008).

---

## Sequencing

Critical path for July 5 (capture funnel): **T001 → T002 → T003**, deployed via **T005**, then **T004** for attribution. T001 must be coordinated with the 046 deploy. **T006 is gated on spec 048** delivering the public-read bucket and is the only task that may trail launch — it is non-blocking for the funnel. The whole spec depends on **046 being live** (the endpoint this site posts to).
