# Bug: Dev Cockpit auto-installer picks a stale .vsix (lexicographic version sort)

**Component:** `scripts/install-cockpit-extension.mjs` (shipped in the wxKanban dev kit; runs via the `.vscode/tasks.json` `folderOpen` task and from `scripts/init.mjs` / `upgrade-kit.mjs`)
**Severity:** High — silently downgrades / pins the Dev Cockpit extension to an old version on every folder open, hiding newer features.
**Reported:** 2026-06-10
**Found in kit:** WindevUSSales (vscode-extension bundled 0.1.8, 0.1.13; cockpit source at 0.1.14)

## Summary

`findBundledVsix()` selects the "newest" bundled `.vsix` using a plain
`Array.prototype.sort()`, which compares **lexicographically (string compare)**,
not by semver. Once the patch number reaches two digits, the wrong file wins.

```js
// scripts/install-cockpit-extension.mjs (original)
const vsix = fs.readdirSync(extDir).filter((f) => f.endsWith('.vsix')).sort();
const file = vsix[vsix.length - 1]; // <-- "newest" by string order
```

For files `wxkanban-dev-cockpit-0.1.8.vsix` and `wxkanban-dev-cockpit-0.1.13.vsix`,
string order is:

```
0.1.13  <  0.1.8     // because '1' < '8' at the 5th character
```

so `vsix[vsix.length - 1]` resolves to **0.1.8**. The script then sees 0.1.8
already installed and reports `Dev Cockpit 0.1.8 already installed — no change`,
and because the `folderOpen` task runs `--install-extension … --force`, it will
**overwrite a manually-installed newer version (e.g. 0.1.14) with 0.1.8** on the
next folder open.

This also defeats adding the correct file: with `0.1.8`, `0.1.13`, `0.1.14` all
present, lexicographic order still puts `0.1.8` last, so 0.1.14 is never chosen.

## Steps to reproduce

1. Place two bundled vsix in `vscode-extension/`: `…-0.1.8.vsix` and `…-0.1.13.vsix`.
2. Open the kit folder in VS Code (fires the `Install wxKanban Dev Cockpit` task).
3. Observe terminal: `[cockpit] Dev Cockpit 0.1.8 already installed — no change.`
4. Manually `code --install-extension …-0.1.14.vsix`, then reopen the folder.
   The task force-reinstalls 0.1.8, reverting the upgrade.

## Expected

The installer selects the **highest semver** vsix (0.1.14) and installs it;
re-runs are a no-op only when the highest bundled version is already installed.

## Actual

Selects 0.1.8 (lexicographically "largest"), reports "no change", and force-
reinstalls it over any newer version on every folder open.

## Root cause

`.sort()` with no comparator does string comparison. Version strings are not
lexicographically ordered once any component is multi-digit.

## Fix (applied locally in WindevUSSales as a stopgap)

Parse `[major, minor, patch]` and sort numerically; non-parseable files sort
lowest so a real release always wins.

```js
const vsix = fs.readdirSync(extDir).filter((f) => f.endsWith('.vsix'));
if (vsix.length === 0) return null;
const parseVer = (f) => {
  const m = f.match(/-(\d+)\.(\d+)\.(\d+)\.vsix$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [-1, -1, -1];
};
vsix.sort((a, b) => {
  const pa = parseVer(a);
  const pb = parseVer(b);
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
});
const file = vsix[vsix.length - 1];
```

## Additional recommendations

- **Ship only one vsix per kit.** Keeping stale `…-0.1.8.vsix` / `…-0.1.13.vsix`
  alongside the current one invites exactly this class of bug. Have the kit
  build clean `vscode-extension/` and drop only the current release.
- **Kit propagation:** WindevUSSales bundled 0.1.8 + 0.1.13 but the cockpit
  source is already at 0.1.14 — the kit's bundled vsix was not refreshed. Verify
  the kit-build step copies the latest vsix.
- Consider failing loudly (or logging the chosen file + version) so a wrong pick
  is visible in the task output instead of masquerading as "no change".

## Impact observed

User on WindevUSSales was stuck on cockpit 0.1.8 across restarts and did not see
the **Help — Videos** section (Scope 042/044) or the **wxConversionScope**
Standard command (both present in 0.1.14), because the installer kept forcing
0.1.8.

## Resolution / status (2026-06-10)

Reviewed against the current kit-author repo:

- **Core bug class is already fixed in the live kit.** The named buggy file
  `scripts/install-cockpit-extension.mjs` (lexicographic `.sort()`) does **not**
  exist in the kit-author repo — it is a *legacy* artifact still present in the
  WindevUSSales consumer. The current kit selects the bundled vsix via
  semver-numeric comparison in two places:
  - `wxkanban-agent/core/orchestrator/cockpit-refresh.ts` →
    `findBundledVsix()` uses `compareVersions()` (numeric major.minor.patch).
    This is the self-heal-at-gateway-boot path that replaced the old installer.
  - `scripts/sync-all-versions.mjs` → `highestVsix()` uses a numeric `cmp`.
- **Publish path was never affected.** `scripts/sync-to-orchestrator.mjs`
  `copyFilter()` excludes all `.vsix` when mirroring; the orchestrator's
  `build-release.mjs` rebuilds a fresh vsix from the mirrored
  `vscode-extension/` source. Stale vsix cannot reach the published kit.
- **Stale-vsix accumulation pruned (2026-06-10).** `vscode-extension/` held 11
  bundled vsix (0.1.0 … 0.1.14); all but the current `0.1.14` were deleted.
  These files are gitignored (not tracked, not shipped) — local hygiene only.

**Still open — consumer remediation (WindevUSSales):** the legacy
`install-cockpit-extension.mjs` + stale 0.1.8 bundle live in that consumer, not
in our source. Fix by pushing a kit upgrade (replaces the old installer with the
`cockpit-refresh` self-heal). Stopgap that works even with the buggy `.sort()`:
delete the single-digit-patch vsix (0.1.2/.5/.6/.7/.8) from their
`vscode-extension/` so lexicographic order lands on the two-digit current
release.
