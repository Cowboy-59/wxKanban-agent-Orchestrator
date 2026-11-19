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
- `scopeContent` (required): the FULL scope document in Markdown — not an Overview body. It is
  scored by **the same preflight gate as `project.validatescope`**, so run validatescope with
  `scopeContent` first: a scope that passes there passes here, and you never need to restructure
  a scope that already scores 100. The gate needs:
  - a business problem — `## Business Problem`, or else the `## Overview` text;
  - a primary and at least one secondary actor — `## Actors` with `Primary:` / `Secondary:` lines,
    **or** `Primary Actor` / `Secondary Actors` rows in a Core Design table;
  - three or more measurable metrics under `## Success Metrics` **or** `## Success Criteria`;
  - what is included — `## Scope Boundary` / `## In Scope`, or a Core Design `Scope Boundary` row;
  - what is excluded — `## Out of Scope`, or that same Core Design row;
  - no `TODO`, `TBD`, `NEEDS CLARIFICATION`, or "placeholder" markers.

  Include `## Overview` and `## Open Questions` (or `## Clarifications`) too: neither blocks on its
  own, but each one missing lowers the score, and the gate also requires a score of 80 or more.
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

## Materialize files locally (Claude Code / SSE clients — REQUIRED)

**`project.create_specs` writes to the wxKanban DB only. It runs on the hosted server and
cannot touch your local working tree.** If you are a local client with filesystem access
(Claude Code over SSE, or any client with a Write tool), you MUST also write the spec files to
disk yourself — otherwise the specs exist "online" but never appear under `specs/`.

Run the pipeline in this order:

1. **Generate** the `scopeContent` (markdown body) and the `tasks` array.
2. **Persist to DB** — call `project.create_specs({ projectId, specNumber, featureName,
   scopeContent, phase, priority, tasks, generateLifecycle: true })` exactly as before.
3. **Write to disk from the SAME `scopeContent` + `tasks`** so DB and disk stay consistent.
   Create the directory `specs/{{specNumber}}-{{slug}}/` (slug = featureName lowercased,
   spaces→`-`, non-`[a-z0-9-]` stripped) and write this exact file set — the same set the kit
   orchestrator produces:
   - `spec.md`, `plan.md`, `tasks.md`, `tests.md`, `quickstart.md`, `lifecycle.json`,
     `checklists/requirements.md`

   Use the kit's generators as the canonical shape (exported from
   `wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts` — `generateSpecMarkdown`,
   `generateTasksMarkdown`, and the sibling `generatePlanMarkdown` / `generateTestsMarkdown` /
   `generateQuickstartMarkdown` / `generateChecklistMarkdown` / `generateLifecycleJson`).

**`spec.md` MUST pass the same preflight** as `scopeContent` (the forms listed under Arguments).
The simplest shape is `generateSpecMarkdown`'s:
- `##` headings: Overview → Business Problem → Actors → Success Metrics → Scope Boundary →
  Out of Scope → Open Questions → Functional Requirements. The order is a convention; the gate
  does not check it.
- Actors as `- Primary:` / `- Secondary:` lines (a Core Design table with `Primary Actor` /
  `Secondary Actors` rows is accepted too).
- ≥ 3 Success Metrics, each containing a digit / percentage / timing threshold (measurable).
- No `TODO` / `TBD` markers; each section ≥ 20 chars of real content.

Skip step 3 only if you have no filesystem access (e.g. the web editor, where the kit syncs the
FS separately). Writing these files is idempotent — safe to re-run for the same `specNumber`.

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
