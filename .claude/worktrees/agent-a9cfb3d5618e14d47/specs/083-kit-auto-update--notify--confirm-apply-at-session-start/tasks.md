# Task Breakdown: Kit auto-update — notify + confirm-apply at session start

**Feature**: Kit auto-update — notify + confirm-apply at session start
**Spec**: 083
**Date Generated**: 2026-07-01
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001: Session-start kit-update check (ensureKitUpToDate) + entry-point wiring | high | done |
| 2 | T002: upgrade-kit --from-server download/extract apply mode | high | done |
| 3 | T003: Dev Cockpit "Kit update available" row + upgradeKit command | high | done |
| 4 | T004: Cockpit self-update reliability — refresh bundled .vsix on upgrade | medium | done |
| 5 | T005: Fence traceability + auditfences baseline re-capture | medium | todo |
| 6 | T006: Cockpit-owned kit install state + unattended start | high | done |
| 7 | T007: Consumer-token access to /kit/download | high | done |
| 8 | T008: Bootstrap a kit into a kit-less workspace | high | done |
| 9 | T009: Safety guards on unattended start (dirty tree) | high | done |
| 10 | T010: Distinguish "could not check" from "no update" (cache + Cockpit row) | high | done |
| 11 | T011: Author detection by deterministic marker only | high | done |
| 12 | T012: MCP update tool reports a measured version; self-upgrade disarmed | high | done |
| 13 | T013: Kit-written artifacts gitignored by default | medium | done |

## Task Details

### T010 — Distinguish "could not check" from "no update" *(Amendment A, FR-006)*

`.wxai/kit-update-check.json` gains `outcome` (`checked` / `failed` / `author-repo`) and `lastError`;
`httpGetJson` reports why it failed instead of collapsing to `null`; a missing API token is recorded as
a failed check rather than a silent no-op. The Cockpit gains a `check-failed` install state, a "Kit
update check failed" tree row naming the reason, and a `wxkanban.cockpit.recheckKit` command that runs
`scripts/check-kit-version.mjs` in a visible terminal. A cache with no `outcome` still reads as
`checked`, so an older kit paired with a newer Cockpit is unaffected. Covered by
`wxkanban-agent/tests/unit/kit-update-check.test.ts` and `vscode-extension/tests/kitUpdate.test.ts`
(the latter drives the kit's own writer and feeds the real bytes to the Cockpit reader). FR-006.

### T011 — Author detection by deterministic marker only *(Amendment A, FR-007)*

`isAuthorCheckout()` tests only for `scripts/sync-to-orchestrator.mjs`. The `git status --porcelain`
drift signal is removed: `--porcelain` lists untracked files, so the kit's own installed
`node_modules/` and `dist/` classified every consumer as the kit author and disabled the check
permanently. Regression test constructs the consumer shape explicitly (a git repo, dirty under the kit
paths, no marker) and asserts `authorRepo: false`; it fails against the pre-amendment code. FR-007.

### T012 — MCP update tool reports a measured version *(Amendment A, FR-008)*

`getCurrentVersion()` resolves `WXKANBAN_VERSION` else the MCP `package.json` at runtime, and returns
`null` rather than the `'0.0.0'` placeholder it had hardcoded behind a TODO. The release source moves
to `Cowboy-59/wxKanban-agent-Orchestrator` (public, reachable). Those releases are KIT versions and the
MCP is on an unrelated `0.x` line deployed by pipeline, so the two are reported as separate facts and
never compared — a comparison would resolve to "behind" on every call. `installUpdate()` refuses
unless `MCP_ALLOW_SELF_UPGRADE=true`, because it `rm -rf`s inside `process.cwd()` — the hosted
server's own directory — on behalf of any project-admin caller. Covered by
`mcp-server/tests/github-updater.test.ts`, including that the refusal leaves the filesystem untouched.
FR-008.

### T013 — Kit-written artifacts gitignored by default *(Amendment A, FR-009)*

`templates/.gitignore.snippet` gains `.wxai/kit-update-check.json`, `.wxai/kit-upgrade-snapshot-*`,
`.wxai/kit-staging-*`, and the kit's own `node_modules/`, `dist/` and `logs/` output — the untracked
content that produced the T011 false positive. The snippet remains advisory; no consumer `.gitignore`
is rewritten. FR-009.

### Amendment B verification (2026-10-09) — T014–T017 done

| Task | How it was verified |
|---|---|
| T014 | Endpoint test through the real routes (run-wxkanban server, Wxperts project wxWorkBench). Before: `latest-version` gave `currentVersion 1.7.61`, `upgradeAvailable true`. Then `/kit/upgrade` served a 2.7 MB zip. After: `1.7.74`, `upgradeAvailable false`. The row was restored to `1.7.61` afterwards. |
| T015 | 4 new unit tests in `kit-update-check.test.ts`, run against a local server that returns production's stale answer. All 4 fail on the old code and pass on the new (11/11 overall). |
| T016 | 2 new tests in the orchestrator's `upgrade-kit-preservation.test.mjs`. The deletion test fails on the old script and passes on the new (21/21 overall). |
| T017 | 2 new tests in the Cockpit's `kitUpdate.test.ts`, using the customer's exact cache. They fail on the old code and pass on the new (68/68 Cockpit tests overall). |

### T014 — Server records the served kit version *(Amendment B, FR-010)*

- `KitProxyService.serve()` and `serveUpgrade()`: after the archive has streamed, set
  `projectkits.kitversion` to the tag without its `v`, plus `updatedat`. Best effort; a failure is
  logged.
- `KitGenerationService.generateKit()`: the existing-row branch also sets `kitversion: KIT_VERSION`.
- One-off data correction already applied for project `a899b6e4`: `1.7.61` → `1.7.74`.

### T015 — Gateway check: local-version comparison, production default URL *(Amendment B, FR-011)*

`wxkanban-agent/core/orchestrator/kit-update-check.ts`:
- `upgradeAvailable` is worked out from the local `.wxkanban-project.json` `kitVersion` (falling back
  to `version`). The server's flag is used only when there is no local version.
- `resolveApiUrl` falls back through `.wxkanban-project.json` `wxkanbanApiUrl`, then
  `https://wxkanban.wxperts.com`.
- Unit tests cover both.

### T016 — Upgrader clears the cached check *(Amendment B, FR-012)*

The orchestrator repo's `scripts/upgrade-kit.mjs` deletes `.wxai/kit-update-check.json` right after
`updateProjectConfigVersion()` writes the new version. It does not do this on a dry run.

### T017 — Cockpit: local-version comparison before an unattended start *(Amendment B, FR-013)*

`vscode-extension/src/services/kitUpdate.ts`: `checkKitUpdate()` compares the cached `latestVersion`
with the local `kitVersion`. It reports `updateAvailable` only when the release is newer, and shows
the local version as current.

### T001 — T001: Session-start kit-update check (ensureKitUpToDate) + entry-point wiring

New wxkanban-agent/core/orchestrator/kit-update-check.ts exporting ensureKitUpToDate: throttled once-per-process + ~6h cache in .wxai/kit-update-check.json, runs check-kit-version.mjs --json in the background, prints notify banner on upgrade-available, silent in the author repo via the git-drift signal, WXKANBAN_NO_KIT_UPDATE_CHECK opt-out. Wired into cli.ts --help branch and http.ts gateway boot next to ensureCockpitUpToDate. FR-001, FR-002.

### T002 — T002: upgrade-kit --from-server download/extract apply mode

Add --from-server (and --version) to scripts/upgrade-kit.mjs: download release tarball from GET /api/projects/:id/kit/download?platform=unix (TLS-trust + token/url resolution), extract via tar -xzf to a temp dir, treat the extract root as --source through the existing copy/preserve/install pipeline; keep the confirm prompt; clean up temp on all exits. FR-003.

### T003 — T003: Dev Cockpit "Kit update available" row + upgradeKit command

Add vscode-extension/src/services/kitUpdate.ts (reads the .wxai/kit-update-check.json cache), a CockpitNode kind kit-update row in cockpitTreeProvider.ts (shown only when an update is available and not the author repo), and the wxkanban.cockpit.upgradeKit command in extension.ts + package.json that runs upgrade-kit --from-server in an integrated terminal. FR-004.

### T004 — T004: Cockpit self-update reliability — refresh bundled .vsix on upgrade

Fix scripts/upgrade-kit.mjs so it copies the source vscode-extension/*.vsix into the consumer on every upgrade (KIT_DIRS excludes vscode-extension), so ensureCockpitUpToDate can advance the installed cockpit instead of staying pinned at the first-install version. FR-005.

### T005 — T005: Fence traceability + auditfences baseline re-capture

Bring the out-of-band code under fences via implement, and re-capture the auditfences legacy baseline (.wxai/auditfences-legacy.json) since editing cli.ts/http.ts un-baselined their pre-existing unfenced functions. Verify auditfences is clean for the changed files.

### T006 — T006: Cockpit-owned kit install state + unattended start

Amendment A. Add resolveKitInstallState()/ensureKitInstalled()/consumeCockpitVersionChange() to vscode-extension/src/services/kitUpdate.ts and call ensureKitInstalled from activate(). Resolves the workspace into no-kit / behind / blocked / ok, tracks the extension version in globalState so a Marketplace self-update becomes an observable trigger, and starts the visible upgrade terminal without waiting for a click. FR-006.

### T007 — T007: Consumer-token access to /kit/download

Widen GET /api/projects/:id/kit/download in src/server/routes/kitRoutes.ts from authenticateToken (JWT only) to the existing authenticateProjectKitAccess middleware (JWT first, project-scoped API-token fallback, cross-project 403). The Cockpit holds only an API token, so without this it cannot download a kit at all. FR-007.

### T008 — T008: Bootstrap a kit into a kit-less workspace

Add bootstrapKit() + the wxkanban.cockpit.installKit command and a "No kit installed — Install" tree row. Prompts for project id + API token, stores the token in SecretStorage, downloads the release archive to a temp file, then unpacks and runs the existing scripts/init.mjs in a visible terminal. Adds the wxkanban.cockpit.apiUrl setting for the app API base URL. FR-008.

### T009 — T009: Safety guards on unattended start (dirty tree)

Add hasUncommittedChanges() to vscode-extension/src/services/gitStatus.ts and gate every unattended start on it, alongside the existing author-repo and WXKANBAN_NO_KIT_UPDATE_CHECK guards. A blocked start degrades to a "Kit update waiting — Install" row naming the reason, never a silent skip. FR-009.
