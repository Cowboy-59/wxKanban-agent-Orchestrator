# Task Breakdown: Agent Model Routing and Metering

**Feature**: Agent Model Routing and Metering
**Spec**: 143
**Date Generated**: 2026-10-23
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Spike: subagent hooks report model, tokens and timing; is /usage window data readable (FR-001) | high | done |
| 2 | T002 Spike: per-command model setting honored for slash commands (FR-016) | high | done |
| 3 | T003 agentruns table: reviewed SQL for manual apply, then schema declaration (FR-002) | high | done |
| 4 | T004 Run capture hooks writing the local run log (FR-003) | high | done |
| 5 | T005 Consultant-hub routes POST and GET /api/consultant-hub/agent-runs (API) | high | in_progress |
| 6 | T006 Run capture forwards the local log to agentruns (FR-003) | medium | in_progress |
| 7 | T007 Difficulty class rule with owner override (FR-004) | high | done |
| 8 | T008 Tier table: kit default, project override, reader, write guard (FR-005) | high | done |
| 9 | T009 Escalation after two failed test cycles (FR-006) | high | done |
| 10 | T010 Provider policy with refusal fallback (FR-007) | high | done |
| 11 | T011 OmniRoute install, start and status scripts with the features-off check (FR-008) | medium | cancelled |
| 12 | T012 Guard: the Claude subscription never goes through OmniRoute (FR-009) | high | done |
| 13 | T013 Comparison mode: two routes, same task, third-model review (FR-010) | medium | done |
| 14 | T014 Cost report and forecast with a dated price table (FR-011) | high | done |
| 15 | T015 Project-tagged summary to the bridge outbox for wxHub and myndSynergy (FR-012) | medium | done |
| 16 | T016 Tier proposals with evidence for owner approval (FR-013) | medium | done |
| 17 | T017 Billable active minutes into time entries (FR-014) | high | cancelled |
| 18 | T018 Audit log of model choices and approvals (FR-015) | medium | done |
| 19 | T019 Per-command tiers in the kit command files (FR-016) | high | done |
| 20 | T020 Acceptance run: US1 to US10 and the success metrics | high | todo |
| 21 | T021 Help and docs for routing, metering, the cost report and agent-run billing | medium | done |
| 22 | T022 implement routes its subagent work by difficulty (FR-004, FR-005, FR-006) | high | done |
| 23 | T023 Migration 0075: agentruns.companyid and route CHECK narrowed to official, SQL for hand apply (FR-002, FR-017) | high | done |
| 24 | T024 Declare companyid, mount the agent-runs router, accept the project API token, server-set companyid (FR-017, API) | high | done |
| 25 | T025 Forward the local run log from the Stop and SessionStart hooks (FR-003) | high | done |
| 26 | T026 Kit setup installs capture hooks and asks for the project token; kit:status checks them (FR-018) | high | done |
| 27 | T027 Automatic agent-run pull on page load and statement generation, engaged projects included (FR-014) | high | done |
| 28 | T028 Remove AgentRunBillingService and its tests (FR-014) | medium | done |
| 29 | T029 Remove OmniRoute: directory, route value, allowedProviders, tests (FR-007, FR-008, FR-009) | medium | done |
| 30 | T030 Live acceptance run: US1, US11 and US12 end to end (FR-003, FR-014, FR-017, FR-018) | high | todo |
| 31 | T031 Kit routes accept an engaged consultant company (FR-019) | high | in_progress |

## Task Details

### T001 — T001 Spike: subagent hooks report model, tokens and timing; is /usage window data readable (FR-001)

Live claude -p runs in a throwaway project: which hooks fire for the session and for each subagent (SubagentStart/SubagentStop/Stop/SessionEnd or equivalents), and which fields carry the model, token usage (input/output/cache) and timing. Name and prove a fallback source if hooks lack tokens (transcript usage blocks, Agent tool results, telemetry). Check whether plan window usage (what /usage shows) is readable by a script. Record the result in specs/143-agent-model-routing-metering/spike-hooks.md.

### T002 — T002 Spike: per-command model setting honored for slash commands (FR-016)

Prove in a live session whether a model setting in a command or skill file's frontmatter makes that command's turn run on that model, without changing the session model afterwards. If not, prove the fallback: the command hands its work to a subagent on the declared tier. Record the result in specs/143-agent-model-routing-metering/spike-command-tier.md.

### T003 — T003 agentruns table: reviewed SQL for manual apply, then schema declaration (FR-002)

Write the reviewed CREATE TABLE SQL for agentruns (UUID v7 id, lowercase names, no underscores, columns per the spec) for the owner to apply by hand. Declare it in src/db/schema/ only after the owner confirms the table exists; record the change in specs/117-production-schema-integrity/schema-change-log.md; verify with db:drift plus a column-level check.

### T004 — T004 Run capture hooks writing the local run log (FR-003)

Hook scripts under _wxAI/ that write one record per session, per subagent and per main-session command turn to decisions/agentrun-log.jsonl, using the fields the T001 spike proved. No prompt or code content. Active plus waiting minutes match wall time within 1 minute.

### T005 — T005 Consultant-hub routes POST and GET /api/consultant-hub/agent-runs (API)

POST records one run (idempotent by run id); GET reads runs by project and date range. Behind the existing consultant-hub authentication with a role guard. TypeScript, Pino, no any. Written against agentruns; not deployed until the table exists.

### T006 — T006 Run capture forwards the local log to agentruns (FR-003)

Once the table exists, forward local run records to POST /api/consultant-hub/agent-runs, idempotent, with retry; the local log stays the source until a record is confirmed stored.

### T007 — T007 Difficulty class rule with owner override (FR-004)

Deterministic classifier: heavy for security/auth/money/schema/migration/production, more than 5 files, more than 4 acceptance criteria, or already escalated; moderate for 2-5 files or new logic with tests; otherwise easy. Owner override logged. Unit tests including the security-is-always-heavy rule.

### T008 — T008 Tier table: kit default, project override, reader, write guard (FR-005)

Kit default (easy Haiku, moderate Sonnet, heavy Opus) plus models: override in decisions/settings.yaml (project-owned). A reader used by G.O.D. and area agents. Agents cannot write the models: section (hook guard).

### T009 — T009 Escalation after two failed test cycles (FR-006)

A task moves up one tier after two failed test cycles; the run carries escalated = true; counted in the report.

### T010 — T010 Provider policy with refusal fallback (FR-007)

allowedProviders per work kind in decisions/settings.yaml, empty by default (Anthropic only). A refused route falls back to the cheapest allowed Claude tier; the refusal is logged. No learning or proposal path can add a provider.

### T011 — T011 OmniRoute install, start and status scripts with the features-off check (FR-008)

Kit scripts: install (dry run by default, --yes to act), detached start, status (up/down and latency), localhost-bound with a scoped token, never bundling OmniRoute code. A check that stealth, quota sharing, the MITM proxy and compression are off, and that its MCP server is not registered with our agents. Verify the Windows install path from its docs.

### T012 — T012 Guard: the Claude subscription never goes through OmniRoute (FR-009)

A configuration check and test asserting no Anthropic subscription connection is routed through OmniRoute, and that a run with provider anthropic-subscription never records route omniroute.

### T013 — T013 Comparison mode: two routes, same task, third-model review (FR-010)

Run one task on two routes in separate worktrees with the same spec and starting code; a third model reviews both diffs; record cost per finished task, first-time test pass, review findings and retries per route; internal projects only (refuse on client projects); never billed.

### T014 — T014 Cost report and forecast with a dated price table (FR-011)

docs/agent-cost-report.md plus JSON from the run log/agentruns: totals, per agent-hour, window burn (when visible), price equivalent per tier from one dated price table, by-class and per-command figures, billable view, comparisons, proposals, and a forecast range with assumptions.

### T015 — T015 Project-tagged summary to the bridge outbox for wxHub and myndSynergy (FR-012)

A fixed, versioned summary shape written to .wxai/room-outbox.jsonl when the bridge is live; no client content and no per-client tokens; reaches the room within 10 seconds via the existing drain.

### T016 — T016 Tier proposals with evidence for owner approval (FR-013)

A deterministic proposal generator: at least 5 comparisons in a class, lower cost per finished task, no worse quality; writes a proposal with evidence to the run report; flags heavy/security/money/schema downgrades; only the owner applies it through the owner-only path. Add the G.O.D. steps to the hosted method.

### T017 — T017 Billable active minutes into time entries (FR-014)

Write active minutes from agentruns to projecttimeentries on the existing AI session path; waiting excluded; invoices show hours and task only, never tokens, model or provider.

### T018 — T018 Audit log of model choices and approvals (FR-015)

Append-only log of every model choice, escalation, refusal, comparison, proposal and approval with time and evidence, separate from the records it changes.

### T019 — T019 Per-command tiers in the kit command files (FR-016)

Per the T002 spike: declare a tier in each kit command (both mirrors), e.g. dbpush/kit:status/auditfences Haiku, search/help Haiku or Sonnet, buildscope/createSpecs/wxG-O-D/implement Opus; or the subagent hand-off fallback. Never change the owner's /model choice; a test asserts it.

### T020 — T020 Acceptance run: US1 to US10 and the success metrics

Live runs of US1-US10 and checks for each success metric; endpoint-test every claim; record evidence in specs/143-agent-model-routing-metering/acceptance.md.

### T021 — T021 Help and docs for routing, metering, the cost report and OmniRoute

User-facing help: tier table, difficulty classes, provider policy, comparison mode, the cost report and forecast, OmniRoute install, and billing on active time.

### T022 — T022 implement routes its subagent work by difficulty (FR-004, FR-005, FR-006)

Owner-approved 2026-10-27. The implement command file (both mirrors, identical bytes) classifies each task with difficulty.mjs, resolves its model with tiers.mjs, shows the plan before launching, and hands easy and moderate tasks to a subagent on that model; heavy tasks stay in the main session. Escalation after two failed test cycles through escalateTask; each choice logged as a model-choice event. Phase 4 (code and UI tracks), 4b and the seed work of 5b run as subagents (Sonnet; Opus when the diff touches security, auth, money or schema, or an adapter must be generated). Phase 5 splits around its gates: a subagent drafts the inventory, schema analysis and coverage summary, the main session holds the approval and manifest-confirm gates, a subagent writes the item bodies. The read-only schema analysis runs on Sonnet although the difficulty rule calls schema heavy (owner decision). Phases 1, 3, 6 and 6b stay in the main session. Every approval gate stays in the main session; subagents never run git, push, write a production database or ask the user anything. If the routing scripts cannot run, or the client has no subagent tool, the phase runs in the main session as before. No model: frontmatter on implement (owner decision: it saves nothing on an Opus session and would force Opus on a cheaper one), which narrows T019 for this command. Concurrency (owner-approved 2026-10-27): implement takes --cap=<n> with SPEC-136 FR-018's meaning; code-writing subagents run one at a time unless the cap allows more, read-only subagents at most 2 at once, never above the cap; the cap limits how many run together, never which model each uses.

## Amendment A (2026-11-02) — status of T001–T022 and the new tasks

Status checked against commits a7288933 and 925cee52 and the working tree on 2026-11-02. Owner decisions D1–D6 are in docs/GOD-State-143A.json and the scope's Amendment Log.

| Task | Status | Evidence / what is left |
|------|--------|--------------------------|
| T001 | done | spike-hooks.md: capture feasible |
| T002 | done | spike-command-tier.md: frontmatter `model:` works for a typed slash command |
| T003 | done | agentruns.sql applied by hand and verified 2026-10-24; src/db/schema/agentrun.ts declared but not exported from the schema index (T024 exports it) |
| T004 | done | _wxAI/routing/capture-hook.mjs, capture-worker.mjs, log.mjs; tests/unit/routing/capture.test.ts. Installed nowhere yet (T026) |
| T005 | done | src/server/routes/agentRuns.ts mounted at /api/consultant-hub/agent-runs (T024) |
| T006 | done | _wxAI/routing/forward.mjs runs from forward-hook.mjs on Stop and SessionStart (T025); URL and token from the per-machine store (T026) |
| T007–T009 | done | difficulty.mjs, tiers.mjs (escalate, escalateTask), tiers.default.json, hook-settings-guard.mjs; their tests pass |
| T010 | done | policy.mjs; its allowedProviders path is removed by T029 (Anthropic only) |
| T011 | cancelled | OmniRoute removed (D1); the code is deleted by T029 |
| T012 | done | the official-client guard; narrowed to route = 'official' by T029 |
| T013–T016 | done | compare.mjs, report.mjs + report-lib.mjs + prices.json, room-outbox summary, propose.mjs; their tests pass |
| T017 | cancelled | superseded (D4, D6): SPEC-005's AgentRunPullService is the only path to time entries; T027 wires it, T028 removes AgentRunBillingService |
| T018 | done | log.mjs append-only routing audit log |
| T019 | done | `--write` run 2026-11-03: dbpush haiku; help, wxLedger sonnet; buildscope, createSpecs, wxG-O-D opus; both mirrors identical. implement is skipped by the script itself (KEEP_SESSION_MODEL, T022 owner decision); command-tiers tests 14/14 |
| T020 | todo | US9 is retired; T030 covers US11 and US12 |
| T021 | done | _wxAI/routing/README.md: setup, hooks, difficulty classes, tier table, per-command models, owner override, Anthropic only, comparison, cost report and forecast, agent-run billing on active time. The app's in-product Time & Billing article (src/shared/help/articles.ts `timeTracking`) predates SPEC-005 and is SPEC-005 help debt, not covered here |
| T022 | done | commit 925cee52 |
| T023 | done | src/db/migrations/0075_scope143_agentruns_company.sql written 2026-11-02, logged PENDING in the 117 schema-change-log; the owner applies it by hand |
| T024 | done | agentrun.ts declares companyid + idx_agentruns_company_start and is exported from the schema index; router mounted ahead of the hub router; authenticateRunSender takes the JWT or a project API token (token bound to its project); companyid set from the credential, body value ignored; billable-project check via TimeBillingProjectAccess (own + engaged); GET filtered by company. agentRunsRoute tests 22/22 |
| T025 | done | forward-hook.mjs (detached) on Stop (5 s delay for the capture worker) and SessionStart; forward.mjs resolves env, then the per-machine store; lock against overlapping forwards; prints no token. forward tests 15/15 including an end-to-end detached-hook run |
| T026 | done | token-store.mjs (~/.wxai/agentrun-tokens.json, keyed by project id with its folder, token on stdin); kit:configure stores the token and runs install.mjs; first session after a kit upgrade runs install.mjs once per version (routing-hooks-sync.ts, from cli --help); kit:status shows the hooks and token state; release secret gate refuses agentrun-tokens.json, agentrun-log.jsonl, agentrun-forwarded.txt, agentrun-forward.lock |
| T027 | done | AgentRunPullService pulls by agentruns.companyid (engaged projects included), rates via TimeBillingProjectAccess, conflict key leads with companyid (0076 applied and verified 2026-11-03), pullRange for the automatic pull; timeBilling.ts auto-pulls before GET /projects and POST /statements (page never blocked, statement blocked on failure); timer notes read the company's runs only. Tests: agentRunPull 12/12, timeBillingRoutes auto-pull 6 |
| T028 | done | AgentRunBillingService.ts and agentRunBilling.test.ts deleted; nothing imported them; AgentRunPullService is the only agentruns → projecttimeentries writer |
| T029 | done | omniroute/ and omniroute.test.ts deleted; policy.mjs Anthropic only (ROUTES = official); tiers.mjs refuses non-Claude tier models and drops allowedProviders; compare.mjs refuses and logs non-Claude sides; propose.mjs skips them; settings guard protects models: only; contracts.md updated; agentRuns.ts route enum and agentrun.ts comment applied |
| T030 | todo | |

### T023 — Migration 0075: agentruns.companyid and route CHECK (FR-002, FR-017)

Write src/db/migrations/0075_scope143_agentruns_company.sql for the owner to apply by hand: `agentruns.companyid` uuid NOT NULL, FK companies(id) ON DELETE CASCADE (the table holds 0 rows, so no backfill; the script refuses if it holds any), index (companyid, starttime); drop and re-add `chk_agentruns_route` as route = 'official'; grant to the app role as the other agentruns grants. One transaction, with a verify query block. Record it in specs/117-production-schema-integrity/schema-change-log.md as pending; never declare the column before the owner confirms it exists (DROP/ADD ordering rule).

### T024 — Declare companyid, mount the router, token auth, server-set companyid (FR-017, API)

After T023 is applied and verified (db:drift plus a column check): declare `companyid` in src/db/schema/agentrun.ts and export it from the schema index; narrow the route enum in agentRuns.ts to 'official'; mount the router in src/server/app.ts at /api/consultant-hub/agent-runs. POST accepts a JWT (as now) or the project API token through the authenticateProjectKitAccess pattern (src/server/middleware/projectKitAuth.ts; update its "apply only to" comment). The server sets companyid from the authenticated company and ignores any companyid in the body; the run's project must be one TimeBillingProjectAccess says that company may bill (own, or engaged with a live assignment), otherwise 404 and nothing stored. A token bound to one project may only send runs for that project. Idempotent by run id. GET returns only the caller company's runs. Tests: body companyid ignored; foreign project 404; engaged project accepted; token for project A refused on project B; replay stores once.

### T025 — Forward from the Stop and SessionStart hooks (FR-003)

install.mjs registers forward.mjs on Stop (session end) and SessionStart (catch-up), detached so it never blocks the session. URL from the kit's base URL; token read from the per-machine store (T026), never from a project file. A record stays in decisions/agentrun-log.jsonl until the server confirms it; a sent marker prevents double sending; network down means retry next session. No token value in any log line. Tests for: sent once, retry after failure, no token printed.

### T026 — Kit setup installs capture and asks for the token (FR-018)

kit-configure and the first run after a kit upgrade run `_wxAI/routing/install.mjs`, which merges exactly one set of capture hooks into .claude/settings.json and leaves every other hook unchanged (re-run is a no-op). Setup asks for the project's API token and stores it per machine under the user's ~/.wxai/, keyed by project id, outside the project tree. `install.mjs --check` joins kit:status. The release secret gate refuses any token or agentrun-log.jsonl in a kit release. Install it in this repo too.

### T027 — Automatic pull, engaged projects included (FR-014)

AgentRunPullService.pullDay pulls runs by agentruns.companyid (FR-017) instead of by the project's owning company, so an engaged client project's runs land as the consulting company's Resource entries and the client company's own runs stay theirs. The Time & Billing range load and statement generation call it for each day in the range, before reading; repeat-safe through idx_projecttimeentries_agentpull; locked entries skipped as now; manual /agent-pull kept. Only Billable projects reach a statement. Tests: two page loads give the same hours; engaged project pulled for the consultant only; client company sees none of it. Recorded as SPEC-005 Amendment E.

### T028 — Remove AgentRunBillingService (FR-014, D6)

Delete src/server/services/AgentRunBillingService.ts and tests/unit/agentRunBilling.test.ts (its 5 failing tests); confirm nothing imports it. A grep check: only AgentRunPullService reads agentruns into projecttimeentries.

### T029 — Remove OmniRoute (FR-007, FR-008, FR-009, D1)

Delete _wxAI/routing/omniroute/ and tests/unit/routing/omniroute.test.ts; remove the omniroute route value and allowedProviders from policy.mjs, compare.mjs, tiers.mjs, agentRuns.ts, agentrun.ts and their tests; a tier, proposal or comparison naming another provider or route is refused and logged. Update contracts.md and the help. Policy, compare and tier tests pass with route = 'official' only.

### T031 — Kit routes accept an engaged consultant company (FR-019)

`companyReachesProject(companyid, project)` in src/server/lib/projectAccess.ts: true when the company owns the project or has a live engagement on it (engagement not ended, assignment on the project not removed; the SPEC-005 FR-014 test). The six kit routes in src/server/routes/kitRoutes.ts use it in place of `project.companyid !== companyId`; the 404 for every other company and the SPEC-011 ADMIN-or-assigned check stay. Tests: owner, engaged consultant, no engagement, ended engagement, removed assignment. Then upgrade ECM Breeze (Breeze-1) to kit v1.7.91.

### T030 — Live acceptance: US1, US11, US12 (FR-003, FR-014, FR-017, FR-018)

Endpoint-tested on the deployed app: a real session's runs reach agentruns within 1 minute of the session ending, with the right companyid; an engaged client project shows the consultant's Resource hours on page load with no manual pull, and the client company's page shows none; a fresh consumer project set up with the kit records and sends its runs. Evidence in specs/143-agent-model-routing-metering/acceptance.md.
