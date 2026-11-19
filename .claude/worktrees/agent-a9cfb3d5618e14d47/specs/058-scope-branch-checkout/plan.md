# Plan: Scope Branch Check-out / Check-in

**Spec Number**: 058
**Scope**: SCOPE-058 (`specs/Project-Scope/058-BranchCheckinout.md`) — scope and spec share the number (renumbered from 049 on 2026-06-15)
**Date**: 2026-06-15
**Total Tasks**: 23 across 5 phases (see [tasks.md](tasks.md))

---

## Implementation Plan

### Phase 1 — DB Schema & Migration (T001–T002)

Add the two nullable claim columns (`claimedbyid` FK → `userprofiles.id` on-delete set null, `claimedat` timestamp) to `projectspecifications` in **both** Drizzle schema mirrors (app `src/db/schema/projectspecification.ts` and the MCP server schema) since they map to one physical table. Generate one migration via `npm run db:generate` and apply it with the established `pg.Client` + transaction pattern (drizzle-kit push needs a TTY here). No change to the lifecycle `status` enum. This phase blocks the MCP layer — the tools can't read/write columns that don't exist.

**Gate**: both columns exist on the shared Postgres `projectspecifications`; both schema mirrors compile; `npm run check-types` passes.

### Phase 2 — MCP Tools, Audit & cockpit_summary (T003–T008)

Add `project.checkout_scope` (claim + conflict detection + branch-name compute + consultant engagement guard + forced-override path) and `project.checkin_scope` (release + claimer/admin guard), modeled on `project.cockpit_summary` and reusing `assertCockpitScope` + the project-scoped query layer (claimer identity = `scope.userId`). Add audit actions `scope_checked_out` / `scope_checked_in` / `scope_checkout_forced`. Extend `cockpit_summary` + `cockpit-summary.ts` (`SpecRow`, `CockpitScopeDto`, `buildCockpitSummary`) with claim fields and register the new tool defs. This phase blocks the extension's data layer.

**Gate**: SC-3 — a two-identity contract test proves checkout claims a free scope, returns a conflict (no mutation) for an already-claimed scope, force re-claims with a distinct audit, check-in is claimer/admin-only, a consultant is limited to assigned scopes, and cross-project access is rejected.

### Phase 3 — Cockpit Actions, Visual State & Editor Read-only (T009–T014, T022–T023)

Add `checkoutScope`/`checkinScope` wrappers to the extension's MCP client; register the context-menu commands (`viewItem == wxkanban.scope`) and a guarded `child_process` spawn of `wxAIGit` (branch on checkout, merge on check-in) with a show/copy-the-command fallback when `wxAIGit` is absent; implement the conflict UX (holder warning → "check out anyway" → force); add a `FileDecorationProvider` for claimed-by-me / claimed-by-others / free; mirror the extended DTO into the extension's `types.ts`. The git spawn fires only on the explicit click. FR-008 (T022–T023) adds editor-level read-only: the extension manages `files.readonlyInclude`/`files.readonlyExclude` so a scope's spec docs are writable only when the developer holds the claim (soft, optimistic; new-scope authoring exempt).

**Gate**: SC-1 + SC-2 + SC-4 — right-click → Check out claims the scope, creates/switches to `scope/NNN-title` locally, and colors the node; a second identity sees "checked out by …"; Check in clears the flag and offers the merge; missing `wxAIGit` degrades to a shown/copied command.

### Phase 4 — Orchestrator Git-Hook Trap (T018–T021)

Install repo `post-checkout` / `post-merge` hooks (kit-distributed on init + accepted upgrade) that catch manual branching via `wxAIGit` **or** raw `git`: a `scope/NNN-*` checkout claims NNN (free → claim; collision → loud holder warning, proceed, no steal), a `scope/NNN-*` merge releases NNN. Best-effort and non-blocking — never break a developer's git operation. This closes the bypass where someone branches outside the Cockpit. Depends on the MCP tools (Phase 2).

**Gate**: a free `scope/NNN-*` branch created with raw `git` claims the scope in the DB; the same on an already-claimed scope warns + proceeds + does not steal; a merge releases it; MCP-unreachable does not block git.

### Phase 5 — Fencing, Tests & Docs (T015–T017)

Apply `[SCOPE 058 / Tnn]` fences across the new MCP handlers, extension code, **and the git hooks**, and extend `auditfences` coverage. Add the end-to-end two-identity integration test and the docs/CHANGELOG entry. (Runs last, after Phase 4 — task IDs T015–T017 predate the hook phase but the closeout covers all new code.)

**Gate**: `auditfences --strict` exits 0 for the new code; the two-identity integration test passes; `npm run check-types` passes.

---

## Critical Path

T001/T002 (claim columns) unlock the MCP tools (Phase 2), which unlock the extension's data layer (Phase 3). FR-004 (`cockpit_summary` claim fields, T006) gates the visual state (T013). Phase 4 closes out. The extension command/decoration scaffolding (T009–T010, T013) can begin against the extended DTO type before the live tools land, but cannot be verified until Phase 2 is deployed.

## Open Decisions Carried Into Implementation

- Decoration mechanism detail — `FileDecorationProvider` keyed by a synthetic `wxkanban-scope://` `resourceUri` vs. a `ThemeIcon` + colored `description` only; T013 picks the approach that best renders "color the line" in the tree.
- Consultant guard implementation — reuse the existing `engagementassignments` scope-grant check directly in the checkout handler vs. a shared helper; T003 decides.
- `wxAIGit` invocation surface — spawn the `wxAIGit` wrapper directly vs. the underlying `gitbranch.sh`/`gitmerge.sh`; T011 confirms the wrapper path is present on a consumer machine and sets the absent-fallback.
- `post-merge` source derivation — how the hook identifies *which* `scope/NNN-*` branch was merged (merge-commit second parent vs. `ORIG_HEAD` vs. reflog); T019 picks the reliable signal.
- Git-hook MCP auth surface — the hooks need the workspace token + projectId + `mcpBaseUrl`; T018/T020 decide whether to read `.wxai/project.json` / `.env` directly or shell a tiny kit helper.
