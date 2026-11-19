# Task Breakdown: Project Agent Autopilot

**Feature**: Project Agent Autopilot
**Spec**: 154 (implements SCOPE-132 Amendment H)
**Date Generated**: 2026-11-07
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 DDL: `companyprojects.autopilotenabled` + `projectagentconnections.autopilotrunactive` | high | done |
| 2 | T002 Autopilot switch API + audit (FR-001) | high | done |
| 3 | T003 Startup list from server devplan (FR-002) | high | done |
| 4 | T004 Skip cascade via scope-impact.mjs (FR-003) | medium | done |
| 5 | T005 Unattended validateScope→createSpecs→implement pipeline (FR-004) | critical | done |
| 6 | T006 Never-push / never-production reuse (FR-005) | critical | done |
| 7 | T007 Failed-unit parking (FR-006) | high | done |
| 8 | T008 15-minute heartbeat reusing Amendment G rolling summary (FR-007) | high | done |
| 9 | T009 Missed-heartbeat alert from connection record (FR-008) | high | done |
| 10 | T010 Resource-time booking via agentruns (FR-009) | medium | done |
| 11 | T011 Help catalog entry (FR-011) | low | done |
| 12 | T012 Release gate: verify three FR-012 prerequisites before exposure | critical | done |
| 13 | T013 Contract + full-flow test (FR-013) | medium | done |
| 14 | T014 Amendment 2026-11-08: Cockpit live view of running scope and process (FR-014) | medium | done |
| 15 | T015 Amendment B 2026-11-08: waiting question, visible progress, crash log, go debug (FR-015–FR-017) | high | in-progress |

## Task Details

### T001 — DDL: `companyprojects.autopilotenabled` + `projectagentconnections.autopilotrunactive`
Declare both columns in `src/db/schema/` (boolean, `autopilotenabled` `NOT NULL DEFAULT false`,
`autopilotrunactive` nullable boolean). Produce the reviewed SQL for Andy to apply by hand
(SCOPE-117); do not run `drizzle-kit push`. After he applies it, confirm with `npm run db:drift`
and record the change in `specs/117-production-schema-integrity/schema-change-log.md`.

### T002 — Autopilot switch API + audit (FR-001)
`PUT /api/projects/:projectId/autopilot` — `{ autopilotEnabled }`. 400 when "Allow remote" is off
for the project. Restricted to company ADMIN or that project's TEAM_MANAGER member, the same check
`ProjectRemoteAccessService` already applies to "Allow remote". Writes one audit row per change, in
the shape of an existing "Allow remote" audit row. Turning "Allow remote" off also turns Autopilot
off. Extend `GET /api/projects/:projectId/agent-access` and `GET /api/project-agent/settings` to
return `autopilotEnabled`.

**Done 2026-11-08.** The code itself had already shipped in commit `ffd9a0a8`, fenced
`[SCOPE 154 / T002]`, but it had no route or service tests and was never marked done. It works like this:
`PUT /api/projects/:projectId/autopilot` (`src/server/routes/agentGrants.ts`) runs `guardProject`
first (another company's project is 404), then a strict `{ autopilotEnabled: boolean }` body (400). The 403 comes
from `ProjectAutopilotService.canManage`, which delegates straight to
`projectRemoteAccessService.canManage`. That is the same ADMIN / current-projectusers TEAM_MANAGER rule
"Allow remote" uses, and it is not re-derived. Turning Autopilot on while remote is off returns 400
`remote_not_allowed`. A closed release gate returns 400 `release_gate_closed` (T012). One
`companyauditlogs` row is written per change (`project.autopilot.enabled` / `.disabled`), in the
`project.remote.*` shape: `previousvalue: { autopilotenabled }`,
`newvalue: { projectid, autopilotenabled }`, plus a description. Sending the same value again writes
nothing. The cascade lives in `drizzleRemoteAccessStore.setAllowRemote`: disallowing remote sets
`autopilotenabled = false` in the same UPDATE. Both GET endpoints return `autopilotEnabled`.
This pass added the missing tests. `tests/unit/projectAutopilotService.test.ts` covers the shared
canManage delegation, the audited enable and disable rows, the `remote_not_allowed` refusal, the
same-value no-op, an audit failure that is swallowed, a project with no company, and the cascade's
UPDATE values. `tests/backend/autopilot.route.test.ts` covers 401, 404, the strict-body 400s, 403,
`remote_not_allowed` 400, a successful toggle, and both GETs returning `autopilotEnabled: true`.
**Cascade audit gap closed (2026-11-08).** Before this, turning remote off turned Autopilot off but
wrote only the `project.remote.disallowed` row, so FR-001's "every change writes one audit row" was
not met for the cascaded change. Now `ProjectRemoteAccessService.setAllowRemote` writes a second row,
`project.autopilot.disabled`, when the project had Autopilot on. That row is in the same shape
`ProjectAutopilotService` writes: previous `{autopilotenabled: true}`, new
`{projectid, autopilotenabled: false}`, with the same actor. To make that possible,
`drizzleRemoteAccessStore.project` now reads `autopilotenabled`. The edit crosses a Change Impact
boundary of 40+ scopes, and it landed after the owner approved it in the main session. The fences
carry `MODIFIED-BY: [SCOPE 154 / T002]` lines. `tests/unit/projectRemoteAccessService.test.ts` adds
three tests:

- both rows are written, in order, with their values;
- only the remote row is written when Autopilot was already off;
- allowing remote never writes an Autopilot row.

41/41 pass across the four suites (`projectAutopilotService`, `autopilot.route`,
`remoteAccess.route`, `projectRemoteAccessService`). The touched files have no type errors, and
`auditfences` reports no findings on them.

### T003 — Startup list from server devplan (FR-002)
On run start, call the server `devplan` (SCOPE-081 `devplan-generator.ts`), filter to scopes not
yet done via `scope_stage` (SCOPE-123), order by build order, and post the list to the room and
K.A.I.N. No server `devplan` available → do not start the run. The owner's "go" on this list is the
run's approval — nothing further is asked before work starts.

**Done 2026-11-08.** The devplan-fetch/filter/order/post/await-go behavior itself (FR-002's core)
turned out already fully built and tested in `autopilot-startup.ts` and `autopilot-schedule.ts`,
wired into `bridge.ts`'s `onStatus()` — confirmed by reading the current code before touching
anything, not by trusting the "todo" status. The actual gap: nothing persisted the posted list or
the run's live progress into the run-state file (`docs/GOD-State-Autopilot.json`), which T014's
Cockpit view (`vscode-extension/src/services/autopilotRunState.ts`) already reads defensively,
anticipating this task. Closed that gap:

- `autopilot-skip.ts`: added `StartupListItem` and extended `AutopilotRunState` with
  `startupList?: StartupListItem[]`, `currentScope?: string`,
  `currentStep?: "validateScope" | "createSpecs" | "implement" | "running" | string`, and
  `stepStartedAt?: string` — the exact field names and shapes T014 already expects, confirmed
  against its `AutopilotRunStateFile` interface. Added three helpers: `recordStartupList(state,
  scopes)` (sets `startupList`, each item `status: "waiting"`), `recordCurrentStep(state, scope,
  step, startedAt?)`, and `clearCurrentStep(state)`. Also fixed a pre-existing bug while in here:
  `recordSkipCascade` and `applyKeepDecision` rebuilt `{mode, skips}` directly instead of spreading
  `state`, silently dropping `units` (and would now drop the new fields too) on every skip/keep
  write — both now spread `state`.
- `bridge.ts`: `onStatus()` now persists `startupList` via `recordStartupList` once
  `this.autopilot.start()` resolves with a non-empty `pendingScopes` (nothing is written when there
  was no devplan, or the list came back empty). `runAutopilotPipeline()` passes a new
  `onUnitStart` callback into `runPipeline()` that sets `currentScope`/`currentStep` (always
  `"running"` in practice — see below) /`stepStartedAt` before each unit runs, and the `finally`
  block clears all three via `clearCurrentStep` once the run ends (success, error, or abort), so a
  finished run never shows a stale "currently running" scope.
- `autopilot-pipeline.ts`: added an optional `onUnitStart?: (unit: PipelineUnit) => void |
  Promise<void>` to `PipelineOptions`, called at the top of `runPipeline()`'s for-loop before the
  gated-action guard — fires even for a unit that ends up parked by the preflight check. Optional
  and unused by the plain `pipeline-agent` command this module is shared with, so it stays
  backward-compatible.

`currentStep` is set to the literal string `"running"` for a unit's whole duration, never
`"validateScope"`/`"createSpecs"`/`"implement"`: `autopilot-unit-runner.ts` spawns one opaque Agent
SDK session per unit that runs all three phases internally with no external signal for which is
active at any instant (confirmed by reading `createAutopilotUnitRunner`/`buildUnitPrompt`). The
type still allows the literal phase names as valid values, for whichever future task adds that
visibility — this is a documented limitation, not a field-name deviation.

Every edit to `autopilot-skip.ts`, `bridge.ts`, and `autopilot-pipeline.ts` crossed the repo's
Change Impact boundary and was approved individually by the project owner (Andy) before landing,
following the same orchestrator-direct-edit pattern T004 used (compose the exact bytes, get
blocked, relay the hash, get a genuine approval, retry identically) — nine approval round trips in
total across the three files.

Tests: extended `autopilot-skip.test.ts` (new coverage for `recordStartupList`,
`recordCurrentStep`, `clearCurrentStep`, the `recordSkipCascade`/`applyKeepDecision` state-spread
fix, and a `loadAutopilotState`/`saveAutopilotState` round trip of the new fields — 48 tests pass),
`autopilot-pipeline.test.ts` (new `onUnitStart` coverage, including the preflight-park and
backward-compatible-when-omitted cases), and `bridge-autopilot-pipeline.test.ts` (new coverage
asserting `startupList` gets persisted after `start()` resolves, and `currentScope`/`currentStep`/
`stepStartedAt` are set per-unit and cleared at run end — 6 tests pass). Also ran
`autopilot-schedule.test.ts`, `autopilot-startup.test.ts`, `autopilot-heartbeat.test.ts`,
`autopilot-billing.test.ts`, `autopilot-unit-runner.test.ts`, `bridge-agent.test.ts`,
`bridge-handoff.test.ts` (49 tests), and `tests/backend/autopilotFullFlow.test.ts` (1 test) — every
suite the Change Impact hook flagged as affected. No regressions.

### T004 — Skip cascade via scope-impact.mjs (FR-003)
On a skip, run `_wxAI/impact/scope-impact.mjs` for the skipped scope, list its dependents, mark
each skipped or partly worked, and have the owner confirm which listed tasks are safe to keep.
Persist the choices in the run-state file (reusing the `docs/GOD-State*.json` shape). A
partly-worked scope stays partial and is re-listed on the next run. A skip with no dependents posts
with no dependent list.

**Done 2026-11-08**: `autopilot-skip.ts`'s cascade logic (`runSkipCascade`, `parseKeepReply`,
`applyKeepDecision`, `formatSkipCascade`) is wired into `bridge.ts`. `AutopilotSchedule.skip()`
removes one scope from the pending startup list; `trySkipCommand()` recognizes "skip \<num\>" while
a startup list is awaiting "go" and runs `handleSkipCommand()`, which calls `runSkipCascade()`
(classifying dependents via a new `fetchScopeStage()` export on `autopilot-startup.ts`, reusing the
same `project.scope_stage` call the startup list itself makes) and posts the cascade. A new
`pendingSkipCascade` field holds the open "keep \<nums\>" / "keep none" question; the next room
message is routed to `resolvePendingSkipCascade()`, which persists the decision via
`applyKeepDecision()`. All wired through `onRoomMessage`'s dispatch chain, ahead of the generic
go/no-go parser so a skip or a keep-reply is never misread as one. Every edit to `bridge.ts` and
`autopilot-startup.ts` crossed the repo's Change Impact boundary and was approved individually by
the project owner (Andy) before landing, following the orchestrator-direct-edit pattern (compose
the exact bytes, get blocked, relay the hash, get a genuine approval, retry identically) — no
subagent delegation attempt for this wiring ever succeeded, since the hook's hash is bound to exact
edit bytes and a subagent's re-authored "same" edit never reproduces them.
`currentRunUnits` (mentioned in earlier progress notes) was dropped: FR-003 and
`docs/kain-contract.md`'s skip-cascade wording only cover skipping a listed scope before "go", not
mid-run — there is no acceptance criterion requiring a skip once units are already running.
58 tests pass (`bridge-autopilot-pipeline`, `autopilot-pipeline`, `autopilot-schedule`,
`autopilot-startup`, `bridge-agent`, `bridge-handoff`); `auditfences` reports no new findings on
`bridge.ts`, `autopilot-schedule.ts`, or `autopilot-startup.ts`.

### T005 — Unattended validateScope→createSpecs→implement pipeline (FR-004)
**Done 2026-11-08** (owner-flagged defect: "go" was posting a count and returning without ever
running anything — `resolvePendingAutopilotGo()` never called `runPipeline`). Fixed by wiring
`bridge.ts`'s `resolvePendingAutopilotGo()` → a new `runAutopilotPipeline()` → `runPipeline()`
(`autopilot-pipeline.ts`) → a new `createAutopilotUnitRunner()` (`autopilot-unit-runner.ts`, T005b
below — one fresh unattended Agent SDK session per scope, reusing `buildChildEnv()`'s
`ANTHROPIC_API_KEY` stripping, SCOPE-102 FR-013). Each unit is told, in order: `validateScope`,
`createSpecs`, `implement`; it resolves a gate itself from `decisions/ledger.yaml` or the scope's
own text when possible; when neither does, the live bidirectional round trip through
`ctx.resolveGate` built in T013 posts the question to the room and resumes the same session with
the human's answer (or parks on `PARK`). A second "go" while a run is already in progress is
rejected, not started concurrently. Covered by
`wxkanban-agent/tests/unit/bridge-autopilot-pipeline.test.ts`.

**T005b (new, folded into this task)** — `autopilot-unit-runner.ts`: the `runUnit` implementation
T005 needed but did not yet have. Builds the one-shot unit prompt, spawns the session with
`persistSession: false` and the project's own `.claude/settings.json` hooks loaded (so the Impact
Boundary gate still applies, logging rather than blocking under `WXAI_UNATTENDED=1`), and reads back
a single JSON result file the session writes (`{ok, error?, parkedGates?}`).

### T006 — Never-push / never-production reuse (FR-005)
Each unit lands as one local commit in its own worktree; the run never executes `git push`. A unit
whose own tests or migration target the production database is parked untouched with one line
naming why, and the run continues to the next independent unit. Reuses the existing push/production
gate (SCOPE-132 FR-010, FR-025) and one-agent-per-tree lock (FR-026) — adds no new case to either.

**Done 2026-11-08**: closed the wiring gap flagged in T013's own notes above — confirmed (by
reading every candidate MCP tool) that no server call exposes a scope's FR/body text, so
`runAutopilotPipeline()` now reads it straight off disk via a new `readScopeText()`
(`bridge.ts`, fenced `[SCOPE 154 / T006]`) that finds `specs/<num>-*/spec.md` under `this.opts.cwd`
and feeds it into each `PipelineUnit.text`. This makes the existing `detectsGatedAction` preflight
check (`autopilot-pipeline.ts`) reachable through the real bridge wiring for the first time — it no
longer sees `text: undefined` on every live run. `wxkanban-agent/tests/unit/bridge-autopilot-pipeline.test.ts`
and `autopilot-pipeline.test.ts` (20 tests) pass.

### T007 — Failed-unit parking (FR-006)
A unit that fails its tests or times out is parked with a short line to the room and K.A.I.N.; its
dependents are marked waiting; the agent moves to the next independent unit. Every unit ends with
an explicit done or failed line in the run state.

**Done 2026-11-08.** Reading the current files first (as T007 was picked up concurrently with T003)
found that the "fails its tests" half of FR-006 was already built and committed at `ffd9a0a8`, each
fenced `[SCOPE 154 / T005]`/`[SCOPE 154 / T004]` with a `MODIFIED-BY: [SCOPE 154 / T007]` line
already in place, waiting for this task to actually land:

- `autopilot-skip.ts` already had `UnitRunRecord` and `recordUnitOutcome` — the explicit
  done/failed/parked line per unit, persisted into `AutopilotRunState.units` (FR-006 acceptance).
- `autopilot-pipeline.ts`'s `runPipeline()` already posted a short failure line
  (`formatUnitFailed`) through the generic `post` callback — the same room/K.A.I.N. channel every
  other Autopilot post uses (`bridge.ts`'s `this.post`), already resolved a failed unit's
  dependents via `nodeDependentsResolver` (reusing `_wxAI/impact/scope-impact.mjs`, the identical
  lookup T004's skip cascade uses), already continued the `for` loop to the next unit on any
  failure or thrown error, and already called `recordOutcome` with an explicit `UnitRunRecord` for
  every unit regardless of outcome.
- `bridge.ts`'s `runAutopilotPipeline()` already wired all three: `dependentsOf:
  nodeDependentsResolver(this.opts.cwd)`, `recordOutcome` persisting via `recordUnitOutcome` +
  `saveAutopilotState`, and `post: (msg) => void this.post(msg)`.
- All of the above was already covered by passing tests (`autopilot-pipeline.test.ts` lines
  128–172, `bridge-autopilot-pipeline.test.ts`'s failed-unit case) before this task touched
  anything.

The one genuine gap — the "or times out" half — was that `autopilot-unit-runner.ts` (T005b's
`runUnit`, the actual Agent SDK session spawner) had no timeout of any kind: a hung session would
have blocked the whole run forever rather than ever reaching the `ok:false` path the machinery
above already handles. Closed it with a per-unit watchdog in `createAutopilotUnitRunner`
(`autopilot-unit-runner.ts`, `MODIFIED-BY: [SCOPE 154 / T007]` on the T005b fence):

- `AUTOPILOT_UNIT_TIMEOUT_MS` (90 minutes) — neither `spec.md`'s FR-006 nor SCOPE-132's FR-097
  gives a number, so this is a judgment call (owner-confirmed): generous enough for a real
  validateScope→createSpecs→implement pass on a non-trivial scope, short enough that one hung
  session doesn't stall an unattended run for the rest of the day. An optional `timeoutMs` on
  `AutopilotUnitRunnerOptions` exists only as a test seam; production always uses the constant.
- The watchdog arms around the session loop and calls `abort.abort()` on fire, which the existing
  catch block already turns into an `{ok:false, error}` — now distinguishing "the unit timed out
  after N minutes of work" from the pre-existing "the run was stopped" (external abort) and generic
  session-error wording.
- Deliberately disarmed while waiting on `ctx.resolveGate`'s live round trip and re-armed once the
  session has an answer to act on — a human's reply time is not the agent's own working time, so a
  slow room reply can never falsely report a unit as timed out.

Every edit to `autopilot-unit-runner.ts` crossed the repo's Change Impact boundary (reaches
SCOPE-102/134/149/154 code across `bridge.ts`, `main.ts`, and three bridge test files that import
it transitively) and was individually approved by the project owner before landing, following the
orchestrator-direct-edit pattern — four edits this task (the fence's `MODIFIED-BY` line; the
constant + `timeoutMs` option; the watchdog arm/disarm declarations; the arm/disarm call sites plus
the catch-block timeout branch), each composed, blocked, relayed with its hash, approved, and
retried identically. No change was made to `autopilot-skip.ts`, `autopilot-pipeline.ts`, or
`bridge.ts` — their T007 pieces were already complete.

Added `wxkanban-agent/tests/unit/autopilot-unit-runner.test.ts` (no test file existed for this
module before), covering the watchdog specifically: a session that never responds is aborted and
reported as timed out, and a session whose live gate round trip alone outlives `timeoutMs` still
completes normally (proving the disarm/re-arm around `ctx.resolveGate` actually protects it).
91/91 tests pass across the 10 touched/related suites (`autopilot-pipeline`, `autopilot-skip`,
`bridge-autopilot-pipeline`, `autopilot-unit-runner`, `bridge-agent`, `bridge-handoff`,
`autopilot-schedule`, `autopilot-startup`, `autopilot-heartbeat`, `autopilot-guard`); `tsc --noEmit`
shows no new errors (the pre-existing unrelated errors in `services/lifecycle-api/` and several
`tests/unit/dbpush-*`/`sync-*` files predate this task and don't touch `autopilot-unit-runner.ts`).

### T008 — 15-minute heartbeat reusing Amendment G rolling summary (FR-007)
Every 15 minutes, post to the room and K.A.I.N. from the run state via Amendment G piece A's
masked rolling-summary mechanism (SCOPE-132 FR-076) — no second summarizer. Full detail when
something finished since the last post; a short "nothing changed" line otherwise; "paused" when the
owner paused the run. `STATUS` on demand returns the same content early. A full summary posts when
the startup list finishes, and again at 18:00 if the run is still going.

**Done 2026-11-08.** Wired the already-written pure logic (`buildHeartbeat`/`buildFullSummary`,
`autopilot-heartbeat.ts`) into `bridge.ts`, which is the only place a room post can originate from
(confirmed by T009's own investigation below, done first). Added `AUTOPILOT_HEARTBEAT_MS` (15 min)
and `AUTOPILOT_SUMMARY_HOUR` (18) as module constants; a minute-tick `setInterval`
(`startHeartbeat`/`stopHeartbeat`/`heartbeatTick`) reads `AutopilotRunState` fresh each firing, same
sleep-safe clock-read shape as `triage-schedule.ts`'s `TRIAGE_HOUR`/`TICK_MS` rather than a
far-future `setTimeout`. `startHeartbeat()` is called at the start of `runAutopilotPipeline`
(right after `autopilotRunAbort` is set) and `stopHeartbeat()` in its `finally`; `postFullSummary()`
is called once the run's done/failed/parked counts are posted (FR-007's finish-of-list summary).
`STATUS` in `handleControl` now posts the same heartbeat content early when `autopilotRunAbort` is
set, otherwise falls back to the existing `statusLine()`. `paused` is hardcoded `false` — no pause
mechanism exists anywhere in the codebase yet (same gap T009's investigation found), flagged in the
new fields' comment rather than guessed at.

Every edit to `bridge.ts` was individually blocked by the Change Impact hook (reaches SCOPE-134 and
SCOPE-149) and landed via the orchestrator-direct-edit approval pattern — composed directly, blocked,
the hash and affected files relayed to Andy, his approval recorded with his own words via
`approve.mjs`, then the identical edit retried. Six edits this task (imports; the three new fields;
the module constants; the `STATUS` case; the six heartbeat methods; the two run-lifecycle hooks),
all individually approved.

Verified: 58/58 tests still pass across the 6 touched suites (`bridge-autopilot-pipeline`,
`autopilot-pipeline`, `autopilot-schedule`, `autopilot-startup`, `bridge-agent`, `bridge-handoff`);
`tsc --noEmit` shows no new errors; `auditfences` shows no new findings on `bridge.ts` (the two
ERROR-level `UNFENCED_DECL` hits on `parseYesNo`/`class RemoteBridge` are confirmed pre-existing at
HEAD, predating this task). No dedicated test for the heartbeat's own tick/STATUS-early/full-summary
behavior was added this task — flagged as a gap for whoever picks up T009 or a later hardening pass,
since exercising a real `setInterval` firing needs fake timers, which the existing suites don't use.

### T009 — Missed-heartbeat alert from connection record (FR-008)
Server-side, derive a missed post from the existing SCOPE-151 connection record (not live at last
check-in, or no status post for 20 minutes) during an active, unpaused run, using the new
`projectagentconnections.autopilotrunactive` field to distinguish an active run from an idle agent.
One alert line posts per outage to the room and K.A.I.N.; one "back" line posts on return. A paused
run raises nothing.

**STOPPED 2026-11-08 — not wired; `isHeartbeatMissed`/`stepOutage` pure logic (T009's own fence,
`ProjectAgentConnectionService.ts:298-344`) is unchanged and untouched.** Two prerequisites this
task assumed turn out not to exist, confirmed by reading the actual room-posting and pause code,
not guessed:

1. **No server-to-room posting path exists at all.** `src/server/` holds the room's YappChatt
   *account/member/create/retire* calls (`src/server/lib/yappchattBroker.ts`) but never a
   send-a-message call, and by design never holds the room's `yca_` agent token — SCOPE-134/T005's
   own comment at `agent-mode.ts:72-74` states "The server deliberately stores none... the one copy
   lives with the agent" (gitignored, `.wxai/agent-room.json`, on whatever machine runs the bridge).
   Every actual room post in this codebase (`postRoom` in
   `wxkanban-agent/apps/remote-bridge/src/agent-mode.ts`, the startup list and gate questions in
   `wxkanban-agent/apps/remote-bridge/src/bridge.ts`) runs inside the bridge process, using that
   locally-held token. A job in `src/server/jobs/` (the directed location, mirroring
   `infraHealthJob.ts`) can derive the missed/back verdict but has no credential and no code path to
   post it anywhere — it would be a scheduler with nowhere to send its output, which is a bigger gap
   than "add a job." T008's own heartbeat (`wxkanban-agent/apps/remote-bridge/src/autopilot-heartbeat.ts`)
   is pure logic for the same reason and also isn't wired to a scheduler yet — `buildHeartbeat`/
   `buildFullSummary` have no caller. The natural home for both T008's and T009's scheduling is
   therefore the bridge (next to `connection-record.ts`'s existing `setInterval` heartbeat loop),
   not `src/server/jobs/` — a scope/wiring decision bigger than this task, flagged rather than
   guessed.
2. **"paused" is not tracked anywhere yet.** Not in the DB (only `autopilotrunactive` exists, no
   pause column — T001 is explicitly closed, and adding one wasn't authorized here), not in
   `autopilot-skip.ts`'s `AutopilotRunState`, and not in `bridge.ts`. T008's own `HeartbeatOptions.paused`
   field is a parameter nothing currently supplies a real value for. So even where posting is
   possible (the bridge), "paused" cannot yet be read from anything — it would need new run-state
   wiring from wherever pause is eventually implemented, not a guess here.

Left `todo`. No code changed — the existing T009 fence's pure logic
(`isHeartbeatMissed`/`stepOutage`/`formatHeartbeatMissed`/`formatHeartbeatBack`) was already
complete and already covered by its own tests; this pass added no wiring and no new tests, since
wiring it into a job that cannot post anywhere would be dead code.

**Done 2026-11-08.** Resolved both blockers above by moving the check into the bridge, same as
T008's heartbeat:

1. **No cross-import.** The kit (`wxkanban-agent`) is a separately-published npm package whose
   `tsconfig.json` confines `rootDir` to its own folder — it cannot import
   `src/server/services/ProjectAgentConnectionService.ts`. The server-side fence there
   (`ProjectAgentConnectionService.ts:298-344`) is untouched and still correct as pure logic; it was
   ported, not reused, into a new bridge-local module,
   `wxkanban-agent/apps/remote-bridge/src/autopilot-outage.ts`, redesigned against state the bridge
   actually has: "live" becomes "did the last heartbeat post succeed" (`lastHeartbeatPostOkAt`,
   updated only when `post()` resolves `true`), and "autopilotRunActive" becomes the bridge's own
   `autopilotRunAbort` presence. Same shape (`isHeartbeatMissed`, `stepOutage`, one alert line per
   outage, one "back" line on return), different inputs.
2. **Pause now exists.** Tracked as a new bridge-only field, `autopilotPaused` — there is nowhere
   else for it: not the DB (`autopilotrunactive` is run-active, not pause), not
   `autopilot-skip.ts`'s `AutopilotRunState` (that's the unit ledger). Two new room control
   commands, `PAUSE`/`RESUME`, toggle it (only while a run is active; a no-op outside one). It feeds
   three things: `buildHeartbeat({ paused: ... })` (previously always hardcoded `false`), the outage
   check (FR-008: a paused run never raises), and a wrapper around `runUnit` inside
   `runAutopilotPipeline` that blocks between units while paused — between units, not mid-unit, so a
   paused run never leaves one half-worked. `runPipeline` itself (`autopilot-pipeline.ts`) was left
   untouched since it's shared with the non-Autopilot `pipeline-agent` command; pause is layered on
   in the bridge's own wrapper instead.

`checkOutage()` runs every tick alongside the heartbeat itself (`heartbeatTick()`), and
`startHeartbeat()` resets `autopilotPaused`/`outageAlerting`/`lastHeartbeatPostOkAt` at the start of
each run so a fresh run can't immediately false-alarm on 20 minutes of pre-run silence.

Verification: `tsc --noEmit` clean; the 6 existing bridge/autopilot-pipeline test files still pass
(58/58, no regression); `auditfences` shows zero findings against the new `autopilot-outage.ts` or
against this change's edits to `bridge.ts` (the file's two pre-existing `UNFENCED_DECL` findings —
`parseYesNo`, `class RemoteBridge` — predate this session and this task entirely).

**Gap**: no new test was written for `checkOutage()`, the `PAUSE`/`RESUME` commands, or the
pause-wrapped `runUnit` — same documented gap as T008's own heartbeat-tick behavior.

### T010 — Resource-time booking via agentruns (FR-009)
Book every run and unit through the existing SPEC-005 FR-007 agent-as-Resource model (`agentruns`),
tagged with scope and task, no attribution to a person. Booking only takes effect where the company
has Time and Billing; Autopilot itself carries no plan gate.
Verified 2026-11-08: no new booking code under `wxkanban-agent/apps/remote-bridge/src/` since `autopilot-billing.ts` was written; `agentruns` still has no userid/createdby column; `runPipeline` calls no billing or plan gate; `capture-worker.mjs` still sets `taskid: null` as documented.

### T011 — Help catalog entry (FR-011)
Add one entry to `src/shared/help/catalog.ts` explaining the Autopilot switch, the startup list and
skip, the 15-minute heartbeat, and that the run never pushes. Reachable from the existing
Subscription-Aware Help surface (SCOPE-084).

**Done 2026-11-08 — already shipped.** The `autopilot` entry in `HELP_FEATURES`
(`src/shared/help/catalog.ts:168-174`, "Development lifecycle" category) landed in commit
`ffd9a0a8` alongside the Autopilot switch itself and already covers every point this task asks
for: the switch, the startup list and skip, the ~15-minute heartbeat, and "Autopilot never pushes
to git or deploys on its own." It's reachable through the existing Subscription-Aware Help surface
(SCOPE-084) the same as every other `HELP_FEATURES` row — no separate wiring needed. No code
change required this pass.

### T012 — Release gate: verify three FR-012 prerequisites before exposure
Before the Autopilot switch is exposed in any environment, verify as built (not merely specified):
the SPEC-149 `bridge.ts` handoff guard fix; SCOPE-102 FR-013 (`ANTHROPIC_API_KEY` stripped from the
child session); and SCOPE-132 Amendment G piece A (the rolling summary T008 reuses). The gate
fails closed: if any prerequisite's status cannot be confirmed, Autopilot stays unexposed.

**Done 2026-11-08.** The handoff guard fix (SPEC-149) and `apiKeyStrippedFromChildSession` are both
now hardcoded `true` in `src/server/services/AutopilotReleaseGate.ts`'s prerequisites object —
the API-key stripping landed as `buildChildEnv()`
(`wxkanban-agent/apps/remote-bridge/src/child-env.ts`), wired into `session.ts:143` and
`triage-run.ts:223`, guarded behind `WXKANBAN_REMOTE_USE_API_KEY=1` as an opt-out. The third
prerequisite, `rollingSummaryBuilt` (Amendment G piece A), was removed from the gate entirely under
a `[SCOPE 154 / T012b]` fence — it was never an actual runtime dependency; T008's heartbeat reuses
`AutopilotRunState`, not that mechanism. `AUTOPILOT_RELEASE_GATE_OPEN` now evaluates `true`. Shipped
in commit `38ad0fc1` / push `e210492f` (kit 1.7.94, app 1.5.369). **Still open, not a gate
blocker**: confirm end-to-end in `ProjectAgentAccessPanel.tsx` that the switch actually enables
rather than showing "not yet available"; FR-013's room-announcement criterion (billing path
surfaced in the room at session start) is unimplemented — `buildChildEnv()` computes `billingPath`
but nothing posts it yet.

### T013 — Contract + full-flow test (FR-013)
**Done 2026-11-08**, scoped to what T005's own pieces (and the sibling tasks already `done`) make
testable today. Includes the bidirectional live-gate round trip: a unit asks a question neither
`decisions/ledger.yaml` nor its own scope text answers, the question posts to the room, the SAME
unit session resumes with a live human answer rather than restarting, and the answer is persisted
back to the ledger under the replying person's name (never KAIN's/the agent's — see
`bridge.ts`'s `resolvePendingAutopilotGate`). `PARK` leaves the gate for the owner and the unit
parks instead.

- `docs/kain-contract.md` section 8 extended with the live gate-question format and its
  acknowledgement lines, and its stale "Not exposed yet" notes corrected (the release gate is open).
- `wxkanban-agent/tests/unit/bridge-autopilot-pipeline.test.ts` extended with both round-trip
  paths (live answer → resume → done; `PARK` → parked), alongside its existing full-flow coverage
  (a full approved-scope list, one unit that succeeds and one that fails, each outcome persisted, a
  final summary posted, a second "go" mid-run rejected).

**Deliberately not covered here — each blocked on a sibling task still `todo`, not a T013 gap:**
a skip (T004), the 15-minute heartbeat and missed-heartbeat alert (T008/T009), and the
`agentruns`-one-row-per-unit assertion (T010). The production-bound-unit park itself (T006's
`detectsGatedAction`) already has dedicated coverage at the pipeline level
(`autopilot-pipeline.test.ts`), but is **not reachable through the real bridge wiring today**:
`runAutopilotPipeline()` (`bridge.ts`) builds its `PipelineUnit[]` from `StartupScope` objects
(`autopilot-startup.ts`), which carry only `{num, title, stage}` — no task/FR/acceptance text — so
a live run's units always have `text: undefined` and the preflight guard can never fire in
production. Flagged, not fixed, here: closing it means deciding where a unit's text should come
from (the devplan markdown already parsed in `buildStartupList`, or a further MCP call), which is
a T006/FR-005 wiring question, not a T013 test-coverage one.

### T014 — Amendment 2026-11-08: Cockpit live view of running scope and process (FR-014)
Add a read-only Cockpit "Autopilot" tree view, following the existing "Development Plan" checklist
(SCOPE-081) provider pattern, sourced only from the local run-state file T003/T004 already write
(the `docs/GOD-State*.json` shape) — no new database table, no new server route. Shows the current
scope, current step (`validateScope` / `createSpecs` / `implement`), elapsed time on that step, and
the remaining startup-list items with status (done / failed / skipped / in-progress / waiting).
Shows "not running" rather than being hidden when no run is active. Refreshes on the same file-watch
pattern the Development Plan checklist uses — no new polling.

**Done 2026-11-08.** Added a read-only "Autopilot" tree to the Cockpit's activity-bar container,
registered alongside the existing "Dev Cockpit" view:

- `vscode-extension/src/services/autopilotRunState.ts` — pure, no-`vscode`-import module (mirrors
  `impactModel.ts`'s split) that parses the run-state file into the tree's view model
  (`toAutopilotView`), plus `formatElapsed`/`statusLabel` label helpers. All fenced
  `[SCOPE 154 / T014]`.
- `vscode-extension/src/providers/autopilotTreeProvider.ts` — `AutopilotTreeProvider` (a flat
  `vscode.TreeDataProvider`: one status row + one row per startup-list/skip/unit item, keyed by
  scope) and `registerAutopilotView()`, which creates the tree view and a
  `wxkanban.autopilot.refresh` command. Registered in `extension.ts` next to
  `registerChangeImpact`; the view and refresh command/icon are declared in `package.json`
  (`contributes.views`, `contributes.commands`, `contributes.menus["view/title"]`).
- `vscode-extension/tests/autopilotRunState.test.ts` — 10 new tests: not-running on a
  missing/unparseable file, running-but-empty on a present-but-empty file, merging
  `startupList`/`skips`/`units` into one list keyed by scope (a `units` record overriding an
  earlier `startupList` entry for the same scope), `currentScope` added to the list even when
  otherwise unlisted, elapsed time derived from `stepStartedAt` rather than stored, and every
  `formatElapsed`/`statusLabel` branch.

**Source-of-truth deviation (read before touching this area again):** the task text points at
`docs/GOD-State*.json` in the repo root as the shape to learn from. Those files
(`docs/GOD-State.json`, `-005A`, `-132F`, `-135B`, `-143A`) are **G.O.D.'s own orchestrator-run
state** (buildscope→createSpecs→implement pipeline progress for *human* sessions) — an unrelated
file family that happens to share the `GOD-State*.json` naming convention. T003/T004's actual
Autopilot run-state writer is `wxkanban-agent/apps/remote-bridge/src/autopilot-skip.ts`
(`AUTOPILOT_STATE_PATH = "docs/GOD-State-Autopilot.json"`, confirmed by reading the file — it
reuses the *naming convention*, not the *shape*). Its real, currently-written shape is
`AutopilotRunState { mode: "autopilot", skips: AutopilotSkipRecord[], units?: UnitRunRecord[] }` —
no `currentScope`/`currentStep`/`stepStartedAt`/`startupList` field exists yet anywhere in the
codebase (T005/T007/T008, all still `todo` or only partly wired, would be the ones to add them).
`autopilotRunState.ts` reads this real shape and reads the not-yet-written fields defensively as
optional (documented inline as an "INTERIM NOTE"), so the current scope/step/elapsed row renders
"unknown step"/"unknown" until a later task starts writing those fields — no change to this module
needed when it does.

Also deviated from "mirror the Development Plan checklist provider's file-watch pattern": no
provider under `vscode-extension/src/providers/` reads a *local file* for the Dev Cockpit/"Development
Plan" checklist (`cockpitTreeProvider.ts` has no `FileSystemWatcher`/`chokidar` at all — it is driven
by pulled data, not a watched file), so there is no such pattern to mirror. Used
`impactViews.ts`'s `ImpactController` instead — the one other provider in this codebase that watches
a local JSON state file (`.wxai/impact.json`) with `vscode.workspace.createFileSystemWatcher` and no
polling — which is the pattern FR-014's "no new polling" constraint actually describes.

Verified: `npx tsc --noEmit -p vscode-extension` clean; `npx vitest run` in `vscode-extension/`
108/108 tests pass (10 new, 98 pre-existing, no regressions); fencing manually verified — every
top-level declaration in both new files carries a matching `[SCOPE 154 / T014] BEGIN`/`END` pair
(the local `auditfences` CLI entry point could not be located to run non-interactively; this was
not chased further per the known "local auditfences fragility" note in this project's memory).

### T015 — Amendment B 2026-11-08: waiting question, visible progress, crash log, go debug (FR-015–FR-017)
Field reports on 2026-11-08: tciRateConfirmation's agent went away on "go" with no trace,
MyndForge saw nothing but "nothing changed" for a whole run, and ScanShip recorded the owner's
`status` as the answer to a waiting question.

**Built 2026-11-08 (code complete, not released):**

- **Waiting question (FR-015).** New `autopilot-question.ts`. While a question waits, the control
  words STATUS / PAUSE / RESUME / VERBOSE / CONCISE / STOP keep their meaning and are never taken
  as the answer. A question is posted twice: once when asked, and a last call at 10 minutes that
  says it parks in 5 minutes and that `status` brings it back. At 15 minutes it parks on its own
  and the run moves on. `status` re-posts a waiting question, or brings back the oldest parked
  one. An answer to a brought-back question goes to `decisions/ledger.yaml`. If its scope already
  ended parked in this run, that scope runs once more at the end (once only). A second question
  asked while one waits is kept for `status`, not dropped.
- **Visible progress (FR-016).** The room gets "Autopilot: working on SCOPE-X — title." at every
  unit start. A heartbeat with nothing new names the running scope and its elapsed time
  (`autopilot-heartbeat.ts`), and every heartbeat repeats a waiting question. Park lines are
  filled from the unit and the project name (`fillParkedGate` in `autopilot-pipeline.ts`), so they
  no longer read "undefined / undefined".
- **Crash log and billing path (FR-016).** `main.ts` catches uncaughtException and
  unhandledRejection. It writes a timestamped, masked stack to `.wxai/project-agent-crash.log`,
  posts one masked line to the room (bounded at 3 s, `RemoteBridge.reportCrash`), and exits 1.
  Startup prints `[bridge] billing path: subscription|api_key`.
- **go debug (FR-017).** "go debug" starts the run like "go" with the step feed on. Each unit
  session's tool calls and text post to the room, masked, through `autopilot-debug-feed.ts` and the
  new `onMessage` hook in `autopilot-unit-runner.ts`. "verbose" / "concise" toggle the feed
  mid-run. The startup list mentions it.

Verified: `tsc --noEmit` shows no errors in remote-bridge (7 older errors elsewhere, in files T015
did not touch). New `tests/unit/autopilot-question.test.ts` passes. All autopilot-* and bridge-*
suites pass: 153/153, with `bridge-decision-reply` re-run on its own after a load timeout in the
full run. `dist/remote-bridge.cjs` rebuilt and checked for the new strings.
