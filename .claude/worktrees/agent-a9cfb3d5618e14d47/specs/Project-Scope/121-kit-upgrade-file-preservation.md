# SCOPE-121: Kit Field-Defect Hardening — batch 2 (upgrade must not destroy consumer work)

**Spec Number**: 121
**Status**: `draft`
**Created**: 2026-08-04
**Last Reviewed**: 2026-08-04 (**Amendment A** — the release ships a `package.json` referencing 11
`scripts/*` files the archive has never contained; found by tracing field report `a01a6b7c`) ·
2026-11-01 (**Amendment C** — a failed Windows extraction reported as a successful upgrade, `11ee7968`)
**Depends On**: SPEC-019 (Agent Orchestrator Kit — owns the kit source, the `KIT_DIRS`/`KIT_FILES` ownership list, and the `sync-to-orchestrator --release` publish path)
**Related**: SCOPE-080 (Kit Field-Defect Hardening — batch 1, shipped kit v1.7.16 on 2026-06-30). Same family and same delivery path; this is the next batch, authored separately so 080 stays the historical record of what v1.7.16 delivered.
**Source**: wxKanban feedback ref `24ee838a-2e5a-4b74-97aa-745df8806878` (severity high, triaged; origin project `93454c1a-b8cd-42ed-a6cb-a34167e83ecf`), corroborated by a second independent report the same day on the v1.7.44 → v1.7.48 upgrade.

---

## Overview

The kit-shipped `scripts/upgrade-kit.mjs` reverts consumer work on every upgrade, silently, and
exits 0.

It extracts the release archive **over the project root** — `Expand-Archive -Force` on Windows,
`tar -xzf` with `cwd=root` elsewhere. Every file the archive ships lands on top of whatever the
consumer had at that path, `package.json` included. There is no provenance record, no backup, no
manifest of what changed, and no warning. Any consumer edit to a kit-shipped file is reverted.

> **Read this before implementing.** The script consumers run is **not**
> `wxKanban/scripts/upgrade-kit.mjs`. That file is a separate, author-side lineage. The shipped
> script lives in the **`wxKanban-agent-Orchestrator` repository** and behaves differently — the
> author-side copy delete-and-replaces whole directories, the shipped one overlays. Diagnosing this
> defect from the wxKanban copy produces wrong conclusions; it already did once during triage of
> these reports. See Notes.

Overlay extraction is the *less* destructive of the two designs — project-only files with no archive
counterpart survive untouched — but it is equally blind: it cannot tell a consumer-modified file from
a pristine one, so it overwrites both without a word.

Confirmed by **five independent field reports across five unrelated projects**, all filed within
twenty minutes on 2026-08-04: repaired PCSoft conversion scripts reverted to stock, and `package.json`
scripts plus declared dependencies dropped. The reporters who recovered did so only because they had
taken their own checksummed backups first.

It is not a one-off. One project (Ebuy) has been hit on **three consecutive upgrades** — v1.7.39,
v1.7.44, v1.7.48 — losing the same two `package.json` entries every time. Another (JobBilling) lost
seven project-added scripts and has since written a `restore-project-scripts.mjs` workaround with a
`--check` CI gate, because re-adding the entries by hand after every upgrade had become routine.

The reverts are silent **and** data-losing, which is the worst combination: the reverted code does not
error, it produces wrong output that still reports success. A reverted `pcsoft-doc-split.py` writes
zero `*.table.md` files and loses an entire 45-table data model while the console summary still reads
as a clean run. A reverted `pcsoft-procs-to-scope.py` drops from 1847 procedures to 1501.

## Business Problem

The kit's whole promise is that upgrading is safe and routine — the auto-update notify banner
(SCOPE-083) actively encourages consumers to upgrade on sight. That prompt currently leads users into
unannounced data loss, so the more successfully we drive upgrade adoption, the more consumer work we
destroy.

The damage is invisible at the moment it happens and surfaces later as wrong output that looks
correct, which is precisely the failure mode that erodes trust in a tool that positions itself as a
disciplined, spec-first development kit. Five independent high-severity field reports in a single day,
from five different projects, indicate this is hitting the fleet now, not theoretically.

It has already caused a production outage. An upgrade dropped `pg` and `mssql` from a consumer's
`package.json`; their API server died with `Cannot find package 'mssql'`. That case surfaced
immediately only by luck. The general case is delayed and therefore far easier to ship: the
`node_modules` tree still contains the dropped packages, so builds and tests keep passing, and the
loss only bites at the next `npm install`, which prunes the now-undeclared package. A team that
upgrades on Monday and installs on Thursday will not connect the two.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | A developer upgrading the kit in an existing wxKanban-managed project — the person whose local repairs, custom scripts, and `package.json` entries are currently destroyed without notice |
| **Secondary Actors** | Kit maintainer (owns `KIT_DIRS`/`KIT_FILES` and cuts the `sync-to-orchestrator --release`); the Dev Cockpit "Kit update available → Install" row and the `ensureKitUpToDate` notify banner, both of which invoke the upgrade; `check-kit-version --force`, which delegates to the same script |
| **Key Value** | An upgrade that can never silently destroy a consumer's work — every write is preceded by a recoverable snapshot, every replacement of a modified file is reported by path, and nothing project-only is deleted at all — so upgrading stays routine instead of becoming a thing developers learn to fear |
| **Scope Boundary** | See the `## Scope Boundary` and `## Out of Scope` sections below. |

---

## Scope Boundary

In scope:

- A `.wxai/kit-manifest.json` provenance record: SHA-256 per kit-written file, written at install and at every upgrade.
- An unconditional pre-upgrade snapshot on every upgrade path, with its location printed.
- Consulting that manifest before extraction lands, so a consumer-modified file is not overwritten in place — on both the Windows (`Expand-Archive -Force`) and non-Windows (`tar -xzf`) branches.
- Closing the warning asymmetry: the GitHub fallback gates on `--confirm-overwrite`, the normal wxKanban path has no gate at all.
- Surfacing the post-extraction stale-file cleanup's unconditional deletions (a hardcoded rename list) in the change manifest instead of removing them silently.
- A post-copy manifest listing every file replaced-with-different-content and every project-only file at risk, with a prompt or non-zero exit when that set is non-empty.
- `package.json` merged instead of replaced, preserving unknown keys and consumer-declared dependencies.
- A preserve list for `.claude/<skill>/scripts/` and `_wxAI/rules/`, writing kit versions as `*.kit-new` rather than over the consumer's file.
- Correcting the misleading "Preserved (will NOT be touched)" pre-flight banner.
- Making `--dry-run` actually diff instead of only listing directories.
- A one-release-early mitigation so consumers on or below the delivering version aren't clobbered by the very upgrade that carries the fix.
- Delivery via the existing `sync-to-orchestrator --release`.

## Out of Scope

Explicitly excluded:

- Three-way merge or conflict-marker resolution of modified files — the upgrade reports and preserves, it does not auto-merge.
- Recovering files already lost in the field; both reporters restored from their own backups.
- Any change to which paths the kit owns — `KIT_DIRS` / `KIT_FILES` membership is unchanged, only the *manner* of writing them changes.
- The server-side `KitProxyService.UPGRADE_STRIP_FILES` list, which governs archive contents rather than the consumer's disk.
- The defects in the PCSoft conversion scripts themselves, which the reporter documented separately and which are a distinct concern from this one.

---

## User Scenarios & Testing

### US1 — A modified kit-shipped file survives an upgrade and is reported

**Actor**: a developer whose project has repaired a kit-shipped script (e.g. `.claude/wxConversion/scripts/pcsoft-doc-split.py`)

1. The developer edits a kit-shipped file to fix a defect their project depends on.
2. A newer kit release lands and they run the upgrade.

**Expected outcome**: the upgrade detects the file diverges from its recorded install hash, leaves the developer's version in place, writes the kit's version alongside as `*.kit-new`, and names the file in an end-of-run manifest. The developer's fix is still active and they were told a newer upstream version exists.

### US2 — A skill directory the kit renames away is not removed without a word

**Actor**: a developer who has customised something under a `.claude/skills/` directory the kit later renames

1. The kit renames or retires a skill directory and adds it to the post-extraction stale-file cleanup list.
2. The developer upgrades.

**Expected outcome**: the removal still happens — it is deliberate — but it is named in the end-of-run manifest, so the developer knows a directory was deleted rather than discovering it later. Today this list is applied unconditionally and silently; `.claude/skills/wxConversion` and `.claude/skills/wxConversionScope` are on it.

> **Note**: project-only files with no counterpart in the archive are *already* safe — the shipped
> script overlays and never deletes outside this hardcoded list. FR-003 asserts that as a regression
> guard rather than as new behaviour to build.

### US3 — `package.json` keeps the project's own scripts and dependencies

**Actor**: a developer whose `package.json` declares project scripts and dependencies the kit knows nothing about

1. Their `package.json` carries e.g. a `typecheck` script with a machine-specific heap flag, and dependencies their source imports.
2. They run the upgrade.

**Expected outcome**: the kit's own scripts and declared dependencies are updated, and every unknown key, script, and consumer-declared dependency is preserved. A fresh clone plus `npm ci` still builds.

### US4 — Nothing is lost, even when the developer took no precautions

**Actor**: any developer running the upgrade without having backed anything up

1. They run the upgrade on a project with local modifications they've forgotten about.
2. The upgrade proceeds.

**Expected outcome**: a snapshot of every path the upgrade will touch was taken before the first write, and its location is printed. Whatever the upgrade got wrong is recoverable from disk without a git history or a hand-made backup.

### US5 — A consumer still on the pre-fix script is not clobbered by the upgrade that delivers the fix

**Actor**: a developer on a kit version whose `scripts/upgrade-kit.mjs` is still the destructive one

1. They are notified that a newer kit release is available.
2. They upgrade to the release that contains this fix.

**Expected outcome**: they are not silently clobbered on the way in — the mitigation runs, or is surfaced prominently enough to act on, before the old script's first write. Their local modifications survive the transition into the fixed kit.

> **Note on US5**: the *outcome* is specified, not the mechanism. Because no change here can alter code
> already on a consumer's disk, this may land as a release-notes advisory plus a standalone backup step
> rather than anything automatic. FR-008 carries the requirement.

---

## Functional Requirements

### FR-001 — Kit file provenance manifest

The kit records what it wrote, so a later upgrade can distinguish a pristine file from a
consumer-modified one.

**Acceptance Criteria**:

- [ ] Install (`init.mjs`) and every upgrade write `.wxai/kit-manifest.json` containing, per kit-written file, its repo-relative path and SHA-256 as shipped.
- [ ] The manifest records the kit version it describes and the paths the kit claims ownership of.
- [ ] `.wxai/` is never a kit-owned directory, so the manifest survives an upgrade.
- [ ] A project upgrading from a version with no manifest is handled without crashing: absent a baseline, every differing file is treated as *possibly modified* (fail safe, not fail silent).

### FR-002 — Unconditional pre-upgrade snapshot

Every upgrade path takes a recoverable snapshot before its first write.

**Acceptance Criteria**:

- [ ] Before any delete, copy, or write, the upgrade snapshots every path it is about to touch into a timestamped directory under `.wxai/`, and prints the absolute location.
- [ ] The snapshot is taken on the local `--source` path, the `--from-server` path, and the Dev Cockpit / `check-kit-version --force` invocations alike — no path is exempt.
- [ ] A snapshot failure aborts the upgrade rather than proceeding unprotected.
- [ ] The snapshot location is printed again in the final summary, not only at the start.
- [ ] Retention is the last **2** snapshots; older ones are pruned on the next successful upgrade.

### FR-003 — Modified files are not silently overwritten by the extraction

Overlay extraction preserves project-only files already. What it does not do is protect a file the
consumer has changed. The extraction must consult the FR-001 manifest before it lands.

**Acceptance Criteria**:

- [ ] A kit-shipped file whose on-disk content differs from its recorded install hash is not overwritten in place by the extraction.
- [ ] A project-only file with no counterpart in the archive remains present and byte-identical (already true of overlay extraction; asserted so a future change to delete-and-replace cannot regress it).
- [ ] The Windows (`Expand-Archive -Force`) and non-Windows (`tar -xzf`) branches behave identically with respect to preservation — no platform-dependent data loss.
- [ ] `package.json` is handled by FR-005 rather than by raw extraction.
- [ ] The post-extraction stale-file cleanup, which unconditionally deletes a hardcoded rename list including `.claude/skills/wxConversion` and `.claude/skills/wxConversionScope`, reports each deletion in the FR-004 manifest instead of removing them silently.

### FR-003a — Close the fallback-vs-normal warning asymmetry

The GitHub fallback already refuses to run without `--confirm-overwrite` and names the files at risk.
The normal wxKanban path — the one every consumer actually uses — has no equivalent gate. This is the
reporters' fix 5, and the asymmetry proves the hazard was understood when the fallback was written.

**Acceptance Criteria**:

- [ ] The normal wxKanban download path carries an overwrite warning at least as informative as the GitHub fallback's.
- [ ] The warning names actual at-risk files from the FR-001 comparison, rather than the fallback's fixed list of four.
- [ ] The two paths share one code path for the warning; the asymmetry cannot silently reappear.

### FR-004 — Post-copy change manifest, and a stop when modifications are at risk

Silence no longer reads as "nothing was touched".

**Acceptance Criteria**:

- [ ] After copying, the upgrade prints every file replaced whose prior content differed from its recorded install hash, by path.
- [ ] It prints every project-only file under a kit-owned directory, and every tombstoned removal, by path.
- [ ] When that combined set is non-empty, the run either prompts for confirmation before writing or exits non-zero — it never completes silently with exit 0.
- [ ] `--yes` remains an override, but is logged explicitly as "proceeded over N at-risk file(s)" so the Cockpit one-click path stays usable without becoming silent again.
- [ ] Counts are reported even when the set is empty ("0 modified files replaced"), so the absence of a warning is affirmative rather than inferred.

### FR-005 — `package.json` is merged, never replaced

**Acceptance Criteria**:

- [ ] The kit updates only its own declared scripts and dependencies; keys it does not own are preserved verbatim.
- [ ] A consumer-declared dependency is never dropped by an upgrade.
- [ ] A consumer script whose name collides with a kit script is reported as a conflict per FR-004 rather than silently overwritten.
- [ ] After an upgrade, a clean clone plus `npm ci` builds — verified by a regression test with a consumer `package.json` carrying extra scripts and dependencies.

### FR-006 — Preserve list for customizable trees

Paths consumers are expected to edit are never overwritten in place.

**Acceptance Criteria**:

- [ ] `.claude/<skill>/scripts/` and `_wxAI/rules/` are treated as customizable: a modified file there is left alone and the kit's version written as `<name>.kit-new` beside it.
- [ ] Each `*.kit-new` write is named in the FR-004 manifest.
- [ ] An unmodified file in a customizable tree upgrades in place with no `.kit-new` noise.
- [ ] The preserve list is a single declared constant, not logic duplicated per call site.

### FR-007 — Truthful pre-flight output

The pre-flight stops asserting a safety it does not provide.

**Acceptance Criteria**:

- [ ] The "Preserved (will NOT be touched)" banner is corrected so it cannot be read as "everything not listed here is safe" — kit-owned directories are shown as replaced, with their modified-file count.
- [ ] `--dry-run` performs the FR-004 comparison and prints the same manifest it would print for real, changing nothing on disk.
- [ ] `--dry-run` exits non-zero when it would have prompted, so it is usable as a pre-upgrade check in a script.

### FR-008 — Server-side gate protecting the delivering upgrade

**Mechanism decided 2026-08-04: server-side.** The fix is not a release late for the existing fleet.
Protection for the upgrade that *carries* the fix is enforced by the wxKanban server, exploiting three
behaviours the pre-fix client already has and which therefore need no change on the consumer's disk:

1. `GET /api/projects/:id/kit/upgrade` is already called with `fromVersion=<consumer's kit version>`.
2. On a non-OK response the client throws `HTTP <status> from wxKanban: <first 300 chars of body>` — server-controlled text, printed verbatim.
3. A 4xx `die()`s **without** falling back to GitHub, so the run stops having written nothing.

**Acceptance Criteria**:

- [ ] `GET /api/projects/:id/kit/upgrade` returns **409** when `fromVersion` is below the release carrying this fix, or is `unknown` (fail safe).
- [ ] The 409 body is under 300 characters and carries the actionable instruction, verified against the client's real `.slice(0, 300)` truncation.
- [ ] A pre-fix client hitting the gate prints the instruction, exits non-zero, and writes nothing to disk.
- [ ] An acknowledgement a pre-fix client can send **unaided** clears the gate and the archive is served normally.
- [ ] The acknowledgement is recorded per project so the gate fires **once**, not on every upgrade.
- [ ] A client at or above the fixed release is never gated.
- [ ] Success responses still carry `X-Kit-Sha256`, `X-Kit-Version`, `X-Kit-FromVersion` and `X-Kit-Mode: upgrade` — the pre-fix client hard-validates the mode header.
- [ ] The gate has a defined sunset so it cannot outlive its purpose and block the fleet indefinitely.
- [ ] `ensureKitUpToDate`, the Dev Cockpit "Kit update available → Install" row, and the release notes carry the same instruction, so the 409 reads as expected rather than as an outage.

**Accepted bypass**: a consumer whose wxKanban is unreachable falls through to the GitHub download
path, which the gate cannot reach. That path already demands `--confirm-overwrite` and names files at
risk, so it is the one route that is not silent today.

### FR-009 — Regression guards

**Acceptance Criteria**:

- [ ] A test fails if a modified kit-shipped file is overwritten in place without appearing in the manifest, run against **both** extraction branches.
- [ ] A test fails if the upgrade path regresses to delete-and-replace of whole directories (the author-side lineage's behaviour), which would destroy project-only files that overlay extraction preserves.
- [ ] A test upgrades a synthetic consumer tree containing a modified kit file, a project-only file under a kit directory, and a customized `package.json`, and asserts all three survive and are reported.
- [ ] A test asserts the run exits non-zero (or prompts) when modified files are at risk.
- [ ] These run in CI.

---

## Amendment A — The release ships a `package.json` referencing files it does not contain (2026-08-04)

**Why this amendment exists.** FR-001…FR-009 assume the archive's contents are correct and the only
question is *how* they are written to disk. Field report `a01a6b7c-c07f-455a-b5d3-4e696cf8a5da`
(critical; origin project `947a5614-0891-415e-a9f9-4d89f7e4c725`; supersedes `3f665c75`) shows the
archive's contents are themselves wrong: the kit's root `package.json` declares 14 npm scripts
pointing at 13 distinct `scripts/*` paths, and **only one of those files is in the archive**.

`npm run kit:start`, `kit:stop`, `kit:status`, `kit:start:mcp`, `kit:start:gateway`, `lint:i18n`,
`devplan:generate`, `lifecycle:generate`, `watermark`, `check:getting-started` and `db:drift` all
fail with `MODULE_NOT_FOUND` on every consumer. The reporter's local orchestrator gateway died and
`kit:start` — the documented way to restart it — was itself one of the missing files, leaving no
supported recovery path.

### Root cause

Two allowlists that were never reconciled, in opposite directions from the pair described in
[[reference_kit_two_file_allowlists]]:

- `scripts/sync-to-orchestrator.mjs` mirrors root `package.json` **verbatim** (`KIT_FILES`), while
  deliberately **not** mirroring root `scripts/` — the orchestrator ships its own consumer-facing
  scripts under the same filenames (the two lineages described in this scope's Notes).
- `build-release.mjs` then packs `scripts/` from the orchestrator repo (8 files) next to the app
  repo's `package.json` (referencing 13).

Nothing checks that the shipped `package.json` can resolve the files it names. The version bump and
the `FORBIDDEN_KIT_DEPS` strip at `sync-to-orchestrator.mjs:483-506` are the only transforms applied
to the packed manifest, and neither touches the `scripts` block.

### This is not an upgrade regression

The reporter attributed it to v1.7.46/v1.7.48. It is not — the upgrade only made it visible.

| Evidence | Result |
| --- | --- |
| Orchestrator repo `scripts/` on disk | 8 files — exactly the reporter's "survivors" |
| `git log --all -- scripts/<each missing file>` | **0 commits** — 11 of 12 never existed in that repo |
| `releases/v1.7.9/kit.zip` root `scripts/` | the same 8 |
| `releases/v1.7.48/kit.zip` root `scripts/` | the same 8 |
| First sync carrying `kit:start` into the kit manifest | `94c1713` — **v1.2.7** |

The reporter's own git evidence corroborates this: their initial 2026-07-31 commit contained only the
8 surviving scripts. Broken since v1.2.7.

**Two corrections to the report**, both to be carried in the reply:

1. **`scripts/cli.ts` is a false positive.** `db:analyze` is
   `tsx _wxAI/skills/wxDBAnalyze/scripts/cli.ts`; the reporter's regex matched mid-path. That file
   **is** present in the v1.7.48 archive (verified). The real count is **11 broken entries, not 12**.
2. **`setup-mcp.mjs` is intentionally dead** — deleted at `b716d25` (v1.1.0 hosted-MCP cutover). Its
   two remaining `package.json` entries are stale references to remove, not files to restore.

### Relationship to FR-005

FR-005 merges `package.json` rather than replacing it. Applied to today's manifest that **entrenches
the defect** — a consumer who already has the 11 broken entries keeps them forever, because the merge
preserves the incumbent side. FR-011 must therefore prune on the consumer side too, not only in the
packed manifest. **FR-011 is a prerequisite of FR-005, not an independent cleanup.**

### FR-010 — Every `package.json`-referenced script ships

Eight scripts move from the wxKanban repo into the orchestrator repo's `scripts/` so the archive
contains them. Membership of `KIT_DIRS`/`KIT_FILES` is unchanged — this is the existing `scripts/`
directory gaining its missing members, not a new ownership rule.

**Ten was the initial count. Two of them cannot ship**, established by reading their imports rather
than assuming: `generate-project-lifecycle.ts` and `generate-project-devplan.ts` import
`../src/db/client.js`, `../src/db/schema/companyproject.js` and three `../src/server/services/*`
modules. **The kit archive contains zero files under `src/`** (verified against v1.7.48), so neither
can resolve in a consumer tree — and both open a direct connection to the wxKanban application
database, which is not a thing a consumer install should be able to attempt. They are app-side
generators that were never consumer-facing; consumers reach the same documents through the Dev
Cockpit and MCP. Their two entries are removed under FR-011 instead.

The other two dependency-bearing scripts *are* shippable, and were checked the same way:
`watermark.mjs` imports `../shared/watermark/dist/index.js` and `check-schema-drift.ts` imports
`../wxkanban-agent/core/orchestrator/schema-drift` — both present in the archive.

**Acceptance Criteria**:

- [ ] `kit-start.mjs`, `kit-stop.mjs`, `kit-status.mjs`, `setup-gateway.mjs`, `watermark.mjs`, `check-schema-drift.ts`, `check-hardcoded-strings.mjs` and `check-getting-started-sync.mjs` are present in the orchestrator repo and in both published archives.
- [ ] Every import in each shipped script resolves against the archive tree alone — no `src/` reference survives.
- [ ] On a fresh extraction of the archive into an empty tree, every path referenced by the shipped `package.json` `scripts` block resolves.
- [ ] `npm run kit:start`, `kit:stop`, `kit:status` and `db:drift` each run to a real exit code (not `MODULE_NOT_FOUND`) on a consumer install.
- [ ] The scripts ship LF-normalized, per the existing whole-tree EOL pass.

### FR-011 — Stale and unshippable script entries are removed, both packed and on-disk

**Acceptance Criteria**:

- [ ] `kit:start:mcp` and `kit:start:legacy` are removed from the kit's `package.json` — both reference `setup-mcp.mjs`, deleted at v1.1.0. `setup-mcp.mjs` is **not** restored.
- [ ] `lifecycle:generate` and `devplan:generate` are removed from the kit's `package.json` — app-side, direct-database, and unresolvable without `src/` (FR-010). Removing them is what makes the kit's manifest honest; it removes no capability a consumer had, because the commands have never once run on a consumer install.
- [ ] `kit:start`'s local-MCP branch (`scripts/kit-start.mjs:109-112`) is reconciled with that removal so the shipped script has no path to a file that will not exist.
- [ ] The FR-005 merge **removes** these entries from a consumer's existing `package.json` rather than preserving them, and reports the removal in the FR-004 change manifest.
- [ ] A consumer who has customized either entry is treated as a modified file under FR-003 (reported, not silently rewritten).

### FR-012 — Fail-closed release integrity gate

The structural fix. Without it FR-010 and FR-011 are point repairs that drift again on the next
script rename.

**Acceptance Criteria**:

- [ ] `build-release.mjs` resolves every filesystem path referenced by the staged `package.json` `scripts` block against the staged archive tree, and **exits non-zero** naming each unresolvable path.
- [ ] The check covers paths anywhere in the command string, not just a leading `scripts/` token — so `tsx _wxAI/skills/wxDBAnalyze/scripts/cli.ts` is resolved at its real location and does not reproduce the reporter's false positive.
- [ ] The check also covers `tsc -p <config>` arguments, closing open ticket `192e08c1` (`tsconfig.wxdbanalyze.json` is referenced by `typecheck:dbanalyze` but is in neither allowlist) in the same pass.
- [ ] Running the gate against the v1.7.48 tree reproduces exactly the 11 failures, as a regression fixture.
- [ ] The gate runs before assets are uploaded, so a short archive cannot be published and SHA-verified as it was in the v1.7.32 incident.

### FR-013 — Shipped author-side gates degrade instead of crashing

`check-getting-started-sync.mjs` reads `gettingStartedInstructions.md` and
`public/gettingStartedInstructions.html` at fixed paths. **Verified: neither ships in the kit**, and
neither is meaningful in a consumer project — they are wxKanban's own onboarding pair. Shipping the
script as-is (FR-010) trades `MODULE_NOT_FOUND` for `ENOENT` without giving the consumer anything.

**Acceptance Criteria**:

- [ ] `check:getting-started` exits **0** with an explanatory skip line when either input is absent, and behaves unchanged when both are present.
- [ ] `lint:i18n` (`check-hardcoded-strings.mjs`) is confirmed portable as-is — it scans staged `.tsx` via git or explicit arguments and hardcodes no wxKanban path — and ships unmodified.

### Amendment A constraints

- **Cross-repo, same as the parent scope.** FR-010/FR-011/FR-013 land in the orchestrator repo; editing `wxKanban/scripts/` changes nothing for any consumer.
- **The 10 scripts become a second lineage on copy.** Once they exist in both repos under the same names, they inherit exactly the divergence hazard this scope's Notes warn about. Copying is the delivery mechanism, not the end state; the follow-up question of a single source for consumer-facing scripts is recorded in Open Questions, not decided here.
- **Ships with the parent scope's release.** FR-012 must be in place before that release is built, or the release delivering the fix cannot verify its own completeness.

---

## Amendment C — A failed Windows extraction is reported as a successful upgrade (2026-11-01)

**Why this amendment exists.** Three independent field reports from three projects on three Windows
Server 2022 hosts — `11ee7968`, `e7ee95c6` (duplicate), `a5a21bd8` — describe one failure. One file
locked by antivirus real-time scanning makes `Expand-Archive` roll back **everything it had already
extracted**, but the error is non-terminating, so `powershell.exe` exits 0. The upgrade then carries on
against an empty staging directory and prints a clean success: "Extraction complete", "Reconciled: 0
new, 0 updated", "Kit manifest written (0 files)", "Upgrade complete".

Three silent consequences: no kit files are installed; `.wxkanban-project.json` is stamped with the new
version anyway; and `.wxai/kit-manifest.json` is **overwritten with `files: {}`**, destroying the only
record that tells pristine kit files from consumer edits. One reporter then had 113 untouched kit files
classified as their own edits on the next good run; another recovered only by rolling the version back
and deleting the manifest by hand.

**Root cause, verified in the shipped script** (`wxKanban-agent-Orchestrator/scripts/upgrade-kit.mjs`):
`extractArchive()` trusts the extractor's exit status and nothing else. Nothing checks that the files
the archive lists actually arrived, and `writeKitManifest()` writes whatever it finds, including
nothing. A second path to the same damage: a per-file copy failure during reconcile is logged as a
warning and the run continues, so the new manifest records a hash for a file that never landed — which
is exactly how pristine files become "modified" on the next upgrade.

### FR-016 — A failed or partial extraction stops the upgrade before anything is recorded

*(Numbering follows the spec from Amendment B on.)*

**Acceptance Criteria**:

- [ ] On Windows the zip is extracted with the bundled `tar.exe` (cwd set to the staging directory, never `-C`), which fails loudly per entry. `Expand-Archive` remains only as the fallback where `tar.exe` is absent, and runs with errors made terminating so a failure exits non-zero.
- [ ] A transient lock is retried: extraction is attempted up to 3 times, a short pause apart, before the run fails.
- [ ] After extraction, every file entry the archive lists is confirmed present in staging. If any is missing the upgrade stops with a non-zero exit naming how many are missing and the first few by path.
- [ ] A file the reconcile step cannot write fails the run instead of being a warning. The consumer's `package.json` merge still runs, so a partial run never leaves the kit's `package.json` in place of the consumer's.
- [ ] On any of the failures above, `.wxkanban-project.json` keeps its old version, the existing `.wxai/kit-manifest.json` is left untouched, `init.mjs` does not run, and the message says what was and was not changed and that re-running is safe.
- [ ] A manifest with 0 files is never written — independently of the checks above, so a future extractor bug cannot recreate the damage.
- [ ] The previous `.wxai/kit-manifest.json` is included in the pre-upgrade snapshot.
- [ ] Re-running after a failed attempt converges: files that did land classify as already current, files that did not classify as pristine against the untouched manifest, and nothing is misreported as a consumer edit.

### FR-017 — The agent's own dependencies are installed

The Project Agent (`wxkanban-agent/dist/remote-bridge.cjs`) keeps `@anthropic-ai/claude-agent-sdk` and
`ws` external, and declares them only in `wxkanban-agent/package.json`. Neither is in the kit's root
`package.json`, and `init.mjs` runs `npm install` only at the kit root — and only when `tsx` is
missing, so an upgrade never installs anything. On a consumer the agent therefore cannot load its SDK;
the launcher's only advice is to run `npm install` in `wxkanban-agent/` by hand.

**Acceptance Criteria**:

- [ ] `init.mjs` — which both a fresh install and every upgrade run — checks each runtime `dependencies` entry of `wxkanban-agent/package.json` for resolvability from `wxkanban-agent/` (its own `node_modules`, then the root's), independently of the root `tsx` probe.
- [ ] When any is missing it runs `npm install --omit=dev` in `wxkanban-agent/`, naming the missing packages; when none is missing it does nothing.
- [ ] A failed agent install does not stop the gateway from starting, but is reported loudly with what will not work and the command to run by hand — never silently.
- [ ] No `wxkanban-agent/package.json` (an older kit layout) is a no-op.

### Amendment C constraints

- **Cross-repo, same as the parent scope.** The change lands in `wxKanban-agent-Orchestrator/scripts/upgrade-kit.mjs`; this repo's same-named script already uses `tar` and changes nothing for consumers.
- **Ships on its own.** It does not wait for any other batch.
- **Out of scope:** repairing a manifest already emptied on a consumer's disk. The next good upgrade after this ships treats every differing file as possibly modified (the FR-001 no-baseline path) and writes a correct manifest; the reply to the reporters says so.

---

## Data Requirements

This scope adds **no tables and no schema changes**. It introduces one local JSON file
(`.wxai/kit-manifest.json`) and a timestamped snapshot directory under `.wxai/` — both per-project, on
the consumer's filesystem, and neither persisted server-side. It reads the existing
`.wxkanban-project.json` version stamp, which is unchanged in shape. No new persistence in the
wxKanban database.

## API Routes

**No new HTTP routes.** This is entirely a kit-script change on the consumer's filesystem. The
existing `GET /api/projects/:id/kit/download` endpoint is consumed unchanged by `--from-server`. The
publish path is the existing `scripts/sync-to-orchestrator.mjs --release`.

## Frontend Components

**None in the web app.** The only UI surface touched is the Dev Cockpit's existing "Kit update
available → Install" row, which must surface the FR-008 mitigation for the release carrying this fix;
no new component is added.

## Integration Context

This scope must align with three existing kit contracts and change none of them:

- **SPEC-019** owns `KIT_DIRS` / `KIT_FILES` — the ownership list is read, never modified.
- **SCOPE-083** owns `ensureKitUpToDate` and the Cockpit install row, both of which invoke the upgrade; FR-008 adds a message to them without altering their throttle, cache, or author-repo exclusion behaviour.
- **`KitProxyService.UPGRADE_STRIP_FILES`** governs what the *archive* contains; this scope governs what happens on *disk* after extraction. The two must not be conflated.

---

## Success Criteria

1. An upgrade run against a synthetic consumer tree containing a modified kit file, a project-only file under a kit-owned directory, and a customized `package.json` leaves **all three** intact and names each in its manifest — **0** silent replacements.
2. **0** kit-shipped files whose on-disk content differs from the recorded install hash are overwritten without being reported — enforced by a CI test on both the Windows and non-Windows extraction branches.
3. Every upgrade run prints a snapshot location and a change manifest — measured as **100%** of the 4 upgrade paths (`--source`, `--from-server`, Cockpit, `check-kit-version --force`), with no path exempt.
4. A clean clone plus `npm ci` of an upgraded consumer project builds, with **100%** of the consumer's own scripts and declared dependencies still present.
5. Snapshot disk growth is bounded at **2** retained snapshots per project, pruned on the next successful upgrade.
6. **0** upgrade runs complete with exit 0 while at-risk files were replaced without an explicit logged `--yes` override.

## Key Entities

- **`.wxai/kit-manifest.json`** (per-project, kit-written) — path → SHA-256 of every file the kit wrote, plus the kit version and owned-path list. Enables modified-vs-pristine classification. Lives outside every kit-owned directory so it survives upgrades.
- **Pre-upgrade snapshot directory** (per-project, timestamped, under `.wxai/`) — recoverable copy of every path an upgrade is about to touch. Last 2 retained; pruned on the next successful upgrade.
- **`scripts/upgrade-kit.mjs`** (kit-owned) — the script carrying all three clobber paths; the primary target of this scope.
- **Tombstone list** (kit-owned) — the explicit record of files the kit used to ship and no longer does, replacing the blunt directory wipe as the removal mechanism.

---

## Constraints

- **~~The delivering release is unprotected by construction.~~ Resolved 2026-08-04 via a server-side gate.** It remains true that nothing here can alter code already on a consumer's disk — but that turns out not to matter, because the pre-fix client already surfaces a server-controlled 4xx body verbatim and stops without falling back to GitHub. FR-008 therefore gates the delivering upgrade from the server. The residual constraints are the two below.
- **Deploy ordering is a hard constraint** — the FR-008 server gate must be live **before** the kit release ships. Reversed, the fastest-moving consumers (the most engaged ones) upgrade into the fix with no protection at all.
- **This scope now spans the wxKanban server**, not just the kit. The gate cannot live in the kit, because the kit code on a pre-fix consumer's disk is exactly what cannot be changed. Budget an app deploy alongside the kit release.
- **Report, don't merge** — where the consumer's version and the kit's version differ, the upgrade preserves and reports. It must not attempt a three-way merge or write conflict markers into a working script.
- **Fail safe on a missing baseline** — with no `.wxai/kit-manifest.json` (every project upgrading for the first time after this ships), differing files are treated as modified. Expect a noisy first run; that is correct behaviour, not a defect.
- **No new network or DB dependency** — entirely local-filesystem; it must not require the server to be reachable to protect the consumer's files.
- **Don't break existing kit tests** — the change must keep current kit and scaffold test suites green.
- **Ownership list is frozen** — what the kit ships is out of scope; changing that is a separate decision from changing how it writes.
- **Implement against the orchestrator repo, not this one.** The shipped `upgrade-kit.mjs` lives in `wxKanban-agent-Orchestrator`. Editing `wxKanban/scripts/upgrade-kit.mjs` changes nothing for any consumer. This makes the work a cross-repo change plus a release, with the same two-repo drift risk SCOPE-080 hit on its Item A.
- **Both extraction branches must be covered** — Windows takes `Expand-Archive -Force`, everything else takes `tar -xzf`. A fix applied to one branch only is a platform-dependent data-loss bug, and every field report so far came from Windows.

## Notes

- **TWO SCRIPTS SHARE ONE NAME — this is the trap.** `wxKanban/scripts/upgrade-kit.mjs` (this repo) and `wxKanban-agent-Orchestrator/scripts/upgrade-kit.mjs` (the published kit) are **different lineages with different behaviour**. Consumers run the orchestrator one. The author-side copy delete-and-replaces whole directories via `rmSync`; the shipped copy overlays and never deletes except for a hardcoded rename list. Any implementation, test, or diagnosis must target the orchestrator repo. `kit-update-check.ts` already flags the same split for `check-kit-version.mjs` ("a different lineage with no `--json` mode") — it generalises further than that comment suggests.
- **The reporters were right about the mechanism and the initial triage was wrong.** All five described extraction over the project root; triage "corrected" them from the wxKanban copy and told four of them to audit for destroyed project-only files. Retracted the same day. The shipped script's own comment reads *"the upgrade overlays the archive (it never deletes)"*, and its log lines `Extracting <ext> archive over project root` / `Extraction complete` are exactly what the reports quoted. **Project-only files are not destroyed.** Verbatim user evidence beat source-code inference here, and one reporter's own data contained the disproof: their `node_modules/@wxkanban/help` symlink survived and the client kept building, which is impossible if `shared/help/` had been deleted.
- Root cause is unchanged by that correction and is not about deletion at all: there is no provenance manifest, so the upgrade cannot tell "consumer never touched this" from "consumer modified this", and overlay extraction is exactly as blind to the difference as delete-and-replace would be. FR-001 is the enabling change; nothing else here works without it.
- **The asymmetry is the smoking gun.** The GitHub fallback refuses to run without `--confirm-overwrite` and names CLAUDE.md / AI.md / ProjectOverview.md / README.md as at risk. The normal wxKanban path — the one every consumer uses — has no gate at all. The hazard was understood well enough to guard the rarely-taken branch and not the default one. FR-003a closes it.
- The post-extraction `cleanupStaleAfterExtract()` unconditionally deletes a hardcoded list of renamed paths, including `.claude/skills/wxConversion` and `.claude/skills/wxConversionScope`. That is deliberate rename-cutover behaviour rather than the reported defect, but it is a genuine unannounced delete of skill directories and belongs in the FR-004 manifest. Note it is a *different path* from `.claude/wxConversion/scripts/`, where the reporters' `.py` files live — those were overwritten by the overlay, as reported.
- This scope must **align with** SCOPE-080 (batch 1), which shipped the same family of kit-source defect fixes through the same `sync-to-orchestrator --release` path on 2026-06-30. Authored separately rather than appended so 080 remains an accurate record of what kit v1.7.16 delivered.
- Verified that no preserve, backup, or provenance mechanism already exists on the consumer side before proposing one (search-before-suggest). `KitProxyService.UPGRADE_STRIP_FILES` is a preserve list, but it governs archive contents rather than the consumer's disk.

### Field evidence (all 2026-08-04)

Five reports, five projects, one defect. Listed because the recurrence pattern and the delayed-failure
mode are the parts that justify the priority:

| Ref | Project | What was lost |
| --- | --- | --- |
| `5d4864fa-bc18-442d-b0d3-983887ce57ba` | — | Canonical report; the other four dedup to it |
| `a60b95b3-4a33-41d6-acfb-a2f398f2abda` | PROJECT_Job_Management | 3 conversion scripts reverted to pre-merge stock (424→356, 377→296, 167→129 lines); `typecheck` script with a load-bearing `--max-old-space-size=4096` flag |
| `24ee838a-2e5a-4b74-97aa-745df8806878` | PCSoft conversion estate | 4 conversion scripts; `package.json` scripts `dev:demo`/`test:kit` + 4 declared deps (`drizzle-orm`, `drizzle-kit`, `helmet`, `express-rate-limit`) |
| `4294090f-ff98-4040-8bdb-21f45fb1a5ff` | JobBilling | 7 project-added npm scripts; now carries a `restore-project-scripts.mjs` workaround with a `--check` CI gate |
| `aef6a602-df28-4cdd-bf7e-aa3f4d369bf6` | Ebuy | `help:build` + `@wxkanban/help` (`file:shared/help`) — **the same two entries on three consecutive upgrades**, v1.7.39 / v1.7.44 / v1.7.48 |

- **Already caused an outage.** An earlier upgrade dropped `pg` and `mssql` from a consumer manifest; their API server died with `Cannot find package 'mssql'`.
- **The delayed-failure mode is the dangerous one.** `node_modules` still holds the dropped package (a `file:` dependency's symlink survives outright), so builds and tests keep passing. The loss only bites at the next `npm install`, which prunes the undeclared package — long after the upgrade, and looking like an unrelated problem.
- **Reporter-proposed design converges with FR-001.** `a60b95b3` independently arrived at the same fix: record checksums of kit-shipped files at install, compare on upgrade, and write divergent incoming files alongside as `<name>.kit-<version>.new`. That is FR-001 + FR-006, proposed by a user before we scoped it.
- **A reporter got the merge-vs-restore judgement right unaided.** `24ee838a` deliberately kept the kit's newer `pcsoft-page-to-react.py` while restoring three others, having verified the kit-only lines were the exact pre-merge originals their fixes had replaced. That is precisely the decision FR-004's report-don't-merge design preserves for the human.
- **Separate defect found in the same upgrade**, filed as `192e08c1-9c73-4d72-8aa3-03d9fb29701c` (low): v1.7.48 ships `scripts["typecheck:dbanalyze"] = "tsc -p tsconfig.wxdbanalyze.json"` but no such tsconfig reaches the consumer. Verified — the file exists in the kit source repo root but is absent from the release root-file allowlist, so it never ships. Out of scope here; noted because anyone repairing their manifest after an upgrade meets both at once and may misread the TS5058 as self-inflicted.

## Clarifications

### Session 2026-08-04

| # | Question | Decision |
|---|----------|----------|
| 1 | New scope, or fold into SCOPE-080? | Initially folded into 080 as "Item C", then lifted out on discovering 080 had already shipped as kit v1.7.16. A shipped scope stays the historical record of what it delivered; this is batch 2. |
| 2 | Auto-merge modified files, or preserve and report? | Preserve and report. Auto-merge on a working conversion script risks producing plausible-but-wrong output, which is the exact failure mode being fixed. |
| 3 | Stop the run when modifications are at risk, or proceed and report? | Stop (prompt / non-zero). `--yes` becomes an explicit logged override so the Cockpit's one-click path stays usable. |
| 4 | Recover files already lost in the field? | Out of scope — both reporters restored from their own checksummed backups. |
| 5 | Change which paths the kit owns? | No. `KIT_DIRS` / `KIT_FILES` membership is unchanged; only the *manner* of writing them changes. |
| 6 | Snapshot retention? | Keep the last **2**, pruned on the next successful upgrade — enough to recover from a bad upgrade and the one before it, with bounded disk growth. |
| 7 | FR-008 mechanism — how do we protect the upgrade that delivers the fix? | **Server-side 409 gate** on `GET /api/projects/:id/kit/upgrade`. Chosen over a standalone backup script or a documentation-only advisory because it is the only option that *enforces* rather than advises: the pre-fix client already sends `fromVersion`, already prints the first 300 chars of a non-OK body verbatim, and already `die()`s on 4xx without falling back to GitHub. The consumer's own unmodified script performs the refusal. Accepted consequences: the scope now spans the wxKanban server, and the gate must deploy before the kit release. |

### Session 2026-08-04 (Amendment A)

| # | Question | Decision |
| --- | --- | --- |
| 8 | New scope, or amend 121? | **Amend.** Same repo, same delivery path, same field-defect family, and it must ship in the same release — FR-011 is a prerequisite of FR-005, so splitting them would let the merge entrench the broken entries. |
| 9 | Which of the 11 referenced scripts ship, and which have their `package.json` entry removed instead? | Ship **8**, remove **4** entries. Decided as ship-10/remove-2, then corrected on reading the scripts' imports: `generate-project-lifecycle.ts` and `generate-project-devplan.ts` import `../src/db/*` and `../src/server/services/*`, and **the archive ships zero files under `src/`** — they can never run on a consumer, and they open a direct wxKanban-database connection. Shipping them would trade `MODULE_NOT_FOUND` for `ERR_MODULE_NOT_FOUND` at best. `watermark.mjs` and `check-schema-drift.ts` were checked the same way and *are* shippable (`shared/watermark/dist/` and `wxkanban-agent/core/orchestrator/schema-drift.ts` both ship). |
| 9a | Do consumers lose `devplan:generate` / `lifecycle:generate`? | **No capability is lost** — the commands have never executed on a consumer install. Dev Plan (SCOPE-081) and Lifecycle (spec 048) reach consumers through the Dev Cockpit and MCP, which is the supported path. Whether the kit should additionally offer MCP-backed local generators is a **new capability**, recorded in Open Questions rather than smuggled into this fix. |
| 10 | `check:getting-started` reads two wxKanban-only files that do not ship — restore them, or drop the script? | Neither. Ship the script and make it **skip cleanly** when its inputs are absent (FR-013). Shipping it unguarded would only exchange `MODULE_NOT_FOUND` for `ENOENT`; shipping wxKanban's own onboarding docs to every consumer is worse. |
| 11 | Fix the 11 paths, or gate the release? | **Both.** The paths are the outage; the gate (FR-012) is the reason it does not recur, and it closes `192e08c1` in the same pass. |

## Open Questions

- **MCP-backed local devplan/lifecycle generation.** FR-011 removes `devplan:generate` and `lifecycle:generate` because their scripts are app-side and direct-database. If a local CLI path to those documents is wanted for consumers, it needs new MCP-backed generators — a new capability with its own scope, not a repair of this one.
- **A single source for consumer-facing scripts.** FR-010 copies 10 files into the orchestrator repo, which makes them a second lineage under names that already exist in wxKanban — the exact divergence this scope's Notes warn produced a wrong diagnosis during triage. Copying is the delivery mechanism; whether consumer-facing scripts should ultimately live in **one** repo (orchestrator-owned, with wxKanban consuming them) is deferred. FR-012 bounds the damage in the meantime by making a missing file a build failure, but it cannot detect two copies that have silently drifted apart.
- **FR-008 acknowledgement + sunset.** The mechanism is settled (server-side 409 gate), but two details are not: how the acknowledgement is expressed and persisted — a query parameter a pre-fix client can send unaided is the floor, a per-project flag set from the wxKanban UI or Cockpit is the richer option — and what condition sunsets the gate so it cannot outlive its purpose.
- **Tombstone authoring.** Whether the kit-removed-file list is hand-maintained per release or derived by diffing consecutive `kit-manifest.json` files at build time. The derived option is less error-prone but needs the previous release's manifest available at package time.
