# KAIN ↔ wxKanban contract

*SCOPE-132 FR-035 / SPEC-134. For whoever builds or maintains KAIN in SpokAI.*

*Updated for SCOPE-144 / SPEC-144 (company YappChatt account), 2026-10-24. What changed for KAIN:
the room read login now needs the project MCP token (section 4); rooms belong to the company's
YappChatt account and old rooms are retired and replaced (section 3); only Room Approvers answer
and review in the room (sections 5 and 7). Not live until SPEC-144 and YappChatt SPEC-093 ship.*

*Updated for SCOPE-132 Amendment F / SPEC-152 (KAIN signs in as a person), 2026-10-28. What changed
for KAIN: the Company Access Token and the per-project KAIN tick are gone. KAIN signs in with a
person's wxKanban email and password and holds a device token (sections 1 and 2). What KAIN can
reach is worked out from that person's roles and assignments (section 2). Every call is re-checked
(section 6).*

*Updated for SCOPE-132 Amendment H / SPEC-154 (Project Agent Autopilot), 2026-11-07. What's new for
KAIN: an unattended run posts a startup list, skip cascades, a 15-minute heartbeat, parked-unit
lines, and a live gate question when a unit hits a decision neither the ledger nor its own scope
text answers, all tagged `[<project>]` like any other project-agent post (section 8). FR-012's
release gate is now open (`src/server/services/AutopilotReleaseGate.ts`) — this is a live feature,
not a future-format note.*

KAIN supervises wxKanban projects. Each project has its own **project agent**, which the
wxKanban kit runs inside that project's repository. KAIN and the project agent talk in the
project's YappChatt room. KAIN never touches a project's files; the project agent does the
work.

```
KAIN (SpokAI)                       wxKanban                        Project repo
─────────────                       ────────                        ────────────
email + password ───► POST /api/agent/signin   ──► device token (kdt_…)
device token ───────► GET  /api/agent/grants    (which projects)
                     ──► POST /api/agent/connect   ──► room + MCP token
      │                                                              project agent
      │  YappChatt room (WebSocket) ◄────────────────────────────► (kit bridge,
      │  [KAIN] …                                    […project…]    --project-agent)
      └─ hosted MCP (project token) ──► status, tasks, specs, record_override
```

## 1. Credentials

| Credential | Where it comes from | What it can do |
|---|---|---|
| **Person's login** | The person's own wxKanban email and password, typed into KAIN. Used once, at sign-in. | Nothing after sign-in. wxKanban never stores the password, and KAIN must not either. |
| **Device token (`kdt_…`)** | Returned by `signin`. Shown **once**. Only its SHA-256 is stored. | Lists the projects that person can reach and connects to them. Reads **no** project data. It has no fixed expiry (section 2). |
| **Project MCP token** | Returned by `connect`. Valid for 12 hours, named `agent-grant:KAIN:<deviceId>`. Reconnecting revokes only **this device's** earlier token for that project, so a phone and a laptop never revoke each other. | Normal hosted-MCP access to one project. **Re-checked on every MCP call** (section 6). It is also the `Bearer` for the room read login (section 4). |
| **Room token (`yca_…`)** | Returned by `connect` **once** per room, the first time. | Post into that project's room. **Keep it.** wxKanban does not store it, and YappChatt never revokes old ones. A room that has been retired takes no new posts (section 3). |

## 2. Signing in, and what you can reach

### Sign in

```
POST https://wxkanban.wxperts.com/api/agent/signin
{ "email": "…", "password": "…", "deviceName": "Andy's phone" }

201 { "token": "kdt_…", "deviceId": "…", "deviceName": "…",
      "userId": "…", "displayName": "…", "companyId": "…", "companyName": "…" }
401 { "error": "invalid_credentials" }   wrong password, unknown email, or the person is inactive
423 { "error": "account_locked" }        too many wrong passwords; wait and try again
```

- The token is shown once. Store it where KAIN keeps secrets. wxKanban cannot show it again.
- No cookie is set. This is not a web session.
- Signing in again with the **same `deviceName`** replaces that device's token. Other devices are
  untouched. Use a different `deviceName` for each phone or laptop.
- Every sign-in is written to the audit log (`agent.signin`; refusals as `agent.signin.refused`).
- Known gap: there is no second-factor step at sign-in, the same as the web app.

### How a device token ends

A device token has no fixed expiry. It ends when:

- the person revokes the device (Settings, Profile, **My K.A.I.N. devices**),
- a company ADMIN revokes it (Settings, Company),
- the person's password is changed or reset, or
- the person is deactivated or leaves the company.

Any call with an ended token answers `401 { "error": "device_signed_out" }`.

### Reach

What a person can reach is worked out on every call, from their roles and assignments. KAIN sees
nothing more than the person could.

| Where the person works | Projects reached |
|---|---|
| Own company, ADMIN | Every Project of the company |
| Own company, any other member | The Projects they are assigned to, or where they lead an in-progress phase. The web app's "show all" view preference does not widen this. |
| Consulting company, ADMIN or TEAM_MANAGER | Every Project their company holds a **whole-Project** assignment on, under an **ACTIVE** engagement |
| Consulting company, any other member | Only the Projects they are personally sub-assigned to |

- Scope-level or task-level assignments grant nothing.
- Paused, disabled or ended engagements grant nothing.
- Every reached Project must also have **Allow remote** on (the switch on the Project's Agent
  Access panel) and must not be archived.

### Listing projects

```
GET https://wxkanban.wxperts.com/api/agent/grants
Authorization: Bearer <device token>

200 { "userId": "…", "deviceId": "…", "count": 3,
      "projects": [ { "projectId": "…", "projectName": "…",
                      "companyId": "…", "companyName": "…",
                      "via": "own" | "engagement",
                      "engagementId": "…" | null } ] }
401 { "error": "invalid-token" }         unknown token
401 { "error": "device_signed_out" }     the token has ended (see above)
```

- `via: "own"` is a Project of the person's own company. `via: "engagement"` is a client
  company's Project reached through a consulting engagement; `engagementId` names it.
- The list is ordered: own company first, then each client company by name.
- Poll this on sign-in and periodically. A Project that gains Allow remote, or a new assignment,
  appears here on the next poll. A Project that loses reach drops out.

## 3. Connecting to a project

```
POST https://wxkanban.wxperts.com/api/agent/connect
Authorization: Bearer <device token>
{ "projectId": "<uuid>" }                  add "mintAgentToken": true only if you lost your room token

200 { "projectId", "projectName", "agentName": "KAIN",
      "mcp":  { "token": "…", "expiresAt": "…" },
      "room": { "conversationId": "…", "minted": true|false,
                "agentToken": "yca_…"   (only when minted is true),
                "operatorEmail": "…",
                "ownerYappchattId": "…",          the company YappChatt account that owns the room
                "replacedConversationId": "…" } } only when an old room was retired on this connect
400  the body contained anything else. A room id is never accepted; the room comes from the grant.
401 { "error": "device_signed_out" }       the device token has ended; sign in again
404 { "error": "not_granted" }             outside the person's reach (any reason, same answer for all)
409 { "error": "no_company_account", "contactEmail": "…" }
                                           the company has no YappChatt account yet. No room is created.
                                           A company ADMIN must create it first (Company Settings, Team chat).
502 { "error": "not_a_member", … }         YappChatt refused. This is reported once and never retried.
503 { "error": "companion_unavailable" }   YappChatt's side of this is not deployed. Nothing was changed.
```

Each successful connect is written to the audit log as `agent.connect`, filed under the
**Project's** company. A client company can therefore see whose KAIN connected to its Project.

**Who owns the room (SPEC-144).** Every project room belongs to the company's own YappChatt
account, never to the person who signed in. Its members are all of the
company's users plus the consulting members assigned to that project. wxKanban keeps the
membership in line: when people join or leave the company, or an engagement starts or ends,
they are added or removed. If the project agent connected first, you get the room it created;
it is the same company-owned room.

**No company account.** If the company has not created its YappChatt account yet, `connect`
answers `409 no_company_account` and creates no room. KAIN cannot create the account. Tell the
operator in your own channel, and try again later.

**Retired rooms.** A room created the old way (owned by a person, or with no owner recorded) is
retired on the next connect and a new company-owned room replaces it. The old room keeps its
history but takes no new posts. When `replacedConversationId` is in the reply:

- Stop posting to the old room and use the new `conversationId` from now on.
- Your old `yca_` token was for the old room. If this reply has no `agentToken`, reconnect once
  with `"mintAgentToken": true` to get one for the new room.

### Retired: Company Access Tokens and the per-project tick

These no longer work. Do not build against them.

- `POST /api/company/agent-tokens` answers `410 { "error": "use_signin" }`. Every Company Access
  Token that existed has been revoked.
- `PUT` and `DELETE /api/projects/:id/agent-access/:agent` answer `410 { "error": "use_signin" }`.
  A Project is no longer "ticked" for KAIN. The Project's admin controls **Allow remote** only.

On `use_signin`, switch to the sign-in flow in section 2.

## 4. Talking in the room

- **Posting.** Send `POST https://www.yappchatt.com/api/engine/conversations/<conversationId>/messages`
  with `Authorization: Bearer <yca_ token>` and body `{ "content": "[KAIN] …" }`.
  **Every post must begin with `[KAIN]`.**
- **Reading.** Use the same read path the kit bridge uses (`wxkanban-agent/core/yappchatt/client.ts`):
  1. Get a session from `POST https://wxkanban.wxperts.com/api/community/session` with
     `Authorization: Bearer <project MCP token from connect>` and body `{ email: operatorEmail }`.
     The email must belong to the token's company: one of its users, or a consulting member
     currently assigned to one of its projects. The answers you can get:

     ```
     200  the session, exactly as before
     401 { "error": "token_required" }        no Bearer token was sent
     401 { "error": "invalid-token" }         the token is unknown, revoked or expired; reconnect for a new one
     403 { "error": "not_company_member",
           "message": "This email isn't a member of your company" }
                                               no session; the refused attempt is written to the company audit log
     ```

     Before SPEC-144 this call took the email alone. That is no longer accepted.
  2. Load history with `GET …/api/engine/conversations/<id>/messages` (cookie `yc_session`).
  3. Get a WebSocket token from `GET …/api/ws/token`.
  4. Connect to `wss://ws.wxperts.com?token=…` and send
     `{ "action": "subscribe", "scope": "conversation:<id>" }`.
- **Telling authors apart.** YappChatt makes every agent in a room the **same user**
  ("Claude", `isagent`). The tag at the start of the text is the only way to tell who wrote
  a post:
  - `[KAIN] …` is you.
  - `[<project name>] …` is the project agent.
  - A post with no agent flag is a human. Whether a human's `DQ-nn` answer or `KR-nnnn` review
    counts depends on who they are (section 7).

## 5. What the project agent does with your messages

| You send | It does |
|---|---|
| `[KAIN] <anything>` | Treats the text after the tag as input to its session, exactly like the operator typing it |
| `[KAIN] STATUS` / `STOP` / `CONTINUE` | Runs the SCOPE-102 control word (status line, interrupt, continue) |
| `[KAIN] CANCEL REMOTE` | Shuts itself down. This is the kill switch. |
| `[KAIN] CONFIRMED` / `[KAIN] NO` **while it is waiting on a gated action** | Grants or refuses that one action |
| `[KAIN] DQ-01: <answer>` | Records your answer to that parked question for a Room Approver's review and resumes the unit (section 7) |
| `[KAIN] KR-0001 approve` (or change / reject) | Refuses it: only a Room Approver reviews your answers |
| An agent post without `[KAIN]` | Ignores it. This covers its own posts and any other agent's. |

**Gated actions.** Exactly two kinds of action stop and ask before they run: `git push` and
writes to the production database. The project agent posts a request that names the exact
command and waits.
- Either KAIN or a human may answer (constitution amendment, 2026-09-25).
- A grant covers that one action only.
- Silence means no: nothing runs until someone answers, and the project agent shutting down
  counts as a refusal.
- The project agent records every decision via `project.record_override` as `granted` or
  `denied`, with `grantedBy: "KAIN"` or the human's name. Answer with care: a `CONFIRMED`
  from you deploys to production.

## 6. Reading project state

Use the project MCP token from `connect` against `https://mcp.wxperts.com/mcp`, which takes
stateless JSON-RPC `tools/call` requests. Everything a project token can do works here,
including `project.cockpit_summary`, `project.list_open_items` and `project.session_start`.
The hosted MCP re-checks every connect-minted token on **every** call, so a change on the company
side stops KAIN on its next call. Two refusals, and what to do:

| Answer | Meaning | KAIN should |
|---|---|---|
| `401 { "error": "device_signed_out" }` | The device was revoked, or the token ended (password changed, person deactivated or left the company). | Stop all work on every project for this device and **sign in again** (section 2). Ask the person for the password; never keep it. |
| `401 { "error": "access_revoked" }` | That Project is no longer in the person's reach: Allow remote was turned off, the engagement was paused or ended, the assignment was removed, or the Project was archived. | **Drop that Project.** Keep working on the others. Re-check `GET /api/agent/grants` later; do not retry the Project in a loop. |

### Which project agents are connected

*SCOPE-132 Amendment D / SPEC-151, 2026-10-28.*

Every project agent keeps a record on the server while it runs, so you never need a project
folder to know who is up. Ask through the hosted MCP with any project MCP token from `connect`:

```
tools/call  project.list_agent_connections   { "includeHistory": false, "historyHours": 24 }

{ "success": true, "scope": "reach", "liveWindowSeconds": 180,
  "counts": { "projects": 3, "live": 1 },
  "projects": [ { "projectId", "projectName", "companyId", "companyName", "via",
                  "conversationId", "live": true,
                  "connection": { "connectionId", "machine", "repo", "agentTag", "kitVersion",
                                  "state": "idle" | "working" | "waiting",
                                  "connectedAt", "lastSeenAt", "disconnectedAt", "endReason" } } ] }
```

- **Reach.** With a KAIN token, the answer is `scope: "reach"`: every Project in the signed-in
  person's reach (section 2) across **all** their companies, not just the one the token was
  minted for. Each row also carries `companyId`, `companyName` and `via` (`own` or `engagement`).
  One token is enough; there is no longer one token per company.
- **Live** means the agent's record is open and it sent a heartbeat in the last 3 minutes. Agents
  send one every 60 seconds. A crashed agent stops reading as live 3 minutes after its last one.
- **State.** `waiting`: a gated action (push, production write) is waiting for an answer.
  `working`: a turn or a triage run is active. `idle`: ready for a message.
- **`connection: null`** means the project has never run an agent since this shipped. A closed
  record shows `endReason`: `stopped` (clean stop), `stale` (it vanished), or `replaced` (it was
  restarted on the same machine).
- **One agent per project.** A second machine starting the same project's agent is refused with
  `agent_already_connected`, naming the machine that has it.

## 7. Answering parked questions as the owner, and learning from the review

*SPEC-142 Amendment A, 2026-10-24; who counts as "the owner" changed by SPEC-144 FR-008.*

**Room Approvers.** In a project room, "the owner" means a **Room Approver**: a company ADMIN, or
a TEAM_MANAGER who is a current member of that project. Only a Room Approver's `DQ-nn` answer or
`KR-nnnn` review is recorded, and it is recorded under that person's name (`approved_by` in the
ledger). The bridge checks each human post with wxKanban before recording it. A reply from
anyone else, or one the bridge cannot check, is not recorded. It goes to the project agent as
ordinary discussion, and the room gets:

```
Not recorded: only an ADMIN or this project's TEAM_MANAGER can decide.
```

KAIN is never a Room Approver.

When a project's work hits a question that needs the owner, the project agent parks that unit and
posts it in the room:

```
[<project>] Decision needed (DQ-01): May I load the production customer data into the test database?
```

KAIN may answer it **acting as the owner**, so the work goes on:

```
[KAIN] DQ-01: No. Use the seeded test data.
```

| What happens | Detail |
|---|---|
| The unit goes on | The project agent resumes the units DQ-01 blocked, using your answer |
| Your answer is recorded as yours, for review | It becomes `KR-nnnn` in `decisions/kain-replies.yaml`, status `pending`. The project agent replies with the id |
| It is **not** a decision yet | It never goes into the decision ledger and never answers another question until a Room Approver approves it |
| Data-loss questions are not yours | A queue item marked data loss is refused; only a Room Approver answers it |
| You cannot review | `[KAIN] KR-0001 approve` (or change / reject) is refused. Only a Room Approver's post reviews |

The bridge, not the session, decides who answered: a `[KAIN]` post is KAIN; a human post counts
only when wxKanban says its author is a Room Approver. A `DQ-nn` that the project does not have
is relayed as an ordinary message.

**The owner's verdict is your training record.** Each reply is reviewed with `/wxLedger review`
in VS Code, or with `KR-0001 approve | change: <answer> | reject` in the room. In the room only a
Room Approver's post counts, and the verdict is recorded under that approver's name. Every verdict is posted to the room, exactly
once. In these posts "the owner" is the Room Approver who gave the verdict:

```
[<project>] KR-0001 (DQ-01) "May I load the production customer data…?" — KAIN answered "No. Use the seeded test data."; the owner approved it.
[<project>] KR-0002 (DQ-04) "…" — KAIN answered "…"; the owner changed it to: "…". Check the work done under it: S06.
[<project>] KR-0003 (DQ-05) "…" — KAIN answered "…"; the owner rejected it. Check the work done under it: S07.
```

Keep these. An **approved** reply is an example of answering as the owner. A **changed** reply is a
correction: the owner's text is how you should have answered. A **rejected** reply means that
answer was wrong and should not be repeated. When unsure, do not answer: leave the question for
the owner.

## 8. Autopilot runs

*SCOPE-132 Amendment H / SPEC-154, 2026-11-07. Live — the release gate is open. These are the
exact lines the run posts, each tagged `[<project>]` like any other project-agent post (section 4's
"Telling authors apart").*

When a project's Autopilot switch is on, the agent starts a run instead of waiting for the owner to
drive each scope by hand. Everything it posts is one of the six shapes below; nothing else.

**Startup list.** On run start, the agent reads the server dev plan, lists what remains in build
order, and waits for the owner's "go" — nothing starts without it:

```
[<project>] Autopilot startup — 3 scopes from the dev plan, in build order:

1. SCOPE-010 — Billing (Implementation)
2. SCOPE-011 — Invoices (Design)
3. SCOPE-012 — Reports (Design)

Reply "go" to start working this list. Nothing starts without it.
```

No server dev plan at all: the run does not start, and posts
`Autopilot can't start: no server dev plan was found for this project. Run the dev-plan command
first, then try again.` Everything in the dev plan already done or inactive: `Autopilot startup:
every scope in the dev plan is already in Release or inactive. Nothing to run.`

**Skip cascade.** The owner may skip a listed scope. The agent looks up its dependents and marks
each skipped or partly worked, then asks which are safe to keep:

```
[<project>] Autopilot is skipping SCOPE-010 — Billing. 1 dependent scope affected:

1. SCOPE-011 — Invoices (partly worked)

Reply "keep <scope numbers>" for the ones safe to keep, or "keep none" to skip them all too.
```

A skip with no dependents posts with no list: `Autopilot is skipping SCOPE-010 — Billing. No
dependent scopes are affected.`

**Parked unit.** A unit parks instead of running when: its own task text names a push or a write
against the production database (the run never does either); it hits a decision gate with no
approved design or ledger entry to answer it from; or it fails its tests or times out. Each has its
own one-line shape:

```
[<project>] Parked — SCOPE-030: Backfill. Its own task names a write against the production
database; this run never pushes and never writes to production, so it is left untouched for the
owner.

[<project>] Parked — Billing App / SCOPE-010: "May I load the production customer data into the
test database?" (blocks invoice totals). No approved design answers it; left for the owner.

[<project>] Failed — SCOPE-010: Billing. tests failed after 2 cycles. Marked waiting: SCOPE-011
(Invoices).
```

A failed unit's dependents are marked waiting (named in the line, as above) and re-listed on the
next startup post; the run moves on to the next independent unit either way.

**Live gate question.** Before a unit parks on a decision gate, it first checks whether
`decisions/ledger.yaml` or its own scope text already answers the question (cheapest path, no room
round trip). Only when neither does does it ask the room directly, and the SAME unit session
resumes with the answer rather than restarting — it is not re-run from scratch:

```
[<project>] Autopilot — SCOPE-030 needs input:

  "May I load the production customer data into the test database?"

Reply with the answer, or PARK to leave it for the owner later.
```

A plain reply is taken as the answer and acknowledged with `Got it — recording that answer.`; the
unit continues from where it stopped. `PARK` is acknowledged with `Parked — left for the owner.`
and the unit treats the gate exactly as the "No approved design answers it" parked-unit shape
above. Either way, only one gate question is pending at a time; a second one while the first is
still open is turned away with `Another Autopilot question is already pending — parking this one.`
and parked rather than queued. A unit is also forced to park, after asking too many times without
ever landing on an answer, rather than loop forever.

A live answer is written back to `decisions/ledger.yaml` under the replying person's name — never
KAIN's, and never the agent's own — so an identical question on a later run, or a later unit,
resolves from the ledger alone with no further room round trip.

**Heartbeat.** Every 15 minutes, and on `[KAIN] STATUS`, the agent posts from the run's own state —
one line per unit finished since the last post, each in the same `Done` / `Parked` / `Failed` shape
as above:

```
[<project>] Autopilot heartbeat:
Done — SCOPE-010: Billing.
Parked — SCOPE-030: Backfill. Its own task names a write against the production database; this
run never pushes and never writes to production, so it is left untouched for the owner.
```

Nothing finished since the last post: `Autopilot heartbeat: nothing changed since the last post.`
The owner paused the run: `Autopilot heartbeat: paused.` — and no missed-heartbeat alert fires
while paused (below). A full summary of every unit, not just the new ones, posts once the startup
list finishes, and again at 18:00 if the run is still going, headed `Autopilot summary:` instead of
`Autopilot heartbeat:`.

**Missed heartbeat.** The server, not the agent, raises this from the existing connection record
(section 6's `project.list_agent_connections`): an active, unpaused run that has not posted a status
line in 20 minutes, or is no longer live. One alert per outage, one line on return — never a line on
every poll:

```
[<project>] Autopilot: andys-laptop — the run may have stopped.
[<project>] Autopilot: andys-laptop is posting again.
```

**Resource-time booking.** Every unit's `validateScope` → `createSpecs` → `implement` work runs as
ordinary commands in the one already-attached session, so it is booked through the existing
SPEC-005 agent-as-Resource model exactly as any other session's work is — Autopilot adds no second
booking path, no attribution to a person, and no plan gate of its own. See `agentruns`
(`src/db/schema/agentrun.ts`); nothing in this section changes section 6's reading of connection
state.
