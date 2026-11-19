# Quickstart: Marketing — wxperts.com Migration + Integration

**Spec**: 049 | **Created**: 2026-06-08

Integration scenarios that demonstrate the migration + wiring end-to-end. The cutover scenario is the centerpiece — it is a **live-site DNS flip** and is verify-before-flip, gated, and rollback-ready. **Not gated on July 5 — schedule deliberately.**

---

## Scenario 1 — Pre-migration inventory

1. Capture current wxperts.com hosting: host/provider, registrar + nameservers, all DNS records (A/AAAA/CNAME/**MX**/TXT), TLS arrangement, and a content manifest.
2. Identify the broad/company-brand content (Segment 3 educational framing + Segment 2 broad-audience home property).
3. **Expect:** a complete inventory + the *current* DNS values recorded (these feed the rollback); MX/TXT noted so company email isn't disrupted.

## Scenario 2 — Stand up on the AWS stack (mirror windev)

1. Using AWS profile `Andy`, deploy the site to **S3 + CloudFront + Route53** by extending the existing pipeline (`marketing/site/deploy/*`, `redeploy.ps1`) — mirroring the windev setup.
2. Keep all infra IDs (bucket, CloudFront id, hosted-zone id, cert ARN, region) in env/deploy config, never committed.
3. **Expect:** the site is reachable on the **CloudFront distribution domain / a test hostname** with valid TLS — and **no DNS for wxperts.com has changed yet.**

## Scenario 3 — Verify on preview (HARD GATE, before any DNS change)

1. On the CloudFront preview URL, confirm content renders, TLS is valid, the capture form is reachable, and assets load.
2. **Expect:** all checks pass. **If anything fails, the DNS cutover does NOT proceed.** Record the result in the cutover runbook.

## Scenario 4 — DNS cutover (isolated, gated, rollback-ready)

1. **Pre-flight:** confirm Scenario 3 passed; confirm the rollback (one-step revert to the old host via Route53 / registrar) is documented and ready with prior DNS values; get explicit go/no-go.
2. Perform the DNS flip as a **single deliberate action** (separate from stand-up/wiring), pointing wxperts.com at CloudFront. Leave MX/TXT untouched.
3. **Post-flip verify:** live wxperts.com resolves to CloudFront, valid TLS, capture round-trips, assets load, pageviews flow to the lambda; company email still works (MX preserved).
4. **Expect:** live site served from CloudFront. **If post-flip verification fails → execute the one-step rollback** and re-diagnose. (This is the riskiest step; never run it under launch pressure.)

## Scenario 5 — Capture round-trip on the migrated site

1. On live wxperts.com, submit the embedded capture form with a visitor `locale`.
2. **Expect:** the form POSTs to `POST /api/marketing/leads` with `sourceproperty="wxperts"` + `locale`; CORS accepts the wxperts.com origin; a `marketingleads` row is created (segment derived server-side) and a localized confirmation is shown; the lead appears in the SysAdmin funnel (046).

## Scenario 6 — Assets + analytics

1. Load a page referencing public binary assets (image/video/download).
2. **Expect:** assets serve from the **048 dedicated public bucket** via CloudFront; the pageview is recorded by the **existing pageview lambda**, mirroring windev.

## Scenario 7 — i18n fallback

1. Submit the capture form with `locale: "fr-FR"` before French strings exist.
2. **Expect:** confirmation served in **en-US** (fallback); `locale="fr-FR"` recorded on the lead (via 046); no error, no 404.
