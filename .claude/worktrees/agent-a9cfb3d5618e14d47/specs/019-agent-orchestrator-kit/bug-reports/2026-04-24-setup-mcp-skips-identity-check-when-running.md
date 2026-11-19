# `setup-mcp.mjs` silently adopts a running MCP bound to a different project

**Reporter:** andy@wxperts.com
**Date:** 2026-04-24
**Kit version:** v2.0.0 (`.wxkanban-project.json`), `mcpStartupScript: scripts/setup-mcp.mjs`
**mcp-server:** 0.1.0 · **wxkanban-agent:** 1.0.0
**Platform:** Windows 10 (win32), Node v24.6.0
**Severity:** High — identical cross-project contamination as the 2026-04-20 bug. R16 AC1 was intended to fix this.
**Related:** `specs/019-agent-orchestrator-kit/bug-reports/2026-04-20-mcp-startup-cross-project-binding.md`; spec 019 R16 AC1; commit `113b16e` ("spec(019): R16 AC1 — both init.mjs AND setup-mcp.mjs run identity check"); orchestrator v0.1.7 where AC1 was said to ship.

---

## Summary

Spec 019 R16 AC1 states:

> WHEN either `scripts/init.mjs` OR `scripts/setup-mcp.mjs` detects an MCP process already listening on port 3002 via its PID file THEN it SHALL POST `{tool: 'project.mcp_health', args: {}}` to `http://localhost:3002/call` and parse `projectContext.projectId` from the response.

The commit history (`113b16e`) says the implementation of this shipped in orchestrator v0.1.7. The `setup-mcp.mjs` currently in `scripts/setup-mcp.mjs` on `main` (file size 399 lines) does **not** call `project.mcp_health` anywhere. Instead it calls `project.help` as a readiness probe and treats a 200 response as sufficient proof that the running MCP is "ours." This is the same silent-adoption failure mode the 2026-04-20 report filed against `init.mjs`.

---

## Impact

Identical to the 2026-04-20 report — a workstation with a previously-launched MCP for project A, combined with a new session in project B, produces:

1. **Spec numbering corruption.** `buildscope` returns A's next number, written to B's tree as an orphan spec (or worse, to A's tree with a `writeToCurrent` flag that follows A's `projectId`).
2. **Cross-project data contamination.** `list_open_items`, `capture_event`, `create_task`, `upsert_document` all read/write under A's `projectId` while the developer believes they are in B.
3. **Silent failure.** CLI output says `MCP HTTP endpoint already ready` in green — the opposite of "loud failure" that R16 AC5 mandates.

Observed live during scope 025 buildscope on 2026-04-24: MCP was bound to Job Scheduler (`c9ee6375-f79f-4484-8f72-7e121aed05a4`, 2 scopes). The wxKanban session should have been bound to `ba924193-0335-4080-9fa6-33cd6b81300a` (24 scopes, next=025). First `buildscope --featureDescription "Project Overview Builder" --quick` returned `Spec 003 created via project.buildscope`. Correct for Job Scheduler. Catastrophically wrong for wxKanban.

---

## Reproduction

1. Start MCP bound to project A (`WXKANBAN_PROJECT_ID=A`) on port 3002.
2. `cd` into project B (different `WXKANBAN_PROJECT_ID=B`).
3. `node scripts/setup-mcp.mjs`.
4. Observe log line:
   ```
   [mcp] MCP HTTP endpoint already ready (project.help readiness passed on port 3002)
   ```
   → exit 0, no identity mismatch reported.
5. `curl -s -X POST http://localhost:3002/call -H "Content-Type: application/json" -d '{"tool":"project.mcp_health","args":{}}'`.
   → `projectContext.projectId` is A, not B.
6. Any subsequent CLI command from project B executes against A.

---

## Root Cause

### File: `scripts/setup-mcp.mjs:256-271` (function `startServer`)

```js
async function startServer() {
  const initialEnv = loadEnv();
  const alreadyReady = await waitForMcpReadiness(initialEnv, 2500);
  if (alreadyReady.ok) {
    log('mcp', colors.green, `MCP HTTP endpoint already ready (${alreadyReady.detail})`);
    if (!existsSync(PID_FILE)) {
      appendLog('INFO: setup-mcp detected healthy MCP endpoint without PID file; skipping spawn');
    }
    return true;                                    // ← returns without identity check
  }

  const currentPid = isRunning();
  if (currentPid) {
    log('mcp', colors.yellow, `MCP server is already running (PID: ${currentPid})`);
    return true;                                    // ← returns without identity check
  }

  // ... only from here does a fresh spawn happen with the correct WXKANBAN_PROJECT_ID
}
```

And `waitForMcpReadiness` at `setup-mcp.mjs:223-246` probes only `project.help`:

```js
body: JSON.stringify({ tool: 'project.help', args: {} }),
// ...
return { ok: true, detail: `project.help readiness passed on port ${port}` };
```

There is no path in this file where `project.mcp_health` is called or where `projectContext.projectId` is compared against `loadEnv().WXKANBAN_PROJECT_ID`.

`grep -n "mcp_health" scripts/setup-mcp.mjs` returns zero matches.

### What R16 AC1 actually requires

R16 AC1 (as of commit `113b16e`) requires BOTH early-return paths in `startServer`:

- path A: `project.help` readiness succeeds → an MCP is alive on :3002
- path B: PID file exists and points to a live process

to FIRST call `project.mcp_health`, compare `projectContext.projectId` to the local env, and only return success on match. On mismatch: kill the stale PID, remove `.mcp-server.pid`, and fall through to the spawn path (which already loads env correctly).

---

## Proposed Fix

Insert an identity check between lines 258 and 265 of `scripts/setup-mcp.mjs`, and again between lines 267 and 270:

```js
async function assertProjectIdentityOrKill(env, reasonTag) {
  try {
    const resp = await fetch('http://localhost:3002/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'project.mcp_health', args: {} }),
    });
    const body = await resp.json();
    const text = body?.content?.[0]?.text;
    const health = typeof text === 'string' ? JSON.parse(text) : null;
    const runningProjectId = health?.projectContext?.projectId;
    const expectedProjectId = env.WXKANBAN_PROJECT_ID;
    if (runningProjectId && runningProjectId !== expectedProjectId) {
      log('mcp', colors.red,
        `R16 identity mismatch (${reasonTag}): running=${runningProjectId} expected=${expectedProjectId}. Killing stale MCP.`);
      const stalePid = isRunning();
      if (stalePid) process.kill(stalePid, 'SIGKILL');
      if (existsSync(PID_FILE)) rmSync(PID_FILE);
      return { matched: false };
    }
    return { matched: true };
  } catch (err) {
    log('mcp', colors.yellow,
      `R16 identity check failed to parse mcp_health (${reasonTag}): ${err?.message ?? err}`);
    return { matched: false };   // fail safe → force re-spawn
  }
}

async function startServer() {
  const initialEnv = loadEnv();
  const alreadyReady = await waitForMcpReadiness(initialEnv, 2500);
  if (alreadyReady.ok) {
    const identity = await assertProjectIdentityOrKill(initialEnv, 'readiness-path');
    if (identity.matched) {
      log('mcp', colors.green, `MCP HTTP endpoint already ready (${alreadyReady.detail})`);
      return true;
    }
    // fall through to spawn path below
  } else {
    const currentPid = isRunning();
    if (currentPid) {
      const identity = await assertProjectIdentityOrKill(initialEnv, 'pidfile-path');
      if (identity.matched) {
        log('mcp', colors.yellow, `MCP server is already running (PID: ${currentPid})`);
        return true;
      }
      // fall through to spawn path
    }
  }

  // existing spawn logic ...
}
```

Key behaviors:

- Calls `project.mcp_health` on BOTH early-return paths (readiness and PID-file).
- On mismatch: kills the stale PID, removes the PID file, falls through to the existing spawn path (which already loads env correctly).
- On parse / network failure: fails safe by treating it as a mismatch (better to restart than silently adopt).
- Log line is prefixed `R16 identity mismatch` so the failure is visible in CLI output per R16 AC5.

---

## Verification After Fix

Reproduce the scenario from "Reproduction" above. Expected after fix:

1. `node scripts/setup-mcp.mjs` in project B detects A-bound MCP.
2. CLI prints a red `R16 identity mismatch (readiness-path): running=<A-id> expected=<B-id>. Killing stale MCP.` line.
3. Script falls through to spawn a fresh MCP bound to B's `WXKANBAN_PROJECT_ID`.
4. `curl POST /call project.mcp_health` → `projectContext.projectId` equals B.
5. `buildscope --featureDescription test --quick` in B → `specNumber: "001"` (or B's actual next number).

The test plan in the 2026-04-20 report's "Suggested Verification After Fix" section can be re-used verbatim — this is the same scenario, just a different entry point.

---

## Workaround Until Fixed

Manual identity-check wrapper the user can run before trusting `setup-mcp.mjs`:

```bash
RUNNING=$(curl -s -X POST http://localhost:3002/call \
  -H "Content-Type: application/json" \
  -d '{"tool":"project.mcp_health","args":{}}' \
  | python -c "import sys,json;d=json.loads(sys.stdin.read());print(json.loads(d['content'][0]['text'])['projectContext']['projectId'])" 2>/dev/null)
EXPECTED=$(grep ^WXKANBAN_PROJECT_ID= .env | cut -d= -f2)
if [ "$RUNNING" != "$EXPECTED" ] && [ -n "$RUNNING" ]; then
  echo "MCP bound to wrong project: $RUNNING (want $EXPECTED). Killing."
  powershell.exe -Command "Get-NetTCPConnection -LocalPort 3002 | Select -Expand OwningProcess | ForEach-Object { Stop-Process -Id \$_ -Force }"
  rm -f .mcp-server.pid
fi
node scripts/setup-mcp.mjs
```

---

## Evidence (from scope-025 session 2026-04-24)

Attached logs:

- `/tmp/setup-mcp.log` — first run; reports `MCP HTTP endpoint already ready` while bound to Job Scheduler.
- `/tmp/setup-mcp-2.log` — second run, after manual kill; correctly spawns fresh MCP for wxKanban (PID 37860).

Pre-fix `mcp_health` output (bound to A, wrong project):
```
projectContext.projectId = c9ee6375-f79f-4484-8f72-7e121aed05a4  (Job Scheduler)
startupTime              = 2026-04-22T12:20:01.112Z
```

Post-manual-kill `mcp_health` output (bound to B, correct):
```
projectContext.projectId = ba924193-0335-4080-9fa6-33cd6b81300a  (wxKanban Development)
startupTime              = 2026-04-24T01:06:26.787Z
```

First `buildscope` call returned `Spec 003 created via project.buildscope` — confirming the MCP was writing under Job Scheduler's counter (2 scopes → next=003), not wxKanban's (24 scopes → next=025). After fix / manual rebind, `buildscope` correctly returned `Spec 025 created`.
