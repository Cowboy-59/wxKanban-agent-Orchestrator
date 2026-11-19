# Implementation Plan: Marketing — windev.wxperts.com Integration

**Spec**: 047 | **Parent Scope**: 045 (Marketing umbrella, Spec 2 of 5)
**Status**: `draft`
**Created**: 2026-06-08

---

## Approach

Wire the already-live windev.wxperts.com site to the spec 046 capture funnel and the dedicated public-read bucket, without rebuilding anything. This is mostly **static-site integration + config**, not new server code: embed the shared capture form pointed at `POST /api/marketing/leads`, add locale-keyed strings + a confirmation state, add the windev origin to the 046 CORS allowlist (env), repoint public assets at CloudFront once 048's bucket exists, and hook pageviews to the existing lambda — all deployed through the existing `marketing/site/deploy/*` + `redeploy.ps1` pipeline (profile `Andy`). Build order follows the launch critical path and the 048 dependency: capture-form integration ships first (it has no blocker), asset-serving ships second (after 048 creates the bucket).

## Key Decisions

- **Static site posts to REST, not MCP.** windev.wxperts.com is S3/CloudFront static; it calls the public `POST /api/marketing/leads` (spec 046) cross-origin. No new server endpoint is created here — 046 owns it.
- **No new DB tables.** The lead is persisted by 046 into `marketingleads`; campaign attribution uses the 046-seeded July-5 `campaigns` row. 047 introduces no system of record.
- **Server derives segment.** The site asserts only `sourceproperty="windev"`, the campaign slug, and `locale`; the server derives `segment="windev"` (046 FR-003). The site never sends `segment`.
- **Extend, never replace, the pipeline.** All changes deploy via `marketing/site/deploy/*` + `redeploy.ps1` with AWS profile `Andy` (not the default/locked profile).
- **Capture-first, assets-second staging.** The public-read bucket is created in **048**; until it exists, ship the capture-form integration (no blocker) and land asset-serving as an isolated second deploy. This keeps the launch funnel unblocked by 048's timing.
- **i18n from day one** — form/confirmation strings locale-keyed with en-US fallback; en-US authored; structure ready for fr-FR/es/pt-BR/it/de.
- **Honeypot parity.** The embedded form includes the honeypot field the 046 endpoint expects (046 FR-006); no separate CAPTCHA in v1.

## Known Gates / Constraints

- **CORS coordination with 046.** The windev origin must be added to the 046 endpoint's env-configured allowlist (no wildcard). This is a cross-spec config change — coordinate the env update with the 046 deploy so the cross-origin POST is accepted before the site goes live.
- **048 bucket dependency (blocked-by, asset-serving only).** Asset-serving (FR-007) cannot complete until 048 creates the public-read bucket + CloudFront wiring. The capture funnel does **not** depend on it — do not let the bucket's timing block the launch-critical form.
- **AWS profile `Andy`.** Marketing infra uses profile `Andy`, not the default/locked profile (per convention). The deploy pipeline already encodes this.
- **Pageview lambda is read/emit-only here.** 047 only ensures windev emits/links attributable pageviews; the in-app stats surface is **spec 050** — build no dashboard.
- **PII reminder.** The form collects email/name/company; the persisted lead is PII handled by 046's posture. The site transmits over HTTPS to the 046 endpoint and stores nothing client-side beyond what's needed for the confirmation state.
- **Code fencing (spec 026):** any new top-level units (e.g. a form/confirmation component or pipeline script function) are fenced via the orchestrator `implement` path; run `auditfences` before push. Static HTML/JSON locale resources are exempt (JSON files are exempt; treat hand-authored static markup per the legacy-baseline rule). Inline fences where the fence-emitter can't reach (042/043/046 precedent).

## Dependencies

- spec 046 (the `POST /api/marketing/leads` capture endpoint + funnel this site posts to — **must be live**).
- spec 048 (creates the dedicated public-read S3 bucket + CloudFront wiring — **blocks asset-serving only**, FR-007/FR-008).
- spec 004 (LandingPage), spec 044 (landing-docs — the video MP4 assets the site references).
- Existing `marketing/site/deploy/*` + `redeploy.ps1` pipeline and the existing pageview lambda (extended/read, not replaced).

## Build Order

1. **T001** add the windev origin to the 046 CORS allowlist (env) + coordinate with 046 deploy.
2. **T002** embed the shared capture form on windev posting to `POST /api/marketing/leads` with `sourceproperty="windev"` + July-5 campaign + locale + honeypot.
3. **T003** locale-aware confirmation/thank-you + error states (en-US authored, en-US fallback) + visitor-locale detection.
4. **T004** hook windev pageviews to the existing pageview lambda (attributable).
5. **T005** extend the existing `marketing/site/deploy/*` + `redeploy.ps1` pipeline to deploy the above (profile `Andy`).
6. **T006** *(after 048)* serve public images + video MP4s from the 048 public-read bucket via CloudFront — isolated second deploy; non-blocking for the capture funnel.

## Verification

`npm run check-types` clean for any new files; `auditfences` 0 violations on new declarations; quickstart scenarios in [quickstart.md](quickstart.md) pass against the live site + deployed 046 endpoint; CORS accept-from-windev / reject-from-other verified; honeypot + locale fallback exercised; a real round-trip (windev form submit → `marketingleads` row with `sourceproperty="windev"`/`segment="windev"`/July-5 `campaignid`/locale → confirmation shown → lead visible in the 046 SysAdmin funnel) confirmed before July 5 2026. Asset-serving (T006) verified after 048 delivers the bucket — MP4s + images render from CloudFront.
