# Implementation Plan: Task and Lifecycle Management

**Branch**: `009-task-and-lifecycle` | **Date**: 2026-02-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/009-task-and-lifecycle/spec.md`

---

## Summary

Extends the existing project workspace with:
1. Full scope lifecycle state machine (`specifications` extended with `status`, `specorder`, `isoptional`, `createdbyid`)
2. Scope-to-task linkage (`tasks.specid` FK)
3. Task dependency graph (new `taskdependencies` table)
4. Scope Chat with AI streaming and split detection (new `scopeconversations` table)
5. Scope Matrix view (scopes × phases grid)
6. Task detail drawer with Activity, Time, Dependencies, Notes sub-panels
7. Phase advancement validation and in-app notifications
8. QA fail → auto-bug creation; Phase 4 `escalated` → auto-scope stub

Builds on existing `specifications`, `tasks`, `projectphases`, `projects` tables and the `ProjectWorkspacePage` component tree.

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20 LTS
**Primary Dependencies**: Express, React 18 + Vite, Drizzle ORM, TanStack Query, TailwindCSS, shadcn/ui, Zod, Pino
**Storage**: PostgreSQL 15+ (Drizzle ORM, UUID v4 via `.defaultRandom()`)
**Testing**: Vitest (unit/integration), Playwright (E2E)
**Target Platform**: Web (Express port 3001, Vite/React port 5173)
**Project Type**: Web application (existing full-stack monorepo)
**Performance Goals**: Task drawer open < 200ms; phase matrix render < 500ms; scope chat first token < 1s
**Constraints**: No `any` TS; no console.log; dark/light mode all components; no toasts
**Scale/Scope**: Per-project (10s of scopes, 100s of tasks)

---

## Constitution Check

| Rule | Status | Notes |
|---|---|---|
| TypeScript 100% (no any, no @ts-ignore) | ✅ | Enforced by pre-commit hook |
| Pino logging only (no console.log) | ✅ | `createLogger()` from `~/server/lib/logger` |
| PostgreSQL + Drizzle ORM | ✅ | All new tables via Drizzle schema |
| UUID PKs | ✅ | `.defaultRandom()` (UUIDv4, pre-existing project-wide pattern) |
| Custom JWT auth | ✅ | Existing `authenticateToken` middleware on all new routes |
| No underscores in DB field names | ✅ | `specorder`, `isoptional`, `createdbyid`, `blockedbyid`, `scopeid` |
| Table names plural | ✅ | `taskdependencies`, `scopeconversations`, `notifications` |
| Dark/light mode | ✅ | All new components require `dark:` Tailwind variant pairs |
| No toast messages | ✅ | Inline state, contextual feedback, modal for phase validation |
| No backward compat shims | ✅ | Breaking changes preferred; `ProjectSpec.status` type updated at source |

**Initial Constitution Check: PASS**

---

## Project Structure

### Documentation (this feature)

```
specs/009-task-and-lifecycle/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── api-contracts.md ← Phase 1 output
└── tasks.md             ← Phase 2 output (/tasks command)
```

### Source Code (affected paths)

```
src/
├── db/
│   └── schema/
│       ├── specification.ts       ← UPDATE: add specorder, isoptional, createdbyid; widen status
│       ├── task.ts                ← UPDATE: add specid FK
│       ├── taskdependency.ts      ← NEW
│       ├── scopeconversation.ts   ← NEW
│       ├── notification.ts        ← NEW
│       └── index.ts               ← UPDATE: export new schemas
├── server/
│   ├── routes/
│   │   └── projects.ts            ← UPDATE: scope lifecycle, task deps, scope chat, notifications
│   └── services/
│       ├── ScopeService.ts        ← NEW: lifecycle state machine, conflict check, task gen
│       ├── TaskService.ts         ← NEW: task CRUD, deps, QA fail flow, escalate flow
│       ├── ScopeChatService.ts    ← NEW: AI context assembly, SSE streaming, split detection
│       └── NotificationService.ts ← NEW: create/read/mark-read notifications
├── client/
│   ├── components/Projects/
│   │   ├── ScopeMatrixView.tsx    ← NEW
│   │   ├── TaskDrawer.tsx         ← NEW (right-side drawer shell)
│   │   ├── TaskDrawerActivity.tsx ← NEW
│   │   ├── TaskDrawerTime.tsx     ← NEW
│   │   ├── TaskDrawerDeps.tsx     ← NEW
│   │   ├── TaskDrawerNotes.tsx    ← NEW
│   │   ├── ScopeChatView.tsx      ← NEW (split-panel)
│   │   ├── PhaseTaskGroup.tsx     ← NEW (scope-grouped collapsible task list)
│   │   └── ScopeList.tsx          ← UPDATE: lifecycle colors, submit-for-review, approve actions
│   └── pages/
│       └── ProjectWorkspacePage.tsx ← UPDATE: ScopeMatrix tab, ?task= deep-link
└── shared/types/projects.ts        ← UPDATE: ScopeStatus, TaskDependency, ScopeConversation, Notification
```

---

## Phase 0: Research

### Decision 1: AI streaming for Scope Chat

- **Decision**: Server-Sent Events (SSE) via Express `res.write()` for token-by-token streaming. Section lock/unlock communicated as SSE event types (`section_lock`, `section_unlock`, `token`, `done`).
- **Rationale**: Existing Express backend; SSE is simpler than WebSockets for unidirectional streaming. Client receives events and updates the Markdown editor in real time.
- **Alternatives considered**: WebSockets (overkill), polling (too laggy for token-by-token UX).

### Decision 2: Scope conflict check

- **Decision**: AI-powered check at `draft → in_review` transition. Input: current scope content + all other scope titles and content summaries. Output: structured JSON conflict list. Fail-open if AI unavailable: show warning, allow proceed with override logged to `companyauditlogs`.
- **Rationale**: Semantic overlap requires language understanding, not rule-based logic.
- **Alternatives considered**: Keyword matching (too brittle).

### Decision 3: AI task generation deduplication

- **Decision**: Normalize proposed task titles and compare against existing `tasks.name` values using Levenshtein distance (threshold ≤ 0.2 = duplicate). No embedding similarity needed at this scale.
- **Rationale**: Task titles are short and specific; near-exact match detection is sufficient.
- **Alternatives considered**: Embedding similarity (higher accuracy but adds latency + cost).

### Decision 4: Declined split storage

- **Decision**: Store declined split suggestions as `scopeconversations` entries with `role = 'system'` and JSON payload `{ "type": "split_declined", "topic": "..." }`. The AI context builder reads these to suppress re-suggestions.
- **Rationale**: No new table needed; conversation history is the natural store.
- **Alternatives considered**: New `scopesplitdecisions` table (over-engineered for a single flag per topic).

### Decision 5: In-app notifications

- **Decision**: New `notifications` table (`userid`, `type`, `entityid`, `entitytype`, `message`, `read`, `createdat`). Polled client-side every 30 seconds via TanStack Query. Bell icon shows unread count badge.
- **Rationale**: Simple polling fits team-scale usage. No need for WebSocket push.
- **Alternatives considered**: WebSocket push (unnecessary complexity at this scale).

### Decision 6: Scope Matrix cell status derivation

- **Decision**: Cell status derived at query time from scope lifecycle state + phase name (not stored). Rules:
  - `pending` = scope has not yet reached the phase's required status threshold
  - `active` = scope is currently working through this phase
  - `complete` = scope has passed this phase
  - `blocked` = scope has open/failed tasks in this phase
  - `deferred` = `scope.status = 'deferred'` OR `scope.isoptional = true` and scope is not yet past this phase
- **Rationale**: Avoids stale derived state; computable from existing data.
- **Alternatives considered**: Storing cell status (write-intensive, stale risk).

<<<<<<< HEAD
### Decision 7: Phase Assignment Editing

- **Decision**: Extend the existing Project Edit modal in `ProjectWorkspacePage.tsx` to include phase assignment dropdowns for all 6 phases. Reuse the same dropdown component pattern from `CreateProjectModal.tsx`. Call the existing `PATCH /api/projects/:id/phases/:phaseid/assign` endpoint for each changed phase.
- **Rationale**: The backend API already exists; only UI changes needed. Consistent UX with project creation flow.
- **Permissions**: ADMIN can reassign any phase; TEAM_MANAGER can only reassign phases where they are the current assignee.
- **Notifications**: New assignee receives in-app notification via existing `NotificationService`.
- **Audit**: All reassignments logged to `companyauditlogs` with `actiontype = 'phase_reassigned'`.

=======
>>>>>>> origin/014-sysadmin-platform-admin
---

## Phase 1: Design & Contracts

<<<<<<< HEAD

=======
>>>>>>> origin/014-sysadmin-platform-admin
See [data-model.md](./data-model.md), [contracts/api-contracts.md](./contracts/api-contracts.md), [quickstart.md](./quickstart.md).

---

## Phase 2: Task Planning Approach

_Executed by /tasks command — not created here._

**Task Generation Strategy**:
- **Setup**: Verify branch, confirm existing schema state
- **Foundation** (blocking prerequisite): Schema changes (Drizzle files + human migration), `index.ts` exports, shared type updates
<<<<<<< HEAD
- **Per-story phases**: Scope lifecycle backend + UI → Task drawer + deps → Scope Chat → Scope Matrix → Notifications → Phase Assignment Management → QA fail/escalate flows → Phase validation → Polish

**Ordering**: Schema first → services → routes → shared types → UI components. `[P]` for tasks with no shared file dependencies.

**Estimated Output**: 60–75 tasks across 8 phases (includes 5-6 tasks for Phase Assignment Management)

=======
- **Per-story phases**: Scope lifecycle backend + UI → Task drawer + deps → Scope Chat → Scope Matrix → Notifications → QA fail/escalate flows → Phase validation → Polish

**Ordering**: Schema first → services → routes → shared types → UI components. `[P]` for tasks with no shared file dependencies.

**Estimated Output**: 55–70 tasks across 8 phases
>>>>>>> origin/014-sysadmin-platform-admin

---

## Post-Design Constitution Check

| Rule | Status |
|---|---|
| TypeScript 100% | ✅ All new entities have Drizzle inferred types + explicit shared types |
| Pino logging | ✅ All new services use `createLogger()` |
| No toast messages | ✅ Task drawer uses inline state; phase validation uses modal |
| Dark/light mode | ✅ All new component specs include dark: variants |
| No underscores | ✅ |
| Plural tables | ✅ |

**Post-Design Constitution Check: PASS**

---

<<<<<<< HEAD
## Phase Assignment Management Implementation Notes

**Backend** (already exists):
- `PATCH /api/projects/:id/phases/:phaseid/assign` endpoint in `projects.ts`
- `PhaseService.assignUser()` method
- RBAC permission `project:assign-users` for ADMIN and TEAM_MANAGER

**Frontend Changes Required**:
1. **ProjectWorkspacePage.tsx**: Add phase assignment section to edit modal
   - Fetch team members via `/api/team` endpoint
   - Display 6 dropdowns (Design, Implementation, QA, HumanTesting, Beta, Release)
   - Show current assignee name/email for each phase
   - Filter dropdown options based on permissions (ADMIN sees all, TEAM_MANAGER sees only their assigned phases)
   
2. **useProjects.ts hook**: Add `updatePhaseAssignment()` mutation
   - Call `PATCH /api/projects/${projectId}/phases/${phaseId}/assign`
   - Invalidate phases query on success
   - Handle errors with inline message (no toast)

3. **Notification Integration**:
   - Call `NotificationService.create()` with type `phase_assigned`
   - Include project name, phase name, assigner name in message

4. **Audit Logging**:
   - Log to `companyauditlogs` with `actiontype = 'phase_reassigned'`
   - Store: previousAssigneeId, newAssigneeId, phaseName, projectId, changedByUserId

**UI/UX Details**:
- Section title: "Phase Assignments" with Users icon
- Each row: Phase name (left) + Dropdown (right)
- Dropdown options: "Unassigned" + list of team members (fullname + email)
- Disabled state: Dropdown disabled if user lacks permission
- Save behavior: Changes applied immediately when modal is saved (batch all phase changes)

---

## Progress Tracking


=======
## Progress Tracking

>>>>>>> origin/014-sysadmin-platform-admin
- [x] Phase 0: Research complete
- [x] Phase 1: Design complete
- [x] Phase 2: Task planning approach described
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:

- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations: none required

---

_Based on Constitution v1.2.0 — See `.specify/memory/constitution.md`_
