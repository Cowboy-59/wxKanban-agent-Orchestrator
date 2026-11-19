# Requirements Checklist: Kit Upgrade File Preservation

**Spec**: 121 · Traces each FR to its implementing task and its proving test.

| FR | Requirement | Task(s) | Proven by | Done |
|----|-------------|---------|-----------|------|
| FR-001 | `.wxai/kit-manifest.json` provenance record, SHA-256 per kit-shipped file | T001 | Unit: manifest shape; CI guard `.wxai` never in archive | [ ] |
| FR-002 | Unconditional pre-upgrade snapshot, all paths, retention 2 | T003 | Integration: snapshot present pre-write, prune at 3rd upgrade, abort on failure | [ ] |
| FR-003 | Modified files not silently overwritten; both branches; stale deletes reported | T004, T008 | Integration fixture rows 1–2, 7; both extraction branches | [ ] |
| FR-004 | Change manifest; stop when at risk; `--yes` logged | T007 | Integration: non-zero exit, `proceeded over N`, `0 modified` on clean tree | [ ] |
| FR-005 | `package.json` merged, never overwritten | T005 | Unit merge suite + `npm ci` from clean clone builds | [ ] |
| FR-006 | Preserve list for customizable trees, `*.kit-new` | T006 | Integration fixture rows 1–2, 4 | [ ] |
| FR-007 | Warning parity between fallback and normal path; real `--dry-run` | T009, T010 | Integration: shared code path asserted; dry-run writes nothing, exits non-zero | [ ] |
| FR-008 | Server-side 409 gate protecting the delivering upgrade | T011 | Server suite + end-to-end with an unmodified pre-fix client | [ ] |
| FR-009 | Regression guards in CI | T012 | The guards themselves | [ ] |
| FR-010 | Cross-repository delivery via `sync-to-orchestrator --release` | T013 | Manual end-to-end on a real consumer project | [ ] |

## Success metric verification

| # | Metric | Verified by | Done |
|---|--------|-------------|------|
| 1 | 3/3 fixture artifacts intact and named; 0 silent replacements | Integration fixture | [ ] |
| 2 | 0 modified files overwritten unreported, both branches | CI regression guard | [ ] |
| 3 | 100% of upgrade paths print snapshot + manifest | Integration across all 4 invocation paths | [ ] |
| 4 | Clean clone + `npm ci` builds, 100% of consumer scripts/deps present | Integration | [ ] |
| 5 | Snapshot retention bounded at 2 | Integration: 3rd upgrade prunes | [ ] |
| 6 | 0 silent exit-0 runs while files were at risk | Integration + CI guard | [ ] |

## Pre-implementation gates

- [ ] Confirmed the working file is `wxKanban-agent-Orchestrator/scripts/upgrade-kit.mjs` (`grep "overlays the archive"` hits; `grep "KIT_DIRS"` does not).
- [x] **T011's mechanism decided: server-side 409 gate on `/kit/upgrade`** (2026-08-04). Exploits three behaviours the pre-fix client already has — sends `fromVersion`, prints 300 chars of a non-OK body verbatim, and `die()`s on 4xx without falling back to GitHub.
- [ ] Both extraction branches available for testing (a WSL/macOS-only environment cannot exercise the Windows branch that broke all five customers).
- [ ] An unmodified **pre-fix** `upgrade-kit.mjs` kept aside to test the gate against — the gate's entire value is how that specific code behaves.

## Pre-release gates

- [ ] **T011 server gate deployed BEFORE the kit release ships.** Reverse this order and the fastest-moving consumers get no protection at all.
- [ ] 409 verified against a real pre-fix consumer, including that the body survives `.slice(0, 300)` with the instruction intact.
- [ ] Acknowledgement path exercised unaided by a pre-fix client, and confirmed to persist so the gate fires once.
- [ ] Gate sunset defined and implemented.
- [ ] Both extraction branches green in CI.
- [ ] Kit archive still ships no new runtime dependency.
- [ ] Release notes state that upgrades *into* this version still run the consumer's old script, and what to do about it.
- [ ] Release notes warn of the noisy first run: no baseline manifest means every differing file classifies as modified. Correct fail-safe behaviour, not a defect.
- [ ] Manual end-to-end on a real consumer project passed (T013).
- [ ] The four `inprogress` field reports updated to `resolved` with the shipped version.

## Out of scope — do not build

- Three-way merge or conflict markers. The upgrade preserves and reports; it never auto-merges.
- Recovery of files already lost in the field.
- Changes to which files the kit ships.
- `KitProxyService.UPGRADE_STRIP_FILES` (archive contents, not consumer disk).
- The PCSoft conversion-script defects (reporters filing separately).
- The `tsconfig.wxdbanalyze.json` packaging gap — feedback `192e08c1`, a release-allowlist omission.
