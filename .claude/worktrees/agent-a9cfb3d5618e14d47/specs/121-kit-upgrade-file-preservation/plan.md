# Implementation Plan: Kit Upgrade File Preservation

**Spec**: 121 · **Spec ID**: `dde4a6e7-19c0-4253-a174-268324927b7c` · **Phase**: design

## Read this first

The script consumers run is **`wxKanban-agent-Orchestrator/scripts/upgrade-kit.mjs`**, not
`wxKanban/scripts/upgrade-kit.mjs`. The two share a filename and have **opposite delete semantics**:

| | `wxKanban/scripts/` (author-side) | `wxKanban-agent-Orchestrator/scripts/` (**shipped**) |
|---|---|---|
| Method | `rmSync` whole dirs → `cpSync` | Extract archive **over project root** |
| Project-only files | destroyed | **preserved** |
| Overwrite gate | none | `--confirm-overwrite`, GitHub fallback only |
| Flags | `--source`, `--from-server`, `--dry-run`, `--force` | `--confirm-overwrite`, `--allow-downgrade` |

Diagnosing this defect from the wxKanban copy produces wrong conclusions — it already did during
triage of the five reports behind this spec, and four customers received written corrections that had
to be retracted. `kit-update-check.ts` documents the same split for `check-kit-version.mjs`; it
generalises to the whole `scripts/` tree.

**Every task below targets the orchestrator repo.** This is a cross-repo change plus a release, and it
inherits the two-repo drift risk SCOPE-080 hit on its Item A.

## Architecture

Per `stack.md`: Node.js 20 LTS, Vitest for unit tests. This work is plain ESM `.mjs` kit scripts plus
Vitest specs — no Express, React, Postgres, or Tailwind surface. `node:crypto` `createHash('sha256')`
covers hashing; **the kit must not gain a runtime dependency**, since it ships to consumers and CI
already guards against dependency creep in the kit archive.

### The enabling insight

Overlay extraction is *less* destructive than delete-and-replace — project-only files survive — but it
is **equally blind**. Neither design can tell a consumer-modified file from a pristine one. So the
defect is not "it deletes things"; it is "it has no provenance". Everything else in this plan is
downstream of T001 and T002.

```
                 ┌─────────────────────────────┐
  install ──────►│ T001 write kit-manifest.json│
  upgrade ──────►│  path → sha256 as shipped   │
                 └──────────────┬──────────────┘
                                ▼
                 ┌─────────────────────────────┐
                 │ T002 comparator (pure)      │
                 │ pristine │ modified │       │
                 │ project-only │ kit-new      │
                 └──────────────┬──────────────┘
       ┌────────────┬───────────┼───────────┬────────────┐
       ▼            ▼           ▼           ▼            ▼
   T004 guard   T005 pkg    T006 kit-new  T009 warn   T010 dry-run
   extraction    merge       preserve      parity      real diff
       └────────────┴───────────┬───────────┴────────────┘
                                ▼
                    T007 manifest + stop
                    (T008 routes stale deletes here)
```

### Sequencing

1. **T003 first if you want value early.** The snapshot is independent of the manifest and is pure downside protection — it converts silent loss into recoverable loss with no classification logic. Ship it alone if the rest slips.
2. **T001 → T002** are the foundation. Nothing else is implementable without them.
3. **T004–T010** all consume T002 and can proceed in parallel.
4. **T011 runs on a separate track** — it is wxKanban *server* work, so it parallelises fully with T001–T010. Its one hard constraint is that the gate must be **deployed before** the kit release ships.
5. **T012 gates T013.** Do not release without both extraction branches under test.

## Key decisions already locked

| Decision | Rationale |
|---|---|
| Preserve and report; **never** auto-merge | Auto-merging a working conversion script reproduces the exact silent-wrong-output failure being fixed. A reporter kept the kit's newer `pcsoft-page-to-react.py` while restoring three others — that judgement must stay with the human. |
| Stop the run (prompt / non-zero) when files are at risk | Exit 0 is what made this invisible. `--yes` survives as a **logged** override so the Cockpit one-click path still works. |
| Snapshot retention = 2 | Enough to recover from a bad upgrade and the one before it, with bounded disk growth. |
| Archive contents frozen | What the kit ships is out of scope; only *how it is written* changes. |
| No new runtime dependency | The kit ships to consumers; `node:crypto` is sufficient. |

## Risks

- **~~The delivering release is unprotected by construction.~~ Resolved — server-side gate (T011).** The original reasoning was that nothing can alter code already on a consumer's disk, so the delivering upgrade must be unprotected. That is still literally true, but it turns out not to matter: the pre-fix client already sends `fromVersion`, already prints 300 characters of any non-OK response body verbatim, and already `die()`s on 4xx *without* falling back to GitHub. So the server can refuse the delivering upgrade and explain why, using only behaviour the consumer already has. Residual risk is now **deploy ordering** — the gate must be live before the kit release, or the earliest upgraders get nothing. See the next item.
- **Deploy ordering is now a real failure mode.** T011 lives in the wxKanban server; T001–T010 live in the orchestrator repo. Ship the kit before deploying the gate and the fastest-moving consumers — the most engaged ones — are exactly the ones left unprotected. T013 gates on the server deploy.
- **T011 pulls server work into an otherwise kit-only scope.** This was a kit-side scope; the gate cannot live in the kit, because the kit code on a pre-fix consumer's disk is precisely what cannot be changed. Budget for a wxKanban deploy alongside the kit release.
- **300-character budget.** The client truncates the 409 body at `.slice(0, 300)`. The instruction must survive that cut. Verify against the real truncation rather than eyeballing it.
- **The gate must not brick the fleet.** It blocks upgrades until acknowledged. It needs a working acknowledgement path a pre-fix client can actually exercise unaided (a query parameter is the floor), and a defined sunset.
- **Platform-split data loss.** A fix applied to `tar -xzf` but not `Expand-Archive -Force` would leave every Windows consumer exposed — and all five field reports are Windows Server 2022. T012 must assert both.
- **Noisy first run.** Every project upgrading for the first time after this ships has no baseline manifest, so every differing file classifies as `modified`. This is correct fail-safe behaviour, not a defect, but it will generate a large first-run report and should be called out in the release notes.
- **Cross-repo drift.** The fix lives in a different repository from this spec. SCOPE-080's Item A hit exactly this; the mitigation there was a release-time guard in the sync script that refuses to publish if the expected markers are missing. Consider the same for T001's manifest emission.
- **Staging-directory disk cost.** T004's likely implementation extracts to a staging dir before reconciling, roughly doubling peak disk during upgrade. Acceptable, but worth measuring on the largest kit archive.

## Delivery

One `scripts/sync-to-orchestrator.mjs --release`, per T013. Verify end to end on a real consumer
project — not just in tests — that a deliberately modified kit file survives with a `.kit-new` beside
it and that `package.json` keeps its own scripts and dependencies.
