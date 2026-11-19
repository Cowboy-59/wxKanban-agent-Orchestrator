# SCOPE-091: Cockpit Tree — Grouped Headers (Unfinished Scopes + Commits to Push)

**Scope Number**: SCOPE-091
**Status**: `draft`
**Created**: 2026-07-06
**Last Reviewed**: 2026-07-06 (authored in-conversation, section-by-section; decisions: unpushed count + list only, "Git —" label, cap 10 with "…and N more", read-only; broadened to also group unfinished scopes under a collapsed "<nn> Scopes unfinished" header)
**Depends On**: SCOPE-042 (Dev Cockpit tree + local-section pattern — `cockpitTreeProvider`, `withXxxSection`, poll refresh), SCOPE-019/R15 (local Kit-update section — the closest sibling: a cheap local check rendered as its own Cockpit section).
**Related Scopes**: Mirrors the existing **local** Cockpit sections (`commandsInstall` "Install slash commands", `kitUpdate` "Kit update available") — computed locally, independent of the hosted MCP `cockpit_summary`. This adds a third local section for git push state.
**Source**: `specs/Project-Scope/091-cockpit-commits-to-push.md`

---

## Overview

A developer cannot tell from the Dev Cockpit that they have local commits which have not been deployed. App Runner builds/deploys the app (and MCP) only on a push to `main`, so committed-but-unpushed work is invisible in production, and nothing in the IDE signals that a push is pending. This caused live confusion on 2026-07-06: production reported the expected version number (1.5.205), but localization changes were absent because three SPEC-052 commits were sitting unpushed — with no surface anywhere in the Cockpit indicating that unshipped work existed.

This scope adds a local, read-only Cockpit section that shows how many commits are ahead of `origin` (unpushed) and lists their subject lines, so "you have work that hasn't shipped yet" is visible at a glance. It follows the exact pattern of the existing local Cockpit sections (Kit-update, Install-commands): a cheap local check, rendered as its own collapsible group, refreshed on the Cockpit's normal poll cycle, and silent when there is nothing to show.

The same "grouped header" idea also cleans up the tree's existing scope rows. Today the unfinished scopes render flat at the tree root; this scope moves them under a single collapsible header, `<nn> Scopes unfinished` (nn = count of scopes with remaining work), collapsed by default — so the root is tidier and the remaining-work count is a glance away. Together the two changes give the Cockpit root a consistent set of counted, collapsible group headers.

## Business Problem

The team's deploy model is push-to-deploy on `main`, and the standing rule is that commits accrue locally until the developer explicitly pushes. That is deliberate — but it means the gap between "committed" and "deployed" is real and routinely non-empty, and the Cockpit gives no indication of it. A developer (or the AI assisting them) can look at the running version, see it matches, and wrongly conclude their changes are live. The only current way to know is to run `git log origin/main..main` by hand. A passive, always-visible indicator removes that trap: the moment there are unpushed commits, the Cockpit says so and names them, and its tooltip states the consequence (these deploy only after a push to `main`).

### Core Design

| Element | Cockpit "Commits to Push" Indicator |
| --- | --- |
| **Primary Actor** | A developer working in VS Code with the wxKanban Dev Cockpit open, who needs to know whether local commits have been pushed/deployed |
| **Secondary Actors** | Local `git` (source of truth for ahead-of-upstream state); the Cockpit tree provider (`cockpitTreeProvider`) and its poll/refresh cycle (renders + updates the section); App Runner (the downstream that only deploys on push — named in the tooltip, not called) |
| **Key Value** | "Committed but not shipped" is never a surprise — the Cockpit passively shows the count and subjects of unpushed commits, with the deploy consequence spelled out |
| **Boundary — IN** | A local service computing unpushed commits (ahead of upstream/`origin`) in the workspace root; a collapsible "Git — N commits to push" section listing subject lines (newest first, capped at 10 with a "…and N more" row); read-only; refreshed on the existing poll cycle; best-effort and silent when not a git repo / no upstream / git unavailable. PLUS: grouping the existing unfinished-scope rows under one collapsible `<nn> Scopes unfinished` header (collapsed by default), preserving the active-scope-first ordering within the group |
| **Boundary — OUT** | Uncommitted-changes count; behind-count / full ahead-behind vs origin; local-vs-deployed version display; any push/commit/stage action or button; multi-repo/submodule handling beyond the workspace root; any hosted-MCP involvement |

---

## User Scenarios

### US1 — Unpushed work is visible
A developer has committed 3 changes but not pushed.
**Expected:** the Cockpit shows a "Git — 3 commits to push" section; expanding it lists the 3 commit subjects (newest first).

### US2 — Deploy consequence is clear
The developer hovers the section.
**Expected:** the tooltip states these commits build/deploy only after a push to `main`, so the "why isn't it live" question answers itself.

### US3 — Nothing to show
The branch is even with its upstream (all pushed).
**Expected:** no Git section renders at all — no empty row, no zero-count noise.

### US4 — Not a git repo / no upstream
The workspace is not a git repo, has no configured upstream, or git is unavailable.
**Expected:** no Git section, no error surfaced; the rest of the Cockpit renders normally.

### US5 — Refresh after commit/push
The developer commits (or pushes) while the Cockpit is open.
**Expected:** on the next poll/refresh the count updates (or the section disappears after a successful push) without a manual reload.

### US6 — Many unpushed commits
The developer has 25 unpushed commits.
**Expected:** the section shows the count 25, lists the 10 newest subjects, then a "…and 15 more" row — the tree stays tidy.

### US7 — Unfinished scopes are grouped
The project has 3 scopes with remaining work.
**Expected:** the Cockpit root shows a collapsed "3 Scopes unfinished" header; expanding it reveals the 3 scope rows (active first), each behaving exactly as before.

---

## Functional Requirements

### FR-001 — Local unpushed-commit computation
A local service MUST compute the set of commits on the current branch that are ahead of its upstream/`origin`, by running `git` in the workspace root. It MUST be best-effort: when the folder is not a git repo, git is unavailable, or there is no upstream, it returns an empty result and surfaces no error.
**Acceptance:**
- [ ] Count matches `git rev-list --count @{u}..HEAD` for a repo with an upstream
- [ ] A non-git / no-upstream / git-missing workspace yields an empty result and no thrown error

### FR-002 — "Git — N commits to push" section
When there is ≥1 unpushed commit, the Cockpit MUST show a collapsible section labelled with the count (prefix "Git — ", e.g. "Git — 3 commits to push"). Expanding it MUST list each unpushed commit's subject line newest-first, capped at 10 with a trailing "…and N more" row when there are more than 10. The section MUST be omitted entirely when the count is 0.
**Acceptance:**
- [ ] 3 unpushed commits → "Git — 3 commits to push" expanding to 3 subjects
- [ ] 25 unpushed commits → 10 subjects + "…and 15 more"
- [ ] 0 unpushed commits → no section rendered

### FR-003 — Read-only
The section MUST be read-only: count + subjects + a tooltip explaining that these commits build/deploy only after a push to `main`. It MUST expose no push/commit/stage action.
**Acceptance:**
- [ ] No command/button on the section or its items performs a git write or push
- [ ] The tooltip states the push→deploy consequence

### FR-004 — Refresh on the existing cycle
The indicator MUST refresh on the Cockpit's existing refresh/poll cycle (the path that repaints the local Kit-update / Install-commands sections), updating after the developer commits or pushes without a manual reload.
**Acceptance:**
- [ ] After a commit, the next poll shows the incremented count
- [ ] After a successful push, the next poll removes the section

### FR-005 — Cheap and non-blocking
The computation MUST be cheap and MUST NOT stall the tree render or the MCP load path; a slow or hanging git call MUST degrade to "no section" rather than blocking the Cockpit.
**Acceptance:**
- [ ] Tree renders normally with git unavailable / slow (section simply absent)
- [ ] No perceptible delay added to the Cockpit load under normal conditions

### FR-006 — Unfinished-scopes group header
The unfinished scope rows (currently rendered flat at the tree root) MUST be grouped under a single collapsible header labelled `<nn> Scopes unfinished`, where nn = the count of scopes with remaining work. The header MUST be collapsed by default. Expanding it MUST list the scope rows exactly as today (same node, same tooltip/decorations/context menu), preserving the active-scope-first ordering within the group. When nn = 0 the existing "All caught up — no remaining work" empty state MUST show instead (no empty header). Other tree sections (feedback, help, videos, devplan, git, kit-update, etc.) are unaffected.
**Acceptance:**
- [ ] 3 scopes with remaining work → a collapsed "3 Scopes unfinished" header expanding to the 3 scope rows (active first)
- [ ] 0 scopes with remaining work → no header; the "All caught up" message shows
- [ ] Expanded scope rows behave identically to today (tasks, checkout/checkin, decorations)

---

## Technical Sections

### New local service — `vscode-extension/src/services/gitStatus.ts`
Mirror `kitUpdate.ts` / `commandsInstall.ts`: export a synchronous-ish `checkGitStatus()` (or async with a short timeout) that resolves the workspace root, runs git, and returns `{ root: boolean; aheadCount: number; subjects: string[] }`. Implementation: `git rev-list --count @{u}..HEAD` for the count and `git log --format=%s @{u}..HEAD` (or `git rev-list`+`--pretty`) for subjects, run via `child_process` with a small timeout and try/catch → empty result on any failure (no repo, no `@{u}`, git missing). Cap subjects at 10 in the provider, not the service (service returns the true count).

### Tree provider — `vscode-extension/src/providers/cockpitTreeProvider.ts`
Add a `NodeKind` `'git-group' | 'git-commit'`, a `withGitSection()` helper (called alongside `withCommandsSection` / `withKitUpdateSection`), and node factories `gitGroupNode(count)` + `gitCommitNode(subject)`. Store `gitStatus` on the provider like `commandsStatus` / `kitUpdate`, populated in `getChildren` on the load path (cheap local read, independent of token/MCP). Group is collapsible; children are the capped subject list plus an optional "…and N more" leaf. Use a git-appropriate `ThemeIcon` (e.g. `git-commit` / `cloud-upload`). Signature/poll: fold `aheadCount` into the change signature so `poll()` repaints when it changes.

### Unfinished-scopes header — `vscode-extension/src/providers/cockpitTreeProvider.ts`
Add a `NodeKind` `'scopes-group'` and a `scopesGroupNode(count)` factory (collapsible, `TreeItemCollapsibleState.Collapsed`, a `layers`/`list-tree` ThemeIcon, description = count). In `rootNodes()` for the `'ok'` state, instead of returning the `sorted.map(scopeNode)` array at root, return a single `scopesGroupNode(withWork.length)` (still wrapped by `withFeedbackSection` so feedback/help/etc. append after it). In `getChildren`, when the element kind is `'scopes-group'`, return the sorted `scopeNode` list (active-first sort preserved). The `'empty'` state is unchanged (shows "All caught up"). No change to `scopeNode` itself — tasks, checkout/checkin, decorations, and context menus all keep working.

### Conventions
Local-only (no hosted-MCP call); TypeScript, no `any`; best-effort/fail-silent like the sibling local sections; code fences written by the orchestrator at `implement`. Cockpit is Marketplace-published — a version bump MUST both build the VSIX and `vsce publish` (see release note). Nothing pushed until the user says push.

---

## Success Criteria

1. **Visibility.** With ≥1 unpushed commit, the "Git — N commits to push" section appears on the next refresh/poll in 100% of git-repo workspaces with an upstream, and the count exactly matches `git rev-list --count @{u}..HEAD`. *(FR-001, FR-002, FR-004)*
2. **No noise.** The section renders 0 rows at 0 unpushed commits and appears in 0 non-git / no-upstream workspaces — no error, no empty row. *(FR-002, FR-001)*
3. **Non-blocking.** The git computation adds no perceptible delay (target < ~200ms typical), and a hanging git call degrades to "no section" with the rest of the Cockpit still rendering. *(FR-005)*
4. **Scopes grouped.** Unfinished scopes render under a single collapsed `<nn> Scopes unfinished` header whose count equals the number of scopes with remaining work; at 0 the "All caught up" state shows instead; expanded scope rows behave identically to before (tasks, checkout/checkin, decorations). *(FR-006)*

---

## Constraints & Notes

### Constraints
- **Local, read-only, silent-by-default.** Computed from local git; never writes; never errors into the UI; absent when there's nothing to show.
- **Reuse the local-section pattern.** Built exactly like `kitUpdate` / `commandsInstall` — a cheap local check + a `withXxxSection` + node factories + poll signature — not a new subsystem.
- **Marketplace release discipline.** Shipping requires a COCKPIT version bump + VSIX rebuild **and** `vsce publish` (sideload ≠ auto-update). Orchestrator-first: `createSpecs` → `implement`. Nothing pushed until the user says push.

### Out of Scope (own later scopes)
- Uncommitted-changes count; ahead/behind (behind-count) vs origin.
- Local-vs-deployed version display / prod version lookup.
- Any push/commit/stage action from the Cockpit.
- Multi-repo / submodule handling beyond the workspace root.

### Dependencies
- SCOPE-042 (Cockpit tree + poll), SCOPE-019/R15 (local Kit-update section as the pattern to copy).
- Local `git` on PATH in the developer's environment (absence degrades gracefully to "no section").

- **Process note:** authored in-conversation (interactive buildscope, section-by-section approval); motivated by the 2026-07-06 unpushed-SPEC-052 confusion; implement via `createSpecs` → `implement`, then COCKPIT bump + VSIX rebuild + `vsce publish`.
