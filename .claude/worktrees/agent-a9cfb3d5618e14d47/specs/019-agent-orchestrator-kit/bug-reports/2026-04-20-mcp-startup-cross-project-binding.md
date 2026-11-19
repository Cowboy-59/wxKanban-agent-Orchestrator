# MCP startup silently adopts stale server bound to a different project

**Reporter:** andy@wxperts.com
**Date:** 2026-04-20
**Kit version:** v0.1.5 (`.wxkanban-project.json`)
**mcp-server:** 0.1.0 · **wxkanban-agent:** 1.0.0
**Platform:** Windows 10 (win32), Node v24.6.0
**Severity:** High — causes scope numbering and project attribution to belong to a *different* project without any warning.

---

## Summary

Running `node scripts/init.mjs` in a freshly-initialized project silently adopted an MCP server process left over from a different project (different `WXKANBAN_PROJECT_ID`). All subsequent MCP calls — including `project.buildscope` — were served under the wrong project's identity. In this case:

- Local project: `c9ee6375-f79f-4484-8f72-7e121aed05a4` ("Job Scheduler"), **0 existing scopes**.
- Actually-serving MCP: bound to `ba924193-0335-4080-9fa6-33cd6b81300a` ("wxKanban Development"), **24 existing scopes**.
- First `buildscope --feature-description init` returned `specNumber: "025"` — correct for the bound project, catastrophically wrong for ours.

There was no warning, no health-check assertion, and no visible indication that init.mjs had adopted a server belonging to a different project.

---

## Impact

1. **Spec numbering corruption.** New scopes get a number from a foreign project's counter; a `createspecs` run would likely write `specs/Project-Scope/025-init.md` into our tree while the MCP's DB-side counter reflects a project we don't own.
2. **Cross-project data contamination.** Any `dbpush`, `capture_event`, `upsert_document`, `list_open_items`, or `create_task` would write/read against the wrong `projectId`. `list_open_items` in our session returned tasks from the foreign project (confirmed via MCP response).
3. **Silent failure.** The health-check in `init.mjs` reports `✓ All services healthy` because :3002 responds — it never asks *which* project is bound.

---

## Reproduction

1. In project A, run `node scripts/init.mjs` (MCP starts, binds to project-A id via `.env`/`WXKANBAN_PROJECT_ID`).
2. Close / walk away from project A without killing the detached MCP process. The server continues running on :3002.
3. Open project B in a different directory the next day. Run `node scripts/init.mjs`.
4. `init.mjs` logs `MCP already running with PID: N` and proceeds.
5. Run `buildscope --feature-description foo` in project B. The returned `specNumber` is project A's `count + 1`, not `001`.
6. `curl -s -X POST http://localhost:3002/call -d '{"tool":"project.mcp_health","args":{}}'` — confirms `projectContext.projectId` is project A's id, not B's.

---

## Root Cause Analysis — Three Distinct Bugs

### Bug 1: `scripts/init.mjs` does not validate the running MCP's project identity

**File:** `scripts/init.mjs`
**Behavior today:** probes whether a PID is alive on :3002 and, if so, logs `MCP already running with PID: N`. Never asks the server which project it is serving.

**Why it matters:** MCP servers are process-level singletons on a fixed port, but the project they serve is determined by env vars at startup. A stale server from any other directory/session will look indistinguishable from "ours" to a PID/port probe.

**Proposed fix:**
After the PID check (and before declaring success), call `project.mcp_health` and assert:
```js
health.projectContext.projectId === env.WXKANBAN_PROJECT_ID
```
If mismatch: kill the stale PID, remove `.mcp-server.pid`, and restart. Log the mismatch loudly.

---

### Bug 2: `scripts/setup-mcp.mjs` hardcodes the stdio entrypoint and ignores the project config

**File:** `scripts/setup-mcp.mjs:11`
```js
const mcpEntry = path.join(root, 'mcp-server', 'dist', 'index.js');
```

**Why it matters:** `.wxkanban-project.json` declares:
```json
"mcpServer": "mcp-server/dist/index-http.js",
"mcpTransport": "http",
"mcpHttpUrl": "http://localhost:3002"
```
…but setup-mcp.mjs ignores all three and always launches the **stdio** transport (`index.js`). When a user correctly kills a stale HTTP MCP and re-runs setup-mcp, they get a stdio process that the HTTP-based command gateway on :3003 cannot reach. Gateway returns 500 on every tool call and nothing indicates the transport mismatch.

**Repro:**
```bash
# Kill any MCP on :3002
# Then:
node scripts/setup-mcp.mjs       # reports "MCP started. PID: N" — but it's stdio
curl http://localhost:3002/call  # connection refused — nothing listening
```

**Proposed fix:**
Read `mcpServer` from `.wxkanban-project.json`; fall back to `index.js` only if the field is missing.

---

### Bug 3: `setup-mcp.mjs` reports success without verifying the child actually bound the port

**File:** `scripts/setup-mcp.mjs:66-79`

**Behavior today:** `spawn(...)` → write PID file → `console.log('MCP started. PID: ...')` → exit 0. No wait, no health probe, no port check.

**Failure modes this hides:**
- Child crashes during startup (missing env, bad build) — PID file still written.
- Port 3002 already held by another process — `listen(EADDRINUSE)` silently in the log file, script returns success.
- Wrong transport launched (see Bug 2) — nothing ever listens on :3002.

**Proposed fix:**
After spawn, poll `POST http://localhost:<port>/call` (or equivalent health endpoint) for up to N seconds. On timeout, tail the last lines of `logs/mcp-server.log` to stderr and exit non-zero. Do not write `.mcp-server.pid` until the child is confirmed healthy.

---

## How We Discovered It

`buildscope --feature-description init` returned `specNumber: "025"` in a project where `specs/` did not exist. Investigation path:

1. `cat .wxkanban-project.json` → our projectId is `c9ee6375`.
2. `curl POST /call project.mcp_health` → MCP reports `projectId: ba924193`, `startupTime: 2026-04-19T10:05:35Z` (yesterday).
3. `curl POST /call project.list_open_items` → returns tasks for `ba924193` (confirming cross-project contamination).
4. `powershell Get-Process -Id <pid-on-:3002>` → `StartTime: 4/19/2026 5:05:32 AM` (yesterday's process from a different directory).

---

## Suggested Verification After Fix

A test that exercises all three bugs together:

1. In temp project A, run init.mjs (MCP bound to A, listening on :3002).
2. In temp project B (different `WXKANBAN_PROJECT_ID`), run init.mjs.
3. Expect: init.mjs detects project-id mismatch, kills A's MCP, starts B's MCP on HTTP transport, waits for health, reports ready.
4. `buildscope --feature-description test` in B → `specNumber: "001"`.
5. `mcp_health.projectContext.projectId` equals B's id.

---

## Workarounds Until Fixed

1. Before trusting init.mjs output, always verify:
   ```bash
   curl -s -X POST http://localhost:3002/call \
     -H "Content-Type: application/json" \
     -d '{"tool":"project.mcp_health","args":{}}' | grep projectId
   ```
2. If project id mismatch: `powershell Stop-Process -Id $(netstat -ano | grep :3002 | awk '{print $5}') -Force`, delete `.mcp-server.pid`, and start the HTTP MCP directly:
   ```bash
   set -a; source .env; set +a
   nohup node mcp-server/dist/index-http.js >> logs/mcp-server.log 2>&1 &
   ```
