# Requirements Checklist: Spec 086 — Kit Cockpit Delivery

## FR-004 — Marketplace-primary install + update (VSIX fallback)
- [ ] Fresh init on a networked machine with `code` yields a **gallery-installed** cockpit (not a sideload)
- [ ] VS Code offers an update when a newer version is published
- [ ] Gallery unreachable → falls back to bundled `.vsix`, still succeeds
- [ ] Never force-downgrades a newer installed copy to an older bundled `.vsix`
- [ ] `WXKANBAN_COCKPIT_SOURCE=auto|gallery|vsix` honored by both install paths
- [ ] `ensureCockpitUpToDate` changed via `implement` (MODIFIED-BY recorded), not hand-edited

## FR-001 — Release-asset integrity
- [ ] Published `kit.tar.gz` SHA ≠ local build → release fails non-zero
- [ ] Missing `vscode-extension/*.vsix` in published archive → release fails
- [ ] Correct upload passes

## FR-002 — Visible install fallback
- [ ] `no-code` / `no-vsix` surfaces a visible, actionable instruction (README-KIT / init summary)
- [ ] Message includes the exact `code --install-extension` command + PATH hint

## FR-003 — Cache-bust
- [ ] Documented (or automated) `KitProxyService` cache invalidation after a same-tag re-upload

## Cross-cutting
- [ ] Orchestrator-owned scripts mirrored per two-allowlist rule (EOL-normalized)
- [ ] `auditfences` clean on touched files
- [ ] Unit tests green (`cockpit-update`)
- [ ] End-to-end verified (TC-13/TC-14)
- [ ] Nothing pushed until the user says push
