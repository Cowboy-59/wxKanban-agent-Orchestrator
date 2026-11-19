# Task Breakdown: K.A.I.N. Sign-in and Agent Reach

**Feature**: K.A.I.N. Sign-in and Agent Reach
**Spec**: 152
**Date Generated**: 2026-10-28
**Spec**: [spec.md](spec.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Verify token tenancy, password paths and every reader of grants and company tokens (OQ-1, OQ-2) | critical | done |
| 2 | T002 agentdevicetokens SQL and the company-token retirement SQL for the owner to apply (FR-065, FR-069) | critical | done |
| 3 | T003 Declare agentdevicetokens after it exists; schema change log; db:drift (FR-065) | critical | done |
| 4 | T004 agentReach, the one shared reach function, with unit tests (FR-066, FR-070) | critical | done |
| 5 | T005 Sign-in route, device-token service and middleware; revoke on credential change (FR-064, FR-065, FR-073) | critical | done |
| 6 | T006 Grants and connect on agentReach, as the person, per device (FR-067, FR-068, FR-073) | critical | done |
| 7 | T007 MCP auth re-check and list_agent_connections on agentReach (FR-067, FR-062) | critical | done |
| 8 | T008 Retire company tokens and per-Project ticks (FR-069) | high | done |
| 9 | T009 Device lists and revoke: routes, profile, Company page (FR-071, FR-073) | high | done |
| 10 | T010 The client's Reachable by line (FR-072) | medium | done |
| 11 | T011 Help pages and docs/kain-contract.md (FR-074) | medium | done |
| 12 | T012 Cross-company test suite, tests 1 - 6 (FR-075) | critical | done |
| 13 | T013 Acceptance by hand after deploy, test 7, with SpokAI (FR-075) | high | todo |
| 14 | T014 Ending a device revokes its MCP tokens in the same transaction (FR-065, review #5) | high | done |
| 15 | T015 Refuse devices of a deactivated company, app and MCP (FR-065, FR-070, review #6) | high | done |
| 16 | T016 Device panel UI review fixes (FR-071) | medium | done |
| 17 | T017 YappChatt companion scope: per-device room tokens and a revoke call (FR-068 known gap) | medium | todo |

## Task Details

### T001 — Verify token tenancy, password paths and every reader of grants and company tokens (OQ-1, OQ-2)
Evidence only, no code. (1) OQ-1: for a connect-minted MCP token on a client Project, which `customerid`
lets both the MCP tenant checks (`req.mcpScope.customerId`) and the consultant guard (`mcp-server/src/server.ts`
`consultantScopeGranted`) accept it; list the tools K.A.I.N. calls and how each resolves company. (2) OQ-2:
every route or service that sets a password (self-service change, `team.ts` reset, `sysadmin.ts` reset,
reset link). (3) Every reader of `projectagentgrants`, `companyagenttokens`, `requireAgentTicket` and the
`agent-grant:` prefix across app, MCP and kit. (4) `signInUser` refusals (inactive user, subscription).
Write the findings into `research.md`; if OQ-1 needs a new MCP rule, record it there before T005.

### T002 — agentdevicetokens SQL and the company-token retirement SQL for the owner to apply (FR-065, FR-069)
`sql/0001-agentdevicetokens.sql`: CREATE TABLE IF NOT EXISTS, FKs to `userprofiles` and `companies`, unique
`tokenhash`, unique partial index on `(userid, devicename)` where `revokedat` is null, GRANT to
`wxkanban_app`, and a column-level verification query. `sql/0002-retire-company-agent-tokens.sql`: soft
revoke of live `companyagenttokens` (`revokedat`, reason `replaced_by_signin`), applied at release. Andy
applies both by hand.

### T003 — Declare agentdevicetokens after it exists; schema change log; db:drift (FR-065)
`src/db/schema/agentdevicetoken.ts`, exported from `src/db/schema/index.ts` only after T002's verification
passes; the MCP mirror declaration in `mcp-server/src/db/schema.ts` (declare only after the table exists).
Entry in `specs/117-production-schema-integrity/schema-change-log.md`; `npm run db:drift` exit 0.

### T004 — agentReach, the one shared reach function, with unit tests (FR-066, FR-070)
`src/server/lib/agentReach.ts`: `agentReach(userId)` and `isInAgentReach(userId, projectId)`. Own company:
ADMIN every Project; others `projectusers` (not removed) or an `in_progress` phase lead; `showAll` never
consulted. Consulting: SCOPE-144 D2 (`communityMembership.ts`) narrowed to whole-Project assignments
(`scopeid` and `taskid` null) under `active` engagements. Allow remote on; not `ARCHIVED`; person `active`.
Returns `projectId, projectName, companyId, companyName, via, engagementId`. Unit tests for every branch and
every FR-070 event.

### T005 — Sign-in route, device-token service and middleware; revoke on credential change (FR-064, FR-065, FR-073)
`AgentDeviceTokenService` (issue, replace by device name, verify + `lastusedat`, revoke, revoke-all-for-user)
and `POST /api/agent/signin` in `src/server/routes/agentConnect.ts`, reusing `signInUser` (401 / 423, no
cookie). `requireAgentDevice` middleware: hash lookup, live row, person active, else 401
`device_signed_out`. Every password set found in T001 calls revoke-all. Audit `agent.signin` /
`agent.signin.refused` without password or token. Tests: refusals, lockout, replace, marker-password search.

### T006 — Grants and connect on agentReach, as the person, per device (FR-067, FR-068, FR-073)
`AgentConnectService.grants` returns `agentReach` (own first, then clients by name). `connect` refuses
404 `not_granted` outside reach; resolves the room as the person (replaces `grantedbyid` as operator);
mints the MCP token issued by the person, named `agent-grant:KAIN:<deviceId>` with the tenancy decided in
T001, revoking only the same name on the same Project; `yca_` mint per device. Audit `agent.connect` under
the Project's company with `via`. Routes switch from `requireAgentTicket` to `requireAgentDevice`.

### T007 — MCP auth re-check and list_agent_connections on agentReach (FR-067, FR-062)
`mcp-server/src/middleware/auth.ts`: for `agent-grant:` tokens, re-check `isInAgentReach(issuedbyid,
projectid)` and the device row (from the name) on every call; refuse 401 `access_revoked` /
`device_signed_out`. An MCP-side `agentReach` (`mcp-server/src/utils/agent-reach.ts`) with a drift test
against the app's, as `feedback-status` is mirrored. `project.list_agent_connections` lists every Project in
reach, across companies, with `companyName`. Tests incl. cross-company isolation.

### T008 — Retire company tokens and per-Project ticks (FR-069)
`POST /api/company/agent-tokens` answers 410 `use_signin`; the Company Access Token UI and the K.A.I.N. tick
in `ProjectAgentAccessPanel` are removed; nothing reads `projectagentgrants` (T001's list goes to zero). Rows
kept. `sql/0002` applied at release.

### T009 — Device lists and revoke: routes, profile, Company page (FR-071, FR-073)
`GET /api/agent/devices` (own, web session), `GET /api/company/agent-devices` (ADMIN),
`POST /api/agent/devices/:deviceId/revoke` (owner or ADMIN of the owner's company; else 404). Profile "My
K.A.I.N. devices" and a Company page ADMIN table (shadcn Table, AlertDialog confirm), phone width first.
Audit `agent.device.revoked`. Route and component tests.

### T010 — The client's Reachable by line (FR-072)
`GET /api/projects/:projectId/agent-access` adds `reachableBy` (consulting company names with a live
whole-Project assignment on an active engagement). `ProjectAgentAccessPanel` shows the read-only line under
Allow remote. Companies only, never people.

### T011 — Help pages and docs/kain-contract.md (FR-074)
Agent Access and Engagements help updated; a consultant sign-in and revoke page; `docs/kain-contract.md`
replaces the company-token flow with sign-in, device token, `agentReach`, `companyName`/`via`,
`device_signed_out`, `access_revoked`, `use_signin`.

### T012 — Cross-company test suite, tests 1 - 6 (FR-075)
One fixture: own company, two client companies with engagements, a third company with none; ADMIN,
TEAM_MANAGER, TEAM_MEMBER, sub-assigned consultant. Tests 1 (never too far, all 4 places), 2 (never too
little), 3 (every FR-070 event, next call, all 4 places), 4 (two devices), 5 (sign-in), 6 (all 4 agree with
`agentReach`). Tests 1, 3, 6 are the release gate.

### T013 — Acceptance by hand after deploy, test 7, with SpokAI (FR-075)
The consulting ADMIN signs in on phone and laptop and sees both clients' Projects; a client member sees only
their own company's; a phone post of `[KAIN] STATUS` gets a worker answer. Released with SpokAI SCOPE-002
Amendment A.

### T014 — Ending a device revokes its MCP tokens in the same transaction (FR-065, review #5)
Andy 2026-10-30: "step 3, yes". `AgentDeviceTokenService`: `revoke`, `issue` (the replaced row) and
`revokeAllForUser` also set `revokedat`/`revokedbyid` on live `mcpapitokens` named
`agent-grant:<agent>:<deviceId>` for the devices they end, inside the same transaction. Unit tests for all
three paths. The per-call MCP check stays as the second line.

### T015 — Refuse devices of a deactivated company, app and MCP (FR-065, FR-070, review #6)
`verify()` joins `companies` on the device's company and returns null when `activeflag` is false;
`isDeviceLive` in `mcp-server/src/utils/agent-reach.ts` adds the same condition. Same answer as any other
refusal (`device_signed_out`). Subscription follows the web app's rule (SCOPE-090 Amendment A gate); no
device-only subscription check. Tests in the app and the MCP.

### T016 — Device panel UI review fixes (FR-071)
`AgentDevicesPanel.tsx`: load failure shows the error, not the empty text; revoke errors inside the dialog;
`aria-label` per Revoke button (device, and owner on the company list); the confirm names the owner;
`role="alert"` on errors; 44 px touch target on phones.

### T017 — YappChatt companion scope: per-device room tokens and a revoke call (FR-068 known gap)
A scope in YappChatt's project (interactive buildscope there): `yca_` room tokens minted per device and a
consumer call to revoke one; then a wxKanban follow-up wires the revoke into T014's paths. Until then the
gap is stated in FR-068.

## Evidence

**2026-10-28, local. Nothing committed, pushed or deployed.**
- T002/T003: `sql/0001` and `sql/0002` applied by Andy; verified 10 columns, 2 checks, 4 indexes (app role also holds DELETE, from default privileges); 0 of 9 Company Access Tokens live, 3 `agent.token.retired` rows. `npm run db:drift` exit 0. Logged in the SCOPE-117 schema change log. **`0002` was applied before deploy**: K.A.I.N. is refused until this spec ships.
- Tests, app (83/83 across 10 files): `tests/unit/agentReach.test.ts` (21: every branch, every FR-070 event), `tests/unit/agentReach.drift.test.ts` (app and MCP rules identical on 325 fact sets), `tests/backend/agentConnect.route.test.ts` (sign-in 401/423/inactive/marker password, device auth, connect), `tests/unit/agentConnectService.companyRoom.test.ts` (out of reach → 404 with nothing minted; room under the Project's company; `agent.connect` audit), `tests/backend/agentDevices.route.test.ts` (owner / company ADMIN revoke; others 404), `tests/backend/remoteAccess.route.test.ts` (`reachableBy`, no tick), plus SCOPE-134/144/145 suites updated to the device flow.
- Tests, MCP: `tests/middleware/auth.test.ts` (retired name, revoked device, out of reach, admitted) and `tests/scope-151-list-agent-connections.test.ts` (reach across companies) — 16/16. Full MCP suite 670 passed; 11 failures in 4 files unrelated to this spec (`integration.test.ts` needs a local database, `prompts/registry.test.ts` SCOPE-136 text with `registry.ts` modified before this session, `project-kit-scope-flow.test.ts`, `server.test.ts`).
- FR-075 coverage: test 1 and 3 — `agentReach.test.ts` + MCP `auth.test.ts` + connect refusal; test 2 — `agentReach.test.ts`; test 5 — `agentConnect.route.test.ts`; test 6 — `agentReach.drift.test.ts` (grants and connect call the app rule, the MCP re-check and list call the MCP rule). Test 4 (two devices) rests on the per-device token name `agent-grant:KAIN:<deviceId>` and per-name revocation; proven live in T013.
- Review fixes 2026-10-29 (Andy: "fix items 1-4", Change Impact "approved"): (1) `agentSigninRateLimit` on `/signin`, 30 per IP and 10 per email per 15 minutes, 429 before any password check; `signInUser` checks an unknown email against a dummy cost-12 hash; (2) `KAIN_AGENT_NAME` fenced T006; (3) change-password, reset-password (with the spent link) and SysAdmin reset revoke devices in the same transaction, then `auditRevokeAll` writes one row per company; (4) MCP `loadReachFacts` compares uuid to uuid (live column types checked: all uuid) and the per-call `findInAgentReach` reads only the one Project. New tests: `tests/unit/agentDeviceTokenService.revokeAll.test.ts`, `tests/unit/signInUser.unknownEmail.test.ts`, `mcp-server/tests/scope-152-agent-reach-sql.test.ts`, and a 429 case in `agentConnect.route.test.ts`. App 77/77 + 36/36 neighbors; MCP 20/20. SQL files fenced T002 (comments only). `auditfences`: no SPEC-152 declaration flagged; legacy declarations in `rateLimit.ts`, `userService.ts`, `auth.ts`, `SysAdminUserService.ts` now report as errors because their whole-file baseline hash changed.
- T008 closed 2026-10-29: the unused `validateBody` import and `issueSchema` removed from `src/server/routes/agentTokens.ts`, and `AgentTokensPanel.tsx` deleted (Andy: "remove both"). Type check of the SPEC-152 files and `SettingsPage.tsx`: 0 errors; the SPEC-152 suites 72/72.
- Review fixes 2026-10-30 (Andy: "step 3, yes"; Change Impact "go ahead", 3 approvals): T014 `revokeDeviceMcpTokens` in `AgentDeviceTokenService` — `revoke` (now one transaction), `issue` (the replaced row) and `revokeAllForUser` revoke live `mcpapitokens` named `agent-grant:%:<deviceId>` in the same transaction; a test keeps `DEVICE_MCP_TOKEN_PREFIX` equal to `AGENT_GRANT_TOKEN_PREFIX`. T015 `verify()` joins `companies` and refuses `activeflag` false; MCP `isDeviceLive` joins `companies` with `c.activeflag = true`. T016 `AgentDevicesPanel.tsx` UI fixes. Tests app 86/86 (9 new), MCP 22/22 (2 new); MCP tsc 0; both bundles build and carry the change; `auditfences` 0 findings in the touched files. Not yet deployed: the live check (revoke a device, its MCP token answers 401 `invalid-token`) runs with T013 after the next push. T017 (YappChatt companion scope) open.
