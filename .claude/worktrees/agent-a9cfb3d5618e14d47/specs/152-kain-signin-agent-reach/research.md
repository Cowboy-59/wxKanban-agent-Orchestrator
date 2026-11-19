# Research: K.A.I.N. Sign-in and Agent Reach (T001)

**Spec Number**: 152
**Date**: 2026-10-28
**Method**: read-only, against the working tree.

## OQ-1 — Which company goes on a connect-minted MCP token for a client Project

**Decision: `mcpapitokens.customerid` = the Project's company. `issuedbyid` = the signed-in person.**

Evidence:
- MCP reads are bound to the token's project, not its company: `selectScoped` AND-s every read with
  `projectid = scope.projectId` (`mcp-server/src/db/scoped-query.ts`), and `assertCockpitScope` rejects a
  caller-supplied project that differs.
- `scope.customerId` is used as the tenant of what the call *writes or lists* — feedback `companyId`
  (`server.ts` ~1048), My Feedback / Incoming (~1211), proposals (`submit_proposal` ~4627), token creation
  (~3826) — and the existing project tokens already carry the Project's company. A consultant's token with the
  consultant's company would file a client Project's records under the consultant's tenant.
- The consultant guard does not read `customerId`: `getCallerCompany(scoped, callerId)` resolves the
  **caller's** company from `issuedbyid`, and on a `CONSULTANT` plan `consultantScopeGranted` requires an
  active engagement with a project-level or scope-level assignment (`server.ts` 126 – 149, ~2716). A
  whole-Project assignment — the only kind in reach (FR-066) — passes it.
- `project.list_agent_connections` scopes by the token company (`agent-connections.ts` ~112,
  `p.companyid = mine.companyid`); T007 replaces that with `agentReach`, so the token's company stops
  deciding the list.

## OQ-2 — Every place a password is set

FR-065's revoke-all must be called from each:

| Path | Where |
|---|---|
| Self-service change | `POST /auth/change-password` — `src/server/routes/auth.ts` ~697 / 736 |
| Reset link | `POST /auth/reset-password` — `auth.ts` ~829 / 885 |
| SysAdmin reset | `SysAdminUserService.resetPassword` — `src/server/services/SysAdminUserService.ts` 171 – 190 (route `sysadmin.ts` 859) |
| Team admin reset | `POST /api/team/:userId/reset-password` sends a link only; the set happens in the reset-link path above |

Not credential changes (new accounts): `sysadmin.ts` 934 `users/create`, `team.ts` 139, `InvitationService`,
`RegistrationService`, `engagements.ts` 324 (provisioned company). `SessionService` hashes refresh tokens, not
passwords.

Deactivation: `SysAdminUserService.updateUserStatus` (`.set({ active })`). No revoke hook needed — reach and the
device middleware check `active` on every call.

## Every reader of the retired mechanisms

| File | Reads | Changes in |
|---|---|---|
| `src/server/routes/agentConnect.ts` | `requireAgentTicket` on `/grants`, `/connect` | T005, T006 |
| `src/server/services/AgentConnectService.ts` | `projectAgentGrantService.listForAgent`, `projectagentgrants` join, `grantedbyid` as operator | T006 |
| `src/server/services/CompanyAgentTokenService.ts`, `src/server/routes/agentTokens.ts` | issue / list company tokens | T008 (410) |
| `src/server/services/ProjectAgentGrantService.ts`, `src/server/routes/agentGrants.ts` | tick grant / revoke / list | T008 (stop reading; UI removed) |
| `src/client/components/Settings/AgentTokensPanel.tsx` | Company Access Token UI | T008 |
| `src/client/components/Settings/ProjectAgentAccessPanel.tsx` | the K.A.I.N. tick | T008, T010 |
| `mcp-server/src/middleware/auth.ts` | `projectagentgrants` re-check for `agent-grant:` tokens | T007 |
| `mcp-server/src/tools/agent-connections.ts` | `agent-grant:` prefix, company scoping | T007 |
| `mcp-server/src/db/schema.ts` | table declarations | T003 (add), none removed |

No reader in `wxkanban-agent/apps` or `vscode-extension/src` (the project agent uses the kit token, not these).

## `signInUser` refusals

`src/server/services/userService.ts` 207 – 305: unknown email or wrong password → `Error("Invalid email or
password")` (401); active lockout → `AccountLockedError` (423); it also increments `failedlogins` and locks after
repeated failures. **It does not check `userprofiles.active` or the company subscription.** So the K.A.I.N.
sign-in route must refuse an inactive person itself (401, same text, `agent.signin.refused` with reason
`inactive`), and the device middleware re-checks `active` per call (FR-065). It returns a web JWT; the agent
route discards it and sets no cookie (FR-064).

## Token naming

Connect-minted MCP tokens: name `agent-grant:KAIN:<deviceId>`, `clientbinding` `KAIN:<tokenhash>` (unchanged,
what `record_override` checks). Keeping the `agent-grant:` prefix keeps the existing guards in
`projectAgentRoom` (wrong_token) and the MCP. Per-device revocation falls out of revoking by `(projectid, name)`.
The MCP re-check parses the device id from the name's third segment.
