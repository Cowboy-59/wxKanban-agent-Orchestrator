# SPEC-144 build 1 — report and resume point

Workflow `wf_c23d66a1-cd2`, 2026-10-24, 10 agents (all on the session model — the per-subagent model
rule was set after this run). Full handoffs and review findings: `handoffs-and-reviews.json` here.
WP-4's intended versions of every hook-denied file: `wp4-pending-edits/` (`*.orig.ts` = the file as it
was, `*.patch`, and the intended file). WP-1, WP-3 and WP-6 describe their denied edits in their
handoffs (`impactDenials`, `tasksNotDone`).

**Done 2026-10-24 (resume session):** the owner decided D1 = (a), D2–D5 as proposed; those and the 13
managing-agent answers are applied to `contracts.md` (§ Owner decisions), `spec.md` (FR-002 preview
criterion, API Routes) and `tasks.md` / the scope doc (route path). D5 adds YappChatt C1.0 (read-only
account lookup), which is new WP-2 work in the YappChatt repo (SPEC-093 needs the same addition).

**Done 2026-10-24 (G.O.D. session 2) — FR-009 gate (T002) BUILT, owner-approved edit by edit:**
- Server: `src/server/routes/community.ts` (Bearer required → 401 `token_required`; unknown/revoked/
  expired → 401 `invalid-token`; outside the company → 403 `not_company_member` + one
  `yappchatt.session.refused` audit row) and new `src/server/lib/communityMembership.ts` (own active
  user, or D2 consulting member; existing columns only, so it ships alone).
- Kit: `apps/remote-bridge/src/bridge.ts` passes `resolveApiToken({ projectRoot })` as `kitApiToken`.
- Cockpit: `chatSocket.ts` sends the Bearer and shows the server's refusal message; `chatPanel.ts`
  resolves the project token (none → "connect the project first").
- Tests: `tests/backend/communitySession.route.test.ts` 8/8; `tests/contract/community-session.test.ts`
  rewritten 3/3 on the real app; Cockpit `tests/chatSocket.sessionGate.test.ts` 4 new, 79/79 + tsc 0;
  kit 710/711 (the one failure, `auditfences.test.ts` strict-mode, is unrelated and untouched since May).
  Server bundle builds.
- **Live endpoint test (local server, prod DB):** no token 401 `token_required`; bad token 401
  `invalid-token`; this project's real token + `andy@wxperts.com` → **403**. Cause: Andy's user is in
  **HAS Enterprises LLC**, the project is **Wxperts LLC**; the active HAS→Wxperts engagement exists but
  Andy has no subassignment, so D2 refuses him. **Deploying the gate as-is breaks Andy's own GO REMOTE
  read login and Community Help on wxKanban.** One real refusal audit row was written (2026-10-24 21:40Z).
- **Client-first release order:** publish the Cockpit + cut the kit release BEFORE pushing the server
  (today's open server ignores the header; a gated server 401s old clients).

**Owner answers 2026-10-24:** gate access = (a): Andy adds himself a subassignment on the active
HAS Enterprises → Wxperts LLC engagement for the wxKanban project (web app, by hand) — **do this before
the server is pushed.** Andy's underlying pain: one person needing different emails for different
roles/companies; a candidate for its own scope (multi-company identity), not SPEC-144. SPEC-093
amendment approved.

**Done 2026-10-24 — YappChatt SPEC-093 Amendment A (YappChatt repo, uncommitted):** spec.md + the scope
doc (FR-002 / FR-005 criteria, API Routes, Notes) and tasks T009/T010. Code: `GET
/api/consumer/accounts?email=` (C1.0, `lookupAccount`, read-only) and `deleteRoomMember` refuses the
owner with 409 `owner_protected` (C1.8, via new `ConsumerTx.getRoomRole`; `findUserByEmail` added for
C1.0). Tests: consumer suites 50/50 (5 new), full web suite 211/211, `tsc` 0, eslint 0. Driven through
the real route handlers against the in-memory store; a live call waits for the YappChatt deploy (T008).
The two new tasks are NOT in the YappChatt project's DB (this session's MCP token is bound to wxKanban).

**Done 2026-10-24 (later) — owner amendments, applied:**
- **D2 amended:** a consulting company's ADMINs and TEAM_MANAGERs count on EVERY project their
  company holds a live assignment on (no subassignment); other consulting members still need one.
  Spec clarification 10, contracts D2. Code: `communityMembership.ts` (gate) and
  `CompanyYappchattService.ts` (`consultingMembers` + `knownPeople` removal candidates). Tests 42/42.
  **Live: andy@wxperts.com + the project token → 200** (HAS TEAM_MANAGER, HAS holds a whole-project
  grant on Wxperts LLC's "VS Code Interface"). No subassignment needed any more. For the
  wxKanban Development ROOM, HAS still needs a grant on that project (Wxperts side).
- **FR-012 added (consultant approvers):** per engagement, off by default; checkbox on the
  ConsultantsPanel card and in InviteConsultingCompanyModal; client ADMIN only; audited. Spec +
  scope FR-012, Data, API, Frontend; contracts D6; tasks T016–T019; reviewed SQL
  `sql/0002-consultant-approvers.sql` (NOT applied). Touches SCOPE-037 files. Not built yet.
  T016–T019 are NOT in the DB yet.

**Done 2026-10-24 (G.O.D. session 3) — SQL applied, WP-4 server edits in, the server compiles:**
- **SQL:** Andy applied `sql/0001-company-yappchatt.sql` (wxKanban) and YappChatt `0031_conversation_retiredat.sql`;
  0001 verified read-only (7 columns, partial index, old constraint gone) and logged in the SCOPE-117
  schema-change-log. SPEC-143 `agentruns.sql` also applied and verified; `npm run db:drift` exit 0.
  `sql/0002-consultant-approvers.sql` (FR-012) is **not** applied yet.
- **Code (owner-approved through the Change Impact hook, all six recorded in the agreement log):**
  `yappchattBroker.ts` (C1 client, plus C1.0 `consumerLookupAccount` for D5), `AgentConnectService.ts`,
  `routes/projectAgent.ts` (incl. `GET /approver`), `routes/agentConnect.ts`, `app.ts` mounts,
  `db/schema/projectroom.ts` (`owneryappchattid`, `retiredat`, partial unique index). All six exactly as
  in `wp4-pending-edits/`, apart from C1.0.
- **Checks:** `tsc` shows no error in any SPEC-144 file (the repo's existing baseline is unchanged);
  `build:server` bundles. WP-4's two pending tests moved to `tests/unit/agentConnectService.companyRoom.test.ts`
  and `tests/backend/projectAgent.yappchatt.route.test.ts`; SPEC-144 suites 9 files, 94/94. Contract tests
  (real app, prod DB) and a live endpoint test NOT run.

**Live endpoint test 2026-10-24 — PASSED, state unchanged:** the real `createApp()` (no background
jobs) against prod DB + deployed YappChatt: 401/401/400 on the guards, real kit token → 409
`no_company_account` with `contactEmail`; no account, room, audit row or token written.

**US1 for real — ON HOLD (owner, 2026-10-24).** Read-only dry run of `connectCompany` for Wxperts LLC:
contact `admin@wxperts.com` already has a YappChatt account (linked, no welcome email); 1 company user
(the same `admin@wxperts.com`, ADMIN) and 2 consulting members (HAS), all with existing YappChatt
accounts; seat limit null (unlimited); 1 live room, not company-owned. Note: the company account and the
ADMIN user are the SAME YappChatt identity, so the group owner is also that admin. Do NOT run the room
step (US3) before the new server is deployed: the old prod code looks rooms up without `retiredat`, so
retiring the KAIN room early can break today's GO REMOTE.

**Done 2026-10-24 — D5 preview BUILT (owner-approved, 8 hook-gated edits):** `previewConnect()` +
`CompanionClient.lookup` (C1.0); `POST /api/company/yappchatt { confirm: false }` → `{ wouldLink }`, no
write, no audit; `GET` now returns `contactEmail` and `email` null until linked (contract C3, answer #5);
the Team chat panel asks for the preview before opening the dialog, which says "link (no email)" or
"create (welcome email)". Tests: SPEC-144 suites 105/105. Live, read-only: Wxperts LLC →
`wouldLink { admin@wxperts.com, exists: true }`, nothing written.

**Released 2026-10-24 → 25 (owner-driven, step by step):** commits by area (SPEC-127, 136, 142, 143,
144) + version bump, pushed `357d76d5..d009ad56`. Cockpit 0.2.45 (Marketplace), kit v1.7.84 (GitHub,
assets SHA-verified, archive listed), app 1.5.347 + MCP live; prod guards verified (401s, community
`token_required`). Owner linked the company account in the Team chat panel 2026-10-25: Wxperts LLC →
admin@wxperts.com (linked, no email), group created, 2 consulting members added, audit rows present.
The old KAIN room (2026-09-25, no owner) is retired and replaced on the next KAIN connect (GO REMOTE).
Found while verifying the kit: the gitignored `wxkanban-agent/.wxai/.entitlement` ships in the public
archive (also v1.7.83; token expired 2026-08-12) — release-script fix still open.

**Next step:** confirm the room replacement after GO REMOTE; then T010 (bridge approver check), T016–T019
(`0002` is applied); then the 30 review findings, AlertDialog, T015 acceptance.

**Do not push yet:** the SPEC-144 server must ship AFTER the Cockpit and kit releases (client-first
release order below), and the YappChatt SPEC-093 build must be deployed first or every company-chat call
answers `companion_unavailable`. The "declared before the column exists" comments in `company.ts`,
`userprofiles.ts` and `projectroom.ts` are now stale (the columns exist) and can be dropped.

## Status by area

| Area | Built | Blocked by the Change Impact hook (needs the owner's approval) |
|---|---|---|
| WP-1 Security gate (T002) | `core/yappchatt/client.ts`: `authorId`, Bearer when `kitApiToken` is set, 403 message shown as is; 5 tests | **The server gate in `src/server/routes/community.ts` — the hole is still open**; Cockpit `chatSocket.ts`; filling `kitApiToken` in `resolveYappchattConfig` |
| WP-2 YappChatt SPEC-093 (T001–T007) | **Done**: 9 consumer endpoints, `conversations.retiredat` migration (not applied), list filter, post refusal; 36 new + 161 existing tests pass; tsc 0 | — (T008 live acceptance not run) |
| WP-3 Database (T003, T004) | `sql/0001-company-yappchatt.sql`, schema-change-log entry, `companies` + `userprofiles` declarations | `projectrooms` declaration (`owneryappchattid`, `retiredat`, partial unique index) |
| WP-4 Server (T005–T009, T013) | `CompanyYappchattService.ts`, sync observer, `/api/company/yappchatt` route file, tests | broker client (`yappchattBroker.ts`), `AgentConnectService.ts` room rules, `projectAgent.ts` (409, approver route), `agentConnect.ts`, `app.ts` mounts |
| WP-5 Web UI (T012) | `TeamChatPanel` + 16 tests | — (no shadcn AlertDialog exists in the repo; needs `@radix-ui/react-alert-dialog` + the shadcn component) |
| WP-6 Bridge (T010, T011) | `route.mjs` / `kain.mjs` `--approved-by`; 228 askgate tests pass | `decision-reply.ts` approver check, `bridge.ts` wiring, `agent-mode.ts` 409 prompt, Cockpit `projectAgent.ts` launcher |
| WP-7 Docs (T014, T015 plan) | `docs/kain-contract.md`, decision-memory help, Team chat help section, SPEC-142 note, `acceptance.md` (all "not run") | — |

Reviews: 30 findings (10 high), in `handoffs-and-reviews.json` → `reviews`. The highs are the unbuilt
gate, the unwired approver check, the missing `projectrooms` declaration, the uncompilable service, the
unset `kitApiToken`, and D1 below.

## Owner decisions needed

- **D1 — Approver identity (high, reviewer 1).** The approver check trusts the poster's YappChatt
  identity, but the session gate lets anyone holding the shared app token open a session for **any**
  colleague's email, so a developer could post as an ADMIN and "approve". Options: (a) accept
  within-company trust for v1; (b) the app token opens sessions only for the **company account** (the
  bridge's read identity); a session for a person's own email needs that person's own wxKanban sign-in
  (the web app now, the Cockpit later). Recommended: (b).
- **D2 — Who is a "current" consulting member.** Proposed: an active subassignment on an active
  engagement assignment on one of the company's projects, engagement state `active` only (not paused,
  disabled or ended); deactivated users (`active = false`) refused everywhere.
- **D3 — Seat limit vs consultants.** `companysubscriptions.activeuserlimit` counts the company's own
  users, but the group also holds consulting members, so a full company gets `seat_limit_reached`.
  Proposed: group seat limit = `activeuserlimit` + the number of current consulting members.
- **D4 — Who sees the Team chat status.** The panel sits in the ADMIN-only Company settings tab.
  Proposed: ADMINs only for v1 (status plus the button); everyone else sees rooms in YappChatt itself.
- **D5 — Showing the account before linking (FR-002).** C3 has no preview. Proposed: POST
  `{ confirm: false }` returns `{ wouldLink: { email, exists, displayName } }` with no change (YappChatt
  needs a read-only lookup, C1.0), then the admin confirms.

## Managing-agent answers (apply to contracts.md on resume)

1. C1.8 removing the room owner → 409 `owner_protected` (YappChatt change).
2. Seats: the owner does not take a seat (as built, matching SPEC-093 US1).
3. C1.1 `created: true` leaving two audit rows (signup + consumer_api) is fine.
4. Add 400 `invalid_request { field }` to every C1 body; C1.4 returns `updated` for a role change.
5. C3 GET adds `contactEmail` (always the company contact email); `email` is the linked account's email or null.
6. `members.added/updated/removed` are counts; `failed` is `[{ userid, reason }]`.
7. 503 body is `{ error: "companion_unavailable", message }`; 403 body `{ error: "forbidden" }`.
8. Approver `name: null` → not recorded (never falls back to "owner").
9. The approver route writes `yappchatt.decision.accepted/refused`; 401s with no token (no company) are not audited.
10. A replacement room returns `minted: true` with a new room token for the caller.
11. spec.md API Routes and tasks.md T006 change to `/api/company/yappchatt`.
12. Ownership additions: `tests/contract/community-session.test.ts` → WP-1; Cockpit `vscode-extension/src/services/projectAgent.ts` → WP-6 (T011 stays in `agent-mode.ts`, no `main.ts` change); `userprofiles.ts` is the right file.
13. `createCompanyAccount` by any app-token holder is allowed (FR-006; it always uses the contact email).

## Release order (unchanged)

1. FR-009 gate (with D1's answer) — alone, first. 2. YappChatt SPEC-093 + its migration.
3. The owner applies `sql/0001-company-yappchatt.sql`, then `npm run db:drift`. 4. The rest of SPEC-144.
5. T015 live acceptance.
