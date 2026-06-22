# autofix-tests — Autonomous Test-Fix Pipeline

## Purpose
Automatically detect failing tests, analyze root causes, and apply fixes without human intervention. All operations are captured via MCP Project Hub for audit trail.

## Usage
```bash
{{ai_config_dir}}/autofix-tests {{args}}
```

## Arguments
- `--max-iterations` (optional): Maximum fix attempts (default: 3)
- `--test-pattern` (optional): Glob pattern for test files (default: "**/*.test.ts")
- `--auto-apply` (optional): Apply fixes without confirmation (use with caution)

## MCP Tools Used
- `project.capture_event` — Log each fix attempt and result
- `project.upsert_document` — Create fix report document

## Pipeline Steps

### 1. Capture Start Event
- [ ] Call `project.capture_event` with:
  - `type`: "autofix_started"
  - `source`: "cli"
  - `rawContent`: "Starting autofix-tests with pattern {{test-pattern}}"
  - Store returned `eventId` as `autofixEventId`

### 2. Detect Failures
- [ ] Run test suite: `npm test` or equivalent
- [ ] Capture failing test names and error messages
- [ ] Parse stack traces to identify source files
- [ ] Call `project.capture_event` with:
  - `type`: "test_analysis"
  - `source`: "cli"
  - `rawContent`: "Found {{failure_count}} failing tests"

### 3. Analyze Root Cause
- [ ] Read failing test code
- [ ] Read implementation code under test
- [ ] Identify common failure patterns:
  - Assertion mismatches (expected vs actual)
  - Missing mocks or stubs
  - Async timing issues
  - Type errors
  - Import/dependency issues

### 4. Generate and Apply Fix
- [ ] Propose code changes to fix the issue
- [ ] Ensure fix doesn't break other tests
- [ ] Add/update mocks if needed
- [ ] Call `project.capture_event` for each fix attempt:
  - `type`: "fix_attempt"
  - `source`: "cli"
  - `rawContent`: "Fix attempt {{iteration}} for {{test-name}}: {{fix-description}}"

### 5. Verify Fix
- [ ] Apply fix to source code
- [ ] Re-run failing test
- [ ] If pass → call `project.capture_event` with:
  - `type`: "fix_success"
  - `source`: "cli"
  - `rawContent`: "Fixed {{test-name}} in {{iteration}} attempts"
- [ ] If fail → iterate (up to max-iterations)
  - Call `project.capture_event` with:
    - `type`: "fix_failed"
    - `source`: "cli"
    - `rawContent`: "Failed to fix {{test-name}} after {{max-iterations}} attempts"

### 6. Create Report Document
- [ ] Call `project.upsert_document` with:
  - `title`: "Autofix Report — {{timestamp}}"
  - `bodyMarkdown`: Full report content (see Output Format)
  - `sourceEventId`: autofixEventId
  - `tags`: ["autofix", "tests", "report"]

### 7. Report Results
- [ ] List all fixes applied
- [ ] Report tests still failing (if any)
- [ ] Suggest manual review items

## Output Format
```
autofix-tests Report (MCP Project Hub)
=====================================
Event captured:     ✅ autofix_started (event-id: xxx)

Tests analyzed:     47
Failures detected:  3

Fix Iteration 1:
  🔧 test/auth.test.ts: "should validate token"
     └─ Fixed: Added missing mock for jwt.verify
     └─ Event: fix_attempt → fix_success
  🔧 test/db.test.ts: "should handle connection error"
     └─ Fixed: Added async/await to test
     └─ Event: fix_attempt → fix_success
  ❌ test/api.test.ts: "should return 200"
     └─ Failed after 3 attempts — manual review needed
     └─ Event: fix_attempt → fix_failed

Results:
  ✅ Fixed:        2
  ❌ Still failing: 1
  ⏭️  Skipped:      0

Files modified:
  - src/services/auth.ts
  - tests/db.test.ts

MCP Tools Used:
  - project.capture_event: 7
  - project.upsert_document: 1

Report document:    ✅ Created in projectdocuments
```

## Safety Rules
- Never modify test assertions (only implementation)
- Never delete tests to make suite pass
- Stop after max-iterations to prevent infinite loops
- Require `--auto-apply` flag for unattended execution

## Error Handling
- Test command failures are captured via `project.capture_event` and exit with code 1
- Parse errors in test output are logged but don't stop pipeline
- File write errors are retried once
- All errors are captured as events for audit trail

## Related Commands
- `autofix-translation` — MSSQL → PostgreSQL translation
- `createSpecs` — Full spec pipeline

## MCP Integration Notes
- All operations are captured as events for complete audit trail
- Fix reports are stored as documents for future reference
- Use `project.list_open_items` to check for related tasks about test failures
- Never use raw SQL — all data access through MCP tools
