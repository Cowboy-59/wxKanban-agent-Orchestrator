# Task Breakdown: Marketing — Lead Capture & Funnel

**Feature**: Marketing — Lead Capture & Funnel
**Spec**: 046
**Date Generated**: 2026-06-08
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 marketingleads + campaigns tables + migration | high | done |
| 2 | T002 Public POST /api/marketing/leads capture endpoint | high | done |
| 3 | T003 New-lead notification (best-effort in-app + email) | high | done |
| 4 | T004 SysAdmin lead-funnel API (list/get/status/note) | high | done |
| 5 | T005 SysAdmin Marketing area UI — leads pipeline | high | done |
| 6 | T006 i18n capture strings + July-5 seed campaign | medium | done |

## Task Details

### T001 — marketingleads + campaigns tables + migration

Add the `marketingleads` Drizzle table (UUID v7 id; `companyid`; `email`, `name?`; `sourceproperty` windev|wxperts; `campaignid?` FK; `segment` windev|careerchanger|broad; `locale`; `company?`, `platformfrom?`; `status` new|contacted|qualified|onboarded|declined default new; `declinedreason?`; `notes?`; `notifystatus` pending|sent|failed; `createdat`/`updatedat`) and the minimal `campaigns` table (UUID v7 id; `companyid`; `name`; `segment`; `launchdate`; `status` planned|active|completed|archived; `createdat`/`updatedat`). Generate the migration via drizzle-kit and apply via the pg.Client + transaction pattern (drizzle-kit push needs TTY). Follow DB naming conventions (plural lowercase, no underscores/camelCase, FK = parent + id, companyid on every table). Use `db/client.ts`.

### T002 — Public POST /api/marketing/leads capture endpoint

Add the unauthenticated `POST /api/marketing/leads` route on the main server (`src/server`, mounted via app.ts — not the dead index2.ts). Validate `email` and required fields (locale-keyed 400 on failure, FR-002); derive `segment` server-side from `sourceproperty` + `campaign` (FR-003); persist the `marketingleads` row with `status='new'` and `notifystatus='pending'` **before** any notification (FR-004); apply a **CORS allowlist** to the configured site origins only (FR-005); apply **per-IP rate-limiting** + a **honeypot** field, rejecting bots without persisting (FR-006); return a locale-keyed confirmation + reference id without blocking on notification (FR-007). Hand off to T003's notification fire-and-forget.

### T003 — New-lead notification (best-effort in-app + email)

After a lead persists, fire a **best-effort** notification reusing the existing notification + email services (spec 008): in-app team-inbox entry always + email to the configured wxperts recipient(s). Reconcile `notifystatus` → `sent` on success, `failed` on error; never roll back or lose the lead, never block the capture response (FR-008, FR-009; spec 043 row-first/best-effort pattern). No background retry worker in v1 — a `failed` row is left for a later manual retry (future spec).

### T004 — SysAdmin lead-funnel API (list/get/status/note)

Add admin-authed routes under `/api/sysadmin/marketing`: `GET /leads` with filters `segment`/`status`/`sourceproperty`/`campaignid` (FR-010); `GET /leads/:id` detail; `PATCH /leads/:id/status` transitioning new→contacted→qualified→onboarded|declined, requiring `declinedreason` on decline (FR-011); `POST /leads/:id/note` appending a timestamped internal note (FR-012). Use `db/client.ts`; mount via app.ts.

### T005 — SysAdmin Marketing area UI — leads pipeline

Add a SysAdmin **Marketing** area with a **leads pipeline** screen: table with segment/status/source filters, detail drawer (captured + qualifying fields), status transitions (decline-with-reason), notes thread (FR-013). Reuse the spec 043 SysAdmin feedback-queue UI pattern/components. Wire a nav entry into the active SysAdmin dashboard (`pages/SysAdminDashboard.tsx` — the mounted mock dashboard, per the known routing gap). Internal UI English-only.

### T006 — i18n capture strings + July-5 seed campaign

Externalize all public-facing capture strings (confirmation, validation/error messages) into locale-keyed resources with **en-US fallback**; a missing translation resolves to en-US, never errors (FR-016). Author en-US; structure ready for fr-FR/es/pt-BR/it/de. Seed the **July 5 2026 launch `campaigns` row** so leads attribute (FR-014). Verify segment slicing end-to-end (FR-015).

---

## Sequencing

Critical path for July 5: **T001 → T002 → T003** (capture working + acknowledged) then **T004 → T005** (funnel visible). T006 runs alongside T002 (strings) and after T001 (seed). T002 blocks spec 047 (windev site posts to this endpoint).
