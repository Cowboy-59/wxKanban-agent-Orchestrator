# Spec 154: Project Agent Autopilot — Working the Dev Plan Unattended

**Implements**: SCOPE-132 Amendment H (`specs/Project-Scope/132-kain-autonomous-driver.md`,
FR-092 – FR-104). Fences for this spec are `[SCOPE 154 / Tnnn]`.
**Depends on**: SCOPE-136 (the dev-plan drive, one-session-per-unit pattern), SCOPE-081 (server
`devplan`), SCOPE-123 (`scope_stage`), SPEC-005 Amendment E (Resource time billing), SCOPE-151
(project-agent connection record), SCOPE-148 (existing self-started agent job precedent), SCOPE-132
Amendment G piece A (masked rolling summary, reused by the heartbeat) — **prerequisite, not yet
verified complete**, SPEC-149 (`bridge.ts` handoff guard fix) — **prerequisite, status to confirm**,
SCOPE-102 FR-013 (`ANTHROPIC_API_KEY` stripped from the child session) — **prerequisite, specified,
not built as of 2026-11-07**, SPEC-143 (routing tiers) and SCOPE-093 (token-saving advisor).
**Source**: `docs/brainstorms/2026-11-07-project-agent-autopilot-devplan.md` (decisions 1 – 16).
**Created**: 2026-11-07

## Overview

Six apps are due in four months, and today nothing moves unless the owner starts each scope by
hand. This spec gives the Project Agent a per-project "Autopilot" switch: when on, the agent reads
the server `devplan`, posts the outstanding scopes in build order, takes the owner's skips, then
drives each remaining scope through `validateScope` → `createSpecs` → `implement` without a human
starting each step, reporting every 15 minutes to the room and to K.A.I.N. It invents no second
production-write gate, billing mechanism, or status channel — it reuses the ones SCOPE-102,
SPEC-005 and SCOPE-132 Amendment G already built.

## Business Problem

The owner is the only person who starts a scope moving: he runs `/buildscope`, `/validateScope`,
`/createSpecs` and `/implement` by hand for every unit, on every one of several apps at once. With
six apps to deliver in four months, this does not scale — work waits on the owner's attention even
when a scope is fully specified and has nothing left to decide. The fix is not a smarter agent; it
is letting the existing pipeline run itself once the owner has approved the plan, while keeping
every existing safety gate (push, production, approval, billing) exactly where it is.

## Actors

- Primary: The Project Agent (the Remote Session Bridge, running headless in `--project-agent`
  mode) for a project with Autopilot on.
- Secondary: Andy / the project owner (turns Autopilot on, approves the startup list, answers skips
  and any parked gate); K.A.I.N. (receives the same startup list, heartbeats and parked-unit lines,
  and may answer a gate under the existing Amendment G rules); the hosted wxKanban server (enforces
  the Allow-remote/Autopilot gate, the existing push/production gate, and Resource-time billing).

## Success Metrics

- **SC-37** — 100% of Autopilot runs post the startup list before any unit starts; 0 units start
  with no server `devplan` available.
- **SC-38** — 0 pushes and 0 writes against the production database from an Autopilot run, checked
  by a test that seeds a production-pointed unit and confirms it parks instead of running.
- **SC-39** — 100% of 15-minute windows during an active run produce a post (full or heartbeat); 0
  silent windows over a 2-hour seeded run.
- **SC-40** — 100% of missed-heartbeat conditions (stale connection record or no post for 20
  minutes) raise exactly one alert line and one "back" line on return; 0 alerts during a paused run.
- **SC-41** — 100% of completed units write one `agentruns` row tagged with scope and task; 0 rows
  attributed to a person.

## Scope Boundary

- The `companyprojects.autopilotenabled` switch: off by default, gated on "Allow remote", settable
  only by ADMIN or that project's TEAM_MANAGER, audited the same way as an "Allow remote" change.
- The startup list: read from the server `devplan` (SCOPE-081), filtered by `scope_stage`
  (SCOPE-123) to scopes not yet done, posted in build order to the room and K.A.I.N.
- The skip cascade: a skipped scope's dependents listed from `_wxAI/impact/scope-impact.mjs`, each
  marked skipped or partly worked, with the owner confirming which listed tasks are safe to keep.
- The unattended pipeline: `validateScope` → `createSpecs` → `implement`, one scope at a time, in a
  fresh session per unit, one worktree per scope, one local commit per unit, no push.
- The never-push / never-production reuse: a unit whose own tests or migration target production is
  parked untouched with one line naming why; the run goes on to the next independent unit.
- Failed-unit handling: a unit that fails its tests or times out is parked with a short line, its
  dependents marked waiting, and the run continues.
- The 15-minute heartbeat (reusing Amendment G piece A's masked rolling summary), the missed-
  heartbeat alert (derived from the SCOPE-151 connection record plus one new
  `projectagentconnections.autopilotrunactive` field), and the `STATUS`-on-demand response.
- Resource-time booking for every run and unit through the existing `agentruns` mechanism
  (SPEC-005 FR-007), tagged with scope and task, no attribution to a person.
- One help catalog entry explaining the switch, the startup list and skip, the heartbeat, and that
  the run never pushes.
- The release gate: Autopilot is specified here but stays unexposed until the three FR-012
  prerequisites below are verified complete, not merely specified.

## Out of Scope

- Other machines, a cross-project coordinator, and watching the developer's own session — v1 is
  one project agent working its own project's dev plan.
- Any cost or model rule of Autopilot's own. It defers entirely to rescue-tokens, the SPEC-143
  routing tiers and the SCOPE-093 advisor, and runs a fresh session per unit — it invents no second
  control.
- The Time & Billing plan-gate conflict between `timeBilling.ts`, the help catalog and
  `types/index.ts` — a separate fix, not this spec.
- Drafting or approving a scope. Autopilot only drives scopes already approved through
  `validateScope`; an unbuilt or un-approved scope stays with the owner.

## Open Questions

None blocking. Decided by Andy in the 2026-11-07 wxBrainstorm (decisions 1 – 16) and confirmed by
the clean `/validateScope` pass on SCOPE-132 Amendment H (score 100, no blocking issues). Three
items carry into implementation as release-gate checks, not open design questions:

- Confirm the current status of the SPEC-149 `bridge.ts` handoff guard fix (brainstorm notes were
  3 days old at decision time).
- Confirm the current status of SCOPE-132 Amendment G piece A (the rolling summary this spec's
  heartbeat reuses).
- Confirm SCOPE-102 FR-013 (`ANTHROPIC_API_KEY` stripped from the child session) is built, not just
  specified — last checked unbuilt at `remote-bridge/src/session.ts:143` and `triage-run.ts:223`.

## User Scenarios & Testing

### US1 — The startup list and a skip (S-38)
Given a project with Autopilot on, when the agent starts a run, then it reads the server `devplan`,
posts the outstanding scopes in build order, and waits. When the owner skips one, the agent lists
its dependents from the existing scope-impact check and marks each skipped or partly worked before
moving on; a skip with no dependents needs no list.
- Edge: no server `devplan` available — the run does not start.

### US2 — A pipeline run with no one watching (S-39)
Given the owner's go on the startup list, when the agent works a scope, then it runs
`validateScope`, `createSpecs` and `implement` in a fresh session per unit, in its own worktree,
with a local commit per unit and no push, answering only from the scope text and the decision
ledger.
- Edge: a gate with no approved design to answer it from is parked as one line (project, scope,
  question, what it blocks) — never guessed.

### US3 — A unit fails (S-40)
Given a unit's tests fail or it times out, when the agent evaluates it, then it parks the unit with
a short line to the room and K.A.I.N., marks its dependents waiting, and goes on to the next
independent unit rather than stopping the run.

### US4 — The 15-minute heartbeat (S-41)
Given a run in progress, every 15 minutes the agent posts to the room and K.A.I.N. from the run
state: full detail when something finished, a short "nothing changed" line otherwise, and "paused"
when the owner paused it.
- Edge: `STATUS` on demand returns the same content early.
- Edge: a full summary posts when the startup list finishes, and again at 18:00 if the run is still
  going.

### US5 — A unit would touch production (S-42)
Given a unit's own tests or migration point at the production database or call for a push, when
the agent reaches it, then it parks the unit untouched with one line naming why, and goes on.

### US6 — A missed heartbeat (S-43)
Given an active, unpaused run whose connection record goes stale (no live check-in) or posts
nothing for 20 minutes, then the server raises one alert line to the room and K.A.I.N. naming the
outage, and posts one "back" line when the agent returns.
- Edge: a paused run raises nothing.

## Functional Requirements

### FR-001 — The Autopilot switch (SCOPE-132 FR-092)
`companyprojects.autopilotenabled` (one column, applied by hand alongside `allowremote`), off by
default, settable only where "Allow remote" is already on and only by the same roles that can
change "Allow remote" (ADMIN or TEAM_MANAGER member).

**Acceptance Criteria**:
- [ ] Turning "Allow remote" off also turns Autopilot off.
- [ ] Turning Autopilot on while "Allow remote" is off returns 400.
- [ ] Every change writes one audit row, the same shape as an "Allow remote" change.

### FR-002 — The startup list, from the server devplan (SCOPE-132 FR-093)
On a run's start, the agent calls the server `devplan` (SCOPE-081), filters by `scope_stage`
(SCOPE-123) to the scopes not yet done, and posts them in build order to the room and K.A.I.N.

**Acceptance Criteria**:
- [ ] G.O.D.'s own roadmap (SCOPE-136) adds phase gates only for scopes it already tracks; its
      absence blocks nothing.
- [ ] The owner's "go" on this list is the run's approval; nothing further is asked before work
      starts.
- [ ] No server `devplan` available → the run does not start (US1 edge).

### FR-003 — Skips cascade from the existing impact check (SCOPE-132 FR-094)
A skipped scope's dependents are listed from `_wxAI/impact/scope-impact.mjs`, each marked skipped
or partly worked; the owner confirms which of the listed tasks are safe to keep.

**Acceptance Criteria**:
- [ ] A partly-worked scope stays partial and is listed again on the next run.
- [ ] A skip with no dependents posts with no dependent list.

### FR-004 — The pipeline runs unattended, one scope at a time (SCOPE-132 FR-095)
For each remaining scope, the agent runs `validateScope`, then `createSpecs`, then `implement`, in
a fresh session per unit (reusing G.O.D.'s one-session-per-unit drive, SCOPE-136 FR-014/FR-015), one
worktree per scope.

**Acceptance Criteria**:
- [ ] A gate with no approved design to answer it from is parked as one line — project, scope,
      question, what it blocks — never guessed; an unbuilt or un-scoped item stays with the owner.
- [ ] A gate the scope text or the decision ledger (`decisions/ledger.yaml`) already answers is
      answered from that record, through the existing askgate queue.

### FR-005 — Never a push, never production (SCOPE-132 FR-096)
Each unit lands as one local commit in its own worktree; the run never executes `git push`. A unit
whose own tests or migration target the production database is parked untouched, with one line
naming why, and the run goes on to the next independent unit.

**Acceptance Criteria**:
- [ ] Reuses the existing push/production-write gate (FR-010, FR-025 of SCOPE-132) and the
      one-agent-per-tree lock (FR-026); this spec adds no new case to either.
- [ ] SC-38's seeded production-pointed unit parks instead of running.

### FR-006 — A failed unit does not stop the run (SCOPE-132 FR-097)
A unit that fails its tests or times out is parked with a short line to the room and K.A.I.N.; its
dependents are marked waiting; the agent goes on to the next independent unit.

**Acceptance Criteria**:
- [ ] Every unit ends with an explicit done or failed line in the run state.

### FR-007 — The 15-minute heartbeat, always (SCOPE-132 FR-098)
Every 15 minutes, the agent posts to the room and K.A.I.N. from the run state (reusing Amendment
G piece A's masked rolling-summary mechanism, SCOPE-132 FR-076 — no second summarizer is built):
full detail when something finished since the last post, a short "nothing changed" line otherwise,
and "paused" when the owner paused the run.

**Acceptance Criteria**:
- [ ] `STATUS` on demand returns the same content early.
- [ ] A full summary posts when the startup list finishes, and again at 18:00 if the run is still
      going.
- [ ] SC-39's 2-hour seeded run produces a post in 100% of 15-minute windows.

### FR-008 — A missed heartbeat is alerted (SCOPE-132 FR-099)
The server derives a missed post from the existing connection record (SCOPE-151): the agent not
live at its last check-in, or no status post for 20 minutes, during an active, unpaused run. One
alert line posts to the room and K.A.I.N. per outage, and one "back" line on return. A paused run
raises nothing.

**Acceptance Criteria**:
- [ ] `projectagentconnections` gains one field, `autopilotrunactive`, so the server can tell an
      active run from an idle agent without a second record.
- [ ] SC-40's test matrix: exactly one alert and one "back" line per outage; zero alerts while
      paused.

### FR-009 — Agent time books as Resource time (SCOPE-132 FR-100)
Every run and unit is time-booked through the existing SPEC-005 FR-007 agent-as-Resource model
(`agentruns`, already live in production) — not a new mechanism, and never through `/ai-session`.

**Acceptance Criteria**:
- [ ] Each row is tagged with its scope and task; no attribution to a person.
- [ ] Booking only takes effect where the company has Time and Billing; Autopilot itself carries no
      plan gate.
- [ ] SC-41: 100% of completed units write one `agentruns` row tagged with scope and task.

### FR-010 — No cost or model rule of its own (SCOPE-132 FR-101)
Autopilot adds nothing to context, cost or model routing beyond what already exists: rescue-tokens,
the SPEC-143 routing tiers, the SCOPE-093 advisor, and a fresh session per unit (FR-004) are the
whole of it.

**Acceptance Criteria**:
- [ ] No Autopilot-specific cost/model logic exists anywhere in the implementation.

### FR-011 — Help (SCOPE-132 FR-102)
One catalog entry (`src/shared/help/catalog.ts`) explains the Autopilot switch, the startup list
and skip, the 15-minute heartbeat, and that the run never pushes.

**Acceptance Criteria**:
- [ ] Entry is reachable from the existing Subscription-Aware Help surface (SCOPE-084).

### FR-012 — Build order / release gate (SCOPE-132 FR-103)
Autopilot is specified here but is not enabled for any project until its prerequisites are
verified complete: the SPEC-149 `bridge.ts` handoff guard fix; and SCOPE-102 FR-013 (the
`ANTHROPIC_API_KEY` stripped from the child session — built and verified 2026-11-07 via
`buildChildEnv()`, `remote-bridge/src/child-env.ts`, wired into `session.ts:143` and
`triage-run.ts:223`).

A third prerequisite, SCOPE-132 Amendment G piece A (the rolling summary), was named in the
original FR-012/FR-103 text but was descoped 2026-11-07 (SCOPE-154, with Andy): this spec's
heartbeat (T008/T009) derives its content from `AutopilotRunState`, never from Amendment G piece A,
so that mechanism is not an actual runtime dependency of Autopilot. Amendment G piece A remains
specified (SPEC-155) and may still ship on its own schedule — it is no longer a precondition here.

**Acceptance Criteria**:
- [x] A release gate checks both remaining prerequisites before the Autopilot switch is exposed in
      any environment (`src/server/services/AutopilotReleaseGate.ts`).
- [x] The gate fails closed: if either prerequisite's status cannot be confirmed, Autopilot stays
      unexposed.

### FR-013 — Release (SCOPE-132 FR-104)
`docs/kain-contract.md` gains the startup-list format, the skip/cascade shape, the heartbeat and
missed-heartbeat lines, and the parked-unit line.

**Acceptance Criteria**:
- [ ] A test runs a full startup list with one skip, one failed unit, one parked production-bound
      unit, and one missed heartbeat, and confirms `agentruns` receives a row per unit.

### FR-014 — Cockpit live view of the running scope and process (Amendment 2026-11-08)

Reverses the original "no Cockpit live view" decision (Data Requirements, below) after owner
feedback that a running Autopilot gives no visible sign of life anywhere in VS Code or chat: the
owner has no way to see which scope is currently being worked, or that anything is running at all,
short of reading the 15-minute heartbeat line when it happens to post.

The Cockpit gains a read-only "Autopilot" tree view, sourced from the same local run-state file
FR-002/FR-003 already write (the `docs/GOD-State*.json`-shaped file — no new database table, no new
server route): the current scope, its current step (`validateScope` / `createSpecs` / `implement`),
elapsed time on that step, and the remaining startup-list items in build order, each tagged
done / failed / skipped / in-progress / waiting. The view refreshes on the same file-watch pattern
the existing Cockpit "Development Plan" checklist (SCOPE-081) already uses — no polling of its own.
When no Autopilot run is active for the project, the view shows "not running" rather than being
hidden, so its absence is never mistaken for "nothing to show yet."

This is local-machine state, exactly as FR-002/FR-003 already specify: a second machine or a second
viewer sees nothing extra by this FR alone (out of scope here, same boundary as the rest of this
spec's v1).

**Acceptance Criteria**:
- [ ] The Cockpit shows a live Autopilot tree view (current scope, current step, elapsed time,
      remaining list with status) while a run is active, reading only the existing run-state file.
- [ ] The view shows "not running" when no run is active, never simply absent.
- [ ] No new database table, server route, or second run-state file is introduced.
- [ ] The view updates within the same refresh window as the existing Development Plan checklist.

### FR-015 — A live question can never strand the run (Amendment B 2026-11-08)

Found on ScanShip 2026-11-08: while a unit's live gate question was waiting, the owner's `status`
was taken as the answer ("Got it — recording that answer"), and a missed question held the run with
no time limit and no reminder — the heartbeat said only "nothing changed".

- While a question is waiting, the control words `STATUS`, `PAUSE`, `RESUME`, `VERBOSE`, `CONCISE`
  and `STOP` act as control words and are never taken as the answer. `STATUS` re-posts the
  waiting question.
- The question is posted twice: when asked, and once more as a last call 10 minutes later. The
  last call says it parks in 5 minutes and that `status` brings it back afterwards.
- 15 minutes after it was asked, an unanswered question is parked automatically — never guessed —
  and the run continues to the next independent unit (FR-004, FR-006 unchanged).
- An auto-parked question is kept for the rest of the bridge's life. While no other question is
  waiting, `STATUS` brings back the oldest one: it is re-posted and the next reply answers it. An
  answer is written to `decisions/ledger.yaml` (the existing T013 writer); if the run is still
  active and that unit ended parked, the unit is queued once more at the end of the run, where the
  ledger now answers the question.
- Heartbeats posted while a question is waiting say so and repeat the question.

**Acceptance Criteria**:
- [ ] `status` typed while a question waits re-posts the question and is not recorded as an answer.
- [ ] An unanswered question gets exactly two posts and parks at 15 minutes; the run goes on.
- [ ] After an auto-park, `status` re-opens the question; the answer reaches the ledger, and the
      parked unit runs again at the end of an active run.

### FR-016 — A running unit is visible, and a crash leaves a record (Amendment B 2026-11-08)

- Each unit's start posts one line: `Autopilot: working on SCOPE-NNN — <title>.`
- A heartbeat with nothing finished names the unit in progress and how long it has run, instead of
  only "nothing changed".
- A park line always names the project and scope. When the unit session's result file omits them,
  the pipeline fills them in from the unit and the bridge's project name (no more
  `undefined / undefined`).
- An uncaught exception or unhandled rejection in the bridge process is written, with its stack,
  to `.wxai/project-agent-crash.log` (appended, timestamped) before the process exits; the bridge
  makes one best-effort post to the room naming the log.
- At startup the bridge prints the billing path the child sessions will use
  (`subscription` or `api_key`, from `buildChildEnv`, SCOPE-102 FR-013) to its output.

**Acceptance Criteria**:
- [ ] A unit start posts the working line; a quiet heartbeat names the running unit and its elapsed
      time.
- [ ] A park result without project/scope posts with both filled in.
- [ ] A thrown error outside every handler leaves an entry in `.wxai/project-agent-crash.log`.

### FR-017 — `go debug`: a run that shows every step (Amendment B 2026-11-08)

Replying `go debug` to the startup list starts the run exactly as `go` does, and also posts each
unit session's steps to the room as the regular chat session does: one `· <tool>: <target>` line
per tool call and Claude's own text. Every line passes through the same `redactSecrets` mask the
heartbeat uses. `verbose` and `concise` switch this on and off during a run; a plain `go` starts
concise (today's behaviour). Nothing else about the run changes.

**Acceptance Criteria**:
- [ ] `go debug` starts the run and streams tool and text lines from each unit session.
- [ ] `concise` mid-run stops the stream; `verbose` restarts it.
- [ ] The startup list post names `go debug` alongside `go`.

## Data Requirements

- `companyprojects.autopilotenabled` — `boolean NOT NULL DEFAULT false`, applied by hand alongside
  `allowremote`.
- `projectagentconnections.autopilotrunactive` — `boolean`, one field added to the existing
  SCOPE-151 connection record, so the server can tell an active unattended run from an idle agent
  without a second record.
- The startup list, skip choices, and per-unit done/failed state live in a local run-state file on
  the machine running the agent, reusing G.O.D.'s existing `docs/GOD-State*.json` shape — not a new
  database table. FR-014 reads this same file for the Cockpit live view; it introduces no second
  copy of this state.
- **Still not created**: a parallel run-history table, a cost-tracking table of its own, or any
  database-backed record of the live view (FR-014 is read-only and local-machine only). The original
  "no Cockpit live view" line is superseded by FR-014 above (Amendment 2026-11-08).
- Both column additions are declared in `src/db/schema/` and applied by hand per the project's
  manual-DDL convention (SCOPE-117); `npm run db:drift` confirms after applying, and the change is
  recorded in `specs/117-production-schema-integrity/schema-change-log.md`.

## API Routes

| Surface | Route | Change |
|---|---|---|
| wxKanban app | `PUT /api/projects/:projectId/autopilot` | **new** — `{ autopilotEnabled }`; 400 when "Allow remote" is off; company ADMIN or that project's TEAM_MANAGER; audited |
| wxKanban app | `GET /api/projects/:projectId/agent-access` | **extended** — also returns `autopilotEnabled` |
| wxKanban app | `GET /api/project-agent/settings` | **extended** — also returns `autopilotEnabled` |
| wxKanban app | `POST /api/project-agent/connections/:id/heartbeat` | **extended** — adds `autopilotRunActive` |

## Frontend Components

- **Web app — `ProjectAgentAccessPanel`**: an "Autopilot" switch (shadcn `Switch`), enabled only
  when "Allow remote" is on and only for the same roles, with a one-line explanation that it drives
  the dev plan unattended and never pushes.
- **Cockpit**: no new command. The existing read-only "Development Plan" checklist (SCOPE-081)
  remains the one view of what Autopilot is working through.

## Integration Context

Aligns with SCOPE-136 (the dev-plan drive and its one-session-per-unit pattern this spec reuses
rather than reimplementing), SCOPE-081 (server `devplan` as sole source of truth — never
`docs/DEVELOPMENT-PLAN.md`, kept deliberately out of sync per SCOPE-136 FR-010), SCOPE-123
(`scope_stage` filtering), the existing askgate decision queue and `decisions/ledger.yaml`,
SPEC-005 Amendment E (Resource time billing via `agentruns`), SCOPE-151 (the project-agent
connection record this spec extends by one field), SCOPE-132 Amendment G piece A (the masked
rolling summary the heartbeat reuses — not duplicated), and rescue-tokens / SPEC-143 / SCOPE-093
(context, cost and model routing, used as-is, never re-implemented).

## Compliance

SOC 2 is the only framework currently enabled on this project.

- **CC6.1, CC6.3** — least privilege: the Autopilot switch is gated on "Allow remote" and
  restricted to the same roles (ADMIN or that project's TEAM_MANAGER).
- **CC7.2** — every switch change is audited the same way as an "Allow remote" change.
- **CC5.2-style separation of duties carries over unchanged**: the agent proposes and commits
  locally; the existing server-side gate still decides every push and production write (FR-005), so
  this spec adds no new place where the agent authorizes its own action.
- **Resolved 2026-11-07**: both FR-012 prerequisites (SPEC-149 guard fix, SCOPE-102 FR-013) are now
  verified built; `AUTOPILOT_RELEASE_GATE_OPEN` is `true`. The gate's original third prerequisite
  (SCOPE-132 Amendment G piece A) was descoped — see FR-012.

## Constraints

- Never run git or push as part of this spec's own implementation work beyond what FR-005 itself
  specifies (one local commit per unit, no push) — the orchestrator's own "never push without being
  asked" rule applies to the humans and agents building this spec too.
- Schema changes (`autopilotenabled`, `autopilotrunactive`) are applied by hand; no
  `drizzle-kit push` against this database; verify with `npm run db:drift` after applying and record
  in the schema-change-log.
- TypeScript strict, no `any`, no `@ts-ignore`; Pino logging only, no `console.log`.
- Every top-level code unit fenced `[SCOPE 154 / Tnnn]`, written by the orchestrator (`implement`)
  only.
- FR-012's release gate is a hard constraint on exposure, not just a note: Autopilot must not be
  switchable in any environment until all three prerequisites are independently verified built, not
  merely specified.
- The project agent's bridge ships from `wxkanban-agent/apps/remote-bridge`; after any bridge edit,
  rebuild `wxkanban-agent` so `dist/remote-bridge.cjs` matches source — the Cockpit's project agent
  runs the built bundle, not the TypeScript source.
