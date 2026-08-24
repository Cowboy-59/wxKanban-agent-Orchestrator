# implement — Execute Spec Implementation Tasks

## Purpose
Execute implementation tasks for a spec using the MCP Project Hub. This command orchestrates the implementation phase: validates the spec, executes tasks, updates task status, and generates progress reports.

## Stack & Style targeting (SPEC-056)
**Before generating any code, read `stack.md` at the repo root if it exists.** When present, generate code that targets the project's captured stack and design/CSS style — backend language/framework, frontend framework, database, styling/component library, testing framework, hosting/deploy target, and the design tokens (colors, typography, spacing/radius). Use those choices, **not** wxKanban's own Express/React/Postgres/Tailwind defaults.

If `stack.md` does **not** exist, proceed exactly as today — no change in behavior, and never emit a placeholder or block on the missing file. `stack.md` is materialized from the project's Stack & Style document by the kit (the web walkthrough / `/buildstack` writes the document; the kit writes the file on project open); do not hand-edit it here — use `/buildstack` to change it.

## Usage
```bash
{{ai_config_dir}}/implement {{spec-number}} [options]
```

## Arguments
- `spec-number` (required): Spec number to implement (e.g., `017`)
- `--dry-run` (optional): Validate without making changes
- `--task-filter` (optional): Filter tasks by status (e.g., `todo`, `in_progress`)
- `--auto-complete` (optional): Automatically mark completed tasks

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
- [ ] For each task:
  - Execute implementation logic
  - Call `project.update_task_status` to mark `in_progress`
  - On completion, mark as `done`
  - Capture any blockers as `blocked`

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

### Phase 5b: Author the scope's seed (SCOPE-120 / T006)

**Stack gate — evaluate this before anything else in the phase.** Everything below assumes this
project's stack seeds through a TypeScript harness (`tests/seeds/`, a Drizzle idiom, `runSeed`).
That is one stack's machinery, not a universal one. Read `stack.md` first:

- [ ] If the declared stack does not use that harness — or `tests/seeds/run.ts` does not exist in
  this repo — **skip Phase 5b**. Say so in the run output, naming the declared stack and the
  reason, and carry on to Phase 6.
- [ ] When skipping, do **not** transliterate the steps below into the project's own language, and
  do **not** introduce a Node/TypeScript seeding harness into a repo whose `stack.md` forbids one.
  A phase skipped for a named reason is a correct outcome; stack drift is not.
- [ ] Meet the scope's data needs through whatever test tiers the project already has (in-memory
  providers, an existing fixture or container, a hand-run setup step) and name what you used.
- [ ] A skip taken under this gate is **not** a kit defect — do not file it at Phase 6. The
  per-stack seeding adapter that removes the gate is SCOPE-127 FR-002; until it ships, this is the
  intended behavior and is already tracked.

A test plan describes what to verify; a **seed** is what makes verifying it possible. `/preTest`
stands up a clone of the live schema — structure only, **zero rows** — so without a seed the app
boots against empty screens and nothing can be driven.

- [ ] Write `tests/seeds/<NNN-name>/seed.ts` for the scope, populating **only** the rows this
  scope's features need. Not a fixture library — the smallest set that makes its screens real.
- [ ] Use **deterministic identifiers**, not random UUIDs. Assertions can then name a row without
  querying for it, and the operator sees the same data on every run. A screen full of fresh random
  UUIDs is technically seeded and practically unreadable.
- [ ] **Compose, do not re-author.** Declare `requires: [baseSeed]` (`tests/seeds/_base/seed.ts`)
  rather than re-creating a company and a user. `runSeed` resolves each dependency once, so a
  diamond inserts the base rows exactly once. Without composition, per-scope fixtures drift apart.
- [ ] Make it idempotent (`onConflictDoNothing`), matching the property the migrations already rely
  on, so re-running against an existing clone is harmless.
- [ ] Verify against a real clone before considering the task done:
  `node _wxAI/skills/wxPreTest/scripts/clone-guard.mjs --scope <n> --create` then
  `npx tsx tests/seeds/run.ts --schema wxktest_<n>_<id> --scope <n>`.

Seeds are written to a `wxktest_` clone and nowhere else — the harness refuses any other schema.

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
