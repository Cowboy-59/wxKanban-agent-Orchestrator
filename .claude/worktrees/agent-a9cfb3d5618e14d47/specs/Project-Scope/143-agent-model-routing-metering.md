# Scope 143: Agent Model Routing and Metering

**Scope Number**: 143
**Status**: `draft`
**Created**: 2026-10-23
**Amended**: 2026-11-02 — Amendment A (bill every AI agent run; OmniRoute removed). See the Amendment Log at the end.
**Depends On**: SCOPE-005 (Time & Billing: the agent-run pull, Resource time, engaged client projects), SCOPE-020 and SCOPE-037 (AI session, time entries, invoices), SCOPE-097 (project API tokens), SCOPE-136 (G.O.D. method, parallel entry), SCOPE-142 (owner-only write path, run report, decisions/settings.yaml), SCOPE-102 (bridge and outbox)
**Source**: `specs/Project-Scope/143-agent-model-routing-metering.md`

## Overview
Agent Model Routing and Metering lets the developer's coding agents, the G.O.D. flow and the kit's own commands use the cheapest model that does each task well, and traps every minute of AI-agent work for billing. Every agent run is captured automatically into an agentruns record; a measured day produces a cost report and forecast, posted through the bridge to wxHub and to myndSynergy, the owner's multi-project assistant. A tier table (kit default, project override, owner-only changes) picks Haiku, Sonnet or Opus by difficulty for subagents and by a declared tier for each kit command run in the main session, and escalates after failures; a comparison mode on internal systems tests two routes on the same task, and G.O.D. proposes tier changes from that evidence for the owner to approve. Every run is a Claude model on the official Claude client (Amendment A removed OmniRoute and allowedProviders). The owner's Claude subscription always stays on the official client and the owner's own /model choice is never changed silently; clients are billed on active time, tokens are kept for analysis. The owner is about to run a major project with many AI agents around the clock for several weeks. Every agent today runs on whatever model it was started with, and the main session runs every command, even a status check or a database push, on the model the owner picked (today Opus 5.5), so simple work burns the same expensive tier as hard work, the subscription window runs out early, and beyond the cap every token is either paid at API rates or lost as idle time. Model choice for parallel agents is manual. AI time is captured only when someone remembers to start a session, so parallel agent work is not billed to Consultants clients, and no record shows which model did the work, how many tokens it used, or how long it waited. There is no evidence to say which model gives the best cost against benefit for which kind of task. The need: the cheapest model that does each task well, every minute of agent work trapped for billing, and measured evidence behind every model choice, without ever routing the owner's Claude subscription through a proxy or sending client code to a provider the project has not allowed. This scope covers FR-001 spike proving subagent hooks report model, tokens and timing, and whether plan window usage (as shown by /usage) is readable. New agentruns table (one row per agent run) and automatic capture through hooks, local log first. Deterministic difficulty class (easy/moderate/heavy) with owner override. Tier table: kit default (easy Haiku, moderate Sonnet, heavy Opus) plus project override in decisions/settings.yaml; owner-only changes; escalation one tier after two failed test cycles. Per-command model tier: each kit command declares the tier it runs on in the main session, for that command's turn only; the owner's /model choice is never changed silently. Anthropic only: every run on the official Claude client (Amendment A: OmniRoute and allowedProviders removed). Every AI agent run, from any command or subagent, recorded with its billing company and billed as Resource time to any project marked Billable, in every application that uses the kit (Amendment A). The owner's Claude subscription always on the official client. Comparison mode: two routes, same task, separate worktrees, third-model review, sampled across difficulty classes, internal projects only, never billed. Cost report and forecast (docs/agent-cost-report.md + JSON) and a project-tagged summary to the bridge room for wxHub and myndSynergy. G.O.D. tier proposals with evidence for owner approval. Billable active minutes into the existing AI session / time-entry / invoice path; tokens for analysis only. Audit log of every model choice, escalation, refusal, comparison, proposal and approval. The product's own AI calls (SCOPE-099). free-claude-code and OmniRoute (both declined; Amendment A removed OmniRoute). Routing any Anthropic subscription connection through a proxy, stealth or impersonation (declined). Automatic tier changes without owner approval (initially proposals only). Changing the owner's own /model session choice. The SCOPE-136 Amendment B parallel entry, Orca and Cockpit panel (sibling scope). SCOPE-142 Decision Memory and the Ask Gate (sibling scope). A Consultant Work Hub UI view of agent runs (later). Multi-machine dispatch of agents.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Developer / owner running many AI agents, who approves tier changes and bills client work |
| **Secondary Actors** | G.O.D. and the area agents (classify tasks, pick models, propose changes), Kit commands run in the main session (declare their own tier), Consultant Work Hub (time entries and invoices, SCOPE-020/037), SCOPE-102 Remote Session Bridge and wxHub (display), myndSynergy with KAIN (the owner's multi-project assistant that receives project summaries) |
| **Key Value** | The owner is about to run a major project with many AI agents around the clock for several weeks. Every agent today runs on whatever model it was started with, and the main session runs every command, even a status check or a database push, on the model the owner picked (today Opus 5.5), so simple work burns the same expensive tier as hard work, the subscription window runs out early, and beyond the cap every token is either paid at API rates or lost as idle time. Model choice for parallel agents is manual. AI time is captured only when someone remembers to start a session, so parallel agent work is not billed to Consultants clients, and no record shows which model did the work, how many tokens it used, or how long it waited. There is no evidence to say which model gives the best cost against benefit for which kind of task. The need: the cheapest model that does each task well, every minute of agent work trapped for billing, and measured evidence behind every model choice, without ever routing the owner's Claude subscription through a proxy or sending client code to a provider the project has not allowed. |
| **Scope Boundary** | FR-001 spike proving subagent hooks report model, tokens and timing, and whether plan window usage (as shown by /usage) is readable. New agentruns table (one row per agent run) and automatic capture through hooks, local log first. Deterministic difficulty class (easy/moderate/heavy) with owner override. Tier table: kit default (easy Haiku, moderate Sonnet, heavy Opus) plus project override in decisions/settings.yaml; owner-only changes; escalation one tier after two failed test cycles. Per-command model tier: each kit command declares the tier it runs on in the main session, for that command's turn only; the owner's /model choice is never changed silently. Anthropic only: every run on the official Claude client (Amendment A: OmniRoute and allowedProviders removed). Every AI agent run, from any command or subagent, recorded with its billing company and billed as Resource time to any project marked Billable, in every application that uses the kit (Amendment A). The owner's Claude subscription always on the official client. Comparison mode: two routes, same task, separate worktrees, third-model review, sampled across difficulty classes, internal projects only, never billed. Cost report and forecast (docs/agent-cost-report.md + JSON) and a project-tagged summary to the bridge room for wxHub and myndSynergy. G.O.D. tier proposals with evidence for owner approval. Billable active minutes into the existing AI session / time-entry / invoice path; tokens for analysis only. Audit log of every model choice, escalation, refusal, comparison, proposal and approval. The product's own AI calls (SCOPE-099). free-claude-code and OmniRoute (both declined; Amendment A removed OmniRoute). Routing any Anthropic subscription connection through a proxy, stealth or impersonation (declined). Automatic tier changes without owner approval (initially proposals only). Changing the owner's own /model session choice. The SCOPE-136 Amendment B parallel entry, Orca and Cockpit panel (sibling scope). SCOPE-142 Decision Memory and the Ask Gate (sibling scope). A Consultant Work Hub UI view of agent runs (later). Multi-machine dispatch of agents. |


## User Scenarios & Testing

### US1 — Every agent run is captured

**Actor**: Developer

**Scenario**:
1. G.O.D. starts 4 area agents on a spec plus one helper.
2. Each finishes.

**Expected outcome**: 5 agentruns records exist with task, difficulty, model, provider, input/output/cache tokens, active and waiting minutes; nobody started or stopped a session by hand.

### US2 — The tier table picks the model

**Actor**: G.O.D.

**Scenario**:
1. It starts three tasks: a file rename (easy), a 3-file feature with tests (moderate), an auth change (heavy).

**Expected outcome**: They run on Haiku, Sonnet and Opus; the auth change is heavy because of the security signal, whatever its file count.

### US3 — Escalation after failures

**Actor**: Area agent

**Scenario**:
1. A moderate task on Sonnet fails its tests twice.

**Expected outcome**: The third attempt runs on Opus; the escalation is recorded on the run and counted in the report.

### US4 — A provider the policy does not allow

**Actor**: G.O.D.

**Scenario**:
1. A client project has no allowedProviders.
2. A task's tier would route to a cheaper non-Anthropic model.

**Expected outcome**: That route is refused; the task runs on the cheapest allowed Claude tier; the refusal is logged; no client code leaves Anthropic.

### US5 — A comparison on internal systems

**Actor**: Developer

**Scenario**:
1. On an internal repo, comparison mode is on for a moderate task. *(Amendment A: was "with OmniRoute allowed"; the two routes are now two Claude models on the official client.)*

**Expected outcome**: The task runs on two routes in separate worktrees; a third model reviews both diffs; the report shows cost per finished task, first-time test pass, review findings and retries per route; neither run is billed.

### US6 — G.O.D. proposes a tier change

**Actor**: Developer

**Scenario**:
1. 5 easy-class comparisons show the cheaper route finishing at lower cost with no worse quality.

**Expected outcome**: G.O.D. writes a proposal with the 5 comparisons as evidence; nothing changes until the owner approves; on approval the project override is updated through the owner-only path.

### US7 — The measured day's report and forecast

**Actor**: Developer (remote)

**Scenario**:
1. A day of agent work ends while the bridge has a live session.

**Expected outcome**: docs/agent-cost-report.md and its JSON hold totals, per agent-hour, window burn, price equivalent, by-class, per-command, billable view, comparisons, proposals and forecast; a project-tagged summary is posted to the room for wxHub and myndSynergy.

### US8 — Billing for a consultant engagement

**Actor**: Consultant

**Scenario**:
1. Agents work 6 active hours and 2 waiting hours on a client task.

**Expected outcome**: Time entries record 6 billable hours; the invoice preview shows hours and task; tokens, model and provider appear only in the internal report.

### US9 — Claude Code through OmniRoute (edge case) — RETIRED by Amendment A

OmniRoute is removed. Kept as a heading so the US numbers stay stable.

### US10 — A simple command runs on a cheaper tier

**Actor**: Developer

**Scenario**:
1. The owner's session is on Opus 5.5.
2. The owner runs dbpush, which declares Haiku.

**Expected outcome**: The dbpush turn runs on Haiku and is recorded as such; the session is still on Opus for the next message; nothing changed the owner's /model choice.

### US11 — AI time on a client project bills the consultant (Amendment A)

**Actor**: Consultant

**Scenario**:
1. A consulting company is engaged on a client company's project with a live assignment, and has ticked Billable on it in Time & Billing.
2. G.O.D., /buildscope and two implement subagents run on that project for 3 active hours.
3. The consultant opens Time & Billing for that week.

**Expected outcome**: The runs are recorded with the consulting company as companyid; the page shows 3.00 Resource hours on that client project's lines without anyone pressing a pull; the client company's own Time & Billing page shows none of it.

### US12 — Another application using the kit bills its AI time (Amendment A)

**Actor**: Developer of a consumer application

**Scenario**:
1. Kit setup runs in a new consumer project; the developer gives the project's API token.
2. A /brainstorm and a /implement run follow.

**Expected outcome**: Both runs reach agentruns for that project and its company; if the project is Billable, they appear as Resource time on its Time & Billing page; the token is in no committed file and in no kit release.

## Functional Requirements

### FR-001 — Spike: subagent hooks report the data (R1)

Before capture is built, prove in a live session that Claude Code hooks fire for a session and for each subagent and give the model, token usage and timing, and check whether the plan window usage that /usage shows is readable by a script or hook. Record the result in the spec.

**Acceptance Criteria**:
- [ ] The spike result is recorded before FR-002 is built.
- [ ] If hooks lack tokens, the fallback source (the Agent tool's reported usage or Claude Code telemetry) is named and proven.
- [ ] Whether window usage is readable is recorded; if not, the report marks window burn as unavailable.

### FR-002 — agentruns record

One row per agent run: id (UUID v7), aispecsessionid, taskid, projectid, difficulty, model, provider, route, inputtokens, outputtokens, cachereadtokens, cachewritetokens, activeminutes, waitingminutes, escalated, comparisonid, starttime, endtime, createdat. Lowercase, no underscores. Applied to production by hand, then declared. *(Amendment A: as applied, the table stores activeseconds and waitingseconds plus command, kind, variant, firstpass and neverbilled; it gains companyid (FR-017), and route is always 'official'.)*

**Acceptance Criteria**:
- [ ] db:drift passes and a column-level check confirms every declared column exists before the code ships.
- [ ] No row holds prompt text or code.

### FR-003 — Automatic capture

Hooks write one run record per session, per subagent and per main-session command turn, to a local log first (decisions/agentrun-log.jsonl) and to agentruns once the table exists. Nobody starts or stops anything by hand. *(Amendment A:)* Every command and subagent is covered — brainstorming, G.O.D., buildscope, createSpecs, implement and every other kit command. The hooks are installed (FR-018), and the local log is forwarded to `POST /api/consultant-hub/agent-runs` automatically at the end of each session (the Stop hook) and on the next session start, with the project's API token (SCOPE-097, bound to one project). The token is stored per machine, outside any committed or shipped file. A record that cannot be sent stays in the log and is retried; none is lost or sent twice.

**Acceptance Criteria**:
- [ ] US1 passes: 5 records for 5 agents.
- [ ] Active plus waiting minutes match wall time within 1 minute per run.
- [ ] *(Amendment A)* After a session ends, its runs are in agentruns within 1 minute; with the network down they arrive at the next session, each exactly once.
- [ ] *(Amendment A)* No token value appears in any committed file, kit release or log line.

### FR-004 — Difficulty class

Deterministic rule: heavy = security, auth, money, schema or migration, or production; more than 5 files; more than 4 acceptance criteria; or already escalated. Moderate = 2 to 5 files, or new logic with branches and tests. Easy = everything else. The owner can override a class; the override is logged.

**Acceptance Criteria**:
- [ ] US2 passes.
- [ ] A security task is heavy whatever its file count.

### FR-005 — Tier table

A kit default (easy Haiku, moderate Sonnet, heavy Opus) plus a project override under models: in decisions/settings.yaml. G.O.D. and the area agents read it when starting an agent. Agents cannot write it.

**Acceptance Criteria**:
- [ ] A project with no override gets the kit default.
- [ ] A direct agent write to the models: section is denied.

### FR-006 — Escalation

After two failed test cycles a task moves up one tier, recorded on the run.

**Acceptance Criteria**:
- [ ] US3 passes.
- [ ] An escalated run carries escalated = true and appears in the report's by-class figures.

### FR-007 — Provider policy

*(Amendment A, replaces the allowedProviders text.)* Anthropic only: every run uses a Claude model on the official Claude client. There is no allowedProviders setting and no route to another provider. A tier, proposal or comparison that names another provider or route is refused, falls back to the cheapest Claude tier for the task's class, and the refusal is logged.

**Acceptance Criteria**:
- [ ] US4 passes.
- [ ] No learning or proposal path can add a provider.
- [ ] *(Amendment A)* No code path, setting or CHECK accepts a route other than 'official'.

### FR-008 — OmniRoute service — RETIRED by Amendment A

OmniRoute is removed: no install, start, status or features-check script, no adapter, no tests. Kept as a heading so the FR numbers stay stable.

### FR-009 — The subscription stays official

Claude-tier runs always use the official Claude Code client, never a proxy or router. *(Amendment A: was "never OmniRoute".)*

**Acceptance Criteria**:
- [ ] No configuration path routes an Anthropic subscription connection through a proxy or router; a test asserts it.
- [ ] Every agentruns row has route = 'official'. *(Amendment A)*

### FR-010 — Comparison mode

Same task, two routes, separate worktrees, same spec and starting code, a third model reviews both diffs. *(Amendment A: a route is a Claude model on the official client, e.g. Sonnet against Haiku.)* Sampled across easy, moderate and heavy; internal projects only; never billed.

**Acceptance Criteria**:
- [ ] US5 passes.
- [ ] A comparison on a client project is refused.

### FR-011 — Cost report and forecast

docs/agent-cost-report.md plus JSON: totals, per agent-hour, window burn (when visible), price equivalent per tier, by-class figures, per-command figures, billable view, comparisons, proposals, and a forecast range with its assumptions.

**Acceptance Criteria**:
- [ ] US7 passes.
- [ ] Prices come from one table that names its source and date.

### FR-012 — Summary to the bridge

When the bridge has a live session, a project-tagged summary in a fixed, versioned shape goes to the room through the outbox, for wxHub and myndSynergy.

**Acceptance Criteria**:
- [ ] The summary holds no client content and no per-client tokens.
- [ ] The summary reaches the room within 10 seconds of the report being written.

### FR-013 — Tier proposals

When a class has at least 5 comparisons with lower cost per finished task and no worse quality, G.O.D. writes a proposal with the evidence. Only the owner applies it, through the owner-only path; the change is logged.

**Acceptance Criteria**:
- [ ] US6 passes.
- [ ] Proposals to move heavy, security, money or schema work down a tier are flagged as such.

### FR-014 — Billable time

*(Amendment A, replaces "the existing AI session / time-entry path".)* Active time from agentruns becomes Resource time through SPEC-005's agent-run pull (AgentRunPullService, SPEC-005 FR-007), the one path from agentruns to time entries; waiting time and neverbilled runs are excluded. The pull runs by itself when the Time & Billing page loads a date range and when a statement is generated; it is repeat-safe (idx_projecttimeentries_agentpull), and the manual pull stays. Runs on an engaged client project are pulled for the company in agentruns.companyid (FR-017). Runs are recorded for every project; only Billable projects reach a statement. AgentRunBillingService is removed. Statements show hours and task only.

**Acceptance Criteria**:
- [ ] US8 passes: 6 billable hours.
- [ ] No token, model or provider data appears on an invoice.
- [ ] *(Amendment A)* US11 passes with no manual pull; opening the page twice does not double the hours.
- [ ] *(Amendment A)* No code reads agentruns into time entries except AgentRunPullService.

### FR-015 — Audit (SOC2 CC7.2)

Every model choice, escalation, refusal, comparison, proposal and approval is logged with time and evidence, in a log separate from the records it changes.

**Acceptance Criteria**:
- [ ] One log entry per event.
- [ ] The log cannot be rewritten through any path in this scope.

### FR-016 — Per-command model tier

Each kit command declares the tier it runs on in the main session (for example dbpush, kit:status and auditfences on Haiku; /wxLedger search and help on Haiku or Sonnet; buildscope, createSpecs, /wxG-O-D and /implement on Opus). The declared tier applies only for that command's turn; the owner's /model choice is never changed silently. A spike first proves the command-file model setting is honored for slash commands; if it is not, the command hands its work to a subagent on the declared tier. Commands that can turn heavy declare Opus or escalate. The run record notes which model ran the command.

**Acceptance Criteria**:
- [ ] The spike result is recorded before the tiers are set.
- [ ] US10 passes: dbpush runs on Haiku while the session stays on Opus.
- [ ] No command changes the owner's /model choice; a test asserts it.

### FR-017 — The billing company on every run (Amendment A)

Every agentruns row carries companyid, the company that bills the run. The server sets it from the token that sent the run (the token's company) and never takes it from the record. The run's project must be one that company may bill: its own project, or a client project it is engaged on with a live assignment (SPEC-005 FR-014, TimeBillingProjectAccess). Any other project is refused with 404, so ids reveal nothing.

**Acceptance Criteria**:
- [ ] A record that names a companyid is stored with the token's company, not the named one.
- [ ] A run on a client project with no live engagement is refused with 404 and nothing is stored.
- [ ] US11 passes; the client company's own page and runs list never show the consultant's runs.

### FR-018 — Capture ships in the kit (Amendment A)

Kit setup (kit-configure, and the first run after a kit upgrade) installs the capture hooks with `_wxAI/routing/install.mjs` and asks for the project's API token, stored per machine outside the project tree. `install.mjs --check` is part of kit:status. Every application using the kit then records and sends its runs (FR-003) with no further step. A project with no token still records to its local log and sends once a token is given.

**Acceptance Criteria**:
- [ ] US12 passes in a fresh consumer project.
- [ ] Re-running setup leaves exactly one set of capture hooks, and every other hook in the file unchanged.
- [ ] The kit release contains no token and no machine's run log (release secret gate).

### FR-019 — An engaged consultant reaches the client project's kit (Amendment A, 2026-11-03)

Every kit route (`/api/projects/:id/kit/preflight`, `/kit`, `/kit/generate`, `/kit/download`, `/kit/upgrade`, `/kit/latest-version`) accepts a caller whose company owns the project **or** has a live engagement on it: an engagement between the two companies that is not ended, with an assignment on that project that is not removed. That is the same test Time & Billing uses (SPEC-005 FR-014). Any other company still gets 404, and the ADMIN-or-assigned rule (SPEC-011) still applies. A kit generated by the consultant carries a project token issued to the consultant's company, so the runs it forwards bill to the consultant (FR-017). Found 2026-11-03: a project moved from the consulting company to the client (ECM Breeze, HAS Enterprises → ECM Insurance) could no longer upgrade its kit with the consultant's token (404).

**Acceptance Criteria**:
- [ ] A token issued to a consultant with a live engagement on the project upgrades and downloads that project's kit.
- [ ] The owner company is unaffected; a company with no engagement, an ended engagement, or a removed assignment gets 404.
- [ ] The consultant's web session can view, preflight and generate the project's kit.

## Data Requirements

New table `agentruns` (one row per agent run or main-session command turn): id (UUID v7), aispecsessionid -> aispecsessions.id (nullable), taskid -> projecttasks.id (nullable for a command turn with no task), projectid -> companyprojects.id, difficulty (easy|moderate|heavy), command (nullable; the kit command for a main-session turn), model, provider, route (varchar), inputtokens, outputtokens, cachereadtokens, cachewritetokens (integer), activeminutes, waitingminutes (integer), escalated (boolean), comparisonid (nullable; pairs the two runs of one comparison), starttime, endtime, createdat. No prompt text or code.

Applied by hand first, then declared in src/db/schema/, then logged in specs/117-production-schema-integrity/schema-change-log.md; db:drift plus a column-level check confirm it before the code ships.

projecttimeentries unchanged: billable entries are written to it from agentruns active minutes via the existing aispecsessionid link. *(Amendment A: written by SPEC-005's AgentRunPullService as Resource entries, source = 'agentrun'.)*

*(Amendment A)* Migration 0075, applied by hand and verified before it is declared: `agentruns.companyid` uuid NOT NULL, FK companies ON DELETE CASCADE (the table is empty, so no backfill), index (companyid, starttime); `chk_agentruns_route` narrowed to route = 'official'. Logged in specs/117-production-schema-integrity/schema-change-log.md.

Project files: decisions/settings.yaml gains `models:` (tier overrides, including per-command overrides; Claude models only — Amendment A retired `allowedProviders:`); local run log decisions/agentrun-log.jsonl (before the table exists); docs/agent-cost-report.md and its JSON copy. Kit command files carry their declared tier.

Forbidden: prompt or code content in any row, log or report; tokens on any invoice.

## API Routes

- POST /api/consultant-hub/agent-runs — record one run (idempotent by run id).
- GET /api/consultant-hub/agent-runs?projectid&from&to — read runs for the report.

Both behind the existing consultant-hub authentication with a role guard (SOC2 CC6.3). The time-entry write reuses the existing AI session routes. *(Amendment A: both routes are mounted in the app; POST also accepts the project API token (SCOPE-097), and the server sets companyid (FR-017); the time-entry write is SPEC-005's agent-run pull.)*

## Frontend Components

None in the web app for v1 — the report is a file and the bridge summary goes to the room (wxHub, myndSynergy). A Consultant Work Hub view of agent runs is a later item.

## Success Criteria

1. Capture complete: 100% of agent runs in a measured day (session and subagent) have an agentruns record, checked against the agents' own reported durations within 1 minute per run.
2. Measured, not estimated: the measured day's report gives tokens per active agent-hour per tier used, from at least 8 hours of real agent work, and the forecast states its assumptions.
3. Cost goes down: after the tier table is applied, cost per finished task at API-price equivalent falls by at least 30% against an all-Opus baseline on the same task mix, with no more than 10% of tasks escalated.
4. Quality holds: across comparisons, the cheaper route's first-time test pass rate is no more than 5 points below the more expensive route's in any class it is proposed for, or the proposal is not made.
5. Policy never broken: 0 runs with a route other than 'official' and 0 Anthropic subscription connections through a proxy, checked by replaying agentruns against the policy (Amendment A).
6. Billing exact: billable hours on the invoice preview equal the sum of active minutes from agentruns for that task, and 0 tokens, models or providers appear on any invoice.
7. Visible remotely: with the bridge live, the summary reaches the room within 10 seconds of the report being written in 100% of trials.
8. Commands right-sized: at least 90% of main-session command turns in a measured day run on the tier the command declares, and 0 commands change the owner's /model choice.

## Key Entities

- **Agent Run** — one agent's work on one task, or one main-session command turn, with model, tokens, and active and waiting time.
- **Difficulty Class** — easy, moderate or heavy, from a deterministic rule.
- **Tier Table** — difficulty to model map plus per-command tiers; kit default plus project override; changed only by the owner.
- **Command Tier** — the model tier a kit command declares for its own turn in the main session.
- **Provider Policy** — Anthropic only, on the official Claude client *(Amendment A: was a per-project allowedProviders list)*.
- **Billing Company** — the company a run bills, set by the server from the sending token *(Amendment A, FR-017)*.
- **Comparison Run** — the same task on two routes, reviewed by a third model.
- **Tier Proposal** — a G.O.D.-proposed tier change with its evidence, awaiting the owner.
- **myndSynergy** — the owner's multi-project assistant ("Jarvis"), working with KAIN, that receives project summaries.

Kit delivery: capture hooks and the report under _wxAI/ (beside askgate/), installed by kit setup (FR-018); the tier-table default and per-command tiers in the command files *(Amendment A: the OmniRoute scripts are removed)*; G.O.D.'s model choice and proposal steps in the hosted method under mcp-server/src/prompts/.

## Constraints

- MUST deliver only the behavior described within the scope boundary: FR-001 spike proving subagent hooks report model, tokens and timing, and whether plan window usage (as shown by /usage) is readable. New agentruns table (one row per agent run) and automatic capture through hooks, local log first. Deterministic difficulty class (easy/moderate/heavy) with owner override. Tier table: kit default (easy Haiku, moderate Sonnet, heavy Opus) plus project override in decisions/settings.yaml; owner-only changes; escalation one tier after two failed test cycles. Per-command model tier: each kit command declares the tier it runs on in the main session, for that command's turn only; the owner's /model choice is never changed silently. Anthropic only: every run on the official Claude client (Amendment A: OmniRoute and allowedProviders removed). Every AI agent run, from any command or subagent, recorded with its billing company and billed as Resource time to any project marked Billable, in every application that uses the kit (Amendment A). The owner's Claude subscription always on the official client. Comparison mode: two routes, same task, separate worktrees, third-model review, sampled across difficulty classes, internal projects only, never billed. Cost report and forecast (docs/agent-cost-report.md + JSON) and a project-tagged summary to the bridge room for wxHub and myndSynergy. G.O.D. tier proposals with evidence for owner approval. Billable active minutes into the existing AI session / time-entry / invoice path; tokens for analysis only. Audit log of every model choice, escalation, refusal, comparison, proposal and approval.
- MUST keep the following work out of scope for this iteration: The product's own AI calls (SCOPE-099). free-claude-code and OmniRoute (both declined; Amendment A removed OmniRoute). Routing any Anthropic subscription connection through a proxy, stealth or impersonation (declined). Automatic tier changes without owner approval (initially proposals only). Changing the owner's own /model session choice. The SCOPE-136 Amendment B parallel entry, Orca and Cockpit panel (sibling scope). SCOPE-142 Decision Memory and the Ask Gate (sibling scope). A Consultant Work Hub UI view of agent runs (later). Multi-machine dispatch of agents.
- MUST preserve guided, reviewable workflow decisions instead of relying on undocumented implementation assumptions.
- MUST keep user-visible outcomes aligned with the measurable success criteria defined in this scope.

## Notes

- Integration context: SCOPE-020 / SCOPE-037: aispecsessions, projecttimeentries (billable, aispecsessionid), consultant-hub routes and invoice preview; agentruns feeds them. SCOPE-136: G.O.D. hosted method (mcp-server/src/prompts/) picks models via the tier table and writes proposals to the run report; Amendment B parallel entry is a sibling. SCOPE-142: owner-only write path, run report, decisions/settings.yaml (project-owned). SCOPE-102: bridge and the room-outbox drain (SPEC-142 T023) carry the summary to wxHub and myndSynergy. Kit command files (_wxAI/commands/*.md and .claude/commands mirrors) carry the per-command tier. SCOPE-099 unchanged (product AI calls); SCOPE-093 token advisor unchanged. SCOPE-005 Time & Billing: AgentRunPullService turns agentruns into Resource time (Amendment A). Source: docs/brainstorms/2026-10-23-agent-model-routing.md (ledger D-0001 to D-0017).
- Constraints and risks: Constraints: The owner's Claude subscription stays on the official client; no proxy or router ever carries an Anthropic subscription connection (Amendment A). The owner's /model choice is never changed silently; a command's declared tier applies only for that command's turn. Anthropic only (Amendment A); learning and proposals can never add a provider. Comparisons run only on internal projects and are never billed. Tokens, model and provider are analysis-only, never on an invoice; no prompt or code content in any record, log, report or bridge summary. agentruns is applied by hand, verified with db:drift plus a column check, and declared only after it exists; drizzle-kit push is prohibited (local .env points at production). agentruns links to an engagement through the task only. Hook and command-tier enforcement proven by live runs, not unit tests alone. G.O.D. changes only in the hosted method; they reach users after a hosted MCP redeploy. Risks: R1 hooks may not report subagent tokens/model (High): FR-001 spike first, fallback sources named. R2 cheaper model lowers quality (High): escalation, cross-model review, quality metric gates proposals. R3 small samples mislead (Medium): at least 5 comparisons per class, owner approval. R4 client code to an unapproved provider (High): policy empty by default, FR-007 refusal, replay check. R5 and R6 (OmniRoute) retired by Amendment A. R7 columns declared before they exist (High): apply, verify, then declare. R8 comparisons cost double (Low): sampling, never billed. R9 invoice leaks content (High): hours and task only, tested. R10 a per-command model setting may not be honored for slash commands (Medium): FR-016 spike; fallback hands the command's work to a subagent on the declared tier. R11 a command that can turn heavy is pinned too low (Medium): such commands declare Opus or escalate. Window burn may not be visible to hooks (Medium): FR-001 checks it; the report marks it unavailable rather than guessing. Notes: Converted from docs/brainstorms/2026-10-23-agent-model-routing.md (decisions 1-17, ledger D-0001 to D-0017) plus buildscope answers of 2026-10-23: agentruns table; deterministic difficulty rule; tier table as kit default plus project override, owner-only; cost report plus forecast; bridge summary for wxHub and myndSynergy; per-command model tier (added after the owner observed the main session stays on Opus 5.5 for every command). The cost estimate in the record is an estimate, replaced by the measured day. Open questions: how the subscription meters tiers against the window (FR-001 checks whether /usage data is readable); myndSynergy integration (to be confirmed once it is in the wxHub repo); major project start date. Compliance (SOC2): CC5.2: G.O.D. proposes, the owner approves; myndSynergy displays but cannot approve. CC6.1 / CC6.3: new consultant-hub routes behind a role guard; runs sent with a project-bound API token, companyid set by the server (Amendment A). CC7.2: every model choice, escalation, refusal, comparison, proposal and approval logged (FR-015).
- Customer-visible or operator-visible history should be limited to outcomes that materially affect workflow review and support.

## Clarifications

### Session 2026-10-23

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | The owner is about to run a major project with many AI agents around the clock for several weeks. Every agent today runs on whatever model it was started with, and the main session runs every command, even a status check or a database push, on the model the owner picked (today Opus 5.5), so simple work burns the same expensive tier as hard work, the subscription window runs out early, and beyond the cap every token is either paid at API rates or lost as idle time. Model choice for parallel agents is manual. AI time is captured only when someone remembers to start a session, so parallel agent work is not billed to Consultants clients, and no record shows which model did the work, how many tokens it used, or how long it waited. There is no evidence to say which model gives the best cost against benefit for which kind of task. The need: the cheapest model that does each task well, every minute of agent work trapped for billing, and measured evidence behind every model choice, without ever routing the owner's Claude subscription through a proxy or sending client code to a provider the project has not allowed. |
| 2 | Who are the primary and secondary actors? | Primary actor: Developer / owner running many AI agents, who approves tier changes and bills client work. Secondary actors: G.O.D. and the area agents (classify tasks, pick models, propose changes), Kit commands run in the main session (declare their own tier), OmniRoute (local router for other providers), Consultant Work Hub (time entries and invoices, SCOPE-020/037), SCOPE-102 Remote Session Bridge and wxHub (display), myndSynergy with KAIN (the owner's multi-project assistant that receives project summaries). |
| 3 | What is in scope? | FR-001 spike proving subagent hooks report model, tokens and timing, and whether plan window usage (as shown by /usage) is readable. New agentruns table (one row per agent run) and automatic capture through hooks, local log first. Deterministic difficulty class (easy/moderate/heavy) with owner override. Tier table: kit default (easy Haiku, moderate Sonnet, heavy Opus) plus project override in decisions/settings.yaml; owner-only changes; escalation one tier after two failed test cycles. Per-command model tier: each kit command declares the tier it runs on in the main session, for that command's turn only; the owner's /model choice is never changed silently. Provider policy (allowedProviders, empty by default) and OmniRoute as a separate local service with stealth, quota sharing, MITM and compression off. The owner's Claude subscription always on the official client. Comparison mode: two routes, same task, separate worktrees, third-model review, sampled across difficulty classes, internal projects only, never billed. Cost report and forecast (docs/agent-cost-report.md + JSON) and a project-tagged summary to the bridge room for wxHub and myndSynergy. G.O.D. tier proposals with evidence for owner approval. Billable active minutes into the existing AI session / time-entry / invoice path; tokens for analysis only. Audit log of every model choice, escalation, refusal, comparison, proposal and approval. |
| 4 | What is out of scope? | The product's own AI calls (SCOPE-099). free-claude-code (declined; replaced by OmniRoute). Routing any Anthropic subscription connection through a proxy, stealth or impersonation (declined). Automatic tier changes without owner approval (initially proposals only). Changing the owner's own /model session choice. The SCOPE-136 Amendment B parallel entry, Orca and Cockpit panel (sibling scope). SCOPE-142 Decision Memory and the Ask Gate (sibling scope). A Consultant Work Hub UI view of agent runs (later). Multi-machine dispatch of agents. |
| 5 | How is success measured? | Capture complete: 100% of agent runs in a measured day (session and subagent) have an agentruns record, checked against the agents' own reported durations within 1 minute per run. Measured, not estimated: the measured day's report gives tokens per active agent-hour per tier used, from at least 8 hours of real agent work, and the forecast states its assumptions. Cost goes down: after the tier table is applied, cost per finished task at API-price equivalent falls by at least 30% against an all-Opus baseline on the same task mix, with no more than 10% of tasks escalated. Quality holds: across comparisons, the cheaper route's first-time test pass rate is no more than 5 points below the more expensive route's in any class it is proposed for, or the proposal is not made. Policy never broken: 0 runs on a provider outside a project's allowedProviders and 0 Anthropic subscription connections through OmniRoute, checked by replaying agentruns against the policy. Billing exact: billable hours on the invoice preview equal the sum of active minutes from agentruns for that task, and 0 tokens, models or providers appear on any invoice. Visible remotely: with the bridge live, the summary reaches the room within 10 seconds of the report being written in 100% of trials. Commands right-sized: at least 90% of main-session command turns in a measured day run on the tier the command declares, and 0 commands change the owner's /model choice. |
| 6 | What existing workflow must this align with? | SCOPE-020 / SCOPE-037: aispecsessions, projecttimeentries (billable, aispecsessionid), consultant-hub routes and invoice preview; agentruns feeds them. SCOPE-136: G.O.D. hosted method (mcp-server/src/prompts/) picks models via the tier table and writes proposals to the run report; Amendment B parallel entry is a sibling. SCOPE-142: owner-only write path, run report, decisions/settings.yaml (project-owned). SCOPE-102: bridge and the room-outbox drain (SPEC-142 T023) carry the summary to wxHub and myndSynergy. Kit command files (_wxAI/commands/*.md and .claude/commands mirrors) carry the per-command tier. SCOPE-099 unchanged (product AI calls); SCOPE-093 token advisor unchanged. OmniRoute repo at E:\AI_Development\OmniRoute (MIT), used as an external local service. Source: docs/brainstorms/2026-10-23-agent-model-routing.md (ledger D-0001 to D-0017). |
| 7 | What constraints or risks matter right now? | Constraints: The owner's Claude subscription stays on the official client; OmniRoute never carries an Anthropic subscription connection; stealth and impersonation are off permanently. The owner's /model choice is never changed silently; a command's declared tier applies only for that command's turn. Provider policy empty by default (Anthropic only); learning and proposals can never widen it; only the owner edits it. Comparisons run only on internal projects and are never billed. Tokens, model and provider are analysis-only, never on an invoice; no prompt or code content in any record, log, report or bridge summary. agentruns is applied by hand, verified with db:drift plus a column check, and declared only after it exists; drizzle-kit push is prohibited (local .env points at production). agentruns links to an engagement through the task only. OmniRoute is a separate local service (MIT, not bundled), localhost-bound, scoped tokens, its MCP server not registered with our agents. Hook and command-tier enforcement proven by live runs, not unit tests alone. G.O.D. changes only in the hosted method; they reach users after a hosted MCP redeploy. Risks: R1 hooks may not report subagent tokens/model (High): FR-001 spike first, fallback sources named. R2 cheaper model lowers quality (High): escalation, cross-model review, quality metric gates proposals. R3 small samples mislead (Medium): at least 5 comparisons per class, owner approval. R4 client code to an unapproved provider (High): policy empty by default, FR-007 refusal, replay check. R5 OmniRoute terms-risk features (High): four features off, checked at install. R6 OmniRoute surface (Medium): localhost, scoped token, minimal config. R7 columns declared before they exist (High): apply, verify, then declare. R8 comparisons cost double (Low): sampling, never billed. R9 invoice leaks content (High): hours and task only, tested. R10 a per-command model setting may not be honored for slash commands (Medium): FR-016 spike; fallback hands the command's work to a subagent on the declared tier. R11 a command that can turn heavy is pinned too low (Medium): such commands declare Opus or escalate. Window burn may not be visible to hooks (Medium): FR-001 checks it; the report marks it unavailable rather than guessing. Notes: Converted from docs/brainstorms/2026-10-23-agent-model-routing.md (decisions 1-17, ledger D-0001 to D-0017) plus buildscope answers of 2026-10-23: agentruns table; deterministic difficulty rule; tier table as kit default plus project override, owner-only; cost report plus forecast; bridge summary for wxHub and myndSynergy; per-command model tier (added after the owner observed the main session stays on Opus 5.5 for every command). The cost estimate in the record is an estimate, replaced by the measured day. Open questions: how the subscription meters tiers against the window (FR-001 checks whether /usage data is readable); myndSynergy integration (to be confirmed once it is in the wxHub repo); major project start date. Compliance (SOC2): CC5.2: G.O.D. proposes, the owner approves; myndSynergy displays but cannot approve. CC6.1 / CC6.3: OmniRoute localhost and scoped tokens; new consultant-hub routes behind a role guard. CC7.2: every model choice, escalation, refusal, comparison, proposal and approval logged (FR-015). |

## Amendment Log

### 2026-11-02 — Amendment A: bill every AI agent run; remove OmniRoute

**Owner, verbatim:** "ANY thing that the AI has to do to work with an application from brainstorming , god, buildscope and any other command or subagents running to build need time and billing sent to any application that has billing" · "remove any omniroute , ok on d2" · D3–D6: "yes" (recommendations). Decisions D1–D6 are recorded in docs/GOD-State-143A.json.

**Why:** the capture pieces shipped in commit a7288933, but nothing connects them, so production `agentruns` holds 0 rows and no AI minute is billed. The hooks are installed nowhere, `forward.mjs` is never called and has no URL or token, `POST /api/consultant-hub/agent-runs` is not mounted, `agentruns` has no company (so a consultant's run on a client project cannot be billed), the SPEC-005 pull runs only on demand, and `AgentRunBillingService` duplicates the SPEC-005 pull while reading a column the table does not have.

**What changes:**

| Item | Change |
| --- | --- |
| D1 OmniRoute | Removed entirely: FR-008 and US9 retired; FR-007 and FR-009 reworded to the official Claude client only; FR-010 compares two Claude models; `allowedProviders` retired; the `omniroute` route value is removed from code and from the `agentruns.route` CHECK; `_wxAI/routing/omniroute/` and its tests are deleted. |
| D2 Company | New FR-017: every `agentruns` row carries `companyid`, the company that bills it, set by the server from the token that sent the run and never taken from the record. The project must be one that company may bill: its own, or a client project it is engaged on with a live assignment (SPEC-005 FR-014). |
| D3 Sending | FR-003: `forward.mjs` sends the local log with the project's existing API token (SPEC-097, bound to one project). The token is stored per machine, never committed and never shipped in the kit. |
| D4 Billing | FR-014 replaced: SPEC-005's `AgentRunPullService` is the one path from `agentruns` to Resource time. It runs by itself when the Time & Billing page loads a range and when a statement is generated (repeat-safe through `idx_projecttimeentries_agentpull`); the manual pull stays. Engaged client projects are pulled too, into the company in `agentruns.companyid`. |
| D5 Every app | New FR-018: kit setup installs the capture hooks (`_wxAI/routing/install.mjs`) and asks for the project token, so every application using the kit records and sends its runs. Runs are recorded for every project and billed only where the project is Billable. |
| D6 Cleanup | `AgentRunBillingService` and its failing tests are removed. |

**Data:** migration 0075 (applied by hand, then declared) adds `agentruns.companyid` (uuid, FK companies, NOT NULL; the table is empty) with an index on (companyid, starttime), and narrows `chk_agentruns_route` to `'official'`.

**Cross-scope:** SPEC-005 FR-007 / FR-014 stop excluding engaged client projects from the agent-run pull (recorded as SPEC-005 Amendment E when SPEC-143's spec is updated).

**History:** the 2026-10-23 Clarifications table above is the original record and is left as written; where it names OmniRoute or `allowedProviders`, this amendment supersedes it.
