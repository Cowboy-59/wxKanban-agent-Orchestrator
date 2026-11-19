# SCOPE-104: Cockpit-Bundled wxDark / wxLight Recording Themes

**Spec Number**: 104 (SCOPE namespace)
**Status**: `draft`
**Created**: 2026-07-20
**Depends On**: none (self-contained within `vscode-extension/`)
**Related**: SCOPE-086 (app/kit/cockpit delivery), SCOPE-094 (cockpit startup health), the `vscode-recording-theme` skill and the installed `wxperts.wx-recording-themes` extension whose base theme files are the starting layer
**Source**: `specs/Project-Scope/104-cockpit-bundled-themes.md`

---

## Overview

Bundle Andy's personal warm-gruvbox recording themes — wxDark and wxLight — directly into the wxKanban
Dev Cockpit VS Code extension as self-contained theme files, so a fresh cockpit install carries the
on-camera look without needing the separate `wxperts.wx-recording-themes` extension or a hand-edited
`settings.json`. The themes bake Andy's `[wxDark]` / `[wxLight]` `colorCustomizations` and
`tokenColorCustomizations` overlays (editor background `#201e1b`, tan `#d4be98` foreground text, teal
`#7daea3` accents) into complete theme JSON, layered over the base files from the installed extension.
The themes are strictly opt-in: the cockpit never auto-applies a theme. A new
`wxkanban.cockpit.toggleTheme` command flips between wxLight and wxDark on demand, with no hard-bound
keybinding — an F9 opt-in is documented in the README for the user to add themselves.

## Business Problem

The recording-ready wxDark / wxLight look currently lives in two places that don't travel with the
cockpit: the standalone `wxperts.wx-recording-themes` extension (base theme files) and Andy's personal
`settings.json` (`[wxDark]` / `[wxLight]` `colorCustomizations` + `tokenColorCustomizations` overlays
that produce the actual warm-gruvbox result). Anyone installing the Dev Cockpit on a new machine — or
Andy on a fresh profile — gets neither, so the finished look has to be reassembled by hand every time
and can drift between machines. The cockpit is already the one artifact these users install, so it is
the natural carrier for the themes. The look must ship with the cockpit, be reproducible byte-for-byte
from the baked files, and never override whatever theme the user already has unless they explicitly
ask for it.

## Actors

- Primary: The cockpit user (Andy and other wxKanban developers) who wants the wxDark / wxLight recording look available immediately after installing the Dev Cockpit, applied only when they choose it.
- Secondary: The screen-recording / training-video workflow that depends on a consistent on-camera appearance across machines and sessions.

## Scope Boundary

- Two self-contained theme files contributed by the cockpit via `contributes.themes` in
  `vscode-extension/package.json`: "wxDark" (dark) and "wxLight" (light).
- Each theme file is the base file from `wxperts.wx-recording-themes` with Andy's personal
  `settings.json` `[wxDark]` / `[wxLight]` `colorCustomizations` (workbench `colors`) and
  `tokenColorCustomizations` (`tokenColors`) overlays merged in, so the file alone reproduces the full
  warm-gruvbox look (bg `#201e1b`, fg `#d4be98`, accent `#7daea3`) with no external extension or user
  settings required.
- A new command `wxkanban.cockpit.toggleTheme` that reads the active color theme and switches
  `workbench.colorTheme` between "wxLight" and "wxDark" (defaulting to wxDark when the active theme is
  neither), applied at the appropriate settings scope.
- The toggle is the only automatic write to `workbench.colorTheme`; theme application otherwise happens
  only through VS Code's own theme picker.
- README documentation of the two themes, the toggle command, and an opt-in F9 keybinding snippet the
  user can paste into their own `keybindings.json`.
- Cockpit version bump 0.2.25 → 0.2.26 and a rebuilt VSIX. Publishing is deferred until explicitly
  requested.

## Out of Scope

- Any auto-apply of a theme on install, activation, session start, or first run — the cockpit must
  never set `workbench.colorTheme` on its own except when the user invokes the toggle command.
- A hard-bound default keybinding for the toggle (no `keybindings` contribution); F9 is documented as a
  user opt-in only.
- Shipping, re-bundling, or depending on the standalone `wxperts.wx-recording-themes` extension — the
  cockpit theme files are self-contained copies, not a runtime dependency.
- Changes to the app, the kit, or the MCP server — this scope is confined to `vscode-extension/`.
- Publishing the VSIX to the Marketplace or a GitHub release (deferred to an explicit push).
- New themes beyond the wxDark / wxLight pair, or a settings UI for editing theme colors.

## User Scenarios & Testing

### US1 — Fresh cockpit carries the look (happy path)

A developer installs the Dev Cockpit on a clean VS Code profile with no recording-themes extension and
no custom `settings.json`. They open the theme picker and see "wxDark" and "wxLight" listed. Selecting
either applies the full warm-gruvbox appearance immediately.
**Expected:** both themes appear in the picker from the cockpit alone; selecting one reproduces the
baked look (bg `#201e1b`, tan text, teal accents) with no other extension or user settings present.

### US2 — Toggle flips the pair on demand

The user runs "wxKanban: Toggle Recording Theme" from the command palette. If the active theme is
wxLight it switches to wxDark and vice-versa; if the active theme is neither, it applies wxDark.
**Expected:** the command flips wxLight↔wxDark deterministically, defaults to wxDark from any other
theme, and is the only cockpit code path that writes `workbench.colorTheme`.

### US3 — Never auto-applies (opt-in guarantee)

The user installs and activates the cockpit but never invokes the toggle or the picker. Their existing
color theme is untouched across install, activation, and restart.
**Expected:** `workbench.colorTheme` is never modified by the cockpit unless the user runs the toggle
or picks a theme; installing/activating changes it 0 times.

### US4 — F9 is the user's choice

The user reads the README, copies the documented F9 snippet into their own `keybindings.json`, and
presses F9 to toggle. A user who does nothing has no F9 binding from the cockpit.
**Expected:** the cockpit contributes no keybinding; F9 works only after the user opts in via the
documented snippet.

## Functional Requirements

### FR-001 — Two self-contained theme files bundled with the cockpit

The cockpit ships `wxDark` and `wxLight` theme JSON files under `vscode-extension/` and registers them
via `contributes.themes`. Each is the base recording-theme file with Andy's personal `colorCustomizations`
and `tokenColorCustomizations` overlays merged in, so the file alone reproduces the intended look.
**Acceptance:** on a profile with no other theme extension and empty user `settings.json`, both themes
appear in the picker and render bg `#201e1b`, fg `#d4be98`, and teal `#7daea3` accents.

### FR-002 — Overlays baked, not referenced

The wxDark / wxLight overlays from `settings.json` are merged into the theme files' `colors` and
`tokenColors`; the theme files reference no external extension and require no user `settings.json`
entries to look correct.
**Acceptance:** removing all `[wxDark]` / `[wxLight]` blocks from user `settings.json` and uninstalling
`wxperts.wx-recording-themes` leaves the cockpit themes visually identical.

### FR-003 — Opt-in only; no auto-apply

The cockpit never writes `workbench.colorTheme` on install, activation, session start, or first run.
Theme application happens only through the VS Code theme picker or the toggle command (FR-004).
**Acceptance:** across install, activation, and restart with no user action, `workbench.colorTheme` is
modified 0 times.

### FR-004 — `wxkanban.cockpit.toggleTheme` command

A new command flips `workbench.colorTheme` between "wxLight" and "wxDark", defaulting to "wxDark" when
the active theme is neither, and is registered in `contributes.commands`.
**Acceptance:** invoking the command from wxLight yields wxDark, from wxDark yields wxLight, and from
any other theme yields wxDark; it is the sole cockpit write path to `workbench.colorTheme`.

### FR-005 — No hard-bound keybinding; README F9 opt-in

The extension contributes no `keybindings` entry for the toggle. The README documents the two themes,
the toggle command, and a copy-paste F9 `keybindings.json` snippet the user may add themselves.
**Acceptance:** `package.json` has no `contributes.keybindings` for the toggle; the README contains the
F9 opt-in snippet and the toggle/theme documentation.

### FR-006 — Version bump and rebuilt VSIX, publish deferred

The cockpit version is raised 0.2.25 → 0.2.26 and the VSIX is rebuilt from the bumped source.
Publishing to the Marketplace / GitHub release is not performed as part of this scope.
**Acceptance:** `package.json` reads `0.2.26`, a matching VSIX is produced by the package script, and no
publish/release step runs until explicitly requested.

## Success Criteria

1. Self-contained: on a clean profile with `wxperts.wx-recording-themes` uninstalled and an empty user `settings.json`, 2 of 2 cockpit themes appear in the picker and render the exact baked colors (bg `#201e1b`, fg `#d4be98`, accent `#7daea3`).
2. Opt-in: across install + activation + restart with no user action, the cockpit writes `workbench.colorTheme` exactly 0 times.
3. Toggle correctness: the toggle command produces the correct target theme in 100% of the three cases (from wxLight, from wxDark, from any other theme).
4. No forced keybinding: `package.json` contributes 0 keybindings; the F9 opt-in exists only as documented README text.
5. Fidelity: the baked themes are visually identical to Andy's current `settings.json`-driven look, verified by comparing rendered `colors` / `tokenColors` values 1:1 with the source overlays.
6. Version + build: the VSIX version is exactly `0.2.26` and builds cleanly, with 0 publish/release actions taken.

## Data Requirements

None. No database, no tables, no DDL. The only new artifacts are static theme JSON files, a command
registration, and README text inside `vscode-extension/`.

## API Routes

None. This scope adds no server route, MCP tool, or network call. All behavior is local to the VS Code
extension host.

## Frontend Components

No web frontend. The VS Code surfaces are: two `contributes.themes` entries (picker entries), one
`contributes.commands` entry (`wxkanban.cockpit.toggleTheme`, palette-visible), and README
documentation. No webview or panel is added.

## Technical Notes

The toggle reads `vscode.workspace.getConfiguration('workbench').get('colorTheme')` and writes the
opposite of the pair, defaulting to wxDark. Base theme files come from the installed
`wxperts.wx-recording-themes` extension; the merge overlays Andy's `settings.json` `[wxDark]` /
`[wxLight]` `colorCustomizations` onto `colors` and `tokenColorCustomizations` onto `tokenColors`. The
theme label strings ("wxDark" / "wxLight") must match exactly between the theme files' `name`, the
`contributes.themes` `label`, and the toggle command's comparison values, or the toggle silently
mis-detects the active theme. All new top-level code (the command handler) must carry a code fence per
the fencing convention; theme JSON files are data, not fenced code.

## Constraints & Risks

- Label drift: if the theme `label` / `name` and the toggle's compared strings disagree, the toggle
  defaults to wxDark instead of flipping — the strings must be a single shared constant or verified equal.
- Settings scope: writing `workbench.colorTheme` at the wrong scope (workspace vs user) could surprise
  the user; the toggle should write at a scope that matches "apply this theme now" without clobbering
  workspace-specific choices unexpectedly.
- Fidelity risk: the base files plus overlays must be merged, not just concatenated — a missed
  `tokenColors` overlay would make code text render in the base theme's colors, not the warm-gruvbox look.
- Self-contained guarantee: the theme files must not assume the standalone extension is installed;
  any residual reference would break the clean-profile test.

## Deferred (each its own future scope)

- Publishing the 0.2.26 VSIX to the Marketplace / GitHub release (happens only on an explicit push).
- Additional themes or a high-contrast variant beyond the wxDark / wxLight pair.
- A settings UI or command to edit theme colors from within the cockpit.
- Syncing the themes back into the standalone `wxperts.wx-recording-themes` extension.

## Clarifications / Open Questions

### Session 2026-07-20 (with Andy, desk → phone bridge)

- The themes are baked self-contained files (base `wxperts.wx-recording-themes` files + Andy's personal
  `settings.json` `[wxDark]` / `[wxLight]` overlays merged in), not a runtime dependency on the standalone
  extension.
- Themes are strictly opt-in: the cockpit never auto-applies; only the picker or the toggle command applies.
- The toggle command `wxkanban.cockpit.toggleTheme` flips wxLight↔wxDark with no hard-bound keybinding;
  F9 is documented in the README as a user opt-in.
- Version bumps 0.2.25 → 0.2.26 with a rebuilt VSIX; publishing is deferred until Andy explicitly says push.

Open questions for confirmation:

- Q1: Settings scope for the toggle's `workbench.colorTheme` write — Global (user) so it follows the
  user everywhere, or Workspace so it stays project-local? (Leaning Global to match "recording look".)
- Q2: Where do the canonical base theme JSON files live to copy from — the installed
  `wxperts.wx-recording-themes` extension folder on this machine, or is there a source copy in the repo?
