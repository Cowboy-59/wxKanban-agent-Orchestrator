# Spec 048: Lifecycle Documentation Consolidation

**Spec Number**: 048
**Status**: `draft`
**Created**: 2026-06-14
**Last Reviewed**: 2026-06-14 (interactive buildscope — section-by-section, approved through Section 6). **Amendment A 2026-06-14** — corrected the lifecycle architecture after the implementation pass found the original model inverted; see "Amendment A" at the end. The Amendment supersedes the Overview/FR framing wherever they conflict.
**Depends On**: spec 021 (Project Lifecycle PDF — the per-project, DB-driven generator this scope consolidates onto)
**Related Scopes**: follow-up flagged during the 2026-06-14 lifecycle cleanup (corrupt/stale `specs/projectlifecycle.md` + the `GET /api/lifecycle` doctype collision).
**Source**: `specs/Project-Scope/048-lifecycle-consolidation.md`

---

## Overview

Make the **per-project, DB-driven lifecycle generator the single source of truth** for project lifecycle documentation, and **retire the parallel legacy aggregate** that had drifted ~40 specs stale and collides with it on `projectdocuments` doctype `ProjectLifecycle`.

**Hard invariant — preserved, not touched:** the per-project lifecycle document is **generated and updated automatically on every create and update of scopes/specs/tasks**, via `ProjectLifecycleGenerator` (the per-project regenerate route + the MCP-side auto-generation hooks). **This scope does not change that mechanism in any way** — it only removes the competing legacy path that could overwrite its output.

**What's retired:**
- `GET /api/lifecycle` (`src/server/routes/lifecycle.ts`) — the route that reads the disk `specs/projectlifecycle.md` and upserts doctype `ProjectLifecycle` for an arbitrary "first project of the company" (the clobber).
- Its UI consumers — `LifecyclePanel` (`src/client/components/Dashboard/LifecyclePanel.tsx`) and `LifecyclePage` (`src/client/pages/LifecyclePage.tsx`) — the platform-aggregate view.
- The hand-maintained `specs/projectlifecycle.md` file and `push-lifecycle.mjs`.
- The stale CLAUDE.md "projectlifecycle.md Conventions" + "projectdocuments DB Sync" sections.

**What stays the lifecycle surface:** the Admin Dashboard per-project "Project Lifecycle" link → `GET /api/projects/:id/lifecycle` (doctype `ProjectLifecycle`, per project). For dogfooding, the **wxKanban Development project's** own per-project lifecycle doc *is* the platform view — no separate aggregate is rebuilt.

**Doctype collision — resolved by removal:** once the legacy route is gone, **only** the per-project generator writes doctype `ProjectLifecycle`, so nothing can overwrite an accurate per-project doc.

## Business Problem

Project lifecycle documentation drifted because **two systems wrote the same artifact**. The modern path — `ProjectLifecycleGenerator` — builds an accurate per-project lifecycle doc from the `projectspecifications` table and regenerates it on every scope/spec/task change. The legacy path — a hand-maintained `specs/projectlifecycle.md` file served by `GET /api/lifecycle` — had to be edited by hand (and pushed via `push-lifecycle.mjs`), so it rotted ~40 specs out of date, accumulated unresolved git merge-conflict markers, and — worst — **upserted itself into `projectdocuments` under the same doctype `ProjectLifecycle` for an arbitrary "first project,"** overwriting an accurate per-project document with a stale aggregate. Lifecycle documentation is important and must be trustworthy; the fix is to delete the second, drifting path entirely while leaving the per-project auto-generation untouched, and to update the documentation that still described the obsolete hand-maintained workflow.

## Actors

- Primary: a developer/maintainer (and the dogfooded wxKanban platform itself) who relies on accurate, non-drifting lifecycle documentation; the Admin who views a project's lifecycle from the dashboard.
- Secondary: the per-project `ProjectLifecycleGenerator` (the preserved single writer of doctype `ProjectLifecycle`); a future AI session reading CLAUDE.md for how lifecycle docs work.

## Success Metrics

1. **The invariant holds** — after the change, creating/updating a scope, spec, or task still regenerates that project's `ProjectLifecycle` document (markdown + PDF); a before/after check confirms the auto-generation fires identically.
2. **Single writer, route gone** — a repo-wide search confirms `ProjectLifecycleGenerator` is the only writer of doctype `ProjectLifecycle`, `GET /api/lifecycle` no longer exists (404 on call), and browsing the app never overwrites a per-project doc.
3. **Clean removal** — `specs/projectlifecycle.md`, `push-lifecycle.mjs`, `src/server/routes/lifecycle.ts`, `LifecyclePanel`, and `LifecyclePage` are deleted with zero live references; `npm run check-types` and the build pass and the app starts.

## Scope Boundary

IN: removing `GET /api/lifecycle` + its route registration (and any stale mount in the dead `index2.ts`); removing `LifecyclePanel` / `LifecyclePage` and their nav/route entries; deleting `specs/projectlifecycle.md`, `push-lifecycle.mjs`, and `src/server/routes/lifecycle.ts`; rewriting CLAUDE.md's lifecycle convention sections to the per-project generator; verifying no dangling references and a clean build/run. The per-project generator (`ProjectLifecycleGenerator`) and every auto-generation hook on scope/spec/task CRUD are **preserved unchanged**.

## Out of Scope

Rebuilding a platform-wide multi-project aggregate (explicitly per-project only — the wxKanban Development project's own per-project doc serves the dev overview); any change to the per-project generator's content, format, or triggers (preserve only); a code-level mass backfill (a one-time `generate-project-lifecycle.ts --all` is an operational hygiene step after deploy, not a feature); any `projectdocuments` schema change.

## Open Questions

None at this time. All decisions (per-project-only target shape, retire the legacy aggregate, update CLAUDE.md + retire `push-lifecycle.mjs`, delete the dead file, preserve the auto-generation invariant) were resolved during buildscope on 2026-06-14.

## Functional Requirements

### FR-001 — Preserve per-project auto-generation (untouchable invariant)

The per-project lifecycle document MUST continue to be generated/updated automatically on every create and update of scopes/specs/tasks, via the existing `ProjectLifecycleGenerator` path. This scope MUST NOT modify that mechanism.

**Acceptance Criteria**:
- [ ] After the change, creating/updating a scope, spec, or task still regenerates that project's `ProjectLifecycle` document (markdown + PDF)
- [ ] The generation code path (`ProjectLifecycleGenerator` + its invocation hooks) is unchanged by this scope
- [ ] A before/after check confirms identical generation behavior

### FR-002 — Retire the legacy aggregate route; per-project generator is the sole writer

`GET /api/lifecycle` and its handler MUST be removed, so the per-project generator is the only code that writes doctype `ProjectLifecycle` — resolving the clobber.

**Acceptance Criteria**:
- [ ] `GET /api/lifecycle` (and its route registration) no longer exists
- [ ] No code path other than `ProjectLifecycleGenerator` writes doctype `ProjectLifecycle`
- [ ] Browsing the app never overwrites a per-project lifecycle doc with an aggregate

### FR-003 — Remove the legacy UI consumers

The `LifecyclePanel` / `LifecyclePage` (platform-aggregate view) MUST be removed; the Admin Dashboard per-project "Project Lifecycle" link remains the single lifecycle surface, with no dead links left behind.

**Acceptance Criteria**:
- [ ] `LifecyclePanel` and `LifecyclePage` (and any nav/route entries pointing to them) are removed
- [ ] The Admin Dashboard per-project lifecycle link still works
- [ ] No UI element links to a removed route/page

### FR-004 — Delete the hand-maintained file and sync script

`specs/projectlifecycle.md` and `push-lifecycle.mjs` MUST be deleted, since nothing reads them after FR-002.

**Acceptance Criteria**:
- [ ] `specs/projectlifecycle.md` is deleted
- [ ] `push-lifecycle.mjs` is deleted
- [ ] No remaining code or script references either

### FR-005 — Update CLAUDE.md lifecycle conventions to reality

CLAUDE.md's "projectlifecycle.md Conventions" and "projectdocuments DB Sync" sections MUST be rewritten to describe the per-project generator as the single source of truth (generated/updated on scope/spec/task changes), removing the obsolete "edit the file + Mermaid charts + run `push-lifecycle.mjs`" instructions.

**Acceptance Criteria**:
- [ ] CLAUDE.md describes only the per-project generator path for lifecycle docs
- [ ] No instruction to hand-edit `specs/projectlifecycle.md` or run `push-lifecycle.mjs` remains
- [ ] The per-project doctype/output/locations are documented accurately

### FR-006 — Clean removal (no dangling references; builds and runs)

After retirement, the codebase MUST contain no references to the removed route, file, page, or script, and MUST build and run.

**Acceptance Criteria**:
- [ ] A repo-wide search finds no live references to `GET /api/lifecycle`, `LifecyclePanel`/`LifecyclePage`, `specs/projectlifecycle.md`, or `push-lifecycle.mjs`
- [ ] `npm run check-types` and the build pass
- [ ] The app starts with no route-registration or import errors

---

## Technical Sections

This is a deletion + documentation scope — no new data, APIs, or components.

### Data / Schema
- **None.** The `projectdocuments` doctype `ProjectLifecycle` is unchanged; only the set of writers shrinks from two paths to one.

### API Routes
- **Remove:** `GET /api/lifecycle` (`src/server/routes/lifecycle.ts`) and its registration in `src/server/app.ts` (and any stale mount in the dead `index2.ts`).
- **Preserve untouched:** `src/server/routes/projectLifecycle.ts` — `GET /api/projects/:id/lifecycle` + `POST /api/admin/projects/:id/lifecycle/regenerate`.

### Frontend Components
- **Remove:** `LifecyclePanel` (`src/client/components/Dashboard/LifecyclePanel.tsx`) and `LifecyclePage` (`src/client/pages/LifecyclePage.tsx`), plus any nav/route entries pointing at them.
- **Preserve:** the Admin Dashboard per-project "Project Lifecycle" link.

### Files Deleted
- `src/server/routes/lifecycle.ts`, `specs/projectlifecycle.md`, `push-lifecycle.mjs`.

### Preserved Generation Core (the invariant)
- `ProjectLifecycleGenerator` (`src/server/services/ProjectLifecycleGenerator.ts`), `scripts/generate-project-lifecycle.ts`, and every hook that invokes per-project regeneration on scope/spec/task CRUD (the per-project regenerate route + the MCP-side auto-generation in `mcp-server/src/utils/lifecycle-generator.ts`). The implementer MUST confirm each auto-generation hook and leave it untouched.

### Docs
- Rewrite CLAUDE.md's "projectlifecycle.md Conventions" + "projectdocuments DB Sync" sections to the per-project generator.

---

## Constraints & Notes

### Constraints
- **Untouchable invariant:** the per-project auto-generation (`ProjectLifecycleGenerator` + every hook that fires it on scope/spec/task CRUD) MUST NOT be modified. FR-001's before/after check is mandatory.
- **Per-project only — no aggregate rebuilt.** No platform-wide multi-project view is created; the wxKanban Development project's own per-project lifecycle doc serves the dogfood/dev overview.
- **Deleting live routes/UI — catch every reference.** Removal must clean the server route registration (`app.ts`), any stale mount in the dead `index2.ts`, and all client nav/route entries, then confirm `check-types` + build + start.
- **Two generator modules.** Both per-project generation paths (server `ProjectLifecycleGenerator` and the MCP-side generator) are preserved; the implementer confirms which fires on each CRUD event so no auto-update is lost.
- **No schema change.** Doctype `ProjectLifecycle` is unchanged; only the writer set shrinks to one.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`; the deletions remove fenced blocks (allowed) and add little/no new code.

### Out of Scope
- Rebuilding a platform-wide multi-project aggregate (explicitly per-project only).
- Any change to the per-project generator's content, format, or triggers (preserve only).
- A code-level mass backfill (see operational note — a one-time run, not a feature).

### Dependencies
- Spec 021 (project-lifecycle PDF — the per-project system being consolidated onto). CLAUDE.md (conventions rewrite).

### Notes
- **Operational follow-up after deploy:** run `npx tsx scripts/generate-project-lifecycle.ts --all` once to refresh any project whose `ProjectLifecycle` doc the legacy route had last overwritten with stale aggregate content. One-time hygiene, not part of the code change.
- **Provenance:** authored in-conversation via interactive buildscope (the orchestrator `buildscope` CLI is broken — standing workaround); implementation routes through `createSpecs` → `implement` per orchestrator-first.


---

## Amendment A (2026-06-14) — Corrected lifecycle architecture

The implementation pass found the original scope's model **inverted**. The Overview/Business-Problem/FR sections above call `ProjectLifecycleGenerator` (doctype `ProjectLifecycle`) "the per-project generator that auto-updates on scope/spec/task CRUD." **That is wrong.** This Amendment supersedes those sections wherever they conflict.

### Actual architecture — three paths, two doctypes

| Path | Doctype | Generated by | Fires on | Feeds / surface |
|---|---|---|---|---|
| **A** | `lifecycle` | **MCP server** — `generateProjectLifecycleMarkdown` + `pushLifecycleToDb` (`mcp-server/src/server.ts` ~1502 on `create_specs`, ~1911 on `implement`/task-sync), per project, DB-only | **scope/spec/task CRUD (auto)** | `projectdocuments` row (`doctype='lifecycle'`, `filepath='specs/projectlifecycle.md'`); fetched as `lifecycleDoc` in `ProjectWorkspacePage` (state + edit handler; not prominently rendered in the current tab) |
| **B** | `ProjectLifecycle` | server `ProjectLifecycleGenerator` (`src/server/services/...`) — markdown **+ PDF** (spec 021) | admin "regenerate" endpoint + manual `scripts/generate-project-lifecycle.ts` (NOT auto on CRUD) | project-details **Lifecycle tab** renders the **PDF** via `<iframe src="/api/projects/:id/lifecycle">`; Admin Dashboard per-project link |
| **C** | `ProjectLifecycle` | `GET /api/lifecycle` (`src/server/routes/lifecycle.ts`) — reads the **disk file** `specs/projectlifecycle.md`, upserts for "first project of company" | every page view that hits it | `LifecyclePage` (route `/admin/lifecycle`) and the **orphaned** `LifecyclePanel` |

**The auto-updating per-project lifecycle document you told me to preserve is Path A (MCP `doctype 'lifecycle'`), not Path B.** The real drift + clobber is **Path C**, which writes the **same doctype `ProjectLifecycle` as Path B**, overwriting B's accurate per-project PDF doc for an arbitrary "first project."

### Corrected scope

**RETIRE — Path C only:**
- `GET /api/lifecycle` + its handler (`src/server/routes/lifecycle.ts`) and route registration in `src/server/app.ts` (and any stale `index2.ts` mount).
- `LifecyclePage` (`src/client/pages/LifecyclePage.tsx`) + its route `/admin/lifecycle` in `App.tsx` + any nav link to it.
- `LifecyclePanel` (`src/client/components/Dashboard/LifecyclePanel.tsx`) — already orphaned (mounted nowhere).
- The disk file `specs/projectlifecycle.md` and `push-lifecycle.mjs`.

**PRESERVE — untouched (both are live and correct):**
- **Path A** — the MCP `doctype 'lifecycle'` generation on `create_specs`/`implement`. This is the auto-update invariant (supersedes FR-001's mis-named target).
- **Path B** — `ProjectLifecycleGenerator` + `GET /api/projects/:id/lifecycle` + `POST /api/admin/projects/:id/lifecycle/regenerate`. After Path C is gone, B is the **sole writer of `ProjectLifecycle`** (FR-002 still holds — the clobberer removed is C, not "the legacy route vs the per-project generator").

**FR-001 (corrected):** the untouchable invariant is **both** Path A (MCP `lifecycle`, auto on CRUD) **and** Path B (`ProjectLifecycle` PDF). Neither the MCP generator nor `ProjectLifecycleGenerator` is modified.

**FR-005 (corrected):** rewrite CLAUDE.md so the lifecycle conventions describe **Path A** (`doctype 'lifecycle'`, MCP-generated, auto-updated on scope/spec/task changes) as the per-project lifecycle document, and **Path B** as the on-demand/admin PDF (spec 021). Remove only the **Path C** instructions (hand-edit `specs/projectlifecycle.md` + run `push-lifecycle.mjs`). The existing `doctype 'lifecycle'` DB-sync note is closer to reality than the original FR-005 rewrite would have been — reconcile it to Path A, do not delete it.

### New out-of-scope follow-up (do NOT do here)
The project-details Lifecycle tab renders **Path B's PDF**, which is **only regenerated on admin/manual trigger** — so it can be **stale** relative to Path A's auto-updates. Pointing the tab at Path A, or auto-regenerating B on CRUD, is a **separate product decision** and is explicitly out of scope 048. Flag only.

### Net effect on the original FRs
- FR-002 stands (remove C → B is the sole `ProjectLifecycle` writer; the clobber is fixed).
- FR-003 stands, expanded: also remove the `/admin/lifecycle` route + nav link (not just the components).
- FR-004 stands (delete disk file + `push-lifecycle.mjs`).
- FR-001 + FR-005 are **superseded** by the corrected versions above.
- FR-006 stands (no dangling refs; builds/runs).
