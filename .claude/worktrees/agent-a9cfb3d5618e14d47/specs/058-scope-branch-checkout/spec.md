# Spec 058: Scope Branch Check-out / Check-in

## Overview

A per-project capability for developers to **claim a scope** (check it out) so collaborators don't duplicate effort, and to create the matching git branch in one action. The claim is a **shared, optimistic signal** stored in the hosted DB/MCP — every developer's Dev Cockpit reads it, so a collision is visible centrally. Git itself is lockless and has no "who's working on what" signal; that coordination is a tracker concern, and wxKanban is the tracker.

The unit of work is the **scope** (a `projectspecifications` row, shown as a scope card in the Dev Cockpit), not the individual task. Check-out sets the claim flag **and** invokes `wxAIGit` locally to create/switch to a branch named `scope/NNN-kebab-title`; a check-out click is the explicit user action `wxAIGit` requires. Check-in releases the claim **and** offers to merge the branch back via `wxAIGit merge`. Collisions **notify, they don't hard-block**: a second developer is told who holds the scope and may proceed only with an explicit "check out anyway," which is separately audited.

This spec implements the base capability of **SCOPE-058** (`specs/Project-Scope/058-BranchCheckinout.md` — scope and spec deliberately share the number, renumbered from 049 on 2026-06-15), reviewed section-by-section via interactive buildscope on 2026-06-15. It builds on **SCOPE-042** (the Dev Cockpit surface) and reuses the **SCOPE-037** engagement/assignment model for the consultant guard.

## Business Problem

When more than one developer works a project, nothing today tells developer B that developer A has already started a given scope. `projectspecifications` records `createdbyid` (who authored the scope) but has no "who is working it" field; the Cockpit shows no ownership; and there is no one-click path from "I'll take this" to "I have a branch for it." The result is silent duplicated effort and avoidable merge pain — exactly the coordination gap a task tracker exists to close. wxKanban should make claiming a scope and branching for it a single, visible, collision-aware action, taught as the on-ramp to a real Git branch/PR workflow. The feature must reinforce the correct Git mental model — a branch is the whole repository under a new name, not a partial fetch.

## Actors

- Primary: a developer using the Dev Cockpit who wants to take a scope and start work on an isolated branch; a second developer who must see that the scope is already taken (and by whom).
- Secondary: an **ADMIN** who can force a check-in (force-release another developer's stale claim — ADMIN-only); a **consultant working the project under a SCOPE-037 engagement**, who may check out only scopes their engagement is assigned, subject to the same project-scoped claim rules; the **`wxAIGit` wrapper** (performs the local branch/merge — **kit-provided per Amendment B / FR-009–FR-010**, not a pre-existing tool); the **hosted MCP server** (holds the shared claim state all developers read).

## Success Metrics

1. Visible ownership — a scope checked out by developer A shows as claimed (holder name + lock styling) in developer B's Cockpit within one refresh. *(criterion 1)*
2. One-click checkout — checking out a free scope claims it and creates/switches to `scope/NNN-title` locally in a single action; the branch appears in `git branch`. *(criterion 2)*
3. Collision is surfaced, not silent — checking out an already-claimed scope notifies the second developer of the holder plus timestamp and requires explicit confirmation to override. *(criterion 3)*
4. Clean round-trip — check-in clears the flag and offers a `wxAIGit merge`; after merge the scope is free for the next phase. *(criterion 4)*

## Scope Boundary

IN: two nullable claim columns on `projectspecifications` (`claimedbyid`, `claimedat`); MCP tools `project.checkout_scope` and `project.checkin_scope`; claim state added to `project.cockpit_summary`; Cockpit context-menu actions (Check out / Check in) that call MCP and spawn `wxAIGit` locally; collision notification with holder + timestamp and the explicit "check out anyway" override path; visual "checked-out" styling on scope nodes (lock badge + holder name + color); audit events for claim, release, and forced override; the consultant guard limiting check-out to engagement-assigned scopes; kit-installed `post-checkout` / `post-merge` git hooks that sync the claim on manual branch/merge (the no-bypass trap), best-effort and non-blocking, catching both `wxAIGit` and raw `git`; editor-level read-only on a scope's spec docs unless the current developer holds the claim (VS Code `files.readonly*`, soft).

## Out of Scope

Hard/pessimistic locking that blocks the holder's edits or scope-status advancement (this is an optimistic claim only); task-level checkout (scope-level only); any change to the lifecycle status enum (claim is orthogonal to status); branch protection, PR creation, or remote-merge automation beyond invoking `wxAIGit merge` locally; auto-expiry / TTL on stale claims (manual + admin force-release only — a possible follow-up); any change to PM-sync behavior (claim fields are wxKanban-local and untouched by sync).

## Open Questions

None at this time. Both scope-review questions were resolved during interactive buildscope on 2026-06-15 and recorded in `specs/Project-Scope/058-BranchCheckinout.md`: (1) any developer may force-override a check-out with explicit confirmation, audited as a distinct event capturing who forced it and the displaced prior holder — a developer may release only their own claim, and a forced check-in (releasing another's claim) is ADMIN-only (a TEAM_MANAGER may not force a check-in); (2) branch slug is `scope/NNN-kebab-title`.

## Amendment B — `wxAIGit` is kit-provided, not pre-existing (2026-06-17)

During SPEC-058 manual testing the git half of the feature was found to never run. The base spec treated `wxAIGit` as a pre-existing wrapper that already performed branch/merge (FR-005, FR-007, and the secondary-actor list). In fact the repo's `wxAIGit.cmd` is orphaned — it dispatches to `_wxAI-global/scripts/wxAIGit/scripts/git*.sh`, a path present in no project — normal projects carry no `wxAIGit.cmd` at all, and the real distributed git tool (`gitpro`) has **no branch operation**. So `wxAIGit branch --create` / `wxAIGit merge` never executed: the claim was written but the branch was never created, and the user got a "copy this command" message for a command that would itself fail. FR-005's one-click-checkout-creates-the-branch metric was therefore unmet on every install.

Decisions (interactive buildscope, 2026-06-17): (1) **build out `wxAIGit`** as a real tool rather than re-point callers at `gitpro`; (2) **cross-platform** — ship a Windows `.cmd` launcher and a POSIX shell launcher; (3) **branch + merge only** (KISS) — not the full checkpoint/commit/sync/push/pull/stash suite the orphaned stub advertised; (4) the **kit distributes** it per-project on init + accepted upgrade, the same path that ships the FR-007 hooks. This amendment adds FR-009 (the tool) and FR-010 (its distribution); the base FR-005/FR-007 contracts are unchanged — they simply now resolve a tool that exists.

## Amendment C — Checkout holder on the web Kanban card (2026-10-10)

Customer feedback 6290202f ("each card gives some information but the name of the user is missing"): a team converting WinDev windows checks scopes out from the Dev Cockpit, but the web app's scope Kanban board shows no person on any card. The claim is stored (`claimedbyid`/`claimedat`, FR-001) and the Cockpit tree shows it (FR-006), but the web scope listing never selects it, so anyone looking at the board cannot see who is working which window. The scope's author (`createdbyid`) is not a substitute: scopes created through MCP leave it null (all 33 scopes in the reporting project). Decision (2026-10-10): the web scope card shows the **checkout holder**. This amendment adds FR-011; FR-001–FR-010 are unchanged.

## Functional Requirements

### FR-001 — Claim columns on scopes

`projectspecifications` MUST gain two nullable columns: `claimedbyid` (FK → `userprofiles.id`, on-delete set null) and `claimedat` (timestamp). They MUST be added to **both** Drizzle schema mirrors (app `src/db/schema/projectspecification.ts` and the MCP server schema) since they map to one physical table; one generated migration. No change to the lifecycle `status` enum.

**Acceptance Criteria**:
- [ ] Both columns exist on `projectspecifications` and are nullable
- [ ] Both schema mirrors compile against the new columns
- [ ] No change to the lifecycle `status` enum

### FR-002 — Check-out tool (claim + conflict detection)

A `project.checkout_scope` MCP tool MUST claim a scope for the calling developer and detect collisions. Input `{ projectId, specNumber, force? }`. A free scope is claimed (`claimedbyid` = caller, `claimedat` = now), returning the branch name `scope/<NNN>-<kebab-title>` and auditing `scope_checked_out`. An already-claimed-by-other scope without `force` MUST return a **conflict** result naming the current holder and `claimedat` (no mutation, no throw). `force: true` MUST re-claim and write a distinct `scope_checkout_forced` audit event capturing the forcing user, the displaced prior holder, the scope, and the timestamp. Project-scoped via the existing `selectScoped`/`assertCockpitScope` pattern; consultant callers limited to engagement-assigned scopes.

**Acceptance Criteria**:
- [ ] Free scope → claimed by caller; branch name returned; audit `scope_checked_out` written
- [ ] Already-claimed-by-other (no force) → conflict result with holder name + timestamp, no mutation
- [ ] `force: true` → re-claims and writes a distinct override audit event recording the forcing user, the displaced prior holder, the scope, and the timestamp
- [ ] A consultant caller can check out only scopes their engagement is assigned
- [ ] In a single-member company, check-out is a no-op that still returns the branch name (no claim written, no conflict)
- [ ] Cross-project / mismatched projectId is rejected by the scope guard

> **Single-member short-circuit:** when the caller's company has only one member, coordination is unnecessary — `checkout_scope` MUST skip the claim/conflict/audit and simply return the branch name. Checked before any claim is written or forced.

### FR-003 — Check-in tool (release + guard)

A `project.checkin_scope` MCP tool MUST clear `claimedbyid`/`claimedat`. A developer may release only their **own** claim. A **forced check-in** — releasing *another* developer's claim — is **ADMIN-only**; a TEAM_MANAGER may NOT force a check-in. Any other caller gets a conflict result. Emits audit `scope_checked_in`; a forced (ADMIN) release records the ADMIN actor and the displaced prior holder. In a single-member company, check-in is a no-op (nothing to release).

**Acceptance Criteria**:
- [ ] Claimer can release their own claim; columns cleared; audit written
- [ ] A non-claimer who is not an ADMIN (including a TEAM_MANAGER) cannot release another's claim (conflict result, no mutation)
- [ ] An ADMIN can force a check-in (force-release another developer's claim); the audit records the ADMIN actor and the displaced holder
- [ ] In a single-member company, check-in is a no-op (nothing to release)

### FR-004 — Surface claim state in `cockpit_summary`

`project.cockpit_summary` MUST include per-scope claim state. `CockpitScopeDto` gains `claimedBy: { userId, name } | null` and `claimedAt: string | null`; the scoped select and `buildCockpitSummary` carry the new fields; the holder display name is resolved via `userprofiles`; mirror the DTO into the extension's `types.ts`.

**Acceptance Criteria**:
- [ ] Response includes `claimedBy` / `claimedAt` for each scope
- [ ] Holder display name resolved via `userprofiles`
- [ ] Existing `cockpit-summary` tests extended for the new fields

### FR-005 — Cockpit check-out / check-in actions

The Dev Cockpit MUST offer **Check out** and **Check in** as `view/item/context` actions on scope nodes (`viewItem == wxkanban.scope`). Check out calls `project.checkout_scope`; on conflict it shows a warning with the holder and a "Check out anyway" choice (re-calls with `force`); on success it spawns `wxAIGit branch --create <branchName>` (create + switch) locally via `child_process`, then refreshes the tree. Check in calls `project.checkin_scope`, then prompts to merge via `wxAIGit merge --source-branch <branch>`. If the `wxAIGit` wrapper is not found, the extension MUST fall back to displaying/copying the exact command rather than failing silently. The git spawn occurs only on the explicit user action.

**Acceptance Criteria**:
- [ ] Right-click scope → Check out → claim set + `scope/NNN-…` branch created/switched locally
- [ ] Conflict → warning names the holder; proceeding requires explicit "Check out anyway"
- [ ] Check in → claim cleared + merge offered
- [ ] Missing `wxAIGit` → command shown/copied, no unhandled error
- [ ] Git spawn occurs only on the explicit user action (rule-compliant)

### FR-006 — Visual checked-out state

Scope nodes MUST visibly indicate claim state ("color the line"): a `FileDecorationProvider` keyed by a synthetic `resourceUri` (e.g. `wxkanban-scope://<specNumber>`) distinguishing claimed-by-me / claimed-by-others / free, plus a lock badge and a `description` such as `🔒 <name>`, driven by the new `claimedBy` field.

**Acceptance Criteria**:
- [ ] Claimed scopes are visually distinct from free scopes
- [ ] Claimed-by-me vs claimed-by-others are distinguishable
- [ ] State updates on tree refresh after check-out / check-in

### FR-007 — Orchestrator git-hook trap (no bypass)

The kit MUST install repository git hooks so the DB claim stays in sync with the actual branches even when a developer operates git **manually** — via `wxAIGit` **or** raw `git` — so the claim cannot be bypassed by branching outside the Cockpit. A `post-checkout` hook, when the checked-out/created branch matches `scope/<NNN>-*`, calls `project.checkout_scope` for NNN as the current developer (free → claimed; already-claimed-by-other → a **loud holder-naming warning**, the operation **proceeds**, and the existing claim is **NOT stolen** — forcing stays a deliberate Cockpit/ADMIN action). A `post-merge` hook, when a `scope/<NNN>-*` branch is merged into the integration branch, calls `project.checkin_scope` to release NNN. Hooks MUST be best-effort and non-blocking (a failure or unreachable MCP warns and exits 0; a non-`scope/*` branch is a no-op). The kit installs/updates the hooks on init and accepted upgrade (the SCOPE-042 Cockpit-extension distribution path), wiring the workspace token + projectId + `mcpBaseUrl`.

**Acceptance Criteria**:
- [ ] Creating/switching to a free `scope/NNN-*` branch (via `wxAIGit` OR raw `git`) claims NNN in the DB
- [ ] Doing so on a scope already claimed by another developer prints a loud holder-naming warning, proceeds, and does NOT change the existing claim
- [ ] Merging a `scope/NNN-*` branch releases the claim
- [ ] A non-scope branch is a no-op; an unreachable MCP does not block the git operation
- [ ] The hooks are installed by kit init and refreshed on accepted upgrade

### FR-008 — Spec docs read-only unless checked out (editor-level)

The Cockpit MUST mark a scope's spec/scope markdown **read-only in the editor** unless the current developer holds that scope's claim, via VS Code's `files.readonlyInclude` / `files.readonlyExclude` settings (managed by the extension), refreshed live on check-out / check-in. This is an **editor-level nudge consistent with the optimistic model** — not a disk permission and not a commit gate. Mapping is by scope number: holding `NNN` makes `specs/<NNN>-*/**/*.md` and `specs/Project-Scope/<NNN>-*.md` writable; all other spec docs are read-only. **Authoring a brand-new scope (`buildscope`/`createspecs`) MUST remain writable** — the rule applies only to existing scopes' docs.

**Acceptance Criteria**:
- [ ] When the developer holds scope NNN, its spec/scope docs are editable; docs of scopes they don't hold are read-only in the editor
- [ ] The read-only state updates live on check-out / check-in
- [ ] Editor-level only — no disk `chmod`/`attrib`, no commit block (optimistic model preserved)
- [ ] Authoring a brand-new scope is not blocked

### FR-009 — Real `wxAIGit` scope-branch CLI (Amendment B)

A working `wxAIGit` MUST provide exactly two subcommands needed by SPEC-058: `branch --create <name>` (create the branch if absent, then switch to it) and `merge --source-branch <branch>` (merge a `scope/*` branch back into the integration branch, mirroring `gitpro-merge` semantics). Two launchers MUST ship: `wxAIGit.cmd` (Windows, invoking Git-Bash as the current stub does) and a POSIX `wxAIGit` shell launcher (macOS/Linux). Both MUST resolve their backing scripts relative to the launcher's own location, from scripts **bundled alongside the launcher** — never the dead global `_wxAI-global/scripts/wxAIGit/...` path. The orphaned launcher and dead path are replaced. `gitpro` is untouched and keeps owning commit/checkpoint/sync; `wxAIGit` owns the scope-branch lifecycle. Subcommands beyond `branch --create` and `merge` are explicitly out of scope for this amendment.

**Acceptance Criteria**:
- [ ] `wxAIGit branch --create scope/NNN-x` creates the branch (if absent) and switches to it; it appears in `git branch`
- [ ] `wxAIGit merge --source-branch scope/NNN-x` merges that branch into the integration branch
- [ ] Both launchers (`.cmd` + POSIX) work — Windows via Git-Bash, macOS/Linux via shell
- [ ] Run from a project root, the launcher resolves its bundled scripts with no "Script not found"
- [ ] Only `branch --create` and `merge` are implemented; other subcommands are absent/declared unsupported

### FR-010 — Kit distribution of `wxAIGit` (Amendment B)

The kit MUST install/update the `wxAIGit` launchers + backing scripts into each project on init and on accepted upgrade — the same `KitGenerationService` delivery path that ships the FR-007 `post-checkout`/`post-merge` hooks. A freshly installed or upgraded project therefore has a working `wxAIGit`, so the Cockpit check-out (FR-005) actually creates/switches the branch instead of hitting the "not found" fallback; that fallback then fires only in a genuinely broken or missing install.

**Acceptance Criteria**:
- [ ] A fresh kit init lands the `wxAIGit` launchers + backing scripts in the project
- [ ] An accepted kit upgrade installs/refreshes them (mirrors the FR-007 hook + SCOPE-042 extension distribution)
- [ ] On such a project, Cockpit check-out creates/switches the `scope/NNN-…` branch end-to-end
- [ ] The FR-005 "missing `wxAIGit`" fallback no longer triggers on a normal install

> **Delivery note (2026-06-17):** prod serves kits from the GitHub **orchestrator release** (`KIT_DOWNLOAD_SOURCE=orchestrator` → `KitProxyService`), not from `KitGenerationService`. The real delivery is therefore the orchestrator's `build-release` bundle: the launchers were added to `KIT_INCLUDE_FILES` and the backing scripts ride `scripts/` (already in `KIT_INCLUDE_DIRS`). Shipped in **kit v1.6.0** (orchestrator release) carrying `wxAIGit`/`wxAIGit.cmd` + `scripts/wxaigit/` + cockpit `0.2.0`. The `KitGenerationService.loadWxAIGitFiles` change remains for the legacy (flag-off) path. **Known gap:** the FR-007 `post-checkout`/`post-merge` hooks + `wxkanban-scope-hook.mjs` are likewise NOT yet in the orchestrator bundle (same legacy-path issue) — tracked as a follow-up so the no-bypass trap ships to consumers too.

### FR-011 — Checkout holder on the web scope card (Amendment C)

The web app's scope listing (`ScopeService.getScopes` / `getScope`, served to the project workspace Kanban board) MUST return each scope's claim state — `claimedbyid`, `claimedat`, and the holder's display name resolved via `userprofiles.fullname` — and the scope Kanban card MUST show the holder (lock icon + name) on every claimed scope, with the check-out time available on hover. A free scope shows no holder line. Read-only: the board does not check out or check in.

**Acceptance Criteria**:
- [x] The scope listing returns `claimedbyid`, `claimedbyname`, `claimedat` for every scope (null when free)
- [x] A claimed scope's card shows a lock icon and the holder's name; hovering shows when it was checked out
- [x] A free scope's card shows no holder line
- [x] A check-out or check-in made in the Cockpit appears on the board after a reload

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-06-15
- **Phase**: design
