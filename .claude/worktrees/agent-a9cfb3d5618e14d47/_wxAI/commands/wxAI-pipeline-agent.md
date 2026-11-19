---
description: Pipeline orchestrator agent that manages and executes the full wxAI pipeline workflow with intelligent automation, state persistence, and error recovery
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

## Context Note

> **Purpose**: This agent is the **full pipeline orchestrator**. It adds state persistence, multi-mode execution (run, resume, parallel, status, retry), and automatic error recovery on top of the core `/wxAI-pipeline` command.
>
> For simple command normalization only (translating `pipeline NNN` → `/wxAI-pipeline NNN`), use `/wxAI-pipeline-normalizer` instead.

---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

---

## Pipeline Orchestrator Agent

This agent manages wxAI pipeline execution with state persistence, parallel processing capabilities, and automatic error recovery. It **delegates phase execution to `/wxAI-pipeline`** rather than re-implementing phase logic.

**Invocation Modes**:
- `run` — Execute full pipeline from start to finish
- `resume` — Continue a halted pipeline from last completed phase
- `parallel` — Execute with within-phase parallelism optimizations enabled
- `status` — Check current pipeline state and progress
- `retry` — Retry failed phases with error recovery

---

## Pre-Flight Validation

Before starting, validate the input:

1. **Check for empty arguments**: If `{{args}}` is empty or only whitespace, immediately halt with:

   ```
   ERROR: No operation or feature description provided.

   Usage: /wxAI-pipeline-agent <mode> [feature description] [options]

   Modes:
     run <description>      - Execute full pipeline (Specify → Clarify → Plan → Tasks → Lifecycle)
     resume [spec-number]   - Resume halted pipeline (auto-detects or uses provided spec)
     parallel <description> - Run pipeline with within-phase parallelism optimizations
     status [spec-number]   - Show pipeline status for current or specified spec
     retry [spec-number]    - Retry failed phases with recovery logic

   Options:
     --skip-clarify        - Skip Phase 2 (Clarify)
     --skip-plan           - Skip Phase 3 (Plan) and Phase 4 (Tasks)
     --skip-tasks          - Skip Phase 4 (Tasks)
     --skip-lifecycle      - Skip Phase 5 (Lifecycle)
     --auto-approve        - Auto-approve interactive checkpoints (use with caution)
     --force               - Force retry even on critical failures
     --dry-run             - Preview pipeline without executing

   Examples:
     /wxAI-pipeline-agent run "Add user authentication with OAuth2"
     /wxAI-pipeline-agent resume 042
     /wxAI-pipeline-agent parallel "Fix payment processing bug"
     /wxAI-pipeline-agent status
     /wxAI-pipeline-agent retry --force
   ```

   Do NOT proceed further.

2. **Parse mode and arguments**: Extract:
   - Mode: `run`, `resume`, `parallel`, `status`, or `retry`
   - Feature description (for `run`/`parallel` modes)
   - Spec number (for `resume`/`status`/`retry` modes)
   - Options: `--skip-*`, `--auto-approve`, `--force`, `--dry-run`

3. **Validate mode**: If mode is not recognized, halt with error showing valid modes.

4. **Handle `--dry-run`**: If `--dry-run` is present in any mode:
   - Construct and display the `/wxAI-pipeline` command that **would** be executed
   - Show the state entry that **would** be created in `.wxai/pipeline-state.json`
   - Do **NOT** invoke `/wxAI-pipeline`
   - Do **NOT** write to `.wxai/pipeline-state.json`
   - Report:
     ```
     ===================================================
     DRY RUN — No changes will be made
     ===================================================

     Mode:    <mode>
     Command: /wxAI-pipeline [flags] "<description>"

     State entry that would be created:
       specNumber:  null (set after Phase 1)
       mode:        <mode>
       status:      in_progress
       phases:      all pending
       skipDirectives: [<list>]

     To execute for real, remove --dry-run and re-run.
     ===================================================
     ```
   - Halt after displaying the dry-run report.

---

## State File Initialization

Before executing any mode, initialize or load the pipeline state file.

### State File Location

```
.wxai/pipeline-state.json
```

### Initialization Logic

1. **Check if `.wxai/` directory exists**:
   - If not: create it using the appropriate command for the current OS:
     - PowerShell (Windows): `New-Item -ItemType Directory -Force -Path .wxai`
     - Bash (Unix/macOS): `mkdir -p .wxai`
   - Add `.wxai/` to `.gitignore` if not already present by appending the line `.wxai/` to the `.gitignore` file (state is local, not committed)

2. **Check if `.wxai/pipeline-state.json` exists**:
   - If not: create it with the empty structure:
     ```json
     {
       "version": "1.0",
       "pipelines": []
     }
     ```
   - If exists: load and parse it. If JSON is malformed, rename to `pipeline-state.json.bak.<timestamp>` and create fresh.

3. **For `run` and `parallel` modes**: Create a new pipeline entry:
   ```json
   {
     "specNumber": null,
     "branch": null,
     "featureDir": null,
     "featureDescription": "<extracted description>",
     "mode": "<run|parallel>",
     "status": "in_progress",
     "phases": {
       "specify":   { "status": "pending", "completedAt": null, "error": null },
       "clarify":   { "status": "pending", "completedAt": null, "error": null },
       "plan":      { "status": "pending", "completedAt": null, "error": null },
       "tasks":     { "status": "pending", "completedAt": null, "error": null },
       "dbpush":    { "status": "pending", "completedAt": null, "error": null },
       "lifecycle": { "status": "pending", "completedAt": null, "error": null }
     },
     "artifacts": {
       "spec": null,
       "checklist": null,
       "plan": null,
       "research": null,
       "dataModel": null,
       "contracts": null,
       "quickstart": null,
       "tasks": null,
       "lifecycle": null
     },
     "skipDirectives": [],
     "autoApprove": false,
     "autoApproveLog": [],
     "createdAt": "<ISO timestamp>",
     "updatedAt": "<ISO timestamp>"
   }
   ```

4. **For `resume`, `status`, `retry` modes**: Load the existing pipeline entry matching the spec number (or the most recent `in_progress` entry if no spec number provided).

5. **Write state after every phase completion or failure** — never batch state writes.

### State Cleanup

- On successful pipeline completion: set `status` to `completed`, set `completedAt` timestamp.
- Completed pipelines are retained in `pipelines[]` for audit purposes (do not delete).
- To archive old state: move entries older than 30 days to `.wxai/pipeline-state-archive.json`.

---

## Mode: Run

**Goal**: Execute the complete wxAI pipeline by delegating to `/wxAI-pipeline`, while maintaining persistent state and providing enhanced error recovery.

### Run Workflow

1. **Initialize pipeline state** (per State File Initialization above).

2. **Construct the `/wxAI-pipeline` command**:
   - Start with: `/wxAI-pipeline`
   - Append any skip directives passed by the user: `--skip-clarify`, `--skip-plan`, `--skip-tasks`, `--skip-lifecycle`
   - Append the feature description
   - Example: `/wxAI-pipeline --skip-clarify "Add user authentication with OAuth2"`

3. **Invoke `/wxAI-pipeline`**:
   - Delegate ALL phase execution to `/wxAI-pipeline` — do not re-implement phase logic here.
   - `/wxAI-pipeline` handles: Specify → Clarify → Plan → Tasks → DB Push → Lifecycle
   - Monitor execution and capture outputs at each phase completion checkpoint.

4. **Update state after each phase**:
   - When `/wxAI-pipeline` reports a phase complete, update `.wxai/pipeline-state.json`:
     - Set phase `status` → `completed`
     - Set `completedAt` → current ISO timestamp
     - Capture artifact paths from the phase completion report
     - Update `specNumber`, `branch`, `featureDir` once Phase 1 completes
   - Write state file immediately after each update.

5. **Handle `--auto-approve`**:
   - At each `/wxAI-pipeline` interactive checkpoint (continue/skip/stop), automatically respond `continue`.
   - At Phase 2 (Clarify) questions, automatically select the recommended option.
   - Log each auto-approved decision in the state file under `autoApproveLog[]`.

6. **On phase failure**:
   - Update state: failed phase → `status: "failed"`, `error: "<error message>"`
   - Attempt auto-recovery (see Error Handling section)
   - If auto-recovery fails: HALT, report failure, save state for `resume` mode

7. **Generate final report** on completion:
   ```
   ===================================================
   PIPELINE ORCHESTRATOR: RUN COMPLETE
   ===================================================

   Feature: <description>
   Branch:  <branch-name>
   Spec:    <spec-number>

   Phase Results:
     ✅ Phase 1 (Specify):   <branch> created, <spec-file>
     ✅ Phase 2 (Clarify):   <N> questions processed
     ✅ Phase 3 (Plan):      <N> artifacts created
     ✅ Phase 4 (Tasks):     <N> tasks generated
     ✅ Phase 4.5 (DB Push): <N> tasks in database
     ✅ Phase 5 (Lifecycle): Lifecycle.md updated

   Artifacts:
     - <absolute path>/spec.md
     - <absolute path>/plan.md
     - <absolute path>/tasks.md
     - <absolute path>/Lifecycle.md
     - Database: <N> tasks, <N> documents

   State File: .wxai/pipeline-state.json

   Session Completion (MANDATORY per AGENTS.md):
     git pull --rebase && bd sync && git push
     Verify: git status shows "up to date with origin"

   Next Steps:
     Run `/wxAI-implement` to begin task execution
     Or: `/wxAI-pipeline-agent status` to check progress
   ===================================================
   ```

---

## Mode: Resume

**Goal**: Continue a halted pipeline from the last successfully completed phase.

### Resume Workflow

1. **Load pipeline state** from `.wxai/pipeline-state.json`:
   - If spec number provided: find the matching pipeline entry
   - If no spec number: use the most recent entry with `status: "in_progress"` or `status: "failed"`
   - If no matching entry found: scan `specs/` directory using the artifact-to-phase mapping below to reconstruct state

2. **Artifact-to-Phase Mapping** (used when state file is absent or incomplete):

   | Artifact present | Phase completed |
   |-----------------|-----------------|
   | `spec.md` + `checklists/requirements.md` | Phase 1 (Specify) ✅ |
   | `## Clarifications` section in spec.md | Phase 2 (Clarify) ✅ |
   | `plan.md` + `research.md` + `data-model.md` | Phase 3 (Plan) ✅ |
   | `tasks.md` | Phase 4 (Tasks) ✅ |
   | `wxk_task_list` returns count > 0 for spec NNN | Phase 4.5 (DB Push) ✅ |
   | Entry in `project-documentation/Lifecycle.md` | Phase 5 (Lifecycle) ✅ |

3. **Report resume context**:
   ```
   Resuming Pipeline:
     Spec:           <spec-number>
     Last Completed: Phase <N> (<name>)
     Resuming From:  Phase <N+1> (<name>)
   ```

4. **Construct resume command**:
   - Determine which phases remain (pending/failed)
   - Build appropriate skip directives for already-completed phases
   - Invoke `/wxAI-pipeline` with those skip directives and the original feature description

5. **Continue state tracking** as per Run mode (steps 4–6).

6. **Generate resume report**:
   ```
   ===================================================
   PIPELINE RESUME COMPLETE
   ===================================================

   Resumed From: Phase <N> (<name>)

   Previously Completed:
     ✅ Phase 1 through Phase <N>

   Newly Completed:
     ✅ Phase <N+1> through Phase 5

   Status: FULLY COMPLETE

   Session Completion (MANDATORY per AGENTS.md):
     git pull --rebase && bd sync && git push
   ===================================================
   ```

---

## Mode: Parallel

**Goal**: Execute the pipeline with within-phase parallelism optimizations enabled.

> **Important**: The pipeline phases themselves remain **sequential** (1 → 2 → 3 → 4 → 4.5 → 5). Parallelism applies only to **sub-tasks within phases** (e.g., generating multiple artifacts concurrently within Phase 3, or processing multiple user stories concurrently within Phase 4).

### Parallel Workflow

1. **Run sequential phases via `/wxAI-pipeline`** (same as Run mode delegation).

2. **Parallelize within phases** by instructing sub-agents:
   - **Phase 3**: Launch up to 4 concurrent sub-agents for: `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
   - **Phase 4**: Launch up to N concurrent sub-agents for N independent user stories
   - **Phase 4.5**: Parallel document imports (spec, plan, tasks, quickstart)

3. **Synchronization points**:
   - Wait for all Phase 3 sub-agents before Phase 4
   - Wait for all Phase 4 sub-agents before Phase 4.5
   - Wait for DB push confirmation before Phase 5

4. **Generate parallel execution report**:
   ```
   ===================================================
   PARALLEL PIPELINE COMPLETE
   ===================================================

   Sequential Phases: 6
   Parallel Sub-Agents Used: <N>

   Parallel Breakdown:
     Phase 3: <N> concurrent artifact generators
     Phase 4: <N> concurrent task generators
     Phase 4.5: <N> concurrent document imports

   Status: COMPLETE

   Session Completion (MANDATORY per AGENTS.md):
     git pull --rebase && bd sync && git push
   ===================================================
   ```

---

## Mode: Status

**Goal**: Check current pipeline state and progress for any or all specs.

### Status Workflow

1. **Load state from `.wxai/pipeline-state.json`** (if exists).

2. **Scan `specs/` directory** for all `NNN-*` directories.

3. **For each spec**, determine phase completion using the artifact-to-phase mapping (defined in Resume mode).

4. **Query database** (graceful degradation if unavailable):
   - Use `wxk_spec_list` for spec statuses
   - Use `wxk_task_list` for task counts and completion percentages
   - If database tools are unavailable: report file-system-based status only and note that database task counts are unavailable

5. **Generate status report**:
   ```
   ===================================================
   PIPELINE STATUS REPORT
   ===================================================

   Active Specs: <N>

   | Spec | Branch | P1 | P2 | P3 | P4 | P4.5 | P5 | Status   |
   |------|--------|----|----|----|----|------|----|----------|
   | 042  | auth   | ✅ | ✅ | ✅ | ✅ | ✅   | ✅ | Complete |
   | 043  | pay    | ✅ | ✅ | ⏳ | ⏳ | ⏳   | ⏳ | Planning |
   | 044  | ui     | ✅ | ⏳ | ⏳ | ⏳ | ⏳   | ⏳ | Specify  |

   Legend: ✅ Complete | ⏳ In Progress | ⏸️ Halted | ❌ Failed

   Details:
     Spec 042: 47 tasks, 100% complete
     Spec 043: 23 tasks, 0% complete, waiting on plan.md
     Spec 044: Just specified, needs clarification

   Recommendations:
     - Resume Spec 043: `/wxAI-pipeline-agent resume 043`
     - Continue Spec 044: `/wxAI-pipeline-agent resume 044`
   ===================================================
   ```

---

## Mode: Retry

**Goal**: Retry failed phases with intelligent error recovery.

### Retry Workflow

1. **Load pipeline state** from `.wxai/pipeline-state.json`:
   - Find the entry for the provided spec number (or most recent failed entry)
   - Identify all phases with `status: "failed"`

2. **Determine retry strategy**:
   - **Transient errors** (network, timeout): Immediate retry
   - **Resource errors** (missing files): Fix then retry
   - **Logic errors** (validation failures): Require manual fix before retry

3. **Execute retry**:
   - Clear `error` field on failed phases
   - Re-invoke `/wxAI-pipeline` from the failed phase (using skip directives for completed phases)
   - Apply `--force` flag if specified

4. **Generate retry report**:
   ```
   ===================================================
   PIPELINE RETRY COMPLETE
   ===================================================

   Spec:         <spec-number>
   Failed Phase: Phase <N> (<name>)
   Failure Reason: <error>

   Recovery Actions:
     - <action taken>

   Retry Result: ✅ SUCCESS / ❌ FAILED

   If failed again:
     - Manual intervention required
     - Consider: `/wxAI-<phase>` individual command
   ===================================================
   ```

---

## State Management

### Pipeline State File Schema

`.wxai/pipeline-state.json`:

```json
{
  "version": "1.0",
  "pipelines": [
    {
      "specNumber": "042",
      "branch": "feature/auth-oauth",
      "featureDir": "specs/042-auth-oauth",
      "featureDescription": "Add user authentication with OAuth2",
      "mode": "run",
      "status": "in_progress",
      "phases": {
        "specify":   { "status": "completed", "completedAt": "2024-01-15T10:30:00Z", "error": null },
        "clarify":   { "status": "completed", "completedAt": "2024-01-15T10:45:00Z", "error": null },
        "plan":      { "status": "failed",    "completedAt": null, "error": "Template not found" },
        "tasks":     { "status": "pending",   "completedAt": null, "error": null },
        "dbpush":    { "status": "pending",   "completedAt": null, "error": null },
        "lifecycle": { "status": "pending",   "completedAt": null, "error": null }
      },
      "artifacts": {
        "spec":      "specs/042-auth-oauth/spec.md",
        "checklist": "specs/042-auth-oauth/checklists/requirements.md",
        "plan":      null,
        "research":  null,
        "dataModel": null,
        "contracts": null,
        "quickstart": null,
        "tasks":     null,
        "lifecycle": null
      },
      "skipDirectives": [],
      "autoApprove": false,
      "autoApproveLog": [],
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:45:00Z"
    }
  ]
}
```

---

## Error Handling & Recovery

### Common Failure Patterns

1. **Phase 1 Fail: Script not found**
   ```
   Recovery: Check .specify/scripts/powershell/ exists
   Action: Run setup script or create directory structure
   ```

2. **Phase 2 Fail: No clarification questions generated**
   ```
   Recovery: Skip to Phase 3 (spec is already clear)
   Action: Mark Phase 2 as completed with "No questions needed"
   ```

3. **Phase 3 Fail: Template missing**
   ```
   Recovery: Check .specify/templates/ directory
   Action: Copy from starter kit or create minimal template
   ```

4. **Phase 4.5 Fail: Database insertion fails**
   ```
   Recovery: Retry with MCP tools, check connection
   Action:
     1. Verify MCP server running
     2. Check database connectivity
     3. Retry with exponential backoff (3 attempts)
     4. If still failing: HALT (mandatory phase — cannot skip)
   ```

5. **Phase 5 Fail: Lifecycle.md locked**
   ```
   Recovery: Wait and retry, or create backup
   Action:
     1. Check for file locks
     2. Create Lifecycle.md.new if needed
     3. Merge on next run
   ```

### Error Type Definitions

| Error Type | Observable Condition | Recovery |
|------------|---------------------|----------|
| `SCRIPT_NOT_FOUND` | PowerShell exits with code 1, message contains "not found" or "cannot find path" | Check alternate paths, run setup |
| `JSON_PARSE_ERROR` | Script output is not valid JSON (starts with non-`{` character) | Retry with raw output parsing |
| `DB_TIMEOUT` | MCP tool returns timeout error or connection refused | Retry with exponential backoff (3×) |
| `FILE_LOCKED` | File write fails with "access denied" or "locked" | Wait 5s and retry |
| `TEMPLATE_MISSING` | Template file path returns 404 / not found | Check `.specify/templates/`, copy from starter kit |
| `VALIDATION_FAILURE` | Phase checklist gate returns FAIL | Requires manual fix before retry |

### Auto-Recovery Logic

```
function attemptRecovery(phase, errorType):
  SCRIPT_NOT_FOUND  → checkAlternatePaths() OR runSetup()
  JSON_PARSE_ERROR  → retryWithRawParsing()
  DB_TIMEOUT        → retryWithBackoff(maxAttempts=3, baseDelay=1000ms)
  FILE_LOCKED       → waitAndRetry(delay=5000ms)
  TEMPLATE_MISSING  → locateTemplate() OR createMinimalTemplate()
  VALIDATION_FAILURE → HALT (requires manual intervention)
  default           → HALT (requires manual intervention)
```

---

## Behavior Rules

- **Delegate phase execution** — Never re-implement phase logic; always invoke `/wxAI-pipeline` for phase execution
- **Never skip Phase 4.5 (DB Push)** — This is MANDATORY and NON-NEGOTIABLE; no skip option is offered
- **Maintain state persistently** — Write `.wxai/pipeline-state.json` after every phase completion or failure
- **Support idempotency** — Re-running a completed phase should be safe
- **Parallelize safely** — Only parallelize sub-tasks within phases; never parallelize phases themselves
- **Preserve artifacts** — Never delete existing artifacts on retry
- **Respect skip directives** — Honor all `--skip-*` flags by passing them through to `/wxAI-pipeline`
- **Auto-approve with caution** — Only use `--auto-approve` in CI/CD contexts; log every auto-approved decision
- **Force as last resort** — `--force` should only bypass verification in emergencies
- **Session completion** — Always include AGENTS.md session completion steps in final reports
- **Graceful DB degradation** — If database is unavailable in status mode, report file-system status only

---

## Integration Points

### MCP Tools Used
- `wxk_spec_list` / `wxk_spec_create` / `wxk_spec_update`
- `wxk_scope_import` / `wxk_doc_import`
- `wxk_task_list`

### PowerShell Scripts Used
- `.specify/scripts/powershell/create-new-feature.ps1`
- `.specify/scripts/powershell/check-prerequisites.ps1`
- `.specify/scripts/powershell/setup-plan.ps1`
- `.specify/scripts/powershell/update-agent-context.ps1`

### Commands Invoked
- `/wxAI-pipeline` — **Primary delegation target for all phase execution**
- `/wxAI-specify` (via `/wxAI-pipeline`)
- `/wxAI-clarify` (via `/wxAI-pipeline`)
- `/wxAI-plan` (via `/wxAI-pipeline`)
- `/wxAI-tasks` (via `/wxAI-pipeline`)
- `/task-push` — located at `_wxAI-global/commands/task-push.md` (via `/wxAI-pipeline` Phase 4.5)
- `/wxAI-lifecycle` (via `/wxAI-pipeline`)
- `/wxAI-implement` — post-pipeline implementation command (run after pipeline completes)

---

## Performance Optimization

### Parallel Execution Matrix

| Phase | Parallelizable | Max Concurrency | Notes |
|-------|---------------|-----------------|-------|
| 1 (Specify) | No | 1 | Sequential dependency |
| 2 (Clarify) | No | 1 | Depends on Phase 1 |
| 3 (Plan) | Yes (within) | 4 | research, data-model, contracts, quickstart in parallel |
| 4 (Tasks) | Yes (within) | N | Per user story, up to 4 concurrent |
| 4.5 (DB Push) | Yes (within) | 4 | Parallel document imports |
| 5 (Lifecycle) | No | 1 | Depends on Phase 4.5 |

### Resource Limits
- Max 4 concurrent sub-agents to prevent context window exhaustion
- Database operations: Max 3 retries with exponential backoff
- State file writes: Synchronous (never async) to prevent corruption
