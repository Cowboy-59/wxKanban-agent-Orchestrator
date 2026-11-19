# Implementation Plan: Marketing — Lead Capture & Funnel

**Spec**: 046 | **Parent Scope**: 045 (Marketing umbrella, Spec 1 of 5)
**Status**: `draft`
**Created**: 2026-06-08

---

## Approach

Ship the capture-to-funnel backbone as a thin, launch-critical slice on the existing main server, reusing patterns already proven in spec 043. No new infrastructure beyond two tables — the dedicated public S3 bucket, asset library, and site work all land in later 045 specs. Build order follows the critical path: schema → public endpoint → notification → admin funnel API → admin UI, with i18n strings and the launch campaign seed alongside.

## Key Decisions

- **REST on the main server, not MCP.** This is public web traffic + internal admin, not a kit/consumer tool. Mount routes via `src/server/app.ts` (the prod entrypoint is `index.ts → app.ts`; `index2.ts` is dead — routes mounted there silently 404).
- **`db/client.ts` (postgres-js), never `lib/db.ts`.** The strict-TLS pg.Pool module breaks against RDS in prod.
- **Migration apply pattern:** generate via drizzle-kit, apply via `pg.Client` + transaction (drizzle-kit push needs a TTY; kit `dbpush` is broken). User applies the migration.
- **Row-first, best-effort notify (spec 043).** Persist the lead before notifying; a failed notification leg sets `notifystatus='failed'` and is never lost or allowed to block the response. No retry worker in v1.
- **Server-derives segment.** Client never asserts segment; derived from `sourceproperty` + `campaign`. Phase-1 default: `wxperts` → `careerchanger`, `windev` → `windev`.
- **Reuse 043's SysAdmin queue UI** for the leads pipeline — same filter/detail/status/notes shape.
- **i18n from day one** — public strings locale-keyed with en-US fallback; SysAdmin UI English-only.

## Known Gates / Constraints

- **CORS allowlist** must be configurable (env) — site origins (windev.wxperts.com now; wxperts.com once 049 migrates it). No wildcard.
- **Abuse:** honeypot + per-IP rate-limit only in v1. CAPTCHA deferred unless real abuse appears.
- **SysAdmin routing gap (carried from 043):** the mounted dashboard is the mock `pages/SysAdminDashboard.tsx`; the "real" `SysAdmin/Dashboard.tsx` was never wired into `App.tsx`. Wire the Marketing nav into the mounted dashboard.
- **PII:** `marketingleads` holds email/name/company — admin-role access only; existing encryption-at-rest posture applies.
- **Code fencing (spec 026):** all new top-level units fenced via the orchestrator `implement` path; run `auditfences` before push. (CLI dispatch is broken — use the direct-import wrapper / in-conversation implement; inline fences where the fence-emitter can't reach, per the 042/043 precedent.)

## Dependencies

- spec 014 (SysAdmin surface), spec 043 (queue UI + resilience pattern), spec 008 (notification + email services).
- Blocks spec 047 (windev integration posts to `POST /api/marketing/leads`).

## Build Order

1. **T001** schema + migration (apply).
2. **T002** public capture endpoint (CORS, rate-limit, honeypot, validation, segment derivation, row-first persist).
3. **T003** best-effort notification.
4. **T004** SysAdmin funnel API.
5. **T005** SysAdmin Marketing UI (leads pipeline).
6. **T006** i18n strings + July-5 seed campaign (alongside T002/after T001).

## Verification

`npm run check-types` clean for new files; `auditfences` 0 violations on new declarations; quickstart scenarios in [quickstart.md](quickstart.md) pass against a local/live run; CORS + rate-limit + honeypot manually exercised; a real round-trip (submit → row → notification → SysAdmin funnel transition) confirmed before July 5.
