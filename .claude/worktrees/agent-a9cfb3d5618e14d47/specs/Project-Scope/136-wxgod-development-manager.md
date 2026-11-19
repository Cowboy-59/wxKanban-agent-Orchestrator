# SCOPE-136: wxG-O-D — Development Process Manager

**Scope Number**: 136
**Status**: `draft`
**Created**: 2026-10-03
**Depends On**: SCOPE-081 (Dev-Plan — its judgment half folds into G.O.D.; the server-side `devplan` document is unchanged); SCOPE-102 (Remote Session Bridge — the runtime an unattended run uses); SCOPE-132 (KAIN — monitor and relay, one driver per tree); SCOPE-030 (spec verification — FR-004 amended by FR-017 here); SCOPE-043 (user feedback — the channel a run defect is reported through); SCOPE-019 (kit — hosted command prompts, `CLAUDE_SKILLS_ALLOWLIST`, release path); SCOPE-047 (Stack & Style — the style type chosen for all screens is recorded in `stack.md` Look & Feel); the wxDesigner skill (per-screen design, `page.md`); SCOPE-114 (design-system catalog — an alternative source for the style choice)
**Related, unchanged**: SCOPE-123 (per-scope stage progression); SCOPE-019 R6a (the kit never calls AI — G.O.D. is a prompt the editor AI runs, so R6a holds); SCOPE-093 (token advisor — on-demand reference fetching follows its read-on-demand rule)
**Amendment A (2026-10-19)**: a seamless `--create` run, where questions the approved design does not cover are queued for the end of the sitting instead of stopping the run. Low-risk ones are assumed and logged, and high-risk ones are parked so only their units wait. Recorded in SPEC-136 FR-037 to FR-043 and Q37 to Q51, from `docs/brainstorms/2026-10-19-wxgod-seamless-create.md`.
**Amendment B (2026-10-22)**: parallel runs outside `--create`. One command implements a list of scopes or specs in parallel, one worktree per unit (Orca when installed); from 18:00 to 06:00, or while the operator is remote through the bridge, the cap rises to the machine maximum; a live status file and a Cockpit "Parallel Agents" panel show every unit. FR-025 to FR-030, US8 to US10, metrics 9 to 11, and Q19 to Q24, from `docs/brainstorms/2026-10-22-parallel-build-agent.md` (decisions 3, 7, 7a, 8, 9). Hand-written in this file's format because `project.buildscope` edit mode does not carry requirements or scenarios (defect filed 2026-10-22). Sibling: SCOPE-142 (Decision Memory) depends on this scope.
**Source**: interactive buildscope session 2026-10-03 (Andy + orchestrator); the wxG-O-D restructure of the same day (method moved to `mcp-server/src/prompts/wxgod*`, stub + scripts in the kit), uncommitted at authoring time

> **Authored by hand, on purpose.** `project.buildscope` cannot carry approved Functional
> Requirements or User Scenarios (the SCOPE-135 defect), so this file is the authoritative
> artifact. The content below is the section-by-section interactive review, approved in full on
> 2026-10-03. Filed to the project as a `ScopeOfProject` document; the spec number is left
> unclaimed for `create_specs`.

---

## Overview

wxG-O-D, the Guru of Development, is the kit command that manages a project's development process
from first evidence to implemented build. In plan mode it turns a customer's folders, documents,
database scripts, and conversion output into a signed-off development plan: every finding traced to
a file and labeled by confidence, a deterministic time-to-completion for every team size, a database
and hosting recommendation, an ERD with integrity suggestions, and the build roadmap, each as
Markdown and PDF. In new-project mode it expands a ProjectOverview.md into a reviewed design and then
drives buildscope, validateScope, createSpecs, and implement scope by scope, under each command's
own gates, with checkpoints a cleared context can resume from; with `--create` it executes that plan
phase by phase to a built application. When the project's Remote Session Bridge is configured, the
run continues unattended with KAIN relaying each gate to the developer's phone. The method itself is
served by the hosted MCP under the key `wxgod`, with its reference documents fetched on demand, so
the kit ships only a stub, the scripts, and the command, and a method fix reaches every subscriber on
their next run.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | The subscribed kit user running `/wxG-O-D` in their project — a wxperts consultant on a customer engagement or a customer's developer who owns a kit subscription |
| **Secondary Actors** | The customer or business owner who reads and signs the plan; KAIN as monitor and relay; the wxperts admin who edits the method once in the MCP prompt tree and redeploys |
| **Key Value** | One command that plans the work from evidence and then builds what it planned, in the plan's own order, without the method ever leaving the server |
| **Modes** | Plan mode: assess and plan, build nothing. New-project mode: design, review, then drive the pipeline on the user's go. `--create`: design, one review pause, then execute the development plan to a built app |
| **Scope Boundary** | Hosted delivery of the method, the three modes, the folded-in build roadmap and renderer, parallel implementation governed by the plan, and operation under the Remote Session Bridge with KAIN. Excludes changes to how buildscope, validateScope, createSpecs, and implement themselves work |
| **Extends** | SCOPE-081 (dev-plan judgment half), SCOPE-102 (bridge), SCOPE-132 (KAIN) |
| **Driver model** | G.O.D. drives; KAIN monitors and relays questions and action requests to the developer, and carries the answer back. KAIN never answers for the developer and never takes the plan over |
| **Delivery** | `project.get_command_prompt` key `wxgod` plus path keys `wxgod/references/<name>`; stub skill, three scripts, and byte-identical thin command in the kit |

## Business Problem

A wxperts consultant lands on a customer engagement with a pile of evidence: legacy source, a
conversion output, documents, screenshots, database scripts, or just a ProjectOverview.md for a
brand-new idea. Turning that into a plan the customer will sign is manual and uneven. Estimates are
gut feel, the database and hosting choice is argued by opinion, nothing traces back to a file, and
the customer gets a different-shaped document every time.

For a new project the gap is worse. The consultant hand-drives buildscope, validateScope,
createSpecs, and implement one scope at a time with no checkpoint, so a long build runs out of
context and loses its place. The kit's own rule that only one spec may be active at a time then
serializes the whole build regardless of how many agents the machine could run.

The method that fixes this was about to ship as a 150 KB skill inside every kit download. A
subscriber whose subscription lapsed would keep a working copy on disk, and every fix to the method
would need every consumer to update their kit. Serving it from the hosted MCP, the way buildscope
and createSpecs already are, removes both problems.

**Why now.** The method exists and was restructured for hosted delivery on 2026-10-03. The Remote
Session Bridge (SCOPE-102) and KAIN (SCOPE-132) exist, so an unattended run has a runtime to use.
Nothing yet ties them together into one command that plans and then builds.

## Actors

Primary: the subscribed kit user running `/wxG-O-D` in their own project, a wxperts consultant or a customer's developer alike; the command behaves the same for both.
Secondary: the customer or business owner who receives and signs the customer plan; KAIN, which monitors an unattended run and relays every question and action request to the developer's phone; the wxperts admin who edits the method in `mcp-server/src/prompts/` and redeploys the hosted MCP.

## Scope Boundary

In scope:

- The G.O.D. method served by the hosted MCP under `wxgod`, with eight reference documents served under path keys and fetched only when a step needs them.
- The kit shipping a stub skill, the three deterministic scripts, and the thin command — nothing else of the method.
- Plan mode: inventory, parallel intake, section-by-section review at the user's level, interview, deterministic estimate for every team size (quickest team and machine maximum), database and hosting recommendation, ERD with referential-integrity suggestions, and the four documents as Markdown and PDF.
- The build roadmap (START HERE orientation, phase exit gates, PDF renderer) folded in from the dev-plan skill; the `/dev-plan` alias for one release.
- New-project mode: overview review, optional brainstorm, design, review pause, then driving buildscope, validateScope, createSpecs, and implement with checkpoints and `--resume`.
- `--create`: executing the development plan phase by phase, unit by unit, to a built application.
- Lifting the kit's one-active-spec rule so the plan governs which units implement concurrently.
- Running under the Remote Session Bridge with KAIN as monitor and relay when the bridge is configured.
- The registry builder serving sub-documents by path, reusable by any future hosted skill.
- Defects in a run reported through the Cockpit feedback to the wxKanban Dev project.
- At the end of the brainstorm: one style type chosen for all screens from the named visual-style catalog or a company design system, recorded in `stack.md`; and, for every screen-bearing scope, the choice to design the screen with wxDesigner or let `/implement` build it. The design itself runs per scope after its `/createSpecs` and before its `/implement`; conversion screen evidence feeds it when present.
- *(Amendment B)* Parallel runs outside `--create`: one command implementing a list of scopes or specs in parallel, one worktree per unit (Orca when installed), fixed day and night windows, operator presence through the bridge, a live status file, and a Cockpit "Parallel Agents" panel.

## Out of Scope

- G.O.D. writing scopes, specs, tasks, test plans, or code itself. It only runs the real commands.
- Any change to how buildscope, validateScope, createSpecs, or implement interview, gate, or write. Their rules are inherited, not edited.
- Serving the scripts from the MCP. They stay on disk in the kit.
- A web-app or Cockpit surface for the plan documents. They are files in `docs/`.
- Moving the project from Design to Implementation. The user does that in the web app; G.O.D. waits.
- Per-scope stage progression (SCOPE-123) and any change to the SCOPE-081 server-side `devplan` document.
- A new approval model. KAIN's ask-to-verify gate and recorded grants (SCOPE-132) are used as they are.
- *(Amendment B)* Running agents on other machines (multi-machine dispatch); agents stay on the main system and wxHub and the phone only watch and answer.
- *(Amendment B)* The model router, provider policy, and metering (a separate brainstorm), and the Decision Memory ledger and Ask Gate (SCOPE-142).

## User Scenarios & Testing

### US1 — Plan for an existing system

A consultant runs `/wxG-O-D --customer="Acme Freight"` in a repo holding a WinDev conversion output
and the customer's documents. G.O.D. fetches the method, inventories the tree, runs the intake
helpers, reviews the four finding sections with the consultant at junior level, asks only the open
interview questions, and writes the customer plan, management plan, roadmap, and flows as Markdown
and PDF in `docs/`.

**Expected**: every finding carries a file citation or a confidence label; the estimate shows the
quickest team and the machine maximum with a recommendation; no secret value appears in any
document or in chat.

### US2 — Create an app from an overview

A developer runs `/wxG-O-D --create ProjectOverview.md`. G.O.D. reviews the overview, designs the
system, writes the plan documents and the scope map, and pauses once for the design review. On
approval it executes the development plan phase by phase: buildscope, validateScope, createSpecs,
implement with its test plan for each unit, independent units in parallel, with each unit's status
updated in the plan as it completes.

**Expected**: every pipeline command runs under its own gates; the roadmap shows live status; the
app builds to the last phase's exit gate; no artifact in `specs/` or `src/` was written by G.O.D.

### US3 — Unattended under the bridge

The same developer has the Remote Session Bridge configured and leaves the desk. G.O.D. offers to
run under the bridge, the developer accepts, and KAIN relays each gate question and each request for
an extra action to the phone, carrying the answer back.

**Expected**: the run continues between answers; `STATUS` reports the plan position; `CANCEL
REMOTE` stops it; a push is never made without a recorded grant.

### US4 — Resume after a cleared context

A long `--create` run checkpoints to `docs/GOD-State.json`; the developer clears the context and
runs `/wxG-O-D --resume`.

**Expected**: G.O.D. continues at the exact unit and gate it stopped at, with no unit repeated or
skipped.

### US5 — The method changes

A wxperts admin fixes a wording defect in a reference document under `mcp-server/src/prompts/wxgod/`
and redeploys the hosted MCP.

**Expected**: the next run on every subscriber's machine gets the fix with no kit update; a lapsed
subscriber gets a clear entitlement message and no method.

### US7 — Style once, design or build each screen

At the end of the brainstorm for a new project with four screen-bearing scopes, G.O.D. asks the
developer to pick a style type for the whole application; they choose "editorial". For each of the
four scopes it then asks: design the screen with wxDesigner, or let it build. The developer picks
design for two and build for two. Later, after `/createSpecs` has run for each of the two designed
scopes, G.O.D. runs wxDesigner; the developer iterates in the browser and SAVEs both `page.md` files.

**Expected**: `stack.md` records the editorial look and feel before any screen is designed or built;
wxDesigner runs only after each designed scope's specs exist, and before its `/implement`; the two
saved `page.md` files are what `/implement` builds from; the other two screens are derived from their
specs in the same style; after a `--resume` none of the four scopes is asked again.

### US6 — A defect in the run

A script fails, or the method contradicts itself mid-run.

**Expected**: G.O.D. stops at that step, states exactly what failed, and asks the developer to
report it through the Cockpit feedback, which lands in the wxKanban Dev project. It never improvises
around the defect, and the state file records the stop point so the run resumes after the fix.

### US8 — Parallel run outside `--create` (Amendment B)

At 10:00 a developer gives the parallel command three spec IDs, two independent and one that depends
on the first.

**Expected**: the two independent specs implement at the same time, each in its own worktree; the
dependent one waits for its predecessor's gate; the run ends with a summary of finished, parked, and
waiting-to-merge units.

### US9 — Night window (Amendment B)

A run is going at 17:55 with the user's cap of 2 on a machine whose maximum is 5. At 18:00 the cap in
force becomes 5 and new units start. One unit hits a possible-data-loss stop.

**Expected**: the cap changes without a restart; the data-loss stop still stops that unit; at 06:00
units already running finish, and no new unit starts beyond the user's cap.

### US10 — Remote from wxHub (Amendment B)

At 14:00 the developer leaves the desk and follows the run from a laptop through wxHub. The bridge
reports a live remote session.

**Expected**: the cap rises to the machine maximum while the session is live; the status shows the
window, the presence flag, the cap in force, and every unit's state; a parked question answered from
the room releases its unit; when the remote session ends, the cap returns to the user's cap.

## Functional Requirements

### Hosted delivery

**FR-001 — Method served by the MCP.** `project.get_command_prompt` with key `wxgod` returns the
full method; the kit holds no copy.
- The stub `SKILL.md` and the thin command contain no step of the method.
- A lapsed subscriber receives the entitlement refusal and nothing else.
- An unreachable MCP fails with the standard "MCP not connected" guidance, never a stall.

**FR-002 — References by path key.** Each reference document is served under
`wxgod/references/<name>` and fetched only when its step is reached.
- The registry lists the eight keys: `god-persona`, `new-project`, `review-and-brainstorm`,
  `document-templates`, `interview`, `database-options`, `data-integrity`, `flow-diagrams`.
- A plan-mode run never fetches `new-project`.
- A flat key such as `god-persona` resolves to nothing.

**FR-003 — Registry builder walks subfolders.** `mcp-server/scripts/build-prompts.mjs` keys any
`.md` under `src/prompts/` by its path, forward slashes, no extension.
- The registry test covers a nested key.
- The hosted build regenerates the registry on deploy (`prebuild`).

**FR-004 — Kit ships stub, scripts, and command.** `.claude/skills/wxG-O-D/` holds the stub and
`scripts/` (`inventory.mjs`, `machine-capacity.mjs`, `estimate-ai-time.mjs`); `_wxAI/commands` and
`.claude/commands` hold the byte-identical thin command.
- The sync allowlist ships exactly those files.
- A diff of the published release asset shows no `references/` folder and no method text.

### Plan mode

**FR-005 — Inventory decides the evidence.** `inventory.mjs` honors `.gitignore`, skips kit files
and build output, lists secret files by path only, and validates `--dir`.
- A missing `--dir` folder stops the run.
- `docs/GOD-Inventory.json` records every exclusion and why.

**FR-006 — Cited, labeled findings.** Every finding carries a file citation or one of Confirmed,
Likely, Assumed, Unknown, Conflicting, Deprecated; intake reports are saved verbatim under
`docs/GOD-Intake/`.
- A finding with neither is a defect.
- A cleared context loses no report.

**FR-007 — Review at the user's level, plain text.** The four finding sections are reviewed one at
a time at amateur, junior, or senior level, with no choice menus, and nothing is written until the
user approves a section summary.
- `docs/GOD-Scratchpad.md` mirrors the chat and nothing else.
- An approved summary records whether it goes to the plan only or to plan, scope, and specs.

**FR-008 — Deterministic estimate.** `machine-capacity.mjs` sets the machine maximum;
`estimate-ai-time.mjs` schedules every team size and reports the quickest team and the machine
maximum with a recommendation.
- The same input gives the same numbers; no duration is estimated by hand.
- A cycle or unknown dependency in the graph fails the run.
- `--cap=<n>` is the user's limit; `--cap=1` is the serial switch (see FR-018).

**FR-009 — Database, ERD, and documents.** The plan recommends one of internal office, cloud, or
distributed hosting with the database to match, draws the ERD with referential-integrity
suggestions, and writes the customer plan, management plan, roadmap, and flows as Markdown and PDF.
- All three hosting columns are filled before one is recommended.
- A Mermaid parse failure fails its render.
- No credential value or personal datum appears in any document or in chat.

### Roadmap fold-in

**FR-010 — G.O.D. owns the roadmap.** The judgment half of SCOPE-081 — the START HERE orientation,
per-phase exit gates, and the PDF renderer — moves under G.O.D.'s scripts and method.
- `/wxG-O-D` produces `docs/DEVELOPMENT-PLAN.md` and its PDF with no separate skill installed.
- SCOPE-081's server-side `devplan` document is unchanged.

**FR-011 — dev-plan retired from the kit.** The kit stops shipping dev-plan as its own skill;
`/dev-plan` becomes a thin alias that runs G.O.D.'s roadmap step for one release, then is removed.
- The help catalog and the Cockpit list the alias as deprecated with the replacement named.

### New-project mode and `--create`

**FR-012 — Overview review and brainstorm.** Given a ProjectOverview.md, G.O.D. reviews it, asks
whether the project is new, and offers to brainstorm first; `--brainstorm` skips the offer.
- Every brainstorm decision is in `docs/GOD-Brainstorm.md` with its date.
- Nothing is written during a brainstorm except the scratch pad.

**FR-013 — Design and scope map.** G.O.D. expands the overview into roles, data model and ERD,
screens, integrations, architecture, database, a scope map in build order, and one scope draft per
scope.
- Each feature is marked as stated by the user or proposed by G.O.D.
- `docs/GOD-Design-Summary.md` carries the numbered discussion list.

**FR-014 — `--create` executes the development plan.** After one design review pause, G.O.D. runs
the plan phase by phase and unit by unit in dependency order: buildscope, validateScope,
createSpecs, implement with its test plan, then the phase exit gate.
- No unit starts before its dependencies' gates pass.
- Each unit's status in the plan flips as the pipeline completes it; the plan is the progress record.
- The run ends at the last phase's exit gate.
- Without `--create`, an overview keeps today's behavior: G.O.D. asks whether the project is new and
  drives the pipeline only after the user says go.

**FR-015 — Orchestrates; under `--create`, completes the process (amended 2026-10-04).** In plan
mode and in new-project mode without `--create`, G.O.D. writes no scope, spec, task, test plan, or
code; it runs the real commands under all of their rules and gates, never answers a gate, never adds
`--quick`, and never pushes. Once `--create` starts, that is, once the user approves the design at
its one review pause, G.O.D. may run any command needed to complete the development process, and:
- It answers every command's gates itself (interviews, reuse checks, section approvals, coverage and
  filing confirmations, fix confirmations) from the approved design, and logs each answer with its
  source in `GOD-State.json` (`gateLog`). A decision the approved design does not cover is asked,
  never guessed.
- It uses the real commands first, so numbering, database records, cross-references, fences, and
  audit paths stay right. When a command fails or a known kit gap blocks it, G.O.D. writes or
  repairs the artifact itself the way the command would, logs it in `GOD-State.json` (`repairs`) and
  the management plan's Revision History, files the defect with `project.submit_feedback`, and keeps
  going.
- It commits each finished unit and each passed phase exit gate locally. Starting `--create` is the
  user delegating commit timing; it covers commits only, and never includes changes that were in the
  tree before the run started.
- It never pushes, never deploys, and never touches a production database, host, or account. Those
  stay with the user; under the bridge a push still needs KAIN's recorded grant (FR-021).
- It never signs off a human test. A tester's sign-off is an attestation, not a command gate.
- It does not move stages by hand. Each scope advances on its own as its tasks and tests clear
  (SPEC-123); G.O.D. reads `project.scope_stage` and works each blocker.
- Every artifact in `specs/` and `src/` was authored by its own command, or is listed in `repairs`.

**FR-016 — Checkpoint and resume.** Long runs save `docs/GOD-State.json` at each unit and gate and
ask the user to clear the context and run `--resume`.
- Resume continues at the exact unit and gate.
- No unit is repeated or skipped.

### Parallel implementation

**FR-017 — Implement verifies the named spec.** The kit's spec verification
(`wxkanban-agent/core/policy/resolve-spec-verification.ts`) checks the spec being implemented, by
number, instead of requiring exactly one spec in `planned`, `tasks_generated`, or `implementing`
across the project.
- Two specs in `implementing` do not block either.
- A spec with no tasks or no documents still blocks.
- SPEC-030 FR-004 is amended to say so; its unit test changes with it.

**FR-018 — The plan governs concurrency.** G.O.D. runs independent units in parallel up to the
machine maximum and the user's cap, and holds dependent units until their predecessors' gates pass.
- Two units that share a dependency edge never implement at the same time.
- The estimate's team-size sweep and the actual run use the same dependency graph.
- `--cap=1` forces serial implementation; no new flag.
- Read-only helpers (step 4 intake, business-rule slices, new-project verification tables, roadmap
  gathering) are not implementation units. They run at most 5 at once and never more than the
  user's cap (`--cap`, T5). The machine maximum does not limit them: it models the local build,
  test, browser, and Docker load, which they never create. *(Amended 2026-10-10, feedback
  053e872b.)*
- From 18:00 to 06:00, or while the operator is remote, the cap in force is the machine maximum
  even when the user's cap is lower (FR-027, FR-028). *(Amended 2026-10-22, Amendment B.)*

### Bridge and KAIN

**FR-019 — Runs under the bridge when configured.** When the repo `.env` carries the SCOPE-102 room
settings and the launcher exists, G.O.D. offers to run unattended under the Remote Session Bridge;
otherwise it runs in the editor with checkpoints.
- The offer is made once per run; declining changes nothing.
- **Amended 2026-10-28 (SCOPE-149 FR-018, SPEC-150):** the plain bridge and its `.env` room keys are retired.
  G.O.D. now offers when `.wxai/remote-session.lock` names a project agent, and on yes hands the run over with
  HANDOFF REMOTE (next step `/wxG-O-D --resume`), which the project agent runs on the operator's go.

**FR-020 — G.O.D. drives, KAIN relays.** KAIN monitors the run and relays every question and every
request for an extra action to the developer's phone, carrying the answer back; it never answers for
them and never takes the plan over.
- `STATUS` reports the plan position (phase, unit, gate).
- One driver per working tree, per SCOPE-132 FR-026.

**FR-021 — Inherited bridge rules.** Minimal seed, `CANCEL REMOTE` as kill switch, and no push
without a recorded grant through KAIN's gate apply unchanged.
- A push attempt without a grant is refused and reported, never retried silently.

### Style and screens (end of the brainstorm, before the build)

**FR-023 — One style type for all screens, chosen before any is designed.** At the end of the
brainstorm, before the plan is approved for building, G.O.D. offers a choice of style type for the
whole application from the catalog of named visual styles the design skill ships (bento, brutalism,
glassmorphism, neumorphism, material, shadcn, editorial, and the rest), or a design system the
company has already picked (SCOPE-114). The choice is recorded in the project's Stack & Style
document (`stack.md` Look & Feel, SCOPE-047) so every screen, designed or built, follows it.
- The choice is asked once per run, before the first screen is designed or built.
- Declining keeps the current `stack.md` look and feel; nothing else changes.
- wxDesigner designs within the chosen style's tokens; `/implement` builds within them.

**FR-024 — Design or build, per screen-bearing scope: choose at the brainstorm, design after
createSpecs.** For every scope in the plan that creates a page or screen, G.O.D. asks at the end of
the brainstorm whether the screen will be **designed** with the **wxDesigner** skill or **left to
build**. The design itself runs after `/createSpecs` for that scope and before its `/implement`,
because wxDesigner reads the real scope and its implementing specs and writes
`specs/<NNN-name>/page.md` into the spec folder. The user previews in the browser, iterates, and
SAVEs or DISCARDs. "Let it build" means `/implement` derives the screen from the spec and the chosen
style.
- Every screen-bearing scope gets the choice; a scope with no screen is not asked.
- wxDesigner never runs before the scope's specs exist; it runs once per designed scope, between
  createSpecs and implement.
- In a conversion, the screen evidence already exists (`pre-convert/*.controls.md`,
  `rebuild/pages/*.tsx`); G.O.D. notes those paths against the scope and wxDesigner starts from them.
  It is still run per scope, after that scope's specs are created.
- A saved `page.md` is what `/implement` builds from; a DISCARD or "let it build" leaves the screen to
  `/implement`.
- The per-scope choice, the design outcome, and any saved `page.md` path are recorded in the scope
  map and the state file, so `--resume` does not ask again.
- wxDesigner runs under all of its own rules: scope and spec as input, the project's theme tokens
  only, and never a write into `src/`.

### Parallel runs outside `--create` (Amendment B, 2026-10-22)

**FR-025 — Parallel entry point.** One command takes a list of scope or spec IDs and implements them
in parallel (for example `/wxParallel 142 143 --cap=3`; the final name is decided at createSpecs). It
uses FR-018's dependency rules and cap, one worktree and branch per unit, and Amendment A's decision
queue for blockers, and ends with a summary of what finished, what is parked, and what is waiting to
merge.
- Two independent IDs run at the same time; two dependent IDs never overlap.
- A parked unit does not stop the others.
- It works without `--create` and without a development plan; the dependency edges come from the
  scopes' `Depends On`.

**FR-026 — Orca worktrees.** Kit scripts create one Orca worktree per unit, linked to its task. When
Orca is not installed, plain git worktrees are used and the run still works.
- The run succeeds with Orca absent.
- Orca's install steps, Windows support, and license (MIT) are verified at createSpecs.
- Orca is used as a tool; no Orca code ships in the kit.

**FR-027 — Fixed time windows.** The day window is 06:00 to 18:00 local time and the night window is
18:00 to 06:00. These times are fixed, not a setting. In the day window the cap in force is the
user's cap (bounded by the machine maximum) and the run reports the share of agents working against
the 70% target. In the night window the cap in force rises automatically to the machine maximum.
- At 18:00 the cap changes without a restart.
- At 06:00 running units finish; no new unit starts beyond the user's cap.
- Hard stops are unchanged in both windows: possible data loss, Impact Boundaries, and the push gate.

**FR-028 — Operator presence.** While the SCOPE-102 bridge has a live remote session, from the phone
or wxHub, the run is treated as unattended and the cap in force rises to the machine maximum, as at
night. Agents stay on this machine; wxHub and the phone watch and answer only.
- Ending the remote session in the day window returns the cap to the user's cap.
- The status shows who set the presence flag (bridge or night window).

**FR-029 — Status file.** `docs/GOD-Parallel-Status.md` is rewritten each time a unit starts, parks,
or finishes. Its header shows the active window, the presence flag, the cap in force, and the
working and parked counts; it has one row per unit with its agent, worktree, state, and the question
it is parked on. A status command prints it, and the bridge relays it to the phone and wxHub.
- The file reflects a state change within 10 seconds.
- It holds no secret value and no customer contact detail.

**FR-030 — Cockpit "Parallel Agents" panel.** A command, a status-bar item, and a web panel beside the
editor render the status file, following the Change Impact panel's pattern
(`vscode-extension/src/providers/impactViews.ts`), and refresh when the file changes. Shipping it
needs a VSIX release.
- The panel opens from the command and from the status bar.
- It updates within 10 seconds of the file changing.

### Defects

**FR-022 — Stop and report.** On a script failure or a contradiction in the method, G.O.D. stops at
that step, states what failed, and asks the developer to report it through the Cockpit feedback,
which lands in the wxKanban Dev project (SCOPE-043).
- No improvised workaround.
- The state file records the stop point so the run resumes after the fix.
- Under `--create` (amended 2026-10-04), a failing pipeline command or a known kit gap is not a stop:
  G.O.D. repairs, logs, and reports it as FR-015 says, and the run continues. A failure of G.O.D.'s
  own scripts, or a contradiction in this method, still stops the run.

## Data Requirements

None. No new table. The run's state lives in `docs/GOD-State.json` and the plan documents, on
purpose: the plan is a file the customer and the developer both read.

## API Routes

None new. `project.get_command_prompt` is unchanged; its key space grows by `wxgod` and the eight
path keys. Its tool description in `mcp-server/src/server.ts` lists `wxgod` (one-line edit).

## Frontend Components

None in the web app. The Cockpit help catalog (`vscode-extension/src/services/helpCatalog.ts`)
gains the dev-plan deprecation note and keeps the existing `/wxG-O-D` entry. *(Amendment B)* The
Cockpit gains the "Parallel Agents" command, status-bar item, and web panel (FR-030), and a help
catalog entry for the parallel command.

## Key Entities

- **Development plan** — `docs/DEVELOPMENT-PLAN.md`: the build roadmap, and under `--create` the execution schedule and progress record.
- **Unit** — one scope in the plan's build order; carries its phase, dependency edges, and pipeline status.
- **Checkpoint** — `docs/GOD-State.json`: mode, level, current phase, unit, gate, and next action.
- **Hosted method** — the `wxgod` prompt and its eight reference documents in the MCP registry.
- **Stub skill** — the shipped `.claude/skills/wxG-O-D/` with `SKILL.md` and `scripts/` only.
- **Parallel status** *(Amendment B)* — `docs/GOD-Parallel-Status.md`: window, presence flag, cap in force, working and parked counts, and one row per unit.
- **Window** *(Amendment B)* — day (06:00–18:00 local) or night (18:00–06:00); fixed times.
- **Presence flag** *(Amendment B)* — set while the bridge has a live remote session or the night window is active; raises the cap to the machine maximum.

### Files affected

- `mcp-server/src/prompts/wxgod.md`, `mcp-server/src/prompts/wxgod/references/*.md` (the method; the only copy) — `new-project.md` § N6b carries the style choice and the design-or-build choice (FR-023, FR-024)
- `mcp-server/scripts/build-prompts.mjs`, `mcp-server/tests/prompts/registry.test.ts`
- `mcp-server/src/server.ts` (tool description, one line)
- `.claude/skills/wxG-O-D/SKILL.md` (stub), `.claude/skills/wxG-O-D/scripts/*.mjs`
- `.claude/commands/wxG-O-D.md`, `_wxAI/commands/wxG-O-D.md` (byte-identical)
- `.claude/skills/dev-plan/` (folds into G.O.D.; alias for one release)
- `wxkanban-agent/core/policy/resolve-spec-verification.ts` and its test (FR-017)
- `vscode-extension/src/services/helpCatalog.ts`
- `wxkanban-agent/CHANGELOG.md`
- *(Amendment B)* the parallel command (both command mirrors), kit worktree scripts (Orca or git), `docs/GOD-Parallel-Status.md` writer, the bridge relay of the status, and `vscode-extension/` (new panel beside `src/providers/impactViews.ts`)

## Success Metrics

1. A kit release asset contains 0 lines of the G.O.D. method: the stub, 3 scripts, and the command only, verified by diffing the published archive.
2. A method fix edited in the MCP prompt tree reaches a subscriber's next run within 1 deploy and 0 kit updates.
3. In a plan-mode run on a real conversion repo, 100% of findings carry a citation or a confidence label, and 0 secret values appear in the documents or the chat, checked by the redaction scan.
4. The estimate is reproducible: the same `GOD-Estimate-Input.json` yields a byte-identical `GOD-Estimate.md` on 2 consecutive runs.
5. A `--create` run on a test overview reaches the last phase exit gate after the one design review pause, with 100% of scopes, specs, and tasks authored by their own command or listed in the run's `repairs` log, 100% of gate answers in `gateLog`, the development plan's unit statuses matching the pipeline's records at the end, 0 unlogged hand-written artifacts, and 0 pushes.
6. With 2 independent units in one phase, both reach `implementing` at the same time and neither is refused by the kit, while 2 dependent units never overlap.
7. A `--resume` after a cleared context continues at the recorded unit and gate in 100% of trials, with 0 repeated or skipped units.
8. Under the bridge, 100% of the questions G.O.D. asks reach the phone and the run continues after the answer, and a push without a grant is refused in 100% of attempts.
9. *(Amendment B)* From 06:00 to 18:00, at least 70% of agents are working (not parked) during a parallel wave, read from the status file.
10. *(Amendment B)* At night or while the operator is remote, the cap in force reaches the machine maximum in 100% of trials, with 0 hard stops bypassed.
11. *(Amendment B)* The status file and the Cockpit panel show a unit's state change within 10 seconds in 100% of trials, and a parallel run with Orca absent completes in 100% of trials.

## Integration Context

- Aligns with SCOPE-019's hosted command prompts: same `project.get_command_prompt` path, same stub shape, same MCP-unavailable guidance.
- Extends SCOPE-081: the judgment half of dev-plan moves here; the deterministic server `devplan` stays.
- Extends SCOPE-102 and SCOPE-132: the bridge is the runtime for an unattended run; KAIN is monitor and relay; its gate, seed policy, and one-driver rule are inherited.
- Amends SPEC-030 FR-004 (FR-017 here).
- Uses SCOPE-043's feedback channel for run defects.
- Follows SCOPE-093's read-on-demand rule for references.
- Uses the wxDesigner skill as it is for per-screen design (FR-024); its SAVE writes `specs/<NNN-name>/page.md`, which `/implement` already consumes.
- Writes the chosen style type into `stack.md` Look & Feel through the Stack & Style document (SCOPE-047), so `buildscope`, `createSpecs`, and `implement` pick it up through their existing `stack.md` injection; a company design system from SCOPE-114 is an accepted source for that choice.

## Constraints

- The method is edited only in `mcp-server/src/prompts/`. Any copy of the method that reappears under `.claude/skills/` is a defect, because it drifts and ships.
- A hosted MCP redeploy is needed before subscribers receive the `wxgod` prompt, and before any later method change. Until then the stub refers to a key the server does not serve.
- The hosted MCP is reachable at the start of every run. There is no offline copy, by design.
- References are fetched one at a time when a step needs them. Fetching all eight at once (about 130 KB) is prohibited by the method.
- Scripts stay on disk and stay plain Node with no dependencies.
- The estimate is machine-specific. When the agents will run elsewhere, the user sets the maximum by hand (interview T5).
- G.O.D. never pushes. Under the bridge a push reaches KAIN's gate and needs a recorded grant.
- Under `--create`, G.O.D. commits locally, per unit and per phase gate, and nothing else in git.
- Only one driver per working tree (SCOPE-132 FR-026).
- *(Amendment B)* Agents run only on the main system. The window times are fixed at 06:00 and 18:00 local time, not a setting.

## Risks

- **Silent rollback of the MCP deploy** has happened before. Mitigation: after deploy, probe `get_command_prompt` with `wxgod` and one reference key before announcing the release.
- **Lifting the one-active-spec rule** removes a guard SPEC-030 added on purpose. Mitigation: the per-spec check still blocks a spec with no tasks or documents, and the plan's dependency graph is the new guard against collisions.
- **Two drivers on one tree.** Mitigation: G.O.D. is the only driver; KAIN relays; SCOPE-132 FR-026 refuses a second session.
- **`--create` runs for hours.** Mitigation: checkpoints at every unit and gate, and the bridge for unattended answers.
- **G.O.D. answers the gates under `--create`,** so a wrong answer carries into later units. Mitigation: answers come only from the approved design, each is logged with its source, a decision outside the design is asked, the user can stop the run at any time, each unit is a local commit that can be rolled back, and nothing reaches production without the user's push.
- **A method copy reappears on disk** (an author restores the full skill for convenience). Mitigation: the constraint above, the release-asset diff in SC-1, and the delivery-map note in the kit docs.

## Compliance Requirements

SOC 2 is active for this project. Design-phase controls that bear on this scope:

- **CC6.1 Authentication and authorization design** — access to the method is the entitlement check on `project.get_command_prompt`; the scripts and stub carry no credential and check nothing themselves.
- **CC6.1 Secrets management** — secret files are listed by path and never opened; no value appears in any document or chat; conversion credential tokens stay as tokens.
- **CC7.2 Audit trail of all changes** — every scope, spec, task, and code change made during `--create` is authored by its own command and recorded by that command's existing audit path, or is a repair logged in `GOD-State.json` (`repairs`); every gate G.O.D. answers is logged with its source (`gateLog`); each unit is a local commit; `GOD-State.json` and `GOD-Brainstorm.md` record who approved what and when.
- **CC8.1 Review approval before merge; formal change management** — in a `--create` run, the user's approval of the design (`planApprovedAt`) is the change approval: G.O.D. answers command gates within it and asks anything outside it. It commits locally and never pushes or deploys; a push needs the user, and under the bridge KAIN's recorded grant. Without `--create`, every gate stays with the command that owns it.
- **CC5.2 Separation of duties** — the developer approves the design and pushes, G.O.D. executes within that approval, testers sign off human tests, and KAIN relays but cannot approve.
- **CC3.2 Threat modeling for new capability** — the unattended `--create` run under the bridge is the new capability; the kill switch, the one-driver rule, and the push gate are its controls.
- **P1.1 Privacy** — customer documents cite personal data by location only.

## Notes

- The G.O.D. method and the stub were restructured on 2026-10-03 in the working tree, uncommitted at authoring time: method to `mcp-server/src/prompts/wxgod*`, stub + scripts under `.claude/skills/wxG-O-D/`, thin command in both mirrors, registry builder recursion, registry test, CHANGELOG entry. This scope records that work and extends it (FR-001 to FR-004 are done; the rest is new).
- `--cap=1` on `machine-capacity.mjs` is the serial switch for FR-018; no new flag.
- The `/dev-plan` alias lives for one kit release, then goes.
- The kit is only ever downloaded by a subscriber, so hosted delivery is not about keeping the method from non-subscribers. It is about a lapsed subscription ending access on the next run, and a method fix reaching everyone without a kit update.

## Open Questions

- Whether the `/dev-plan` alias should emit a deprecation line in the Cockpit on first use, or only in the help catalog. Decide at createSpecs.

## Clarifications

### Session 2026-10-03

| # | Question | Decision |
|---|----------|----------|
| 1 | Who is the actor — consultant, customer developer, or both? | Both, as the subscribed kit user; the command behaves the same for each. The customer receives the documents unless they hold their own subscription. |
| 2 | Is hosted delivery about non-subscribers? | No — there is no download without a subscription. It is about lapsed subscriptions losing access on the next run and fixes reaching everyone without a kit update. |
| 3 | Where do run defects go? | Through the Cockpit feedback to the wxKanban Dev project (SCOPE-043). G.O.D. never works around a defect. (Amended 2026-10-04, decision 12: under `--create`, a failing command or kit gap is repaired, logged, and reported, and the run continues.) |
| 4 | Does the dev-plan skill fold into G.O.D.? | Yes. G.O.D. manages the development process; the roadmap and renderer move under it; `/dev-plan` is an alias for one release. |
| 5 | Does G.O.D. run under KAIN / the Remote Session Bridge? | Yes, when configured. G.O.D. runs the show; KAIN monitors and relays questions and action requests to the developer. |
| 6 | Is there a `--create` flag? | Yes. It designs, pauses once for review, then executes the development plan phase by phase to a built app. |
| 7 | Accept the kit's one-active-spec limit or lift it? | Lift it. Implement verifies the named spec; the development plan maintains the separation between units (FR-017, FR-018). |
| 8 | A `--serial` flag? | No. `--cap=1` on the capacity script already does it. |
| 9 | Learnings file and Cockpit help entry? | Learnings file stays in; the existing help entry is enough. |
| 10 | Screens: designed or built? (added after the first filing, 2026-10-03) | Before any screen, one style type for all screens, picked from the named visual-style catalog or a company design system and recorded in `stack.md`. Then, for every screen-bearing scope, the user chooses: design it with wxDesigner, or let `/implement` build it. The choice is taken at the brainstorm; wxDesigner itself runs after that scope's `/createSpecs` and before its `/implement`, since it reads the real scope and specs and writes `page.md` into the spec folder. In a conversion the existing screen evidence feeds it, but it is still run per scope (FR-023, FR-024, US7; corrected 17:40). |

### Session 2026-10-04 — `--create` completes the process (amends FR-015, FR-022)

Andy: "once the --create starts it can create and run any command to complete the development process."

| # | Question | Decision |
|---|----------|----------|
| 11 | Under `--create`, who answers each command's approval gates? | G.O.D., from the design the user approved at the review pause. Each answer is logged with its source; only a decision the design does not cover is asked (FR-015). |
| 12 | May G.O.D. write scopes, specs, tasks, and code itself? | Commands first. When a command fails or a kit gap blocks it, G.O.D. writes or repairs the artifact itself the way the command would, logs it, reports the defect, and keeps going (FR-015, FR-022). |
| 13 | Does "any command" include git? | Commits yes, push no. G.O.D. commits each finished unit locally and never pushes, since a push deploys to production (FR-015). |

### Session 2026-10-10 — read-only helpers are not bound by the machine maximum (amends FR-018)

Feedback 053e872b: on an 18 GB machine the machine maximum computed to 1, so step 4 intake ran one helper at a time across 9 areas, although its helpers run no builds or tests.

| # | Question | Decision |
|---|----------|----------|
| 14 | Does the machine maximum limit read-only helpers? | No. It models local build, test, browser, and Docker load. Read-only helpers run at most 5 at once (FR-018). |
| 15 | Does the user's `--cap` still limit them? | Yes. A cap is often set for plan usage limits, and helpers use the plan too (FR-018). |

### Session 2026-10-18 — brainstorms through wxBrainstorm; smoke test now, full test overnight

Owner request: "remove the current brainstorm and add in the skill created for wxBrainstorm; update the testing criteria to be a smoke test and schedule the full testing overnight after the full wxCreateTestPlan has been run."

| # | Question | Decision |
|---|----------|----------|
| 16 | Who runs G.O.D.'s brainstorms? | The wxBrainstorm skill (`.claude/skills/wxBrainstorm`), embedded; G.O.D.'s own brainstorm rules are removed. Decisions are recorded in `docs/brainstorms/` and indexed in `docs/GOD-Brainstorm.md` (SPEC-136 FR-035). |
| 17 | What testing runs during the drive, and when does the rest run? | A smoke test (Gate 1) during the drive; the full test overnight through SCOPE-140, scheduled once every scope's full test plan is filed, with the first night running every machine item (SPEC-136 FR-036). |
| 18 | When is the brainstorm offered? | Only after G.O.D. has looked through everything; then it asks whether the user wishes to brainstorm and lets them choose the topics, or continue (owner, 2026-10-18; SPEC-136 FR-035). |

### Session 2026-10-22 — Amendment B: parallel runs outside `--create`

From `docs/brainstorms/2026-10-22-parallel-build-agent.md`. Owner: "any developer that has more work to do than he can do with 1 agent."

| # | Question | Decision |
|---|----------|----------|
| 19 | Who is parallel running for? | Any developer with more work than one agent can do, not only `--create` users. A parallel entry point reuses FR-018's machinery (FR-025). |
| 20 | Orca in the first release? | Yes, as the worktree console when installed; plain git worktrees otherwise (FR-026). |
| 21 | Does the 70% working target always apply? | Only from 06:00 to 18:00. From 18:00 to 06:00 parallelism can expand as needed (FR-027). The times are fixed, not a setting (owner, 2026-10-22). |
| 22 | Does a remote operator change the cap? | Yes. A live remote session through the bridge, phone or wxHub, raises the cap like the night window; the agents stay on the main system (FR-028). |
| 23 | Expand to what? | The machine maximum, automatically, not a limit the owner sets (FR-027, FR-028; amends FR-018). |
| 24 | How are the agents and their work shown? | A status file rewritten on every unit change, relayed by the bridge, and a Cockpit "Parallel Agents" panel in the first release (FR-029, FR-030). |
