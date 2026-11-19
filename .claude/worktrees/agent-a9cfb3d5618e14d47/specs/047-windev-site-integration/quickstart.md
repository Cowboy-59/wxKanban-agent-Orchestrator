# Quickstart: Marketing — windev.wxperts.com Integration

**Spec**: 047 | **Created**: 2026-06-08

Integration scenarios that demonstrate wiring the live windev.wxperts.com site to the launch funnel end-to-end.

---

## Scenario 1 — Capture a WinDev signup from the live site

1. On windev.wxperts.com, fill the embedded capture form (email, optional name, optional `company`/`platformfrom`) and submit.
2. The site POSTs to `POST /api/marketing/leads` with `{ email, name?, sourceproperty: "windev", campaign: "<july5>", locale: "en-US", <honeypot> }` and **no** `segment`.
3. **Expect:** 200 within 3s; an inline locale-aware confirmation/thank-you shown; a `marketingleads` row (spec 046) with `sourceproperty="windev"`, `segment="windev"` (server-derived), the July-5 `campaignid`, and `locale="en-US"`; the lead visible in the 046 SysAdmin Marketing funnel as `new`.

## Scenario 2 — CORS allowlist

1. Submit the capture POST from the windev.wxperts.com origin.
2. **Expect:** accepted (windev origin on the 046 allowlist).
3. Issue the same POST from a non-allowlisted origin.
4. **Expect:** rejected (CORS) — no lead persisted.

## Scenario 3 — Locale awareness + fallback

1. Visit the site with an unsupported locale (e.g. `fr-FR`) before French strings exist; submit the form.
2. **Expect:** form labels/confirmation render in **en-US** (fallback), no broken/404 state; the capture POST sends `locale="fr-FR"` so the persisted lead records `locale="fr-FR"`.

## Scenario 4 — Anti-spam parity

1. Submit with the honeypot field filled (simulated bot).
2. **Expect:** rejected end-to-end by the 046 endpoint — nothing persisted; legitimate submissions under the rate limit still succeed.

## Scenario 5 — Public asset serving (after spec 048)

1. With the 048 public-read bucket + CloudFront available, load a site page that references images and a video MP4.
2. **Expect:** assets render from the CloudFront distribution over the public-read bucket (not the API server / ad-hoc location).
3. With the bucket **not yet** available, load the same page.
4. **Expect:** the site serves its current assets and the capture funnel still works — asset-serving staging is non-blocking.

## Scenario 6 — Pageview attribution

1. Browse several windev.wxperts.com pages.
2. **Expect:** pageviews emit/link to the existing pageview lambda and are attributable to windev (distinguishable from other sources). No in-app dashboard here — that is spec 050.

## Scenario 7 — Deploy through the existing pipeline

1. Make a site change (e.g. a confirmation-copy tweak) and deploy via `marketing/site/deploy/*` + `redeploy.ps1` using AWS profile `Andy`.
2. **Expect:** the change goes live through the existing (extended, not replaced) pipeline; no new pipeline required.
