# Acceptance plan: Company YappChatt Account (SPEC-144, T015)

**Status: not run.** This is the plan for the live acceptance run. Nothing below has been run.
Every row says "not run" until someone runs it and pastes the evidence. Unit tests passing is
not acceptance: each row is checked live, against the deployed apps, and its result is read from
data (database rows, the ledger, the audit log), not from what the screen or the agent says.

Written by WP-7 on 2026-10-24 from `spec.md`, `contracts.md` (C1 to C4) and the approved scope
`specs/Project-Scope/144-company-yappchatt-account.md`.

## Preconditions

All must be true before any row is run. Tick each one with the date and who checked it.

| # | Precondition | How to check | Done |
|---|---|---|---|
| P1 | YappChatt SPEC-093 (consumer API, retired rooms) is deployed | `curl -s -o /dev/null -w "%{http_code}" -X POST "$YC/api/consumer/accounts" -H "content-type: application/json" -d "{}"` answers **401** (route exists, secret missing), not 404 | no |
| P2 | The SQL `sql/0001-company-yappchatt.sql` is applied by the owner | Its VERIFY block: 7 column rows, the partial index `projectrooms_projectid_agentname_active_key` present, the old constraint gone; `npm run db:drift` exit 0; entry in `specs/117-production-schema-integrity/schema-change-log.md` | no |
| P3 | SPEC-144 is deployed: WP-1 to WP-6 merged, schema declarations pushed only after P2 | `GET $WXK/api/company/yappchatt` with a user JWT answers 200 with a `connected` field; `POST $WXK/api/community/session` without a token answers 401 | no |
| P4 | `WXKANBAN_CONSUMER_SECRET` is set on both services and matches | A C1 call from wxKanban does not come back `companion_unavailable` (seen in P3's first US1 step) | no |
| P5 | The test company and people below exist, and no real customer is used | Query T1 (below) returns the fixture | no |
| P6 | The kit bridge with T010/T011 is built and installed in the Billing test repo | `wxkanban-agent --version` in that repo shows the release that carries SPEC-144 | no |

`$WXK` is the deployed wxKanban app (`https://wxkanban.wxperts.com`) and `$YC` the deployed
YappChatt (`https://www.yappchatt.com`). There is no staging database: the local `.env`
`DATABASE_URL` is production. Every query in this plan is read-only (`SELECT` only). Nothing in
this plan applies SQL, runs `drizzle-kit push`, or touches a real customer.

### Test fixture

| Who | wxKanban | Purpose |
|---|---|---|
| Company **Acme Test** | contact email (Billing Email) is an inbox the owner reads, e.g. `info@<owner test domain>` | The company under test. Its welcome email is real, so the inbox must be the owner's own |
| A1 | ADMIN of Acme Test | Presses the button; Room Approver everywhere |
| M1 | TEAM_MANAGER, member of project Billing (`projectusers`, not removed) | Room Approver on Billing (US3) |
| U1, U2 | TEAM_MEMBER | Not approvers |
| U3 | TEAM_MEMBER | Removed in US5 |
| Projects **Billing** and **Payroll** | Acme Test projects | Billing gets the new room (US2); Payroll has an old room (US5) |
| Consulting firm **Consult Test** | Engagement with Acme Test, started in US2 | C1 assigned to Billing only; C2 assigned to Payroll only |
| Company **Other Test** | Its own users and its own project kit token | The "another company" in US6 |
| Outsider | An email that is in no test company | US6 |

The Payroll old room: before P3 (with the code that is live today), connect the project agent
once on Payroll, so Payroll has a `projectrooms` row created the old way. After P2 that row has
`owneryappchattid` NULL, which is what FR-007 retires.

### Queries used below (read-only)

```sql
-- T1 fixture
SELECT u.id, u.emailaddr, u.usertype, u.active, u.yappchattuserid
  FROM userprofiles u JOIN companies c ON c.id = u.companyid
 WHERE c.name = 'Acme Test' ORDER BY u.emailaddr;

-- T2 company account
SELECT id, contactemail, yappchattuserid, yappchattemail, yappchattlinkedat, yappchattgroupid
  FROM companies WHERE name = 'Acme Test';

-- T3 rooms of the company's projects (live and retired)
SELECT p.name, r.agentname, r.conversationid, r.owneryappchattid, r.retiredat, r.createdat
  FROM projectrooms r JOIN companyprojects p ON p.id = r.projectid
 WHERE p.companyid = :acme ORDER BY p.name, r.createdat;

-- T4 audit rows for SPEC-144 since a start time
SELECT action, changedby, newvalue, timestamp
  FROM companyauditlogs
 WHERE companyid = :acme AND action LIKE 'yappchatt.%' AND timestamp >= :start
 ORDER BY timestamp;
```

YappChatt side (read-only, YappChatt database, schema `yappchat`):

```sql
-- Y1 group members
SELECT u.email, m.role FROM yappchat.orgmemberships m JOIN yappchat.users u ON u.id = m.userid
 WHERE m.orgid = :groupid ORDER BY u.email;
-- Y2 room members
SELECT u.email, m.role FROM yappchat.conversationmembers m JOIN yappchat.users u ON u.id = m.userid
 WHERE m.conversationid = :conversationid ORDER BY u.email;
-- Y3 room state
SELECT id, title, retiredat FROM yappchat.conversations WHERE id = :conversationid;
-- Y4 consumer audit
SELECT eventtype, payload, createdat FROM yappchat.authauditlog
 WHERE createdat >= :start ORDER BY createdat;
```

Timestamps: `companyauditlogs.timestamp` has no time zone and reads about 5 hours off locally.
For timings, compare audit rows with each other, not with a local clock.

## User stories

### US1 — Admin creates the company account

| Step | Do | Check from data | Result |
|---|---|---|---|
| 1.1 | As U1 (not ADMIN), call `POST $WXK/api/company/yappchatt` with `{ "confirm": true }` | 403. T2: `yappchattuserid` still NULL. T4: no new row | not run |
| 1.2 | As A1, open Settings, Company tab, Team chat. Note the panel | Panel shows "YappChatt account: not connected" and the button. T2: NULL | not run |
| 1.3 | Press **Create YappChatt account**; the confirm shows the contact email; confirm. Time from the press to the panel showing Connected | Panel: "Connected: <contact email>" and the id. T2: `yappchattuserid`, `yappchattemail` = contact email, `yappchattlinkedat`, `yappchattgroupid` all set. The welcome email arrives in the owner's inbox | not run |
| 1.4 | Read the group | Y1 on `yappchattgroupid`: the company account as `owner`, A1 as `admin`, M1, U1, U2, U3 as `member`. Nothing else | not run |
| 1.5 | Read each person's id | T1: all 5 users have `yappchattuserid` set, each matching their row in `yappchat.users` | not run |
| 1.6 | Read the audit | T4: one `yappchatt.account.created` (`changedby` = A1) and one `yappchatt.member.added` per user (5). No token or secret in any `newvalue` | not run |
| 1.7 | Press the button again (call the POST again as A1) | Response `outcome: "already"`. T2 unchanged (same id, same `yappchattlinkedat`). T4: no new account row. Y4: no new account created | not run |
| 1.8 | Link case: on a second test company whose contact email already has a YappChatt account, press the button | Response `outcome: "linked"`; the panel names the account found. T2 id equals that existing YappChatt user id. One `yappchatt.account.linked` row. No welcome email | not run |

### US2 — The project agent opens a room and the team is there

Before: start the Consult Test engagement; assign C1 to Billing and C2 to Payroll.

| Step | Do | Check from data | Result |
|---|---|---|---|
| 2.0 | After the engagement starts | Y1: C1 and C2 now in the group as `member`. T4: one `yappchatt.member.added` each | not run |
| 2.1 | Start the project agent on Billing (no room yet) | T3: one Billing row, `retiredat` NULL, `owneryappchattid` = T2 `yappchattuserid`. The room reply carries `ownerYappchattId` | not run |
| 2.2 | Read the room | Y3: title "Billing · KAIN". Y2: the company account, A1, M1, U1, U2, U3 and C1. **C2 is not there** | not run |
| 2.3 | Each of the 6 people signs in to YappChatt as themselves | Each sees "Billing · KAIN" in their own room list (screenshot per person) | not run |
| 2.4 | Read the audit | T4: one `yappchatt.room.created` for Billing | not run |
| 2.5 | Connect KAIN on Billing (`POST $WXK/api/agent/connect`) | Same `conversationId` as 2.1; no second live row in T3 | not run |

### US3 — A TEAM_MANAGER answers a parked question; a TEAM_MEMBER cannot

Before: in the Billing repo, have the agent park one unit on a question so the room shows
"Decision needed (DQ-01)". Note the ledger's last id.

| Step | Do | Check from data | Result |
|---|---|---|---|
| 3.1 | U1 (TEAM_MEMBER) posts `DQ-01: yes` in the room | `decisions/ledger.yaml`: no new entry. The room shows "Not recorded: only an ADMIN or this project's TEAM_MANAGER can decide." The session got the text as discussion (bridge log). DQ-01 still open in `GOD-Decisions.md`. T4: one `yappchatt.decision.refused` | not run |
| 3.2 | M1 (TEAM_MANAGER on Billing) posts `DQ-01: no, use seeded data` | Ledger: one new entry, `approved_by:` M1's display name, source `GOD-Decisions.md#DQ-01`. DQ-01 answered; its unit resumes. `/wxLedger check` passes. T4: one `yappchatt.decision.accepted` | not run |
| 3.3 | KAIN posts `[KAIN] DQ-02: ...` on a second parked question, then `[KAIN] KR-nnnn approve` | DQ-02 becomes a pending KR in `decisions/kain-replies.yaml`; no ledger entry. The KR approve is refused; the KR stays pending | not run |
| 3.4 | U2 posts `KR-nnnn approve` | Not recorded; the room note appears; KR still pending | not run |
| 3.5 | A1 posts `KR-nnnn approve` | One ledger entry, `approved_by:` A1's name; the KR shows `reviewedBy` A1; one verdict post in the room | not run |
| 3.6 | Approver check by hand: `GET $WXK/api/project-agent/approver?yappchattUserId=<id>` with the Billing kit token, for M1, U1, A1, C1 | M1 and A1: `approver: true` with name and role; U1 and C1: `approver: false` | not run |

### US4 — No company account yet

Use a third test company, **NoChat Test**, with no YappChatt account, one project and its kit.

| Step | Do | Check from data | Result |
|---|---|---|---|
| 4.1 | Start the project agent | The agent asks "Create the company YappChatt account now, using <contact email>?". The room call answered 409 `no_company_account` with `contactEmail`. T3: no row for this project | not run |
| 4.2 | Answer **no** | The agent stops with that message. T2 for NoChat Test: all NULL. T3: no row. T4: no row. Y4: no account or room calls | not run |
| 4.3 | Start again and answer **yes** | US1's checks 1.3 to 1.6 hold for NoChat Test, then US2's 2.1 and 2.2. The room owner is the company account | not run |
| 4.4 | Over all test companies | T3: no row anywhere whose `owneryappchattid` differs from its company's `yappchattuserid` (query in SC1) | not run |

### US5 — Someone leaves, and an old room is replaced

| Step | Do | Check from data | Result |
|---|---|---|---|
| 5.1 | A1 removes U3 from Acme Test. Note the time | Within one sync: Y1 has no U3; Y2 on every Acme room has no U3. T4: `yappchatt.member.removed` rows for U3. Time from the removal to the last of those rows | not run |
| 5.2 | End C1's assignment on Billing | Y2 on Billing: no C1. T4: one `yappchatt.member.removed` | not run |
| 5.3 | Start the project agent on Payroll (old room from the fixture) | T3: the old Payroll row has `retiredat` set; a new live row with `owneryappchattid` = company account. The reply carries `replacedConversationId` = the old room | not run |
| 5.4 | Read the old room in YappChatt | Y3: old room exists, `retiredat` set. Its messages are still there (the owner can read them). Members no longer see it in their room list. A post to it is refused | not run |
| 5.5 | Read the audit | T4: one `yappchatt.room.retired` and one `yappchatt.room.created` for Payroll | not run |

### US6 — Someone tries to borrow a login

`POST $WXK/api/community/session` with body `{ "email": "<email>" }`:

| Step | Do | Check from data | Result |
|---|---|---|---|
| 6.1 | No `Authorization` header, U1's email | 401 `token_required`. No session cookie. See open question Q1 for the audit row | not run |
| 6.2 | A made-up Bearer token, U1's email | 401 `invalid-token`. No session | not run |
| 6.3 | Other Test's kit token, U1's email | 403 `not_company_member`, message "This email isn't a member of your company". No session. T4 for **Other Test**: one `yappchatt.session.refused` with the email, no token | not run |
| 6.4 | Acme's kit token, the outsider's email | 403 as 6.3. T4 for Acme: one `yappchatt.session.refused` | not run |
| 6.5 | Acme's kit token, U1's email; then C2's email | 200 and a session for each (FR-009: the company's own people and its consultants still connect) | not run |
| 6.6 | Acme's kit token, U3's email (removed in US5) | 403 | not run |
| 6.7 | The Cockpit's Community Help in the Acme repo, signed in; then with a typed outsider email | The panel opens; the outsider email shows "This email isn't a member of your company" as is | not run |
| 6.8 | The bridge read login and KAIN's read (kain-contract section 4) | Both get a session with the project MCP token; both fail 401 without it | not run |

## Success criteria

| # | Criterion | How it is measured from data | Result |
|---|---|---|---|
| SC1 | 100% of rooms created after release are owned by the company account | `SELECT count(*) FROM projectrooms r JOIN companyprojects p ON p.id = r.projectid JOIN companies c ON c.id = p.companyid WHERE r.retiredat IS NULL AND r.createdat >= :release AND r.owneryappchattid IS DISTINCT FROM c.yappchattuserid;` must be 0 | not run |
| SC2 | Every old room is replaced on its project's first connect after release | For every project with a connect after release: no live row with `owneryappchattid` NULL. Count live rows with NULL owner whose project has connected since release: 0. Test run: US5 step 5.3 | not run |
| SC3 | Right people in each room; a removal is out within one sync, under 5 minutes | Y2 for Billing and Payroll equals the expected set exactly (all users plus that project's consultants). US5 5.1: the time between the removal and the last `yappchatt.member.removed` row is under 5 minutes | not run |
| SC4 | 0 sessions without a token or for an outside email; every refusal audited | US6 6.1 to 6.4 and 6.6 issue no session. Every 403 has exactly one `yappchatt.session.refused` row | not run |
| SC5 | Only Room Approvers decide; every decision names its approver | Over the run: every new ledger entry from the room has `approved_by` equal to A1's or M1's name, and none equals U1, U2, C1 or KAIN. Every reviewed KR has `reviewedBy` set to an approver | not run |
| SC6 | One press, under one minute, a 5-person team in the group, no YappChatt steps by hand | US1 1.3: one press. Time from the `yappchatt.account.created` row to the last of the five `yappchatt.member.added` rows is under 60 seconds. Nobody touched YappChatt by hand | not run |
| SC7 | 100% of FR-010 actions leave exactly one audit entry | Count each action done in the run (account created or linked, member added or removed, room created or retired, session refused, decision accepted or refused) and compare with T4 grouped by `action`. Every count equal | not run |

## Extra checks

| # | Check | How | Result |
|---|---|---|---|
| E1 | FR-011: with the companion missing, nothing half-completes | Before P1 (or with the secret unset on a test deploy): press the button. The panel shows "YappChatt isn't ready for this yet — try again later."; 503 `companion_unavailable`; T2, T3, T4 unchanged | not run |
| E2 | Hand-made membership change is undone | Add an outsider to the Billing room by hand in YappChatt; run one agent connect; Y2 no longer has them | not run |
| E3 | Seat limit is reported, not silent | On a company whose plan seat count is below its people, press the button: the panel lists who was not added with the reason; the log has a seat-limit warning | not run |

## Open questions for the run

- **Q1.** US6 6.1 (no token): the contracts say every refused session writes a
  `companyauditlogs` row, but with no token there is no company to write it under
  (`companyid` is required). Decide before the run whether 6.1 expects no audit row, or a
  server log line only.
- **Q2.** US5 5.3: whether `POST /api/agent/connect` mints a new room token for the
  replacement room on its own, or KAIN must reconnect with `mintAgentToken: true`. The KAIN
  contract tells KAIN to reconnect if no token comes back.

## Evidence

Paste for each row: the request and response (tokens masked), the query and its rows, and the
time. Keep scripts under `evidence/` as SPEC-142 did.
