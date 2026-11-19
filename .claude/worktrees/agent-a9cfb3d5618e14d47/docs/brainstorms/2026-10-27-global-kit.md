# Brainstorm: a global kit (install once per machine, repo-specific parts stay per repo)

- **Status:** closed
- **Opened / last updated:** 2026-10-27 / 2026-10-27
- **Source:** internal (the owner runs 4-5 repos at once; each kit upgrade costs tokens and time per repo)
- **Asked for by:** the owner; the audience is everyone, customers included
- **Level:** senior
- **Next item:** none (recorded only; nothing scoped yet)

## The request

Make the kit global to every VS Code instance, so a release is applied once per machine and every repo on it is
current with no per-repo action and no AI session. Some parts must stay specific to each repo.

## What already exists

| Item | Status | Evidence | Confidence |
|---|---|---|---|
| Each repo gets a full copy of the kit (`wxkanban-agent`, `mcp-server`, `_wxAI`, `scripts`, `.vscode`, `shared`, `.claude/<skill>` folders and commands) | Built (per repo) | `scripts/upgrade-kit.mjs:89-97`, `:479` | Confirmed |
| The upgrade already leaves repo-owned files alone (`.wxkanban-project.json`, `.env`, `ai-settings.json`, `CLAUDE.md`, `.claude/settings*.json`, `.claude/mcp.json`) | Built | `scripts/upgrade-kit.mjs:402` | Confirmed |
| The Cockpit installs and upgrades the kit one workspace at a time (`installKit`, `upgradeKit`, `recheckKit`, `installCommands`, `impact.installHook`) | Built (per repo) | `vscode-extension/src/extension.ts:177-223` | Confirmed |
| The update check only notifies; 6-hour cache per repo in `.wxai/kit-update-check.json` | Built | `wxkanban-agent/core/orchestrator/kit-update-check.ts` | Confirmed |
| An earlier global attempt, `/sync-global` (`~/.claude` with `_wxAI-global/`) | Partly built, dead (script and folder missing) | `.claude/commands/sync-global.md`; SPEC-058 calls the path "present in no project" | Confirmed |
| Kit scripts find the project from the working directory (113 uses of `process.cwd()`; 1 of 92 `.mjs` files climbs out of its folder); the path problem is ~190 `node _wxAI/...` / `wxkanban-agent/...` instructions in commands, skills and rules | Built | grep of `_wxAI`, `wxkanban-agent` | Confirmed |
| Hooks in `.claude/settings.json` use repo-relative paths and depend on `jq`, `npx --no-install ts-node` and the repo's `node_modules` | Built | `.claude/settings.json` | Confirmed |
| The `wxkanban` MCP entry and its `Authorization` header live in each repo's `.mcp.json`; nothing at user level | Built | `.mcp.json`, `~/.claude/settings.json` | Confirmed |
| A POSIX launcher and a `.cmd` twin already ship for `wxkanban-agent` and `wxAIGit`; CI runs on `ubuntu-latest` only, for one workflow | Built | `bin/`, `.github/workflows/` | Confirmed |
| SCOPE-112 (kit `.gitignore` block, release manifest) | Planned, draft, no spec | `specs/Project-Scope/112-kit-gitignore-managed-block.md` | Confirmed |
| No server-side minimum-kit-version gate found | Not found | grep of `mcp-server/src`, `src/server` | Likely (narrow search) |
| Claude Code behavior of user-level commands, hooks and skills (loading, precedence, hook merge) | Partly verified by the Step 0 spike, 2026-10-27 (Claude Code 2.1.98, Windows, one run per case): user-level commands load in a repo with none; the user copy wins over a repo copy; user and repo hooks both run, once each. See rows 26-29 | live runs of `claude -p` in three throwaway folders | Confirmed (Windows); macOS and Linux Unknown |
| Earlier brainstorms on this topic | Not found | `docs/brainstorms/` | Confirmed |

## Panel

Spoke: Lead Architect (chair), Domain Analyst, Backend, Frontend (Cockpit), DevOps, Security, QA, Migration, Documentation · Sat out: Legacy, Database

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need | A kit release is applied once per machine; every repo on it is current with no per-repo action and no AI session. Done = 5 repos, 1 action, 0 tokens per repo; a 6th repo needs only its project binding. Where tokens go today is not yet measured | Agreed | yes | 2026-10-27 |
| 2 | Who, how often | For everyone, customers included. First version = Claude Code users with the Cockpit; Cursor stays per-repo for now; existing per-repo installs keep working beside a global one | Agreed | yes | 2026-10-27 |
| 3 | Reuse or build new | Retarget the existing installer (`upgrade-kit` and the Cockpit) to user level: skills and commands into `~/.claude`, runtime in a version-stamped machine-wide folder, per-repo binding. Command names unchanged | Agreed | yes | 2026-10-27 |
| 4 | Smallest useful version | Step 0: live spike in a throwaway repo (do user-level commands/hooks load; which copy wins; do hooks run twice; does a Dock-launched VS Code on macOS find the launcher) plus the secret-path build gate; stop condition = return to item 3. Step 1: installer, launcher, hook rewrite, "Connect this project", `migrate` with undo, 3-OS CI, cheap version parts, run on the owner's repos from the command palette. Step 2: customers (Cockpit polish, help in six languages, teammate hint, remote/Mac/Linux notes, real-machine checks) | Agreed | yes | 2026-10-27 |
| 5 | 5a: what stays per repo | Code and rules global; identity, secrets and data per repo; the repo records the kit version it expects. Hook wiring moves to user level and self-gates on `.wxkanban-project.json`. `.claude/settings*.json` and `.husky/` stay per repo. The global folder is built only from the release artifact | Agreed | yes | 2026-10-27 |
| 6 | 5b: version skew | Latest by default; global folder keeps one previous version; a repo may pin with a new `kitPin` field; each repo stamps its data format and the kit refuses newer data; data migrations are lazy, per repo, with a backup | Agreed | yes | 2026-10-27 |
| 7 | 5c: repo-relative paths | A Node launcher (`~/.wxai/bin/wxai.mjs`) reads the repo's `.wxkanban-project.json`, picks the pinned or current kit, runs the script with cwd unchanged, exits quietly with no binding. The installer stamps its absolute path into the ~190 call sites. The `SessionStart` hook runs from the built bundle. A stable `current` alias serves read-only docs. Remote/container/WSL users install inside that environment | Agreed | yes | 2026-10-27 |
| 8 | 5d: moving existing installs | Launcher lookup = kit inside the repo, then pin, then current. `migrate`: dry run by default; moves files identical to the release (or its manifest) into `.wxai/kit-backup/<timestamp>/`, never deletes; keeps differing files; never runs git; refuses to remove git-tracked kit files unless the user confirms the team has the global kit; undo restores everything. **Corrected by rows 26-27:** the lookup order holds for scripts the launcher runs, not for commands, where the user copy wins | Agreed | yes | 2026-10-27 |
| 9 | 5e: secrets and binding | Five rules: identity only from the repo (no default, no cached project id); no secrets in the global folder or user settings; the release build fails on any secret-bearing path; the global folder is read-only while running; identity-free state only machine-wide, entitlement stays per repo | Agreed | yes | 2026-10-27 |
| 10 | 5f: Cockpit flow and help | Install once per machine; "Connect this project" per project; one check per machine, one-click install of the new version beside the old, lock file, reload notice; updates stay notify-and-confirm; legacy repos get a "move this project" row; `installCommands` and `impact.installHook` retired in global mode; help in six languages written with the build; retire the `/sync-global` page | Agreed | yes | 2026-10-27 |
| 11 | Fit and priority | Now: fix the `.wxai/.entitlement` release leak and add the secret-path gate, run the Step 0 spike, measure the token baseline. Next: Step 1, after the kit write-safety batch and SPEC-148 close and CI runs again. Later: Step 2 | Agreed | yes | 2026-10-27 |
| 12 | New requirements | The release secret-path build gate, the `kitPin` field, the `migrate` command, a 3-OS CI matrix, the token-baseline measurement | Added | yes | 2026-10-27 |
| 13 | Request versus agreed | "Make the kit global" became: code and rules global; identity, secrets and data per repo; one launcher | Changed | yes | 2026-10-27 |
| 14 | Pin field | The pin is a new `kitPin` field. Earlier proposals (`.wxkanban-version`, then `kitVersion`) were wrong: the first is the old rules marker, the second is already set in every repo to its installed version | Changed | yes | 2026-10-27 |
| 15 | Launcher invocation | Called by absolute path stamped by the installer; PATH is optional. Replaces "launcher on PATH" (macOS Dock-launched VS Code has a thin PATH; zip loses the exec bit) | Changed | yes | 2026-10-27 |
| 16 | Settings rule | `migrate` is the one exception to "never touch `.claude/settings.json`": it may remove only hook entries it can prove are the kit's own, with a diff shown and a backup | Changed | yes | 2026-10-27 |
| 17 | Claude Code plugin packaging | Declined: plugin skills are namespaced, so every command would become `/wxkanban:...` and every doc, rule and habit would change | Declined | no | 2026-10-27 |
| 18 | Reviving `/sync-global` | Declined: it was a manual two-way copy; its script and folder are gone | Declined | no | 2026-10-27 |
| 19 | Per-repo link or environment variable to find the kit | Declined: the launcher is more robust across Windows, macOS and Linux (symlink rights; pinning needs per-repo values) | Declined | no | 2026-10-27 |
| 20 | Silent updates | Declined for now: updates stay notify-and-confirm (SCOPE-083 decision) | Declined | no | 2026-10-27 |
| 21 | Dropping Blackbox AI support from the kit | Parked to a separate topic (touches SCOPE-019 and its dependants) | Parked | no | 2026-10-27 |
| 22 | Install without the Cockpit; other AI tools | Parked: later | Parked | no | 2026-10-27 |
| 23 | Lazy data-migration machinery | Parked until the first release that changes a data format (the stamp and refuse-newer check ship in Step 1) | Parked | no | 2026-10-27 |
| 24 | Rules and reference docs: global or in each repo | Parked: recorded as global with the version pin; not explicitly confirmed. The owner answers | Parked | no | 2026-10-27 |
| 25 | How long legacy (per-repo) installs stay supported | Parked: no end date for now; the owner answers | Parked | no | 2026-10-27 |
| 26 | Step 0 result: which command copy wins | The user-level copy wins over a repo copy of the same command (a repo copy ran only once the user copy was hidden). Corrects row 8: a global command shadows a legacy repo's command files, so those files do nothing once the global kit is installed, and a repo pin cannot select an older repo-side command file; the pin can only act at the launcher, which the global command text must call. Migration of commands becomes cleanup, not a behavior risk | Changed | yes | 2026-10-27 |
| 27 | Step 0 result: hooks | User-level and repo-level hooks both run, once each, at the same moment; neither replaces the other. Row 16 becomes required rather than optional: `migrate` must remove the repo hook entries it can prove are the kit's own, or every hook runs twice in a migrated repo | Changed | yes | 2026-10-27 |
| 28 | Step 0 result: what held | User-level commands load in a repo that has none of its own. A hook calling the launcher by absolute path ran from a non-interactive `claude -p` session on Windows, and exited quietly, printing nothing, in a folder with no `.wxkanban-project.json`. (User-level skills were already known to load.) Evidence: three throwaway folders, Claude Code 2.1.98, Windows, one run per case, Haiku model; the user's `settings.json` was restored byte-for-byte and `~/.wxai` was unchanged | Agreed | yes | 2026-10-27 |
| 29 | Step 0 gap: macOS and Linux | Not tested. The Dock-launched VS Code on macOS (thin PATH) check from row 15 needs a real Mac. A user-hook-versus-repo-hook conflict (same event, opposing results) and Claude Code versions other than 2.1.98 were also not tried | Parked | no | 2026-10-27 |

## Open items

- Rows 24 and 25 are open (see above).
- **Step 1 candidate:** PPE (`E:\AI_Development\PPE`), chosen by the owner. Read-only check on 2026-10-27: not a git repository (no history, nothing tracked, no teammates visible); kit v1.7.61, 25 releases behind v1.7.86; `mode: new`; has its own `node_modules`; `README_MAC_OS.md`; a stale `wxkanban-kit-...-v1.7.48.zip` and a legacy `.orchestrator-gateway.pid`. Consequences: no git undo, so make a plain copy of the folder before the first real run and rely on the `migrate` backup; no release manifest exists for v1.7.61, so unmodified-file detection must hash against the archived release of that version (availability of that asset is Unknown).
- **Step 0 spike: done 2026-10-27** on a throwaway folder and two empty folders (results: rows 26-29). Everything it created was removed. The stop condition (return to the plugin option) did not trigger.
- **Entitlement leak: fixed in the working tree 2026-10-27, not committed.** `scripts/sync-to-orchestrator.mjs` now skips secret-shaped names while mirroring and re-scans the staged tree, failing the release on any hit; the rules live in `scripts/release-secret-gate.mjs`, tests in `tests/unit/release-secret-gate.test.ts`. Run against the real script: the file was skipped, and with the first layer switched off the second layer failed the run. The published v1.7.83 and later assets are not touched by this and still carry the expired token. Fencing of the new code is unverified (see the status notes).
- This repository (wxKanban) is the kit source (`is_origin`) and is not a test target.

## Next step

Recorded only. Nothing is scoped yet. When Step 1 is next in the priority order, run `/buildscope` with this record
(`--from-md docs/brainstorms/2026-10-27-global-kit.md`); its reuse check decides between amending SCOPE-019,
SCOPE-112 and SCOPE-086 and writing a new scope. Everything after an approved scope runs through `/wxG-O-D`.
