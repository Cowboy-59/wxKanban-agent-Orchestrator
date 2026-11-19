# Test Plan: Spec 086 — Kit Cockpit Delivery

Spec: 086 · Scope: SCOPE-086

## FR-004 — gallery-first install + update (unit: `cockpit-update.test.ts`)
- **TC-01** With `code` present and gallery reachable, `ensureCockpitUpToDate` invokes `--install-extension wxperts.wxkanban-dev-cockpit` (by ID), not a `.vsix` path.
- **TC-02** With gallery unreachable, it falls back to the bundled `.vsix`.
- **TC-03** Installed version ≥ bundled version → no install spawned (no-op, no downgrade).
- **TC-04** `WXKANBAN_COCKPIT_SOURCE=vsix` forces the `.vsix` path even when the gallery is reachable; `=gallery` never falls back to `.vsix`.
- **TC-05** `WXKANBAN_NO_COCKPIT_UPDATE` / `WXKANBAN_NO_COCKPIT_REFRESH` still short-circuit.
- **TC-06** Fresh-install script: same gallery-first / fallback behavior; return codes preserved.

## FR-001 — release-asset integrity
- **TC-07** Published `kit.tar.gz` SHA ≠ local sidecar → release fails non-zero with a clear message.
- **TC-08** Published archive missing `vscode-extension/*.vsix` → release fails.
- **TC-09** Correct upload (SHA match + vsix present) → passes.

## FR-002 — visible install fallback
- **TC-10** `no-code` outcome writes a visible instruction (README-KIT / init summary) with the exact `code --install-extension` command and the PATH hint.
- **TC-11** `no-vsix` outcome likewise surfaces an actionable message, not just a log line.

## FR-003 — cache-bust
- **TC-12** After a same-tag re-upload, the documented bust step (`_resetCache` / restart) causes `KitProxyService` to serve the fresh archive rather than the cached stale one.

## Manual / end-to-end (T008)
- **TC-13** On a clean machine with `code` on PATH + network, a fresh kit init yields a gallery-managed cockpit: `code --list-extensions --show-versions` shows `wxperts.wxkanban-dev-cockpit@<v>` and VS Code offers an update after a newer publish.
- **TC-14** Air-gapped machine (no gallery): init installs the bundled `.vsix` or shows the manual-install message.
