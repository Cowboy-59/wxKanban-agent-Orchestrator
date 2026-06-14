# createSpecs — Full Spec Pipeline (MCP Tool)

## Purpose
Execute the complete wxKanban spec workflow using the MCP Project Hub `project.create_specs` tool. This single tool orchestrates the entire pipeline: capture → specify → clarify → plan → tasks → lifecycle, and automatically generates `lifecycle.md` and updates `projectlifecycle.md`.

## Stack & Style targeting (SPEC-056)
**Before generating spec content, read `stack.md` at the repo root if it exists.** When present, write the generated spec's technical sections (plan, architecture, tasks) against the project's captured stack and design/CSS style — backend, frontend framework, database, styling/component library, testing, hosting, and the design tokens (colors, typography, spacing/radius) — **not** wxKanban's own Express/React/Postgres/Tailwind defaults.

If `stack.md` does **not** exist, proceed exactly as today — no change in behavior, and never emit a placeholder or block on the missing file. `stack.md` is materialized from the project's Stack & Style document by the kit; do not hand-edit it here — use `/buildstack` to change it.

## Usage
```bash
# Via MCP Tool Call
project.create_specs({
  projectId: "uuid",
  specNumber: "017",
  featureName: "MCP Project Hub",
  scopeContent: "# Scope content...",
  phase: "design",
  priority: "high",
  tasks: [
    { title: "Task 1", description: "...", priority: "high", status: "todo" }
  ],
  generateLifecycle: true
})
```

## Arguments
- `projectId` (required): Project UUID
- `specNumber` (required): Spec number (e.g., "017")
- `featureName` (required): Feature name
- `scopeContent` (required): Scope document content in Markdown
- `phase` (optional): Current lifecycle phase (default: "scoping")
  - Options: "scoping", "design", "implementation", "qa", "human_testing", "beta", "released"
- `priority` (optional): Spec priority (default: "medium")
  - Options: "low", "medium", "high", "critical"
- `tasks` (optional): Array of tasks to create from the spec
  - Each task: `{ title, description, priority, status }`
- `generateLifecycle` (optional): Generate lifecycle files (default: true)

## MCP Tool Used
- `project.create_specs` — Complete spec pipeline in one call
  - Creates spec in `projectspecifications` table
  - Creates spec document in `projectdocuments`
  - Creates plan document
  - Creates tasks in `projecttasks` with spec linking
  - Generates `lifecycle.json` and stores in DB
  - Updates `specs/projectlifecycle.md` and pushes to DB
  - Captures pipeline start and completion events

## Pipeline Phases (Automated)

The `project.create_specs` tool automatically executes:

### Phase 0: Capture Start Event
- Captures `spec_created` event with pipeline start metadata

### Phase 1-3: Specify, Clarify, Plan
- Processes scope content
- Prepares implementation plan structure

### Phase 4: Create Documents
- Creates spec document (`spec.md`) in `projectdocuments`
- Creates plan document (`plan.md`) in `projectdocuments`
- Both linked to pipeline event

### Phase 5: Create Tasks
- Creates all tasks from input `tasks` array
- Links each task to spec document via `documentIds`
- Sets `specId` on each task for traceability

### Phase 6: Generate Lifecycle (if enabled)
- Generates `lifecycle.json` for the spec
- Creates lifecycle document in DB
- **Updates `specs/projectlifecycle.md`** with new spec data
- **Pushes updated lifecycle to `projectdocuments` table**
- Updates phase distribution charts and progress metrics

### Phase 7: Capture Completion
- Captures `spec_created` event with completion metadata
- Returns full results with all created IDs

## Output Structure (Tool Response)
```json
{
  "spec": {
    "id": "uuid",
    "projectId": "uuid",
    "specNumber": "017",
    "title": "MCP Project Hub",
    "status": "planned",
    "createdAt": "2026-01-15T10:00:00Z"
  },
  "documents": [
    { "id": "uuid", "title": "Spec 017: MCP Project Hub", "type": "spec" },
    { "id": "uuid", "title": "Plan: MCP Project Hub", "type": "plan" },
    { "id": "uuid", "title": "Lifecycle: MCP Project Hub", "type": "lifecycle" }
  ],
  "tasks": [
    { "id": "uuid", "title": "Task 1", "status": "todo" }
  ],
  "lifecycleGenerated": true,
  "projectLifecycleUpdated": true,
  "events": [
    { "id": "uuid", "type": "spec_pipeline_started" },
    { "id": "uuid", "type": "spec_pipeline_complete" }
  ]
}


## Output Structure
```
specs/
└── {{spec-number}}-{{feature-name}}/
    ├── spec.md              # Detailed specification
    ├── plan.md              # Implementation plan
    ├── tasks.md             # Task checklist
    ├── quickstart.md        # Developer quickstart
    ├── lifecycle.json       # Phase tracking
    ├── data-model.md        # (if needed)
    ├── research.md          # (if needed)
    └── checklists/
        └── requirements.md  # Requirements checklist
```

## Output Format
```
createSpecs Report (MCP Project Hub — project.create_specs)
===========================================================
Spec Number:  {{spec-number}}
Feature:      {{feature-name}}
Phase:        {{phase}}

✅ Pipeline Complete

Events Captured:
  ✅ spec_pipeline_started (event-id: {{startEventId}})
  ✅ spec_pipeline_complete (event-id: {{completeEventId}})

Spec Created:
  ✅ {{specNumber}} — {{featureName}} (id: {{specId}})
  ✅ Status: {{status}}

Documents Created:
  ✅ spec.md    — "{{title}}" (doc-id: {{specDocId}})
  ✅ plan.md    — "Plan: {{featureName}}" (doc-id: {{planDocId}})
  ✅ lifecycle.json — Stored in DB (doc-id: {{lifecycleDocId}})

Tasks Generated:
  ✅ {{task_count}} tasks created and linked to spec

Lifecycle Files Generated:
  ✅ lifecycle.json for spec {{specNumber}}
  ✅ projectlifecycle.md updated with new spec data
  ✅ Pushed to projectdocuments table (filepath: specs/projectlifecycle.md)

MCP Tool Used:
  - project.create_specs: 1 call (complete pipeline)

Next Steps:
  1. Review generated artifacts in wxKanban
  2. Run `task-push {{spec-number}}` to sync any additional tasks
  3. Begin implementation (Phase 2)
  4. Lifecycle will auto-update on task status changes
```


## Error Handling
- Validation errors return detailed Zod error messages
- Database errors are logged with full error details
- All operations are idempotent — safe to re-run with same specNumber
- Partial failures return created items up to failure point

## Related Commands
- `task-push` — Sync additional tasks to wxKanban
- `task-done` — Mark tasks complete (also updates lifecycle progress)

## MCP Integration Notes
- **Single tool call** — `project.create_specs` replaces multiple individual tool calls
- All database operations go through MCP tools — never raw SQL
- Pipeline events captured automatically for audit trail
- All documents linked to pipeline start event
- All tasks linked to spec document with `specId` reference
- **Lifecycle files (`lifecycle.md` and `projectlifecycle.md`) auto-generated and pushed to DB**
- Use `project.list_open_items` to verify tasks were created

## Lifecycle Auto-Generation
The `project.create_specs` tool automatically:

1. **Generates `lifecycle.json`** for the new spec with:
   - Current phase tracking
   - Progress calculation based on tasks
   - Phase timeline with start/completion dates

2. **Updates `specs/projectlifecycle.md`** with:
   - New spec in appropriate phase section
   - Updated progress charts (Mermaid xychart-beta)
   - Updated phase distribution (Mermaid pie chart)
   - Updated Gantt chart with spec timeline
   - "In Progress Highlights" section
   - "Upcoming Priorities" section

3. **Pushes to Database** via `pushLifecycleToDb()`:
   - Upserts `specs/projectlifecycle.md` record in `projectdocuments` table
   - Sets `doctype: 'lifecycle'` for proper categorization
   - Updates `updatedAt` timestamp

This ensures the wxKanban UI always reflects the latest lifecycle state after any spec creation or modification.
