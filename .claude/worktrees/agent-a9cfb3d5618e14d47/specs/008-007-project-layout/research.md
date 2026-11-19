# Research: Project Layout & Lifecycle Workspace

**Feature**: 008-007-project-layout
**Date**: 2026-02-21

---

## Finding 1 — ProjectService Uses Rogue DB Pool

**Decision**: Rewrite `ProjectService` to import from `~/db/client.js` (canonical pool).
**Rationale**: `ProjectService` currently imports `db` from `~/server/lib/db.js` — the rogue pool with no SSL config. This is the same root cause as the PM Systems 500 bug fixed earlier. All service files must use `~/db/client.js`.
**Alternatives considered**: None — one pool, one truth.

---

## Finding 2 — `/api/projects` Route Not Mounted

**Decision**: Add `import projectsRoutes from "./routes/projects.js"` and `app.use("/api/projects", projectsRoutes)` to `src/server/index.ts`.
**Rationale**: `src/server/routes/projects.ts` exists but is never registered in the Express app. All existing project endpoints are dead.
**Impact**: This is a pre-existing bug — must be fixed as part of this feature.

---

## Finding 3 — `getUserProjects` Visibility Logic Is Broken

**Decision**: Rewrite `getUserProjects` to implement company-scoped + role-filtered visibility.
**Current behavior**: `WHERE userid = $1 AND currentphase = $2` — incorrect on both axes.
**Required behavior**:
- ADMIN (`usertype = 'ADMIN'`): `WHERE companyid = $1` — all company projects
- Non-admin: JOIN `projectphases` WHERE `assigneduserid = userid AND status = 'in_progress'`
**Rationale**: Non-admin users see only projects where they are the designated phase lead for the currently active phase.

---

## Finding 4 — Schema Additions Needed (Migrations Required)

**Decision**: Add the following columns via Drizzle migration. Human must run `db:generate && db:migrate`.

| Table | Column | Type | Constraint |
|---|---|---|---|
| `projectphases` | `assigneduserid` | UUID | FK → userprofiles.id, NULLABLE, ON DELETE SET NULL |
| `tasks` | `phaseid` | UUID | FK → projectphases.id, NULLABLE, ON DELETE SET NULL |
| `tasks` | `issuetype` | VARCHAR(50) | DEFAULT 'task', values: task/bug/feature |
| `specifications` | `phaseid` | UUID | FK → projectphases.id, NULLABLE, ON DELETE SET NULL |
| `timeentries` | `phaseid` | UUID | FK → projectphases.id, NULLABLE, ON DELETE SET NULL |

New table: `projectdocuments`
```
id           UUID PK (defaultRandom)
projectid    UUID FK → projects.id ON DELETE CASCADE
type         VARCHAR(50) NOT NULL  -- 'overview', 'readme', 'architecture'
title        VARCHAR(255) NOT NULL
content      TEXT NOT NULL
createdat    TIMESTAMP NOT NULL defaultNow
updatedat    TIMESTAMP NOT NULL defaultNow
createdbyid  UUID FK → userprofiles.id ON DELETE SET NULL NULLABLE
```

**Alternatives considered**: Using filesystem for overview MD — rejected (DB is single source of truth per scope.md).

---

## Finding 5 — AI Scaffolding: Gemini API (Async Background Job)

**Decision**: Use Gemini API (`GEMINI_API_KEY` from env) for overview and spec stub generation. Fire-and-forget after project create response is sent.
**Rationale**: CLAUDE.md specifies Gemini as primary AI with OpenAI fallback. Scaffolding is async (Q2 clarification) — project saves immediately, client polls or uses SSE for completion signal.
**Pattern**: `ProjectService.createProject()` returns project record, then `setImmediate(() => AIScaffoldingService.scaffold(projectid, companyid, userid))` triggers background work.
**Alternatives considered**: Synchronous — rejected (blocks project creation response, bad UX). Queue/worker — overkill for current scale.

---

## Finding 6 — Phase Completion Criteria (Hard Gate)

**Decision**: `PhaseService.checkCompletion(phaseid, phasename)` returns `{ canAdvance: boolean, criteria: CriterionResult[] }`. Advance endpoint validates this before updating status.

| Phase | Criterion | Check |
|---|---|---|
| Design | At least 1 spec with status='approved' | `specifications WHERE phaseid=$1 AND status='approved'` count ≥ 1 |
| Implementation | All tasks completed | `tasks WHERE phaseid=$1 AND status != 'completed'` count = 0 |
| QA Testing | All tasks completed with result='pass' | `tasks WHERE phaseid=$1 AND (status != 'completed' OR result != 'pass')` count = 0 |
| Human Testing | No tasks with status='open' | `tasks WHERE phaseid=$1 AND status='open'` count = 0 |
| Beta | All tasks resolved or deferred | same as human testing |
| Release | All prior phases complete | `projectphases WHERE projectid=$1 AND status != 'complete'` count = 0 (excluding Release itself) |

---

## Finding 7 — Phase Advance Authorization

**Decision**: Phase advance/reopen permitted for ADMIN or TEAM_MANAGER **if** they are the `assigneduserid` for the current phase. Checked server-side.
**Implementation**: Route middleware extracts `usertype` from JWT. Service method cross-checks `projectphases.assigneduserid` for TEAM_MANAGER.
**Rationale**: Q4 clarification — TEAM_MANAGER has scoped authority, not global.

---

## Finding 8 — Auto-Create 6 Phase Records on Project Create

**Decision**: `ProjectService.createProject()` calls `PhaseService.initializePhases(projectid)` within the same transaction. Creates 6 records with fixed phase names, Phase 1 set to `in_progress`, phases 2-6 `pending`.
**Phase names** (matching scope.md): `Design`, `Implementation`, `QA`, `HumanTesting`, `Beta`, `Release`
**Rationale**: Atomic — if phase creation fails, project is rolled back.

---

## Finding 9 — project.init Command

**Decision**: Store as `.claude/commands/project.init.md`. Uses `WXKANBAN_API_TOKEN` Bearer token to call `GET /api/projects/:id/scaffold`. Writes local directory structure.
**Scaffold endpoint**: Returns project metadata, overview content, spec stubs, and phase assignments with assigned user names.
**Auth**: Same JWT middleware with Bearer token extracted from `Authorization: Bearer $WXKANBAN_API_TOKEN` header.
**Rationale**: Personal access tokens are standard pattern (Q5 clarification). No additional token table needed for MVP — use existing JWT infrastructure with long-lived tokens (30-day expiry for PATs vs 24-hour for session tokens).

---

## Finding 10 — Existing `specifications` Table Lacks `phaseid`

**Decision**: Add `phaseid` FK to `specifications`. Existing specs (if any) get `phaseid = NULL`. `SpecificationLifecycleService` needs update to scope queries by phase.
**Rationale**: Spec stubs generated at project creation are linked to the Design phase record. Phase 1 view filters `specifications WHERE phaseid = <design_phase_id>`.

---

## Finding 11 — `projects` Table Needs Company Scope in List Query

**Decision**: `getUserProjects` must filter by `projects.companyid = req.companyid` (from JWT). The `companyid` column already exists on the `projects` table and is populated by `companyid` from the creating user's JWT context.
**Gap in `createProject`**: Currently does not set `companyid` from the authenticated user. Must fix — extract `companyid` from JWT and pass to service.

---

## Finding 12 — `tasks` Table Missing `issuetype` Field

**Decision**: Add `issuetype VARCHAR(50) DEFAULT 'task'` to `tasks` schema. Values: `task`, `bug`, `feature`.
**Rationale**: Scope.md defines `issue_type` as part of the beads-style task structure. Currently missing from schema.
