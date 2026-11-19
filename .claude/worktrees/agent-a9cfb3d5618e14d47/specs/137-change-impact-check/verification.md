# Verification: Change Impact Check

**Spec**: SPEC-137 · **Task**: T016 · **Run**: 2026-10-17, on Windows 10, Node 24.6, Claude Code 2.1.98

Everything here was run before release. The checks that need the pushed build (the hosted MCP,
the deployed app, the published Cockpit) are listed at the end and belong to T017.

## Success criteria

| SC | What was run | Result |
|---|---|---|
| SC-1 | `node _wxAI/impact/prove.mjs`: the JS/TS proof fixture seeds all eight link types | **Pass**. Every seeded link is found with the correct label |
| SC-2 | The hook run as a process, 40 warm edits on a synthetic 5,001-file TypeScript repo; 20 warm edits on this repo (3,525 files, TypeScript installed) | **Pass**. Synthetic: p50 452 ms, p95 538 ms, max 587 ms, cold 891 ms. This repo: p50 493 ms, p95 553 ms, max 629 ms. Limit: 2 s at p95 |
| SC-3 | **Live**: `claude -p` in `bypassPermissions` mode (model haiku) on a copy of the proof fixture, with the hook installed by `install-hook.mjs` | **Pass**. Boundary edit denied with the impact list as the reason; file unchanged. After `approve.mjs` the identical retry was allowed and the approval used up. The same edit again was denied: approvals do not carry over |
| SC-4 | **Live**: the same, with `WXAI_UNATTENDED=1` | **Pass**. The boundary edit went ahead without a wait. `unattended.mjs checkpoint` listed it: 1 crossing, with both reasons |
| SC-5 | **Live**: a Write of `ALTER TABLE items DROP COLUMN sku;`, attended and unattended | **Pass**. Denied both times in bypass mode; file never created. The unattended stop said "nobody can approve this now" and was listed at the checkpoint |
| SC-6 | The real HTTP transport (`mcpSender`): three agreements recorded against an unreachable address, then a local stand-in MCP that validates each call with the real `CaptureEventInputSchema` | **Pass**. Three queued while offline. On reconnect, all four (three queued and one new) arrived in order with the bearer token, all valid; queue empty |
| SC-7 | Engine suite: a changed file of an unread type | **Pass**. Reported as not read and checked by text mention; never "0 affected" |
| SC-8 | Adapter validator suite | **Pass**. `**Links proof:** passed` is refused without a fixture, or when the fixture fails |

## Suites, builds and fences

| Area | Result |
|---|---|
| Change Impact and adapter suites (root, 11 files) | 246 passed |
| MCP server (typecheck and suite) | Typecheck clean. 598 passed, 10 failed, 2 skipped. The 10 failures predate this work: 9 need a local test database (password authentication failed for user "test"), 1 reads a scope file from the wrong folder |
| Remote bridge (`wxkanban-agent`) | 18 passed |
| Cockpit (typecheck, suite, bundle) | Typecheck clean, 75 passed, bundle built |
| App client build (Vite) | Built. The bundle contains the new `change-impact` call |
| `auditfences` on every file SPEC-137 created or changed | 94 SCOPE-137 fences and no new finding. The findings that remain predate this work: UNKNOWN_TASK warnings in `test-lifecycle.ts` and `schemas.ts` (local task-index format), the 23 legacy declarations of `ProjectDetailPanel.tsx` (exempt again after a one-hash re-capture, with an amendment recorded), and SCOPE-127's un-fenced `isAdapterDoc` in `validate-adapter.mjs` |

## Found during verification, and fixed

- The hook's per-developer state (pending changes, approvals, crossings, the unattended marker)
  was not covered by `.gitignore`. A committed approval would let someone else's edit through.
  This repo's `.gitignore` now covers it, and `install-hook.mjs` adds the same entries to a
  customer project's `.gitignore` when it installs the hook (test added).
- Claude Code checks its own rule (read before edit) before the hook runs. A refused edit of that
  kind does not use up an approval, as confirmed live.

## Open: decisions for the owner

- ~~Edits made through Bash are not checked.~~ **Decided and built (Amendment A, FR-008a, T018), 2026-10-17.** See below.
- ~~Owner-only `impactMode` (FR-007) has no enforcement point.~~ **Decided and built (Amendment A, FR-007a, T019), 2026-10-17.** See below.

## Release (T017), 2026-10-17

| Channel | What shipped | Verified how |
|---|---|---|
| App and MCP (push `6d26edcc..82674cad`, then `..768e45ea`) | App 1.5.337 (then 1.5.338), hosted MCP | Both App Runner deploys of the SPEC-137 commit **SUCCEEDED**. `/api/version` reports 1.5.337. The live client bundle contains the `change-impact` call |
| Kit v1.7.78 (GitHub release, orchestrator `a152372`) | `_wxAI/impact/`, wxBrainstorm, `init.mjs` installs the hook (orchestrator `317e55e`, `ca6bf80`) | Published assets byte-match the local build. The downloaded archive has `hook.mjs` and `install-hook.mjs`, with `init.mjs` calling `installChangeImpactHook` (spawn hidden) |
| Cockpit 0.2.42 (Marketplace) | Status bar, badges, Problems, CodeLens, agree panel | `vsce show` reports 0.2.42 |

**Live probes against production:**

- `capture_event` with a `change_impact_ack` and no metadata: **refused** (`metadata: Required`). This
  proved the new code was serving before anything that could write was sent.
- `capture_event` with a complete record whose kind is `acknowledgment` but whose type is
  `change_impact_approval`: **refused** (`metadata.kind must be "approval"`). A self-agreement cannot
  be stored as an approval.
- `report_change_impact` with `dryRun: true`, sent through the kit's own `mcpCall` as the hook
  sends it (82 dependents of `TestImpactService.ts`): answered in 335 ms, `dryRun: true`, 0 matched.
  A read-only database check afterwards found **0** `preview` test cycles and **0** retests marked in
  the last 30 minutes, so the dry run wrote nothing.
- The new app route answers 401 without a session. So does a nonexistent route under the same
  prefix, because the projects router's sign-in check runs first, so this does not prove the route.

**Found by the kit release gate and fixed before release:** the hook install's spawn in `init.mjs`,
and the engine's git spawns in `_wxAI/impact/`, lacked `windowsHide`. On Windows each AI edit
could have flashed a console window. Version 1.7.77 was committed but never published as a
release.

**Release hygiene:** the orchestrator's working tree held another session's uncommitted SCOPE-068
Amendment A changes, which the build would have packed from the filesystem. They were set aside for
the release and restored byte for byte, verified by SHA-256 (`init.mjs` also carries the
`windowsHide` fix). The published archive was checked: it does not contain them.

**Still for the owner (needs a signed-in session or a desktop):**

- The authenticated route, including tenant isolation: another company's project must return 404.
- The Cockpit in a real VS Code window: every view updated within 3 s of a save, and the agree
  panel's Agree and Undo.

## Amendment A: Bash (T018), 2026-10-17

| Check | Result |
|---|---|
| **Live, bypass mode** (`claude -p`, haiku, real installer): `sed -i` on `src/server/service.ts` | **Denied** with the impact list (SCOPE-002, 5 affected files); the file was unchanged |
| **Live, bypass mode**: `sqlite3 app.db "DROP TABLE items"` | **Stopped** as possible data loss |
| Unit: redirect into another scope's file denied; the approved identical command passes once, the next is asked again; `>>` to the same file is a different command | Pass |
| Unit: `psql -c` inline and `psql -f` script with a dropped column stop, unattended too; a data-loss approval needs `--data-loss`; `SELECT` passes | Pass |
| Unit: `ls`, `git status`, `grep "DROP TABLE"`, output to `/dev/null`, here-document bodies, a quoted "> text" produce no output | Pass |
| Read-only command, real hook process | about 25 ms over a bare `node` start (module load), no output |
| Existing installs | `HOOK_MATCHER` gained Bash; the installer compares the whole entry, so an older install reports **stale** and `init` or the Cockpit updates it |

Found and fixed while testing: a redirect glued to the word before it (`x>>b.txt`) was missed.
Limits, by design: a script that writes files itself (`node gen.js`) is not read; the hook judges
what the command line names.

## Amendment A: owner-set impactMode (T019), 2026-10-17

| Check | Result |
|---|---|
| App route, real router on a local port: the owner sets it; the change is one `INSERT INTO events` carrying the mode and the previous mode; no UPDATE or DELETE | Pass |
| A company administrator may change it; a developer gets **403** and nothing is written; GET shows them the mode with `canChange: false` | Pass |
| Another company's project: **404** for GET and PUT, before any role check | Pass |
| An unknown mode: 400. Setting the current mode again records nothing | Pass |
| `capture_event` refuses `impact_mode_set`, so a kit token cannot set the mode | Pass |
| `cockpit_summary` returns `impactMode`; `impactModeOnly` answers just `{ projectId, impactMode }` | MCP typecheck clean; live probe after deploy |
| Kit: the owner value wins over a hand-edited `.wxai/project.json`; the report, the deny reason and the notify text say the local value was ignored; with no owner value the local value applies | Pass |
| Kit: refreshed at most hourly with a 1.5 s timeout; a failed call keeps the last value and is not retried for an hour; no project or token, no call | Pass |
| Hook end to end: local `notify` with owner `boundaries` is denied; owner `notify` only informs | Pass |
| App client and server build; the bundles carry the route and the Kit-tab panel; strings in all six languages | Pass |

The app writes the events with parameterized SQL, as the read side does (the table is not in the
app's Drizzle schema). The append-only scan (`change-impact-log-immutable.test.ts`) still passes.
The shadcn-ui MCP was not connected in this session; the panel uses the project's existing
`ui/Card`, as its sibling panels do.

## Amendment A release, 2026-10-17

| Channel | Shipped | Verified how |
|---|---|---|
| App + MCP (push `dbaf415a..ce4abefa`, commit `29680338`) | App 1.5.340: impact-mode route and Kit-tab panel; MCP: `impactMode` in `cockpit_summary`, `impactModeOnly` | Both App Runner deploys **SUCCEEDED**; `/api/version` reports 1.5.340. GET and PUT `/api/projects/:id/impact-mode` answer **401** without a session, while an unknown path answers 404, so the route is live. `cockpit_summary` returns `impactMode: null` (not set yet). Called with `impactModeOnly` through the kit's own `mcpCall`, it answered only `projectId` and `impactMode`, in 258 ms; `refreshOwnerImpactMode` then wrote the cache |
| Kit v1.7.80 (GitHub release) | Hook with the Bash path and owner-mode refresh, `lib/shell.mjs`, `lib/owner-mode.mjs`, installer matcher with Bash, `.wxai/impact-mode.json` ignored | Published assets byte-match the local build. In the downloaded archive: both new files, the Bash matcher, version 1.7.80, and none of the orchestrator's uncommitted SCOPE-068 work (set aside for the release and restored byte for byte). The **published** hook, run on the scratch project: `ls` no output, `sed -i` across a boundary denied, `sqlite3 … DROP TABLE` stopped. The pre-push KIT pattern does not cover `_wxAI/impact/`, so the version was bumped by hand (`587909bd`) |
| Cockpit | No change needed | It reads the mode through the summary; the hook does the caching |
