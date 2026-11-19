# Plan: Cockpit Commits To Push (Spec 091)

**Scope**: SCOPE-091 · **Phase**: design → implementation · **Priority**: medium
**Depends on**: SCOPE-042 (Cockpit tree + poll), SCOPE-019/R15 (local Kit-update section — the pattern to copy)

## Strategy

Copy the existing local-section pattern verbatim. The Cockpit already renders two local, MCP-independent sections (Install-commands via `commandsInstall.ts`, Kit-update via `kitUpdate.ts`), each a cheap local check + a `withXxxSection()` + node factories + a poll signature. Add a third for git push state. No hosted-MCP involvement, no new subsystem.

## Changes

### 1. `vscode-extension/src/services/gitStatus.ts` (new)
`checkGitStatus()` → `{ root: boolean; aheadCount: number; subjects: string[] }`. Resolve workspace root, run git via `child_process` with a short timeout:
- `git rev-list --count @{u}..HEAD` → count
- `git log --format=%s @{u}..HEAD` → subjects (newest first)
`try/catch` around everything → empty result (`root:false` / `aheadCount:0`) on no-repo, no `@{u}`, or git-missing. Service returns the true count; the 10-cap is applied in the provider. (FR-001, FR-005)

### 2. `vscode-extension/src/providers/cockpitTreeProvider.ts`
- `NodeKind` += `'git-group' | 'git-commit'`.
- Provider field `gitStatus`, populated in `getChildren` on the load path (like `commandsStatus` / `kitUpdate`).
- `withGitSection(base)` helper, called alongside `withCommandsSection` / `withKitUpdateSection`; omitted when `aheadCount === 0` or `!root`.
- `gitGroupNode(count)` — collapsible "Git — N commits to push", git ThemeIcon, tooltip stating push→deploy-on-main; `gitCommitNode(subject)` leaves; a trailing "…and N more" leaf when `subjects.length > 10`. Read-only (no `command` that writes). (FR-002, FR-003)
- Fold `aheadCount` into the change signature so `poll()` repaints on commit/push. (FR-004)

### 3. Unfinished-scopes group header — `cockpitTreeProvider.ts`
Add `NodeKind` `'scopes-group'` + `scopesGroupNode(count)` (collapsible, `Collapsed` by default). In `rootNodes()` `'ok'` state, wrap the sorted scope nodes under one `scopesGroupNode(withWork.length)` (still `withFeedbackSection`-wrapped) instead of returning them at root; `getChildren` on `'scopes-group'` returns the sorted `scopeNode` list (active-first). `'empty'` state unchanged. No change to `scopeNode`. (FR-006)

### 4. Release
COCKPIT version bump + VSIX rebuild + `vsce publish` (Marketplace; sideload ≠ auto-update). Release-only task — after implementation is verified and the user approves publishing.

## Verification gates

- Manual: with unpushed commits the section shows the right count + subjects; at 0 / non-git it's absent; committing then polling updates the count; pushing removes it.
- Cockpit still renders with git unavailable (section simply absent).
- `npm run` typecheck/build for the extension clean; `auditfences` clean for touched files.
- Nothing pushed / published until the user says so.

## Conventions

Local-only (no MCP call); TypeScript, no `any`; best-effort/fail-silent like the sibling local sections; code fences by the orchestrator at `implement`.
