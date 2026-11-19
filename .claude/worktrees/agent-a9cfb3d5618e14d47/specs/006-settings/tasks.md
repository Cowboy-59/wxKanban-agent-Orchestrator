# Tasks: Company Application Settings (Feature 006)

**Branch**: `006-settings`
**Input**: plan.md, spec.md, data-model.md, contracts/settings.openapi.json, research.md
**Generated**: 2026-02-20
**Total Tasks**: 15
**User Stories**: US1 (Settings CRUD API), US2 (Session loading at login), US3 (Admin settings UI)

**Key Finding**: `src/db/schema/company.ts` and `src/server/services/userService.ts` exist and need targeted updates. `src/shared/types/` directory exists for cross-boundary type definitions. `src/server/index.ts` needs the settings router registered.

---

## Phase 1: Setup

- [x] T001 Confirm on branch `006-settings`; add `SETTINGS_ENCRYPTION_KEY` to `.env` (32 UTF-8 chars, required for encryption); verify `SETTINGS_ENCRYPTION_KEY` is in `.env.example` (see T003)

---

## Phase 2: Foundational — Schema + Service (BLOCKS all user stories)

_Must complete T002–T006 before starting any user story phase. Human runs migration after T002._

- [x] T002 [P] Update `src/db/schema/company.ts` — add `settings: text("settings")` nullable column (stores AES-256-GCM encrypted JSON ciphertext)
- [x] T003 [P] Add `SETTINGS_ENCRYPTION_KEY=` to `.env.example` with comment: `# Required: exactly 32 UTF-8 chars. Encrypts company settings at rest. Generate with: openssl rand -base64 24 | head -c 32`
- [x] T004 **HUMAN TASK**: Run `npm run db:generate && npm run db:migrate` to apply the settings column to the `companies` table — migration applied: `ALTER TABLE "companies" ADD COLUMN "settings" text;`
- [x] T005 [P] Create `src/shared/types/settings.ts` — export `SettingType` union (`'boolean' | 'default' | 'report_header' | 'image'`) and `Setting` interface (`name: string`, `type: SettingType`, `value: string`, `description?: string`); re-export from `src/shared/types/index.ts`
- [x] T006 Create `src/server/services/SettingsService.ts` — implement: `encryptSettings(settings: Setting[]): string` (JSON.stringify → encryptToken), `decryptSettings(ciphertext: string): Setting[]` (decryptToken → JSON.parse, return `[]` on error), `getCompanySettings(companyId: string): Promise<Setting[]>` (fetch company, decrypt settings column), `addSetting(companyId, setting): Promise<Setting[]>` (reject 409 if name exists, append, encrypt, update), `updateSetting(companyId, name, patch): Promise<Setting>` (reject 404 if not found, update value/description, encrypt, update), `deleteSetting(companyId, name): Promise<void>` (reject 404 if not found, filter out, encrypt, update). Use `process.env.SETTINGS_ENCRYPTION_KEY`, Pino logger, import `Setting` from `~/shared/types/settings.js`

---

## Phase 3: US1 — Settings CRUD API

_Goal: Admin can create, read, update, and delete settings via REST API. Non-admin write attempts return 403._

**Independent Test**: `GET /api/settings` returns `{ settings: [] }` for a new company. `POST /api/settings` with valid Admin token creates a setting. Same POST with TEAM_MEMBER token returns 403. `PATCH /api/settings/name` updates value. `DELETE /api/settings/name` removes it. Duplicate name returns 409.

- [x] T007 [P] [US1] Create `src/server/routes/settings.ts` — mount `authenticateToken` + `requireAuth` on all routes; `GET /` calls `SettingsService.getCompanySettings(req.companyid)`; `POST /` with `requireAdmin` calls `addSetting`, returns 201; `PATCH /:name` with `requireAdmin` calls `updateSetting`, returns 200; `DELETE /:name` with `requireAdmin` calls `deleteSetting`, returns 200. Validate request bodies with Zod: POST requires `name` (pattern `^[a-z0-9_]{1,64}$`), `type` (enum), `value` (string max 2048), optional `description`; PATCH requires `value`, optional `description`. Use Pino logger. Import `requireAdmin` from `../middleware/requireAdmin.js`
- [x] T008 [US1] Register settings router in `src/server/index.ts` — add `import settingsRoutes from './routes/settings.js'` and `app.use('/api/settings', settingsRoutes)`

---

## Phase 4: US2 — Settings Loaded at Login

_Goal: Every successful login response and `/auth/me` response includes the company's decrypted `settings` array. AuthContext stores and exposes settings._

**Independent Test**: `POST /api/auth/signin` response body contains `settings` key (array). `GET /api/auth/me` response body contains `settings` key. After login, `useAuth().user.settings` is accessible in any component.

- [x] T009 [US2] Update `src/server/services/userService.ts` — add `settings?: Setting[]` to `UserResponse` and `CurrentUserResponse` interfaces; in `signInUser()`, after loading company context, call `await SettingsService.getCompanySettings(foundUser.companyid)` (if companyid present) and include in return; in `getCurrentUser()`, do the same; import `Setting` from `~/shared/types/settings.js` and `SettingsService` from `../services/SettingsService.js`
- [x] T010 [P] [US2] Update `src/server/routes/auth.ts` — confirmed `...result` spread already passes `settings` through; no code change needed — in the `GET /me` handler, ensure `settings` from `getCurrentUser` result is spread into the response (already spreads `...result` so this may require only confirming the `CurrentUserResponse` interface includes `settings`)
- [x] T011 [P] [US2] Update `src/client/context/AuthContext.tsx` — add `settings?: import('~/shared/types/settings').Setting[]` to the `User` interface; in `mapUserFromResponse()`, add `settings: data.settings as Setting[] | undefined`; add import `{ Setting } from '~/shared/types/settings'`

---

## Phase 5: US3 — Admin Settings UI

_Goal: Admin can manage company settings via the `/admin/settings` page in the AppShell. All setting types are supported. Full dark mode._

**Independent Test**: Navigate to `/admin/settings` as Admin → page loads with current settings list. Create form creates a new setting. Clicking edit (pencil) on a row switches to inline edit. Clicking delete shows confirmation; confirmed delete removes the row. Non-Admin user trying to navigate sees 403 behavior (page may render but API writes will fail — UI hides write controls based on usertype).

- [x] T012 [P] [US3] Create `src/client/components/admin/SettingRow.tsx` — props: `setting: Setting`, `onUpdate(name, value, description?): Promise<void>`, `onDelete(name): Promise<void>`. Render: type badge (boolean=indigo, default=slate, report_header=amber, image=purple), value display (boolean shows toggle chip; image shows truncated URL; others show text), pencil icon → inline edit (input + check/X), trash icon → confirm delete inline. Full `dark:` variants on all color tokens. Import `Setting` from `~/shared/types/settings`
- [x] T013 [US3] Create `src/client/pages/admin/SettingsPage.tsx` — wrapped in `AppShell`. Fetches `GET /api/settings` on mount. Create form: name input (pattern enforced), type select (4 options), value input (textarea for report_header; url input for image; toggle for boolean; text for default), optional description, submit → `POST /api/settings`. List section: maps over settings rendering `<SettingRow>`. Inline action error banner. Full `dark:` variants. Pino logging not applicable (frontend); no `console.log`; use component-level error state. Import `Setting` from `~/shared/types/settings`
- [x] T014 [US3] Add `/admin/settings` route to `src/client/App.tsx` — import `SettingsPage` from `./pages/admin/SettingsPage`, add `<Route path="/admin/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />`

---

## Phase 6: Polish & Cross-Cutting

- [x] T015 Verify TypeScript compiles clean across all modified files — `npm run check-types` passes with zero errors — run `npm run check-types`; fix any TS errors (especially: `Setting` import paths using `~/shared/types/settings.js` must resolve correctly in both server and client tsconfigs; confirm path alias `~` works for both)

---

## Dependencies

```
T001 (setup)
  ↓
T002, T003 (schema + env) [PARALLEL]
  ↓
T004 (HUMAN: migrate) — BLOCKS everything below
  ↓
T005, T006 (shared types + service) — T005 must precede T006
  ↓
Phase 3 US1 (T007 → T008)
Phase 4 US2 (T009 → T010 || T011)
Phase 5 US3 (T012 → T013 → T014)
  ↓ (all above complete)
T015 (type check)
```

Note: Phase 3, 4, and 5 can run in parallel after T006 (service complete):
- T007 and T009 and T012 can start simultaneously
- T008 waits for T007; T010 waits for T009; T013 waits for T012
- T011 can run alongside T009 (different file)

---

## Parallel Execution Examples

```bash
# After T006 complete — launch these in parallel:
# Agent A: settings API routes
Task: "Create settings router in src/server/routes/settings.ts [T007]"

# Agent B: login session loading
Task: "Update userService.ts to return settings at signin [T009]"

# Agent C: settings UI component
Task: "Create SettingRow component in src/client/components/admin/SettingRow.tsx [T012]"

# Agent D: AuthContext extension (independent)
Task: "Add settings to User interface in src/client/context/AuthContext.tsx [T011]"
```

---

## Implementation Strategy

**MVP (Minimum Viable Product)**: Complete T001–T009 for a fully functional encrypted settings API with session loading. UI (T012–T014) can follow.

**Incremental delivery**:
1. T001–T006: Foundation (schema + encryption service)
2. T007–T008: API routes working (testable via curl per quickstart.md)
3. T009–T011: Login returns settings (frontend receives data)
4. T012–T014: Admin UI for settings management

---

## Validation Checklist

- [x] All contracts have corresponding implementation tasks (4 endpoints → T007)
- [x] Schema entity has model task (T002)
- [x] Parallel tasks are truly independent files
- [x] Each task specifies exact file path
- [x] No [P] task modifies the same file as another concurrent [P] task
- [x] HUMAN migration task (T004) is clearly marked as blocker
- [x] All color tokens in UI tasks include dark: variants requirement noted
- [x] No console.log mentioned anywhere — Pino logger specified for server, error state for client
- [x] `requireAdmin` middleware applied to all write endpoints in T007
