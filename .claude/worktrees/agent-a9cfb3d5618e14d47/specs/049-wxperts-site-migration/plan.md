# Implementation Plan: Marketing — wxperts.com Migration + Integration

**Spec**: 049 | **Parent Scope**: 045 (Marketing umbrella, Spec 4 of 5)
**Status**: `draft`
**Created**: 2026-06-08

---

## Approach

Migrate wxperts.com onto the same S3 + CloudFront + Route53 stack that already runs windev.wxperts.com, then wire it into the marketing machinery exactly as spec 047 did for windev. The whole plan is organized around **de-risking a live-site DNS cutover**: inventory first, stand up and **fully verify on a preview URL**, then perform the DNS flip as an isolated, gated, rollback-ready step, and only after a verified flip do the integration wiring. This spec is **Phase 1 but explicitly NOT launch-critical** for July 5 — it is scheduled deliberately, after the windev launch path (046 → 047) is proven, never under launch pressure.

## Key Decisions

- **Mirror windev, don't invent.** Reuse `marketing/site/` content layout + `marketing/site/deploy/*` templates (bucket policy, CloudFront distribution, Route53 alias) and `redeploy.ps1`. **Extend** the existing pipeline; do not build a parallel one.
- **No new endpoint, bucket, or schema.** Capture posts to 046's `POST /api/marketing/leads`; assets come from 048's dedicated public bucket. 049 contributes infra stand-up + cutover + static-site wiring + config only.
- **REST, public capture, not MCP.** The embedded form posts cross-origin to the main server's public endpoint (mounted via `src/server/app.ts` — the prod entrypoint; `index2.ts` is dead). Server derives segment; client only asserts `sourceproperty="wxperts"` + `locale`.
- **AWS profile `Andy`** for all marketing infra (per convention; not the default/locked profile).
- **Infra IDs/secrets in env / deploy config, never committed** (bucket name, CloudFront ID, hosted-zone id, cert ARN, region).
- **i18n from day one** — capture form strings locale-keyed with en-US fallback (the lead `locale` persistence is 046's).

## Known Gates / Constraints

- **DNS CUTOVER IS THE PRIMARY RISK.** wxperts.com is a **live company site**. The flip is gated behind a **hard verify-before-flip gate** (FR-006): stand up + fully verify on the CloudFront distribution domain / a test hostname **before** touching DNS.
- **Cutover is its own isolated task (FR-007).** It is never bundled with stand-up or wiring — the live-site flip must be a single deliberate, scheduled action with a human go/no-go.
- **Rollback ready before the flip (FR-008).** Capture the *current* DNS values during inventory; the revert is one step (re-point Route53 / restore prior registrar record to the old host). Post-flip verification failure (FR-009) triggers immediate rollback.
- **Preserve MX / email records.** The inventory MUST capture MX/TXT so the cutover does not break company email; only the web records move.
- **Not launch-blocking.** July 5 depends on 046 + 047 (windev). 049 trails deliberately — do not schedule it into the launch crunch.
- **Dependency ordering:** 046 (endpoint + CORS allowlist mechanism) and 048 (public asset bucket) must exist before the post-cutover wiring tasks; 047 provides the proven integration pattern to mirror.
- **Code fencing (spec 026):** any new top-level code units (e.g. capture-form embed JS, config helpers) fenced via the orchestrator `implement` path; run `auditfences` before push. Static HTML/JSON deploy/config files follow the existing pipeline conventions.

## Dependencies

- spec 046 (capture endpoint `POST /api/marketing/leads`, `marketingleads`/`campaigns` schema, configurable CORS allowlist).
- spec 048 (dedicated public-read S3 asset bucket + presigned-upload module).
- spec 047 (windev.wxperts.com integration — the proven site-integration pattern this spec mirrors).
- Existing **S3/CloudFront/Route53 deploy pipeline** (`marketing/site/deploy/*`, `redeploy.ps1`) — extended, not replaced.
- Existing **pageview lambda** — hooked for analytics (dashboards are 050).
- **AWS profile `Andy`**.

## Build Order

1. **T001** Pre-migration inventory (host, registrar, DNS records incl. MX, TLS, content manifest; identify broad-brand + educational content).
2. **T002** Stand up wxperts.com on S3 + CloudFront + Route53 mirroring windev (profile `Andy`), extending the existing pipeline; infra IDs in env/deploy config.
3. **T003** Verify on the CloudFront preview URL (content, TLS, capture reachable, assets) — **hard gate**.
4. **T004** Document the rollback plan + author the gated DNS-cutover runbook (prior DNS captured, one-step revert).
5. **T005** **DNS cutover** — isolated, gated flip after T003 passes; post-flip verification; rollback on failure.
6. **T006** Embed the shared capture form (`sourceproperty="wxperts"` + locale → 046 endpoint); add wxperts.com to the 046 CORS allowlist.
7. **T007** Serve public assets from the 048 bucket via CloudFront; hook the existing pageview lambda.
8. **T008** Locale-aware capture confirmation/error strings with en-US fallback.

## Verification

Preview-URL verification (T003) passes before any DNS change; the cutover runbook + rollback are reviewed before the flip (T004); post-cutover verification (FR-009) confirms live wxperts.com serves from CloudFront with TLS, working capture, assets, and analytics; a round-trip lead from wxperts.com lands in `marketingleads` with `sourceproperty="wxperts"`; CORS accepts wxperts.com and a locale fallback to en-US never errors. `npm run check-types` clean for any new code; `auditfences` 0 violations on new declarations. See [tests.md](tests.md) and [quickstart.md](quickstart.md).
