# Spec 121: Kit Upgrade File Preservation

**Spec Number**: 121
**Status**: `planned`
**Created**: 2026-08-04
**Scope**: [SCOPE-121](../Project-Scope/121-kit-upgrade-file-preservation.md)
**Depends On**: SPEC-019 (Agent Orchestrator Kit)

## Overview

The kit-shipped `scripts/upgrade-kit.mjs` silently reverts consumer work on every upgrade and exits 0.
It extracts the release archive over the project root — `Expand-Archive -Force` on Windows, `tar -xzf`
with `cwd=root` elsewhere — so every file the archive ships lands on top of whatever the consumer had
at that path, `package.json` included. There is no provenance record, no backup, no manifest of what
changed, and no warning.

Overlay extraction is the less destructive of the two possible designs: project-only files with no
archive counterpart survive untouched. But it is equally blind. It cannot distinguish a
consumer-modified file from a pristine one, so it overwrites both without a word.

Critical implementation note: the script consumers run is **not** `wxKanban/scripts/upgrade-kit.mjs`.
That file is a separate author-side lineage that delete-and-replaces whole directories. The shipped
script lives in the `wxKanban-agent-Orchestrator` repository and overlays instead. Diagnosing or
fixing this defect against the wxKanban copy changes nothing for any consumer and produces wrong
conclusions; it already did once during triage of the reports behind this spec.

## Business Problem

The kit's promise is that upgrading is safe and routine, and the auto-update notify banner from
SCOPE-083 actively encourages consumers to upgrade on sight. That prompt currently walks users into
unannounced data loss, so the more successfully upgrade adoption is driven, the more consumer work is
destroyed.

Five independent high-severity field reports arrived within twenty minutes on 2026-08-04, from five
unrelated projects. One project has been hit on three consecutive upgrades — v1.7.39, v1.7.44,
v1.7.48 — losing the same two `package.json` entries each time. Another lost seven project-added npm
scripts and now maintains a restore script with a CI gate simply to survive upgrading.

The failure has already caused a production outage: an upgrade dropped `pg` and `mssql` from a
consumer manifest and their API server died with `Cannot find package 'mssql'`. That case surfaced
immediately only by luck. The general case is delayed and therefore far easier to ship, because
`node_modules` still contains the dropped package so builds and tests keep passing; the loss only
bites at the next `npm install`, which prunes the now-undeclared dependency.

For conversion projects the damage is worse than a broken build. A reverted conversion script does not
error — it produces wrong output that still reports success. A reverted `pcsoft-doc-split.py` writes
zero table files and loses an entire 45-table data model while the console summary reads clean.

## Actors

- Primary: A developer upgrading the kit in an existing wxKanban-managed project, whose local repairs, custom scripts, and package.json entries are currently reverted without notice
- Secondary: The kit maintainer who owns the release archive and cuts the sync-to-orchestrator release; the Dev Cockpit "Kit update available" install row and the ensureKitUpToDate notify banner, both of which invoke the upgrade; the wxKanban kit download endpoint that serves the archive

## Success Metrics

1. An upgrade against a synthetic consumer tree containing a modified kit file, a project-only file, and a customized `package.json` leaves all 3 intact and names each in its manifest — 0 silent replacements.
2. 0 kit-shipped files whose on-disk content differs from the recorded install hash are overwritten without being reported, enforced by CI tests on both the Windows and non-Windows extraction branches.
3. 100% of upgrade runs print a snapshot location and a change manifest, with no code path exempt.
4. A clean clone plus `npm ci` of an upgraded consumer project builds with 100% of the consumer's own scripts and declared dependencies still present.
5. Snapshot disk growth is bounded at 2 retained snapshots per project, pruned on the next successful upgrade.
6. 0 upgrade runs complete with exit 0 while at-risk files were replaced, unless an explicit logged `--yes` override was passed.

## Scope Boundary

In scope:

- A `.wxai/kit-manifest.json` provenance record carrying a SHA-256 per kit-shipped file, written at install and at every upgrade.
- Consulting that manifest before extraction lands, so a consumer-modified file is not overwritten in place, on both the `Expand-Archive` and `tar -xzf` branches.
- An unconditional pre-upgrade snapshot on every upgrade path, with its absolute location printed and a retention of the last 2.
- A post-extraction change manifest naming every replaced modified file, every `*.kit-new` written, and every stale-file deletion, with a prompt or non-zero exit when that set is non-empty.
- `package.json` merged instead of overwritten, preserving unknown keys and consumer-declared dependencies.
- A preserve list for `.claude/<skill>/scripts/` and `_wxAI/rules/`, writing kit versions as `*.kit-new` beside the consumer's file.
- Closing the warning asymmetry where the GitHub fallback gates on `--confirm-overwrite` but the normal wxKanban path has no gate at all.
- Making `--dry-run` perform the real comparison instead of only listing what it would fetch.
- A server-side 409 gate on `GET /api/projects/:id/kit/upgrade` so consumers on or below the delivering version are not clobbered by the upgrade that carries the fix, plus the per-project acknowledgement that clears it.
- Delivery through the existing `sync-to-orchestrator --release` path into the orchestrator repository, coordinated with the wxKanban server deploy that carries the gate.

## Out of Scope

Explicitly excluded from this spec:

- Three-way merge or conflict-marker resolution of modified files. The upgrade reports and preserves; it never auto-merges, because auto-merging a working conversion script reproduces the exact silent-wrong-output failure being fixed.
- Recovering files already lost in the field. All five reporters restored from their own backups.
- Any change to which files the kit ships. What the archive contains is frozen here; only the manner of writing it changes.
- The server-side `KitProxyService.UPGRADE_STRIP_FILES` list, which governs archive contents rather than the consumer's disk.
- The defects in the PCSoft conversion scripts themselves, which reporters documented separately and which are a distinct concern.
- The separate `tsconfig.wxdbanalyze.json` packaging gap filed as feedback `192e08c1`, which is a release-allowlist omission rather than an overwrite defect.

## Open Questions

- How the FR-008 acknowledgement is expressed and persisted: a query parameter the consumer adds on re-run, a per-project flag the server sets when the consumer confirms in the wxKanban UI or Dev Cockpit, or both. The query parameter is the only form a pre-fix client can send unaided, so it is the likely floor.
- The FR-008 sunset condition — a fixed date, a version distance (e.g. gate only while `fromVersion` is within N releases of the fix), or manual removal in a later release.
- Whether the stale-file rename list stays hand-maintained per release or is derived by diffing consecutive `kit-manifest.json` files at package time. The derived option is less error-prone but requires the previous release's manifest at build time.
- Whether `.claude/skills/` as a whole should join the customizable preserve list, or only `.claude/<skill>/scripts/`. The narrower option is proposed; a reporter asked for the broader one.

## Functional Requirements

### FR-001 — Kit file provenance manifest

The kit records what it wrote so a later upgrade can distinguish a pristine file from a
consumer-modified one. Install and every upgrade write `.wxai/kit-manifest.json` containing, per
kit-shipped file, its repo-relative path and SHA-256 as shipped, plus the kit version it describes.
`.wxai/` is never inside the archive, so the manifest survives. A project upgrading with no prior
manifest is handled without crashing: absent a baseline, every differing file is treated as possibly
modified — fail safe, not fail silent.

### FR-002 — Unconditional pre-upgrade snapshot

Before any write, the upgrade snapshots every path it is about to touch into a timestamped directory
under `.wxai/` and prints the absolute location. This applies on the normal wxKanban path, the GitHub
fallback, the Dev Cockpit install row, and any `--force` delegation, with no path exempt. A snapshot
failure aborts the upgrade rather than proceeding unprotected. The location is printed again in the
final summary. Retention is the last 2 snapshots, pruned on the next successful upgrade.

### FR-003 — Modified files are not silently overwritten by extraction

Extraction consults the FR-001 manifest before it lands. A kit-shipped file whose on-disk content
differs from its recorded install hash is not overwritten in place. Project-only files with no archive
counterpart remain present and byte-identical, asserted as a regression guard so a future change to
delete-and-replace cannot silently reintroduce the author-side lineage's behaviour. The
`Expand-Archive -Force` and `tar -xzf` branches behave identically with respect to preservation, so
there is no platform-dependent data loss. The post-extraction stale-file cleanup, which unconditionally
deletes a hardcoded rename list including `.claude/skills/wxConversion` and
`.claude/skills/wxConversionScope`, reports each deletion instead of removing it silently.

### FR-004 — Change manifest, and a stop when modifications are at risk

Silence no longer reads as "nothing was touched". After extraction the upgrade prints every file
replaced whose prior content differed from its recorded hash, every `*.kit-new` written, and every
tombstoned removal, each by path. When that combined set is non-empty the run either prompts for
confirmation or exits non-zero; it never completes silently with exit 0. `--yes` remains an override
but is logged explicitly as having proceeded over N at-risk files, so the Dev Cockpit one-click path
stays usable without becoming silent again. Counts are reported even when the set is empty, so the
absence of a warning is affirmative rather than inferred.

### FR-005 — package.json is merged, never overwritten

The kit updates only its own declared scripts and dependencies; keys it does not own are preserved
verbatim. A consumer-declared dependency is never dropped by an upgrade. A consumer script whose name
collides with a kit script is reported as a conflict per FR-004 rather than silently replaced. After
an upgrade, a clean clone plus `npm ci` builds, verified by a regression test using a consumer
manifest carrying extra scripts and `file:` dependencies.

### FR-006 — Preserve list for customizable trees

Paths consumers are expected to edit are never overwritten in place. `.claude/<skill>/scripts/` and
`_wxAI/rules/` are treated as customizable: a modified file there is left alone and the kit's version
written as `<name>.kit-new` beside it, with each such write named in the FR-004 manifest. An unmodified
file in a customizable tree upgrades in place with no `.kit-new` noise. The preserve list is a single
declared constant, not logic duplicated per call site.

### FR-007 — Close the fallback-versus-normal warning asymmetry

The GitHub fallback already refuses to run without `--confirm-overwrite` and names the four files at
risk. The normal wxKanban path, which every consumer actually uses, has no equivalent gate. The normal
path carries an overwrite warning at least as informative as the fallback's, naming actual at-risk
files from the FR-001 comparison rather than a fixed list of four. Both paths share one code path for
the warning so the asymmetry cannot silently reappear. `--dry-run` performs the full FR-004 comparison
and prints the same manifest it would print for real while changing nothing on disk, exiting non-zero
when it would have prompted so it is usable as a scripted pre-upgrade check.

### FR-008 — Server-side gate protecting the delivering upgrade

The fix is not a release late for the existing fleet. Protection for the upgrade that *carries* the
fix is enforced **server-side**, exploiting three behaviours the pre-fix client already has and which
therefore need no change on the consumer's disk:

1. `GET /api/projects/:id/kit/upgrade` is already called with `fromVersion=<consumer's kit version>`, so the server can identify a pre-fix client exactly.
2. On a non-OK response the pre-fix client throws `HTTP <status> from wxKanban: <first 300 chars of body>` — a server-controlled message printed verbatim.
3. A 4xx `die()`s without falling back to GitHub, so the client stops having written nothing.

When `fromVersion` is below the release carrying this fix (or is `unknown`), the upgrade endpoint
returns **HTTP 409** with a body under 300 characters instructing the consumer to take a backup and
how to proceed. The consumer re-requests with an explicit acknowledgement, and the archive is then
served normally. The acknowledgement is recorded per project so the gate fires **once**, not on every
upgrade.

This is a genuine pre-upgrade gate rather than an advisory: the consumer's own unmodified script
performs the refusal and prints the reason. It closes the hole that would otherwise leave the entire
existing fleet exposed on exactly one more upgrade.

**Acceptance criteria**:

- A pre-fix client upgrading into the fixed release receives 409, prints the instruction, exits non-zero, and has written nothing to disk.
- After acknowledgement, the same client upgrades normally and the gate does not fire again.
- The body fits within the client's 300-character truncation with the actionable instruction intact — verified against the real truncation, not assumed.
- A client already at or above the fixed release is never gated.
- `fromVersion=unknown` is treated as pre-fix (fail safe).
- The gate has a defined sunset so it cannot outlive its purpose and block the fleet indefinitely.
- The `ensureKitUpToDate` banner, the Dev Cockpit "Kit update available" row, and the release notes carry the same instruction, so the 409 is expected rather than alarming.

**Known bypass, accepted**: a consumer whose wxKanban is unreachable falls through to the GitHub
download path, which the gate cannot reach. That path already demands `--confirm-overwrite` and names
files at risk, so it is the one route that is not silent today.

### FR-009 — Regression guards

A test fails if a modified kit-shipped file is overwritten in place without appearing in the manifest,
run against both extraction branches. A test fails if the upgrade path regresses to delete-and-replace
of whole directories, which would destroy the project-only files overlay extraction preserves. A test
upgrades a synthetic consumer tree containing a modified kit file, a project-only file, and a
customized `package.json`, asserting all three survive and are reported. A test asserts the run exits
non-zero, or prompts, when modified files are at risk. All of these run in CI.

### FR-010 — Cross-repository delivery

The change lands in `wxKanban-agent-Orchestrator/scripts/upgrade-kit.mjs`, not the author-side copy in
this repository, and reaches consumers through one `sync-to-orchestrator --release`. A post-release
upgrade from the published kit demonstrates the manifest, the snapshot, and the preserved modification
end to end on a real consumer project.

### FR-011 — Every `package.json`-referenced script ships *(SCOPE-121 Amendment A FR-010)*

The kit's root `package.json` is mirrored verbatim from the wxKanban repo, but root `scripts/` is
deliberately not mirrored — so 11 of the 13 `scripts/*` paths it names have never been in any archive,
since v1.2.7. Eight scripts move into `wxKanban-agent-Orchestrator/scripts/` so the archive contains
them: `kit-start.mjs`, `kit-stop.mjs`, `kit-status.mjs`, `setup-gateway.mjs`, `watermark.mjs`,
`check-schema-drift.ts`, `check-hardcoded-strings.mjs`, `check-getting-started-sync.mjs`. On a fresh
extraction into an empty tree, every path the shipped `package.json` names resolves; `kit:start`,
`kit:stop`, `kit:status` and `db:drift` reach a real exit code rather than `MODULE_NOT_FOUND`.
Membership of `KIT_DIRS`/`KIT_FILES` is unchanged — the existing `scripts/` directory gains its
missing members.

Every candidate's imports were read rather than assumed, which removed two of them.
`generate-project-lifecycle.ts` and `generate-project-devplan.ts` import `../src/db/client.js`,
`../src/db/schema/companyproject.js` and three `../src/server/services/*` modules; **the archive ships
zero files under `src/`** (verified against v1.7.48), so neither can resolve on a consumer, and both
would open a direct connection to the wxKanban application database. They ship nowhere — FR-012
removes their entries instead. `watermark.mjs` (`../shared/watermark/dist/index.js`) and
`check-schema-drift.ts` (`../wxkanban-agent/core/orchestrator/schema-drift`) resolve against paths the
archive does ship, and are kept.

### FR-012 — Stale and unshippable script entries are removed, packed and on-disk *(SCOPE-121 Amendment A FR-011)*

Four entries go. `kit:start:mcp` and `kit:start:legacy` both reference `setup-mcp.mjs`, deleted at
v1.1.0 in the hosted-MCP cutover, which is **not** restored; the local-MCP branch of `kit-start.mjs`
is reconciled with that removal so the shipped script has no path to a file that will not exist.
`lifecycle:generate` and `devplan:generate` go because their scripts cannot ship at all (FR-011) —
removing them takes away no capability a consumer had, since neither has ever executed on a consumer
install; Dev Plan and Lifecycle reach consumers through the Dev Cockpit and MCP.
**This is a prerequisite of FR-005, not an independent cleanup**: a merge that
preserves the incumbent side would leave the broken entries in place forever, so the FR-005 merge must
*remove* them from a consumer's existing `package.json` and report the removal in the FR-004 manifest.
A consumer who has customized either entry is treated as a modified file under FR-003.

### FR-013 — Fail-closed release integrity gate *(SCOPE-121 Amendment A FR-012)*

`build-release.mjs` resolves every filesystem path referenced by the staged `package.json` `scripts`
block against the staged archive tree and exits non-zero, naming each unresolvable path, before any
asset is uploaded — so a short archive cannot be published and SHA-verified as in the v1.7.32
incident. Resolution considers paths anywhere in the command string rather than a leading `scripts/`
token, so `tsx _wxAI/skills/wxDBAnalyze/scripts/cli.ts` resolves at its real location. `tsc -p <config>`
arguments are covered too, closing ticket `192e08c1` (`tsconfig.wxdbanalyze.json`) in the same pass.
Run against the v1.7.48 tree the gate reproduces exactly the 11 known failures, which is its fixture.

### FR-014 — Shipped author-side gates degrade instead of crashing *(SCOPE-121 Amendment A FR-013)*

`check-getting-started-sync.mjs` reads `gettingStartedInstructions.md` and
`public/gettingStartedInstructions.html` at fixed paths; neither ships, and neither is meaningful in a
consumer project. It exits 0 with an explanatory skip line when either input is absent, and behaves
unchanged when both are present — otherwise FR-011 would only exchange `MODULE_NOT_FOUND` for
`ENOENT`. `check-hardcoded-strings.mjs` needs no such guard: it scans staged `.tsx` via git or explicit
arguments and hardcodes no wxKanban path, so it ships unmodified.

### FR-015 — The snapshot is invisible to source-file discovery *(SCOPE-121 Amendment B)*

FR-002's snapshot is a **backup**, but it was written as an expanded directory tree at
`.wxai/kit-upgrade-snapshot-<timestamp>/`, which made it also a **second copy of the kit inside the
project**. The kit archive carries 50 `*.test.ts` files, so every glob-driven tool in the consumer's
project found each of them twice: vitest and jest test discovery, `tsc` includes, eslint and biome
sweeps, ripgrep. `.wxai/` being a dot-directory does not help — vitest globs with `dot: true`.

Reported from the field (`eb54b9e5`, kit v1.7.61): a known-failing kit test silently doubled to two
failing files on any day an upgrade had run, with nothing in the output to say the second was a
backup copy rather than a new regression. A backup that changes the result of the project's own test
run is not inert, and a snapshot nobody can trust the output around is a snapshot people delete.

Requirements:

- The durable snapshot is a **single archive file** — `.wxai/kit-upgrade-snapshot-<timestamp>.zip`
  on Windows (Explorer opens it; `Expand-Archive` restores it), `.tar.gz` elsewhere. No source-file
  glob can match it.
- The expanded copy still exists for the length of the run, because FR-005's `package.json` merge
  reads it, but it is staged in the OS temp directory — outside the project — and removed when the
  run ends, including when the run fails.
- If no archiver is available the run falls back to the expanded directory rather than extracting
  unprotected, and says plainly that it is visible to test and lint globs and should be deleted once
  the upgrade looks right. Protection outranks tidiness.
- Retention (FR-002's last-2) treats archives and pre-Amendment-B expanded directories as one list,
  so a consumer upgrading from an older kit ages their legacy directories out. A retained directory
  is named in the output with the same warning.
- A run that is killed or crashes leaves `.wxai/kit-staging-<ms>/` — a full expanded copy of the kit,
  the same hazard by another name. Nothing reads it after the run, so the next upgrade sweeps it.

Out of scope: editing the consumer's `vitest.config.ts` or any other tool config. The kit does not
own those files, and a backup that only one tool has been taught to ignore is still a trap for the
next tool.

### FR-016 — A failed or partial extraction stops the upgrade before anything is recorded *(SCOPE-121 Amendment C)*

Three field reports from three projects (`11ee7968`, `e7ee95c6`, `a5a21bd8`, all Windows Server 2022):
one file locked by antivirus scanning makes `Expand-Archive` roll back everything it extracted, the
error is non-terminating so PowerShell exits 0, and the upgrade then reports success over an empty
staging directory — installing nothing, stamping the new version, and overwriting
`.wxai/kit-manifest.json` with `files: {}`. A per-file copy failure in reconcile does the same damage
more quietly: it is a warning, and the new manifest records a hash for a file that never landed.

Requirements:

- Windows extracts the zip with the bundled `tar.exe` (cwd = staging, never `-C`); `Expand-Archive` is
  the fallback only where `tar.exe` is absent, run with errors terminating.
- Extraction is retried up to 3 times, a short pause apart, so a transient lock does not fail the run.
- Every file entry the archive lists must be present in staging afterwards, or the run stops non-zero
  naming the count and the first few missing paths.
- A reconcile write failure fails the run. The `package.json` merge still runs first, so a partial run
  never leaves the kit's `package.json` in place of the consumer's.
- On failure: version stamp unchanged, existing manifest untouched, `init.mjs` not run, and the message
  says re-running is safe.
- A 0-file manifest is never written, independently of the checks above.
- The previous manifest is included in the pre-upgrade snapshot.
- Re-running after a failure converges with nothing misreported as a consumer edit.

Out of scope: repairing a manifest already emptied on a consumer's disk; the next good upgrade takes
the FR-001 no-baseline path and writes a correct one.

### FR-017 — The agent's own dependencies are installed *(SCOPE-121 Amendment C)*

The Project Agent bundle keeps `@anthropic-ai/claude-agent-sdk` and `ws` external and declares them
only in `wxkanban-agent/package.json`, which nothing installs: `init.mjs` runs `npm install` at the
kit root only, and only when `tsx` is missing. `init.mjs` (run by install and by every upgrade) checks
each runtime dependency of `wxkanban-agent/package.json` for resolvability from that folder and, when
any is missing, runs `npm install --omit=dev` there. A failure is reported loudly with the manual
command but does not stop the gateway; no agent `package.json` is a no-op.

## Data Requirements

No tables and no schema changes. Two artifacts are introduced, both per-project on the consumer's
filesystem and neither persisted server-side: `.wxai/kit-manifest.json` (path to SHA-256 map, kit
version, owned-path list) and a timestamped snapshot directory under `.wxai/`, retained 2 deep. The
existing `.wxkanban-project.json` version stamp is read and written exactly as today, unchanged in
shape. Nothing is added to the wxKanban database.

## API Routes

**No new routes, but one existing route changes behaviour.**

`GET /api/projects/:id/kit/upgrade` gains the FR-008 gate. When the `fromVersion` query parameter —
already sent by every client today — is below the release carrying this fix, or is `unknown`, the
endpoint returns **HTTP 409** with a body under 300 characters instead of the archive. After the
consumer acknowledges, the same request serves the archive normally, and the acknowledgement is
recorded per project so the gate fires once.

Response headers are unchanged: `X-Kit-Sha256`, `X-Kit-Version`, `X-Kit-FromVersion` and
`X-Kit-Mode: upgrade` must all still be present on success, because the pre-fix client hard-validates
`X-Kit-Mode` and rejects anything else. Adding a new header is not a viable channel — a pre-fix client
ignores headers it does not know — which is precisely why the gate uses the status code and body.

`GET /api/projects/:id/kit/latest-version` is unchanged in shape; its existing `releaseUrl` field is
already rendered by the shipped `check-kit-version.mjs` banner and is reused to point at the release
notes describing the gate.

The publish path remains `scripts/sync-to-orchestrator.mjs --release`.

**Note:** this pulls wxKanban **server** work into a scope that was otherwise entirely kit-side. The
gate cannot live in the kit, because the kit code on a pre-fix consumer's disk is exactly what cannot
be changed.

## Frontend Components

No components are added or changed in the web application. The only UI surface touched is the Dev
Cockpit's existing "Kit update available — Install" row, which under FR-008 must surface the
transitional mitigation for the release carrying this fix; its behaviour, throttle, and cache are
otherwise untouched.

## Integration Context

This spec must align with three existing contracts and change none of them. SPEC-019 owns the kit
archive and its contents, which are read but never modified here. SCOPE-083 owns `ensureKitUpToDate`
and the Dev Cockpit install row, both of which invoke the upgrade; FR-008 adds a message to them
without altering their throttle, six-hour cache, or author-repo exclusion. `KitProxyService`'s
`UPGRADE_STRIP_FILES` governs what the archive contains, whereas this spec governs what happens on
disk after extraction — the two must not be conflated. Delivery aligns with the cross-repo release
path SCOPE-080 used for its Item A, and inherits the same two-repo drift risk.

## Technical Notes

**Stack targeting.** Per `stack.md` this project is Node.js 20 LTS with Vitest for unit testing. The
work is plain ESM `.mjs` kit scripts plus Vitest specs — no Express, React, Postgres, or Tailwind
surface is involved. `node:crypto` `createHash('sha256')` covers the manifest; no new dependency is
required, and the kit must not gain one, since it ships to consumers.

**Two lineages, one filename.** `wxKanban/scripts/upgrade-kit.mjs` and
`wxKanban-agent-Orchestrator/scripts/upgrade-kit.mjs` differ in behaviour. All implementation targets
the orchestrator copy. `kit-update-check.ts` documents the same split for `check-kit-version.mjs`.

**Both platform branches.** Windows takes `Expand-Archive -Force` via PowerShell; everything else
takes `tar -xzf` with `cwd=root`. Every field report so far originated on Windows Server 2022.
