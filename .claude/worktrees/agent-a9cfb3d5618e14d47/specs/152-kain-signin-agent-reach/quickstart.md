# Quickstart: K.A.I.N. Sign-in and Agent Reach

**Spec Number**: 152

## Setup

1. Review the spec: `specs/152-kain-signin-agent-reach/spec.md` (and SCOPE-132 Amendment F in
   `specs/Project-Scope/132-kain-autonomous-driver.md`)
2. Review the plan: `plan.md`
3. Review tasks: `tasks.md`
4. Review tests: `tests.md`

SQL waits for the owner: `sql/0001-agentdevicetokens.sql` before T003, `sql/0002-retire-company-agent-tokens.sql`
at release.

## Development

1. Start with T001 (verify; findings in `research.md`), then T002 – T003 (data), T004 (`agentReach`)
2. Fence new code `[SCOPE 152 / Tnnn]` through `implement`
3. Run `npm test` (app) and the `mcp-server` suite; `npm run db:drift` after T003
4. `wxkanban-agent auditfences` on the touched files before any push

## Trying it

1. `POST /api/agent/signin` with your own email, password and a device name
2. `GET /api/agent/grants` with the returned token: own company's Projects, then each client's
3. `POST /api/agent/connect { projectId }` for a client Project; call an MCP tool with the minted token
4. Turn Allow remote off on that Project: the next MCP call answers 401 `access_revoked`
