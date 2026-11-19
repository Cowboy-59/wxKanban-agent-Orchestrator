# implement — Execute Spec Implementation Tasks

## Purpose
Execute implementation tasks for a spec using the MCP Project Hub. This command orchestrates the implementation phase: validates the spec, executes tasks, updates task status, and generates progress reports.

## Stack & Style targeting (SPEC-056)
**Before generating any code, read `stack.md` at the repo root if it exists.** When present, generate code that targets the project's captured stack and design/CSS style — backend language/framework, frontend framework, database, styling/component library, testing framework, hosting/deploy target, and the design tokens (colors, typography, spacing/radius). Use those choices, **not** wxKanban's own Express/React/Postgres/Tailwind defaults.

If `stack.md` does **not** exist, proceed exactly as today — no change in behavior, and never emit a placeholder or block on the missing file. `stack.md` is materialized from the project's Stack & Style document by the kit (the web walkthrough / `/buildstack` writes the document; the kit writes the file on project open); do not hand-edit it here — use `/buildstack` to change it.

## Model per subagent (SPEC-143 / T022)
The main session runs on whatever model the user chose, usually the most expensive one. Hand the
large pieces of work to subagents on the cheapest model that does them well, and keep the small
steps where they are: a subagent starts cold, so briefing one for a two-call step costs more than
the step itself.

**What runs where**

| Phase | Runs in | Model |
|-------|---------|-------|
| 1 Validate spec | main session | — |
| 2 Execute tasks | a subagent per easy or moderate task; heavy tasks in the main session | by difficulty, below |
| 3 Report | main session | — |
| 4 Advisory review | one subagent per track | Sonnet; Opus when the diff is heavy |
| 4b Conversion parity | one subagent | Sonnet |
| 5 Test plan | subagents for the drafting and the item bodies; the gates in the main session | Sonnet |
| 5b Seed | one subagent | Sonnet; Opus when an adapter must be generated |
| 6, 6b Feedback, bug-trapping offer | main session | — |

**Choosing the model**

- [ ] Classify the work with `node _wxAI/routing/difficulty.mjs --files <n> --criteria <n> --touches <list>`
  (add `--new-logic-with-tests` when the task adds branching logic that ships with tests).
  `--touches` names any of `security`, `auth`, `money`, `schema`, `migration`, `production` the
  task touches. The class is `easy`, `moderate` or `heavy`, with the reasons.
- [ ] Resolve the model with `node _wxAI/routing/tiers.mjs --difficulty <class>`. It honors the
  project's override in `decisions/settings.yaml`. Pass the Agent tool the family alias in the
  resolved id (`haiku`, `sonnet`, `opus`), not the full id.
- [ ] A `heavy` class runs in the main session, not in a subagent on Opus: the main session already
  holds the context.
- [ ] **Show the plan before launching anything**: one line per unit of work with its class, the
  reasons and the model.
- [ ] Log each choice, one event per subagent:
  `node --input-type=module -e "import { appendRoutingEvent } from './_wxAI/routing/tiers.mjs'; appendRoutingEvent('.', { event: 'model-choice', taskid: '<Tnnn or phase>', command: 'implement', to: '<class> (<model id>)', reason: '<reasons>', evidence: 'difficulty.mjs' })"`.
  Record the model from the tool's output, never from what a model says about itself.

**What every subagent brief carries.** A subagent sees only its brief. Give it the task text, the
spec's FRs it serves, `stack.md`, the files it may touch, and the house rules: no `any`, Pino not
`console.log`, the code-fence convention, US spelling. Ask for a summary back — files changed, tests
run with their result, anything blocked — not file contents.

**How many at once.** Code-writing subagents (Phase 2) run one at a time unless `--cap=<n>` allows
more; they share a working tree and a test run. Read-only subagents (Phases 4 and 4b) run at most 2
at once. Neither ever exceeds `--cap`. The cap limits how many run together, never which model each
one uses: under `--cap=1` every subagent still runs on its own model, one after another.

**What a subagent never does:** run git or push, write to a production database, or ask the user
anything. **Every approval gate in this command stays in the main session.**

**Fallback.** If the routing scripts cannot run, the resolved model is not one the subagent tool
accepts, or the AI client has no subagent tool, run that phase in the main session exactly as
before, and say so in one line.

## Usage
```bash
{{ai_config_dir}}/implement {{spec-number}} [options]
```

## Arguments
- `spec-number` (required): Spec number to implement (e.g., `017`)
- `--dry-run` (optional): Validate without making changes
- `--task-filter` (optional): Filter tasks by status (e.g., `todo`, `in_progress`)
- `--auto-complete` (optional): Automatically mark completed tasks
- `--cap=<n>` (optional): the most subagents this run may use at once — the same flag and meaning as
  `/wxG-O-D`, which passes its own cap when it runs implement. `--cap=1` makes the run serial.

## MCP Tools Used
- `project.list_open_items` — Get spec tasks and documents
- `project.update_task_status` — Update task progress
- `project.capture_event` — Log implementation events

## Implementation Phases

### Phase 1: Validate Spec
- [ ] Call `project.list_open_items` to get spec details
- [ ] Verify spec exists and is in implementation phase
- [ ] Check for any blocking dependencies

### Phase 2: Execute Tasks
- [ ] List all tasks for the spec
- [ ] Filter by status if `--task-filter` provided
- [ ] Classify every task and show the plan (see *Model per subagent*). Count the files from the
  paths the task names in `tasks.md`, and the acceptance criteria from its detail and the FRs it
  serves.
- [ ] For each task:
  - Call `project.update_task_status` to mark `in_progress`
  - **Set the active task (SPEC-143 / T037, FR-026)** before launching anything for it:
    `node _wxAI/routing/active-task.mjs --set <Tnnn> --session <this session's id>`. This is how a
    subagent's agent-run record ends up carrying `taskid` — the capture hooks have no other way to
    learn it.
  - Execute implementation logic — in a subagent on the resolved model for an `easy` or `moderate`
    task, in the main session for a `heavy` one
  - Task subagents run one at a time. With `--cap=<n>` above 1, up to n tasks marked `[P]` that
    share no file may run in parallel; every other task runs in order
  - After each subagent returns, the main session checks its work: run `wxkanban-agent auditfences`
    on the files it touched and run the tests the task names
  - **Escalate after two failed test cycles**: move the task up one tier and run it again with
    `node --input-type=module -e "import { escalateTask } from './_wxAI/routing/tiers.mjs'; console.log(JSON.stringify(escalateTask({ root: '.', taskid: '<Tnnn>', command: 'implement', tier: '<class>', failedTestCycles: 2 })))"`,
    which logs the escalation; a task that reaches `heavy` continues in the main session
  - On completion, mark as `done`
  - Capture any blockers as `blocked`
  - **Clear the active task** once the task is `done` or `blocked`:
    `node _wxAI/routing/active-task.mjs --clear --session <this session's id>` — so a later,
    unrelated task (or idle time) is never misattributed to this one

### Phase 3: Generate Report
- [ ] Calculate completion percentage
- [ ] Generate implementation summary
- [ ] Call `project.capture_event` with all five required fields — `projectId`,
      `type`, `source`, `actor`, `rawContent`. Omitting `source` or `actor` fails
      validation before `type` is even reached.
  - `projectId`: the project UUID
  - `type`: "spec_implementation_progress"
  - `source`: "cli" (or "vscode" when run from the Cockpit)
  - `actor`: the user or system running the implement command
  - `rawContent`: Implementation summary
  - `specId` (optional): the spec UUID, so the report is traceable to its spec

### Phase 4: Advisory Review (wxUIUXCodeReview)
After the implementation report, run an **advisory** combined code + UI/UX review over
the changes this run produced — it never blocks completion; implement is already reported done.

- [ ] Scope the review to the files/tasks changed by this implement run (the diff), not the whole repo.
- [ ] Run the `wxUIUXCodeReview` command: call `project.get_command_prompt` with `{ "command": "wxuiuxcodereview" }` and follow the returned methodology against those changes. If unavailable, fall back to the `wxUIUXCodeReview` skill under `.claude/skills/wxUIUXCodeReview/`, which ships with the kit and carries the same methodology. If neither is available, say so plainly and skip Phase 4; never improvise a review from memory or report one as if the methodology had been applied.
- [ ] **Declare this is an auto-run** so the review applies its diff-bounded dimension set (see *Dimension scope by invocation* in that methodology). The repo-wide dimensions — wiring/reachability, test-suite validity, claim-vs-code, and defaults & first-run — are **not** run here: they need searches beyond the diff and surface mostly pre-existing findings, which would reprint on every implement run. They belong to an explicit `/wxUIUXCodeReview` or `/wxUIUXCodeReview --audit`.
- [ ] Run the track(s) that match the diff: the code track always; the UI/UX track only when the run touched frontend files (`.tsx`/`.jsx`/`.css`/Tailwind/shadcn). Use a static UI review — do not launch the app here.
- [ ] Run each track in its own subagent on Sonnet, in parallel unless `--cap=1`. Run the code track on Opus when the diff touches security, auth, money or schema. Each brief carries the methodology, the diff and the auto-run declaration; each returns its findings only.
- [ ] Print the review findings (ordered by severity: must-fix / should-fix / nit) after the implement report.
- [ ] Do **not** auto-apply fixes, edit code, restyle, or mark tasks blocked based on the review — surface findings for the user to act on. must-fix findings are called out prominently but do not fail the run.

### Phase 4b: Conversion parity audit (wxConversionParity) — conversion projects only
If this project is a legacy conversion, audit the element this scope rebuilt against its original
**before** the test plan is authored, so parity findings — especially dropped defaults — become
coverage instead of arriving after the plan is written.

- [ ] **Guard 1 — is this a conversion?** If `pre-convert/` does not exist at the repo root, skip this
  phase **silently** and continue to Phase 5. Most projects are not conversions; do not announce a skip.
- [ ] **Guard 2 — is the element complete?** Determine the scope this spec implements (same lookup as
  Phase 5). Parity compares a *whole* legacy element, so run it only when **every spec implementing
  that scope** is done — read the scope's `**Implemented By**` list, not just this spec's status. A
  scope can fan out to several specs (SCOPE-045 → SPEC-046…050), and auditing after only one of them
  reports not-yet-built behavior as regressions. If other specs are outstanding, say so in one line
  and skip.
- [ ] Run the parity audit scoped to **this scope's element only**: call `project.get_command_prompt`
  with `{ "command": "wxconversionparity" }` and follow the returned methodology. Do not sweep the
  whole app here — a full sweep is an explicit `/wxConversionParity` run.
- [ ] Both guards run in the main session. The audit itself runs in one subagent on Sonnet, in
  parallel with Phase 4 when the cap allows; its brief carries the methodology and the element, and it returns the
  findings only.
- [ ] Surface the result after the review findings: regressions by severity, the **dropped defaults**
  table, and any regression candidates that need a decision.
- [ ] **Advisory and non-blocking** — implement is already reported done. Do not restore behavior, edit
  code, mark tasks blocked, or resolve a regression candidate on the user's behalf.
- [ ] Carry confirmed regressions and dropped defaults into Phase 5 as test-plan input.

### Phase 5: Create / Refresh the Test Plan (wxCreateTestPlan)
After the review, create or refresh the **scope's** test plan so the implemented behavior has
requirement-traceable coverage. This is **advisory and non-blocking** — implement is already reported
done — and runs in **PLAN mode only** (it does not `--Execute`; running the signoff gates is a
separate, explicit user action).

- [ ] Determine the **scope** this spec implements: read the spec's `Implements SCOPE-NNN` line (or the
  scope whose `**Implemented By**` lists this spec). Fall back to the spec number if no scope is found.
- [ ] Invoke the test-plan command with the scope as its parameter:
  `/wxCreateTestPlan SCOPE-<n>` (requirement-driven — it derives items from the scope's spec `FR-###`,
  runs the deterministic inventory + **database schema analysis**, and files the plan into wxKanban).
- [ ] Respect that command's own gates — it **stops at its Phase-2A coverage summary for approval**
  before writing item bodies; do not auto-approve volume on the user's behalf.
- [ ] Surface the coverage summary + schema-analysis referential-integrity score after the review
  findings. Do **not** execute tests, mutate a database, or file 200 tasks without the user's go-ahead
  at that command's manifest-confirm gate.
- [ ] Split the work around those gates, because a subagent cannot stop to ask the user:
  1. A subagent on Sonnet runs the command through its Phase-2A coverage summary — scope and DB
     posture, adapter, inventory and the database schema analysis — and returns the summary and the
     referential-integrity score. The schema analysis stays on Sonnet although it reads the schema:
     it changes nothing.
  2. The main session shows the coverage summary and holds the approval gate.
  3. On approval, a subagent on Sonnet writes the item bodies, including the data-layer
     constraint-gap analysis, and returns the manifest **without filing it**.
  4. The main session holds the manifest-confirm gate and files the plan.

### Phase 5b: Author the scope's seed (SCOPE-120 / T006, SCOPE-127 / FR-002)

A test plan describes what to verify; a **seed** is what makes verifying it possible. `/preTest`
stands up a disposable target with structure only and **zero rows**, so without a seed the app
boots against empty screens and nothing can be driven.

**Resolve the adapter first. It decides the form; this phase decides the content.**

- [ ] Run `node _wxAI/adapters/resolve-adapter.mjs --json`, validate the result with
  `node _wxAI/adapters/validate-adapter.mjs <adapter path>`, and **announce the resolved adapter
  with its provenance** (`shipped`, `provisional` or `approved`) before writing anything. Phase 5
  will usually have resolved — or generated — it already; this resolves the same file.
- [ ] Reason **`no-match`** means no adapter covers this stack: **generate one** per
  `_wxAI/adapters/GENERATE.md` — completed from this repository, validated, announced as
  provisional — and continue on it, with no approval prompt. Any other miss (no `stack.md`, two
  adapters tied), or a generated adapter that cannot be completed, means: say so, name the declared
  stack, and carry on to Phase 6 without inventing a seeding harness.
- [ ] A result carrying **`byAppType`** means `stack.md` declares several application types and the
  answer is for one of them. Pick the type the scope's code belongs to from the files it touched,
  say it out loud, and re-resolve with `--app-type <type>` when it is not the top-level one — a
  `no-match` there generates as above. Never seed one type's code from another type's adapter.
- [ ] Read that adapter's **Seeding form**. It answers where a seed lives on this stack, what runs
  it, how it is made idempotent, how a shared base is reused, where it may be written, and how it
  is verified. Follow those answers exactly.
- [ ] Do **not** transliterate another stack's machinery into this project's language. If following
  this phase would introduce a file in a language the declared stack does not use, the resolution
  was wrong — stop and say so.

These rules hold on every stack, so they live here rather than in any adapter:

- [ ] Populate **only** the rows this scope's features need. Not a fixture library — the smallest
  set that makes its screens real.
- [ ] Use **deterministic identifiers**, not random values. Assertions can then name a row without
  querying for it, and the operator sees the same data on every run. A screen full of fresh random
  identifiers is technically seeded and practically unreadable.
- [ ] **Compose, do not re-author.** Depend on the shared base the adapter names rather than
  re-creating a company and a user. Without composition, per-scope fixtures drift apart.
- [ ] Make it **idempotent**, by whatever mechanism the adapter names, so re-running against an
  existing target is harmless.
- [ ] **Verify against a real disposable target before considering the task done**, using the
  adapter's stated verification step. A seed that has never been run is a guess.
- [ ] A seed is written to the disposable target the adapter names and nowhere else. Writing to a
  shared or production target is a defect, not a shortcut.

Resolving the adapter is a script, so it runs in the main session. Writing and verifying the seed
runs in one subagent on Sonnet, with the adapter's Seeding form and the rules above in its brief.
Generating a missing adapter per `GENERATE.md` runs on Opus.

### Phase 6: Report field defects back to wxperts (SCOPE-063 Amendment A / FR-011)
`implement` is where kit defects surface first — a command that errors, a gate that misfires, a
generated artifact that will not parse. Nothing carried those back, so a defect that cost one
project an hour cost every other project the same hour, silently. File it once, here, at the end
of the run.

- [ ] Report when **the kit itself misbehaved**: an MCP tool returned an error that was not caused
  by bad input, a phase's instructions could not be followed as written, a generated file was
  malformed, or a documented gate passed or blocked wrongly.
- [ ] Do **not** report the project's own tests failing, its own code not compiling, or a spec that
  is merely ambiguous — ambiguity is a *clarification* and belongs to `/wxCreateTestPlan`'s
  findings path. Filing those here buries the real defects.
- [ ] File with `mcp__wxkanban__project_submit_feedback`:
  - `type: "bug"`, `projectId`: this project.
  - `title`: the **stable** identity of the defect — command, phase, failure. For example
    `implement Phase 5: get_command_prompt returned 404 for wxuiuxcodereview`. Keep run-specific
    values (UUIDs, absolute paths, timestamps) **out of the title** — the queue de-duplicates on
    it, and a title carrying a UUID files a fresh copy of the same defect on every run.
  - `details`: what was attempted, the verbatim error text, and what you did instead.
  - `context`: at minimum `{ kitversion, activescope, os }`.
- [ ] **One report per distinct defect per run.** If the same failure repeats across tasks, report
  it once and give the occurrence count in `details`.
- [ ] **Fail-open.** If the report cannot be filed, note that in the run output and carry on. Never
  fail, block, or retry an implement run because feedback could not be submitted.

### Phase 6b: Offer runtime bug-trapping (once per project) (SCOPE-063 Amendment A / FR-012)
Phase 6 reports defects in **the kit**. This offers the other half — automatic capture of *this
project's own application* runtime errors into its Bug Reports tab.

- [ ] Check whether the project already has a scope titled **"Automatic Bug-Trapping & Reporting"**
  (its content carries the marker `<!-- wxkanban:bug-trapping-seed -->`). If it does, say nothing:
  this is a one-time offer, not a per-run prompt.
- [ ] If it does not, add a single line to the run output — bug-trapping can be installed from the
  project's **Bug Reports** tab in wxKanban; installing seeds a scope into this project, and running
  that scope through `createSpecs` → `implement` builds the capture into the application.
- [ ] **Do not install it.** The install issues a one-time ingest token that must be shown to a
  human exactly once, so it is a deliberate action in the web app — never an automated one here.

## Output Format
```
implement Report (MCP Project Hub)
===================================
Spec:         {{spec-number}}
Feature:      {{feature-name}}
Phase:        {{current-phase}}

Task Execution:
  ✅ Completed:   {{completed_count}}
  🔄 In Progress: {{in_progress_count}}
  ⏳ Pending:     {{pending_count}}
  🚫 Blocked:     {{blocked_count}}

Progress: {{progress_percentage}}%

MCP Tools Used:
  - project.list_open_items: 1
  - project.update_task_status: {{update_count}}
  - project.capture_event: 1

Next Steps:
  1. Review blocked tasks if any
  2. Run `push` to sync all changes to database
  3. Continue with remaining tasks
```

## Error Handling
- Spec not found exits with code 1
- Invalid phase (not in implementation) warns user
- Task execution failures logged with details
- All operations logged for audit trail

## Related Commands
- `createspecs` — Create new spec with lifecycle
- `push` — Validate and push all data to database
- `help` — Show all available commands
