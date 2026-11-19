# Spec 046: Marketing — Lead Capture & Funnel

**Spec Number**: 046
**Status**: `draft`
**Created**: 2026-06-08
**Parent Scope**: spec 045 (Marketing — umbrella; this is Spec 1 of the 5-spec split, **launch-critical** for July 5 2026)
**Depends On**: spec 014 (SysAdmin / Platform Admin — the internal surface the lead funnel lives in), spec 043 (User Feedback — reuses the SysAdmin queue UI pattern + DB-row-first / best-effort-notify resilience), spec 008 (notification + email services, reused for new-lead alerts)
**Blocks**: spec 047 (windev.wxperts.com integration — posts the live capture form to this endpoint)
**Source**: `specs/Project-Scope/045-marketing.md` (Section 9, Spec 1)

---

## Overview

The first and launch-critical slice of the Marketing scope: a **public lead-capture endpoint** that both marketing sites post signups to, a **SysAdmin lead funnel** to work those leads, and **new-lead notifications**. A site visitor submits the signup form (email + optional name + optional qualifying fields); the server derives the audience **segment** from the source property and campaign, persists a `marketingleads` row (the **source of truth**), and fires a best-effort in-app + email notification to the wxperts team. wxperts admins move each lead through a funnel (`new → contacted → qualified → onboarded/declined`) from a new SysAdmin Marketing area, filtering by segment / status / source and adding notes. Every captured lead and every public-facing string is **locale-keyed** (en-US authored first, fallback to en-US). A minimal `campaigns` row exists so leads attribute to a campaign; full campaign management is spec 048.

This spec is the funnel the July 5 launch needs — it must be live and verified before launch day. It deliberately ships only capture + funnel + notify; the asset library, posts board, sites, and analytics are later specs in the 045 family.

## Business Problem

The July 5 launch drives traffic to windev.wxperts.com (and soon wxperts.com), but there is no system of record for what that traffic becomes. Without this, signups either don't exist or land in a disconnected form, the team has no visible pipeline, prospects get no confirmation, and the launch's effectiveness is unmeasurable. This spec creates the capture-to-funnel backbone so every signup is persisted with full attribution (segment, source, campaign, locale), surfaced for follow-up in SysAdmin, and acknowledged to the prospect.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | Site visitor / prospect — submits the public signup/lead form on a marketing site. |
| **Secondary Actors** | **wxperts platform admin** (works the funnel in SysAdmin: status changes, notes, decline-with-reason); **wxKanban server** (captures the lead, derives segment, fires notifications); **notification + email services** (deliver the new-lead alert). |
| **Key Value** | Every signup is captured with full attribution as a triageable lead, surfaced in a SysAdmin funnel, and acknowledged to the prospect — making the launch funnel real and measurable. |
| **Transport** | REST under `/api`. `POST /api/marketing/leads` is **public** (unauthenticated), **CORS-allowlisted** to the site origins, **rate-limited**, with honeypot/basic anti-spam. SysAdmin endpoints behind admin auth. **Not MCP** — public web traffic + internal admin. |
| **Source of truth** | The `marketingleads` DB row. The notification is **derived and best-effort** — a failed notification leg never blocks or loses the lead (spec 043 resilience pattern: row first, notify after, mark a failed leg without dropping it). |
| **Segment derivation** | Server-side from `sourceproperty` + `campaign` → `segment` (`windev` | `careerchanger` | `broad`). The client does not assert segment. |
| **i18n** | Lead records a `locale`; all public-facing response strings (confirmation, validation errors) are locale-keyed with en-US fallback. Internal SysAdmin UI is English-only. |
| **Scope Boundary** | **IN**: `marketingleads` table + migration; minimal `campaigns` table + migration (for attribution only); public `POST /api/marketing/leads` (CORS, rate-limit, honeypot, locale, segment derivation, optional qualifying fields); SysAdmin lead-funnel endpoints (list/get/status/note) + Marketing area UI (leads pipeline); new-lead in-app + email notification (best-effort). **OUT (later specs)**: asset library + public S3 bucket + posts board + campaign management UI (048); site integration / capture form on the live sites (047 windev, 049 wxperts.com); analytics/stats (050); segment 2 broad audience (050); email-drip / automation; CAPTCHA (honeypot + rate-limit only in v1 unless abuse appears). |

---

## Functional Requirements

**Capture endpoint**

- **FR-001** The system MUST expose `POST /api/marketing/leads`, unauthenticated, accepting `email` (required), `name` (optional), `sourceproperty` (`windev` | `wxperts`, required), `campaign` (optional slug/id), `locale` (required), and optional qualifying fields `company` and `platformfrom` (platform-converting-from).
- **FR-002** The endpoint MUST validate `email` format and reject invalid input with a **locale-keyed** error message; validation failures return 400 without persisting.
- **FR-003** The server MUST derive `segment` from `sourceproperty` + `campaign` (not trust any client-supplied segment): `windev` source → `windev`; `wxperts` source → `careerchanger` (Phase-1 default) unless the campaign maps otherwise.
- **FR-004** On valid input the system MUST persist a `marketingleads` row with `status = 'new'`, `createdat`, and all captured/derived fields **before** attempting any notification (row is source of truth).
- **FR-005** The endpoint MUST be **CORS-allowlisted** to the configured marketing-site origins only (no wildcard); requests from other origins are rejected.
- **FR-006** The endpoint MUST be **rate-limited per IP** and include a **honeypot** field; obvious bot submissions are rejected without persisting and without blocking legitimate signups. No CAPTCHA in v1.
- **FR-007** The endpoint MUST return a **locale-keyed confirmation** payload (success message + reference id) within the success path; the response MUST NOT block on notification delivery.

**Notifications**

- **FR-008** On successful persist the system MUST fire a **best-effort** new-lead notification: in-app (team inbox) + email to the configured wxperts recipient(s), reusing existing notification + email services.
- **FR-009** A failed notification leg MUST NOT roll back or lose the lead; the failure is recorded (e.g. a `notifystatus`/pending marker) and never silently dropped (spec 043 pattern). v1 has no background retry worker.

**Lead funnel (SysAdmin)**

- **FR-010** The system MUST expose admin-authed `GET /api/sysadmin/marketing/leads` supporting filters `segment`, `status`, `sourceproperty`, `campaignid`, and `GET …/leads/:id` for detail.
- **FR-011** The system MUST expose `PATCH …/leads/:id/status` to transition `new → contacted → qualified → onboarded | declined`; a `declined` transition MUST require a `declinedreason`.
- **FR-012** The system MUST expose `POST …/leads/:id/note` appending a timestamped internal note to the lead.
- **FR-013** A new **SysAdmin Marketing area** MUST present a **leads pipeline** (table with segment/status/source filters, detail drawer, status transitions with decline-reason, notes thread), reusing the spec 043 feedback-queue UI pattern, reachable from the active SysAdmin dashboard nav.

**Data & attribution**

- **FR-014** The system MUST provide a minimal `campaigns` table (id, companyid, name, segment, launchdate, status) so leads attribute via `campaignid`; full campaign CRUD/UI is spec 048. A seed/default campaign row for the July 5 launch MUST exist for attribution.
- **FR-015** Every `marketingleads` row MUST record `locale`, `sourceproperty`, `segment`, and (when present) `campaignid`, so the funnel can be sliced per segment / source / campaign.

**Internationalization**

- **FR-016** All public-facing strings returned by the capture endpoint (confirmation + validation/error messages) MUST be locale-keyed with **en-US fallback**; a missing translation MUST resolve to en-US, never error.

---

## Entities

**`marketingleads`** (new) — `id` (uuid v7 PK), `companyid` (FK), `email`, `name?`, `sourceproperty` (`windev`|`wxperts`), `campaignid?` (FK → campaigns), `segment` (`windev`|`careerchanger`|`broad`), `locale`, `company?`, `platformfrom?`, `status` (`new`|`contacted`|`qualified`|`onboarded`|`declined`, default `new`), `declinedreason?`, `notes?`, `notifystatus` (`pending`|`sent`|`failed`), `createdat`, `updatedat`.

**`campaigns`** (new, minimal here; extended in 048) — `id` (uuid v7 PK), `companyid` (FK), `name`, `segment`, `launchdate`, `status` (`planned`|`active`|`completed`|`archived`), `createdat`, `updatedat`.

Conventions: plural lowercase, no underscores/camelCase, UUID v7 PKs, FK = parent + `id`, `companyid` on every table.

---

## Success Metrics

1. A visitor can submit the form and receive a **localized confirmation within 3 seconds**; the lead persists to `marketingleads` with correct `segment`, `sourceproperty`, `locale`, and `campaignid`.
2. **Zero silent drops:** 100% of accepted submissions persist; any failed notification leg is marked (not lost) and never blocks the response.
3. Admins can work any lead through the full funnel (status, note, decline-with-reason) from SysAdmin, sliced by segment / source / campaign.
4. The public endpoint rejects cross-origin and obvious-bot submissions without impacting legitimate signups.
5. A missing translation falls back to en-US and never errors.

---

## Out of Scope (deferred to other 045 specs)

Asset library + dedicated public S3 bucket + posts board + campaign management UI (048); capture form embedded on the live sites + asset-serving (047 windev, 049 wxperts.com migration); analytics/stats (050); Segment 2 broad audience + non-EN translation content (050); email-drip/automation, social auto-posting, CAPTCHA, background notification retry.
