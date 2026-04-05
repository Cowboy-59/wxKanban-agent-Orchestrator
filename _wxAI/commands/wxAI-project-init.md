---
description: wxAI-project-init
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

## project.init — wxKanban Project Workspace Initializer

Sets up a local directory structure for a wxKanban project by fetching scaffold data
from the wxKanban API and writing project files: CLAUDE.md, overview, specs, and config.

---

## Prerequisites

Before running this command, ensure:

1. `WXKANBAN_API_TOKEN` environment variable is set (your personal access token from wxKanban Settings).
   - If missing, abort immediately with:
     ```
     ERROR: WXKANBAN_API_TOKEN environment variable is not set.
     Generate a token at your wxKanban Settings page and set it with:
       export WXKANBAN_API_TOKEN=your_token_here
     ```

2. A project ID is available via one of:
   - `.wxkanban-project` config file in the current directory (contains `{ "projectId": "..." }`)
   - User argument passed after the slash command (e.g., `/project.init abc123-uuid-here`)
   - If neither, prompt: "Enter project ID:" and wait for user input

---

## Execution Steps

### Step 1 — Resolve project ID

1. Check for user-provided argument first (from the slash command invocation).
2. If no argument, check for `.wxkanban-project` file in cwd, parse `projectId` field.
3. If still not found, ask the user: "Which project ID should I initialise? (UUID from wxKanban)"
4. Store resolved project ID as `PROJECT_ID`.

### Step 2 — Environment & Tooling Bootstrap

Before fetching project data, verify and configure the developer environment. Run all checks in parallel where possible, then report a consolidated status at the end of this step.

---

#### 2.1 — MCP: wxKanban Server

Check `.claude/settings.json` (workspace root) for the `wxkanban-mcp` entry.

**If missing**, add it:

```json
{
  "mcpServers": {
    "wxkanban": {
      "command": "node",
      "args": ["tools/wxkanban-mcp.mjs"],
      "env": {}
    }
  }
}
```

If `.claude/settings.json` exists but has other entries, merge — do not overwrite the file.

Report: `✓ MCP wxKanban registered` or `⚠ Already present`.

---

#### 2.2 — MCP: Claude in Chrome

Check `.claude/settings.json` for a `chrome` or `claude-chrome` MCP entry (used for browser-based UI testing and network inspection).

If missing, add alongside the wxKanban entry:

```json
"chrome": {
  "command": "node",
  "args": ["%APPDATA%/Claude/claude-chrome-mcp/server.js"],
  "env": {}
}
```

On Mac/Linux use `~/.config/claude/claude-chrome-mcp/server.js`.

Report: `✓ MCP Chrome registered` or `⚠ Already present` or `⚠ Chrome extension not installed — install from Claude settings`.

---

#### 2.3 — Database Tool: psql

Check for psql availability:
- Windows: `where psql`
- Mac/Linux: `which psql`

**If found**: report `✓ psql available (version X.Y)`.

**If missing**, report install instructions and continue (non-blocking):
```
⚠ psql not found. Install with:
  Windows:  winget install PostgreSQL.psql
            OR: scoop install postgresql
  Mac:      brew install libpq && brew link --force libpq
  Linux:    sudo apt-get install -y postgresql-client

psql is used for direct DB queries during debugging.
Alternative: use GET /api/admin/diagnostics from the Admin Dashboard.
```

---

#### 2.4 — API Testing: REST Client Extension

Check for the REST Client VSCode extension:

```bash
code --list-extensions 2>/dev/null | grep -i "humao.rest-client"
```

**If missing**, install it:

```bash
code --install-extension humao.rest-client
```

Report: `✓ REST Client installed` or `⚠ VSCode CLI not found — install REST Client manually (humao.rest-client)`.

---

#### 2.5 — Generate `tools/wx-api-tests.http`

Create `tools/wx-api-tests.http` (skip if already exists). This file is used by the VSCode REST Client extension for manual API verification.

Content template (substitute `PROJECT_ID` with resolved project ID):

```http
# wxKanban API Tests
# Usage: Open in VSCode with REST Client extension. Click "Send Request" above each block.
# Set @token before running authenticated requests (copy from localStorage.wxkanban_token).

@baseUrl = http://localhost:3001
@token = PASTE_TOKEN_HERE
@projectId = {PROJECT_ID}

### Health check (no auth required)
GET {{baseUrl}}/health

### API version
GET {{baseUrl}}/api/version

### Sign in (update credentials)
# @name login
POST {{baseUrl}}/api/auth/signin
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "your-password"
}

### List projects
GET {{baseUrl}}/api/projects
Authorization: Bearer {{token}}

### Get this project
GET {{baseUrl}}/api/projects/{{projectId}}
Authorization: Bearer {{token}}

### System diagnostics (ADMIN only)
GET {{baseUrl}}/api/admin/diagnostics
Authorization: Bearer {{token}}

### Team members
GET {{baseUrl}}/api/team
Authorization: Bearer {{token}}

### Notifications
GET {{baseUrl}}/api/notifications
Authorization: Bearer {{token}}
```

---

#### 2.6 — Generate `tools/db-check.js`

Create `tools/db-check.js` (skip if already exists). This is a standalone Node.js script that runs the 4-step debugging protocol against the local database — no auth required, reads `.env` directly.

```javascript
#!/usr/bin/env node
/**
 * wxKanban DB Health Check
 * Runs the 4-step debugging protocol:
 *   1. DB connectivity
 *   2. Key table + column existence
 *   3. Row counts
 *   4. Schema drift check (critical columns)
 *
 * Usage: node tools/db-check.js
 */
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) { console.error('DATABASE_URL not set'); process.exit(1); }
const dbUrl = rawUrl.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '');
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

const CRITICAL = {
  projects:       ['id','companyid','name','status','currentphase','createdat'],
  tasks:          ['id','projectid','name','status','priority','createdat'],
  specifications: ['id','projectid','specnumber','title','content','status'],
  projectphases:  ['id','projectid','phasename','status','assigneduserid'],
  users:          ['id','emailaddr','companyid','usertype','active'],
};

async function run() {
  console.log('\n=== wxKanban DB Health Check ===\n');

  // Step 1 — connectivity
  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    console.log(`✓ DB connected (${Date.now()-t0}ms)\n`);
  } catch (e) {
    console.error('✗ DB connection FAILED:', e.message);
    process.exit(1);
  }

  // Step 2 — table existence
  const { rows: tables } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  );
  const existing = new Set(tables.map(r => r.table_name));
  console.log(`Tables in DB (${existing.size}): ${[...existing].join(', ')}\n`);

  // Step 3 — row counts
  for (const t of ['projects','users','tasks','companies']) {
    if (existing.has(t)) {
      const { rows } = await pool.query(`SELECT COUNT(*)::text AS c FROM "${t}"`);
      console.log(`  ${t}: ${rows[0].c} rows`);
    } else {
      console.log(`  ${t}: ✗ TABLE MISSING`);
    }
  }

  // Step 4 — schema drift
  console.log('\nCritical column check:');
  for (const [table, cols] of Object.entries(CRITICAL)) {
    if (!existing.has(table)) { console.log(`  ${table}: ✗ TABLE MISSING`); continue; }
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name=$1 AND table_schema='public'`, [table]
    );
    const actual = new Set(rows.map(r => r.column_name));
    const missing = cols.filter(c => !actual.has(c));
    if (missing.length === 0) {
      console.log(`  ✓ ${table}`);
    } else {
      console.log(`  ✗ ${table} — missing columns: ${missing.join(', ')}`);
      console.log(`    Fix: npm run db:generate && npm run db:migrate`);
    }
  }

  console.log('\n=== Done ===\n');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
```

---

#### 2.7 — Tooling Bootstrap Report

After all checks, print:
```
=== TOOLING BOOTSTRAP ===
MCP wxKanban:    ✓ registered
MCP Chrome:      ✓ registered / ⚠ not found
psql:            ✓ v15.2 / ⚠ not installed (install instructions above)
REST Client ext: ✓ installed / ⚠ install humao.rest-client in VSCode
tools/ generated:
  ✓ tools/wx-api-tests.http  (API test file for REST Client)
  ✓ tools/db-check.js        (DB health check script)
=========================
```

---

### Step 3 — Fetch scaffold data

Call the wxKanban API:
```
GET https://localhost:3001/api/projects/{PROJECT_ID}/scaffold
Authorization: Bearer {WXKANBAN_API_TOKEN}
Content-Type: application/json
```

If the server is running locally, try `http://localhost:3001` first; fall back to the
`WXKANBAN_BASE_URL` environment variable if set.

Handle errors:
- **401**: "Authentication failed. Check that WXKANBAN_API_TOKEN is valid."
- **403**: "Access denied. Your token does not have access to project {PROJECT_ID}."
- **404**: "Project {PROJECT_ID} not found. Double-check the project ID."
- **500**: "Server error. Ensure the wxKanban dev server is running (npm run dev:server)."

Parse the JSON response as `ScaffoldResponse`:
```typescript
{
  project: { id, name, description, currentphase },
  overview: { content },              // may be empty string if AI still generating
  specs: [{ number, title, content }], // numbered spec stubs
  phases: [{ phasename, status, assigneduser: { fullname, emailaddr } | null }]
}
```

### Step 3 — Create directory structure

Create the following files relative to the current working directory:

```
.wxkanban-project              (JSON config)
CLAUDE.md                      (project-scoped instructions for Claude Code)
{ProjectName}-overview.md      (AI-generated project overview)
specs/
  001-{slug}/
    scope.md
  002-{slug}/
    scope.md
  ...
```

`{ProjectName}` = project name with spaces replaced by hyphens, lowercase.
`{slug}` = spec title slugified (lowercase, spaces → hyphens, non-alphanumeric removed).

If any file already exists, **skip** it (do not overwrite) and report which files were skipped.

### Step 4 — Write `.wxkanban-project`

```json
{
  "projectId": "{PROJECT_ID}",
  "projectName": "{project.name}",
  "currentPhase": "{project.currentphase}",
  "wxkanbanUrl": "http://localhost:5173/projects/{PROJECT_ID}",
  "initializedAt": "{ISO timestamp}"
}
```

### Step 5 — Write `CLAUDE.md`

Write a project-scoped CLAUDE.md with the following sections:

```markdown
# CLAUDE.md — {Project Name}

## Project Identity

- **Project**: {project.name}
- **Project ID**: {project.id}
- **wxKanban Workspace**: http://localhost:5173/projects/{project.id}
- **Current Phase**: {project.currentphase}

## Description

{project.description or "No description provided."}

## Phase Team Assignments

| Phase | Status | Lead |
|-------|--------|------|
| Design | {status} | {assigneduser.fullname or emailaddr or "Unassigned"} |
| Implementation | {status} | {assigneduser...} |
| QA | {status} | {assigneduser...} |
| Human Testing | {status} | {assigneduser...} |
| Beta | {status} | {assigneduser...} |
| Release | {status} | {assigneduser...} |

## Current Phase Focus

{dynamic section based on currentphase:}

### Design Phase
- All work in this phase produces approved specifications
- Create or update files in `specs/` directory
- Each spec must be numbered (001, 002, ...) and have a scope.md
- Specifications require approval before the phase can advance

### Implementation Phase
- Implement features according to approved Design specs
- Each task should reference the relevant spec number
- Mark tasks complete in wxKanban when done

### QA Phase
- Write and execute test cases mapped to Design specs
- Record pass/fail/blocked results in wxKanban
- All tests must pass before advancing

### Human Testing Phase / Beta Phase
- Track all feedback items raised by testers
- Each feedback item becomes a task in wxKanban
- Resolve all open items before advancing

### Release Phase
- Complete the release record (version, method, date, notes)
- All prior phases must be complete

## Spec Files

| Number | Title | Status |
|--------|-------|--------|
{spec table rows}

## wxKanban Workflow Commands

| Task | Command |
|------|---------|
| View project | Open: http://localhost:5173/projects/{project.id} |
| Refresh phase data | Run `/project.init` again |
| View phase | http://localhost:5173/projects/{project.id}/phase/{phase-slug} |

## Implementation Notes

- Never skip phases — the 6-phase lifecycle is enforced by wxKanban
- Phase advancement requires meeting all completion criteria (checked server-side)
- ADMIN users can assign phase leads and advance/reopen phases
- TEAM_MANAGER users can advance phases they are assigned to lead
- TEAM_MEMBER users can update task status but cannot advance phases

---

*Generated by `/project.init` on {ISO date}. Re-run to refresh.*
```

### Step 6 — Write overview document

Write `{project-name}-overview.md`:

```markdown
# {Project Name} — Overview

{overview.content if non-empty}

{if overview.content is empty:}
> ⏳ AI is generating the project overview. Run `/project.init` again in a few seconds to refresh.

---
*wxKanban Project ID: {project.id}*
*Fetched: {ISO timestamp}*
```

### Step 7 — Write spec files

For each spec in `specs[]`:

Create directory `specs/{spec.number}-{slug}/` and write `scope.md`:

```markdown
# Spec {spec.number}: {spec.title}

## Scope

{spec.content if non-empty, otherwise "Scope not yet defined."}

---
*wxKanban Project: {project.name} ({project.id})*
*Spec Number: {spec.number}*
```

### Step 8 — Report results

Print a completion summary:

```
===================================================
PROJECT INIT COMPLETE
===================================================

Project:     {project.name}
ID:          {project.id}
Phase:       {project.currentphase}
Workspace:   http://localhost:5173/projects/{project.id}

Files created:
  ✓ .wxkanban-project
  ✓ CLAUDE.md
  ✓ {project-name}-overview.md
  ✓ specs/001-xxx/scope.md
  ✓ specs/002-xxx/scope.md
  ...

Files skipped (already existed):
  - {list of skipped files, if any}

Specs loaded: {N}
Phase leads:
  Design         → {name or Unassigned}
  Implementation → {name or Unassigned}
  QA             → {name or Unassigned}
  Human Testing  → {name or Unassigned}
  Beta           → {name or Unassigned}
  Release        → {name or Unassigned}

Next steps:
  - Open CLAUDE.md to review the project context
  - View the workspace: http://localhost:5173/projects/{project.id}
  - Current phase ({currentphase}) focus is documented in CLAUDE.md
===================================================
```

---

## Error Handling

- **Missing token**: Abort with setup instructions (see Prerequisites above).
- **Network error**: "Could not connect to wxKanban server. Is `npm run dev:server` running?"
- **Invalid JSON from API**: "Unexpected response from server. Try again or check server logs."
- **Empty specs array**: Note "No specs generated yet" in report and skip specs/ directory.
- **File write failure**: Report which file failed and why; continue with remaining files.

---

## Re-run Behaviour

Running `/project.init` on an existing workspace:
- `.wxkanban-project` — **overwrite** (always refresh)
- `CLAUDE.md` — **overwrite** (always refresh phase assignments and status)
- `{name}-overview.md` — **overwrite** (refresh AI content)
- `specs/*/scope.md` — **skip** (preserve user edits)

---

## Notes

- This command is **read-only** against the wxKanban API — it never modifies the database.
- The `WXKANBAN_API_TOKEN` should have at minimum `project:read` scope.
- Phase slugs for URL navigation: design, implementation, qa, human-testing, beta, release.
