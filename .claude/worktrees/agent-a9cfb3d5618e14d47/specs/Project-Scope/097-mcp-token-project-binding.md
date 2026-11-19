# SCOPE-097: MCP Token/Project Binding Hardening

**Scope Number**: SCOPE-097
**Status**: `draft`
**Created**: 2026-07-13
**Last Reviewed**: 2026-07-13 (both defects diagnosed and confirmed in code during authoring)
**Depends On**: SPEC-028 (Hosted MCP Deployment — bearer auth `middleware/auth.ts`, scoped-query enforcement `db/scoped-query.ts`, the `core/http` + `core/orchestrator` MCP clients).
**Related Scopes**: Same "resolve identity from the caller, don't assume a default" family as SCOPE-068 (Multi-Project Gateway Isolation), which explicitly deferred hosted-MCP routing — this scope picks that up on the hosted-MCP side. Also related to `specs/019-agent-orchestrator-kit/bug-reports/2026-04-20-mcp-startup-cross-project-binding.md`.
**Source**: `specs/Project-Scope/097-mcp-token-project-binding.md`
**Originating report**: `E:\AI_Development\wxperts\YappChat\KIT-DEFECT-mcp-default-project-and-token.md` (YappChat, project `1993e2ba-2322-4b9d-809d-246ffdbe344c`)

---

## Overview

Two independent defects in the **hosted MCP path** (`mcp.wxperts.com`), both in the "resolve identity from the authenticated caller, don't assume a local/default" family.

**Defect A — project resolution ignores the token's project.** The server authenticates a bearer token and already resolves it to a project (`mcpScope.projectId`), and the scoped-DB write layer correctly stamps and enforces that project. But a *second, parallel* resolution path — `resolveProjectContext(args)` / `withResolvedProjectId` — never consults the token. When a call omits `projectId`, it falls back to env then to the server container's own `.wxkanban-project.json` (= "wxKanban Development", `ba924193`). That stale value feeds `project_mcp_health.projectContext` (the misleading readout that burned multiple sessions) and any non-scoped read/generator path.

**Correction to the source report:** scoped *writes* (`create_specs`, `create_task`, `upsert_document`) are already bound to the token's project and reject a mismatched `projectId`, so the report's "silent cross-project mis-write" is largely backstopped. The real defect is the split-brain: health, logs, and non-scoped reads name one project while writes use another.

**Defect B — two kit MCP clients disagree on token validation.** `core/orchestrator/mcp-client.ts` (the write path) forwards the token untouched and lets the server decide. `core/http/mcp-client.ts` throws in its constructor on any token failing `TOKEN_RE = /^wxk_(live|test)_[a-f0-9]{64}$/`. When a path routes through the shape-checking client, a server-valid legacy `drHs…` token is rejected client-side, manufacturing a phantom "wxk_live required" blocker. Client-side shape enforcement is wrong policy — it can only produce false negatives; token acceptance is a server authz decision.

This scope makes the token's project the single source of truth for the whole request (so health, logging, reads, and writes agree), and collapses the kit's two MCP token clients onto one shape-agnostic policy so no route can reject a server-valid token client-side.

## Business Problem

Consuming projects (e.g. YappChat) connect to the hosted MCP with only a bearer token — no per-call project scoping. Today two failures compound and burn sessions: (1) `project_mcp_health` and any non-scoped path report the *server's* default project ("wxKanban Development"), not the caller's, so a diagnosing session concludes it is operating against the wrong project and chases a non-existent problem; (2) a client-side token-shape regex rejects a token the server actually accepts, inventing a "you need a `wxk_live` token" blocker that stalls work and causes token-chasing. Both trace to assuming a local/default identity instead of resolving it from the authenticated caller.

### Core Design

| Element | MCP Token/Project Binding Hardening |
| --- | --- |
| **Primary Actor** | A consuming project (e.g. YappChat) whose AI client talks to the hosted MCP with only a bearer token — no per-call `projectId` |
| **Secondary Actor** | The hosted MCP server (token→project authority) and the kit's two MCP clients |
| **Key Value** | The token's project is the single source of truth for the whole request; a server-valid token is never rejected client-side; `project_mcp_health` tells the truth |
| **Boundary — IN** | (A) the token's `mcpScope.projectId` becomes the top-priority default in `withResolvedProjectId`/health, ahead of env + server file; `project_mcp_health` reflects it with `source: "token"`. (B) remove the client-side `TOKEN_RE` constructor throw; both kit clients pass the token through (policy parity); server stays sole token authority |
| **Boundary — OUT** | Local command-gateway routing (SCOPE-068 owns that); token issuance/rotation/deprecation policy; the existing scoped-query enforcement (already correct — must not change); a new project-scoping header on the `.mcp.json` transport (considered and rejected — the token already resolves to a project) |

---

## User Scenarios

### US1 — A tool call omits `projectId` (Defect A core)
YappChat's AI client calls `project_create_specs` (or any project-scoped tool) with only its bearer token, no `projectId`.
**Expected:** the server resolves the project from the token (`mcpScope.projectId`) and operates on YappChat. It never falls back to the server container's `.wxkanban-project.json`. Health, audit logs, and the write all name the same project.

### US2 — `project_mcp_health` tells the truth (Defect A symptom)
A session runs `project_mcp_health` using YappChat's token to see which project it is bound to.
**Expected:** `projectContext.projectId` = YappChat (`1993e2ba…`) with `source: "token"`, not `ba924193` / `source: "file"`. The readout matches where a same-token write lands, so no session invents a "wrong project" theory.

### US3 — An explicit `projectId` disagrees with the token (safety)
A call passes `projectId` for a different project than the token's.
**Expected:** unchanged from today — the scoped-DB layer rejects the write (`scope-mismatch`). Resolution does not let an arg silently override the token's project for scoped writes.

### US4 — A server-valid legacy token through the shape-checking client (Defect B)
Any kit code path constructs the `core/http` `McpClient` with a legacy `drHs…` token that the server accepts.
**Expected:** the client does not throw. The request is sent with the token as-is and the server decides acceptance. A token the server would accept is never blocked client-side. A truly bad token surfaces as the server's `401`, a clear error.

### US5 — Both kit clients behave identically (Defect B durability)
The same token is used through `core/orchestrator/mcp-client.ts` and `core/http/mcp-client.ts`.
**Expected:** identical token handling — both forward the token untouched; neither applies a client-side shape gate. No code route can reintroduce the divergence.

---

## Functional Requirements

### FR-001 — Token's project is the authoritative default (Defect A core)
`withResolvedProjectId` MUST prefer the authenticated token's project (`mcpScope.projectId`) over the env var and the server-side `.wxkanban-project.json` fallback when a project-scoped tool call omits `projectId`. Precedence: (1) explicit `projectId`/`projectid` in args, (2) `mcpScope.projectId` from the token, (3) `WXKANBAN_PROJECT_ID` env, (4) `.wxkanban-project.json` file. The file fallback is retained only for dev-bypass / no-token (local) runs.
**Acceptance:**
- [ ] Token-authenticated call omitting `projectId` → resolves to the token's project, `source: "token"`
- [ ] Explicit valid `projectId` in args still wins (`source: "args"`), preserving today's behavior
- [ ] Dev-bypass (no `mcpScope.projectId`) → falls through to env → file exactly as today
- [ ] The server container's `.wxkanban-project.json` is never the source when a token resolved a project

### FR-002 — `project_mcp_health` reflects the token's project (Defect A symptom)
When the health tool is called under a token, its `projectContext` MUST report the token-resolved project and `source: "token"`, not the server's startup file default.
**Acceptance:**
- [ ] `project_mcp_health` under YappChat's token → `projectContext.projectId` = YappChat, `source: "token"`
- [ ] The reported project matches the project a same-token write would target
- [ ] Dev-bypass (no token) → unchanged startup file/env readout

### FR-003 — No weakening of the cross-project write guard (safety)
The scoped-DB enforcement (`insertScoped`/`updateScoped`/`selectScoped` binding to `scope.projectId`, `scope-mismatch` on conflict) MUST remain intact. Resolution changes MUST NOT let an args `projectId` cause a scoped write to a project other than the token's.
**Acceptance:**
- [ ] A scoped write with args `projectId` ≠ token project still throws `scope-mismatch` (unchanged)
- [ ] No handler bypasses `scoped.*` for a project-scoped table as a result of this change
- [ ] `scripts/check-no-direct-db.sh` (T011 guard) still passes

### FR-004 — Add `source: "token"` to the resolution model
`ProjectContextResolution.source` / `ProjectContextSource` MUST gain a `"token"` value, threaded through resolution + health surfaces so telemetry and logs distinguish token-resolved from args/env/file.
**Acceptance:**
- [ ] `ProjectContextSource` union includes `"token"`
- [ ] `tool.call.start` / audit logs record `resolutionSource: "token"` on token-resolved calls
- [ ] No caller of `resolveProjectContext` breaks on the new enum value

### FR-005 — Remove client-side token-shape enforcement (Defect B)
`core/http/mcp-client.ts` MUST NOT throw on token shape. The `TOKEN_RE` constructor throw is removed; the server is the sole authority on token acceptance. A missing token for a hosted endpoint still fails fast with the existing actionable message.
**Acceptance:**
- [ ] Constructing `McpClient` with a legacy `drHs…` token does not throw
- [ ] Hosted endpoint + no token → still throws the existing "no API token resolved" guidance
- [ ] A server-rejected token surfaces as the server's `401`/error, not a client-side shape error

### FR-006 — Single token-passing policy across both clients (Defect B durability)
The two kit MCP clients (`core/orchestrator/mcp-client.ts`, `core/http/mcp-client.ts`) MUST share one shape-agnostic token-passing policy (policy parity — both pass the token through; no client-side shape regex). No shared-module unification refactor is required.
**Acceptance:**
- [ ] Neither client applies a token-shape regex gate
- [ ] Token resolution/precedence is documented in one place; both clients honor it
- [ ] A test asserts a non-`wxk_` token is accepted (passed through) by both clients

---

## Technical Sections

No Data/API/Frontend/Command sections are needed — no schema, routes, UI, or new wxAI command. This is a behavioral fix in existing server + kit code.

### Server — `mcp-server/src/`
- `server.ts` `withResolvedProjectId` (~L420-453): thread `mcpScope.projectId` in as the priority-2 default (FR-001). It is currently called (L520) before `mcpScope` is extracted (L548); pass `request.params._meta.mcpScope` into the function (keep it pure/testable) rather than relying on call ordering.
- `utils/project-context.ts` `resolveProjectContext` + `ProjectContextResolution.source`: add `"token"`; accept an optional token-project param so all precedence lives in one function (FR-001, FR-004).
- `utils/mcp-health.ts` `ProjectContextSource` + `setMcpProjectContext`: allow `"token"`; ensure the `project_mcp_health` tool reports the *per-request* token project, not just the frozen module-level startup `state` (FR-002). Verify how the health tool builds its payload — if it reads the startup `state`, it must resolve per-call under the token.
- No change to `db/scoped-query.ts` or `middleware/auth.ts` (FR-003 — leave the guard alone).

### Kit — `wxkanban-agent/core/`
- `http/mcp-client.ts`: remove `TOKEN_RE` (L44) and the constructor throw (L144-148); keep the no-token hosted guard (FR-005). Update `tests/unit/mcp-client.test.ts` (currently asserts the throw).
- `orchestrator/mcp-client.ts`: already shape-agnostic (L55) — confirm parity; add/adjust a test asserting a non-`wxk_` token passes through both clients (FR-006).

### Tests
- Server: unit for `withResolvedProjectId` precedence (args > token > env > file); `project_mcp_health` returns token project + `source:"token"`; `scope-mismatch` still thrown (FR-003 regression guard).
- Kit: `mcp-client.test.ts` flips from "throws on bad shape" to "accepts legacy token"; parity test across both clients.

### Conventions & release path
- TypeScript, no `any`; Pino logging. Fences written by the orchestrator at `implement` — not hand-authored.
- Two deployment surfaces, different blast radius:
  - Server changes (FR-001/002/003/004) → the hosted MCP auto-deploys on push to main. Production.
  - Kit changes (FR-005/006) → shipped via `scripts/sync-to-orchestrator.mjs`, separate from the app push; consumers pull it.
- Nothing pushed/published until the user says so.

---

## Success Criteria

1. **A token-only call lands in the token's project.** A project-scoped tool call with no `projectId`, under YappChat's token, resolves to YappChat — verified by the returned row's `projectId` and audit log `resolutionSource: "token"`. *(FR-001, FR-004)*
2. **Health stops lying.** `project_mcp_health` under a token reports `projectContext.projectId` = the token's project with `source: "token"`, matching where a same-token write goes — reproduced against the exact scenario that misled the YappChat sessions. *(FR-002)*
3. **Cross-project safety unchanged.** A scoped write whose args `projectId` differs from the token's project still fails with `scope-mismatch`; the `check-no-direct-db` guard still passes. *(FR-003)*
4. **A server-valid legacy token is never rejected client-side.** Constructing the `core/http` `McpClient` with a `drHs…` token does not throw; the request reaches the server, which decides. *(FR-005)*
5. **The two clients can't diverge again.** A test proves both kit clients pass a non-`wxk_` token through unchanged; no client-side shape regex remains in either. *(FR-006)*
6. **Zero behavioral change for the local/dev path.** With `MCP_AUTH_REQUIRED=false` (no token), project resolution and health fall through to env → file exactly as today. *(FR-001)*

---

## Constraints & Notes

### Constraints
- **Resolve from the caller, never assume a default.** The token is the authority; the server-container file is a dev-only last resort. Same principle as SCOPE-068, applied to the hosted-MCP path.
- **Don't touch the scoped-DB guard.** `scoped-query.ts` + `auth.ts` are correct; this scope must not weaken `scope.projectId` binding or `scope-mismatch` (FR-003 is the tripwire).
- **Server is the sole token authority.** No client-side token-shape checks, ever — they can only produce false negatives.
- **Two release surfaces.** Server FRs auto-deploy to production on push to main; kit FRs ship via the orchestrator release path. They can land independently, but the fix reads best deployed together. Nothing pushed/published until the user says so.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`; fences written by the orchestrator, not by hand.

### Dependencies
- Existing token→project resolution in `middleware/auth.ts` (`mcpScope.projectId`) — reused, not rebuilt.
- The scoped-query layer (SPEC-028 / T009-T010) that already enforces token-project binding on writes.
- The kit release path (`scripts/sync-to-orchestrator.mjs`) for the client-side FRs (FR-005/006).

### Out of Scope
- A new `X-Wxkanban-Project-Id` (or query-param) project binding on the `.mcp.json` transport. Considered as the source report's primary Fix A; rejected because the token already resolves to a project, and a header adds config surface plus a spoofing question. Revisit only if multi-project tokens become a real requirement.
- Token issuance / rotation / server-side deprecation of legacy tokens (would be a separate scope with an explicit, actionable server error).

### Notes
- **Corrects the source report.** The originating note frames Defect A as a "silent cross-project mis-write." Verified in code: scoped writes are already token-bound and reject mismatches — the real defect is the split-brain resolver. Scope written to the corrected understanding.
- **FR-006 decision:** policy parity (both clients pass the token through), not a shared-module unification refactor — the KISS choice, confirmed with the user.
- **Process:** authored in-conversation; `createSpecs` → `implement` next. This affects the customer-distributed kit and the production hosted MCP.
