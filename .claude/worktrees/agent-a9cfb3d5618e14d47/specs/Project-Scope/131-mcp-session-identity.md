# SCOPE-131: MCP Session Identity and Status Broadcast

**Scope Number**: 131
**Status**: `draft`
**Created**: 2026-09-23
**Depends On**: SCOPE-097 (MCP token→project binding — this extends it from *which project* to *which client*); SCOPE-124 Amendment B / T021 (the never-report-what-you-did-not-measure rule this inherits); SCOPE-117 (manual production schema-change discipline)
**Consumed By**: SCOPE-132 (KAIN autonomous driver), which assumes the identity surface defined here
**Source**: this document

> **Numbering note.** `SPEC-131` already exists, created by SCOPE-130's fan-out. This scope and that
> spec collide as integers and are unrelated. Always write the prefix.

---

## Overview

**KAIN is the sole consumer.** KAIN is an autonomous agent living in a separate repository
(SpokAI) that connects to the hosted wxKanban MCP as a token-authenticated client.

An agent connecting today has no way to learn three things it needs before it acts: which session
it is in, which repository it is operating against, and what state the project is in. This scope
rebuilds `project.session_start` — currently a refusal stub — into a real tool that answers all
three in a single call, and answers **only** to a token flagged as belonging to a named agent.

Existing tools are untouched, so the orchestrator kit and the VS Code Cockpit keep working
exactly as they do now.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | KAIN, an autonomous agent in the SpokAI repository, connecting as a token-authenticated MCP client |
| **Secondary Actors** | Andy, who issues and revokes agent tokens and sets each one's client binding; ALIS and future agents, each with their own binding; the orchestrator kit and VS Code Cockpit, which must remain unaffected |
| **Key Value** | An agent learns who it is, where it is, and what is happening in one call — before it changes anything |
| **Scope Boundary** | Rebuild `project.session_start` as an agent-gated identity and status tool; add one nullable column to `mcpapitokens`. Excludes all autonomy, override and execution behavior |
| **Delivery model** | **Pull.** The client calls at session start. The server cannot push — see Constraints |
| **Identity source** | `clientbinding` on the authenticated token row. Never a client claim |
| **Session model** | Server-minted `sessionId` per call, recorded to `events.metadata` |
| **Data change** | One nullable varchar column, hand-applied to production. No other schema change |
| **Deliberate omission** | Identity without capability. Nothing shipped here grants KAIN new power |

## Business Problem

Four gaps, each verified against the running server rather than assumed:

1. **No session concept exists anywhere.** There is no session id, no sessions table, and no
   session event type. The only identifier is a per-*request* `requestId` that is never returned
   to the caller. Nothing correlates a series of tool calls into one working session, so "what did
   KAIN do in that session" is a question the system cannot answer.

2. **The obvious tool teaches a caller nothing.** `project.session_start` returns a flat refusal
   with no project id, no name, and no identity of any kind. It was gutted for good reason — it
   previously invented `projectType: 'CONSUMER'` and `governance: 1.2.0` as literals in the file —
   but that fix left the right name occupying an empty shell.

3. **Repo identity has no source of truth.** No repo, git-url or path field exists anywhere in the
   schema. An agent working across repositories cannot confirm it is pointed at the right one
   before it changes anything.

4. **No caller identity is enforceable.** Tokens carry no notion of *what kind of client* holds
   them, so an agent-only restriction is currently unexpressible.

**Why now.** KAIN will hold OVERRIDE privilege reaching as far as `git push`, and a push here
deploys both the application and the MCP straight to production with no staging. Once an agent can
deploy production, "am I in the right project and repo, and am I even the agent permitted to do
this?" stops being a convenience and becomes a precondition for acting at all.

## Actors

Primary: KAIN, an autonomous agent in the SpokAI repository, connecting to the hosted MCP as a token-authenticated client

Secondary: Andy as token issuer and binding administrator; ALIS and future agents; the orchestrator kit and VS Code Cockpit as unaffected incumbents

## Scope Boundary

- Rebuild `project.session_start` from refusal stub into a working, agent-gated identity and status tool.
- Add exactly one nullable `clientbinding` column to `mcpapitokens`, hand-applied, declared only after it exists in production.
- Mint a server-side session id per call and record it to the existing `events` table via `metadata.sessionId`.
- Return token-resolved project identity, a client-reported repo name explicitly marked unverified, and a status block built from the existing cockpit-summary builders.
- Remove the five fabrication leftovers in this surface: four `'0.1.0'` version literals and the `currentPhase` placeholder.
- Prove it with at least 8 structural tests plus a live endpoint call against the deployed server.

## Out of Scope

- **All override and privilege behavior.** KAIN gains identity here and no new power. SCOPE-132.
- **The WebSocket room** — provisioning, binding, recording the room id. SCOPE-132.
- **KAIN driving VS Code, and the bridge work generally** — the `canUseTool` gate, removing the push block, the driver itself. SCOPE-132.
- **The constitution amendment.** SCOPE-132, and it lands before the override work, not after.
- **Stateful MCP transport.** Genuine server-to-client push stays deliberately unbuilt; it would re-open the TLS-inspecting-proxy problem that stateless mode was chosen to avoid. This scope is pull-only.
- **Changing authentication for the existing 52 tools.** They continue to accept unbound tokens.
- **Onboarding ALIS.** The column is designed to support a second agent with no further DDL, but issuing and binding ALIS's token is not this scope.
- **Any DDL beyond the single column** — no new tables, no session table, no change to `events`.
- **A working `project.analyze` or `project.import_project`.** Both remain deliberately unbuilt features needing their own scope.
- **Fixing CLAUDE.md's stale numbering** (it claims scopes advance through ~107 and specs through ~106; actual is 130 and 132). Real, but unrelated housekeeping.

## User Scenarios & Testing

> Derived from the approved Functional Requirements rather than interviewed separately —
> review before `createSpecs`.

**S-1 — KAIN starts a session.**
Given a token whose `clientbinding` is `KAIN:<hash>`, when KAIN calls `project.session_start`
supplying `agentName: "KAIN"` and its repo name, then it receives a server-minted `sessionId`,
the token-resolved `projectId` and project name, its repo name marked as reported, and a status
block — in one call.

**S-2 — An unbound token is refused.**
Given a kit or Cockpit token with `clientbinding` null, when it calls `project.session_start`,
then the call is refused with a reason stating no binding is present — and that same token
continues to work normally on all other tools.

**S-3 — A mismatched name is refused.**
Given a token bound to `KAIN`, when a caller supplies `agentName: "ALIS"`, then the call is
refused with a reason naming the mismatch, without disclosing the stored binding.

**S-4 — Incumbents are unaffected.**
Given the column has been added, when the kit and the Cockpit perform their normal operations,
then every one of the 52 existing tools behaves identically and `npm run db:drift` exits 0.

**S-5 — A session is reconstructable.**
Given KAIN completed a session, when the `events` table is queried for that `metadata.sessionId`,
then the session-start row is retrievable.

**S-6 — An unmeasured field is null, not invented.**
Given the project has no phase recorded, when `project.session_start` is called, then
`currentPhase` returns `null` explicitly — never a placeholder value, and never a literal.

**S-7 — The deploy actually landed.**
Given the change is pushed, when the live tool is called against the deployed server, then the
response reflects the new behavior — because an App Runner build can fail and roll back silently,
leaving commits that look shipped and are not.

## Functional Requirements

### Identity and gating

**FR-001 — Client binding column.** Add a nullable `clientbinding` varchar to `mcpapitokens`,
holding `NAME:<sha256-of-token>`.
- Column is nullable; tokens without a binding are unaffected on all existing tools.
- The token half is stored hashed; no plaintext credential is persisted anywhere.

**FR-002 — DDL ordering discipline.** The column is applied to production before it is declared in
any schema file.
- Sequence enforced: write SQL → apply by hand → `db:drift` exit 0 → record in
  `specs/117-production-schema-integrity/schema-change-log.md` → declare.
- Declared in **both** the application `src/db/schema/` and the `mcp-server/src/db/schema.ts`
  mirror. Declaring in one only yields a silent `undefined`, not an error.

**FR-003 — Agent-only gate.** `project.session_start` refuses any caller whose token binding does
not match the supplied agent name.
- Server recomputes `NAME:<sha256>` from the presented name and bearer token and compares
  exact-as-typed.
- A token with `clientbinding` null is refused by this tool while continuing to work on all others.

**FR-004 — Refusal names the failing half.** A refusal states whether the name, the token, or the
binding itself was the problem.
- Distinguishes "no binding on this token" from "binding present but name mismatch".
- Never reveals the stored binding value or any hash.

**FR-005 — Incumbents unaffected.** The kit and VS Code Cockpit continue to authenticate and
operate unchanged.
- All 52 existing tools behave identically for tokens with a null binding.
- No existing tool gains a binding requirement.

### Session identity

**FR-006 — Server-minted session id.** The server mints a `sessionId` per call and returns it; it
is never accepted from the client.
- Generated server-side via `randomUUID()`, as `requestId` already is.
- A client-supplied session id is ignored, not honoured.

**FR-007 — Session recorded.** Each successful call writes an `events` row carrying
`metadata.sessionId`.
- Uses the existing `events.metadata` jsonb column — no new column, following the `specId`
  precedent already set in that table.
- The row is retrievable afterwards, so a session's activity can be reconstructed.

**FR-020 — Session id is a correlation label, not server state.** KAIN carries the returned
`sessionId` on subsequent calls so its activity can be grouped; the server records it and never
validates it. *(Resolves OQ-1.)*
- The id is written into `events.metadata` on later calls that supply it.
- The server holds no session state, keeps no session store, and makes no claim that a session is
  "live" — consistent with the stateless transport and with FR-012.
- A supplied id is treated as a label from the client, not as proof of anything.

**FR-008 — Event type added correctly.** A session-start value is added to
`ProjectEventTypeSchema`.
- Added to the zod enum only; the advertised JSON-Schema enum stays **derived**, never hand-copied
  — it has drifted twice before.
- The event-type contract test stays green.

### Response payload

**FR-009 — Authoritative project identity.** `projectId` and project `name` are resolved from the
token, never from arguments.
- A caller-supplied `projectId` that disagrees with the token is a scope violation, matching
  existing tool behavior.

**FR-021 — One token per project.** Each agent token is bound to exactly one project, and KAIN
holds a separate token per project it works on. *(Resolves OQ-3.)*
- Follows the existing model: `mcpapitokens.projectid` is NOT NULL, so a token is already
  inherently single-project.
- Preserves SCOPE-097's deliberate ordering, where the token outranks any client-supplied project
  id so a hosted caller can never reach another tenant.
- Makes `repoReported` a genuine safety check rather than a convenience: a repo name that does not
  match the token's project is a detectable mismatch, which is the whole reason the field exists.

**FR-010 — Repo returned as reported, not verified.** The client-declared repo name is echoed under
a field name that marks it unverified.
- Returned as `repoReported`, with an explicit flag or sibling field stating it was not verified.
- Never presented as though the server confirmed it.

**FR-011 — Status from the existing builders.** The status block is produced by the pure builders in
`mcp-server/src/utils/cockpit-summary.ts`.
- No second status code path is written.
- Degrades honestly on failure, matching the existing dependency-graph fallback.

**FR-012 — Unmeasured means null.** Any field the server did not actually measure is returned
explicitly `null`.
- No literal stands in for a measurement.
- Pattern follows the existing `specsComplete` guard, which reports "not complete" rather than
  letting an empty list read as "none exist".

### Fabrication cleanup

**FR-013 — `currentPhase` measured, not faked.** `currentPhase` is returned from
`companyprojects.currentphase`, which is `varchar(50) **NOT NULL**` in production — verified
2026-09-23.
- **Root cause is the partial mirror, not a missing data source.** `mcp-server/src/db/schema.ts`
  declares 8 columns on `companyprojects` where production has 17, and `currentphase` is not among
  them. `loadProjectSummary` already issues a `.select()` against that table, so the value was
  always one column-declaration away; the literal `null` was standing in for a column Drizzle was
  never told to fetch.
- Fix is two lines: declare `currentphase` in the mirror, then return `project.currentPhase` in
  place of the literal. Safe because the column is verified present and NOT NULL.
- The hardcoded literal in the project-summary loader and the HTTP startup path is removed.
- No join to `projectphases` is required or wanted.

**FR-014 — Single version source.** All four hardcoded `'0.1.0'` literals import
`WXKANBAN_VERSION` instead.
- Covers the `initialize` handshake every client sees, the `mcp_health` tool response, the
  `/health` endpoint payload, and the startup banner.
- Every surface reports the same version.

### Plumbing and proof

**FR-015 — Project-scoped registration.** `project.session_start` is added to
`PROJECT_SCOPED_TOOLS`, which it is currently absent from — so no project is resolved for it today.

**FR-016 — Input schema extended.** `SessionStartInputSchema` gains optional `agentName` and
`repoName`, preserving its existing fields.

**FR-017 — Description tells the truth.** The tool description is rewritten from refusal-stub
wording to describe real behavior, and states the agent-only restriction.
- Operationally significant: descriptions are served fresh per connection, so they are a live tell
  for whether a deploy actually landed.

**FR-018 — Structural tests.** At least 8 tests guard the anti-fabrication and gating contract,
since handlers sit in a 5,000-line switch needing database, auth and transport to reach.

**FR-019 — Live endpoint proof.** The tool is exercised against the deployed server with a real
bound token before it is called done.
- Probing the live response is required. The version number is not acceptable evidence, because a
  failed App Runner build rolls back silently.

## Success Metrics

- **SC-1** — A single `project.session_start` call returns all five identity fields populated: `sessionId`, `projectId`, project `name`, `repoReported`, and a `status` block. One call, zero follow-ups.
- **SC-2** — 100% of calls presenting a token whose `clientbinding` is absent or does not match the supplied name are refused, with a reason naming which half failed.
- **SC-3** — 0 fields returned as values without being measured. Every unmeasured field is explicitly `null`, guarded by at least 8 structural tests, following the 12-test precedent set by SCOPE-124/T021.
- **SC-4** — 0 regressions for existing clients: all 52 current tools behave identically, kit and Cockpit tokens continue to authenticate, and `npm run db:drift` exits 0.
- **SC-5** — 100% of agent session-start calls produce a retrievable `events` row carrying `metadata.sessionId`.
- **SC-6** — p95 response time under 2000 ms measured against production, since the status block performs real database work.
- **SC-7** — Hardcoded literals in this status surface reduced from 5 to 0: four `'0.1.0'` version strings and the `currentPhase` placeholder.
- **SC-8** — 0 schema declarations ahead of the DDL. The column is applied by hand, verified green by `db:drift`, and recorded in the schema-change-log before it appears in either schema file.

## Data Requirements

**One column, hand-applied:**

```sql
ALTER TABLE mcpapitokens
  ADD COLUMN clientbinding varchar(255);
```

- **Nullable, no default.** Every existing kit and Cockpit token keeps authenticating untouched.
- `varchar(255)` is ample: the stored value is `NAME:<64-hex sha256>`, roughly 70 characters for a
  realistic agent name.
- **No index.** The gate reads this column from a row already fetched by the token-hash lookup, so
  it is never a search key.
- Declared afterwards in **both** the application schema and the `mcp-server` mirror.
- Recorded in `specs/117-production-schema-integrity/schema-change-log.md`.

**One reused table, unchanged:**

- `events` gains a session-start row per call carrying `metadata.sessionId` in the existing jsonb
  column. No column added, no migration.
- Requires one new value in `ProjectEventTypeSchema` — a zod enum change only.

**Explicitly not created:** no sessions table, no rooms table, no repo table. Session correlation
rides `events.metadata`; repo identity is a reported string, not a stored entity.

## API Routes

`project.session_start` — MCP tool, reachable on both working transports:

| Transport | Path | Note |
|---|---|---|
| Direct call | `POST {mcpBaseUrl}/call` | `{"tool":"project.session_start","args":{…}}` |
| Streamable HTTP | `POST /mcp` | fresh `Server` per request |
| SSE | `GET /sse` + `POST /messages` | known to return HTTP 409 "SSE transport not connected" — not a viable path |

**Request:** `agentName`, optional `repoName`, plus existing `scopeNumber`, `skipVersionCheck`,
`skipTodoScan`. The bearer token carries the real identity.

**Response:**

| Field | Source | Trust |
|---|---|---|
| `sessionId` | server-minted uuid | authoritative |
| `projectId` | resolved from token | authoritative |
| `projectName` | resolved from token | authoritative |
| `repoReported` | echoed from client | **unverified — labelled as such** |
| `status` | cockpit-summary builders | measured |
| `currentPhase` | `projectphases`, or null | measured or explicitly absent |
| `version` | `WXKANBAN_VERSION` | single source |

Refusal for an unbound or mismatched token returns a reason naming which half failed, without
disclosing the stored binding.

## Frontend Components

None. This scope adds no user interface. The VS Code Cockpit is explicitly unaffected and remains
read-only per its own scope boundary.

## Integration Context

Aligns with SCOPE-097 (token→project binding, extended here from *which project* to *which
client*), SCOPE-124 Amendment B (the anti-fabrication rule this inherits, in the very tool that
originally broke it), SCOPE-117 (manual schema-change discipline), and SCOPE-102, whose Remote
Session Bridge is the execution surface SCOPE-132 will build on.

## Technical Notes, Constraints and Risks

### Constraints

- **The hosted server cannot see the workspace and cannot push to clients.** Both are
  architectural. `sessionIdGenerator: undefined` puts the SDK in stateless mode, and on `/mcp` a
  fresh `Server` is constructed per HTTP request, so `initialize` and the following `tools/call`
  reach different objects. This was chosen deliberately for TLS-inspecting-proxy compatibility.
  Pull-only follows from it.
- **Schema changes are manual.** No migration ledger exists, and `drizzle-kit push` is prohibited
  — it would propose dropping roughly 19 undeclared-but-live tables. The local `.env`
  `DATABASE_URL` points at **production**, so there is no safe place to rehearse.
- **Andy applies all DDL.** No owner connection string exists in this environment.
- **`mcp-server/src/db/schema.ts` is an explicitly partial mirror.** Undeclared columns read back
  `undefined` silently; `as` casts hide it.
- **One push deploys application and MCP together**, roughly 3–7 minutes, with no staging.
- House rules: 100% TypeScript, no `any`, no `@ts-ignore`, Pino only, and fences written by the
  orchestrator in `Tnnn` form.

### Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Declaring `clientbinding` before the production column exists takes down **the whole MCP** — every request reads `mcpapitokens`, and Drizzle selects every declared column | **Critical** | FR-002's ordering, made countable as SC-8 |
| R-2 | An App Runner build fails and **rolls back silently**; commits sit in `origin/main` looking shipped while production serves old code | High | FR-019 — probe a live tool response, never the version number |
| R-3 | `repoReported` is a client claim echoed by the exact tool that once invented `projectType: 'CONSUMER'` | High | FR-010 and FR-012, guarded by ≥8 structural tests |
| R-4 | Declaring the column in one schema file but not the mirror yields `undefined` silently, with no error | Medium | FR-002 names both files explicitly |
| R-5 | Hand-copying the event-type JSON-Schema enum, which has already drifted twice | Medium | FR-008 keeps it derived; the contract test guards it |
| R-6 | `createSpecs` fans out from the FR section; boilerplate there silently drops real requirements | Medium | FR section written by hand and read back before fanout, never trusted from a score |
| R-7 | A wrong gate locks KAIN out | Low | Existing tools untouched, so recovery is a token update with no outage |

## Compliance

> Derived, not interviewed — review before `createSpecs`. SOC 2 is the only framework currently
> enabled on this project.

- **Access control.** This scope *narrows* access: a new tool that refuses all callers except a
  bound agent, with existing tool permissions unchanged. No privilege is granted here.
- **Secrets at rest.** The token half of `clientbinding` is stored as SHA-256, preserving the
  existing property that no raw `wxk_live_` credential ever persists.
- **Audit.** Every session start writes an `events` row; FR-004's refusals are candidates for the
  same treatment — see OQ-5.
- **Change management.** The schema change is recorded in the SCOPE-117 schema-change-log, which is
  the project's substitute for a migration ledger.

## Open Questions

- **OQ-1 — RESOLVED 2026-09-23.** A session is a correlation label, not server state. The server mints per call; KAIN carries the id forward; the server records it and never validates it. No session store, and therefore no second DDL round. See **FR-020**.
- **OQ-2 — How much status is the right amount?** `cockpit_summary` returns every scope, its tasks, unlinked tasks, devplan state and archived numbers. Large enough to matter for both SC-6's latency target and KAIN's context budget. *Recommendation: a trimmed default with an opt-in flag for the full payload.*
- **OQ-3 — RESOLVED 2026-09-23.** One token per project. KAIN holds several and selects by repo, preserving SCOPE-097's token-outranks-argument ordering. This makes `repoReported` a safety check rather than a convenience. See **FR-021**.
- **OQ-4 — Confirm SC-6's 2000 ms.** Proposed, not inherited — no performance targets exist in the reference module.
- **OQ-5 — Should a rejected binding raise a security event?** A token that authenticates successfully but fails the agent gate is either a misconfiguration or someone probing. *Recommendation: log it, since the audit surface already exists.*
- **OQ-6 — Does ALIS get a binding now?** Out of Scope says later. Confirm, or the column ships used by exactly one agent.

OQ-1 and OQ-3 were settled before `createSpecs` and promoted into FR-020 and FR-021, because
`createSpecs` fans out from the Functional Requirements section and reads nothing else. The four
remaining questions are safe to carry into implementation.
