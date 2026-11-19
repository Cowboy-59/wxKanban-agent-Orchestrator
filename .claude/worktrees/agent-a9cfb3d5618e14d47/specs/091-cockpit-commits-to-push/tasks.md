# Tasks: Cockpit Commits To Push (Spec 091)

Spec ID: d3115fd1-d2f8-425e-bc74-3114894e349e · 5 tasks · **all done · phase: beta (beta_cleared) as of 2026-07-09**

| # | Task | Priority | Status | FRs | Task ID |
|---|------|----------|--------|-----|---------|
| T001 | gitStatus local service (unpushed commits) | high | done | FR-001, FR-005 | b6a8ddd5-6d7a-4bec-9d3b-eead2423c0d4 |
| T002 | Cockpit Git section + nodes | high | done | FR-002, FR-003 | 9a2eca45-068f-458b-9ace-1c5ab8e4ecf5 |
| T003 | Fold aheadCount into poll signature | medium | done | FR-004 | 3b171fac-8ca9-4541-b10e-c2f33458e68b |
| T005 | Group unfinished scopes under "<nn> Scopes unfinished" header | high | done | FR-006 | 80850017-3308-4184-8812-35ff0787c76b |
| T004 | COCKPIT bump + VSIX rebuild + vsce publish | medium | done | release | d88722e0-9604-4e43-9cbe-40b561cef873 |

## T001 — gitStatus local service
Add `vscode-extension/src/services/gitStatus.ts` mirroring `kitUpdate.ts`/`commandsInstall.ts`. Export `checkGitStatus()` that resolves the workspace root and runs git via `child_process` with a short timeout: `git rev-list --count @{u}..HEAD` for the count and `git log --format=%s @{u}..HEAD` for subjects. Return `{ root, aheadCount, subjects[] }`; `try/catch` → empty result (no repo, no `@{u}`, git missing). Service returns the true count; capping is done in the provider.

## T002 — Cockpit Git section + nodes
In `cockpitTreeProvider.ts` add `NodeKind` `'git-group' | 'git-commit'`, a `withGitSection()` helper called alongside `withCommandsSection`/`withKitUpdateSection`, node factories `gitGroupNode(count)` + `gitCommitNode(subject)` + an optional "…and N more" leaf (cap 10). Store `gitStatus` like `commandsStatus`/`kitUpdate`, populate in `getChildren` on the load path. Label "Git — N commits to push", collapsible, read-only with the push→deploy tooltip, git ThemeIcon.

## T003 — Fold aheadCount into poll signature
Include `gitStatus.aheadCount` in the Cockpit change signature so `poll()` repaints the tree when the unpushed count changes (after a commit or push) without a manual refresh, matching how the other local sections update.

## T005 — Group unfinished scopes under "<nn> Scopes unfinished" header
In `cockpitTreeProvider.ts` add a `NodeKind` `'scopes-group'` and a `scopesGroupNode(count)` factory (collapsible, `Collapsed` by default, `layers`/`list-tree` icon, description = count). In `rootNodes()` for the `'ok'` state, return a single `scopesGroupNode(withWork.length)` (still wrapped by `withFeedbackSection`) instead of the flat `sorted.map(scopeNode)`. In `getChildren`, when the element kind is `'scopes-group'`, return the sorted `scopeNode` list (active-first). `'empty'` state unchanged ("All caught up"). No change to `scopeNode` — tasks, checkout/checkin, decorations, context menus keep working.

## T004 — COCKPIT bump + VSIX rebuild + vsce publish
Bump the COCKPIT version, rebuild the VSIX, and `vsce publish` to the Marketplace (sideload ≠ auto-update). Verify the section renders with unpushed commits, is absent at 0/non-git, and updates on poll. Release step — do after implementation is verified and only when the user approves publishing.
