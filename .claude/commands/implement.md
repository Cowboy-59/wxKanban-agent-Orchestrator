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
