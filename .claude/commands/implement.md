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
- [ ] Call `project.capture_event` with:
  - `type`: "spec_implementation_progress"
  - `rawContent`: Implementation summary

### Phase 4: Advisory Review (wxUIUXCodeReview)
After the implementation report, run an **advisory** combined code + UI/UX review over
the changes this run produced — it never blocks completion; implement is already reported done.

- [ ] Scope the review to the files/tasks changed by this implement run (the diff), not the whole repo.
- [ ] Run the `wxUIUXCodeReview` command: call `project.get_command_prompt` with `{ "command": "wxuiuxcodereview" }` and follow the returned methodology against those changes. If unavailable, fall back to the `wxUIUXCodeReview` skill under `.claude/skills/wxUIUXCodeReview/`.
- [ ] Run the track(s) that match the diff: the code track always; the UI/UX track only when the run touched frontend files (`.tsx`/`.jsx`/`.css`/Tailwind/shadcn). Use a static UI review — do not launch the app here.
- [ ] Print the review findings (ordered by severity: must-fix / should-fix / nit) after the implement report.
- [ ] Do **not** auto-apply fixes, edit code, restyle, or mark tasks blocked based on the review — surface findings for the user to act on. must-fix findings are called out prominently but do not fail the run.

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
