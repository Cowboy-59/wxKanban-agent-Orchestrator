# wxAI-Implement Rules

**Mandatory workflow when user says "Implement {spec-id}" (e.g., "Implement 001-Multi-platform-task")**

---

## Required Steps (Must Follow in Order)

### Step 1: Read Spec Files
- Read `specs/{scope}/spec.md`
- Read `specs/{scope}/tasks.md`
- Read `specs/{scope}/lifecycle.json`
- Understand current phase and pending tasks

### Step 2: Search Codebase
- Search for relevant files related to the spec scope
- Identify existing patterns and integration points
- Understand the codebase structure

### Step 3: Brainstorm Plan
- Create comprehensive implementation plan
- List all files to modify/create
- Identify dependencies and risks
- **Get user approval before proceeding**

### Step 4: Create TODO.md
- Break down approved plan into actionable tasks
- Track progress with checkboxes
- Update as tasks are completed

### Step 5: Execute Changes (One File at a Time)
- Use `replace_in_file` for targeted edits
- Use `create_file` for new files
- **Wait for user confirmation after each file modification**

### Step 6: Test & Verify
- Run validation commands
- Check for linting/TypeScript errors
- Test implementation (ask user: critical-path or thorough testing)

### Step 7: Push to Database
- Run `node push-lifecycle.mjs` or `wxai lifecycle`
- Ensure `projectdocuments` table reflects latest state
- **This step is mandatory before completion**

### Step 8: Final Completion
- Use `attempt_completion` with summary of all changes
- Provide CLI command to demonstrate result if applicable

---

## Testing Requirements (Before Completion)

### If minimal tests were run:
- Enumerate remaining areas requiring coverage
- Ask user if they want full thorough testing

### If no testing was done:
- Outline critical aspects to verify
- Ask user to choose:
  - **Critical-path testing** (key elements only)
  - **Thorough testing** (complete coverage)

### Task-Specific Testing:

**Web UI Changes:**
- List affected pages/sections/components
- Confirm with user: test only those areas or entire application flow

**API or Backend Services:**
- List primary endpoints impacted
- Confirm with user: test only those endpoints or all endpoints + edge cases

**Other Task Types:**
- Summarize significant changes
- Confirm depth of testing required

---

## Definition — Thorough Testing

**Frontend / Web:**
- Navigate/scroll through every page and section
- Interact with all links, buttons, and inputs
- Ensure each behaves as expected

**Backend / API:**
- Exercise every endpoint and scenario
- Test happy paths, error paths, edge cases
- Confirm correct responses and side effects
- Test endpoints using Curl requests

---

## Question Structure for Testing

1. List what has already been tested (if any)
2. Enumerate remaining areas that still require coverage
3. Ask user: **Continue testing remaining areas OR skip to complete?**

---

## Compliance

These rules are mandatory and must be followed for every `wxAI-Implement` command. Failure to follow this workflow is a violation of the wxKanban development process.

**Last Updated:** 2025-01-28
