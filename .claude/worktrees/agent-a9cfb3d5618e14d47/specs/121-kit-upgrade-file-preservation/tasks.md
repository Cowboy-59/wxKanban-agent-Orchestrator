# Tasks: Kit Upgrade File Preservation

**Spec**: 121 · **Spec ID**: `dde4a6e7-19c0-4253-a174-268324927b7c` · **Phase**: design
**Target repo**: `wxKanban-agent-Orchestrator` — **not** this one. See T013.

| # | Task | Priority | Status |
|---|------|----------|--------|
| T001 | Write `.wxai/kit-manifest.json` at install and upgrade | critical | released |
| T002 | Manifest comparator — classify pristine vs modified vs project-only | critical | released |
| T003 | Unconditional pre-upgrade snapshot with 2-deep retention | critical | released |
| T004 | Guard extraction so modified files are not overwritten in place | critical | released |
| T005 | Merge `package.json` instead of overwriting it | critical | released |
| T006 | Preserve list for customizable trees, writing `*.kit-new` | high | released |
| T007 | Post-extraction change manifest plus stop when work is at risk | critical | released |
| T008 | Surface `cleanupStaleAfterExtract` deletions in the manifest | medium | released |
| T009 | Close the fallback-vs-normal overwrite warning asymmetry | high | released |
| T010 | Make `--dry-run` perform the real comparison | medium | released |
| T011 | Server-side 409 gate protecting the delivering upgrade | high | released |
| T012 | Regression suite covering both extraction branches | high | released |
| T013 | Ship via `sync-to-orchestrator --release` and verify end to end | high | released |
| T014 | Copy the 8 shippable consumer-facing scripts into the orchestrator repo | critical | released |
| T015 | Remove the 4 stale/unshippable script entries, packed and on-disk | critical | released |
| T016 | Fail-closed `package.json`-vs-archive integrity gate in `build-release.mjs` | critical | released |
| T017 | Make `check-getting-started-sync.mjs` skip cleanly when its inputs are absent | high | released |
| T018 | Reply to `a01a6b7c` once the fix ships | medium | done |
| T019 | Snapshot as a single archive, staged outside the project | high | built |
| T020 | A failed or partial extraction stops the upgrade (Amendment C, FR-016) | critical | built |
| T022 | Install `wxkanban-agent/` runtime dependencies from `init.mjs` (FR-017) | critical | built |
| T021 | Ship T020 + T022 and answer `11ee7968`, `e7ee95c6`, `a5a21bd8` | high | todo |

**`released` = live for consumers in kit v1.7.56** (2026-08-14), verified from the downloaded
asset rather than the local build. The T011 server gate is deployed and was observed firing against
a real pre-fix consumer at v1.7.54; a deliberately modified file survived a real upgrade with its
`.kit-new` alongside. T018's replies were sent — 17 reports answered individually. T001–T010 and T012 live in
`wxKanban-agent-Orchestrator/scripts/upgrade-kit.mjs` (465 → ~1025 lines) plus
`tests/unit/upgrade-kit-preservation.test.mjs`; T011 lives in this repo as
`src/server/services/KitUpgradeGateService.ts`, wired into `GET /api/projects/:id/kit/upgrade`.

Verification actually run (2026-08-13):

| Check | Result |
|---|---|
| Preservation suite, both archive branches | 11/11 pass, **0 skipped** (tar.gz + zip) |
| Gate decision + message budget | 15/15 pass; message is **299 of 300** characters |
| Two-round upgrade on a scratch consumer | patch survived, `.kit-new` written, stock file still updated |
| `package.json` merge | `file:` dep, consumer scripts and unknown keys all preserved |
| Server bundle | `npm run build:server` clean; gate present in `dist/server.cjs` |
| New runtime dependency | none — every import in the kit script is a `node:` builtin |

Known gaps, stated rather than implied:

- The **first** upgrade for any existing consumer is still an unguarded overwrite. There is no
  manifest yet to compare against, so that run falls back to the historic behaviour and relies on
  T003's snapshot. This is exactly what T011 exists to cover, and it is why the ordering below is not
  negotiable.
- The `.tar.gz` branch is proven by the suite but was **not** driven through the full two-round
  scratch-consumer flow by hand; Windows production uses `.zip`, which was.
- The lockfile reconcile in T005 exercised its warning path, not its success path — that needs one
  run with registry access.

## T013 — done, in the required order

1. **Server gate deployed** to production ahead of the kit release, as the ordering demanded.
2. **409 observed firing** against a real pre-fix consumer at `v1.7.54` — recorded in
   `companyauditlogs` as `kit.upgrade.preservation.acknowledged`, `outcome: warned`. Not inferred:
   the App Runner operations list showed no deployment, and the audit row is what proved the gate
   was live. Trust the evidence over the deploy log.
3. **Kit v1.7.56 released** and verified from the *downloaded* asset, not the local build.
4. **Confirmed on a real project**: a deliberately modified file survived the upgrade with its
   `.kit-new` beside it, and a snapshot was taken.

The known gaps above still stand — the first upgrade for an existing consumer remains an unguarded
overwrite by necessity, and the `.tar.gz` branch is covered by the suite rather than by a hand-driven
two-round run.

## Build order

T001 → T002 are the foundation; nothing below them works without the provenance record and the
comparator. T003 is independent and can land first as standalone protection. T004–T010 all depend on
T002. T012 gates T013.

**T011 is on a separate track — it is server work, not kit work**, so it can proceed fully in parallel
with everything else. It has one hard ordering constraint: the server gate must be **deployed before**
the kit release ships, or the first upgraders into the fixed version get no protection at all.

```text
kit repo (wxKanban-agent-Orchestrator)
  T001 ──► T002 ──┬─► T004 ──┐
                  ├─► T005    │
  T003 ───────────┤   T006    ├─► T012 ──► T013 ship kit
                  ├─► T007 ◄──┘              ▲
                  ├─► T008                   │
                  ├─► T009                   │  MUST be deployed first
                  └─► T010                   │
                                             │
wxKanban server (this repo)                  │
  T011 409 gate ──► deploy ───────────────────┘
```

---

## T001 — Write `.wxai/kit-manifest.json` at install and upgrade

- [ ] Emit `{kitVersion, ownedPaths, files: {relPath: sha256}}` for every file the archive ships.
- [ ] Write from `init.mjs` on first install and from `upgrade-kit.mjs` after every successful extraction.
- [ ] Use `node:crypto` `createHash('sha256')`, streaming. **No new dependency** — the kit ships to consumers.
- [ ] Confirm `.wxai/` is outside the archive so the manifest survives an upgrade.

## T002 — Manifest comparator

- [ ] Pure, side-effect-free function: manifest + on-disk tree → per-path classification.
- [ ] Classes: `pristine` (hash matches), `modified` (hash differs), `project-only` (absent from manifest and archive), `kit-new` (in archive, absent on disk).
- [ ] No baseline manifest ⇒ every differing file classifies as `modified`. Fail safe, not fail silent.
- [ ] Unit-testable in isolation; this is the primitive T004–T010 all consume.

## T003 — Unconditional pre-upgrade snapshot

- [ ] Snapshot every path the upgrade will touch into `.wxai/kit-upgrade-snapshot-<timestamp>/` before any write.
- [ ] Print the absolute location at the start **and** again in the final summary.
- [ ] Cover the normal wxKanban path, the GitHub fallback, the Cockpit install row, and `--force` delegation. No path exempt.
- [ ] Abort the upgrade if the snapshot fails rather than proceeding unprotected.
- [ ] Prune to the last 2 on the next successful upgrade.

## T004 — Guard extraction against modified files

- [ ] Consult the T002 comparator before extraction lands; a `modified` file is not overwritten.
- [ ] **Both branches**: `Expand-Archive -Force` (Windows) and `tar -xzf` with `cwd=root` (everything else).
- [ ] Extracting to a staging directory and reconciling is likely simpler than making either extractor selective.
- [ ] Every field report so far is Windows — that branch needs the most care.

## T005 — Merge `package.json`

- [ ] Update only kit-owned scripts and dependencies; preserve every unknown key verbatim.
- [ ] Never drop a consumer-declared dependency.
- [ ] A consumer script colliding with a kit script is reported via T007, not replaced silently.
- [ ] Regression test: consumer manifest with extra scripts and a `file:` dependency; clean clone + `npm ci` must build.
- [ ] This task alone accounts for 3 of the 5 field reports.

## T006 — Preserve list for customizable trees

- [ ] **One** declared constant. Do not duplicate the list per call site.
- [ ] Minimum membership: `.claude/<skill>/scripts/`, `_wxAI/rules/`.
- [ ] Modified file there ⇒ left alone, kit version written as `<name>.kit-new` beside it, named in the T007 manifest.
- [ ] Unmodified file ⇒ upgrades in place, no `.kit-new` noise.
- [ ] Open question: does `.claude/skills/` join wholesale? A reporter asked for the broader list.

## T007 — Change manifest and stop when work is at risk

- [ ] Print every replaced-modified file, every `*.kit-new` written, every stale-file deletion — each by path.
- [ ] Non-empty set ⇒ prompt or exit non-zero. Never exit 0 silently.
- [ ] `--yes` stays an override but logs `proceeded over N at-risk file(s)`, keeping the Cockpit one-click path usable without going silent.
- [ ] Report counts even when zero, so absence of a warning is affirmative rather than inferred.

## T008 — Surface `cleanupStaleAfterExtract` deletions

- [ ] The hardcoded rename list (incl. `.claude/skills/wxConversion`, `.claude/skills/wxConversionScope`) keeps deleting — that is deliberate cutover behaviour.
- [ ] Route those deletions through the T007 manifest instead of performing them silently.
- [ ] Resolve: hand-maintained per release, or derived by diffing consecutive `kit-manifest.json` files at package time?

## T009 — Close the warning asymmetry

- [ ] The GitHub fallback gates on `--confirm-overwrite` and names 4 files; the normal path has **no gate at all**.
- [ ] Give the normal path a warning at least as informative, naming actual at-risk files from the T002 comparison.
- [ ] **One shared code path** for the warning so the asymmetry cannot silently reappear.
- [ ] This is the reporters' own suggested fix 5.

## T010 — Real `--dry-run`

- [ ] Run the full T007 comparison, print the manifest it would print for real, change nothing on disk.
- [ ] Exit non-zero when it would have prompted, so it works as a scripted pre-upgrade check.
- [ ] Today it would not have warned any of the five reporters.

## T011 — Server-side 409 gate protecting the delivering upgrade

**Mechanism decided: server-side.** This is a **wxKanban server** task, not a kit task — the gate must
live where the consumer's unmodifiable code will hit it.

It works by exploiting three behaviours the pre-fix client **already has**:

| Shipped-client behaviour | Line | What it gives us |
|---|---|---|
| sends `fromVersion=<kit version>` on every request | 242 | server can identify a pre-fix client exactly |
| non-OK ⇒ `throw HTTP <status> from wxKanban: <body.slice(0,300)>` | 258 | 300 chars of server-controlled text, printed verbatim |
| 4xx ⇒ `die(err.message)`, **no GitHub fallback** | 418-420 | clean stop, nothing written to disk |

- [ ] In `GET /api/projects/:id/kit/upgrade`, return **409** when `fromVersion` is below the release carrying this fix, or is `unknown` (fail safe).
- [ ] Body **under 300 characters** with the actionable instruction. Verify against the real `.slice(0, 300)` truncation — do not assume it fits.
- [ ] Accept an acknowledgement on re-request and serve the archive normally. A query parameter is the only form a pre-fix client can send unaided, so that is the floor.
- [ ] Record the acknowledgement per project so the gate fires **once**, not on every upgrade.
- [ ] Never gate a client already at or above the fixed release.
- [ ] Keep `X-Kit-Sha256` / `X-Kit-Version` / `X-Kit-FromVersion` / `X-Kit-Mode: upgrade` intact on success — the pre-fix client hard-validates `X-Kit-Mode` and dies on anything else.
- [ ] Define and implement the **sunset** so the gate cannot outlive its purpose.
- [ ] Mirror the instruction in the `ensureKitUpToDate` banner, the Cockpit "Kit update available" row, and the release notes, so the 409 reads as expected rather than as an outage.

**Accepted bypass**: a consumer whose wxKanban is unreachable falls through to the GitHub path, which
the gate cannot reach. That path already demands `--confirm-overwrite` and names files at risk.

**Deploy ordering**: the server gate must be live **before** the kit release ships, or the first
upgraders get no protection. See T013.

## T012 — Regression suite

- [ ] Modified kit file is not overwritten without appearing in the manifest — **both branches**.
- [ ] Upgrade path has not regressed to delete-and-replace of whole directories (that would destroy the project-only files overlay extraction preserves).
- [ ] Synthetic consumer tree — modified kit file + project-only file + customized `package.json` — survives intact and is fully reported.
- [ ] Run exits non-zero, or prompts, when files are at risk.
- [ ] Wire into CI. Vitest, per `stack.md`.

## T013 — Ship and verify

- [ ] All kit implementation lands in `wxKanban-agent-Orchestrator/scripts/upgrade-kit.mjs`. **Editing `wxKanban/scripts/upgrade-kit.mjs` changes nothing for any consumer.**
- [ ] **Deploy the T011 server gate FIRST.** Shipping the kit before the gate is live leaves the earliest upgraders — the ones who upgrade fastest, i.e. the most engaged consumers — completely unprotected.
- [ ] Verify the 409 fires against a real pre-fix consumer before cutting the kit release.
- [ ] Cut one `sync-to-orchestrator --release`.
- [ ] Verify on a real consumer project: manifest written, snapshot taken, a deliberately modified kit file survives with a `.kit-new` beside it, `package.json` keeps its own scripts and dependencies.
- [ ] Confirm the kit still ships no new runtime dependency.

---

## Amendment A — release packaging integrity (T014–T018)

Field report `a01a6b7c` (critical). The archive's `package.json` names 13 `scripts/*` paths and ships
exactly one of them. Broken since **v1.2.7**, not by the v1.7.46/48 upgrade.
**T014–T016 are independent of T001–T013
and can land first** — they need no manifest and no comparator, so they are the fastest route to
unbreaking `npm run kit:start` in the field. T015 must precede T005 (see FR-012).

**Status `released` = live for consumers in kit v1.7.49** (2026-08-05) —
<https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/releases/tag/v1.7.49>, orchestrator
`6b038a3`, published assets SHA-verified against the local build. Proven against the **downloaded**
asset, not the local staging tree: all 8 scripts present, 11 kit-owned paths resolve, 0 entries still
naming `setup-mcp` or `generate-project-*`, `kit-status` executes. T018's reply is now unblocked.

The sync itself demonstrated why the strip had to live in `sync-to-orchestrator.mjs`: it re-mirrored
wxKanban's `package.json`, which still carries all four entries, and logged
`removed unshippable npm scripts from kit package.json: kit:start:mcp, kit:start:legacy,
lifecycle:generate, devplan:generate`. A one-off edit of the orchestrator's copy would have been
silently undone here.

**Landed as `committed` first** (2026-08-05).
wxKanban `6c4e67aa` carries T015/T016's author-side half (the `kit-start.mjs` reconciliation, the
`FORBIDDEN_KIT_SCRIPTS` prune, `KIT_FILES`) and T017; orchestrator `347631f` carries T014 (the 8
scripts) and T016 (the gate, `KIT_INCLUDE_FILES`, and the 4 entries removed from the packed
manifest). **Nothing reaches a consumer until a `sync-to-orchestrator --release` and a GitHub
release** — that is what T018's reply waits on.

Verification actually run: `build-release --dry-run` exits 0 with all 11 kit-owned script paths
resolving; the same gate against a reconstructed v1.7.48 tree reports 14 rows covering exactly the 11
field-reported paths plus `tsconfig.wxdbanalyze.json` (`setup-mcp.mjs` and `setup-gateway.mjs` each
appear under two entries), and does **not** reproduce the `scripts/cli.ts` false positive; a freshly
built `kit.tar.gz` was extracted into an empty directory where an independent re-implementation of the
check — deliberately not importing `build-release.mjs`, so a bug in the gate could not make it pass —
resolved all 11 with 0 missing, and `kit-status`, `kit-stop` and `check-getting-started` executed
there with no `MODULE_NOT_FOUND` (`shared/watermark/dist/index.js` resolves too). `kit:start` itself
was **not** executed — it spawns a real gateway on port 3003 and would collide with the running one.

## T014 — Copy the 8 shippable consumer-facing scripts into the orchestrator repo

- [x] Copy from `wxKanban/scripts/` into `wxKanban-agent-Orchestrator/scripts/`: `kit-start.mjs`, `kit-stop.mjs`, `kit-status.mjs`, `setup-gateway.mjs`, `watermark.mjs`, `check-schema-drift.ts`, `check-hardcoded-strings.mjs`, `check-getting-started-sync.mjs`.
- [x] Do **not** copy `setup-mcp.mjs` — deleted at `b716d25` (v1.1.0 hosted-MCP cutover). See T015.
- [x] Do **not** copy `generate-project-lifecycle.ts` or `generate-project-devplan.ts` — they import `../src/db/*` and `../src/server/services/*`, and **the archive ships zero files under `src/`**. They are app-side, direct-database generators. Their entries are removed in T015 instead.
- [x] Confirm each resolves its own imports from a consumer tree (they may only reference paths the archive ships). Verified shippable: `watermark.mjs` → `shared/watermark/dist/index.js` ✅, `check-schema-drift.ts` → `wxkanban-agent/core/orchestrator/schema-drift.ts` ✅, remaining five → node builtins only ✅. Re-confirmed against the built archive: the only non-builtin imports across the eight are `watermark.mjs` → `../shared/watermark/dist/index.js` and `check-schema-drift.ts` → `../wxkanban-agent/core/orchestrator/schema-drift` (+ `dotenv/config`, a declared dependency), both present.
- [x] LF-normalize, per the existing whole-tree EOL pass.
- [x] `KIT_INCLUDE_DIRS` already contains `scripts` — **no allowlist change is needed or wanted.**
- [x] Verify by extracting a freshly built archive into an empty tree and resolving every scripts-block path. Done: 11 checked, 0 missing; `kit-status`, `kit-stop`, `check-getting-started` all execute there.

**These 10 files now exist in both repos under the same names** — the divergence hazard described in
this scope's Notes, which already caused one wrong diagnosis. T016 makes a *missing* file a build
failure but cannot detect two copies that have drifted. Recorded as an Open Question, not solved here.

## T015 — Remove the 4 stale/unshippable script entries

- [x] Delete `kit:start:mcp` and `kit:start:legacy` from the kit's root `package.json` (dead `setup-mcp.mjs`).
- [x] Delete `lifecycle:generate` and `devplan:generate` (app-side, direct-DB, need `src/` — see T014). No consumer capability is lost; both documents reach consumers via the Dev Cockpit and MCP.
- [x] Reconcile `kit-start.mjs`'s local-MCP branch (author-side `scripts/kit-start.mjs:109-112`) so the shipped copy has no path to a file that will not exist. It now warns and starts the gateway only when `setup-mcp.mjs` is absent, so the legacy path still works in this repo (which still has the file) and degrades cleanly in the kit (which never will).
- [x] Decide where the prune runs: `sync-to-orchestrator.mjs` already mutates the packed manifest at lines 483-506 (version bump + `FORBIDDEN_KIT_DEPS`), which is the established seam. Chosen — `FORBIDDEN_KIT_SCRIPTS` sits alongside `FORBIDDEN_KIT_DEPS`. The orchestrator's own `package.json` was pruned to match, but the sync is what makes it durable: a one-off edit there would be re-mirrored away.
- [ ] **T005's merge must remove these from a consumer's existing `package.json`**, not preserve them — otherwise every consumer already carrying them keeps them permanently.
- [ ] Report the removal in the T007 change manifest; treat a consumer-customized entry as modified under T004.

## T016 — Fail-closed integrity gate in `build-release.mjs`

- [x] Resolve every filesystem path referenced by the staged `package.json` `scripts` block against the staged archive tree; exit non-zero naming each unresolvable path. **Narrowed deliberately** to paths rooted in a `KIT_INCLUDE_DIRS` directory, plus `tsc -p` args. `dev:server` → `src/server/index.ts`, `build:client` → `vite.config.ts` and `test:unit` → `tests/unit` are template entries the *consumer's* application satisfies; the archive ships zero files under `src/` by design, so checking them would fail every build for paths the kit does not own.
- [x] Match paths **anywhere in the command string**, not just a leading `scripts/` token — the reporter's own regex produced a false positive on `tsx _wxAI/skills/wxDBAnalyze/scripts/cli.ts` by chopping the prefix. Do not reproduce that bug in the gate. Confirmed: the fixture run does not flag `cli.ts`.
- [x] Cover `tsc -p <config>` arguments; this closes ticket `192e08c1` (`tsconfig.wxdbanalyze.json` is referenced by `typecheck:dbanalyze` and is in neither allowlist).
- [x] Run the gate **before assets are uploaded**, so a short archive cannot be published and SHA-verified as in the v1.7.32 incident. It runs immediately after staging and before either archive is written — and in `--dry-run` too, since a dry run is how this is checked ahead of a release, so it has to be able to fail.
- [x] Fixture: run against the v1.7.48 tree and assert it reproduces exactly the 11 known failures. Reproduced — 14 rows over 11 distinct paths (`setup-mcp.mjs` and `setup-gateway.mjs` each named by two entries) plus the tsconfig.
- [x] Decide `192e08c1`'s own fix — add `tsconfig.wxdbanalyze.json` to `KIT_FILES` + `KIT_INCLUDE_FILES`, or drop the `typecheck:dbanalyze` entry. The gate forces the choice; it does not make it. **Decided: ship it** — added to both allowlists and copied into the orchestrator repo. The wxDBAnalyze skill ships, so the typecheck that guards it should too.

## T017 — `check-getting-started-sync.mjs` skips cleanly

- [x] Exit **0** with an explanatory skip line when `gettingStartedInstructions.md` or `public/gettingStartedInstructions.html` is absent. Verified: neither ships in the kit, and neither is meaningful in a consumer project. Confirmed in the extracted archive — prints the skip line naming both absent paths, exit 0.
- [x] Behaviour unchanged when both are present — this must not weaken the guard for wxKanban itself. The guard sits ahead of all existing logic and never fires here, where both files always exist.
- [x] `check-hardcoded-strings.mjs` needs no guard: it scans staged `.tsx` via git or explicit arguments and hardcodes no wxKanban path. Ship unmodified.
- [ ] **Residual, low — still open.** Run in a tree that is not a git repository, `check-hardcoded-strings.mjs` prints `error: unknown option 'cached'` from its `git diff --cached` probe before exiting 0. Reproduced again in the extracted archive on 2026-08-05. Harmless and invisible in a real consumer project (which is a git repo), but it is confusing output. Guard the git probe, or state the non-repo case. Found by running the script in the extracted archive, not by static analysis.

## T018 — Reply to `a01a6b7c` once the fix ships

- [ ] Hold the reply until the release is out (decided 2026-08-04).
- [ ] Carry both corrections: it is **not** a v1.7.46/48 regression (never shipped since v1.2.7 — their own initial commit containing only the 8 survivors corroborates this), and `scripts/cli.ts` is a **false positive** (`db:analyze` is `tsx _wxAI/skills/wxDBAnalyze/scripts/cli.ts`, present in the v1.7.48 archive). Real count: 11.
- [ ] State that `setup-mcp.mjs` is intentionally dead and its two entries were removed rather than restored.
- [ ] Mark `3f665c75` (the narrower kit-status.mjs report this one supersedes) resolved by the same release.
- [ ] Reply on `192e08c1` too — closed by the same gate.

## AMENDMENT B (2026-08-25) — the snapshot was a second kit tree inside the project

**Field report `eb54b9e5`, kit v1.7.61 (FR-015).** T003 shipped the snapshot as an expanded directory
at `.wxai/kit-upgrade-snapshot-<timestamp>/`. The kit archive carries **50 `*.test.ts` files** —
confirmed against the shipped `releases/v1.7.61/kit.tar.gz`, not inferred — so the backup put a
second copy of each inside the consumer's project, where every glob-driven tool finds it. The
reporter's `vitest.config.ts` leaves `include` at the default recursive glob, so a known-failing kit
test ran twice and reported two failing files, with nothing marking the second as a duplicate.

**`.wxai/` being a dot-directory is not protection** — vitest globs with `dot: true`. The reporter's
own evidence proves it: their run found the copy.

**Wider than the report.** The same duplication reaches `tsc` includes, eslint/biome sweeps and
ripgrep. Fixing it per tool (teaching vitest to exclude `.wxai/**`) leaves the trap set for the next
tool, and the kit does not own the consumer's `vitest.config.ts` anyway. Fixed at the source instead:
the artifact stops being glob-visible.

## T019 — Snapshot as a single archive, staged outside the project

- [x] Durable artifact is one archive file — `.zip` on Windows, `.tar.gz` elsewhere. Verified that
      Windows' bundled bsdtar (`C:\Windows\System32\tar.exe -a -cf`) writes a real `PK\003\004` zip
      and that `Expand-Archive` round-trips it, so a hand recovery needs no extra tooling.
- [x] The expanded copy is staged via `mkdtemp` in the OS temp dir — FR-005's `package.json` merge
      still reads it — and removed in the `finally`, so an aborted run leaves no second tree either.
- [x] Fall back to the expanded directory when no archiver is available, warning that it is visible
      to test and lint globs. Protection outranks tidiness: never extract unprotected.
- [x] Retention treats archives and legacy expanded directories as one lexically-sorted list, so an
      upgrading consumer ages their pre-B directories out. A retained directory is named with the
      same warning.
- [x] Sweep orphaned `.wxai/kit-staging-<ms>/` trees left by a killed run — same hazard, same fix.
- [x] `--dry-run` names the archive path it would write, not just "under `.wxai/`".
- [ ] Ship it. Cross-repo as always: the change is in
      `wxKanban-agent-Orchestrator/scripts/upgrade-kit.mjs` — editing this repo's same-named script
      changes nothing for consumers.
- [ ] Reply to `eb54b9e5` once the release is out, saying that an existing
      `.wxai/kit-upgrade-snapshot-*/` directory has to be deleted by hand or aged out by two more
      upgrades — this fix cannot reach a backup already on their disk.

**Verification actually run (2026-08-25):** preservation suite **19/19 pass**, up from 15. The four
new tests were run against `git show HEAD:scripts/upgrade-kit.mjs` first and **3 of 3 applicable
failed** on the pre-fix script, so they test the change rather than restating it. One of the four
drives a **real** `applyUpgrade` (`dryRun: false`) end to end — every other `applyUpgrade` test in
that file is a dry run, so nothing previously proved the finished sequence leaves the project clean.
It asserts one archive file under `.wxai/`, no staging directory, the upgrade landed, exactly one
`*.test.ts` discoverable, and the consumer's edited file restored byte-identical out of the archive.

## AMENDMENT C (2026-11-01) — a failed Windows extraction reported as a successful upgrade

**Field reports `11ee7968`, `e7ee95c6`, `a5a21bd8` (FR-016)** — three projects, three Windows Server
2022 hosts. A Defender lock makes `Expand-Archive` roll back everything it extracted while
`powershell.exe` exits 0; the upgrade then installs nothing, stamps the new version and writes
`files: {}` over the manifest. Verified in the shipped `extractArchive()` (exit status is the only
check) and `writeKitManifest()` (writes whatever it finds).

## T020 — A failed or partial extraction stops the upgrade

- [x] Windows zip: bundled `tar.exe` with cwd = staging; `Expand-Archive` only as the fallback, with
      `$ErrorActionPreference = Stop`.
- [x] Up to 3 extraction attempts, a short pause apart, before failing.
- [x] Verify every archive file entry is present in staging; otherwise throw naming the count and
      the first few missing paths.
- [x] Reconcile (and the no-manifest overwrite path) collects write failures; after the
      `package.json` merge, any failure throws before the manifest, the version stamp and `init.mjs`.
- [x] `writeKitManifest()` refuses to write 0 files.
- [x] `.wxai/kit-manifest.json` joins the pre-upgrade snapshot targets.
- [x] Tests in `tests/unit/upgrade-kit-preservation.test.mjs`: a truncated extraction fails with the
      version and manifest untouched; a write failure fails the same way; a 0-file manifest is never
      written; a re-run after a failure converges. Each run against the pre-fix script first.

**Verification actually run (2026-11-01):** preservation suite **26/26 pass** (21 + 5 new). The 5 new
tests were run against `git show HEAD:scripts/upgrade-kit.mjs` first and **5 of 5 failed** — the
first one reproduces the field report exactly (the pre-fix upgrade resolved with exit code 0 over an
empty extraction). Live on Windows: an exclusive lock held on a destination file made the bundled
`tar.exe` fail per entry; held for 20s the run retried 3 times and threw with the file untouched,
released after 3s the third attempt succeeded. That live run caught a gap the unit tests did not: a
file already present satisfied the "every entry exists" check while `tar.exe` had failed on it, so an
extractor error now fails the attempt even when every path exists.

## T022 — Install the agent's own dependencies (FR-017)

- [x] `ensureAgentDepsInstalled()` in `scripts/init.mjs`, called after the root install: probe each
      runtime dependency of `wxkanban-agent/package.json` in `wxkanban-agent/node_modules` then
      `node_modules`; if any is missing, `npm install --omit=dev --no-audit --no-fund` in
      `wxkanban-agent/`.
- [x] Failure warns loudly (what will not work, the manual command) and does not bail.
- [x] Verified on a real extracted kit tree: missing → installs; present → no-op; no agent manifest → no-op.

**Verification actually run (2026-11-01)** against the **published v1.7.87 `kit.tar.gz`**, extracted,
with only the new `init.mjs` step run: 5 of 5 agent dependencies missing before
(`@anthropic-ai/claude-agent-sdk`, `@wxkanban/preflight`, `pino`, `uuid`, `ws`); one
`npm install --omit=dev` (118 packages, 6s); 0 missing after; a second run was a no-op; a tree with no
agent `package.json` was a no-op. Resolved from `wxkanban-agent/apps/remote-bridge/src/`, `ws`, `uuid`
and `pino` land in `wxkanban-agent/node_modules` and the Agent SDK imports with `query` a function.
Note the published kit ships **no `wxkanban-agent/dist/`**, so consumers run the agent from source via
`tsx` — the same dependencies are needed either way.

## T021 — Ship and answer the reporters

- [ ] Release through `sync-to-orchestrator --release`; verify the published asset carries the fix.
- [ ] Resolve `11ee7968`, `e7ee95c6`, `a5a21bd8`. Tell them a manifest already emptied is not
      repaired by this release: the next upgrade treats every differing file as possibly theirs (the
      no-baseline path), then writes a correct manifest.
