# Quickstart: Cockpit Commits To Push (Spec 091)

## What this adds
A local, read-only Dev Cockpit section — "Git — N commits to push" — listing unpushed commit subjects, so committed-but-undeployed work is visible in the IDE (App Runner deploys only on push to main).

## Files
- `vscode-extension/src/services/gitStatus.ts` (new) — `checkGitStatus()` runs local git, returns `{ root, aheadCount, subjects[] }`, fail-silent.
- `vscode-extension/src/providers/cockpitTreeProvider.ts` — new `git-group`/`git-commit` nodes, `withGitSection()`, poll signature includes `aheadCount`.

## Pattern to copy
This mirrors the two existing local sections exactly:
- `vscode-extension/src/services/kitUpdate.ts` + `withKitUpdateSection()`
- `vscode-extension/src/services/commandsInstall.ts` + `withCommandsSection()`

## Try it (Extension Development Host)
1. F5 to launch the extension host on a repo with unpushed commits.
2. Open the Dev Cockpit — the "Git — N commits to push" section appears; expand to see subjects.
3. Commit again → next poll increments the count. Push → next poll removes the section.
4. Check a non-git folder / no upstream: no section, no error.

## Ship
COCKPIT version bump → rebuild VSIX → `vsce publish` (Marketplace; sideload ≠ auto-update). Only after the change is verified and the user approves publishing.

## Guardrails
- Local only — no hosted-MCP call.
- Read-only — no push/commit action from the Cockpit.
- Fail-silent — never error into the UI; absent when nothing to show.
