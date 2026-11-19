# Spec 097: MCP Token/Project Binding Hardening

## Overview

Two independent defects in the hosted MCP path (mcp.wxperts.com), both in the "resolve identity from the authenticated caller, don't assume a local default" family.

Defect A — project resolution ignores the token's project. The server authenticates a bearer token and already resolves it to a project (mcpScope.projectId in middleware/auth.ts), and the scoped-DB write layer correctly stamps and enforces that project. But a second, parallel resolution path — resolveProjectContext(args) / withResolvedProjectId in server.ts — never consults the token. When a call omits projectId, it falls back to env then to the server container's own .wxkanban-project.json (wxKanban Development, ba924193). That stale value feeds project_mcp_health.projectContext (the misleading readout that burned multiple sessions) and any non-scoped read or generator path. Correction to the source report: scoped writes are already token-bound and reject a mismatched projectId, so the report's "silent cross-project mis-write" is largely backstopped. The real defect is the split-brain: health, logs, and non-scoped reads name one project while writes use another.

Defect B — two kit MCP clients disagree on token validation. core/orchestrator/mcp-client.ts (the write path) forwards the token untouched and lets the server decide. core/http/mcp-client.ts throws in its constructor on any token failing TOKEN_RE (wxk_(live|test)_ 64 hex). When a path routes through the shape-checking client, a server-valid legacy token is rejected client-side, manufacturing a phantom "wxk_live required" blocker. Client-side shape enforcement is wrong policy: it can only produce false negatives; token acceptance is a server authorization decision.

## Business Problem

Consuming projects such as YappChat connect to the hosted MCP with only a bearer token and no per-call project scoping. Two failures compound and burn engineering sessions. First, project_mcp_health and any non-scoped path report the server's own default project instead of the caller's, so a diagnosing session concludes it is operating against the wrong project and chases a problem that does not exist. Second, a client-side token-shape regex rejects a token the server actually accepts, inventing a "you need a wxk_live token" blocker that stalls work and triggers token-chasing. Both trace to assuming a local default identity instead of resolving it from the authenticated caller. The cost is repeated multi-hour dead-ends across every project that talks to the hosted MCP.

## Actors

- Primary: A consuming project's AI client (for example YappChat) that calls the hosted MCP with only a bearer token and no per-call projectId, and needs every tool call plus health readout to agree on that project.
- Secondary: The hosted MCP server, which is the token-to-project authority, and the kit's two MCP client modules that must share one token-passing policy.

## Success Metrics

1. 100% of token-authenticated tool calls that omit projectId resolve to the token's project (resolutionSource "token"), verified across at least 5 project-scoped tools; the server container's ba924193 default never becomes the source for a token caller.
2. project_mcp_health under a token reports the token's projectId in 100% of calls and matches the destination a same-token write uses, reproduced against the exact scenario that misled the YappChat sessions (0 leaks of the server default to a token caller).
3. 0 server-valid tokens are rejected client-side; a legacy non-wxk_ token passes through both kit MCP clients in 2 of 2 parity tests, and constructing the http McpClient with that token no longer throws.
4. The cross-project write guard is unchanged: 100% of scoped writes carrying a mismatched projectId still throw scope-mismatch, and the check-no-direct-db guard continues to pass with 0 new direct-db violations.

## Scope Boundary

In scope: (A) make the token's mcpScope.projectId the priority-2 default in withResolvedProjectId and resolveProjectContext (ahead of the WXKANBAN_PROJECT_ID env var and the .wxkanban-project.json file), add a "token" value to the ProjectContextSource union, and make project_mcp_health report the per-request token project with source "token"; (B) remove the TOKEN_RE constructor throw in core/http/mcp-client.ts and give both kit MCP clients one shape-agnostic token-passing policy. Touch points: mcp-server/src/server.ts, mcp-server/src/utils/project-context.ts, mcp-server/src/utils/mcp-health.ts, wxkanban-agent/core/http/mcp-client.ts, wxkanban-agent/core/orchestrator/mcp-client.ts, plus their unit tests.

## Out of Scope

Deliberately excluded and deferred: a new X-Wxkanban-Project-Id header or query-param project binding on the .mcp.json transport (the source report's primary Fix A) is rejected because the token already resolves to a project and a header adds config surface plus a spoofing question. Also excluded: token issuance, rotation, or server-side deprecation of legacy tokens (a separate scope with an explicit actionable server error); any change to the scoped-query enforcement or auth middleware, which are already correct and must not be weakened; and the local command-gateway routing owned by SCOPE-068.

## Open Questions

None outstanding. Two decisions were resolved during scope authoring: the transport header is rejected in favor of token-to-project resolution, and FR-006 uses policy parity (both clients pass the token through) rather than a shared-module unification refactor.

## Functional Requirements

### FR-001 — Token's project is the authoritative default

withResolvedProjectId MUST prefer the authenticated token's project (mcpScope.projectId) over the env var and the server-side .wxkanban-project.json fallback when a project-scoped tool call omits projectId. Precedence: explicit projectId/projectid in args, then mcpScope.projectId from the token, then WXKANBAN_PROJECT_ID env, then the file. The file fallback is retained only for dev-bypass and no-token local runs.

**Acceptance Criteria**:
- [ ] Token-authenticated call omitting projectId resolves to the token's project with source "token"
- [ ] Explicit valid projectId in args still wins (source "args")
- [ ] Dev-bypass (no mcpScope.projectId) falls through to env then file exactly as today

### FR-002 — project_mcp_health reflects the token's project

When the health tool is called under a token, its projectContext MUST report the token-resolved project and source "token", not the server's startup file default, resolved per request rather than from the frozen startup state.

**Acceptance Criteria**:
- [ ] project_mcp_health under a token returns the token's projectId with source "token"
- [ ] The reported project matches the project a same-token write would target
- [ ] Dev-bypass (no token) returns the unchanged startup file/env readout

### FR-003 — No weakening of the cross-project write guard

The scoped-DB enforcement (insertScoped/updateScoped/selectScoped binding to scope.projectId, scope-mismatch on conflict) MUST remain intact; resolution changes MUST NOT let an args projectId cause a scoped write to a project other than the token's.

**Acceptance Criteria**:
- [ ] A scoped write with args projectId not equal to the token project still throws scope-mismatch
- [ ] No handler bypasses the scoped helpers for a project-scoped table as a result of this change
- [ ] The check-no-direct-db guard still passes

### FR-004 — Add source "token" to the resolution model

ProjectContextResolution.source and ProjectContextSource MUST gain a "token" value, threaded through resolution and health surfaces so telemetry and logs distinguish token-resolved from args, env, and file.

**Acceptance Criteria**:
- [ ] ProjectContextSource union includes "token"
- [ ] tool.call.start and audit logs record resolutionSource "token" on token-resolved calls
- [ ] No caller of resolveProjectContext breaks on the new enum value

### FR-005 — Remove client-side token-shape enforcement

core/http/mcp-client.ts MUST NOT throw on token shape; the TOKEN_RE constructor throw is removed and the server is the sole authority on token acceptance. A missing token for a hosted endpoint still fails fast with the existing actionable message.

**Acceptance Criteria**:
- [ ] Constructing McpClient with a legacy non-wxk_ token does not throw
- [ ] Hosted endpoint with no token still throws the existing "no API token resolved" guidance
- [ ] A server-rejected token surfaces as the server 401/error, not a client-side shape error

### FR-006 — Single token-passing policy across both clients

The two kit MCP clients (core/orchestrator/mcp-client.ts and core/http/mcp-client.ts) MUST share one shape-agnostic token-passing policy so no route can reintroduce a client-side shape gate; no shared-module unification refactor is required.

**Acceptance Criteria**:
- [ ] Neither client applies a token-shape regex gate
- [ ] A test asserts a non-wxk_ token is passed through by both clients
- [ ] Token precedence is documented in one place and honored by both clients

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-07-13
- **Phase**: design
- **Spec ID**: 7f695a14-2981-4f62-b1d8-9174989e6712
