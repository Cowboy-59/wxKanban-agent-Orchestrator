# Quickstart: Spec 086 — Kit Cockpit Delivery

## What this spec does
Switches the kit to install/update the Dev Cockpit from the **VS Code Marketplace** (`wxperts.wxkanban-dev-cockpit`, published 2026-07-05) so customers get native auto-updates, keeps the bundled `.vsix` as an offline fallback, and hardens the release + fallback paths.

## The one thing to remember
`code --install-extension <file.vsix>` = **sideload, no auto-update**. `code --install-extension wxperts.wxkanban-dev-cockpit` = **gallery, auto-updates**. This spec is about making the kit use the second form.

## Working on it
1. Pick a task from `tasks.md` (start with T001 + T002 — the headline change).
2. For the fenced file `cockpit-refresh.ts`, use the orchestrator:
   ```bash
   wxkanban-agent implement 086/T001
   ```
   Do **not** hand-edit the `[SCOPE 042 / T038]` fence.
3. For orchestrator-owned scripts (`install-cockpit-extension.mjs`, `sync-to-orchestrator.mjs`), edit in the orchestrator source and mirror per the two-allowlist rule (KIT_FILES + build-release KIT_INCLUDE_FILES), EOL-normalized.
4. Run the unit suite:
   ```bash
   cd wxkanban-agent && npm test -- cockpit-update
   ```
5. Verify end-to-end (TC-13): fresh init on a networked machine with `code` → `code --list-extensions --show-versions` shows the gallery copy.

## Release note
Any cockpit VSIX version bump must **build the `.vsix` AND `vsce publish`** it — the Marketplace rejects re-publishing the same version, so bump first (`vscode-extension/package.json`).

## Related
- Scope: `specs/Project-Scope/086-app-kit-cockpit-delivery.md` (Amendment A)
- Cockpit feature spec: `specs/042-vscode-dev-cockpit/spec.md`
- Memory: `project_cockpit_marketplace_published`
