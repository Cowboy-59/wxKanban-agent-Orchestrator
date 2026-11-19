# Plan: Spec 086 — Kit Cockpit Delivery

Spec: 086 · Scope: SCOPE-086 (incl. Amendment A) · Status: design

## Goal
Make the VS Code Marketplace the primary install/update channel for the Dev Cockpit, with the bundled `.vsix` as an offline fallback, and harden the release/fallback paths so the cockpit is never silently missing or frozen.

## Key insight driving the design
`code --install-extension <file.vsix>` is a **sideload** — VS Code does not auto-update sideloaded extensions from the gallery. `code --install-extension <publisher.id>` installs the **gallery** copy, which auto-updates. So the fix is not "publish to Marketplace" (done) but "make the kit install by ID."

## Approach by requirement

### FR-004 — gallery-first install + update (T001–T004)
- **`ensureCockpitUpToDate`** (`wxkanban-agent/core/orchestrator/cockpit-refresh.ts`, fenced `[SCOPE 042 / T038]`): change the install action from `--install-extension <vsixPath> --force` to `--install-extension wxperts.wxkanban-dev-cockpit`. Keep the version guard (never downgrade). Use the bundled `.vsix` only when the gallery attempt cannot run. Steady-state (already current) stays spawn-free by returning at the version check before any install. **Edit via `implement` — this is fenced spec-042 code; the MODIFIED-BY line must be recorded by the orchestrator, not hand-written.**
- **`install-cockpit-extension.mjs`** + `.vscode/tasks.json` folderOpen task: same switch for fresh install; preserve existing return codes (`no-code|no-vsix|unchanged|installed|install-failed`).
- **`WXKANBAN_COCKPIT_SOURCE`** = `auto` (default: gallery-first, vsix fallback) | `gallery` | `vsix`, honored by both paths.
- Fallback detection: on the rare not-installed/stale path, a short `spawnSync` gallery attempt lets us detect failure and fall back to the `.vsix`; the common no-op path never spawns (see Open Question in spec).

### FR-001 — release-asset integrity (T005)
- In `sync-to-orchestrator.mjs --release` (and/or a standalone `verify-release.mjs`): after `gh release upload`, re-download the published `kit.tar.gz`, compute SHA-256, compare to `releases/<v>/kit.tar.gz.sha256`, and assert the archive lists `vscode-extension/*.vsix`. Fail non-zero on mismatch.

### FR-002 — visible install fallback (T006)
- `install-cockpit-extension.mjs` already returns `no-code`/`no-vsix`; surface those in the README-KIT / init summary with the exact `code --install-extension` command and PATH hint.

### FR-003 — cache-bust (T007)
- `KitProxyService` exposes `_resetCache()`; document its use post-re-upload, or add a small admin route / release hook. A normal deploy/restart already clears it.

## Files touched
- `wxkanban-agent/core/orchestrator/cockpit-refresh.ts` (via `implement`)
- `scripts/install-cockpit-extension.mjs` (orchestrator-owned; mirrored per two-allowlist rule)
- `.vscode/tasks.json` (folderOpen task)
- `wxkanban-agent/tests/unit/cockpit-update.test.ts`
- `scripts/sync-to-orchestrator.mjs` and/or new `scripts/verify-release.mjs`
- `KitProxyService` (server; via `index.ts → app.ts`) — cache-bust only
- Cockpit `README.md` / README-KIT / init summary

## Risks & mitigations
- **Downgrade risk:** gallery may briefly lag a freshly-bundled `.vsix`; keep the never-downgrade guard so we never force an older copy over a newer installed one.
- **Fenced-code drift:** editing `ensureCockpitUpToDate` outside `implement` creates untracked drift — route it through the orchestrator.
- **Policy-blocked gallery:** `WXKANBAN_COCKPIT_SOURCE=vsix` covers air-gapped/locked-down customers.
- **Blocking cost:** only the rare install path may block briefly; steady state stays non-blocking.

## Constraints
Orchestrator-first; 100% TS in the kit/server; Pino logging; two-allowlist mirror + EOL-normalize for orchestrator-owned scripts; nothing pushed until the user says push; a cockpit VSIX version bump must build AND `vsce publish`.
