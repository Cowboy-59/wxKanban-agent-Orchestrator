# Brainstorm: consultant and company connection to Projects (K.A.I.N. reach)

- **Status:** closed
- **Opened / last updated:** 2026-10-28 / 2026-10-28
- **Source:** internal (the owner, first real user of K.A.I.N.)
- **Asked for by:** the owner, as a consulting admin. Applies to any consulting company and any company member using K.A.I.N.
- **Level:** senior
- **Next item:** none (closed). Hand-off to /buildscope below.

## The request

One login for K.A.I.N. on every device (phone and laptop). The person's company relationship decides which Projects (repos) they can reach. There are two ways in:

1. **Company member.** Signed in as a user of their own company, a person reaches that company's Projects and no other company's.
2. **Consulting company.** A company on a consultant subscription reaches every client company it holds an active engagement with, limited to the Projects the client assigned in that engagement.

**First test case:** the owner's consulting company holds active engagements with two client companies whose engagements list all their Projects. Its K.A.I.N. company token was accepted but reached 0 Projects, because wxKanban limits K.A.I.N. to the token's own company.

## What already exists

| Item | Status | Evidence | Confidence |
|---|---|---|---|
| K.A.I.N. reach is one company only | Decided before | wxKanban SCOPE-132 FR-062 ("Never another company's projects. KAIN holds one company token per company and asks each."), `specs/Project-Scope/132-kain-autonomous-driver.md:741` | Confirmed |
| Company Access Token: one per company and agent, admin only; issuing again revokes the earlier one | Built | SCOPE-132 FR-027; `src/server/routes/agentTokens.ts:49-58`; `companyagenttokens` has no person column | Confirmed |
| `grants` and `connect` limited to the token's own company | Built | `src/server/services/AgentConnectService.ts:82-107` | Confirmed |
| `list_agent_connections` limited to the token's company and Allow-remote Projects | Built | `mcp-server/src/tools/agent-connections.ts:106-115` | Confirmed |
| Engagement access rule in the MCP (active engagement plus assignment) | Built | `mcp-server/src/server.ts:126-149` (SCOPE-058 consultant guard) | Confirmed |
| Engagement "all projects" creates one assignment per client Project | Built | `src/server/routes/engagements.ts:1117`, Spec 037 FR-031 | Confirmed |
| Consulting reach rule D2: managers cover every assigned Project, members their sub-assigned ones | Built | `src/server/lib/communityMembership.ts:42-80` (SCOPE-144) | Confirmed |
| Per-engagement client switch precedent (consultant approvers, off by default) | Planned (`SCOPE-144` FR-012) | `specs/Project-Scope/144-company-yappchatt-account.md:177-185` | Confirmed |
| Sign-in: email and password return a 24-hour session with one companyid; lockout 423; no refresh or second factor found | Built | `src/server/routes/auth.ts:332-357` | Confirmed (second factor: Likely absent) |
| Member path: a member sees their own company's Projects | Built (web app) | not traced in the agent path | Likely |
| Earlier brainstorms on this topic | Not found | wxKanban `docs/brainstorms/` (12 records); none in SpockAI | Confirmed |

All paths above are in the wxKanban repo. Change Impact: SCOPE-132 has 3 specs (SPEC-145, SPEC-148, SPEC-151) and 33 fenced files, and SCOPE-136 and SCOPE-144 depend on it. SCOPE-144 has no specs yet and 20 fenced files.

## Panel

Spoke: Lead Architect (chair), Domain Analyst, Database, Backend, Frontend, Security, QA, Migration, Documentation · Sat out: Legacy, DevOps

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need behind the request | One identity on every device (one wxKanban login); the company relationship decides reach. Done when (a) the same login on phone and laptop shows the same Project list, (b) the list is the person's member Projects plus engagement-assigned Projects and nothing else, (c) a change on the company side takes effect on every device at the next call. | Agreed | yes | 2026-10-28 |
| 2 | Who uses it, and how often | Primary: a consulting admin, daily, on phone and laptop. Secondary: company members and sub-assigned consultants. Indirect: clients, through room posts and their controls. Design the sign-in and Project list phone first. | Agreed | yes | 2026-10-28 |
| 3 | Reuse or build new | Amend SCOPE-132 FR-062: K.A.I.N. reaches only what the person can reach, which is their own company's Projects plus the Projects assigned in an active engagement of their consulting company, checked on every call. Reuse the existing engagement rule as one shared check. No new grants model. | Agreed | yes | 2026-10-28 |
| 4 | The smallest useful version | Delivered whole: sign-in, the shared reach rule, and the changes to grants, connect, the MCP re-check and list_agent_connections ship together. The cross-company tests (row 8) are the gate. | Agreed | yes | 2026-10-28 |
| 5 | Client control and consent | No separate consent switch. The client decides a consultant's Projects by assigning them in the engagement. Allow remote on a Project lets the client's people and its engaged consultants drive it. The client stops it by turning Allow remote off, pausing or ending the engagement, or removing the assignment, each on the next call. The per-Project K.A.I.N. tick is retired. In place of: a per-engagement "allow consultant agents" switch, off by default. | Changed | yes | 2026-10-28 |
| 6 | Signing in, one token per person and device | Sign in once per device with the wxKanban email and password, sent straight to wxKanban and never stored. wxKanban returns a K.A.I.N. token for that person on that device, which the person can revoke and the company admin can see. K.A.I.N. stores only that token and the user id, encrypted. Reach is decided on every call. In place of: one pasted company token per company (SCOPE-132 FR-027). Reason: pasting a token on a phone is impractical. | Changed | yes | 2026-10-28 |
| 7 | One shared reach rule | Consulting path: SCOPE-144's D2 rule as written (consulting ADMINs and TEAM_MANAGERs reach every Project their company holds a live assignment on under an active engagement; other consulting members only their sub-assigned Projects). Member path: the web app's own visibility check. Both narrowed to Allow remote, in one function used by grants, connect, the MCP re-check and list_agent_connections. | Agreed | yes | 2026-10-28 |
| 8 | Cross-company tests | Seven tests: (1) never too far: no company without an engagement, no unassigned Project, no Allow remote off, in all four places; (2) never too little: reach equals D2 plus the web app check; (3) stops on the next call: engagement paused, disabled or ended, assignment or sub-assignment removed, Allow remote off, person removed, device revoked; (4) two devices at once, each connecting and posting; (5) sign-in: wrong password refused, lockout 423, password never stored, revoked device signs in again; (6) all four places agree with the shared function; (7) by hand: the consulting admin sees both clients' Projects, a client member sees only their own company's, and a phone post of [KAIN] STATUS gets a worker answer. Tests 1, 3 and 6 block the release. | Agreed | yes | 2026-10-28 |
| 9 | Existing tokens, ticks and the K.A.I.N. panel | Connect revokes the earlier Project MCP token per person and device, not per Project. A room's yca_ post token can be minted per device. At release, old company tokens are revoked softly and per-Project ticks stop being read, both kept for audit, with nothing backfilled. The unreleased K.A.I.N. Connections panel becomes the sign-in panel. SpockAI Spec 002 is rewritten from company connections to sign-in, keeping the encrypted store and its room-token table. | Agreed | yes | 2026-10-28 |
| 10 | Where each side sees it | K.A.I.N. shows "Signed in as <person> · <company> · <device>" and the Projects reached, grouped by company (own first, then each client) with live state and machine; grants adds companyName and via (own or engagement). wxKanban shows "My K.A.I.N. devices" with Revoke on the profile, and every person's devices on the Company page for the admin. The client's Agent Access panel shows Allow remote and a read-only "Reachable by: your team, and consultants of <company> (engagement)", naming the company only. Posts keep the exact "[KAIN] " tag. Help changes: Agent Access, Engagements, consultant sign-in and revoke, and kain-contract.md. | Agreed | yes | 2026-10-28 |
| 11 | Who posted (audit) | The audit records the person and device for each connect and each room token, so a client can learn whose K.A.I.N. posted without changing the tag. | Added | yes | 2026-10-28 |
| 12 | A partial first release | Declined: it would leave grants, connect, the MCP re-check and list_agent_connections disagreeing about reach. | Declined | no | 2026-10-28 |
| 13 | A paste-a-token option for admins | Declined: sign-in covers every device, including a headless or HUB bridge, and a second way in doubles the testing. | Declined | no | 2026-10-28 |
| 14 | Fit and priority | Now, as K.A.I.N.'s top priority. wxKanban: one amendment to SCOPE-132 (sign-in route, per-device tokens and revocation, shared reach function, grants fields, device lists, client "reachable by" line, help and kain-contract.md). SpockAI: amendment to Spec 002 (sign-in panel; drop T005, "one MCP server per company"). Pause Spec 002's company-connection tasks from T005 on until the amendment lands. | Agreed | yes | 2026-10-28 |
| 15 | How myndSynergy users sign in K.A.I.N. | Parked → separate topic, when myndSynergy comes up. | Parked | no | 2026-10-28 |

## Open items

- Row 15 (myndSynergy sign-in) is parked as a separate topic.
- To confirm during the build: the web app's exact visibility rule for non-admin company members (row 7, member path). Labelled Likely, not traced.

## Next step

Take to scope, one at a time:

1. **SpockAI, amend Spec 002** (rows 1, 2, 6, 9, 10 and 14): **done (SCOPE-002, Amendment A, 2026-10-28)**. Renamed "K.A.I.N. Sign-in & Morning Briefing". /validateScope: valid, score 100. Session additions: phone apps after the HUB and HUB sign-in are out of scope (the wxHub sidecar uses the wxHub login); optional company alias; device name pre-filled and editable; sign-out and refusal handling.
2. **wxKanban, amend SCOPE-132** (rows 1, 3–11 and 14): to do. /buildscope must run in the wxKanban repo, with this record as its input.
