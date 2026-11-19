> **STATUS UPDATE 2026-06-27 — primary defects RESOLVED; this report is largely obsolete.**
> Verified live by direct `curl` SSE handshake against `https://mcp.wxperts.com`:
> - **(A) registration form** — fixed. `.mcp.json` uses the correct `type:"sse"` + `/sse` + `Bearer` form (§9a). `init.mjs` emits it as of kit v1.7.5.
> - **(B) `stream is not readable`** — fixed server-side. `GET /sse` → 200; `POST /messages` → **202 Accepted** + a proper `initialize` JSON-RPC response on the stream (no 400). `tools/list` returns 36 tools.
> - **Auth** — fine (token accepted); subscription was never the cause.
>
> **Remaining, smaller issues:** (1) connecting still requires a one-time `/mcp` approval / Claude Code restart — servers load only at startup, not mid-session. (2) **NEW:** the deployed server exposes **direct `project.<command>` tools** (`project.create_specs`, `project.buildscope`, …) — **`project.get_command_prompt` no longer exists**, so the `_wxAI/commands/*.md` stubs that call it are stale and need regenerating to call the direct tool. (3) Secondary kit-hygiene items from §4 (stale local-dev MCP entry in `_wxAI/settings.json`, misleading "renew subscription" error text, no session-start connectivity gate) may still apply — worth a small kit-fix scope.

# Bug Report — wxKanban hosted MCP is never registered with Claude Code at project init

**Reporter:** Claude Code (during `/wxConversion` → `/wxConversionScope` run)
**Date:** 2026-06-26
**Component:** wxKanban starter kit / `init.mjs` / `/wxAI-project-init` (kit version **v1.7.3**)
**Severity:** High — silently disables every MCP-delivered slash command for Claude Code users
**Status:** **NOT resolved.** Two distinct defects now confirmed: (A) the registration gap below, and
(B) a **server-side body-parsing bug** that 400s every JSON-RPC POST regardless of how the client is
registered (see **§9**, added 2026-06-26). The §6 workaround fixes (A) but is **insufficient on its own**
because of (B). Also: the documented MCP config form (`transport: "https"` + `env`) is **wrong** — the
server speaks the **SSE transport**; correct config is `type: "sse"` + `url: …/sse` (see §9).

---

## 1. Summary

A freshly initialized wxKanban project (kit v1.7.3, `mode: "new"`) does **not** contain a Claude Code
MCP registration for the hosted wxKanban server. As a result, Claude Code never connects to
`https://mcp.wxperts.com`, and the MCP tool `project.get_command_prompt` is unavailable. Every
command/skill whose methodology is delivered at runtime by that tool is therefore broken:
`wxConversionScope`, `buildscope`, `validateScope`, `createSpecs`, `analyzescope`, `research`, and
others.

The failure is silent and the in-skill error guidance is **misleading**: the skills say to renew the
wxKanban subscription, when the actual cause is that the MCP was never registered with Claude Code.

## 2. Environment

- Claude Code (VS Code extension), Windows 11.
- Project scaffolded by the wxKanban kit: `.wxkanban-project.json` `version: v1.7.3`,
  `kitVersion: v1.7.3`, `mode: "new"`, `mcpBaseUrl: https://mcp.wxperts.com`.
- `ai-settings.json` → `primaryAi: "generic"`.
- Server `https://mcp.wxperts.com` is up and the bearer token in `.env` is valid.

## 3. Root cause

`init.mjs` (and/or the un-run `/wxAI-project-init` bootstrap) writes the **wxperts-agent** MCP config
but never writes the **Claude Code** MCP config:

- ✅ `ai-settings.json` contains `mcpServers.wxkanban` (the wxperts agent reads this).
- ✅ `.env` contains `WXKANBAN_MCP_BASE_URL`, `WXKANBAN_API_TOKEN`, `WXKANBAN_PROJECT_ID`.
- ❌ `.claude/settings.json` **did not exist**. Only `.claude/settings.local.json` was present, and it
  contained permissions only — **no `mcpServers` block**.

Claude Code only connects MCP servers declared in `.claude/settings.json` / `.mcp.json` (or user
settings). It does **not** read `ai-settings.json` or `.env`. With no registration, the server is
never connected and none of its tools load.

The kit clearly *intends* this registration to happen — `/wxAI-project-init` §2.1 ("MCP: wxKanban
Server") documents writing exactly this block into `.claude/settings.json`:

```json
{
  "mcpServers": {
    "wxkanban": {
      "transport": "https",
      "url": "<mcpBaseUrl from .wxkanban-project.json>",
      "env": {
        "WXKANBAN_MCP_BASE_URL": "<mcpBaseUrl>",
        "WXKANBAN_API_TOKEN": "<from .env>",
        "WXKANBAN_PROJECT_ID": "<from .env>"
      }
    }
  }
}
```

…but on this machine that step never executed (or did not persist). So the gap is: **scaffold
creation and Claude Code MCP registration are decoupled**, and a project can be fully "initialized"
(`mode: "new"`, all commands/skills present) while the one thing that makes those commands work is
missing.

## 4. Contributing / secondary issues

1. **Stale developer path leaks into the kit template.** `_wxAI/settings.json` ships a *local-process*
   MCP entry pointing at another machine:
   ```json
   "mcpServers": {
     "wxkanban": { "command": "node", "args": ["tools/wxkanban-mcp.mjs"],
                   "cwd": "e:\\AI_Development\\wxperts\\wxKanban" }
   }
   ```
   This is the retired pre-028 *local* MCP model with a hardcoded `e:\AI_Development\...` path from a
   wxperts dev box. It can never work on a user machine and contradicts the hosted model the rest of
   the kit uses.

2. **Misleading failure message.** The skills’ fallback text ("requires an active wxKanban
   subscription… renew at …/billing") points users at billing, masking the real cause (MCP not
   registered with Claude Code). A user with a valid subscription is sent on a wild goose chase.

3. **No connectivity self-check.** Nothing in the session-start path (`/wxAI-session-start`) verifies
   the wxKanban MCP is actually reachable/registered before commands that depend on it are invoked.

4. **`primaryAi: "generic"`** — when the consumer is Claude Code, init should register the Claude Code
   MCP specifically rather than only emitting the generic `ai-settings.json`.

## 5. Steps to reproduce

1. Initialize a wxKanban project with kit v1.7.3 as a Claude Code user (don’t manually run the
   `/wxAI-project-init` environment-bootstrap step).
2. Confirm `ai-settings.json` and `.env` contain the wxkanban server + token, but `.claude/settings.json`
   has no `mcpServers` block (or doesn’t exist).
3. In Claude Code, run any MCP-delivered command, e.g. `/wxConversionScope` (or `/buildscope`).
4. **Observed:** the command can’t fetch its methodology; `project.get_command_prompt` is not an
   available tool; skill emits the subscription/billing message.
   **Expected:** the wxkanban MCP is connected and the command runs.

## 6. Workaround applied on this machine

1. Wrote `.claude/settings.json` with the `mcpServers.wxkanban` block exactly per `/wxAI-project-init`
   §2.1 (values from `.wxkanban-project.json` + `.env`).
2. **Restart Claude Code and approve the new project-scoped MCP server** (MCP servers connect only at
   startup; they do not hot-load mid-session).
3. Re-run the command.

(Note: writing `.claude/settings.json` was initially blocked by Claude Code’s self-modification
classifier because it embeds an API token into startup config — it required explicit user
authorization. Any automated fix the kit ships should account for that prompt.)

## 7. Recommended fixes

1. **Make `init.mjs` write the Claude Code MCP registration** into `.claude/settings.json` (merging,
   not overwriting) whenever the target tool is Claude Code — the same block `/wxAI-project-init` §2.1
   already documents. Don’t rely on a separate manual bootstrap step.
2. **Remove the hardcoded local-dev MCP entry** from `_wxAI/settings.json` (the
   `e:\AI_Development\wxperts\wxKanban` `command/cwd` block); ship the hosted `transport: "https"` form
   or nothing.
3. **Fix the fallback error text** so that, before blaming the subscription, it tells the user to check
   that the wxKanban MCP is registered with their AI tool and the session has been restarted. Ideally
   distinguish "MCP not registered/connected" from "subscription invalid (HTTP 401/402)".
4. **Add a connectivity gate** to `/wxAI-session-start`: ping `project.get_command_prompt` (or a health
   endpoint) and, if unavailable, print the exact registration + restart steps.
5. **Verify the Claude Code auth format.** The kit’s documented block uses `transport: "https"` + `env`.
   Confirm Claude Code’s MCP client actually forwards `WXKANBAN_API_TOKEN` from `env` as auth to a
   remote HTTP server; if not, the kit should emit the native `type: "http"` +
   `headers: { "Authorization": "Bearer <token>" }` form instead. (Env vars are for stdio/spawned
   servers, not remote HTTP auth — this format may silently fail to authenticate.)

## 8a. Verified still present after upgrade to v1.7.4 (2026-06-26)

Ran `node scripts/upgrade-kit.mjs` (v1.7.3 → **v1.7.4**). The upgrade's `init.mjs` now does a live
hosted-MCP check (`GET /health` → `status=ok version=0.1.0 dbConnected=true`) and validates the token
(`POST /call` sentinel → project reachable) — a good addition. **However, the core bug and secondary
issue #1 are NOT fixed in v1.7.4:**

- **Root cause unchanged:** `scripts/init.mjs` still contains **no code** that writes a Claude Code MCP
  registration. `grep -nE "\.claude/settings|mcpServers|wxkanban" scripts/init.mjs` returns only
  `wxkanban-agent`/gateway/`kit-configure` references — nothing that creates `.claude/settings.json`’s
  `mcpServers` block. The project only works because the hand-written `.claude/settings.json` from the
  workaround survived the upgrade. A clean v1.7.4 init would still leave Claude Code unconnected.
  (Possible intended path: the `node wxkanban-agent/bin/wxkanban-agent kit-configure` command printed by
  init — but it is not run automatically, so the gap stands.)
- **Secondary issue #1 unchanged:** `_wxAI/settings.json` still ships the stale local-process entry with
  `cwd: "e:\\AI_Development\\wxperts\\wxKanban"`, verbatim, in v1.7.4.

## 9. Direct endpoint probe — NEW critical findings (2026-06-26)

After the §6 workaround still didn't connect, the endpoint was probed directly with `curl` (no Claude
Code involved). This isolated two facts that change the conclusions above.

### 9a. The server uses the legacy MCP **SSE transport**, not streamable-HTTP — so the documented config is wrong

| Request | Result |
|---|---|
| `GET https://mcp.wxperts.com/` | `HTTP 401` (reachable, auth required) |
| `POST https://mcp.wxperts.com/` | `HTTP 404` — `Cannot POST /` (Express). MCP is **not** at the root. |
| `GET https://mcp.wxperts.com/sse` + `Authorization: Bearer <token>` | **`HTTP 200`**, `content-type: text/event-stream`, body: `event: endpoint` → `data: /messages?sessionId=<uuid>` |

This is the classic SSE-transport handshake: open the stream at `GET /sse`, then POST JSON-RPC to the
returned `/messages?sessionId=…`. Consequences:

- The kit-documented block (`transport: "https"`, §3) and the native streamable-HTTP form
  (`type: "http"` at the root url, §7.5) are **both incorrect** — they point Claude Code at `/` with the
  wrong transport. **Correct Claude Code config:**
  ```json
  {
    "mcpServers": {
      "wxkanban": {
        "type": "sse",
        "url": "https://mcp.wxperts.com/sse",
        "headers": {
          "Authorization": "Bearer <WXKANBAN_API_TOKEN>",
          "X-Project-Id": "<WXKANBAN_PROJECT_ID>"
        }
      }
    }
  }
  ```
  (`.claude/settings.json` on this machine has been updated to this form.)
- **Auth is fine.** The bearer token is accepted — `GET /sse` returns 200 and a live session endpoint.
  This rules out the subscription/token theory entirely.
- `X-Project-Id` header name is an unverified best guess (the handshake dies at 9b before it can be
  confirmed); the project id may instead be carried inside the token.

### 9b. **Server bug:** every JSON-RPC POST to `/messages` fails with `400 stream is not readable`

With a valid `sessionId` from 9a, POSTing the standard `initialize` request:

| POST `…/messages?sessionId=<uuid>` | Result |
|---|---|
| `Content-Type: application/json` (HTTP/2 *and* forced HTTP/1.1 + explicit Content-Length) | **`HTTP 400` — `InternalServerError: stream is not readable`** |
| `Content-Type: text/plain` | `HTTP 400` — `Unsupported content-type: text/plain` |
| no `Content-Type` | `HTTP 400` — `Unsupported content-type: application/x-www-form-urlencoded` |

The `text/plain` rejection proves the transport reads the request and **requires `application/json`** —
but when given `application/json`, it then **cannot read the body** (`stream is not readable`). This is the
well-known MCP-SSE server bug: a global `express.json()` (or equivalent body parser) **consumes the
request stream before** `SSEServerTransport.handlePostMessage(req, res)` is called, and the handler is
invoked **without** the already-parsed body, so its internal `getRawBody(req)` reads an exhausted stream.

**This breaks every client, not just Claude Code.** Claude Code's MCP client POSTs exactly
`Content-Type: application/json` + a JSON-RPC body, so it hits the identical 400. No client setting,
header, or registration can fix a server that consumes its own request stream. The §6 workaround
(register + restart) is therefore necessary but **not sufficient** until this is patched server-side.

### 9c. Server-side fix required

In the wxperts MCP HTTP server, on the `/messages` route, pass the pre-parsed body into the transport:

```js
// BROKEN: express.json() already drained req; handler re-reads the empty stream
app.post('/messages', express.json(), (req, res) => transport.handlePostMessage(req, res));

// FIX: hand the parsed body to the transport
app.post('/messages', express.json(), (req, res) => transport.handlePostMessage(req, res, req.body));
// — or — do NOT mount a body parser on /messages and let handlePostMessage read the raw stream itself.
```

**Minimal repro for wxperts:** `GET /sse` with a valid bearer token (works, returns a session), then
`POST /messages?sessionId=<id>` with `Content-Type: application/json` and any JSON-RPC body → `400
InternalServerError: stream is not readable`.

## 8. Impact

Until fixed, every Claude Code user who scaffolds a project and tries an MCP-delivered command hits a
dead end with a misleading "renew your subscription" message, despite a valid subscription and a
healthy server. The data-producing, script-backed commands (e.g. `/wxConversion`) still work because
they ship local scripts — which masks the problem until the user reaches a methodology-only command
like `/wxConversionScope`.
