# Spec 083: Kit auto-update — notify + confirm-apply at session start

**Spec Number**: 083
**Status**: `draft`
**Created**: 2026-07-01
**Depends On**: None

## Overview

At session start the kit detects a newer published kit release and surfaces it as a notification with a one-click / one-command apply — it never overwrites files silently. It also keeps the Dev Cockpit extension's self-update advancing whenever the kit is upgraded. The check is silent and a no-op in the kit author/source repo.

Today a consumer only gets a new kit if they remember to run check-kit-version and then upgrade-kit by hand, so new commands, skills, and fixes we ship sit unused because nobody knows they exist. The Dev Cockpit .vsix self-installs, but the far larger kit (wxkanban-agent + mcp-server + _wxAI + skills) has no equivalent surfacing, so the fleet drifts behind the latest release. A separate latent bug also meant the cockpit itself stayed pinned at its first-install version after kit upgrades because upgrade-kit never refreshed the bundled .vsix.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Kit consumer / developer working in a wxKanban-scaffolded project (the done-with-you customer) |
| **Secondary Actors** | wxKanban kit author — must be reliably excluded, never prompted to self-upgrade the source repo; Dev Cockpit VS Code extension — surfaces the update row and self-updates on apply |
| **Key Value** | New commands, skills, and fixes reach the fleet promptly instead of drifting behind, without ever silently overwriting a consumer's working tree or nagging the kit author. |
| **Scope Boundary** | A best-effort, throttled session-start check (ensureKitUpToDate) reusing check-kit-version, cached ~6h in .wxai/kit-update-check.json, printing a notify banner and surfacing a Cockpit apply row; a consumer-actionable upgrade-kit.mjs --from-server apply path; a cockpit .vsix refresh on every upgrade. Author-repo exclusion via git-drift signal + WXKANBAN_NO_KIT_UPDATE_CHECK. |

## User Scenarios & Testing

### US1 — Consumer is notified of a newer kit at session start

**Actor**: Kit consumer / developer

**Scenario**:
1. A newer kit release is published; the consumer's project is behind it.
2. On the next session start (CLI --help or gateway boot), the kit runs its throttled check and finds a newer version on the server.
3. A single, clear `[kit] Update available: X -> Y` banner is printed with the apply command, and the Dev Cockpit shows a "Kit update available — Install" row.

**Expected outcome**: The banner appears on the first session start after the release, within the ≤10s check budget, for ≥95% of sessions where the server is reachable.

### US2 — Author/source repo is never prompted

**Actor**: wxKanban kit author (secondary)

**Scenario**:
1. The kit author works in the source-of-truth repo (dirty/ahead kit tree).
2. The session-start check runs and detects git drift (or the WXKANBAN_NO_KIT_UPDATE_CHECK opt-out is set).
3. No banner is printed and no Cockpit row is shown.

**Expected outcome**: Across sessions in the kit source repo, the banner and Cockpit row are shown 0 times.

### US3 — Consumer applies the update in one action

**Actor**: Kit consumer / developer

**Scenario**:
1. From the notification, the consumer runs `upgrade-kit.mjs --from-server` (or clicks the Cockpit row, which runs it in a terminal).
2. The kit downloads the release tarball, extracts it, and runs the existing copy/preserve/install pipeline, keeping the confirm prompt.
3. The upgrade preserves .env/config, re-stamps kitVersion/kitReleaseSha, re-syncs slash commands, and refreshes the bundled cockpit .vsix.

**Expected outcome**: The consumer completes the upgrade with a single action at ≥95% success on a reachable network; the installed cockpit advances to the shipped version within one session.

## Functional Requirements

### FR-001 — Session-start update surfacing

The system MUST, at the guaranteed session entry points (CLI `--help`, gateway boot), run a best-effort, once-per-process, time-cached (~6h) check that reuses check-kit-version and prints a single notify banner when the server reports a newer kit release.

**Acceptance Criteria**:
- [ ] A newer server version produces exactly one banner with current→latest and the apply command.
- [ ] With a fresh (<6h) cache or an up-to-date kit, no network call is made and session start is not perceptibly delayed.
- [ ] Any failure (network, CA, missing token) is swallowed and never affects the caller's exit status.

### FR-002 — Author/source-repo exclusion and opt-out

The system MUST NOT surface an update in the kit author/source repo, detected via the check-kit-version git-drift signal, and MUST honor a `WXKANBAN_NO_KIT_UPDATE_CHECK` opt-out.

**Acceptance Criteria**:
- [ ] A dirty/ahead kit tree yields no banner and no Cockpit row (authorRepo=true cached).
- [ ] Setting WXKANBAN_NO_KIT_UPDATE_CHECK suppresses the check entirely.

### FR-003 — Consumer-actionable apply from the server

The system MUST provide `upgrade-kit.mjs --from-server` that downloads the release tarball from `GET /api/projects/:id/kit/download`, extracts it, and applies it through the existing copy/preserve/install pipeline while keeping the interactive confirm.

**Acceptance Criteria**:
- [ ] Apply preserves .env/config, re-stamps kitVersion/kitReleaseSha, and re-syncs slash commands.
- [ ] The confirm prompt is shown unless --yes is passed; the temp download is cleaned up on all exits.

### FR-004 — Cockpit surface

The system MUST show a Dev Cockpit "Kit update available — Install" row (sourced from the .wxai cache, no extra network call) and a `wxkanban.cockpit.upgradeKit` command that runs the from-server apply in an integrated terminal.

**Acceptance Criteria**:
- [ ] The row appears only when the cache marks an update available and not an author repo.
- [ ] Clicking it opens a terminal running the upgrade; the row clears after a successful apply + refresh.

### FR-005 — Cockpit self-update advances with the kit — **SUPERSEDED by SCOPE-086 (2026-07-25)**

> **OBSOLETE — do not implement.** This requirement assumed the kit ships the cockpit
> `.vsix` and drags the extension forward (kit → cockpit). **SCOPE-086 made the Dev Cockpit
> Marketplace-only**: `build-release.mjs` no longer packs a `.vsix`, the orchestrator repo has
> no `vscode-extension/` directory, and the Cockpit installs and self-updates from the VS Code
> Marketplace by extension ID. The dependency has **inverted** — the Cockpit now advances on
> its own and the *kit* is the laggard. The reverse direction (cockpit → kit) is specified in
> **Amendment A / FR-006–FR-008** below.

~~The system MUST refresh the bundled cockpit .vsix on every kit upgrade so `ensureCockpitUpToDate` can install the newer extension.~~

**Acceptance Criteria**: *(void — superseded)*

## Data Requirements

No new or modified database tables. The session-start check persists its result to a local filesystem cache file `.wxai/kit-update-check.json` (not a DB table). Existing kit-version data (`projectkits`, wxkanban-agent/package.json version) is read-only and unchanged by this scope.

## API Routes

No new or modified API routes. This scope only *consumes* two existing endpoints, both unchanged:
- `GET /api/projects/:id/kit/latest-version` — version comparison (via check-kit-version.mjs).
- `GET /api/projects/:id/kit/download` — release tarball download (via upgrade-kit.mjs --from-server), served by KitProxyService when `KIT_DOWNLOAD_SOURCE=orchestrator`.

## Frontend Components

No React SPA components are added or modified. The user-facing surfaces are:
- CLI/terminal: a notify banner printed by `ensureKitUpToDate` (wxkanban-agent/core/orchestrator/kit-update-check.ts).
- VS Code Dev Cockpit (a separate extension, not the React app): a new tree row "Kit update available — Install" (CockpitNode kind `kit-update` in cockpitTreeProvider.ts) and the `wxkanban.cockpit.upgradeKit` command (extension.ts), backed by the `kitUpdate.ts` service.

## Success Criteria

1. Surfacing latency: the update banner appears on the first session start after the release (within the ≤10s check budget) for ≥95% of reachable-server sessions.
2. Author-repo false-positive rate = 0: banner and Cockpit row shown 0 times in the kit source repo.
3. One-action apply success: a single action completes download→extract→apply→preserve→re-stamp→re-sync at ≥95% on a reachable network.
4. Cockpit advances with the kit: installed cockpit version equals the shipped version within one session after an upgrade.
5. Zero added session-start cost when current: no network call and no perceptible delay with a fresh cache or up-to-date kit.

## Key Entities

- **Kit update status cache** — the `.wxai/kit-update-check.json` record: `{ checkedAt, upgradeAvailable, authorRepo, currentVersion, latestVersion, releaseUrl }`. Written by the kit's session-start check; read by both the CLI banner and the Cockpit row.
- **Kit release** — an existing published kit version (wxkanban-agent/package.json version + GitHub release tarball); referenced, not introduced by this scope.

## Constraints

- MUST deliver only the behavior in the scope boundary and keep silent/unattended auto-apply, release-publishing changes, generated-doc refresh, and hosted-MCP upgrade out of scope.
- MUST be best-effort: a network/CA failure never blocks session start or any command.
- MUST NOT change the release build/publish flow, GitHub assets, or `KIT_DOWNLOAD_SOURCE` server config — only consume them.
- Extraction depends on `tar` (present on Win10 1803+, macOS, Linux); the download forces tar.gz so no zip path is needed.

## Notes

- Integration: mirrors the ensureCockpitUpToDate pattern (cockpit-refresh.ts), same entry points (cli.ts, http.ts); reuses check-kit-version.mjs, KitProxyService + /kit/download, upgrade-kit.mjs pipeline, install-claude-commands.mjs; ships via sync-to-orchestrator.mjs (inside a KIT_DIR). Cockpit follows the SCOPE-060 setup-row pattern; .wxai/kit-update-check.json is the extension↔kit handoff.
- Risks: author-repo safety is critical (git-drift guard + env opt-out + notify-only); requires KIT_DOWNLOAD_SOURCE=orchestrator server-side; fencing/traceability debt — code was built out-of-band and this scope brings it under implement (editing cli.ts/http.ts un-baselined their pre-existing unfenced functions, so an auditfences baseline re-capture is expected alongside implement).

## Clarifications

### Session 2026-07-01

| # | Question | Decision |
|---|----------|----------|
| 1 | Silent auto-apply or notify+confirm? | Notify + confirm only; silent auto-apply explicitly rejected. |
| 2 | Author repo behavior? | Silent no-op via git-drift signal + WXKANBAN_NO_KIT_UPDATE_CHECK. |
| 3 | How do no-source consumers apply? | upgrade-kit.mjs --from-server downloads + extracts the release tarball, then runs the existing pipeline. |
| 4 | Data/API/UI footprint? | No DB tables, no new API routes, no React components; a local JSON cache + a VS Code Cockpit row + a CLI banner. |

---

# Amendment A — Cockpit-driven kit install (2026-07-25)

**Trigger:** *"can we make the cockpit install the Kit on update?"*

**Why now.** Three assumptions under the original scope have broken:

1. **The version-flow direction inverted.** FR-005 assumed kit → cockpit (the kit shipped the
   `.vsix`). SCOPE-086 made the Cockpit **Marketplace-only**, so the Cockpit self-updates and
   the *kit* now lags. FR-005 is marked superseded above.
2. **Chicken-and-egg.** FR-004's Cockpit row is driven entirely by `.wxai/kit-update-check.json`,
   which only exists if **the kit already ran** its session-start check. A kit predating
   FR-001, a kit whose session-start branch never fires, or **no kit at all** leaves the Cockpit
   showing nothing and the user with no path forward.
3. **No "on update" hook.** The extension's `activate()` has no previous-version tracking, so
   "when the Cockpit updates" is not currently an observable event.

**Decisions (this amendment):**

| # | Question | Decision |
|---|----------|----------|
| A1 | Which trigger? | All three — cockpit-version-change, kit-update-available, **and bootstrap when no kit exists**. |
| A2 | Consent model? | **Visible terminal, auto-started.** Reverses "user must click", *retains* "user must see". Silent background application remains rejected. |
| A3 | Record as? | Amendment to this scope, not a new scope — same subject, same cache, same apply pipeline. |

### Overrides to the original body

- **API Routes** — the original text ("No new or modified API routes") **no longer holds**.
  `GET /api/projects/:id/kit/download` changes its auth middleware (FR-007). No new route,
  no changed request/response shape.
- **Constraints** — "keep silent/unattended auto-apply out of scope" is **narrowed**, not
  removed: *unattended initiation* is now in scope; *invisible application* stays out. The
  user always watches the apply run in an integrated terminal.
- **Clarification 1 (2026-07-01)** — "silent auto-apply explicitly rejected" still stands as
  written. Auto-**starting** a visible terminal is not silent auto-apply.

### FR-006 — Cockpit-owned install state resolution

The Cockpit MUST resolve its workspace into exactly one of three states on activation and act
without requiring the kit to have run first.

| State | Detection | Action |
|-------|-----------|--------|
| A — no kit | no `.wxkanban-project.json` in any workspace folder | bootstrap (FR-008) |
| B — kit behind | `.wxai/kit-update-check.json` marks an upgrade available, not author repo | auto-start `node scripts/upgrade-kit.mjs` in a terminal |
| C — cockpit updated | stored last-seen extension version ≠ current `package.json` version | force a fresh version check, then fall through to B if behind |

**Acceptance Criteria**:

- [ ] State C fires exactly once per Cockpit version change and not again on subsequent reloads.
- [ ] State B no longer requires a click; the terminal opens on its own.
- [ ] A workspace with an up-to-date kit performs no network call and shows no new UI.

### FR-007 — Consumer-token access to the kit download

`GET /api/projects/:id/kit/download` MUST accept a project-scoped API token in addition to a
login JWT, so the Cockpit (which holds only an API token in SecretStorage) can fetch the kit.

**Acceptance Criteria**:

- [ ] The route uses the existing `authenticateProjectKitAccess` middleware (JWT first, API-token
      fallback) — no new authentication code is written.
- [ ] A token scoped to a different project receives 403.
- [ ] Existing browser/JWT downloads are byte-identical and unaffected.

### FR-008 — Bootstrap into a kit-less workspace

Where no kit is present, the Cockpit MUST be able to establish one end to end.

**Acceptance Criteria**:

- [ ] Prompts for the project API token via the existing sign-in input path and stores it in SecretStorage.
- [ ] Downloads and extracts the release archive into the workspace root.
- [ ] Runs the existing `scripts/init.mjs` (deps + `.mcp.json` registration + gateway + cockpit,
      already PID-guarded) rather than reimplementing any of that behaviour.

### FR-009 — Safety guards on unattended start

Because the apply pipeline overwrites files in the consumer's working tree, **every** guard MUST
pass before anything starts automatically. Any failed guard degrades to the FR-004 click-to-install
row with a stated reason — never a silent skip.

**Acceptance Criteria**:

- [ ] Author/source repo: nothing auto-starts (existing `authorRepo` signal).
- [ ] `WXKANBAN_NO_KIT_UPDATE_CHECK` suppresses all three states.
- [ ] **Uncommitted changes in the working tree: nothing auto-starts.** The row explains why.
- [ ] Throttled to at most one automatic start per window session.

### Amendment success criteria

6. Bootstrap completion: a Cockpit installed into an empty folder reaches a working, MCP-registered
   kit in one guided action, ≥95% on a reachable network.
7. Skew closure: after a Cockpit version change, the kit reaches the matching release within one
   session, or states why it did not.
8. Zero unattended writes over a dirty tree: 0 automatic starts observed with uncommitted changes present.

### Amendment notes

- **`project.download_kit` (MCP) is not usable for this** and is not fixed here. It returns a bare
  relative path (`/api/projects/:id/kit/download`) with no credential and a cosmetic 24-hour
  `expiresAt` — it restates a known URL without helping the caller authenticate. Logged as a
  separate defect.
- **Shipping is three channels:** server change → push to main (auto-deploys); Cockpit → version
  bump **plus `vsce publish`** (Marketplace-only since SCOPE-086, so a bump alone ships nothing);
  kit release only if kit-side files change.
