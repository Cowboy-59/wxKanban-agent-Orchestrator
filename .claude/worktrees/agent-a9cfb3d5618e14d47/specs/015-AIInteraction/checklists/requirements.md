# Requirements Checklist: AI Interaction Governance Framework (Spec 015)

**Feature**: Spec 015 — AI Interaction Rules & Governance Framework
**Date**: 2025-01-28
**Reviewer**: wxAI pipeline

---

## Phase 1: Specify ✅

- [x] Scope document exists: `specs/Project-Scope/015-AiInteraction.md`
- [x] All functional requirements numbered (FR-001 through FR-013)
- [x] All user scenarios have expected outcomes (US1–US7)
- [x] Success criteria are measurable (10 criteria)
- [x] Key entities identified (7 entities)
- [x] Constraints documented (no new tables, provider-agnostic, one-way sync, no silent bypasses)
- [x] Dependencies on Spec 009 and Spec 013 noted
- [x] Scope-First enforcement specified (hard block, not warning)
- [x] Document protection specified (.wxkanban-origin marker system)
- [x] Auto-update behavior specified (.wxkanban-version tracking)
- [x] Emergency override behavior specified (--force --reason required)

## Phase 2: Clarify ✅

- [x] Scope-First enforcement level resolved: hard block (not warning)
- [x] TODO file handling resolved: immediate linking required, not deferred
- [x] Training mode resolved: full scope creation pipeline, not just explanation
- [x] Multi-AI compatibility resolved: provider-agnostic wx prefix naming
- [x] Auto-update trigger resolved: on every project open AND AI session start
- [x] Version block threshold resolved: 2 major versions behind = implementation blocked
- [x] Protected file list resolved: stored in .wxkanban-origin, travels with project
- [x] Emergency override resolved: --force --reason required, logged to both companyauditlogs and projectdocuments
- [x] Mistral AI role resolved: conversational scope creation (not implementation)
- [x] Database approach resolved: no new tables, extend existing companyauditlogs and projectdocuments

## Phase 3: Plan ✅

- [x] `specs/015-AIInteraction/plan.md` created
- [x] Technical context documented (TypeScript, CLI, wxAI commands)
- [x] Constitution check passed
- [x] Project structure documented (new files, modified files, renamed files)
- [x] All key decisions documented with rationale (6 decisions)
- [x] No new database tables (extends existing)
- [x] API routes documented (4 endpoints)
- [x] wxAI command specifications documented (3 new commands)
- [x] Sync command specification documented (6 flags)
- [x] AI interaction log format documented
- [x] Progress tracking section present

## Phase 4: Tasks ✅

- [x] `specs/015-AIInteraction/tasks.md` created
- [x] 28 tasks generated covering all implementation work
- [x] Tasks grouped into logical phases (A: wxAI commands, B: CLI, C: backend, D: registration, E: command updates, F: sync, G: IDE, H: validation)
- [x] Parallel tasks marked with `[P]`
- [x] Human tasks marked with `**HUMAN TASK**`
- [x] Dependency graph complete
- [x] Each task specifies exact file path
- [x] MVP scope defined (P0/P1/P2/P3)

## Phase 5: Implementation (pending)

- [ ] T001: wxAI-scope-check.md command created
- [ ] T002: wxAI-todo-import.md command created
- [ ] T003: wxAI-training.md command created
- [ ] T004: cli/commands/scope-check.ts created
- [ ] T005: cli/commands/todo-import.ts created
- [ ] T006: cli/commands/training.ts created
- [ ] T007: AiInteractionLogService.ts created
- [ ] T008: ai-audit.ts routes created
- [ ] T009: Route registration updated
- [ ] T010: wxAI-implement.md updated with scope-first gate
- [ ] T011: projectrules.md updated with Section VIII
- [ ] T012: cli/commands/implement.ts updated with gate
- [ ] T013: wxAI-sync-global.md command created
- [ ] T014: sync-global.sh updated
- [ ] T015: wxAI-session-start.md command created

## Phase 6: Validation (pending)

- [ ] T016: wxai scope-check CLI verified
- [ ] T017: TypeScript compiles cleanly
- [ ] T018: Scope-first block tested
- [ ] T019: Scope discovery tested
- [ ] T020: TODO import tested
- [ ] T021: Training mode tested
- [ ] T022: Auto-update tested
- [ ] T023: Protected file enforcement tested
- [ ] T024: Emergency override tested
- [ ] T025: AI audit summary API tested
- [ ] T026: AI audit log API tested
- [ ] T027: Multi-provider compatibility verified
- [ ] T028: End-to-end flow tested

---

## API Contract Checks

- [x] `GET /api/ai-audit/logs` — returns paginated AI interaction logs with filters
- [x] `GET /api/ai-audit/logs/:id` — returns specific log entry
- [x] `GET /api/ai-audit/summary` — returns counts by action type
- [x] `GET /api/ai-audit/overrides` — returns list of emergency overrides with reasons

## Security Checks

- [x] All AI audit API endpoints require ADMIN authentication
- [x] Emergency overrides require documented reason (--reason parameter)
- [x] Override reason logged to both companyauditlogs and projectdocuments
- [x] Protected files cannot be modified in consumer projects
- [x] Governance rules sync is one-way only (wxKanban → consumer)
- [x] Consumer project customizations in projectrules.md are preserved on sync

## Governance Checks

- [x] Scope-First rule is a hard block (not a warning)
- [x] TODO files must be linked to scopes immediately on creation
- [x] All AI providers must follow the same universal rules
- [x] wx prefix naming enforced for all AI-related files
- [x] .wxkanban-origin marker identifies source project
- [x] .wxkanban-version tracks governance rules version in consumer projects
- [x] Auto-update triggers on every project open and AI session start
- [x] 2-major-version-behind threshold blocks implementation
- [x] 100% of AI interactions that modify code are logged to companyauditlogs
- [x] Management can review all AI activity via /api/ai-audit/* endpoints

## Multi-AI Compatibility Checks

- [x] All new wxAI command files include `ai-compat: universal` frontmatter
- [x] All new wxAI command files include `claude-code: true`, `cursor: true`, `blackboxai: true`
- [x] No provider-specific code paths in governance rules
- [x] wx prefix used in all new command and file names
- [x] Mistral AI role documented for conversational scope creation
