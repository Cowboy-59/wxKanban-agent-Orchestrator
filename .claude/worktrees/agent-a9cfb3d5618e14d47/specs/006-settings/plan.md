# Implementation Plan: Company Application Settings

**Branch**: `006-settings` | **Date**: 2026-02-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/006-settings/spec.md`

---

## Summary

Implement a company-scoped settings system allowing Admins to manage key-value settings (boolean, default, report_header, image types). Settings are stored as encrypted JSON in the existing `companies.settings` column. The system loads decrypted settings into the authenticated session on every login, making them available to all application layers without extra requests.

---

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 20 LTS (backend) + React 18 (frontend)
**Primary Dependencies**: Express, Drizzle ORM, AES-256-GCM (Node.js crypto, existing `crypto.ts`), Zod validation, React Context API
**Storage**: PostgreSQL — add `settings text` column to existing `companies` table (encrypted ciphertext)
**Testing**: Vitest (unit), Playwright (e2e)
**Target Platform**: Web — Express API (port 3001) + React/Vite SPA (port 5173)
**Project Type**: Web (existing `src/server/` + `src/client/` structure)
**Performance Goals**: CRUD operations complete in < 3 seconds; settings load transparently at login (no added round-trip)
**Constraints**: Settings column stores encrypted ciphertext (not jsonb), so DB-level querying of individual settings is not possible — acceptable for current scale. Image values are URL references, not raw binary in DB.
**Scale/Scope**: One settings collection per company; < 100 settings per company expected

---

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Rule | Status | Notes |
|------|--------|-------|
| TypeScript strict, no `any` | ✅ PASS | All types explicit via `Setting` interface and Drizzle inference |
| No console.log — Pino only | ✅ PASS | `createLogger("settings-service")` and `createLogger("settings-routes")` |
| PostgreSQL + Drizzle ORM | ✅ PASS | Add column to existing `companies` table; no raw SQL |
| bcrypt for passwords only | ✅ PASS | Settings encryption uses existing AES-256-GCM `encryptToken`/`decryptToken` |
| No migration commands by AI | ✅ PASS | Human runs `db:generate && db:migrate` |
| Dark/light mode on all UI | ✅ PASS | All Tailwind tokens will include `dark:` variants |
| No toast messages | ✅ PASS | Inline error/success feedback states |
| DB table names: plural, lowercase | ✅ PASS | Existing `companies` table; no new table needed |
| UUID v7 primary keys | ✅ PASS | Settings stored as JSON inside column; no new PK needed |
| No `console.log` anywhere | ✅ PASS | |
| requireAdmin middleware exists | ✅ PASS | `src/server/middleware/requireAdmin.ts` — already in use |

---

## Project Structure

### Documentation (this feature)

```
specs/006-settings/
├── plan.md              ← This file
├── research.md          ← Phase 0 (complete)
├── data-model.md        ← Phase 1 (complete)
├── quickstart.md        ← Phase 1 (complete)
├── contracts/
│   └── settings.openapi.json   ← Phase 1 (complete)
└── tasks.md             ← Phase 2 (/tasks command)
```

### Source Code (repository root)

```
# Web application (Option 2 per project type)

src/server/
├── services/SettingsService.ts     ← NEW: encrypt/decrypt, CRUD operations
├── routes/settings.ts              ← NEW: Express router for /api/settings
└── (auth.ts modified)              ← Include settings in login + /me response

src/client/
├── context/AuthContext.tsx         ← MODIFIED: add settings to User interface + state
├── pages/admin/SettingsPage.tsx    ← NEW: full CRUD settings management UI
└── components/admin/
    └── SettingRow.tsx              ← NEW: reusable row (view/edit/delete)

src/db/schema/
└── company.ts                      ← MODIFIED: add `settings text` column (nullable)
```

---

## Phase 0: Research

_Findings from research.md_

**No NEEDS CLARIFICATION markers remain.** See [research.md](research.md).

Key decisions:
1. Storage: `companies.settings text` (encrypted ciphertext) — not jsonb, not a separate table
2. Encryption: Reuse `encryptToken`/`decryptToken` from `src/server/lib/crypto.ts`
3. Session delivery: Include decrypted settings in login response body + `/api/auth/me` response
4. Image handling: Store URL reference as string value; actual file upload is a separate concern (out of scope for this spec — `image` type stores a URL string provided by Admin)
5. Uniqueness enforcement: Enforced at service layer (check name before insert)

---

## Phase 1: Design & Contracts

_See [data-model.md](data-model.md), [contracts/settings.openapi.json](contracts/settings.openapi.json), [quickstart.md](quickstart.md)_

### API surface (5 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/settings | Any authenticated | List all company settings (decrypted) |
| POST | /api/settings | ADMIN only | Create new setting |
| PATCH | /api/settings/:name | ADMIN only | Update setting value |
| DELETE | /api/settings/:name | ADMIN only | Delete setting |
| GET | /api/auth/me | Any authenticated | Extended to include `settings` |

_(Login endpoint `POST /api/auth/signin` also extended to return `settings` in response body)_

### Data flow at login

```
User → POST /api/auth/signin
  → userService.signInUser() → JWT issued
  → SettingsService.getCompanySettings(companyId) → decrypted Setting[]
  → Response includes { ...userdata, settings: Setting[] }
  → AuthContext stores settings in User object
  → All components access via useAuth().user.settings
```

---

## Phase 2: Task Planning Approach

_/tasks command will execute this_

**Task generation strategy**:
- Schema task: Add `settings` column to `companies` (requires human migration)
- Service tasks: SettingsService (encrypt/decrypt/CRUD), unit tests
- Route tasks: settings router, register in server index
- Auth integration tasks: modify signin + /me to include settings
- Frontend tasks: extend AuthContext.User, SettingsPage, SettingRow
- E2E quickstart test task

**Ordering**: Schema → Service → Routes → Auth integration → Frontend
**Estimated tasks**: 20–25 numbered tasks

---

## Complexity Tracking

_No constitution violations — no entries required._

---

## Progress Tracking

**Phase Status**:

- [x] Phase 0: Research complete
- [x] Phase 1: Design complete
- [ ] Phase 2: Task planning complete (/tasks command)
- [ ] Phase 3: Tasks generated
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:

- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none)

---

_Based on Constitution v2.1.1 — See `.claude/rules/constitution.md`_
