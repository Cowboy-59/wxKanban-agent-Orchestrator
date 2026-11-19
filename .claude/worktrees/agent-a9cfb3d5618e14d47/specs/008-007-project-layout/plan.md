# Implementation Plan: Project Layout & Lifecycle Workspace

**Branch**: `008-007-project-layout` | **Date**: 2026-02-21 | **Spec**: `specs/008-007-project-layout/spec.md`

---

## Summary

Implement the Projects section: company-scoped project list with phase-based visibility rules, 6-phase lifecycle workspace per project, phase-scoped task and spec management, AI-generated project overview and spec stubs on create, and a `project.init` Claude Code command. Requires schema migrations (4 ALTER + 1 CREATE TABLE), a rewrite of `ProjectService`, new `PhaseService` and `ProjectDocumentService`, new and extended API routes, and new frontend pages (`/projects`, `/projects/:id`).

---

## Technical Context

**Language/Version**: TypeScript 5.x (Node 20 LTS)
**Primary Dependencies**: Express, Drizzle ORM, Zod (validation), TanStack Query (frontend), Tailwind + shadcn/ui, Gemini API (AI scaffolding)
**Storage**: PostgreSQL 15+ via `src/db/client.ts` (canonical pool)
**Testing**: Vitest (unit), Playwright (E2E via quickstart.md scenarios)
**Target Platform**: Express API (port 3001) + React/Vite SPA (port 5173)
**Project Type**: Web application (existing monorepo structure: `src/server/`, `src/client/`)
**Performance Goals**: Project list < 500ms; Phase completion check < 100ms; AI scaffolding < 30s async
**Constraints**: Constitution compliance (UUID PK, no underscores, no console.log, dark mode required); migrations human-executed

---

## Constitution Check

| Rule | Status | Notes |
|---|---|---|
| TypeScript 100% | PASS | All new files in TS |
| No console.log | PASS | Pino loggers only |
| UUID v7 PKs | GAP | Existing tables use `defaultRandom()` — new `projectdocuments` table will match existing pattern |
| No underscores | PASS | All field names concatenated lowercase |
| DB pool: canonical only | CRITICAL FIX | `ProjectService` uses rogue pool — must fix |
| Dark mode on all UI | REQUIRED | All new components need `dark:` Tailwind variants |
| No backward compat | PASS | Clean rewrite of `ProjectService` methods |

**No constitution violations requiring deviation documentation.**

---

## Project Structure

### Documentation (this feature)

```
specs/008-007-project-layout/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── projects.yaml    ← Phase 1 output
└── tasks.md             ← Phase 2 output (/tasks command)
```

### Source Code Locations (existing monorepo)

```
src/
├── db/schema/
│   ├── projectphase.ts       MODIFY — add assigneduserid
│   ├── task.ts               MODIFY — add phaseid, issuetype, result
│   ├── specification.ts      MODIFY — add phaseid
│   ├── timeentry.ts          MODIFY — add phaseid
│   ├── projectdocument.ts    NEW — projectdocuments table
│   └── index.ts              MODIFY — export projectdocuments
├── server/
│   ├── index.ts              MODIFY — mount /api/projects route
│   ├── routes/
│   │   └── projects.ts       REWRITE — full lifecycle endpoints
│   ├── services/
│   │   ├── ProjectService.ts REWRITE — fix db pool, company scope, phase init
│   │   ├── PhaseService.ts   NEW — phase transition, completion checks
│   │   ├── ProjectDocumentService.ts  NEW — CRUD for projectdocuments
│   │   └── AIScaffoldingService.ts    NEW — Gemini overview + spec stub gen
│   └── middleware/
│       └── auth.ts           READ-ONLY — requireAdmin, requirePhaseAccess helpers needed
└── client/
    ├── pages/
    │   ├── ProjectListPage.tsx     NEW
    │   └── ProjectWorkspacePage.tsx  NEW
    ├── components/
    │   └── Projects/
    │       ├── ProjectCard.tsx           NEW
    │       ├── CreateProjectModal.tsx    NEW
    │       ├── PhaseTabBar.tsx           NEW
    │       ├── PhaseCompletionBar.tsx    NEW
    │       ├── DesignPhaseView.tsx       NEW
    │       ├── ImplementationPhaseView.tsx  NEW
    │       ├── QAPhaseView.tsx           NEW
    │       ├── HumanTestingPhaseView.tsx NEW
    │       ├── BetaPhaseView.tsx         NEW
    │       ├── ReleasePhaseView.tsx      NEW
    │       ├── TaskList.tsx              NEW (shared across phases)
    │       ├── SpecList.tsx              NEW (Design phase)
    │       └── ProjectOverviewTab.tsx   NEW
    └── App.tsx                   MODIFY — add /projects routes
```

---

## Phase 0: Outline & Research — COMPLETE

See `research.md` for all resolved decisions.

**Key decisions:**
1. Fix rogue db pool in `ProjectService` → canonical `~/db/client.js`
2. Mount `/api/projects` in `server/index.ts` (currently missing — pre-existing bug)
3. Rewrite `getUserProjects` for company-scoped + role-based visibility
4. 4 schema ALTERs + 1 CREATE TABLE (migration human-executed)
5. Phase auto-created in transaction on project create
6. AI scaffolding: async Gemini call, `setImmediate` pattern
7. Phase advance authorization: ADMIN or assigned TEAM_MANAGER
8. `project.init` auth via `WXKANBAN_API_TOKEN` Bearer token

---

## Phase 1: Design & Contracts — COMPLETE

Artifacts:
- `data-model.md` — All schema changes and SQL visibility rules
- `contracts/projects.yaml` — Full OpenAPI spec for 20+ new endpoints
- `quickstart.md` — 7 integration test scenarios

---

## Phase 2: Task Planning Approach

The `/tasks` command will generate `tasks.md` from the above artifacts.

**Task generation strategy:**
- Phase A (Setup): DB schema migration files (4 ALTER + 1 CREATE), index.ts exports
- Phase B (Backend Foundation): Fix `ProjectService` db pool, mount route in server/index.ts
- Phase C (Service Layer): `PhaseService`, `ProjectDocumentService`, rewrite `ProjectService`
- Phase D (Route Layer): Rewrite `projects.ts` routes with all lifecycle endpoints
- Phase E (AI Scaffolding): `AIScaffoldingService` with Gemini integration
- Phase F (Frontend Core): `ProjectListPage`, `ProjectCard`, `CreateProjectModal`
- Phase G (Frontend Workspace): `ProjectWorkspacePage`, `PhaseTabBar`, phase-specific views
- Phase H (Claude Code command): `.claude/commands/project.init.md`
- Phase I (Integration wiring): App.tsx routing, TanStack Query hooks, dark mode audit

**TDD order**: Schema → Services → Routes → Frontend
**Parallel opportunities**: Frontend components (F/G) can run in parallel after routes are stable

**Estimated task count**: 35-45 tasks

---

## Complexity Tracking

No constitution violations or complexity deviations.

---

## Progress Tracking

**Phase Status:**

- [x] Phase 0: Research complete
- [x] Phase 1: Design complete
- [x] Phase 2: Task planning approach described
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status:**

- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none)

---

## Enhancement: Tasks Chip — Stats Summary & Open Tasks Popup

**Date**: 2026-02-21 | **Component**: `ProjectDetailPanel.tsx`

### Summary

When a user clicks the **Tasks** chip in the Documents section of an `ExpandableScopeRow`, instead of showing a file button (which would open the markdown editor), the panel now renders a `TaskStatsCard` — a compact 3-column stat grid showing Total / Open / Closed task counts for that scope. Clicking the card opens an `OpenTasksPopup` modal listing all open/in-progress tasks.

### Motivation

The `tasks` doctype does not map to an editable markdown file — it represents live task data in the database. Showing a file button for it was misleading. The stats card provides immediately useful at-a-glance information and a quick path to see what's blocking progress.

### Components Added

| Component | Location | Description |
| --- | --- | --- |
| `TaskStatsCard` | `ProjectDetailPanel.tsx` | 3-col stat grid (Total / Open / Closed); full-width button; triggers popup on click |
| `OpenTasksPopup` | `ProjectDetailPanel.tsx` | Fixed modal listing open + in-progress tasks for the scope; dismissible via X |

### Logic Change in `ExpandableScopeRow`

In the "active doc detail row" block (below the doc chips), a doctype check was added:

```tsx
if (activeDoc.doctype === "tasks") {
  return (
    <TaskStatsCard
      tasks={scopeTasks ?? []}
      loading={tasksLoading}
      onViewOpen={() => setShowOpenTasksPopup(true)}
    />
  );
}
// else: render file button as before
```

`scopeTasks` is the same array fetched on first scope expand and shared with the `TasksSection` below. No additional API calls are made.

### State Added to `ExpandableScopeRow`

```tsx
const [showOpenTasksPopup, setShowOpenTasksPopup] = useState(false);
```

`OpenTasksPopup` is rendered at the top of the component's return (alongside `MarkdownEditorModal`) when `showOpenTasksPopup && scopeTasks`.

### No Schema / API Changes

This enhancement is purely frontend. It reuses the existing `GET /api/projects/:projectId/scopes/:scopeId/tasks` fetch that was already in place.
