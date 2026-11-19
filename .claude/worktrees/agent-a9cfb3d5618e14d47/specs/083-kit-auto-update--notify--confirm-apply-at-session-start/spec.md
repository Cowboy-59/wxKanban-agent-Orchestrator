# Spec 083: Kit auto-update — notify + confirm-apply at session start

## Overview

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

### FR-005 — Cockpit self-update advances with the kit

The system MUST refresh the bundled cockpit .vsix on every kit upgrade so `ensureCockpitUpToDate` can install the newer extension.

**Acceptance Criteria**:
- [ ] After an upgrade carrying a newer .vsix, the installed cockpit version equals the shipped version within one session (no stale-pin regression).

### FR-006 — "Could not check" is a distinct, visible state *(SCOPE-083 Amendment A)*

FR-001 makes every failure best-effort and silent. That was right about *exit status* and wrong about
*record-keeping*: `runCheck()` persists a network, CA, or authorization failure with exactly the shape
it persists a successful "you are up to date" — `upgradeAvailable: false` with both versions `null`.
Neither the banner nor the Cockpit row can tell the two apart, so a check that never happened reads to
the operator as a check that found nothing.

Reported from the field (`b54b281e`, kit v1.7.61 → v1.7.62): the consumer's cache said
`{upgradeAvailable: false, currentVersion: null, latestVersion: null}` while v1.7.62 was published and
the kit sat on v1.7.61. A negative that looks measured and is not is worse than no answer, because the
operator stops asking. This project would have stayed on v1.7.61 indefinitely.

Requirements:

- The status cache gains an explicit `outcome` field — `"checked"`, `"failed"`, or `"author-repo"` —
  and a short human-readable `lastError` (`null` on success). `null` versions alongside
  `outcome: "checked"` and `outcome: "failed"` are different facts and MUST be stored differently.
- `authorRepo` and `upgradeAvailable` keep their meaning and position, so a Cockpit built before this
  amendment reads a new cache correctly. A cache written before this amendment has no `outcome`; a
  reader MUST treat its absence as `"checked"`, which is the behavior those readers have today.
- A missing API token is a failed check, not a silent no-op. `runCheck()` currently returns without
  writing anything, so the Cockpit shows nothing and the network path re-runs every session. It MUST
  record `outcome: "failed"` with the reason. A missing `projectId` remains a silent no-op: that is
  genuinely "not a kit install", not a failed check.
- The Cockpit surfaces the failed state as its own row — "Kit update check failed" with the reason —
  rather than the silence it shows today. It stays advisory: the row never blocks and never
  auto-applies, consistent with FR-004.
- The TTL still applies to a failed check, so a persistent outage does not hammer the server once per
  session. The failure is recorded, not retried harder.

### FR-007 — Author detection uses the deterministic marker only *(SCOPE-083 Amendment A, supersedes FR-002's git-drift signal)*

FR-002 detects the author repo via "the check-kit-version git-drift signal": `isAuthorCheckout()`
returns true when `git status --porcelain -- wxkanban-agent mcp-server _wxAI` produces any line. The
intent was to spare a developer mid-edit. The effect is that the check disables itself in the field.

`git status --porcelain` reports **untracked** files, and the kit's own shipped
`templates/.gitignore.snippet` names none of `wxkanban-agent/node_modules/`, `wxkanban-agent/dist/`,
`mcp-server/node_modules/`, `mcp-server/dist/`, or `mcp-server/logs/`. A consumer who installs the
kit's dependencies once — that is, every consumer — has a permanently dirty tree under those three
paths and is classified as the kit author forever. The check then writes `authorRepo: true` with both
versions `null` and returns before any network call.

This was invisible to us because it cannot reproduce here. In the source repo all of those paths are
gitignored, so the drift signal is clean, and the primary marker fires first regardless. Success
Criterion 2 ("author-repo false-positive rate = 0") was satisfied by measuring the one repo where the
defect cannot occur. The criterion is restated below.

Requirements:

- `isAuthorCheckout()` tests one condition: the presence of `scripts/sync-to-orchestrator.mjs`. That
  file is author-only — `scripts/` is not mirrored to the orchestrator, so no consumer receives it —
  which makes the signal deterministic and independent of git state, working-tree cleanliness, and
  whether the project is a git repository at all.
- The `git status` spawn is removed, not narrowed. `--untracked-files=no` would only shrink the false
  positive to "a consumer who edits any tracked kit file"; a consumer applying a hotfix or a local
  patch under `wxkanban-agent/` is an ordinary event and must not silently disable their update check.
  Removing the spawn also drops a subprocess and a 5s timeout from every session start.
- `WXKANBAN_NO_KIT_UPDATE_CHECK` remains the opt-out for anyone working from a full clone without the
  marker. No new environment variable is introduced.
- Success Criterion 2 is restated as: the banner and Cockpit row are shown 0 times in the kit source
  repo **and** `authorRepo` is false in a consumer install whose kit dependencies are installed. Both
  halves must be exercised; the first alone is what let this ship.

### FR-008 — The MCP update tool reports a measured version or none *(SCOPE-083 Amendment A)*

`project.check_for_updates` is outside FR-001's session-start path but answers the same operator
question, and it answers it with fabricated data. In `mcp-server/src/utils/github-updater.ts`,
`getCurrentVersion()` is a literal `return '0.0.0'` carrying a live `TODO` — it has never read a
version — and `GITHUB_API_BASE` points at `Cowboy-59/wxKanban`, which is private and is not where kit
releases are published (`Cowboy-59/wxKanban-agent-Orchestrator` is). The unauthenticated request 404s,
which is the `error: "Could not fetch latest release"` the field report captured.

The two faults are load-bearing on each other. `compareVersions('0.0.0', anything)` is always `-1`, so
the only thing holding `updateAvailable` at `false` is the failing fetch. Correcting the repository URL
alone — the obvious one-line fix — would make every caller be told an update is available, forever.

That matters more than a wrong banner, because `project.upgrade_mcp` acts on this result.
`installUpdate()` resolves `MCP_SERVER_PATH` to `process.cwd()` and then `rm -rf`s entries inside it
before copying a downloaded tree over the top, via POSIX `ls`/`rm -rf`/`cp -r`. The MCP that consumers
actually use is the hosted one, so `process.cwd()` there is the shared server's own working directory,
and the tool is reachable by any caller holding the project-admin role. It is inert today only because
of the 404.

Requirements:

- `getCurrentVersion()` resolves the real installed version: `WXKANBAN_VERSION` when set — the existing
  pin ops already use for watermark provenance — else the `version` read from the MCP's own
  `package.json` at runtime. No literal fallback.
- When no version can be resolved the tool reports the current version as `null` and an explicit
  error. It MUST NOT substitute a comparable placeholder: `'0.0.0'` is not "unknown", it is "older than
  every release", and it is that substitution that arms the comparison.
- `updateAvailable` is `false` whenever either side of the comparison is unknown, and the response
  carries the reason. A comparison that could not be made is reported as such, in the same spirit as
  FR-006.
- The release source is the repository that actually publishes releases
  (`Cowboy-59/wxKanban-agent-Orchestrator`, public, reachable unauthenticated). A source that cannot
  be read is a misconfiguration, not a "no releases found", and is reported as a failed check.
- **The two versions are never compared.** Found while implementing, not in the original report: those
  published releases are orchestrator KIT versions (1.7.x), while the MCP server carries its own
  unrelated `0.x` version and has no release stream of its own — it deploys by pipeline on push.
  Comparing them is a category error that resolves to "behind" on every call. It is the same false
  positive `'0.0.0'` produced, reached by a second road, so correcting the repository URL *without*
  this guard would have re-armed precisely what the version fix was meant to disarm. The tool reports
  both versions as separate facts, sets `updateAvailable` false, and says which stream each belongs to.
- `project.upgrade_mcp` refuses to run against a hosted deployment and says why. Self-upgrade is a
  local-install affordance; on the hosted MCP the correct answer is that the server is deployed by its
  own pipeline and cannot be upgraded by a tool call. This precondition lands **with or before** the
  version fix, never after — the version fix is what would otherwise arm it.
- The tool's declared description stops implying coverage it does not have, so a caller asking "is my
  kit current" is not silently answered about something else.

### FR-009 — Kit-written artifacts do not enter the consumer's repository *(SCOPE-083 Amendment A)*

FR-001's status cache and SCOPE-121 FR-015's upgrade snapshot are both per-developer transient state
that the kit writes into `.wxai/` unprompted, and neither appears in `templates/.gitignore.snippet`.
In a consumer the cache is rewritten on every session start and the snapshot archive is retained two
deep, so both land untracked in the project's own repository and both show up in the operator's `git
status` as if they were their work.

There is a second-order cost specific to this scope: an untracked file under a kit path is exactly
what FR-007 shows can disable the update check. Artifacts the kit writes on its own initiative must not
dirty the tree it inspects.

Requirements:

- `templates/.gitignore.snippet` gains `.wxai/kit-update-check.json`, the
  `.wxai/kit-upgrade-snapshot-*` archives and their pre-Amendment-B expanded directories, and the
  `.wxai/kit-staging-*` remnant, alongside the entries it already carries.
- The snippet also covers the kit's own build and dependency output — `wxkanban-agent/node_modules/`,
  `wxkanban-agent/dist/`, `mcp-server/node_modules/`, `mcp-server/dist/`, `mcp-server/logs/` — which is
  the untracked content that produced the FR-007 false positive.
- The snippet remains advisory and paste-it-yourself. This scope does not rewrite a consumer's
  `.gitignore`: the kit does not own that file, and FR-007's fix means a consumer who never pastes it
  is no longer punished for it.

### Amendment B — the kit is current when the LOCAL kit says so (2026-10-09)

**Prompted by:** feedback `6d76a9fb` (root issue), `83738c5e`, `ecacc0c6` and `e8541c30` from
project `a899b6e4`. After a successful upgrade to v1.7.74, the server still reported v1.7.61 with
`upgradeAvailable: true`, so the Cockpit re-ran the full upgrade on every start.

**Verified cause:**
- `projectkits.kitversion` was written once, when the row was inserted
  (`KitGenerationService.ts`).
- `serve()` and `serveUpgrade()` never updated it, and neither did a regenerate.
- 150 of 153 rows were below the current release.
- The gateway check and the Cockpit both trusted the server's flag. The shipped
  `check-kit-version.mjs` already compared against the local version and was correct.

**Ship FR-010, FR-011 and FR-013 together.** FR-011's URL fix on its own would turn the failing
check on about 40 active consumers into a working check that trusts a stale record, which puts
them in the same upgrade loop.

### FR-010 — The server records the version it serves *(SCOPE-083 Amendment B)*

- After `GET /api/projects/:id/kit/download` or `/kit/upgrade` finishes streaming an archive,
  `projectkits.kitversion` MUST be set to the served release tag without its leading `v`, along
  with `updatedat`.
- A regenerate of an existing row MUST set `kitversion` to the server's bundled kit version
  (`wxkanban-agent/package.json`).
- The write is best effort. A failed write is logged and never fails the response.

### FR-011 — The gateway check compares against the local version and never defaults to localhost *(SCOPE-083 Amendment B)*

- **Version comparison.** `ensureKitUpToDate()` (`kit-update-check.ts`) MUST work out
  `upgradeAvailable` as "latest release is newer than the local `.wxkanban-project.json`
  `kitVersion`", falling back to `version`.
  - The server's `upgradeAvailable` is used only when no local version can be read.
  - The cached `currentVersion` is the local version.
- **API URL.** The URL resolves in this order:
  1. the `WXKANBAN_API_URL` environment variable;
  2. the kit `.env`;
  3. `.wxkanban-project.json` `wxkanbanApiUrl`;
  4. `https://wxkanban.wxperts.com`.

  This matches `check-kit-version.mjs`. It never falls back to `http://localhost:3001`.

### FR-012 — A successful upgrade clears the cached check *(SCOPE-083 Amendment B)*

- The shipped upgrader (the **orchestrator** repo's `scripts/upgrade-kit.mjs`, which is the copy
  consumers run) MUST delete `.wxai/kit-update-check.json` after it writes the new version to
  `.wxkanban-project.json`.
- This makes the next check measure again, instead of replaying "upgrade available" for up to
  the 6-hour cache window.

### FR-013 — The Cockpit starts an upgrade only when the release is newer than the local kit *(SCOPE-083 Amendment B)*

- `checkKitUpdate()` (`vscode-extension/src/services/kitUpdate.ts`) MUST work out "update
  available" the same way: cached `latestVersion` newer than the local `kitVersion`. It falls
  back to the cached flag only when either version is missing.
- An unattended start (FR-006 / T006) therefore never runs over a kit that is already current.
- The upgrade's own exit code 2 ("files left for review") is unchanged. It is a real, one-time
  prompt per upgrade, and the Cockpit runs the upgrade in a terminal without reading the exit
  code.

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
2. Author-repo false-positive rate = 0: banner and Cockpit row shown 0 times in the kit source repo, **and** `authorRepo` false in a consumer install whose kit dependencies are installed (SCOPE-083 Amendment A FR-007 — the source-repo half alone cannot detect the false positive).
3. One-action apply success: a single action completes download→extract→apply→preserve→re-stamp→re-sync at ≥95% on a reachable network.
4. Cockpit advances with the kit: installed cockpit version equals the shipped version within one session after an upgrade.
5. Zero added session-start cost when current: no network call and no perceptible delay with a fresh cache or up-to-date kit.

## Key Entities

- **Kit update status cache** — the `.wxai/kit-update-check.json` record: `{ checkedAt, upgradeAvailable, authorRepo, currentVersion, latestVersion, releaseUrl, outcome, lastError }`. Written by the kit's session-start check; read by both the CLI banner and the Cockpit row. `outcome` (`"checked"` / `"failed"` / `"author-repo"`) and `lastError` were added by SCOPE-083 Amendment A FR-006; a record written before that amendment omits both and is read as `"checked"`.
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


## Business Problem

Describe the concrete customer or operator pain point this scope solves. Replace this paragraph with specific language describing the current friction, the desired outcome, and why this work is being prioritized now.

## Actors

- Primary: Operator who initiates this workflow as part of their daily responsibilities and depends on the result for downstream decisions.
- Secondary: Reviewing engineer, dependent service, or stakeholder who consumes or validates the output produced by this scope.

## Success Metrics

1. Outcome 1 — replace with a concrete target that includes a number, percentage, or timing threshold (e.g., "Reduce X by 30%" or "Complete Y within 2 minutes").
2. Outcome 2 — replace with a second measurable metric covering reliability, throughput, or operator-visible behavior.
3. Outcome 3 — replace with a third measurable metric covering correctness, audit, or downstream impact.

## Scope Boundary

This scope covers the specific files, modules, or workflows listed here. Replace this paragraph with the concrete set of code surfaces, screens, or APIs that this iteration changes. Reference paths where helpful.

## Out of Scope

Items deliberately deferred to future scopes. Replace this paragraph with the concrete list of things this iteration does NOT change, including any cross-cutting concerns (publishing, migration, UI polish) that need their own scope.

## Open Questions

None at this time. Add open questions as they arise during scope review; resolve each one with a written decision before promoting the scope.

## Functional Requirements

### FR-001 — Replace with first requirement title

Describe the requirement in concrete behavioral terms. The system MUST do something specific, observable, and testable.

**Acceptance Criteria**:
- [ ] criterion 1 — what the operator can do
- [ ] criterion 2 — what the system persists or exposes

## Phase

**Current Phase**: implementation
**Priority**: medium

## Status

- **Date**: 2026-07-01
- **Phase**: implementation
