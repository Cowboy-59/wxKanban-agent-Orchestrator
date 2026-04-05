---
description: Execute the implementation plan by processing and executing all tasks defined in tasks.md
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

> **⚡ SCOPE-FIRST RULE**: Before executing any step below, the scope-first gate MUST pass.
> If it fails, halt immediately. Do NOT proceed to Step 1.

0. **SCOPE-FIRST GATE** — Run scope verification before any implementation:

   ```text
   wxai scope-check --scope <NNN>
   ```

   - Extract `<NNN>` from the user's request or from FEATURE_DIR
   - If the user provided a description but no scope number, run:
     ```text
     wxai scope-check "<description of work>"
     ```
   - **If scope check PASSES** → proceed to Step 1
   - **If scope check FAILS** → HALT. Display the block message and do NOT proceed.
     The user must either identify an existing scope or run `wxai training --new-scope`
   - **Emergency override only**: If user explicitly provides `--force --reason "<explanation>"`,
     run `wxai scope-check --force --reason "<explanation>"` and proceed — the override is logged.

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Check checklists status** (if FEATURE_DIR/checklists/ exists):
   - Scan all checklist files in the checklists/ directory
   - For each checklist, count:
     - Total items: All lines matching `- [ ]` or `- [X]` or `- [x]`
     - Completed items: Lines matching `- [X]` or `- [x]`
     - Incomplete items: Lines matching `- [ ]`
   - Create a status table:

     ```text
     | Checklist | Total | Completed | Incomplete | Status |
     |-----------|-------|-----------|------------|--------|
     | ux.md     | 12    | 12        | 0          | ✓ PASS |
     | test.md   | 8     | 5         | 3          | ✗ FAIL |
     | security.md | 6   | 6         | 0          | ✓ PASS |
     ```

   - Calculate overall status:
     - **PASS**: All checklists have 0 incomplete items
     - **FAIL**: One or more checklists have incomplete items

   - **If any checklist is incomplete**:
     - Display the table with incomplete item counts
     - **STOP** and ask: "Some checklists are incomplete. Do you want to proceed with implementation anyway? (yes/no)"
     - Wait for user response before continuing
     - If user says "no" or "wait" or "stop", halt execution
     - If user says "yes" or "proceed" or "continue", proceed to step 3

   - **If all checklists are complete**:
     - Display the table showing all checklists passed
     - Automatically proceed to step 3

3. **Mark spec as implementing** — call the wxKanban MCP to advance lifecycle status:

   ```text
   wxk_spec_update({ spec_number: "<NNN>", status: "implementing" })
   ```

   - Extract `<NNN>` from FEATURE_DIR (e.g. `specs/009-task-and-lifecycle` → `"009"`)
   - If the MCP call fails or the spec is not found in DB, print a warning and continue — do not halt
   - If the spec is already `implemented`, halt and inform the user: "Spec NNN is already marked as implemented. Re-run with `--force` to override."

4. Load and analyze the implementation context:
   - **REQUIRED**: Read tasks.md for the complete task list and execution plan
   - **REQUIRED**: Read plan.md for tech stack, architecture, and file structure
   - **IF EXISTS**: Read data-model.md for entities and relationships
   - **IF EXISTS**: Read contracts/ for API specifications and test requirements
   - **IF EXISTS**: Read research.md for technical decisions and constraints
   - **IF EXISTS**: Read quickstart.md for integration scenarios

5. **Project Setup Verification**:
   - **REQUIRED**: Create/verify ignore files based on actual project setup:

   **Detection & Creation Logic**:
   - Check if the following command succeeds to determine if the repository is a git repo (create/verify .gitignore if so):

     ```sh
     git rev-parse --git-dir 2>/dev/null
     ```

   - Check if Dockerfile\* exists or Docker in plan.md → create/verify .dockerignore
   - Check if .eslintrc*or eslint.config.* exists → create/verify .eslintignore
   - Check if .prettierrc\* exists → create/verify .prettierignore
   - Check if .npmrc or package.json exists → create/verify .npmignore (if publishing)
   - Check if terraform files (\*.tf) exist → create/verify .terraformignore
   - Check if .helmignore needed (helm charts present) → create/verify .helmignore

   **If ignore file already exists**: Verify it contains essential patterns, append missing critical patterns only
   **If ignore file missing**: Create with full pattern set for detected technology

   **Common Patterns by Technology** (from plan.md tech stack):
   - **Node.js/JavaScript/TypeScript**: `node_modules/`, `dist/`, `build/`, `*.log`, `.env*`
   - **Python**: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `dist/`, `*.egg-info/`
   - **Java**: `target/`, `*.class`, `*.jar`, `.gradle/`, `build/`
   - **C#/.NET**: `bin/`, `obj/`, `*.user`, `*.suo`, `packages/`
   - **Go**: `*.exe`, `*.test`, `vendor/`, `*.out`
   - **Ruby**: `.bundle/`, `log/`, `tmp/`, `*.gem`, `vendor/bundle/`
   - **PHP**: `vendor/`, `*.log`, `*.cache`, `*.env`
   - **Rust**: `target/`, `debug/`, `release/`, `*.rs.bk`, `*.rlib`, `*.prof*`, `.idea/`, `*.log`, `.env*`
   - **Kotlin**: `build/`, `out/`, `.gradle/`, `.idea/`, `*.class`, `*.jar`, `*.iml`, `*.log`, `.env*`
   - **C++**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.so`, `*.a`, `*.exe`, `*.dll`, `.idea/`, `*.log`, `.env*`
   - **C**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.a`, `*.so`, `*.exe`, `Makefile`, `config.log`, `.idea/`, `*.log`, `.env*`
   - **Swift**: `.build/`, `DerivedData/`, `*.swiftpm/`, `Packages/`
   - **R**: `.Rproj.user/`, `.Rhistory`, `.RData`, `.Ruserdata`, `*.Rproj`, `packrat/`, `renv/`
   - **Universal**: `.DS_Store`, `Thumbs.db`, `*.tmp`, `*.swp`, `.vscode/`, `.idea/`

   **Tool-Specific Patterns**:
   - **Docker**: `node_modules/`, `.git/`, `Dockerfile*`, `.dockerignore`, `*.log*`, `.env*`, `coverage/`
   - **ESLint**: `node_modules/`, `dist/`, `build/`, `coverage/`, `*.min.js`
   - **Prettier**: `node_modules/`, `dist/`, `build/`, `coverage/`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
   - **Terraform**: `.terraform/`, `*.tfstate*`, `*.tfvars`, `.terraform.lock.hcl`
   - **Kubernetes/k8s**: `*.secret.yaml`, `secrets/`, `.kube/`, `kubeconfig*`, `*.key`, `*.crt`

6. Parse tasks.md structure and extract:
   - **Task phases**: Setup, Tests, Core, Integration, Polish
   - **Task dependencies**: Sequential vs parallel execution rules
   - **Task details**: ID, description, file paths, parallel markers [P]
   - **Execution flow**: Order and dependency requirements

7. Execute implementation following the task plan:
   - **Phase-by-phase execution**: Complete each phase before moving to the next
   - **Respect dependencies**: Run sequential tasks in order, parallel tasks [P] can run together
   - **Follow TDD approach**: Execute test tasks before their corresponding implementation tasks
   - **File-based coordination**: Tasks affecting the same files must run sequentially
   - **Validation checkpoints**: Verify each phase completion before proceeding

8. Implementation execution rules:
   - **Setup first**: Initialize project structure, dependencies, configuration
   - **Tests before code**: If you need to write tests for contracts, entities, and integration scenarios
   - **Core development**: Implement models, services, CLI commands, endpoints
   - **Integration work**: Database connections, middleware, logging, external services
   - **Polish and validation**: Unit tests, performance optimization, documentation

9. Progress tracking and error handling:
   - Report progress after each completed task
   - Halt execution if any non-parallel task fails
   - For parallel tasks [P], continue with successful tasks, report failed ones
   - Provide clear error messages with context for debugging
   - Suggest next steps if implementation cannot proceed
   - **IMPORTANT** For completed tasks, make sure to mark the task off as [X] in the tasks file.

<<<<<<< HEAD
10. **Phase 4.5: Task Push (MANDATORY - NON-NEGOTIABLE)**

    **⚠️ CRITICAL**: This phase is **MANDATORY** and **NON-NEGOTIABLE**. All completed tasks MUST be synchronized to the wxKanban PostgreSQL database via MCP tools. The implementation is **NOT COMPLETE** without database synchronization.

    **Goal**: Push completed task statuses to the wxKanban PostgreSQL database via MCP tools.

    **Execute the task push workflow**:

    1. **Pre-flight check**: Verify the spec exists in the database using `wxk_spec_list` MCP tool. If not found, create it using `wxk_spec_create`.

    2. **Sync task statuses**: Call `wxk_scope_import` MCP tool:
       ```json
       {
         "spec_number": "NNN",
         "dry_run": false
       }
       ```
       This parses tasks.md and updates task statuses in the database based on completed checkboxes.

    3. **Update spec status**: Call `wxk_spec_update` MCP tool to set spec status to `implementing` or `implemented` based on completion percentage.

    ### Phase 4.5 Completion Report

    After Phase 4.5 completes, report:

    ```
    ---------------------------------------------------
    IMPLEMENTATION PHASE 4.5 COMPLETE: Task Push
    ---------------------------------------------------
    Spec Number:     <NNN>
    Tasks Synced:    <count>
    Tasks Completed: <count>
    Completion %:    <percentage>
    Status:          SUCCESS
    ---------------------------------------------------
    ```

    **MANDATORY VERIFICATION - DO NOT SKIP**:

    Before proceeding to Phase 5, you MUST verify database synchronization using MCP tools:

    1. **Verify tasks in database**:
       - Call `wxk_task_list` with `spec_number: "NNN"`
       - Confirm returned task statuses match tasks.md completion state

    2. **Verify spec status**:
       - Call `wxk_spec_list` and find the entry for spec NNN
       - Confirm `status` reflects current implementation state

    If verification fails, **HALT THE IMPLEMENTATION** and retry Phase 4.5. Do NOT proceed to Phase 5 without confirmed database synchronization.

11. **Phase 5: Lifecycle Update**

    **Goal**: Update `project-documentation/Lifecycle.md` with the current spec's implementation progress, task completion percentage, and status.

    **Execute the lifecycle update workflow**:

    1. **Scan current spec status**: 
       - Read tasks.md and count total vs completed tasks
       - Calculate completion percentage: `completed / total * 100`
       - Determine implementation status:
         - 0% = `specified`
         - 1-99% = `implementing`
         - 100% = `implemented`

    2. **Query wxKanban DB** via MCP tool `wxk_task_list` to get all tasks for the spec:
       - Collect task IDs, titles, statuses, priorities
       - Count open vs closed tasks

    3. **Generate or update `project-documentation/Lifecycle.md`**:
       - **If file does not exist**: Generate from scratch with the full document structure.
       - **If file exists**: Update only the row for the current spec and refresh the Summary Dashboard table. Preserve all other spec rows.

       Document structure:
       ```markdown
       # Project Lifecycle Tracker
       *Last updated: <ISO timestamp>*

       ## Summary Dashboard

       | # | Spec | Specify | Plan | Tasks | Impl% | Open Issues | Status |
       |---|------|---------|------|-------|-------|-------------|--------|
       | NNN | <title> | ✅ | ✅ | ✅ | 87% | 3 | 🟡 In Progress |
       ...

       ---

       ## Spec Details

       ### NNN — <Spec Title>

       **Pipeline Stages**
       | Stage | Status |
       |-------|--------|
       | Specify | ✅ |
       | Clarify | ✅ |
       | Plan | ✅ |
       | Research | ✅ |
       | Data Model | ✅ |
       | Contracts | ⬜ |
       | Quickstart | ⬜ |
       | Tasks | ✅ |
       | Implementation | 🟡 87% |

       **Linked wxKanban Tasks**
       | ID | Title | Status | Priority |
       |----|-------|--------|----------|
       | T042 | Implement auth endpoints | in_progress | P1 |
       ...

       ---
       ```

    4. **Update spec status in DB**: Call `wxk_spec_update` MCP tool with the calculated status.

    ### Phase 5 Completion Report

    After Phase 5 completes, report:

    ```
    ---------------------------------------------------
    IMPLEMENTATION PHASE 5 COMPLETE: Lifecycle Update
    ---------------------------------------------------
    Lifecycle File:  <absolute path to Lifecycle.md>
    Specs Tracked:   <count>
    Current Spec:    <NNN — title>
    Task Completion: <N%>
    Open Issues:     <count>
    Status:          SUCCESS
    ---------------------------------------------------
    ```

12. Completion validation:
=======
10. Completion validation:
>>>>>>> origin/014-sysadmin-platform-admin

    - Verify all required tasks are completed
    - Check that implemented features match the original specification
    - Validate that tests pass and coverage meets requirements
    - Confirm the implementation follows the technical plan
    - **Mark spec as implemented** — call the wxKanban MCP to close the lifecycle step:

      ```text
      wxk_spec_update({ spec_number: "<NNN>", status: "implemented" })
      ```

    - Report final status with summary of completed work

<<<<<<< HEAD
## Final Implementation Report

After all phases complete, produce a comprehensive final report:

```
===================================================
IMPLEMENTATION COMPLETE
===================================================

Spec:           <NNN — title>
Feature Dir:    <absolute path>

Phase Results:
  1. Setup:           <completed | failed>
  2. Implementation:  <completed | failed>
  3. Task Push:       <completed | failed> (MANDATORY)
  4. Lifecycle:       <completed | failed>

Tasks Completed:    <N> of <total>
Completion %:       <percentage>
Tests Passing:      <count>
Artifacts Created:  <list>

Database Status:
  - Tasks Synced:     <count>
  - Spec Status:      <status>
  - Open Tasks:       <count>

Next Steps:
  - <contextual recommendation>
===================================================
```

=======
>>>>>>> origin/014-sysadmin-platform-admin
Note: This command assumes a complete task breakdown exists in tasks.md. If tasks are incomplete or missing, suggest running `/wxAI-tasks` first to regenerate the task list.
