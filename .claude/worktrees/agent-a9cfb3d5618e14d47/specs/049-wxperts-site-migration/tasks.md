# Task Breakdown: Marketing — wxperts.com Migration + Integration

**Feature**: Marketing — wxperts.com Migration + Integration
**Spec**: 049
**Date Generated**: 2026-06-08
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Pre-migration inventory (host, registrar, DNS, content) | high | todo |
| 2 | T002 Stand up wxperts.com on S3 + CloudFront + Route53 (mirror windev) | high | todo |
| 3 | T003 Verify on CloudFront preview URL (hard gate, pre-DNS) | high | todo |
| 4 | T004 Rollback plan + gated DNS-cutover runbook | high | todo |
| 5 | T005 DNS cutover — isolated gated flip + post-flip verify | high | todo |
| 6 | T006 Embed shared capture form + add wxperts.com to CORS allowlist | medium | todo |
| 7 | T007 Serve public assets from 048 bucket + hook pageview lambda | medium | todo |
| 8 | T008 Locale-aware capture confirmation/error strings (en-US fallback) | medium | todo |

## Task Details

### T001 — Pre-migration inventory (host, registrar, DNS, content)

Produce a complete inventory of current wxperts.com hosting **before any change** (FR-001, FR-002): current host/provider; DNS registrar + nameserver setup; all current DNS records (A/AAAA/CNAME/**MX**/TXT — capture MX/TXT so company email is not broken by the cutover); TLS/cert arrangement; and a content manifest of the live site. Explicitly identify and flag the **broad/company-brand content** — the Segment 3 educational framing and the Segment 2 broad-audience home property — so it migrates faithfully. The captured *current* DNS values feed the T004 rollback. (Inventory/runbook artifact; no app code.)

### T002 — Stand up wxperts.com on S3 + CloudFront + Route53 (mirror windev)

Stand the site up on **S3 + CloudFront + Route53** mirroring the known-good windev.wxperts.com setup (FR-003, FR-004), using AWS profile **`Andy`**. Reuse `marketing/site/` content + `marketing/site/deploy/*` templates (bucket policy, CloudFront distribution, Route53 alias) and **extend** `redeploy.ps1` — do not create a parallel pipeline. Put all infra identifiers/secrets (bucket name, CloudFront distribution id, hosted-zone id, cert ARN, region) in **env vars / deploy config, never committed** (FR-005). **No DNS change in this task** — stand-up only, reachable via the CloudFront distribution domain / a test hostname.

### T003 — Verify on CloudFront preview URL (hard gate, pre-DNS)

Fully verify the stood-up site on the **CloudFront distribution domain / test hostname before any DNS change** (FR-006): content renders correctly, TLS is valid, the capture form is reachable, and assets load. This is a **hard gate** — the DNS cutover (T005) MUST NOT proceed until this passes. Record verification results in the cutover runbook.

### T004 — Rollback plan + gated DNS-cutover runbook

Author the **cutover runbook** with an explicit **rollback plan ready before the flip** (FR-008): capture the prior DNS values (from T001), document the **one-step revert** (re-point the Route53 record / restore the prior registrar DNS to the old host), and define the go/no-go criteria + post-flip verification checklist (FR-009). Confirm MX/email records are preserved across the flip. (Runbook artifact; no app code.)

### T005 — DNS cutover — isolated gated flip + post-flip verify

Perform the **DNS cutover as an isolated, explicitly gated task** (FR-007), only after T003 passes and the T004 runbook/rollback are reviewed. Flip DNS to point wxperts.com at the CloudFront distribution in a single deliberate, scheduled action. Immediately run **post-cutover verification** (FR-009): live wxperts.com serves from CloudFront with valid TLS, capture works, assets load, analytics flow. On any failure, execute the **one-step rollback** (T004). This task carries the spec's primary risk — schedule deliberately, not under July 5 launch pressure.

### T006 — Embed shared capture form + add wxperts.com to CORS allowlist

After a verified cutover, embed the **shared public capture form** (mirroring spec 047's windev embed) posting to `POST /api/marketing/leads` with **`sourceproperty="wxperts"`** + the visitor's **`locale`**; the server derives `segment` — the client never asserts it (FR-010). **Add the wxperts.com origin to the spec 046 CORS allowlist** (configurable env, no wildcard) so the capture POST is accepted (FR-011).

### T007 — Serve public assets from 048 bucket + hook pageview lambda

Point the migrated site's **public binary assets** (images, videos, downloadables) at the **dedicated public-read bucket created in spec 048** via CloudFront — not a per-site ad-hoc bucket (FR-012). Hook the **existing pageview lambda** for analytics, mirroring the windev wiring, so wxperts.com pageviews flow into the same analytics path (FR-013; dashboards are 050).

### T008 — Locale-aware capture confirmation/error strings (en-US fallback)

Make the embedded capture form's labels, placeholders, and **confirmation/error strings locale-keyed with en-US fallback** (FR-014); a missing translation resolves to en-US and never errors or 404s. Author en-US; structure ready for fr-FR/es/pt-BR/it/de. (Lead `locale` persistence itself is owned by 046.)

---

## Sequencing

Strict ordering driven by cutover safety: **T001 (inventory) → T002 (stand up) → T003 (preview verify, HARD GATE) → T004 (rollback + runbook) → T005 (gated DNS flip + post-flip verify)**. Only **after a verified cutover** do the wiring tasks run: **T006 → T007 → T008** (capture embed + CORS, asset bucket + analytics, i18n). T006 depends on 046 (endpoint + CORS allowlist); T007 depends on 048 (public bucket). 049 is **not launch-blocking for July 5** — schedule the cutover deliberately, after the windev path (046 → 047) is proven.
