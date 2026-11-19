# Spec 152: K.A.I.N. Sign-in and Agent Reach

Implements SCOPE-132

**Implements**: SCOPE-132 Amendment F (`specs/Project-Scope/132-kain-autonomous-driver.md`, FR-064 – FR-075).
Fences for this spec are `[SCOPE 152 / Tnnn]`.
**Depends on**: SPEC-134 (agent connect, `agent-grant:` tokens, room route), SPEC-145 (Allow remote),
SPEC-151 (`project.list_agent_connections`), SCOPE-144 (D2 consulting membership rule, company room).
**Pairs with**: SpokAI SCOPE-002 Amendment A (the K.A.I.N. sign-in panel). Release together.
**Source**: `docs/brainstorms/2026-10-28-consultant-company-connection-to-projects.md` (rows 1 – 14).
**Created**: 2026-10-28

## Overview

K.A.I.N. is a remote login. It signs in with the person's own wxKanban email and password, once per
device, and reaches exactly the Projects that person may reach: their own company's, plus the Projects
assigned to their consulting company under an active engagement. One shared function decides that reach,
and the four places that act on it — grants, connect, the MCP's per-call re-check and
`project.list_agent_connections` — all call it, on every call. The pasted Company Access Token and the
per-Project K.A.I.N. tick are retired.

## Business Problem

The owner's consulting company holds active engagements with two client companies whose engagements list
all their Projects, yet its K.A.I.N. Company Access Token reached **0** Projects: `AgentConnectService.grants`
and `connect`, the MCP auth re-check and `list_agent_connections` are all limited to the token's own company.
Pasting a company token on a phone is impractical, and one token per company means one K.A.I.N. setup per
client. A consulting admin managing several clients' Projects through YappChatt, daily, from phone and
laptop, cannot do so today.

## Actors

- Primary: a consulting company ADMIN using K.A.I.N. daily on a phone and a laptop
- Secondary: client company members (ADMIN, TEAM_MANAGER, TEAM_MEMBER) using K.A.I.N. on their own company's
  Projects; sub-assigned consulting members; client ADMINs and TEAM_MANAGERs who control Allow remote and
  engagement assignments; company ADMINs who see and revoke members' devices

## User Scenarios & Testing

**US1 — One login, every device, every client (S-22).** A consulting ADMIN signs K.A.I.N. in on a phone and a
laptop.
- Acceptance: both devices list the same Projects — own company first, then each client by name, each with
  `via` — and only Projects with Allow remote on.

**US2 — A client member sees only their own company (S-23).**
- Acceptance: a client TEAM_MEMBER reaches only their web-app-visible, Allow-remote Projects of their own
  company; 0 other companies.

**US3 — The client stops it on the next call (S-24).** Allow remote off, engagement paused / disabled / ended,
assignment or sub-assignment removed, person deactivated, device revoked.
- Acceptance: the very next grants, connect or MCP call for that Project is refused; nothing is minted or
  revoked by the refusal.

**US4 — Two devices at once (S-25).**
- Acceptance: phone and laptop both connect to one Project and post; neither revokes the other.

**US5 — Revoking a device (S-26).**
- Acceptance: the revoked phone gets 401 `device_signed_out` on its next call; the laptop keeps working; the
  phone signs in again and gets a new token.

**US6 — Sign-in refusals (S-27).**
- Acceptance: wrong password 401 with nothing issued; locked account 423; the password appears in no table,
  log line or response.

## Functional Requirements

FR-064 – FR-075 as written in SCOPE-132 Amendment F. Summary:

| FR | What |
|---|---|
| FR-064 | `POST /api/agent/signin { email, password, deviceName }` — the web app's `signInUser` check and lockout; returns the device token once; no cookie; password never stored or logged. *Review fix 2026-10-29:* rate limited, 30 attempts per IP and 10 per email per 15 minutes, else 429 `too_many_attempts`; an unknown email is checked against a dummy bcrypt hash so its answer takes as long as a wrong password |
| FR-065 | `agentdevicetokens`, one live row per person and device name; ends on revoke, password change or reset, deactivation or removal; `lastusedat` per call; 401 `device_signed_out`. *Review fix 2026-10-29:* a password change, reset or SysAdmin reset and the device sign-out commit in one transaction (with the spent reset link); one `agent.device.revoked` audit row per company after the commit. *Review fix 2026-10-30 (#5, Andy: "yes"):* every way a device ends — revoke, replaced by a new sign-in with the same name, password change, reset or SysAdmin reset — also revokes that device's connect-minted MCP tokens (`agent-grant:<agent>:<deviceId>`) in the same transaction, instead of leaving them to expire (up to 12 hours) behind the per-call check. *Review fix 2026-10-30 (#6):* a device whose company is deactivated (`companies.activeflag` false) is refused on every call with the same `device_signed_out` answer, in the app and in the MCP re-check; subscription state follows the web app's own rule (the SCOPE-090 Amendment A gate), with no device-only check |
| FR-066 | `agentReach(userId)` — own company (ADMIN all; others `projectusers` or in-progress phase lead; `showAll` ignored) plus SCOPE-144 D2 (whole-Project assignments, `active` engagements only); Allow remote on; not archived; each with `companyName`, `via`, `engagementId` |
| FR-067 | grants, connect, the MCP auth re-check (401 `access_revoked`) and `list_agent_connections` all use `agentReach`; a test asserts they agree |
| FR-068 | connect issues the MCP token as the person, named per device; reconnect revokes only the same person + device + Project token; room minted and joined as the person; `yca_` per device. *Known gap 2026-10-30 (#5):* not met — YappChatt mints the `yca_` room token per room, not per device, and offers no call to revoke one, so a revoked device keeps its room access in YappChatt until a YappChatt companion scope adds per-device room tokens and a revoke call; wxKanban then revokes the room token alongside the MCP tokens (FR-065) |
| FR-069 | live `companyagenttokens` revoked softly (`replaced_by_signin`); issuing answers 410 `use_signin`; `projectagentgrants` no longer read; tick and token UIs removed; rows kept |
| FR-070 | Allow remote off, engagement not `active`, assignment / sub-assignment removed, person deactivated or removed, device revoked, the device's company deactivated (2026-10-30) — each refuses the next call |
| FR-071 | "My K.A.I.N. devices" (profile) and the ADMIN company list; `GET /api/agent/devices`, `GET /api/company/agent-devices`, `POST /api/agent/devices/:deviceId/revoke`. *UI review fixes 2026-10-30:* a list that fails to load shows the error, never "not signed in on any device"; a failed revoke shows its error inside the open dialog; each Revoke button is named for its device (and owner, on the company list) for screen readers; the ADMIN confirm names the device's owner; errors are announced (`role="alert"`); Revoke meets a 44 px touch target on phones |
| FR-072 | `ProjectAgentAccessPanel` "Reachable by: your team, and consultants of `<company>` (engagement)"; `agent-access` returns `reachableBy` |
| FR-073 | audit rows `agent.signin`, `agent.signin.refused`, `agent.connect` (under the Project's company), `agent.device.revoked`, naming person and device; posts keep `[KAIN] ` |
| FR-074 | help (Agent Access, Engagements, consultant sign-in and revoke) and `docs/kain-contract.md` |
| FR-075 | ships whole; seven cross-company tests; tests 1, 3, 6 block release |

## Data Requirements

`agentdevicetokens` — `sql/0001-agentdevicetokens.sql` (10 columns, UUID v7 key, unique `tokenhash`, unique
live `(userid, devicename)`). Applied by the owner, verified column by column, then declared in
`src/db/schema/` and the `mcp-server` mirror, and recorded in the SCOPE-117 schema change log.
`sql/0002-retire-company-agent-tokens.sql` soft-revokes live `companyagenttokens` at release (a data change,
applied by the owner). No change to `projectagentgrants`; it stops being read.

## Success Metrics

- SC-22: the owner's consulting company, signed in on 2 devices, lists 100% of both clients' Allow-remote
  Projects on each; the lists are identical. Today 0.
- SC-23: 0 Projects outside `agentReach` returned or accepted by any of the 4 places across the test matrix.
- SC-24: 100% of FR-070 events refuse the very next call on every device; 0 calls succeed afterwards.
- SC-25: 0 passwords in any table, log line or response (marker-password test).
- SC-26: 100% of sign-ins and connects write 1 audit row naming person and device; 0 pasted tokens needed.

## Scope Boundary

- The sign-in route, the device-token table and its lifecycle, `agentReach`, and its use in grants, connect,
  the MCP auth re-check and `project.list_agent_connections`.
- Retiring company tokens and per-Project ticks, softly.
- Device lists and revoke in the web app; the client's "Reachable by" line; the audit rows; help and
  `docs/kain-contract.md`.
- The cross-company test suite that gates the release.

## Out of Scope

- Second-factor sign-in (SOC 2 CC6.1 MFA stays a known gap, as for the web app).
- myndSynergy sign-in; SpokAI's own panel and encrypted store (SpokAI SCOPE-002 Amendment A).
- The room protocol (SCOPE-132 Amendment E); a separate consent switch; a paste-a-token option.
- Changing what the web app itself shows consultants (it still shows `paused` and `disabled` engagements).

## Open Questions

- OQ-1 (T001, verify): which company goes on a connect-minted MCP token for a client Project
  (`mcpapitokens.customerid`) so the MCP's tenant checks and its consultant guard both accept it — the person's
  company with the consultant guard, or the Project's company. Decided by evidence in T001, before T005.
- OQ-2 (T001, verify): every place a password is changed or reset (self-service, team reset, SysAdmin reset,
  password-reset link), so FR-065's revoke hooks all of them.
