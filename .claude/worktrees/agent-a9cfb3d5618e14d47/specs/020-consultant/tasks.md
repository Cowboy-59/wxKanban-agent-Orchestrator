# Tasks — Spec 020 Consultant Work Hub

Derived from interactive buildscope on 2026-05-12. Tasks are grouped by FR delta vs. current implementation. ✅ = already built; ⚠️ = needs change; ❌ = new.

## Database

- [ ] **T001** — Add `source` (VARCHAR(20) DEFAULT 'manual'), `completionnotesummary` (TEXT), and `aispecsessionid` (UUID FK → aispecsessions, nullable) columns to `projecttimeentries` + partial index `idx_projecttimeentries_aisession` (FR-004, FR-005)
- [ ] **T002** — Add partial index `idx_projecttasks_external` on existing `projecttasks(sourcepmssystem, externalid)` (FR-001 dedup; column already exists, no ALTER needed)
- [ ] **T003** — Create `taskstateoverrides` table + `idx_taskstateoverrides_taskid` (FR-007 audit)
- [ ] **T004** — Create `tasksyncrecords` table + partial index `idx_tasksyncrecords_pending` (FR-006 outbound queue)
- [ ] **T005** — Create `aispecsessions` table + partial index `idx_aispecsessions_active` (FR-005 spec-level AI session)
- [ ] **T006** — Generate + apply Drizzle migration via `npm run db:generate && npm run db:migrate`

## Backend Routes

- [ ] **T010** — Refactor `PATCH /api/consultant-hub/tasks/:taskid/state` to write `taskstateoverrides` row + enqueue `tasksyncrecords` instead of appending to `description` (FR-007, FR-006)
- [ ] **T011** — Add `GET /api/consultant-hub/tasks/:taskid` returning task detail + override history + timelogs + sync state (FR-007, supports `TimeLogDrawer`)
- [ ] **T012** — Update `GET /api/consultant-hub/tasks` to collapse rows by `(sourcepmssystem, externaltaskid)` when both NOT NULL (FR-001 dedup)
- [ ] **T013** — Enforce single-active-timer server-side in `/api/time-tracking/start` (reject if any open `endtime IS NULL` row for the user) (FR-012)
- [ ] **T014** — Extend `pmSyncService` with `runOutbound()` that processes `tasksyncrecords` rows where `lastsyncstatus='pending'`, updates status + retrycount (FR-006)
- [ ] **T015** — Build `AISpecSessionService` (server) with methods: `startSession`, `switchTask`, `addOverhead`, `closeSession`, `getActive`, `checkSpecCompletion` (FR-005)
- [ ] **T016** — Add 6 routes under `/api/consultant-hub/ai-session/*` wired to `AISpecSessionService` (start, task-switch, overhead, close, GET :id, GET active) (FR-005)
- [ ] **T017** — Background job: every 60s, find `aispecsessions` rows where `status='active'` AND all linked spec tasks have `status='completed'` → auto-close + generate summaries (FR-005)
- [ ] **T018** — Background job: force-stop sessions where `(now - starttime) > 30 days` with `status='timeout'` (FR-005 hard cap)

## Frontend Components

- [ ] **T020** — Build `BillablePromptModal` and open it on Stop Timer; default Billable=Y, optional notes; submit calls existing stop endpoint with `billable` + `notes` payload (FR-004)
- [ ] **T021** — Build `TaskStatusControl` modal (textarea for reason, required when blocked/suspended); replace `window.prompt()` calls in `ConsultantWorkHubPage.tsx` (FR-007)
- [ ] **T022** — Build `TimeLogDrawer` (slide-out panel showing all `projecttimeentries` for a task; AI entries visually distinguished by source badge) (FR-005)
- [ ] **T023** — Extract `WorkloadSummaryBar` from inline counters in `ConsultantWorkHubPage.tsx` (cosmetic refactor)
- [ ] **T024** — Add inactivity prompt: when active timer elapsed > 8h, surface "Keep / Stop / Discard" prompt; auto-stop after 15min no-action with `billable=false` + note (FR-011)
- [ ] **T025** — Update task cards to show source badges (both internal + PM) when de-duplicated row has multiple sources (FR-001)

## wxAI Commands

- [ ] **T030** — Implement `/consultant-hub [--project <id>]` (drop `--member`; team mgmt deferred to 021)
- [ ] **T031** — Implement `/track-time start|stop <task-id>` (manual-only; opens `BillablePromptModal` on stop)
- [ ] **T032** — Implement `/suspend-task <id> --status <blocked|suspended> --reason "..."` — reuses `PATCH /tasks/:taskid/state` logic
- [ ] **T033** — Implement `/ai-session start|task|overhead|close|status <spec-id>` — thin client over `/api/consultant-hub/ai-session/*` (FR-005)

## AI Integration

- [ ] **T040** — On any dev-related task wxAI receives for a spec, auto-invoke `/ai-session start <spec-id>` (idempotent) before performing work (FR-005)
- [ ] **T041** — Wire wxAI task-attribution: when wxAI transitions between tasks within a spec, call `/ai-session task <spec-id> <task-id>` (FR-005)
- [ ] **T042** — Wire wxAI overhead accounting: when wxAI engages in Q&A / clarification not tied to a specific task, periodically call `/ai-session overhead <spec-id> <minutes>` (FR-005)
- [ ] **T043** — Generate per-task and spec-level AI summaries on session close (auto or manual) and persist to `completionnotesummary` + `aispecsessions.summary` (FR-005)

## Testing

- [ ] **T050** — Vitest unit tests for new endpoints (`tasks/:id`, state with override + sync queue, dedup logic, single-timer enforcement)
- [ ] **T051** — Vitest unit tests for `pmSyncService.runOutbound()` retry semantics
- [ ] **T052** — Playwright E2E: full consultant journey — login → filter project → start timer → stop with billable prompt → mark blocked with reason → view in compliance panel → preview invoice
- [ ] **T053** — Playwright E2E: AI capture journey — wxAI starts/stops timer, summary lands in completion notes

## Documentation

- [ ] **T060** — Update `specs/main/data-model.md` to reflect new tables (`taskstateoverrides`, `tasksyncrecords`) + extended columns on `projecttimeentries` and `projecttasks`
- [ ] **T061** — Update `specs/main/contracts/openapi.json` with `GET /tasks/:taskid` endpoint

---

## Deferred to Scope 021

- FR-010 team-lead / team-member management
- `consultantteammembers` table
- `/api/consultant-hub/team*` routes
- `TeamMemberPanel` component
- `/consultant-hub --member` flag
