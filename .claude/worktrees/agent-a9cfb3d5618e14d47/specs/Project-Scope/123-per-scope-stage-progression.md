# SCOPE-123: Per-Scope Stage Progression — Remove the Project-Level Gate

**Spec Number**: 123
**Status**: `draft`
**Created**: 2026-08-05
**Last Reviewed**: 2026-08-05
**Depends On**: SPEC-019 (Agent Orchestrator Kit — owns `core/policy/`, the capability gate table, and the `sync-to-orchestrator --release` publish path)
**Depends On**: SCOPE-122 (Spec Status Vocabulary — **hard predecessor**, decided 2026-08-05; this scope *consumes* its unified vocabulary and must not fork a fourth; see FR-009 and Clarifications)
**Related**: SCOPE-101 (`update_spec_status` + task-spec linking — FR-003 must not become a second competing writer of spec status). SCOPE-121 (ships in the same kit release; both change `wxkanban-agent/`).
**Source**: wxKanban feedback refs `600d11d2-bc02-40cc-bb4d-d43cc5eadb61`, `7fee37ad` (origin project `947a5614-0891-415e-a9f9-4d89f7e4c725`); `8369ad91`, `0304ff5d`, `15429454` (origin project `68cf2d4b-fb8e-442f-8290-3aa3fd2be701`). Two further reports in the same cluster, `2a2c4860` and `9b7e1a8d` (origin project `1b7ff890-ab5d-476e-9fd6-2369af59457a`), are **already fixed** — see Notes.

---

## Overview

Seven field reports from three projects, filed 25 July to 4 August, describe one experience: a
project sits in Design, `implement` is refused, and the build proceeds outside the tool meant to
track it. One customer titled their report "Orchestrator wrongly gates `implement` on a project-level
Design stage" — which is exactly right, and is the whole defect.

**A stage belongs to a scope, not to a project.** Each scope advances on its own once its tasks are
complete. A project never blocks a scope from moving; the project's stage is a rollup of its scopes,
a reporting view, not a gate. The orchestrator implements the opposite.

Verified in source:

`wxkanban-agent/core/policy/policy.ts:64` and the three refusal sites in
`core/policy/adapters/cli-adapter.ts` deny a command based on a single **project-wide** stage,
resolved by `resolveCurrentPhase(db, projectId)`. That helper selects `phasename` from
`projectphases` where status is `in_progress` or `reopened`, and falls through to Design when no row
matches — so a project with no active phase row is indistinguishable from one genuinely in Design.
Every scope in that project is then gated on a value that describes none of them.

`canTransition` in `core/orchestrator/transitions.ts` encodes the legal moves and is **never called
at runtime** — its only references are in its own unit test.

The correct model is already in the schema and dormant. `specificationphases` carries
`specificationid`, `phase`, `enteredat`, `exitedat`, `approvedby`, `notes`, `blockers` — per-scope
phase history with the six stages. **No code writes it.** `projectspecifications.phaseid` meanwhile
points at the *project's* phase table, wiring each scope back to the project-level value rather than
its own.

So this is not a missing feature. It is a gate reading the wrong table while the right one sits
empty.

This scope moves the gate to the scope, populates `specificationphases` as scopes progress, advances
a scope when its tasks complete, and reduces the project stage to a derived rollup that can gate
nothing.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | A developer running a multi-scope project through the orchestrator — the person whose scope has finished its tasks and cannot move, because a project-level stage that describes none of their scopes is refusing the command |
| **Secondary Actors** | The assistant reading the board to decide what to do next, which currently cannot trust it; the Dev Cockpit and the Kanban board, which render per-scope state that nothing keeps current; support, who have hand-moved `projectphases` rows for two customers because no consumer-facing path exists |
| **Key Value** | Each scope advances on its own evidence the moment its tasks are complete, so the board matches the code without anyone editing it by hand, and no scope can be held still by the state of a scope beside it |
| **Scope Boundary** | See the `## Scope Boundary` and `## Out of Scope` sections below. |

---

## Business Problem

Three customer projects have been unable to move work through the orchestrator, and in every case the
build continued anyway — outside the tool. That is the damage: not a blocked developer, but a system
of record that quietly stops matching reality while everyone keeps working.

The evidence is unusually strong because one reporter did our diagnosis for us. Project `947a5614`
has been pinned to Design since **14 July**, with 95 Project-Scope documents, 11 fully-detailed specs
and 108 tasks created through `project.create_specs` on the same day. Its event log contains **zero
stage transitions of any kind, ever**. Four consecutive kit upgrades — v1.7.28 through v1.7.32 —
changed nothing, which rules out a version-specific regression and points at the model.

A second reporter (`15429454`) filed a self-critical root-cause split titled "Why the assistant
appears to work outside scope", separating our tool gaps from their own process misses. Their
conclusion: `implement` emits no code and is refused in Design, so working code must be authored in
the editor while the orchestrator is reduced to bookkeeping that nobody can update. The perception
that the assistant ignores process is, on their evidence, mostly our gate.

Three compounding costs:

**The board becomes untrustworthy, silently.** A scope whose tasks are done cannot advance, so status
is set by hand or not at all. Two reports describe specs stranded at `planned` while the code
shipped. Once a board is wrong in one place, every claim on it needs cross-checking against the repo,
which is the opposite of why it exists.

**The refusal message cannot be acted on.** `cli-adapter.ts` returns the same sentence for a command
that does not exist and a command blocked by stage, by explicit design — the code comment reads
"Byte-identical rejection format for unknown commands". A customer reading *"Command 'kit:configure'
is not permitted in the 'Design' stage"* reasonably concludes the gate is at fault. We reached the
same wrong conclusion internally and shipped an Amendment before discovering the command had never
been registered. If the string misleads its authors, it cannot be expected to inform a customer.

**There is no supported way out.** `force` is rejected outright with "escalation logged for admin
review" and no path for the caller. The only working write path to `projectphases.status` is the web
dashboard — unavailable to the CLI, the MCP surface and the Dev Cockpit, which is the entire consumer
toolchain. Customers' remaining option is to ask support to move the row by hand, which two of them
did.

The underlying cause is a category error, not a missing feature. A stage describes the maturity of
one scope's work. The orchestrator treats it as a property of the whole project and gates every
command on it, so one scope entering Implementation would have to drag all its siblings with it —
which is why nothing ever advances.

The cost of leaving it: every multi-scope project degrades the same way, and the more disciplined the
customer, the worse it gets — the projects that filed these reports are the ones that created full
spec sets and expected the tool to track them.

## Scope Boundary

Move the command gate from the project to the scope. `wxkanban-agent/core/policy/policy.ts` and the
three refusal sites in `core/policy/adapters/cli-adapter.ts` resolve the phase of the scope being
acted on rather than calling `resolveCurrentPhase(db, projectId)`; `implement <scope>/<task>` already
names its scope, so the gate has its subject. Commands with no scope argument keep a project-level
resolution, but it is derived from the scopes rather than read from `projectphases`.

Wire `specificationphases` — the dormant table gains its first writer. A row is opened when a scope
enters a stage and closed with `exitedat` when it leaves, giving per-scope phase history with
`approvedby` and `blockers` already modelled.

Advance a scope when its tasks complete. Completion of the last open task in a scope moves that scope
to the next stage and records the transition, independently of every sibling scope. `canTransition`
in `core/orchestrator/transitions.ts` stops being dead code and becomes the rule that governs it.

Make the refusal message actionable. Separate the unknown-command rejection from the stage denial —
they are byte-identical today by explicit design — and have the stage denial name the scope, its
current stage, and what would advance it.

Reduce the project stage to a derived rollup. `projectphases` remains for display and reporting;
nothing gates on it. `projectspecifications.phaseid`, which currently points a scope at the project's
phase row, loses its readers.

Adopt SCOPE-122's status vocabulary rather than introducing a fourth.

## Out of Scope

**Making `implement` generate code.** Two reports expect `implement` to emit an implementation and
read its silence as a no-op. It is not one: the kit is a workflow engine, not an AI client — it has
no model call and never has. The assistant authors the code; the orchestrator fences and tracks it.
This scope fixes the *message* so the division is stated rather than inferred. Building a generator
would be a different product.

**The web dashboard's advance/reopen UI.** It works. Its June "Internal server error" was three
layered bugs — a Reopen button offered on an `in_progress` phase, a route without try/catch, and a
catch-all masking the message — and all three are fixed in current source. Reporters who tried the
dashboard in July hit the tail of that, not a missing control. Re-test, do not rebuild.

**The `force` override policy.** `force` is refused with "escalation logged for admin review" and no
caller path. That is deliberate governance, and whether a consumer may ever override a gate is a
decision to take on its own evidence — not one to settle as a side effect of moving the gate.

**SCOPE-122's vocabulary unification.** This scope *consumes* the unified status vocabulary; it does
not perform the unification. If 122 slips, this scope inherits the mismatch rather than forking a
fifth vocabulary.

**Retro-fixing affected projects' data by hand.** Support has already moved rows manually for two
customers. Backfill is addressed as a migration requirement (FR-007), not as one-off database
surgery.

**MCP `project.implement`'s task sourcing.** Fixed 2026-07-27 (`1f4a5356`) and deployed. Named here
only so nobody re-opens it.

**Dropping `projectspecifications.phaseid`.** The column loses its readers here but is not dropped —
see Constraints.

## User Scenarios & Testing

### US1 — Two scopes in one project sit at different stages, and both work

**Actor**: a developer running a project with several scopes in flight

1. SCOPE-A's tasks are complete and it has entered Implementation. SCOPE-B is still being specified
   and is in Design.
2. The developer runs `implement SCOPE-A/T004`.

**Expected outcome**: the command is permitted, because SCOPE-A is in Implementation. SCOPE-B is
untouched and stays in Design. Running a Design-stage command against SCOPE-B is likewise permitted.
Neither scope's stage constrains the other, and no project-level value participates in either
decision. Today both are refused unless the whole project has been moved by hand.

### US2 — A scope advances itself when its last task completes

**Actor**: a developer finishing the last open task in a scope

1. The scope has one task remaining in Implementation.
2. The developer completes it.

**Expected outcome**: the scope moves to the next stage, a `specificationphases` row is closed with
`exitedat` and the next opened with `enteredat`, and the transition is recorded as an event. The move
is governed by `canTransition`, which is called at runtime for the first time. No sibling scope moves
and the project's own stage is not written.

### US3 — A stage refusal tells the caller what to do about it

**Actor**: a developer whose command is genuinely blocked

1. The developer runs a QA-stage command against a scope in Design.

**Expected outcome**: the refusal names the scope, its current stage, the stage the command requires,
and what would advance it — for example, the count of tasks still open. Today the message names only
the project's stage, which may describe no scope in the project.

### US4 — An unknown command says it is unknown

**Actor**: anyone mistyping a command, or calling one that was never registered

1. The developer runs a command that has no capability mapping.

**Expected outcome**: the error says the command is not recognised and lists what is available. It is
**not** the stage-denial sentence. This is a regression assertion with a real precedent:
`cli-adapter.ts:112` returns a "byte-identical rejection format for unknown commands" by explicit
design, and it caused `kit:configure` to be filed and diagnosed as a stage-gate bug when the command
had simply never been registered.

### US5 — The board reflects each scope's real maturity without hand-editing

**Actor**: a developer, or an assistant reading the board to decide what to do next

1. Several scopes progress at different rates over a week.

**Expected outcome**: each scope's stage on the board tracks its own task completion, with per-scope
history queryable from `specificationphases`. Nobody calls `update_spec_status` by hand to keep the
board honest — the failure two reports describe, where specs sat at `planned` while the code had
shipped.

### US6 — An existing project with no phase history starts working immediately

**Actor**: one of the projects already in the broken state

1. The project has scopes and completed tasks but **zero** `specificationphases` rows, because
   nothing has ever written that table, and no active `projectphases` row — which is why
   `resolveCurrentPhase` has been reporting Design.
2. The kit is upgraded.

**Expected outcome**: each scope's stage is derived from evidence already in the database — its
tasks, its status, its documents — and `specificationphases` is backfilled accordingly, with the
derivation recorded. A project that has been stuck since 14 July resumes without support touching a
row by hand. **A project whose scopes are all genuinely in Design must derive as Design** — the
backfill infers, and inference that guesses generously would silently promote unfinished work.

## Functional Requirements

### FR-001 — The gate resolves the stage of the scope being acted on

`wxkanban-agent/core/policy/policy.ts` and the three refusal sites in
`core/policy/adapters/cli-adapter.ts` decide permission from the phase of the **scope named by the
command**, not from `resolveCurrentPhase(db, projectId)`. `implement <scope>/<task>` already carries
its scope; commands that take a scope argument use it. No project-level value participates in a
scoped decision.

`resolveCurrentPhase` is not deleted — it keeps serving display and rollup callers — but no gate
calls it.

**Acceptance Criteria**:
- [ ] Two scopes in one project at different stages each accept their own stage's commands in the same session
- [ ] A command against a scope in Implementation is permitted while a sibling scope sits in Design
- [ ] No gate path calls `resolveCurrentPhase`; a test asserts this so the coupling cannot return
- [ ] `mcp-adapter.ts:149`, which resolves the project phase today, is brought to the same rule

### FR-002 — `specificationphases` becomes the per-scope system of record

The table gains its first writer. Entering a stage opens a row (`specificationid`, `phase`,
`enteredat`); leaving it sets `exitedat`. `approvedby`, `notes` and `blockers` are populated where
the transition carries them. A scope's current stage is its open row; a scope with no open row has
never been progressed and reads as Design.

No DDL. The table is declared and present in production, unused. Confirm presence with `db:drift`
before building — that check is table-level, so it proves existence, not column shape; verify the
columns directly.

**Acceptance Criteria**:
- [ ] Entering a stage writes exactly one open row for that scope
- [ ] Leaving sets `exitedat` on the prior row before opening the next; a scope never holds two open rows
- [ ] Phase history for a scope is queryable in order and reconstructs its path
- [ ] Column shape is verified against production, not inferred from `db:drift` exit 0

### FR-003 — Completing a scope's last open task advances that scope

When the final open task in a scope closes, the scope moves to the next stage. `canTransition` in
`core/orchestrator/transitions.ts` governs the move and is called at runtime — its first runtime
caller. An illegal move is refused and recorded, not silently skipped.

The advance is per scope and unconditional on siblings. No project-level row is written.

**Acceptance Criteria**:
- [ ] Closing the last open task advances that scope one stage and records the transition as an event
- [ ] Closing a task that is not the last advances nothing
- [ ] Sibling scopes are unchanged, verified by re-reading each sibling's open row
- [ ] A transition `canTransition` rejects is refused with the reason recorded
- [ ] `transitions.test.ts` is joined by a test that exercises the runtime path, so the module cannot become dead code again

### FR-010 — The automatic advance respects the test gates (Amendment A, 2026-10-04)

FR-003's advance on the last open task closing applies only where leaving the current stage needs
nothing but closed tasks. Where leaving it also needs a SCOPE-111 test gate, the same shared service
checks that gate too, for that scope:

- leaving QA needs the machine test gate clear: no forced machine test unsigned or failing;
- leaving Human Testing needs a tester sign-off on every released human test;
- the Release check needs every forced test, of either kind, clear.

Until the gate clears, the scope stays where it is; the advance is attempted again whenever the gate
changes. A refusal (FR-004) names the open gate as well as the open tasks.

**Acceptance Criteria**:
- [ ] Closing the last task in QA does not advance the scope while a forced machine test is unsigned or failing
- [ ] Signing the last outstanding test, with no open tasks, advances the scope
- [ ] Leaving Human Testing waits for every released human test's tester sign-off
- [ ] The refusal names the open gate and its outstanding items
- [ ] A stage with no test gate (Design, Implementation, Beta) advances on its tasks alone

### FR-004 — A stage refusal is actionable

A stage denial names the scope, its current stage, the stage the command requires, and what would
advance it — at minimum the count of tasks still open in that scope. It does not name a project-level
stage.

**Acceptance Criteria**:
- [ ] The message contains the scope identifier, its stage, the required stage, and the remaining-task count
- [ ] It never reports a stage that describes no scope in the project
- [ ] It is distinguishable from FR-005's message by a machine, not only by a human — the caller can branch on it

### FR-005 — An unknown command reports that it is unknown

A command with no capability mapping returns an unrecognised-command error listing available
commands. It does **not** reuse the stage-denial sentence.

This is a regression assertion with a precedent: `cli-adapter.ts:112` carries the comment
"Byte-identical rejection format for unknown commands", and that identity caused `kit:configure` to
be filed, triaged and amended as a stage-gate defect when it had simply never been registered.

**Acceptance Criteria**:
- [ ] An unregistered command yields an unrecognised-command error naming no stage
- [ ] A registered command blocked by stage yields FR-004's message
- [ ] A test asserts the two strings are not equal — the specific failure this repeats
- [ ] Both refusal sites in `cli-adapter.ts` and the equivalent in `policy.ts` are covered

### FR-006 — The project stage is derived and gates nothing

`projectphases` remains for display, reporting and the dashboard. Its value is computed from the
project's scopes rather than being independently authoritative. Nothing in the policy layer reads it.

`projectspecifications.phaseid`, which points a scope at the *project's* phase row, is the wiring
that made the category error possible. Its readers are removed here; the column itself stays (see
Constraints).

**Acceptance Criteria**:
- [ ] No policy or gate path reads `projectphases`
- [ ] The project stage displayed matches a stated rule over its scopes' stages
- [ ] `phaseid` has no remaining readers; the column is still declared and still present
- [ ] The column drop is explicitly deferred and recorded in the schema change log, not performed here

### FR-007 — Existing projects are backfilled conservatively

Projects already in the broken state have zero `specificationphases` rows. Each scope's stage is
derived from evidence already in the database — its tasks, its status, its documents — and
backfilled, with the derivation recorded so a wrong inference is auditable rather than invisible.

The inference is **conservative**: where evidence is ambiguous, the scope lands in the earlier stage.
A backfill that promotes generously would move unfinished work into stages that unlock commands it is
not ready for, which is worse than the condition being fixed.

**Acceptance Criteria**:
- [ ] A project with completed tasks and no phase rows resolves to sensible per-scope stages with no manual intervention
- [ ] A scope whose work has genuinely not started derives as Design
- [ ] Ambiguous evidence resolves to the earlier stage, and the reason is recorded
- [ ] The backfill is idempotent — running it twice changes nothing the second time
- [ ] Verified against a copy of a real affected project, not a synthetic fixture

### FR-008 — Unscoped commands gate on a stated rule

Commands taking no scope argument still need a decision. They gate on a rule stated in this document
and derived from the project's scopes — not on a stored project stage.

**The rule (Amendment B, 2026-10-04).** Every command falls in exactly one of three classes:

| Class | Commands | Decision |
|---|---|---|
| Scope-creating | `buildscope` (new and `--edit`), `createspecs` (Amendment C), `wxconversion`, `wxconversionscope`, `cwconversion`, `cwconversionscope`, `vbconversion`, `vbconversionscope` | Always permitted. What they create starts in Design, and an amendment to a running scope (its scope document, its specs and tasks) is design work that must not wait for the scope to finish. |
| Cross-cutting | `dbpush`, `pipeline-agent`, `auditfences`, `kit:status`, `kit:configure`, `scaffold:frontend`, `archive:files` | Always permitted, as today. |
| Scoped | `implement`, `createtesttasks`, `runqa`, `runhuman`, `prepareRelease`, `finalizeRelease` | Permitted when the **named scope's** stage is in the command's row and the scope is active. Sent with no scope, it is refused with a message asking for the scope; it never falls back to a project value. |

No class reads a project stage, so every decision is reproducible from the named scope alone, or
from nothing at all.

**Acceptance Criteria**:
- [ ] Every command is classified scoped or unscoped, and the list is asserted by a test
- [ ] An unscoped command's decision is reproducible from its project's scope stages alone
- [ ] Adding a command without classifying it fails the build rather than defaulting silently

### FR-009 — One vocabulary, consumed not forked

Stage and status values come from SCOPE-122's unified vocabulary. `specificationphases.phase` stores
uppercase (`'DESIGN'`), `projectphases.phasename` stores `LifecycleStage` values, and SCOPE-122
documents a third mismatch between `update_spec_status`'s eight statuses and the board's four
columns. This scope adopts the unified set and adds no fourth.

**Acceptance Criteria**:
- [ ] Every value written by this scope belongs to the unified vocabulary
- [ ] An unrecognised value cannot be written — rejected at the boundary, not coerced
- [ ] If SCOPE-122 has not landed, this scope's values still map to it without a translation layer

**Which vocabulary (Amendment B).** SCOPE-122 landed as board mapping and write-time status
validation; it did not define a stage set. The stage vocabulary is therefore the kit's
`LifecycleStage` (`Design`, `Implementation`, `QA`, `HumanTesting`, `Beta`, `Release`), which
`projectphases.phasename` already stores byte for byte. `specificationphases.phase` stores the same
values. The uppercase set in that table's schema comment was never written by live code (its only
writers are the dead `tools/wxkanban-mcp.mjs` and a one-shot script), and the one production row
stores `Release`. So this removes a vocabulary rather than adding one.

A task is **closed** when its status is `done` (MCP), `completed` (app) or `orphaned` (its external
PM item is gone, so nobody can work it). Every other status, `blocked` included, is open.

### FR-011 — A scope leaves Design when its tasks exist (Amendment B, 2026-10-04)

A new scope has no tasks until createSpecs generates them, so FR-003's trigger can never fire in
Design. A scope therefore leaves Design when it has at least one task: createSpecs finishing is
Design's last step. The shared advance service runs whenever tasks are created for or linked to a
scope, as well as when one closes.

**Acceptance Criteria**:
- [ ] A scope with no tasks stays in Design
- [ ] createSpecs generating a scope's tasks moves it to Implementation, so `implement` is permitted
      immediately afterward
- [ ] The backfill (FR-007) applies the same rule: a scope with tasks is at least in Implementation

### FR-012 — The advance keeps going while each stage is clear (Amendment B, 2026-10-04)

After any trigger, the service advances the scope one stage at a time for as long as the stage it is
in has nothing outstanding, recording each step separately and checking each with `canTransition`.
It stops at the first stage with an open task or an open gate. A stage's exit condition:

| Stage | Leaves when |
|---|---|
| Design | the scope has at least one task (FR-011) |
| Implementation | it has tasks and none is open |
| QA | no open task, at least one machine test exists for the scope, and the machine gate is clear |
| HumanTesting | no open task, and every released human test for the scope is signed |
| Beta | no open task, and every forced test of either kind is clear |
| Release | never (final stage) |

A scope with **no machine tests stops in QA**; the refusal names the missing tests and points to
`/wxCreateTestPlan`. A project with testing switched off (`skiptesting`, SCOPE-111 Amendment A)
passes the test conditions, so its scopes move on tasks alone.

**Acceptance Criteria**:
- [ ] The last task closing with every later condition met advances the scope through each clear
      stage, writing one closed `specificationphases` row and one event per step
- [ ] A scope with no machine tests stops in QA, and the refusal names `/wxCreateTestPlan`
- [ ] A project with testing switched off moves its scopes on tasks alone

### FR-013 — Fix work runs in QA and Human Testing (Amendment B, 2026-10-04)

A scope in QA with a failing test needs a code change, and `implement` was Implementation-only, so
the fix would have to happen outside the tool, which is the behavior this scope exists to end.
`implement` is permitted in Implementation, QA and HumanTesting. Nothing moves backward: the scope
stays in its stage until its own exit condition holds.

**Acceptance Criteria**:
- [ ] `implement` against a scope in QA or HumanTesting is permitted
- [ ] `implement` against a scope in Design, Beta or Release is refused with FR-004's message

## Data Requirements

**No DDL.** Every table this scope needs is already declared and present in production. That is
deliberate: this database has no migration ledger, schema is applied by hand (SCOPE-117), and
`drizzle-kit push` is prohibited against it — so a scope that avoids DDL avoids the riskiest thing it
could do.

`specificationphases` is written for the first time: one open row per scope (`specificationid`,
`phase`, `enteredat`), closed with `exitedat` on exit, with `approvedby`, `notes` and `blockers`
populated where the transition carries them. Its column shape must be verified directly against
production before building — `db:drift` is table-level and will exit 0 while columns are missing,
which is how the `phaseid` 42703 errors went undetected.

`projectphases` becomes read-only to this scope: displayed, never gated on, never written by it.

`projectspecifications.phaseid` loses its readers but keeps its column.

**One placement decision the FRs depend on.** Task completion arrives through two doors: the app's
own task service and the MCP `project_update_task_status` tool. FR-003 must fire for both, so the
advance belongs at the layer both cross — not duplicated in each caller, which would drift the moment
one is changed. Whether that is a shared service or a database trigger is an implementation decision
for the plan; that it must be *one* place is a requirement.

## API Routes

No new HTTP routes. The gate is enforced in the kit's policy layer, not over HTTP.

Two existing surfaces change behaviour without changing shape: the MCP policy path
(`mcp-adapter.ts:149` stops resolving a project phase) and whichever surface records task completion
gains the FR-003 advance. Any endpoint that reports a project's stage now returns a derived value;
its response shape is unchanged.

**Two MCP tools (Amendment B).** The kit has no database connection in a customer project; it
reaches the hub only through MCP tools. So two consumer-facing needs require a tool each:

- `project.scope_stage` (read-only): a named scope's stage, its open-task count, and its open gates.
  The CLI gate reads it before a scoped command. If the hub cannot be reached, the CLI refuses the
  scoped command and says why; it does not fall back to a local value (a gate that vanishes
  offline is not a gate). Cross-cutting and scope-creating commands need no lookup and still run.
- `project.backfill_scope_stages`: the FR-007 command. Dry run by default, returning each scope's
  inferred stage and evidence; writes only when called with `confirm: true`.

`project.cockpit_summary` gains an additive `stage` per scope so the Dev Cockpit shows it.

## Frontend Components

None built. The Kanban board and the project workspace already render per-scope state and will simply
have correct data to render — several reports describe scopes rendering in no column at all, which
SCOPE-122 owns.

The dashboard advance/reopen control in `PhaseCompletionBar.tsx` is untouched and stays working.

## Integration Context

This scope sits between three existing pieces of work and consumes rather than duplicates them.

**SCOPE-122** owns the unified status vocabulary. FR-009 consumes it. If 122 has not landed, this
scope's values must still map to it with no translation layer.

**SCOPE-101** owns `update_spec_status` and task-spec linking. FR-003's advance rides the same task
data; it must not become a second, competing writer of spec status.

**SCOPE-121** ships through the same kit release. Both change `wxkanban-agent/`, so they land in one
archive and are tested together.

The consumer's toolchain is the CLI, the MCP surface and the Dev Cockpit. All three go through the
policy layer, so all three inherit FR-001 without separate work. That is the point of fixing it there
rather than in a command.

## Success Criteria

1. **0 manual database interventions across all 3 affected projects, within 30 days of release.**
   Baseline: support has hand-moved `projectphases` rows for 2 customers, and project `947a5614` has
   been pinned since 14 July with 0 transition events ever logged. Target: each affected project
   advances a scope through its own toolchain and support edits no rows.

2. **100% of active scopes carry exactly 1 open `specificationphases` row, up from 0 rows today.**
   Baseline: the table has never been written — 0 rows across every project. Target: every active
   scope holds exactly one open row and none holds two.

3. **0 new "stuck in Design" or project-level-gate reports for 30 days after release.** Baseline: 7
   reports from 3 projects in 11 days (25 July – 4 August). Target: 0.

4. **2 distinct refusal messages, asserted unequal by test, after 1 prior misdiagnosis.** Baseline:
   report `bd756151` was filed, triaged and amended as a stage-gate defect when the command was
   simply unregistered, because both conditions emit the same sentence. Target: a stage denial names
   the scope, its stage and its remaining-task count; an unknown command names no stage at all.

## Key Entities

- **Scope (`projectspecifications`)** — the unit that carries a stage. Its `phaseid` currently points
  at the project's phase row; that reference is what this scope removes readers from.
- **`specificationphases`** — per-scope phase history. Declared, present in production, and never
  written. Becomes the system of record for a scope's current stage: its single open row.
- **`projectphases`** — project-level phase rows. Retained for display and the dashboard; demoted
  from authority to rollup.
- **`projecttasks`** — completion of a scope's last open task is the FR-003 trigger.
- **`LifecycleStage`** — the six stages. Three vocabularies currently express them; FR-009 reduces
  that to one.
- **Capability gate table** — maps a command to the stages that permit it. Unchanged in shape; what
  changes is the stage value fed into it.

## Constraints

**No DDL, deliberately.** Production has no migration ledger, `drizzle-kit push` is prohibited
against it, and six declared tables are already missing from prod. Every table this scope needs
exists, and it must stay that way.

**`projectspecifications.phaseid` must not be dropped here.** Drizzle SELECTs every declared column,
so dropping a column the deployed code still declares takes production down — this codebase had that
incident on 2026-07-28. Retirement is staged across releases: stop reading it now, drop it in a later
scope, and record the intent in `specs/117-production-schema-integrity/schema-change-log.md`.

**The advance must fire from one place.** Task completion is reachable from both the app's task
service and the MCP tool; duplicating the FR-003 trigger guarantees divergence.

**Cross-repo delivery.** The policy layer lives in `wxkanban-agent/`, which reaches consumers only
through `sync-to-orchestrator --release`. Nothing here helps a customer until a kit release ships.

**Ships with SCOPE-121.** Both touch `wxkanban-agent/`; they are tested and released together, not
sequentially.

**Backfill runs against real customer data.** FR-007 must be idempotent and conservative, and be
proven against a copy of a genuinely affected project.

## Notes

**Two reports in this cluster are already fixed and should be closed, not built.** `2a2c4860` and
`9b7e1a8d` (origin project `1b7ff890`) reported that `project.implement` returned a byte-identical
canned error regardless of spec state. That was true when filed on 8 July. It was fixed on
2026-07-27 by `1f4a5356` ("make project.implement runnable by sourcing tasks from projecttasks"),
which is deployed — the file is identical to `origin/main` and the hosted MCP auto-deploys on push.
The code comment confirms their diagnosis precisely: the old disk read always yielded zero tasks and,
with a hard-coded `artifactDir = undefined`, blocked every spec unconditionally while refusing force.
Both are still sitting at `triaged`.

**`bd756151` is adjacent and was misdiagnosed — by us.** It reported `kit:configure` refused with
"not permitted in the 'Design' stage" and was treated as a stage-gate bug. `kit:configure` had never
been registered as a command; the string was the unknown-command fallback. SCOPE-095 Amendment A
records this. It is the strongest argument for FR-005: the message defeated its own authors.

**The reports overstate one thing.** Several conclude that nothing anywhere can advance a stage. A
write path does exist — `PhaseService`, `src/server/routes/projects.ts` — it is simply dashboard-only
and unreachable from the consumer's toolchain. Their dashboard attempts in July also coincided with a
since-fixed 500 in the advance/reopen handler, so "clicking it does nothing" reflects a defect that
no longer exists. Re-test before repeating that claim to a customer.

**Report-to-project counting.** Seven reports, three distinct `originProjectId` values (`947a5614`,
`68cf2d4b`, `1b7ff890`). An earlier draft of this analysis said six projects; that was reports
counted as projects. With `2a2c4860` and `9b7e1a8d` closed and `bd756151` reclassified, the live
cluster is **five reports from two projects** — smaller than first stated, and still the clearest
root cause in the queue.

**Why the dormant table matters more than the missing feature.** `specificationphases` and
`canTransition` together are a complete design for per-scope progression that was built and never
connected. This scope is mostly wiring, not invention, which is why it carries no DDL and no new
routes.

## Clarifications

**A stage belongs to a scope; each scope moves independently once its tasks are complete; a project
never stops a scope from moving.** Stated by the product owner on 2026-08-05. This settled two
questions that were open when drafting began: scope-driven auto-advance is not a governance decision
but simply the model, and no project-stage advance command is needed because the project stage stops
being a gate.

**SCOPE-122 lands first.** Decided by the product owner 2026-08-05. This scope consumes 122's
unified vocabulary (FR-009); building 123 first would mean wiring `specificationphases` while four
vocabularies still disagree, creating exactly the fifth surface FR-009 exists to prevent. 122 is
therefore a hard predecessor, not a preference.

**`implement` does not and will not generate code.** The kit is a workflow engine with no model call;
the assistant authors code and the orchestrator fences and tracks it. Two reports treat the absence
of generated code as a defect. The remedy is messaging, not a generator.

**Open questions resolved by the product owner, 2026-10-04:**

1. **The FR-003 advance lives in a shared service**, one function called by both the app's task
   service and the MCP tool. Not a database trigger: a trigger needs hand-applied DDL, which this
   scope avoids, and it hides the logic where tests cannot reach it.
2. **The project's rollup stage is the lowest stage among its scopes** (FR-006). A project reads as
   far along as its least advanced scope, so it shows Release only when every scope is there.
3. **The FR-007 backfill is an explicit command**, run per project, with a dry run that shows each
   scope's inferred stage and the evidence behind it. Nothing is written until the user confirms.
   It never runs automatically on upgrade.
4. **The automatic advance respects the test gates** (FR-010, new). Raised 2026-10-04: SCOPE-111
   requires the machine test gate to leave QA and a tester sign-off to leave Human Testing, and
   FR-003 as first written could step past both.

**Amendment B — resolved by the product owner, 2026-10-04, at the start of implementation.** FR-003
fires when a scope's last task closes, so a stage with no tasks of its own never gets that event.
Without these four rules, scopes would stall in Design, in QA with no tests, and in Beta, exactly as
projects stall today.

5. **A scope leaves Design when createSpecs gives it tasks** (FR-011).
6. **The advance keeps going while each stage is clear; a scope with no machine tests stops in QA**
   (FR-012). Using the test gate's "nothing forced counts as passing" rule would have moved a scope
   with no test plan straight from Implementation to Release.
7. **Scope-creating commands always run** (FR-008's rule). This includes `buildscope --edit`, so
   amendments to running scopes keep working.
8. **`implement` also runs in QA and Human Testing** for fix work (FR-013), with no backward moves.

**Implementation notes, taken with the decisions above:**

- The shared advance service lives in the kit's `core/stage/`, written against a minimal query
  interface. The application bundles it through its own esbuild build, and the MCP server through
  the same `postbuild` bundle that already carries the policy adapter. The test gate is injected:
  the application passes `TestGateService` narrowed to the scope, and the MCP server passes its own
  `test_gate_status` logic narrowed the same way. The service never re-derives a verdict.
- Each step runs in one transaction under a per-scope advisory lock, so two task closes racing
  cannot open two rows. No unique index is added; that would be DDL.
- Transitions are recorded in the `events` table (type `stage_transition`), the store the MCP side
  already writes.
- **Entering Human Testing releases that scope's human test set.** SCOPE-111 asks testers for the
  human set only when QA is left, and the project-level advance did that release. Per-scope
  progression has no project QA exit, so without this the human gate would only ever see
  unreleased tests and pass vacuously. Both surfaces run the release as a stage-entry hook using
  their existing release code. As a second guard, the per-scope gate counts a scope's human tests
  whether or not they have been released, so a failed release blocks rather than passes.
- `resolveSpecVerification` checks the **named** scope rather than "the one active scope in the
  project". FR-001's first criterion cannot pass without it, because a project with two specs in
  progress had no single active scope and every spec-gated command was refused. This also closes
  SPEC-136 T019.

**Amendment C — resolved by the product owner, 2026-10-04, after the implementation review.** The
advisory review of the first build found three gaps the decisions above did not settle:

9. **A scope with no stage row is judged on its inferred stage, and nothing is written** (changes
   FR-002's "no open row reads as Design"). Every existing scope has no row on the day this ships,
   so "reads as Design" would have refused `implement` on every scope in every customer project
   until each one ran the backfill. A gate now judges an untracked scope by the backfill's own rule
   (FR-007), read-only. The backfill stays the explicit command that records it; the next task
   write records it too. Display surfaces (the project rollup, the cockpit's per-scope stage) use a
   cheap lower bound for untracked scopes, from task counts alone: no tasks is Design, open tasks
   is Implementation, all closed is QA. A lower bound can only make the rollup read earlier, never
   later. The cockpit marks such a scope `stageTracked: false`.
10. **`createspecs` runs on a scope in any stage** (changes FR-008's table: `createspecs` moves from
    scoped to scope-creating). createSpecs gives a scope its tasks, which moves it to
    Implementation, so a Design-only `createspecs` could never re-push an amended scope. It now
    regenerates specs and tasks in place whatever the stage; new open tasks hold the scope where it
    is, and `implement` already runs in QA and Human Testing for the follow-up work.
11. **Every test blocks the scope's own advance, forced or not** (changes FR-010). SCOPE-111's
    force flag decides what blocks the dashboard's project release gate; it does not decide the
    per-scope advance. With force off by default, a forced-only rule never blocked anything in
    practice: in one customer project, 6 scopes would have moved to Release with up to 17 human
    tests never released or performed. A scope now leaves QA only when every machine test it owns
    is signed and none is failing, leaves Human Testing only when every human test it owns is
    signed, and reaches Release only when every test it owns is clear. `skiptesting` still passes.

**Review fixes taken with Amendment C** (T021): the MCP gate refuses a call naming a project other
than the token's before reading anything (it had leaked another project's scope stage and test
keys in the refusal); task counts are re-read under the scope lock before a move is written; a
stage's entry work (releasing human tests) re-runs on every advance attempt, so a failed release
is retried; the advance also runs after `delete_task`, after `link_task_to_spec` for the scope
losing the task, after `merge_scope`, after the `skiptesting` toggle and after a retest is
dismissed; `sign_off_test` and `complete_test_run` check the item or run belongs to the caller's
project; scoped commands refuse an archived or deferred scope (`SCOPE_INACTIVE`).

## Open Questions

None.
