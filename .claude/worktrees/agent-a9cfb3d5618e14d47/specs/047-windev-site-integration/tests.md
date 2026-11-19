# Test Plan: Marketing — windev.wxperts.com Integration

**Spec**: 047 | **Created**: 2026-06-08
**Maps to**: spec.md functional requirements FR-001 … FR-011

---

## Unit / Integration (Vitest)

| ID | Covers | Test |
|----|--------|------|
| TT-01 | FR-001, FR-002 | The embedded form's submit handler posts to `POST /api/marketing/leads` with `sourceproperty="windev"`, the July-5 campaign slug, and the visitor `locale`; it never includes a `segment` field. |
| TT-02 | FR-003 | The form payload includes the honeypot field expected by the 046 endpoint; no CAPTCHA token is added. |
| TT-03 | FR-004 | A success response renders the inline confirmation/thank-you state (no reload); a 400/error response renders the locale-keyed error returned by the endpoint. |
| TT-04 | FR-005 | Form labels/placeholders/confirmation copy resolve from locale-keyed resources; an unsupported locale falls back to en-US and never renders a broken/empty state. |
| TT-05 | FR-006 | Visitor-locale detection (browser/Accept-Language or path/param) yields the `locale` sent on the capture POST. |
| TT-06 | FR-009 | A capture POST from the windev origin is accepted by the 046 endpoint (allowlisted); a POST from a non-allowlisted origin is rejected. |
| TT-07 | FR-007 | Public-asset URLs in the deployed site resolve to the CloudFront distribution over the 048 public-read bucket (once available), not the API server or an ad-hoc location. |
| TT-08 | FR-008 | With the 048 bucket unavailable, the capture-form path still functions and the site serves its current assets — asset-serving staging is non-blocking for the funnel. |
| TT-09 | FR-010 | windev pageviews emit/link to the existing pageview lambda and are attributable (distinguishable from other sources). |

## E2E (Playwright)

| ID | Covers | Scenario |
|----|--------|----------|
| E2E-01 | FR-001…FR-006 | On the windev site, fill and submit the capture form → success → inline localized confirmation shown → the lead appears in the spec 046 SysAdmin funnel with `sourceproperty="windev"`, `segment="windev"`, July-5 `campaignid`, and the sent `locale`. |
| E2E-02 | FR-004, FR-005 | Submit with an invalid email → locale-keyed error surfaced inline; request the site under an unsupported locale → en-US copy served, no broken/404 state. |

## Manual / Pre-launch verification

- Real round-trip against the **live** windev.wxperts.com + deployed 046 endpoint: form submit → `marketingleads` row (`sourceproperty="windev"`, `segment="windev"`, July-5 `campaignid`, correct `locale`) → confirmation shown → lead visible/worked in the 046 SysAdmin funnel.
- CORS verified: accepted from the windev origin, rejected from a disallowed origin; honeypot fill rejected end-to-end.
- Locale fallback verified with a `fr-FR` visit before French strings exist (must serve en-US, not break).
- Asset-serving verified **after 048** delivers the bucket: images + video MP4s render from the CloudFront distribution over the public-read bucket.
- Deploy verified through the existing `marketing/site/deploy/*` + `redeploy.ps1` pipeline (profile `Andy`) — pipeline unchanged in shape, only extended.
- windev pageviews verified attributable via the existing pageview lambda.

## Exit Criteria

All TT-* and E2E-* pass; `check-types` clean for any new files; `auditfences` 0 violations; pre-launch round-trip confirmed before July 5 2026. T006 (asset-serving) exit is gated on spec 048 delivering the public-read bucket and is the only criterion permitted to trail launch — it must not block the capture funnel.
