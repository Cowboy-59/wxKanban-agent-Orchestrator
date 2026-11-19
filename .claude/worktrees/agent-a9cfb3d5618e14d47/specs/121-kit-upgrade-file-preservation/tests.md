# Test Plan: Kit Upgrade File Preservation

**Spec**: 121 · **Framework**: Vitest (per `stack.md`) · **Target repo**: `wxKanban-agent-Orchestrator`

Every scenario runs against **both** extraction branches — `Expand-Archive -Force` (Windows) and
`tar -xzf` with `cwd=root` (everything else). All five field reports originated on Windows Server
2022, so a Windows-only gap is the most likely way this regresses.

## Fixture: the synthetic consumer tree

One reusable fixture reproducing all five field reports at once:

| Path | Setup | Expected after upgrade |
|---|---|---|
| `.claude/wxConversion/scripts/pcsoft-doc-split.py` | modified vs manifest hash | untouched; `.kit-new` written beside it; named in manifest |
| `.claude/wxConversion/scripts/unchanged.py` | matches manifest hash | upgraded in place; **no** `.kit-new` |
| `scripts/restore-project-scripts.mjs` | project-only, absent from archive | present, byte-identical |
| `_wxAI/rules/house-style.md` | project-only custom rule | present, byte-identical |
| `shared/help/` | project-only `file:` dep target | present; symlink target intact |
| `package.json` | consumer scripts `help:build`, `typecheck`; deps `@wxkanban/help` (`file:`), `pg`, `mssql` | all retained; kit's own scripts/deps updated |
| `.claude/skills/wxConversion/` | on the stale rename list | deleted (deliberate) **and reported** |

## Unit — T002 comparator

- [ ] Hash match → `pristine`.
- [ ] Hash differs → `modified`.
- [ ] Absent from manifest and archive → `project-only`.
- [ ] In archive, absent on disk → `kit-new`.
- [ ] **No manifest at all** → every differing file classifies `modified` (fail safe). Must not throw.
- [ ] Manifest present but missing an entry the archive ships → treated as `modified`, not `pristine`.
- [ ] Pure: same inputs, same output, no filesystem writes.

## Unit — T005 `package.json` merge

- [ ] Consumer script `help:build` survives; kit's `db:analyze` is added.
- [ ] `typecheck` carrying `--max-old-space-size=4096` survives verbatim — the heap flag is load-bearing on the reporting machine.
- [ ] Consumer deps `pg`, `mssql`, `drizzle-orm`, `helmet`, `express-rate-limit` all survive. **This is the outage case.**
- [ ] `@wxkanban/help: file:shared/help` survives — the three-consecutive-upgrades case.
- [ ] Unknown top-level keys (`engines`, `workspaces`, arbitrary) preserved verbatim.
- [ ] Name collision between a consumer script and a kit script → reported as conflict, not silently replaced.
- [ ] A dependency the kit deliberately removed is distinguishable from one the consumer added.

## Integration — full upgrade against the fixture

- [ ] All 7 fixture rows land as specified in the table above.
- [ ] Manifest names every replaced-modified file, every `.kit-new`, every stale deletion — by path.
- [ ] Run exits **non-zero** (or prompts) because the at-risk set is non-empty.
- [ ] With `--yes`: exits 0, and the log contains `proceeded over N at-risk file(s)` with N correct.
- [ ] Clean tree with zero modifications → exits 0 and still prints `0 modified files replaced`.
- [ ] **`npm ci` from a clean clone of the upgraded tree builds.** The end-state assertion for T005.

## Integration — T003 snapshot

- [ ] Snapshot exists before the first write; contains every path the upgrade touched.
- [ ] Absolute location printed at start **and** in the final summary.
- [ ] Taken on all paths: normal wxKanban, GitHub fallback, Cockpit row, `--force` delegation.
- [ ] Simulated snapshot failure → upgrade **aborts**, nothing written.
- [ ] Third upgrade prunes to 2 retained snapshots.
- [ ] Restoring from the snapshot reproduces the pre-upgrade tree byte-for-byte.

## Integration — T009 warning parity / T010 dry-run

- [ ] Normal wxKanban path emits an overwrite warning naming **actual** at-risk files from the comparison, not a fixed list of four.
- [ ] GitHub fallback and normal path resolve to the **same** warning code path (assert one implementation, e.g. by spying a single exported function).
- [ ] `--dry-run` prints the identical manifest to a real run and writes **nothing** — assert tree hash unchanged.
- [ ] `--dry-run` exits non-zero when the real run would have prompted.

## Regression guards (CI)

- [ ] **Fails if** a modified kit-shipped file is overwritten without appearing in the manifest — both branches.
- [ ] **Fails if** the upgrade path regresses to delete-and-replace of whole directories. Guard against re-importing the author-side lineage's behaviour; the project-only fixture rows are the canary.
- [ ] **Fails if** the kit archive gains a runtime dependency (extends the existing no-DB-deps guard).
- [ ] **Fails if** `.wxai/` ever appears inside the archive — that would make the manifest self-destroying.

## Server — T011 409 gate

Runs against the wxKanban server, not the kit. The critical property is that the **pre-fix client**
behaves correctly, so test with an unmodified copy of the shipped pre-fix `upgrade-kit.mjs`.

- [ ] `fromVersion` below the fixed release → **409**, archive not served.
- [ ] `fromVersion` = `unknown` → 409 (fail safe).
- [ ] `fromVersion` at or above the fixed release → served normally, never gated.
- [ ] **Body survives `.slice(0, 300)` with the instruction intact.** Assert against the real truncation, not the full string — this is the whole delivery channel.
- [ ] Acknowledged re-request → archive served, `X-Kit-Sha256` / `X-Kit-Version` / `X-Kit-FromVersion` / `X-Kit-Mode: upgrade` all present.
- [ ] Acknowledgement persists per project — a second upgrade does **not** re-gate.
- [ ] Sunset condition honoured: past it, no client is gated.

### End-to-end with a real pre-fix client

- [ ] An unmodified pre-fix `upgrade-kit.mjs` hitting the 409 prints the instruction, exits non-zero, and **writes nothing** — assert the tree hash is unchanged and no `.kit-upgrade-*` temp file remains.
- [ ] It does **not** fall back to GitHub on the 409 (the 4xx branch must `die`, not degrade).
- [ ] The acknowledgement form is one a pre-fix client can send **unaided** — no new client code required.
- [ ] Returning a non-`upgrade` `X-Kit-Mode` is **not** used as the channel: the pre-fix client's own error text would leak an internal value. Assert the gate uses status + body only.

## Manual verification before release (T013)

Automated tests cannot prove the cross-repo delivery worked. On a real consumer project, after
`sync-to-orchestrator --release`:

1. Deliberately modify a kit-shipped file and add a project-only file under `scripts/`.
2. Add a script and a `file:` dependency to `package.json`.
3. Upgrade from the published kit.
4. Confirm: manifest written; snapshot location printed; modified file intact with `.kit-new` beside it; project-only file intact; `package.json` additions intact; the change manifest names exactly what changed.

## Explicitly not tested

- Three-way merge behaviour — out of scope by decision; the upgrade never auto-merges.
- Recovery of files already lost in the field.
- The `tsconfig.wxdbanalyze.json` packaging gap (feedback `192e08c1`) — a separate release-allowlist defect.
