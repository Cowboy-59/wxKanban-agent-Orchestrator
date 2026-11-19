# Spec 058: Scope Branch Check-out / Check-in

**Spec Number**: 058
**Status**: `draft`
**Created**: 2026-06-15
**Last Reviewed**: 2026-06-15 (interactive buildscope — section-by-section, approved through all 10 sections)
**Depends On**: SCOPE-042 (VS Code Dev Cockpit — the surface this feature adds the check-out action to); SCOPE-037 (engagement/assignment model — the consultant check-out guard); the `wxAIGit` git wrapper (`_wxAI/rules/git.md`)
**Related Scopes**: SCOPE-047/SPEC-055 (stack-style — uses scope-level dev workflow); SCOPE-043 (user-feedback → scope seeds, which produce the scopes a dev would check out)
**Source**: `specs/Project-Scope/058-BranchCheckinout.md`

> **Numbering note:** this scope and its implementation spec deliberately **share the number 058** (a 1:1 scope→spec case, renumbered from the originally-assigned SCOPE-049 on 2026-06-15 so scope and spec align). The implementation spec folder is `specs/058-scope-branch-checkout/`. Note the unrelated `specs/049-wxperts-site-migration/` is a *different* SPEC-049 and is not connected to this feature.

---

## Overview

Give two or more developers on the same wxKanban project a way to **claim a scope** so they don't duplicate effort, and to create the matching git branch in one action. Git itself is optimistic and lockless — it provides **no** "who's working on what" signal; that coordination is a tracker concern, and wxKanban is the tracker.

The unit of work is the **scope** (`projectspecifications` row, shown as a scope card in the Dev Cockpit), not the individual task — a scope is "a feature branch's worth of work."

**The model (decided in planning):**
- A **shared claim flag** lives in the hosted DB / MCP so every developer's Cockpit sees it centrally — that is the collision-detection signal Git can't provide.
- The **git branch is created locally** by the Cockpit extension invoking **wxAIGit** (`wxAIGit branch --create scope/NNN-title`). A check-out click is an explicit user action, satisfying the "never invoke wxAIGit without explicit request" rule.
- **Check-out** = set claim flag + create/switch to the named branch.
- **Check-in** = release the claim flag + offer to merge the branch back (`wxAIGit merge`).
- Collisions **notify, they don't hard-block** (Git-style optimistic): if a scope is already checked out, the second dev is told who holds it and may proceed only with an explicit "check out anyway."

**Teaching intent (educational mission):** the feature must reinforce the *correct* Git mental model — a branch is the **whole repository under a new name**, not a partial fetch. "What's needed for the scope" is simply which files the dev then edits. The UI copy must not imply a partial checkout.

## Business Problem

When more than one developer works a project, nothing today tells dev B that dev A has already started a given scope. `projectspecifications` records `createdbyid` (who authored the scope) but has no "who is working it" field, the Cockpit shows no ownership, and there is no one-click path from "I'll take this" to "I have a branch for it." The result is silent duplicated effort and merge pain — exactly the coordination gap a task tracker exists to close. wxKanban should make claiming a scope and branching for it a single, visible, collision-aware action, taught as the on-ramp to a real Git branch/PR workflow.

## Actors

- **Primary:** a developer using the Dev Cockpit who wants to take a scope and start work on an isolated branch; a second developer who must see that the scope is already taken.
- **Secondary:** an **ADMIN** who can force a check-in (force-release another developer's stale claim — ADMIN-only); a **consultant working the project under an engagement** (SCOPE-037 engagement/assignment model) who checks out scopes they are assigned, subject to the same project-scoped claim rules; the `wxAIGit` wrapper that performs the local branch/merge; the hosted MCP server that holds the shared claim state.

## Success Metrics

1. **Visible ownership** — a scope checked out by dev A shows as claimed (holder name + lock styling) in dev B's Cockpit within one refresh.
2. **One-click checkout** — checking out a free scope claims it *and* creates/switches to `scope/NNN-title` locally in a single action; the branch exists in `git branch`.
3. **Collision is surfaced, not silent** — checking out an already-claimed scope notifies the second dev of the holder + timestamp and requires explicit confirmation to override.
4. **Clean round-trip** — check-in clears the flag and offers a `wxAIGit merge`; after merge the scope is free for the next phase.

## Scope Boundary

IN: two nullable claim columns on `projectspecifications`; MCP tools `project.checkout_scope` / `project.checkin_scope`; claim state added to `project.cockpit_summary`; Cockpit context-menu actions (check-out / check-in) that call MCP and spawn `wxAIGit` locally; conflict notification; visual "checked-out" styling on scope nodes; audit events for claim/release; **kit-installed `post-checkout` / `post-merge` git hooks that sync the claim on manual branch/merge (the no-bypass trap), best-effort and non-blocking, catching both `wxAIGit` and raw `git`; editor-level read-only on a scope's spec docs unless the current developer holds the claim (VS Code `files.readonly*`, soft).**

## Out of Scope

- Hard/pessimistic locking that blocks the holder's edits or scope-status advancement (this is an optimistic claim only). FR-008's editor read-only is a soft nudge, not this.
- Disk-level (`chmod`/`attrib`) read-only and commit-time (pre-commit) enforcement of FR-008 — FR-008 is **editor-level only** (`files.readonly*`); hard enforcement is a possible follow-up.
- Task-level checkout (scope-level only).
- Any change to the lifecycle **status** enum (claim is orthogonal to status).
- Branch protection, PR creation, or remote-merge automation beyond invoking `wxAIGit merge` locally.
- Auto-expiry / TTL on stale claims (manual + admin force-release only; TTL is a possible follow-up).
- Changing PM-sync behavior (claim fields are wxKanban-local and untouched by sync).

## Open Questions

1. ~~Should a force-override on an existing claim be allowed to **any** developer or restricted to ADMIN/TEAM_MANAGER?~~ **RESOLVED 2026-06-15** — any developer may force-override an existing claim (with an explicit "check out anyway" confirmation). A forced override MUST be logged as a distinct audited event recording **who forced it** and **the prior holder it displaced** (plus the scope and timestamp). This applies to **check-out** only. For **check-in**: a developer may release only their **own** claim; a **forced check-in** (releasing *another* developer's claim) is **ADMIN-only** — a TEAM_MANAGER may not force a check-in (FR-003).
2. ~~Branch slug source — kebab of the scope title vs a fixed `scope/NNN` only.~~ **RESOLVED 2026-06-15** — `scope/NNN-kebab-title` (e.g. `scope/058-branch-checkinout`); self-describing in `git branch` output.

## Functional Requirements

### FR-001 — Claim columns on scopes

`projectspecifications` MUST gain two nullable columns: `claimedbyid` (FK → `userprofiles.id`, `onDelete: set null`) and `claimedat` (timestamp). Added to **both** Drizzle schema mirrors (app `src/db/schema/projectspecification.ts` and the MCP server schema) since they map to one physical table; one generated migration.

**Acceptance Criteria**:
- [ ] Both columns exist on `projectspecifications` and are nullable
- [ ] Both schema mirrors compile against the new columns
- [ ] No change to the lifecycle `status` enum

### FR-002 — Check-out tool (claim + conflict detection)

A `project.checkout_scope` MCP tool MUST claim a scope for the calling developer and detect collisions. Input `{ projectId, specNumber, force? }`. **Single-member short-circuit:** if the caller's company has only one member, coordination is unnecessary — check-out MUST skip writing the claim (and skip conflict/audit) and simply return the branch name. Otherwise: if the scope is already claimed by another user and `force` is not set, it MUST return a **conflict** result naming the current holder and `claimedat` (not throw); else it sets `claimedbyid` = caller, `claimedat` = now, and returns the computed branch name `scope/<NNN>-<kebab-title>`. A **consultant** caller MUST be limited to scopes their engagement is assigned (SCOPE-037 `engagementassignments`, active engagement, not removed). Project-scoped via the existing `selectScoped`/`updateScoped` + `assertCockpitScope` pattern.

**Acceptance Criteria**:
- [ ] Free scope → claimed by caller; branch name returned; audit `scope_checked_out` written
- [ ] Already-claimed-by-other (no force) → conflict result with holder name + timestamp, no mutation
- [ ] `force: true` → re-claims and writes a distinct override audit event recording the forcing user, the displaced prior holder, the scope, and the timestamp
- [ ] A consultant caller can check out only scopes their engagement is assigned (SCOPE-037 grant)
- [ ] In a single-member company, check-out is a no-op that still returns the branch name (no claim written, no conflict)
- [ ] Cross-project / mismatched projectId is rejected by the scope guard

### FR-003 — Check-in tool (release + claimer/admin guard)

A `project.checkin_scope` MCP tool MUST clear `claimedbyid`/`claimedat`. A developer may release only their **own** claim. A **forced check-in** — releasing *another* developer's claim — is **ADMIN-only**; a TEAM_MANAGER may NOT force a check-in. Any other caller gets a conflict result. Emits audit `scope_checked_in`; a forced (ADMIN) release records the ADMIN actor and the displaced prior holder.

**Acceptance Criteria**:
- [ ] Claimer can release their own claim; columns cleared; audit written
- [ ] A non-claimer who is not an ADMIN (including a TEAM_MANAGER) cannot release another's claim (conflict result, no mutation)
- [ ] An ADMIN can force a check-in (force-release another developer's claim); the audit records the ADMIN actor and the displaced holder
- [ ] In a single-member company, check-in is a no-op (nothing to release)

### FR-004 — Surface claim state in `cockpit_summary`

`project.cockpit_summary` MUST include per-scope claim state so the Cockpit can render it. `CockpitScopeDto` gains `claimedBy: { userId, name } | null` and `claimedAt: string | null`; the scoped select and `buildCockpitSummary` carry the new fields (mirror the DTO into the extension's `types.ts`).

**Acceptance Criteria**:
- [ ] Response includes `claimedBy` / `claimedAt` for each scope
- [ ] Holder display name resolved via `userprofiles`
- [ ] Existing `cockpit-summary` tests extended for the new fields

### FR-005 — Cockpit check-out / check-in actions

The Dev Cockpit MUST offer **Check out** and **Check in** as `view/item/context` actions on scope nodes (`viewItem == wxkanban.scope`). Check out calls `project.checkout_scope`; on conflict it shows a warning with the holder + a "Check out anyway" choice (re-calls with `force`); on success it spawns `wxAIGit branch --create <branchName>` (create + switch) locally via `child_process`, then refreshes the tree. Check in calls `project.checkin_scope`, then prompts to merge via `wxAIGit merge --source-branch <branch>`. If the `wxAIGit` wrapper is not found, the extension MUST fall back to displaying/copying the exact command rather than failing silently.

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

The kit MUST install repository git hooks so the DB claim stays in sync with the actual branches even when a developer operates git **manually** — via `wxAIGit` **or** raw `git` — so the claim cannot be bypassed by branching outside the Cockpit:

- **`post-checkout`** — when the checked-out/created branch matches `scope/<NNN>-*`, the hook calls `project.checkout_scope` for NNN as the current developer. A free scope is claimed. If NNN is **already claimed by another developer**, the hook MUST print a **loud warning** naming the holder (e.g. "⚠ scope NNN is checked out by <holder> — you may be duplicating effort") and **allow** the operation to proceed, **without stealing** the existing claim (forcing remains a deliberate Cockpit/ADMIN action, FR-002/FR-003).
- **`post-merge`** — when a `scope/<NNN>-*` branch is merged into the integration branch, the hook calls `project.checkin_scope` to release NNN.
- Hooks MUST be **best-effort and non-blocking**: a hook failure or unreachable MCP MUST NOT break the developer's git operation (warn, exit 0). A non-`scope/*` branch is a no-op.
- The kit installs/updates these hooks on **init and accepted upgrade** (the same distribution path as the SCOPE-042 Cockpit extension), wiring the workspace token + projectId + `mcpBaseUrl`.

**Acceptance Criteria**:
- [ ] Creating/switching to a free `scope/NNN-*` branch — via `wxAIGit` OR raw `git` — claims NNN in the DB
- [ ] Doing so on a scope already claimed by another developer prints a loud holder-naming warning, proceeds, and does NOT change the existing claim
- [ ] Merging a `scope/NNN-*` branch releases the claim
- [ ] A non-scope branch is a no-op; an unreachable MCP does not block the git operation
- [ ] The hooks are installed by kit init and refreshed on accepted upgrade

### FR-008 — Spec docs read-only unless checked out (editor-level)

The Cockpit MUST mark a scope's spec/scope markdown **read-only in the editor** unless the current developer holds that scope's claim, so two developers don't edit the same scope's docs at once. This uses VS Code's `files.readonlyInclude` / `files.readonlyExclude` settings (managed by the extension), refreshed live on check-out / check-in. It is an **editor-level nudge consistent with the optimistic model** — NOT a disk permission and NOT a commit gate (those are a possible follow-up, FR-008 is level "editor only").

- A held scope's docs are writable; the docs of scopes the developer does not hold are read-only in the editor.
- The mapping is by scope number: holding scope `NNN` makes `specs/<NNN>-*/**/*.md` and `specs/Project-Scope/<NNN>-*.md` writable. (For the dual SCOPE/SPEC namespace, the held `projectspecifications.specnumber` maps to the matching spec folder + Project-Scope file.)
- **New-scope authoring MUST remain writable** — `buildscope`/`createspecs` writing docs for scopes that don't exist yet (and so can't be "checked out") is exempt; the rule applies only to existing scopes' docs.

**Acceptance Criteria**:
- [ ] When the developer holds scope NNN, its spec/scope docs are editable; the spec docs of scopes they don't hold are read-only in the editor
- [ ] The read-only state updates live on check-out / check-in
- [ ] It is editor-level only — no disk `chmod`/`attrib`, no commit block (optimistic model preserved)
- [ ] Authoring a brand-new scope (buildscope/createspecs) is not blocked

---

## Technical Sections

### Data / Schema
- Add `claimedbyid uuid` (FK `userprofiles.id`, `set null`) and `claimedat timestamp`, both nullable, to `projectspecifications` in **both** schema mirrors. Generate via `npm run db:generate`; apply via the established `pg.Client` + transaction pattern (drizzle-kit push needs a TTY here). No enum/status change.

### API / MCP Tools (`mcp-server/src/server.ts`)
- **Add:** `project.checkout_scope`, `project.checkin_scope` (project-scoped handlers modeled on `project.cockpit_summary` ~line 1219; reuse `assertCockpitScope`, `scoped.selectScoped/updateScoped`; claimer identity = `scope.userId`). Register defs in the `LIST_TOOLS` block.
- **Extend:** `project.cockpit_summary` + `mcp-server/src/utils/cockpit-summary.ts` (`SpecRow`, `CockpitScopeDto`, `buildCockpitSummary`) for claim fields.
- **Audit:** new actions `scope_checked_out` / `scope_checked_in`, plus a distinct `scope_checkout_forced` for overrides (carrying forcing user + displaced prior holder in the audit detail) — server `AuditService` + MCP-side event insert.

### Frontend / Extension (`vscode-extension/`)
- `services/mcpClient.ts` — `checkoutScope()` / `checkinScope()` wrappers over `callTool`.
- `extension.ts` + `package.json` — register `wxkanban.cockpit.checkoutScope` / `.checkinScope` as scope context-menu commands; add a guarded `child_process` spawn of `wxAIGit`.
- `providers/cockpitTreeProvider.ts` (`scopeNode()` ~line 250) + a new `FileDecorationProvider` — render claim state.
- `types.ts` — mirror the extended `CockpitScopeDto`.
- FR-008 read-only: the extension manages workspace `files.readonlyInclude` (`specs/**/*.md`) + `files.readonlyExclude` (the held scopes' doc paths), recomputed on every check-out/check-in and on cockpit refresh. Editor-level only — no disk or commit changes.

### Git hooks (the no-bypass trap) — kit distribution
- A `post-checkout` and a `post-merge` hook, installed into the repo by the kit on init + accepted upgrade (mirror the SCOPE-042 Cockpit-extension install path). They parse the branch name; for `scope/<NNN>-*` they call `project.checkout_scope` (post-checkout) / `project.checkin_scope` (post-merge) using the workspace token + projectId + `mcpBaseUrl`. Best-effort: any failure warns and exits 0 so git is never blocked. `post-merge` derives the merged source branch from the merge commit / `ORIG_HEAD` / reflog.

### Preserved / untouched
- PM sync (`pmSyncService`) — claim columns are wxKanban-local; inbound sync only overwrites name/description/status/priority/duedate.
- Lifecycle `status` enum and the lifecycle generators (SCOPE-048).

---

## Constraints & Notes

### Constraints
- **Optimistic, not pessimistic** — a claim is a signal, never a hard lock on edits or status changes. Collisions notify + allow explicit override.
- **Git rule compliance** — all git operations go through `wxAIGit`, only on the explicit check-out/check-in click; never proactive. The extension must degrade to showing the command if `wxAIGit` is absent.
- **Correct branch mental model** — UI copy MUST NOT imply a partial-repo checkout; a branch is the whole repo under a new name.
- **Git-hook trap is best-effort and never blocks git** — the `post-checkout`/`post-merge` hooks sync the claim and warn on collision, but a hook failure or unreachable MCP must never break a developer's git operation. They catch both `wxAIGit` and raw `git`, and they NEVER steal an existing claim (forcing stays a deliberate Cockpit/ADMIN action).
- **Single-member companies skip the claim** — when the caller's company has only one member there is no one to coordinate with, so check-out/check-in are no-ops (check-out still returns the branch name so branching works). The claim is only meaningful with 2+ developers; this is checked before any claim is written or forced.
- **Two schema mirrors, one table** — app + MCP schema must agree; single migration applied to the shared Postgres.
- **Scope isolation** — all DB reads/writes via the project-scoped query layer; honor the customer-vs-project scope-leak guard (`assertCockpitScope`).
- **Orchestrator-first** — implement via `createSpecs` → `implement`; fences written by the orchestrator only.

### Dependencies
- SCOPE-042 (Dev Cockpit) for the surface; `wxAIGit` wrapper for branch/merge; `userprofiles` for holder names.

### Notes
- **Provenance:** authored in-conversation from a planning discussion on check-in/check-out; pending interactive `buildscope` section-by-section review before implementation.
- **Possible follow-up (flagged, not in scope):** auto-expiry/TTL on stale claims; auto-release on scope phase advance; PR/remote-merge automation.
