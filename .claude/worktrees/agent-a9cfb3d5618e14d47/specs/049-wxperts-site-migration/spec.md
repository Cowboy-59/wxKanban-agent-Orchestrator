# Spec 049: Marketing — wxperts.com Migration + Integration

**Spec Number**: 049
**Status**: `draft`
**Created**: 2026-06-08
**Parent Scope**: spec 045 (Marketing — umbrella; this is Spec 4 of the 5-spec split, **Phase 1 but NOT launch-critical** for July 5 2026 — the riskiest spec, scheduled deliberately)
**Depends On**: spec 046 (Lead Capture & Funnel — the `POST /api/marketing/leads` endpoint + `marketingleads`/`campaigns` schema this site posts to), spec 048 (In-App Marketing Module — the dedicated public S3 asset bucket + presigned-upload module this site serves assets from), spec 047 (windev.wxperts.com Integration — the proven site-integration pattern this spec mirrors)
**Blocks**: nothing launch-critical; unblocks spec 050 (Outcomes & Expansion — Segment 2 broad messaging + analytics on the migrated wxperts.com property)
**Source**: `specs/Project-Scope/045-marketing.md` (Section 9, Spec 4; capability C2)

---

## Overview

The riskiest Phase-1 slice of the Marketing scope: **migrate wxperts.com from its current (non-AWS) host onto the same S3 + CloudFront + Route53 stack** that already runs windev.wxperts.com (the known-good template), **then** wire it into the marketing machinery — lead capture, public-asset serving, and analytics — exactly as spec 047 did for windev.

wxperts.com today is a **live company-brand site hosted elsewhere**; it carries the broad/company-brand content (the Segment 3 educational framing + the Segment 2 broad-audience home property). Because this is a **DNS cutover on a live company site**, the spec is built around a **verify-before-flip gate**: stand the site up on CloudFront and fully verify it on a test domain / distribution preview URL **first**, then flip DNS in its own isolated, gated task, with a documented one-step rollback (revert DNS). The cutover is **not** launch-blocking for the July 5 windev launch and MUST be scheduled deliberately, not under launch pressure.

After cutover, the site embeds the **shared public capture form** posting to `POST /api/marketing/leads` (spec 046) with `sourceproperty="wxperts"` + the visitor's locale, serves public assets from the **dedicated public bucket** (created in spec 048), adds the wxperts.com origin to the spec 046 **CORS allowlist**, and hooks the existing **pageview lambda** for analytics — all mirroring the windev integration. Confirmation strings are locale-aware with en-US fallback.

## Business Problem

wxperts.com is the company's broad-brand home, but it lives **off** the managed AWS stack — so it cannot share the lead-capture endpoint, the public-asset bucket, the CloudFront/Route53 deploy pipeline, or the pageview analytics that windev.wxperts.com already uses. Until it is migrated, the broad/educational audience (Segments 2 + 3) has no system-of-record capture, the company brand site drifts from the managed pipeline, and the two web properties don't share a capture or analytics model. This spec brings wxperts.com onto the same stack and wires it in — but because it is a **live site with real DNS**, the migration carries genuine cutover risk and is treated as a deliberate, gated, rollback-ready operation rather than a launch-deadline scramble.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | wxperts platform admin / operator — runs the migration, verifies on the preview distribution, performs the gated DNS flip, and can roll back. |
| **Secondary Actors** | **Site visitor / prospect** (submits the public capture form on the migrated wxperts.com); **wxKanban server** (receives the lead at `POST /api/marketing/leads`, derives segment, persists, notifies — all owned by 046); **existing pageview lambda** (analytics source); **AWS** (S3 / CloudFront / Route53 under profile `Andy`). |
| **Key Value** | wxperts.com runs on the same managed S3/CloudFront/Route53 stack as windev, sharing one capture endpoint, one public-asset bucket, one deploy pipeline, and one analytics path — achieved via a **verified, rollback-ready** cutover that never risks the live company site. |
| **Transport** | The site is static (S3/CloudFront). Capture is **REST**: the embedded form posts to the **public** `POST /api/marketing/leads` (owned by 046, unauthenticated + CORS-allowlisted + rate-limited). **Not MCP** — public web traffic. |
| **Migration safety** | **Verify-before-flip.** Stand up + fully verify on CloudFront via a test/preview URL **before** any DNS change. The DNS flip is its **own isolated, gated task** with a documented **one-step rollback** (revert the Route53 record / re-point to the old host). |
| **Reuse, don't replace** | **Extend** the existing deploy pipeline (`marketing/site/`, `marketing/site/deploy/*`, `redeploy.ps1`) and mirror the windev setup (spec 047). No new pipeline, no new capture endpoint, no new bucket — those are owned by 046/048. |
| **i18n** | The embedded capture form's labels/confirmation are locale-keyed with **en-US fallback**; the lead records the visitor `locale` (handled by 046). Internal/admin surfaces unchanged. |
| **Scope Boundary** | **IN**: inventory of current wxperts.com hosting / DNS / registrar / content (incl. the broad-brand + educational content); standing wxperts.com up on S3 + CloudFront + Route53 mirroring windev (profile `Andy`), extending the existing pipeline; verify-before-flip cutover as an isolated gated task + rollback plan; post-cutover wiring — embed the shared capture form (`sourceproperty="wxperts"` + locale → `POST /api/marketing/leads`), serve public assets from the 048 bucket, add wxperts.com to the 046 CORS allowlist, hook the pageview lambda; locale-aware confirmation with en-US fallback. **OUT**: the capture endpoint + `marketingleads`/`campaigns` schema (046); the public asset bucket creation + presigned-upload module (048); the windev.wxperts.com integration (047); analytics **dashboards** + Segment 2 broad messaging/content authoring (050); email-drip / automation. |

---

## Functional Requirements

**Pre-migration inventory**

- **FR-001** Before any infrastructure change, the team MUST produce an **inventory** of the current wxperts.com hosting: current host/provider, the DNS registrar + nameserver setup, the current DNS records (A/AAAA/CNAME/MX/TXT — capturing MX/email so mail is not broken by the cutover), TLS/cert arrangement, and a content manifest of the live site.
- **FR-002** The inventory MUST identify and preserve the **broad/company-brand content** — Segment 3 educational framing and the Segment 2 broad-audience home property — so it is migrated faithfully (authoring of *new* Segment 2 messaging is out of scope, owned by 050).

**Stand-up on the AWS stack (mirror windev)**

- **FR-003** The system MUST stand wxperts.com up on **S3 + CloudFront + Route53** mirroring the known-good windev.wxperts.com setup (`marketing/site/` content + `marketing/site/deploy/*` infra templates), using AWS profile **`Andy`**.
- **FR-004** The deploy MUST **extend the existing pipeline** (`redeploy.ps1` + the `deploy/` templates), not introduce a parallel/replacement pipeline; bucket policy / CloudFront / Route53 alias configs MUST follow the existing windev patterns.
- **FR-005** All infrastructure identifiers and secrets (S3 bucket name, CloudFront distribution ID, hosted-zone id, certificate ARN, region) MUST live in **env vars** (App Runner console convention) or the existing deploy config, **never committed** to the repo.

**Verify-before-flip cutover (gated, rollback-ready)**

- **FR-006** The site MUST be **fully verified on CloudFront via a test/preview URL** (the CloudFront distribution domain and/or a non-production test hostname) **before** any DNS change — content renders, TLS valid, capture form reachable, assets load. This verification is a **hard gate**.
- **FR-007** The **DNS cutover MUST be an isolated, explicitly gated task** performed only after FR-006 passes — it MUST NOT be bundled with stand-up or wiring work, so the live-site flip is a single deliberate action.
- **FR-008** A **rollback plan MUST be documented and ready before the flip**: a one-step revert (re-point the Route53 record / restore the prior registrar DNS to the old host), with the prior DNS values captured (from FR-001) so the live site can be restored quickly if post-flip verification fails.
- **FR-009** Immediately after the flip, **post-cutover verification** MUST confirm the live wxperts.com serves from CloudFront (content, TLS, capture, assets, analytics) before the cutover is declared complete; failure triggers the FR-008 rollback.

**Post-cutover integration (mirror 047)**

- **FR-010** The migrated site MUST embed the **shared public capture form** posting to `POST /api/marketing/leads` (spec 046) with **`sourceproperty="wxperts"`** and the visitor's **`locale`**; the server derives `segment` (the client never asserts it — 046's contract).
- **FR-011** The wxperts.com origin MUST be **added to the spec 046 CORS allowlist** (configurable env, no wildcard) so the capture POST is accepted.
- **FR-012** The migrated site MUST serve its **public binary assets** (images, videos, downloadables) from the **dedicated public-read bucket created in spec 048** via CloudFront — not from a per-site ad-hoc bucket.
- **FR-013** The migrated site MUST hook the **existing pageview lambda** for analytics, mirroring the windev wiring, so wxperts.com pageviews flow into the same analytics path (dashboards themselves are 050).

**Internationalization**

- **FR-014** The embedded capture form's labels, placeholders, and **confirmation/error strings MUST be locale-keyed with en-US fallback**; a missing translation MUST resolve to en-US and never error or 404 (the lead's `locale` persistence is handled by 046).

---

## Entities

**No new database tables.** This spec reuses the `marketingleads` and `campaigns` tables defined in spec 046 (capture writes a `marketingleads` row with `sourceproperty="wxperts"`) and the public asset bucket created in spec 048. It introduces **no new schema** — its deliverables are infrastructure (S3/CloudFront/Route53 stand-up + DNS cutover), static-site content/deploy changes, and configuration (CORS allowlist entry, asset-bucket URLs, pageview-lambda wiring).

Conventions reminder (for any reused tables): plural lowercase, no underscores/camelCase, UUID v7 PKs, FK = parent + `id`, `companyid` on every table.

---

## Success Metrics

1. wxperts.com resolves to and serves from **CloudFront** on the managed AWS stack (profile `Andy`), with valid TLS, after a cutover that was **verified on a preview URL first** and had a ready rollback.
2. The DNS flip was performed as an **isolated, gated action**; at no point was the live company site left broken without a one-step revert available; MX/email records were preserved (no mail disruption).
3. A visitor on the migrated wxperts.com can submit the capture form and the lead persists to `marketingleads` with `sourceproperty="wxperts"` and the correct `locale` (via 046), with a localized confirmation.
4. The migrated site serves public assets from the **048 dedicated bucket** via CloudFront and its pageviews flow through the **existing pageview lambda**, mirroring windev.
5. The wxperts.com origin is on the 046 CORS allowlist; a missing translation falls back to en-US and never errors.

---

## Out of Scope (deferred to other 045 specs)

The capture endpoint + `marketingleads`/`campaigns` schema + notifications (046); the dedicated public asset bucket creation + presigned-upload module (048); the windev.wxperts.com integration (047); analytics **dashboards** + Segment 2 broad-audience messaging/content authoring (050); email-drip / automation, social auto-posting; any in-app WYSIWYG/CMS content editing (site copy still deploys via the file-based pipeline).
