# Test Plan: Marketing — wxperts.com Migration + Integration

**Spec**: 049 | **Created**: 2026-06-08
**Maps to**: spec.md functional requirements FR-001 … FR-014

> Most of this spec is **infrastructure + a live-site DNS cutover**, so verification is weighted toward **manual / pre- and post-cutover checks**. Automated tests cover the post-cutover integration (capture, CORS, i18n) that mirrors spec 047.

---

## Unit / Integration (Vitest)

| ID | Covers | Test |
|----|--------|------|
| TT-01 | FR-010 | A capture POST shaped as the wxperts.com form sends `sourceproperty="wxperts"` + `locale`; the server derives `segment` and persists a `marketingleads` row (client-asserted segment, if any, is ignored). |
| TT-02 | FR-011 | The wxperts.com origin is accepted by the 046 CORS allowlist; a non-allowlisted origin is still rejected; no wildcard is configured. |
| TT-03 | FR-014 | Capture confirmation/error strings resolve for a supported locale and **fall back to en-US** for an unsupported locale, never erroring. |
| TT-04 | FR-012 | Asset URLs referenced by the migrated site resolve to the **048 public bucket** via CloudFront (not a per-site ad-hoc bucket). |

## E2E (Playwright)

| ID | Covers | Scenario |
|----|--------|----------|
| E2E-01 | FR-010, FR-011, FR-014 | On the migrated wxperts.com (or a preview origin standing in for it), submit the capture form → localized confirmation shown → a `marketingleads` row exists with `sourceproperty="wxperts"` and the submitted `locale`. |

## Manual / Pre-cutover verification (HARD GATE — FR-006, FR-001/002)

- **Inventory complete:** current host, registrar/nameservers, all DNS records (A/AAAA/CNAME/**MX**/TXT), TLS arrangement, and content manifest captured; broad-brand + educational content identified.
- **Preview verification on CloudFront (before any DNS change):** on the CloudFront distribution domain / test hostname — content renders, TLS valid, capture form reachable, assets load. **The DNS flip must not proceed until this passes.**

## Manual / Cutover + rollback verification (FR-007, FR-008, FR-009)

- **Rollback ready:** prior DNS values captured; the one-step revert (re-point Route53 / restore prior registrar record to the old host) is documented and confirmed *before* the flip.
- **MX preserved:** company email (MX/TXT) records are unchanged across the cutover — verified post-flip.
- **Cutover is isolated + gated:** the DNS flip is performed as a single deliberate scheduled action, separate from stand-up/wiring, with a human go/no-go.
- **Post-cutover verification:** live wxperts.com resolves to CloudFront, valid TLS, capture works (round-trip lead), assets load from the 048 bucket, pageviews reach the existing lambda. Any failure triggers the documented rollback.

## Manual / Post-cutover integration (FR-010 … FR-013)

- Real round-trip: submit the form on live wxperts.com → `marketingleads` row with `sourceproperty="wxperts"` + correct `locale` → visible in the SysAdmin funnel (046).
- CORS accepts wxperts.com; assets served from the 048 bucket via CloudFront; wxperts.com pageviews appear in the pageview-lambda analytics path (mirroring windev).
- Locale fallback: a `fr-FR` submission before French strings exist serves en-US confirmation, never 404.

## Exit Criteria

Pre-cutover preview gate (FR-006) passed and recorded; rollback documented and ready (FR-008); DNS flip performed as an isolated gated action (FR-007) with post-flip verification passed (FR-009) and MX preserved; live wxperts.com serves from CloudFront with working capture, assets (048 bucket), and analytics; all TT-* / E2E-01 pass; `check-types` clean for any new code; `auditfences` 0 violations. (Not gated on July 5 — scheduled deliberately.)
