# Contracts: Company YappChatt Account (SPEC-144, T001)

**Frozen 2026-10-24 by the managing agent, before any area starts.** An area may not change a
contract. If a contract is wrong or missing something, the area stops and asks the managing agent,
who changes it here and tells every area that depends on it.

Companion: YappChatt SPEC-093 (`E:/AI_Development/wxperts/YappChat/specs/093-wxkanban-company-chat-api/`).

**Revision 2026-10-24 (after build 1):** the managing-agent answers to the areas' questions and the
owner's decisions D1–D5 are applied below (§ Owner decisions).

## Owner decisions

| # | Decision | Answer |
|---|---|---|
| D1 | Approver identity | **(a) Within-company trust for v1.** The approver check trusts the poster's YappChatt id. Any holder of the company's app token can open a session for any member of that company (C3), so a company member could post as a colleague. Accepted as a known v1 limit; tying a person's session to their own wxKanban sign-in is a later scope. |
| D2 | Current consulting member | Either (1) a user with an active `subassignments` row on an active `engagementassignments` row on one of the company's projects, or (2) **(amended 2026-10-24, owner)** an ADMIN or TEAM_MANAGER of the engagement's consulting company, who covers **every** project that company holds an active `engagementassignments` row on, with no subassignment. In both, the engagement's state is `active` (not paused, disabled or ended). The consulting company assigns its other members item by item; its ADMINs and managers see all of it. A user with `active = false` is refused everywhere (sessions, group, rooms, approver). |
| D3 | Group seat limit | `companysubscriptions.activeuserlimit` + the number of current consulting members (D2). The company account (owner) takes no seat. Unlimited (`null`) stays unlimited. |
| D4 | Who sees the Team chat panel | ADMINs only for v1: status plus the button, in the ADMIN-only Company settings tab. Everyone else sees their rooms in YappChatt itself. The C3 GET stays callable by company users. |
| D6 | Consultant approvers (FR-012, amended 2026-10-24, owner) | Per engagement, off by default: `engagements.consultantapprovers` (set from `engagementinvitations.consultantapprovers` on acceptance), changed only by a client company ADMIN via `PATCH /api/engagements/:id/consultant-approvers { consultantApprovers }` (audited). When true, the consulting company's ADMINs and TEAM_MANAGERs are Room Approvers on projects their company holds a live assignment on, while the engagement is `active`. The C4 approver response's `role` gains `"CONSULTANT_MANAGER"`. |
| D5 | Show the account before linking (FR-002) | C3 POST `{ confirm: false }` returns `{ wouldLink: { email, exists, displayName } }` and changes nothing, backed by the read-only YappChatt lookup C1.0; the admin then sends `{ confirm: true }`. |

## C1. YappChatt consumer API (built in YappChatt by WP-2, called from wxKanban by WP-4)

Base URL: `WXKANBAN_YAPPCHAT_BASE_URL` (default `https://www.yappchatt.com`).
Every call: `Authorization: Bearer <WXKANBAN_CONSUMER_SECRET>`, `content-type: application/json`.
Server-to-server only. Ids are YappChatt UUIDs (strings).

| # | Method + path | Body | 200 response | Errors |
|---|---|---|---|---|
| C1.0 | `GET /api/consumer/accounts?email=<email>` (read-only, D5) | — | `{ exists, userid: string \| null, displayName: string \| null }` | 400 `invalid_email` |
| C1.1 | `POST /api/consumer/accounts` | `{ email, displayName? }` | `{ userid, created }` | 400 `invalid_email` |
| C1.2 | `POST /api/consumer/groups` | `{ ownerUserid, name, seatlimit: number \| null }` (null = unlimited) | `{ orgid }` | 404 `user_not_found` |
| C1.3 | `PATCH /api/consumer/groups/:orgid` | `{ seatlimit: number \| null }` | `{ orgid, seatlimit }` | 404 `org_not_found`; 409 `below_members` `{ members }` |
| C1.4 | `PUT /api/consumer/groups/:orgid/members/:userid` | `{ role: "admin" \| "member" }` | `{ orgid, userid, role, added }` | 404; 409 `seat_limit_reached` `{ missing }`; 409 `owner_protected` |
| C1.5 | `DELETE /api/consumer/groups/:orgid/members/:userid` | — | `{ removed }` | 404; 409 `owner_protected` |
| C1.6 | `POST /api/consumer/rooms` | `{ ownerUserid, title, memberIds: string[] }` | `{ conversationid }` | 404 `user_not_found` |
| C1.7 | `PUT /api/consumer/rooms/:conversationid/members/:userid` | — | `{ added }` | 404 `room_not_found`; 409 `room_retired` |
| C1.8 | `DELETE /api/consumer/rooms/:conversationid/members/:userid` | — | `{ removed }` | 404; 409 `owner_protected` (the room owner) |
| C1.9 | `POST /api/consumer/rooms/:conversationid/retire` | — | `{ retired: true, retiredat }` | 404 |

Common to all: 401 `unauthorized` for a missing or wrong secret (nothing changes); 400
`invalid_request` `{ field }` for any call with a body that fails validation; 429 `rate_limited`;
every call writes one YappChatt `authauditlog` entry (never the secret). Calls are idempotent where
the table says so: C1.1 returns the same id for the same email; C1.4 with the same role returns
`added: false`, and with a different role returns `added: false, updated: true`; C1.5/C1.8 on a
non-member return `removed: false`; C1.9 on a retired room returns its existing `retiredat`.

`created: true` from C1.1 means YappChatt sent the welcome email (set-password link); the call then
leaves two audit rows (signup and `consumer_api`), which is expected. The company account is the C1.2
owner. Group roles: the company account is `owner` (set by C1.2, never by C1.4) and takes no seat;
wxKanban ADMINs are `admin`; everyone else `member`. The seat limit sent in C1.2/C1.3 follows D3.

**Companion not available (FR-011):** a 404 whose body is not one of the error codes above (route
not deployed), a network failure, or `WXKANBAN_CONSUMER_SECRET` unset → wxKanban treats the companion
as unavailable, reports `companion_unavailable`, and changes nothing locally for that operation.

## C2. wxKanban columns (WP-3; the owner applies by hand)

File: `specs/144-company-yappchatt-account/sql/0001-company-yappchatt.sql`. One transaction.

```sql
ALTER TABLE companies
  ADD COLUMN yappchattuserid   uuid,
  ADD COLUMN yappchattemail    varchar(255),
  ADD COLUMN yappchattlinkedat timestamptz,
  ADD COLUMN yappchattgroupid  uuid;

ALTER TABLE userprofiles
  ADD COLUMN yappchattuserid uuid;

ALTER TABLE projectrooms
  ADD COLUMN owneryappchattid uuid,
  ADD COLUMN retiredat        timestamptz;

ALTER TABLE projectrooms DROP CONSTRAINT projectrooms_projectid_agentname_key;
CREATE UNIQUE INDEX projectrooms_projectid_agentname_active_key
  ON projectrooms (projectid, agentname) WHERE retiredat IS NULL;
```

All additive; existing rows keep null. The partial index keeps "one live room per project and agent"
and lets retired rows stay. WP-3 writes the declarations in `src/db/schema/` (T004) now, so the other
areas compile and unit-test against them, but **nothing that declares or uses these columns may be
pushed or deployed until the owner has applied this SQL and `npm run db:drift` passes**
(a declared-but-missing column makes every SELECT on the table fail in production). No area runs
code against the live database.

## C3. wxKanban routes (WP-4 serves; WP-5 and WP-6 call)

| Route | Auth | Request | 200 | Errors |
|---|---|---|---|---|
| `GET /api/company/yappchatt` | user JWT (`authenticateToken`, `requireAuth`); company from the token | — | `{ connected, email, contactEmail, yappchattUserId, groupId, linkedAt, canManage }` (`email` = the linked account's email or null; `contactEmail` = always the company contact email) | — |
| `POST /api/company/yappchatt` | user JWT + `requireAdmin` | `{ confirm: false }` → 200 `{ wouldLink: { email, exists, displayName } }`, no change, no audit row (D5). `{ confirm: true }` → | `{ connected: true, outcome: "created" \| "linked" \| "already", email, yappchattUserId, groupId, members: { added, updated, removed, failed: [{ userid, reason }] } }` (`added`/`updated`/`removed` are counts) | 403 not ADMIN; 503 `companion_unavailable` |
| `POST /api/project-agent/room` | kit token (`apiTokenService.validateToken`) | `{ supervisor?, mintAgentToken?, createCompanyAccount? }` | as today, plus `room.ownerYappchattId` and `room.replacedConversationId` (when an old room was retired); a replacement room returns `minted: true` with a new room token for the caller | 409 `no_company_account` `{ contactEmail }`; 503 `companion_unavailable` |
| `POST /api/agent/connect` | company token (as today) | as today | as today, same room rules | 409 `no_company_account`; 503 `companion_unavailable` |
| `GET /api/project-agent/approver?yappchattUserId=<uuid>` | kit token | — | `{ approver: boolean, name: string \| null, role: "ADMIN" \| "TEAM_MANAGER" \| null }` | 400 bad id |
| `POST /api/community/session` | kit token, `Authorization: Bearer` (**new**) | `{ email, displayName? }` (unchanged) | unchanged | 401 `token_required` / `invalid-token`; 403 `not_company_member` with message "This email isn't a member of your company" |

The community route's membership rule: the email belongs to an active (`active = true`)
`userprofiles` row of the token's company, or to a current consulting member (D2) on one of that
company's projects. The `name` in the approver response is the user's display name as shown in
wxKanban.

`createCompanyAccount: true` on the room route is allowed for any holder of the company's app token
(FR-006); it always uses the company contact email.

Error bodies: 503 is `{ error: "companion_unavailable", message }`; 403 from `requireAdmin` is
`{ error: "forbidden" }`.

Audit (FR-010): every state change and every refused session writes one `companyauditlogs` row:
`action` one of `yappchatt.account.created`, `yappchatt.account.linked`, `yappchatt.member.added`,
`yappchatt.member.removed`, `yappchatt.member.role`, `yappchatt.room.created`,
`yappchatt.room.retired`, `yappchatt.session.refused`, `yappchatt.decision.accepted`,
`yappchatt.decision.refused`; `changedby` the acting user when there is one; `newvalue` the ids
involved, never a token or secret. The approver route writes `yappchatt.decision.accepted` /
`yappchatt.decision.refused`; a 401 with no token (so no company) is not audited.

## C4. Bridge ↔ server approver call (WP-6 uses; WP-1 supplies the author id)

- `YappchattMessage` (wxkanban-agent `core/yappchatt/client.ts`) gains `authorId?: string`, the
  poster's YappChatt user id, set from the message's `authorid` / `userid`. **WP-1 owns this edit**,
  in the same pass as the session change.
- Before recording a human's `DQ-nn` answer or `KR-nnnn` review, the bridge calls
  `GET /api/project-agent/approver?yappchattUserId=<authorId>` with the project's kit token.
  - `approver: true` with a `name` → record, passing the approver's `name`. `name: null` → not
    recorded (never falls back to `owner`).
  - Trust is within the company for v1 (D1).
  - `approver: false`, a missing `authorId`, or any error → not recorded; the text goes to the
    session as ordinary discussion and the room gets: "Not recorded: only an ADMIN or this
    project's TEAM_MANAGER can decide."
- Recording with a name (SPEC-142 scripts, WP-6 changes them):
  - `node _wxAI/askgate/route.mjs answer --dq <id> --answer <text> --approved-by "<name>"`
    → ledger `approved_by: "<name>"` (default stays `owner` when no name is given).
  - `node _wxAI/askgate/kain.mjs review <KR> approve|change|reject [answer] --approved-by "<name>"`
    → the review's ledger entry uses that name; the reply records `reviewedBy`.
  - A supervisor (`[KAIN]`) post is never an approver (unchanged).

## Ownership (who may edit what)

| Area | Files | May not touch |
|---|---|---|
| **WP-1 Security gate** (T002) | `src/server/routes/community.ts`; `vscode-extension/src/services/chatSocket.ts`, `vscode-extension/src/providers/chatPanel.ts`; `wxkanban-agent/core/yappchatt/client.ts` (session token **and** C4 `authorId`); `tests/contract/community-session.test.ts`; their tests | `docs/kain-contract.md` (hands its change to WP-7) |
| **WP-2 YappChatt** (SPEC-093) | YappChatt repo: new `apps/web/src/app/api/consumer/{accounts,groups,rooms}/**`, new `apps/web/src/lib/consumer/*` files; minimal edits for `conversations.retiredat`, the room-list filter, the post refusal; a migration | Any other YappChatt file with uncommitted changes, without listing it in its handoff |
| **WP-3 Database** (T003, T004) | `specs/144-company-yappchatt-account/sql/*`; `specs/117-production-schema-integrity/schema-change-log.md`; later `src/db/schema/{company,userprofiles,projectroom}.ts` | Applying SQL (the owner applies) |
| **WP-4 Server** (T005–T009, T013) | `src/server/lib/yappchattBroker.ts`; new `src/server/services/CompanyYappchattService.ts`; new routes under `src/server/routes/` for `/api/company/yappchatt`; `src/server/services/AgentConnectService.ts`; `src/server/routes/projectAgent.ts`; `src/server/routes/agentConnect*.ts`; sync hooks in the user and engagement services; their tests | `src/db/schema/*` (WP-3), `community.ts` (WP-1) |
| **WP-5 Web UI** (T012) | The Company page and a new `TeamChatPanel` component under `src/client/` | Server code |
| **WP-6 Bridge** (T010, T011) | `wxkanban-agent/apps/remote-bridge/src/{decision-reply,bridge,agent-mode}.ts` (T011 lives in `agent-mode.ts`; no `main.ts` change); `vscode-extension/src/services/projectAgent.ts` (Cockpit launcher); `_wxAI/askgate/{route,kain}.mjs`; their tests | `core/yappchatt/client.ts` (WP-1) |
| **WP-7 QA + docs** (T014, T015) | `docs/kain-contract.md`; help sections; acceptance evidence | Production code |

## Rules for every area

- Spec first: build only what SPEC-144 (or SPEC-093) and these contracts say.
- Fence every top-level unit `// [SCOPE 144 / Tnnn] BEGIN — …` / `END` (YappChatt: `[SCOPE 093 / Tnnn]`), with `MODIFIED-BY` on partial edits of fenced blocks; Tnnn is the task number.
- TypeScript, no `any`, no `@ts-ignore`; Pino logging only, no `console.log` in server code; shadcn components in UI.
- Never apply SQL, never `drizzle-kit push`, never commit, never push, never deploy.
- A Change Impact hook denial is returned to the managing agent word for word, as a question; never worked around.
- Tests: unit tests for every route and service; anything that would touch the production database or send real email is mocked. Run the tests you wrote and report the counts.
- Handoff (every area, at the end): what changed and why; contracts used; how to test; what is incomplete; assumptions; downstream risks; required config or migration steps; files touched (full list).
