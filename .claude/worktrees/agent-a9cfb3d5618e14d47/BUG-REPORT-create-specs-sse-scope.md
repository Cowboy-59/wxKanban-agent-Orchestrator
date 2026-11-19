# Bug Report — `create_specs` fails over Claude Code SSE (projectspecifications scope not threaded)

**Reporter:** Claude Code session, 2026-06-27
**Component:** hosted MCP (`mcp.wxperts.com`) — `project.create_specs` / `scoped-query` / SSE transport
**Severity:** High — blocks the documented createSpecs pipeline for Claude Code (SSE) users
**Status:** Open. Confirmed reproducible; a working `/call` workaround exists.

---

## Summary

`project.create_specs` fails with:

```
scope-required: projectspecifications access requires an authenticated token (MCP_AUTH_REQUIRED=true)
```

when invoked from **Claude Code over the SSE transport** (`/sse` + `/messages`), even on a warm,
authenticated session. The **same scope, same token, same session** succeeds over the kit `/call`
path. So this is a transport-specific scope-propagation defect, not a token, connection, or content
problem.

## Evidence

- In the same authenticated SSE session, `project.list_open_items` returns **correctly
  project-scoped** data — proving the bearer resolved to a real token scope
  (`middleware/auth.ts:99`, `authMode:'token'`, `projectId`/`customerId` set).
- `project.create_specs` throws `ScopeViolationError` at `mcp-server/src/db/scoped-query.ts:~43`,
  which fires only when the scope is `null` or `authMode === 'dev-bypass'`.
- Reproduced **twice** on a stable session (a separate earlier failure was a `409 "SSE transport
  not connected"` reconnect race — distinct issue).
- **Workaround verified:** the identical payload POSTed to `https://mcp.wxperts.com/call`
  (`{tool:"project.create_specs", args:{…}}`, `Authorization: Bearer …`) returns `HTTP 200`,
  preflight score 100, and creates the spec + plan + lifecycle docs + tasks. (`/call` runs
  `authMiddleware` per request and attaches `req.mcpScope`.)

## Root cause (hypothesis)

The `create_specs` handler does not thread the request's `req.mcpScope` into its
`projectspecifications` scoped-query, so that write receives a `null`/`dev-bypass` scope — while
read tools (`projecttasks` / `projectdocuments`) are correctly scoped. Either the create_specs
handler omits the scope pass-through, or the SSE `/messages` dispatch does not propagate the
per-session authenticated scope to write paths that use strict `scoped-query`.

## Suggested fix

Thread `req.mcpScope` into the `create_specs` → `projectspecifications` scoped-query (mirror how
`list_open_items` passes scope), or ensure the SSE message dispatch attaches the per-session
authenticated scope to every tool's DB context.

## Affected / reference files

- `mcp-server/src/db/scoped-query.ts` (~43 — the throw)
- `mcp-server/src/middleware/auth.ts` (~99 — scope set on valid bearer)
- `mcp-server/src/server.ts` (create_specs handler — likely missing scope pass-through)

## Secondary findings (separate, lower severity)

1. **`submit_feedback` requires a user-scoped token** (`-32602 "submit_feedback requires a
   user-scoped token"`). The project-scoped `.mcp.json` token cannot file feedback from Claude
   Code — so the in-product bug-report path is unavailable to SSE users with a project token.
2. **Preflight expects a `Core Design` table, not prose actors.** `shared/preflight/src/check.ts`
   detects `Primary Actor` / `Secondary Actors` / `Scope Boundary` only via the
   `| **Label** | value |` table (`extractCoreDesignValue`) or a `## Actors` section with
   `Primary:` / `Secondary:` lines. Prose labels like `**Primary actor:**` are NOT detected. The
   slash-command stubs don't document this, causing avoidable `blocked` results.
3. **`project.get_command_prompt` no longer exists** on the deployed server; the `_wxAI/commands/*`
   stubs that call it are stale (the server exposes direct `project.<command>` tools).

## Impact

Claude Code (SSE) users cannot run `createSpecs` (and any write tool hitting `projectspecifications`
via strict scoped-query). The kit `/call` path and read tools are unaffected. Until fixed, push
specs via `/call` or author spec artifacts on disk.
