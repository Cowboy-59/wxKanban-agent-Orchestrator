# Requirements Checklist: New Project — AI-Ready Project Provisioning (Spec 011)

**Feature**: `specs/Project-Scope/011-Scope-NewProject.md`
**Spec Directory**: `specs/011-NewProject/`
**Generated**: 2026-02-22
**Last Updated**: 2026-02-22

---

## Pipeline Phase Status

| Phase | Name | Status |
|-------|------|--------|
| Phase 1 | Specify | ✅ Complete |
| Phase 2 | Clarify | ✅ Complete |
| Phase 3 | Plan | ✅ Complete |
| Phase 4 | Tasks | ✅ Complete |
| Phase 5 | Implementation | ⏳ Pending |
| Phase 6 | QA Testing | ⏳ Pending |
| Phase 7 | Human Testing | ⏳ Pending |

---

## Specification Quality (Phase 1)

### Functional Requirements

- [x] All functional requirements are numbered (FR-001 through FR-022)
- [x] No gaps in FR numbering
- [x] Each FR has a clear, imperative verb ("MUST", "SHOULD")
- [x] Each FR has a measurable outcome or verifiable condition
- [x] FR-002 specifies exact request/response shape for extended `POST /api/projects`
- [x] FR-005 specifies exact DB schema for `projectkits` and `projectkitfiles` tables
- [x] FR-007 specifies per-developer encryption at download time (not generation time)
- [x] FR-008 specifies AES-256-GCM with SHA-256(apiToken) key derivation
- [x] FR-010 specifies MCP server backward compatibility (falls back to `DATABASE_URL`)
- [x] FR-014 specifies non-destructive injection rules (NEVER/ADD/MERGE/FLAG)
- [x] FR-022 specifies `ProjectOverview.md` excluded from import kits

### User Scenarios

- [x] US1 (New Project Kit) has complete scenario with step-by-step verification
- [x] US2 (Kit Status Polling) has complete scenario with response shape
- [x] US3 (CLI Init) has complete scenario with expected output
- [x] US4 (Import Existing Project) has complete scenario with detection report
- [x] US5 (Encrypted DATABASE_URL) has complete scenario with security verification
- [x] US6 (Kit Regeneration) has complete scenario with version/count checks
- [x] US7 (ProjectOverview.md) has complete scenario with pipeline integration

### Success Criteria

- [x] All 8 success criteria are measurable and verifiable
- [x] SC #1: kit status verifiable via `GET /api/projects/:id/kit`
- [x] SC #2: ZIP contents verifiable by extraction + file listing
- [x] SC #3: plain DATABASE_URL absence verifiable by grep on ZIP
- [x] SC #4: `--init` non-destructive verifiable by pre-existing file check
- [x] SC #5: import non-destructive verifiable by file content comparison
- [x] SC #6: `importMode` behavior verifiable (no `ProjectOverview.md`)
- [x] SC #7: regeneration verifiable via `kitVersion` + `downloadCount` fields
- [x] SC #8: notification verifiable via notification inbox

---

## Clarification Quality (Phase 2)

- [x] Per-developer encryption at download time (not generation time) — Decision 2 in plan.md
- [x] `archiver` chosen for streaming ZIP (not `jszip`) — Decision 3 in plan.md
- [x] `apitokens` table design clarified (prefix + hash, not plain) — Decision 4 in plan.md
- [x] `_wxAI-commands/` as template source — Decision 5 in plan.md
- [x] `POST /api/projects/import` route ordering clarified — Decision 6 in plan.md
- [x] `ProjectOverview.md` excluded from import kits — Decision 7 in plan.md
- [x] MCP server backward compatibility clarified — Decision 8 in plan.md
- [x] No outstanding `[NEEDS CLARIFICATION]` markers in spec
- [x] Spec status set to `clarified`

---

## Plan Quality (Phase 3)

- [x] `plan.md` exists with all 8 key decisions documented
- [x] `quickstart.md` exists with 8 test scenarios covering all user stories
- [x] `lifecycle.json` exists with correct phase states
- [x] Constitution Check section completed in plan.md — all gates PASS
- [x] Research findings documented (existing crypto.ts, AIScaffoldingService pattern, etc.)
- [x] New npm dependency identified (`archiver`) and noted
- [x] DB schema gaps identified (3 new tables)
- [x] Route ordering constraint documented (import before /:id)

---

## Tasks Quality (Phase 4)

- [x] `tasks.md` exists with 38 tasks (T001–T038)
- [x] All 9 phases covered: DB Schema, Migration, Templates, Backend Services, API Routes, Frontend, MCP Server, Notifications, Human Testing
- [x] All AI tasks have clear file targets and success conditions
- [x] All human tasks (T033–T038) have specific verification commands
- [x] Dependency block correctly models task ordering
- [x] Parallel execution opportunities identified (T001–T011 all parallel; T017–T022 all parallel; T023–T027 all parallel)
- [x] MVP scope defined (P0: core kit generation; P1: security; P2: frontend; P3: MCP; P4: templates; P5: polish; P6: human tests)
- [ ] T001–T032 AI tasks implemented (pending)
- [ ] T033 HUMAN: Migration verified
- [ ] T034 HUMAN: UI kit generation verified
- [ ] T035 HUMAN: ZIP download verified
- [ ] T036 HUMAN: MCP server with encrypted DB URL verified
- [ ] T037 HUMAN: `--init` flag verified
- [ ] T038 HUMAN: Kit regeneration verified

---

## DB Schema Quality

- [x] `projectkits` table: all required columns present (id, projectid, status, primaryai, kitversion, kitcontent, downloadcount, generatedat, createdat, updatedat)
- [x] `projectkitfiles` table: all required columns present (id, kitid, filepath, filetype, content, createdat)
- [x] `apitokens` table: all required columns present (id, userid, companyid, tokenprefix, tokenhash, label, revokedat, createdat)
- [x] All FK constraints defined with ON DELETE CASCADE
- [x] Indexes defined for all FK columns and unique constraints
- [x] No plain text token storage — `tokenhash` only
- [ ] Migration SQL created (T004)
- [ ] Drizzle schemas created (T001–T003)
- [ ] `src/db/schema/index.ts` updated to export new schemas (T003)

---

## Security Quality

- [x] Plain text `DATABASE_URL` MUST NOT appear in any kit file — enforced by FR-008
- [x] `DATABASE_URL_ENCRYPTED` format specified: `<iv_b64>.<ciphertext_b64>.<tag_b64>`
- [x] Key derivation specified: SHA-256(WXKANBAN_API_TOKEN) → 32-byte key
- [x] Per-developer encryption: each download gets unique encrypted URL
- [x] API tokens stored hashed (SHA-256), never plain text
- [x] Token shown once on creation only
- [x] `.gitignore` includes `.env` in kit
- [x] MCP server backward compatibility: falls back to `DATABASE_URL` if `DATABASE_URL_ENCRYPTED` absent
- [ ] T012 KitEncryptionService implemented
- [ ] T013 ApiTokenService implemented
- [ ] T035 HUMAN: Security verification (no plain DATABASE_URL in ZIP)

---

## API Route Quality

- [x] All 5 new routes documented: GET /kit, GET /kit/download, POST /kit/regenerate, POST /import, extended POST /
- [x] Route ordering constraint documented: `POST /import` before `/:id` routes
- [x] Authentication required on all kit routes
- [x] ADMIN-only restriction on `POST /kit/regenerate`
- [x] 404 returned when kit not ready for download
- [x] `downloadcount` incremented on each download
- [ ] T017–T021 routes implemented
- [ ] T022 archiver installed

---

## Frontend Quality

- [x] `CreateProjectModal` extension: AI Tooling section with toggle + dropdown + optional dir field
- [x] `ImportProjectModal`: new component mirroring CreateProjectModal structure
- [x] `ProjectListPage`: Import button added (ADMIN/MANAGER only)
- [x] `KitStatusBadge`: polling component with generating/ready/failed states
- [x] Dark/light mode: all new components use Tailwind `dark:` classes
- [x] No toast messages: status shown via badge component
- [ ] T023–T027 frontend components implemented

---

## MCP Server Quality

- [x] `--init` flag: non-destructive, outputs detection report
- [x] Encrypted DB URL: decrypt at startup, in-memory only
- [x] Backward compatibility: falls back to `DATABASE_URL` if encrypted not present
- [x] Error handling: exits with clear message if required env vars missing
- [x] `project-init.md` command wraps `--init` flag
- [ ] T028–T030 MCP server extended

---

## Kit Template Quality

- [x] All 7 command files listed: task-push, task-done, wxAI-pipeline, autofix-tests, autofix-translation, sync-cpl, sync-starter-kit
- [x] All commands use `{{args}}` placeholder (AI-agnostic, not `$ARGUMENTS`)
- [x] `AI.md` includes: project ID, URL, phase, team, tech stack, specs, commands, MCP tools, rules
- [x] `ai-settings.json` includes all 4 AI adapters (Claude Code, BLACKBOXAI, Cursor, Copilot)
- [x] `ProjectOverview.md` excluded from import kits
- [x] `.gitignore` includes `.env`
- [ ] T005–T011 command template files created

---

## Notification Quality

- [x] `project_kit_ready` notification: sent to project creator on kit completion
- [x] `project_kit_failed` notification: sent to creator + all ADMIN users on failure
- [x] Both notification types use existing `notifications` table schema
- [ ] T031–T032 notification methods implemented

---

## Overall Status

**Specification**: ✅ READY — All 22 FRs covered, all 7 USs complete, 8 success criteria measurable
**Plan**: ✅ READY — 8 key decisions documented, research complete, dependencies identified
**Tasks**: ✅ READY — 38 tasks (T001–T038), parallel opportunities identified, MVP scope defined
**Implementation**: ⏳ PENDING — T001–T032 require AI implementation
**Human Tests**: ⏳ PENDING — T033–T038 require human execution
