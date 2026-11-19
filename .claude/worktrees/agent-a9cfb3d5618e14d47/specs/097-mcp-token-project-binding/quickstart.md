# Quickstart: MCP Token/Project Binding Hardening

**Spec Number**: 097
**Date**: 2026-07-13

## What this scope does

Fixes two hosted-MCP defects so the authenticated token — not the server container's local file — is the single source of truth for a request's project, and so no kit client rejects a server-valid token.

## Where the code lives

Server (hosted MCP — deploys to prod on push to main):
- `mcp-server/src/utils/project-context.ts` — resolution precedence + `source: "token"`
- `mcp-server/src/server.ts` — `withResolvedProjectId` threads `mcpScope.projectId`
- `mcp-server/src/utils/mcp-health.ts` — per-request token project in health
- (unchanged, guardrail) `mcp-server/src/db/scoped-query.ts`, `mcp-server/src/middleware/auth.ts`

Kit (ships via `scripts/sync-to-orchestrator.mjs`):
- `wxkanban-agent/core/http/mcp-client.ts` — remove `TOKEN_RE` throw
- `wxkanban-agent/core/orchestrator/mcp-client.ts` — parity (already shape-agnostic)

## Verify locally

```bash
# server unit tests (precedence + health)
cd mcp-server && npm test

# kit client tests (legacy token accepted + parity)
cd wxkanban-agent && npm test -- mcp-client

# fence audit before any push
npx tsx wxkanban-agent/... auditfences   # filter to the files above
```

## Manual smoke (the original symptom)

Call `project_mcp_health` with a consuming project's token → `projectContext.projectId` must equal that token's project with `source: "token"`, matching where a same-token write lands.

## Release gate

Nothing is pushed or published until the user says so. Server and kit land on different surfaces but read best deployed together.
