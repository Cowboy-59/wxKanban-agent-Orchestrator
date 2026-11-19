# Brainstorm: the Project Agent works the dev plan by itself

- **Status:** closed
- **Opened / last updated:** 2026-11-07 / 2026-11-07
- **Source:** internal (owner)
- **Asked for by:** the owner; every customer later (item 2)
- **Level:** senior
- **Next item:** none (closed)

## The request

Nothing moves unless the owner starts each scope by hand. The owner wants the Project Agent to:

- read the dev plan and post a startup list of the outstanding scopes
- take the owner's skips
- run each remaining scope through scope, specs, tasks and implement without the owner starting each one
- every 15 minutes, post to YappChatt (and to K.A.I.N. when it is connected) what is done and what is next

The need: 6 apps to deliver in 4 months, too many to drive by hand all day. The agent learns from what the owner has already decided and manages the development.

## What already exists

From the search done before the agenda.

| Item | Status | Evidence | Confidence |
| --- | --- | --- | --- |
| G.O.D. works through a dev plan under `--create`: one phase and one unit at a time, each unit's status updated as it finishes | Planned (SCOPE-136 FR-014, FR-015), SPEC-136 written | `specs/Project-Scope/136-wxgod-development-manager.md:287-318` | Confirmed (scope text); how much is built: Likely |
| Server `devplan` document rebuilt on every `create_specs` and `implement`, no AI | Built (SCOPE-081) | `mcp-server/src/utils/devplan-generator.ts:221`, `mcp-server/src/server.ts:3657, 4190` | Confirmed |
| Server `devplan` gives each scope's state (done, partial, todo) | Built (SCOPE-081) | `mcp-server/src/utils/cockpit-summary.ts:55, 178` | Confirmed |
| Cockpit "Development Plan" checklist, read-only | Built (SCOPE-081) | `vscode-extension/src/providers/cockpitTreeProvider.ts:525` | Confirmed |
| `/dev-plan` retired; `/wxG-O-D --roadmap` writes `docs/DEVELOPMENT-PLAN.md` | Built | `.claude/commands/dev-plan.md:12`, `mcp-server/src/prompts/wxgod.md:421` | Confirmed |
| Two separate plans (server `devplan`, `docs/DEVELOPMENT-PLAN.md`), not kept in sync | Built, on purpose | SCOPE-136 FR-010 | Confirmed |
| Loop running G.O.D. one phase per fresh session, plus a resume-hint hook | Partly built: local, uncommitted, not in the kit | `docs/GODFIXES/scripts/god-loop.mjs:1-25`, `docs/GODFIXES/.claude/hooks/god-resume-hint.mjs` | Confirmed |
| Parallel runs of a list of scopes or specs, with a status file | Planned (SCOPE-136 Amendment B, FR-025 to FR-030) | `136-wxgod-development-manager.md:403-445` | Confirmed |
| Project Agent: a headless session that runs what is typed in the room, push blocked | Built (SCOPE-102) | `wxkanban-agent/apps/remote-bridge/src/session.ts:5-12` | Confirmed |
| The agent's only self-started job is the daily feedback triage | Built (SCOPE-148) | `remote-bridge/src/bridge.ts:158-170` | Confirmed |
| HANDOFF turns are read-only | Built (SCOPE-149) | `remote-bridge/src/handoff-turn.ts:5-16` | Confirmed |
| G.O.D. hands a run to the Project Agent, which runs `/wxG-O-D --resume` | Planned (SCOPE-136 FR-019, amended) | `136-wxgod-development-manager.md:354-356` | Confirmed |
| The bridge answers G.O.D.'s parked questions from the room | Built | `remote-bridge/src/decision-reply.ts:49-53` | Confirmed |
| Rolling summary, and K.A.I.N. directing the agent over a mailbox | Planned (SCOPE-132 Amendment G, pieces A and B) | `docs/brainstorms/2026-11-03-kain-direct-agent-line.md` rows 1-12 | Confirmed |
| The Project Agent reading or acting on a dev plan; a timed status post | Not found | `wxkanban-agent/apps/remote-bridge/src` | Likely |
| Per-project "Allow remote", server-enforced, ADMIN or member TEAM_MANAGER, audited | Built | `src/server/services/ProjectRemoteAccessService.ts:63-91` | Confirmed |
| Agents billed as Resources: daily Resource time per line and model, rounded to 15 min, by `agentruns.companyid` | Built (SPEC-005 FR-007 to FR-009, Amendment E); `agentruns` live in production (owner) | `specs/005-Time-and-Billing/spec.md:95-126` | Confirmed |
| Server plan gate `requireTier()` | Built | `src/server/middleware/tier.ts:30` | Confirmed |
| Agent check-in to the server every 60 s, live window 3 min | Built (SCOPE-151) | `remote-bridge/src/connection-record.ts:45`, `src/server/services/ProjectAgentConnectionService.ts:23` | Confirmed |
| Bridge removes `ANTHROPIC_API_KEY` from the child session | Specified (SCOPE-102 FR-013), not built: the child env spreads `process.env` unfiltered, in this repo and in the orchestrator repo (re-checked 2026-11-07) | `specs/Project-Scope/102-remote-session-bridge.md:301-313`; `remote-bridge/src/session.ts:143`, `triage-run.ts:223` | Confirmed |

## Panel

Spoke: Lead Architect (chair), Domain Analyst, Backend, Frontend, DevOps, Security, QA, Documentation, Database (from item 2) · Sat out: Legacy, Migration

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
| --- | --- | --- | --- | --- | --- |
| 1 | The need behind the request | Each project moves forward without the owner starting each unit. The agent answers from recorded decisions and stops only for something new. "Learn" means the decision ledger, not watching sessions. | Agreed | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 2 | Who uses it, and how often | The owner first, then every customer. Per-project switch, off by default, server-enforced and audited. Requires "Allow remote"; changed by the same people who can change "Allow remote". One new column beside `allowremote`, applied by hand. | Agreed | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 3 | Reuse or build new | Reuse: dev plan state, G.O.D.'s drive, god-loop (moved into the kit), the askgate decision queue, K.A.I.N. answer-and-review, run capture. Build: the switch, the startup list and skips, the self-start, the timed posts, the time hookup. | Agreed | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 4 | Smallest useful version | Post the outstanding scopes in build order, take skips, then run validateScope, createSpecs and implement for each scope in a fresh session. Not in v1: other machines, a cross-project coordinator, session watching. | Agreed | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 5 | FLAG: who answers gates with no approved design | The owner's "go" on the startup list is the approval. Gates are answered only from the scope text and the ledger. Anything else is parked as one line (project, scope, question, what it blocks). Unbuilt scopes stay with the owner. | Agreed | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 6 | FLAG: unattended code writes | One worktree per scope, one local commit per unit, never a push. No dev plan, no start. Never runs against production; parks the unit if its tests point there. | Agreed | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 7 | Which plan is the source of "outstanding" | The server `devplan` is the source of truth, after a per-scope `scope_stage` check (SCOPE-123). G.O.D.'s roadmap adds phase gates only where it exists. | Agreed | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 8 | A unit that fails or stops | Park it and go on, with one short line to K.A.I.N. or the room. Dependents wait. Each unit ends with an explicit done or failed line. | Agreed | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 9 | 15-minute status and end-of-day summary | Always post every 15 minutes, from the state file, masked, to the room and K.A.I.N.: full detail when there is news, a short "nothing changed" heartbeat otherwise, "paused" when paused. STATUS on demand. Full summary when the list finishes, and at 18:00 if still running. (Panel had proposed skipping posts when nothing changed; the owner wants the heartbeat so he knows the agent is alive when remote.) | Changed | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 10 | Context and cost over a long run | No cost rules of its own. Defer to rescue-tokens, the SPEC-143 routing tiers, the SCOPE-093 advisor, and a fresh session per unit. (Panel had proposed its own cost controls.) | Changed | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 11 | Fit and priority | High priority. To buildscope; its reuse check decides amendment vs new scope (chair leans to a SCOPE-132 amendment, depending on SCOPE-136, SCOPE-081, SPEC-005). Build after: the SPEC-149 `bridge.ts` handoff guard fix; SCOPE-102 FR-013 (API key stripped from the child session, specified but not built); SCOPE-132 Amendment G piece A. | Agreed | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 12 | Time and billing for the agent's work | Agent time is SPEC-005 FR-007 Resource time, through the existing run capture and daily pull, each run tagged with its scope and task. No attribution to a person. | Added | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 13 | Which subscription plans get it | Every plan, no plan gate. Time booking works only where the company has Time and Billing. One help catalog entry. | Added | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 14 | A skip shows what depends on it | A skip lists the dependent scopes from the existing scope-impact check. Each is skipped or partly worked, with the tasks believed safe listed for the owner to confirm. A partial scope stays partial. Skipped parts stay on every summary until released. Choices kept in the run state. | Added | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 15 | Alert when a 15-minute post is missed | The server raises it from the existing connection record: not live during a run, or no post for 20 minutes. One line to the room and K.A.I.N. per outage, one "back" line on return, only during an active, unpaused run. | Added | done (SCOPE-132 Amendment H) | 2026-11-07 |
| 16 | Time and Billing plan conflict | Server allows SMALL_BUSINESS and up (`src/server/routes/timeBilling.ts:44`); help catalog says CONSULTANT (`src/shared/help/catalog.ts:206`); `src/types/index.ts:79` has a third list. Separate fix outside this idea. Open: the owner answers. | Parked → separate fix | no | 2026-11-07 |

## Open items

- Spec-time check: the headless Project Agent session loads rescue-tokens, the SPEC-143 routing hooks and the run-capture hook. If not, wire in the existing ones.
- Spec-time check (Assumed): the server can post to the room without the bridge (item 15).
- Confirm at buildscope: current status of the SPEC-149 handoff guard fix and SCOPE-132 Amendment G piece A (taken from notes 3 days old).
- Row 16: the Time and Billing plan conflict, parked as a separate fix.

## Next step

Owner chose "record and take to buildscope" (2026-11-07). Hand-off: `/buildscope` with this record as input, then `/validateScope`. Result: **SCOPE-132 Amendment H** — written as an extend-existing amendment (FR-092–FR-104, S-38–S-43, SC-37–SC-41, R-30–R-33). `/validateScope` passed clean: score 100, `isValid: true`, no blocking issues. `/createSpecs` run on the owner's "run it" (2026-11-07): produced **SPEC-154** (`specs/154-project-agent-autopilot/`), 13 tasks (T001–T013), fences `[SCOPE 154 / Tnnn]`. Two columns (`companyprojects.autopilotenabled`, `projectagentconnections.autopilotrunactive`) await manual DDL. Autopilot stays unexposed in every environment until T012 confirms the three FR-012 prerequisites (SPEC-149 guard fix, SCOPE-102 FR-013, SCOPE-132 Amendment G piece A) are verifiably built, not merely specified. No git actions taken.
