# Brainstorm: Agent model routing and metering (Topic 2 of the parallel build agent)

- **Status:** closed
- **Opened / last updated:** 2026-10-23 / 2026-10-23
- **Source:** internal design draft (owner, 2026-10-22), Topic 2 parked from `docs/brainstorms/2026-10-22-parallel-build-agent.md`
- **Asked for by:** internal (owner)
- **Level:** senior
- **Next item:** none

## The request
Let the developer's coding agents and the G.O.D. flow choose and switch models by need, stay inside a per-project list of approved providers, continue past subscription limits, and meter every minute of AI-agent work, including for the Consultants subscription, so a multi-week, around-the-clock project stays affordable.

## What already exists
| Item | Status | Evidence | Confidence |
|---|---|---|---|
| The product's own LLM calls behind one provider switch (`groq`, `gemini`, `anthropic`, `openai-compatible`) | Built (code fenced to SCOPE-099; scope doc `draft`) | `src/server/ai/llm-provider.ts`, `llm-stream.ts` | Confirmed |
| Per-call provider/model override, soft throttling | Built, marketing only | SCOPE-065 (capability search) | Likely |
| Token-saving advisor, suggest-only | Built | `_wxAI/rules/token-advisor.md` (SCOPE-093) | Confirmed |
| Per-agent model choice | Manual only (the Agent tool's `model` parameter) | This session | Confirmed |
| AI session per spec and task; time entries linked to it; billable flag; invoice preview | Built (SCOPE-020, SCOPE-037), started by hand with `/ai-session` | `aispecsessions`, `projecttimeentries.aispecsessionid`, `projecttimeentries.billable`, `consultantHub.ts` | Confirmed |
| Model, provider, tokens, active vs waiting on a session | Not found | `aispecsessions` columns read in full | Confirmed |
| Automatic capture of parallel agents | Not found | No hook or job starts a session for a spawned agent | Unknown |
| OmniRoute (local gateway, MIT, `auto/subscription`, `auto/thrifty`, 20 routing strategies, quota-aware) | Available, not integrated | `E:\AI_Development\OmniRoute` README and docs (read, not run) | Likely |
| free-claude-code (local proxy, AGPL, fixed fallback list, no quota awareness, Anthropic only by API key) | Available, not integrated | `E:\AI_Development\free-claude-code` README (read, not run) | Likely |
| Claude API prices: Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50, Fable 5.1 $10/$50 per million tokens; cache reads about 0.1x; batch half price | Reference | Bundled Claude API reference, cached 2026-10-06 | Confirmed |
| Subscription plan usage limits (5-hour and weekly windows) and how tiers burn them | Not in any reference read | — | Unknown |

What changing it would reach: SCOPE-099 has 4 fenced files (one shared with SCOPE-100) and no dependents; SCOPE-020's tables feed SCOPE-037 and SCOPE-099.

## Panel
Spoke: Lead Architect, Domain Analyst, Backend, Security, Database, DevOps, QA · Sat out: Legacy, Migration, Frontend, Documentation

## Decisions
| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need | Agents and G.O.D. choose cheaper models whenever a task allows, even while the plan has room, to save the window and cost; measure first before fixing the tier table. | Agreed | done (SCOPE-143) | 2026-10-23 |
| 2 | The Claude subscription | The owner's Claude subscription stays on the official client and is never routed through a proxy. | Agreed | done (SCOPE-143) | 2026-10-23 |
| 3 | Two problems or one | This topic covers the developer's coding agents and the G.O.D. flow. The product's own AI calls stay with SCOPE-099. | Agreed | no | 2026-10-23 |
| 4 | Two levers | Lever 1: cheaper Claude tiers on the official plan. Lever 2: other providers through OmniRoute, only where a project allows. | Agreed | done (SCOPE-143) | 2026-10-23 |
| 5 | Reuse | OmniRoute (MIT, separate local service) is the router; the existing AI session, time-entry and invoice path (SCOPE-020/037) carries billing; the Topic 1 run report carries proposals; SCOPE-099 unchanged. | Agreed | done (SCOPE-143) | 2026-10-23 |
| 6 | free-claude-code | Not used; OmniRoute covers it under a more permissive license and adds quota awareness. | Declined | no | 2026-10-23 |
| 7 | Routing the subscription through a proxy | Declined: no stealth or impersonation of the official client. | Declined | no | 2026-10-23 |
| 8 | Provider policy | Non-Anthropic providers are off by default; each project opts in and lists which kinds of work may leave Anthropic; learning can never widen it. | Agreed | done (SCOPE-143) | 2026-10-23 |
| 9 | Metering | Every agent run is captured automatically: task, difficulty, model, provider, input/output/cache tokens, active and waiting minutes, parallel agents included. | Agreed | done (SCOPE-143) | 2026-10-23 |
| 10 | Billing | Clients are billed on active agent time (waiting excluded). Tokens, model and provider are for analysis only and never appear on an invoice. | Agreed | done (SCOPE-143) | 2026-10-23 |
| 11 | Consultants subscription | All AI-agent time is trapped into the existing AI session, time-entry and invoice path. | Added | done (SCOPE-143) | 2026-10-23 |
| 12 | Comparison mode | Two routes on the same task in separate worktrees, sampled across easy, moderate and heavy tasks, reviewed by a third model, reported as cost per finished task; comparison time is never billed. | Added | done (SCOPE-143) | 2026-10-23 |
| 13 | Where comparisons run | Comparison testing runs on the owner's internal systems, not on client projects. | Added | done (SCOPE-143) | 2026-10-23 |
| 14 | Learning | G.O.D. learns from runs and comparisons to keep cost down. Initially it only proposes tier changes, with the comparison data, for owner approval (panel had recommended automatic changes within limits: at least 5 comparisons, cheaper, quality no worse, inside policy). | Changed | done (SCOPE-143) | 2026-10-23 |
| 15 | First version | Run capture, a measured day, tier table with one-tier escalation after two failed test cycles, comparison mode, billing columns after the measured day, and OmniRoute with stealth, quota sharing, MITM and compression off. | Agreed | done (SCOPE-143) | 2026-10-23 |
| 16 | Risks | R1 subagent hooks unproven (spike first); R2 quality drop (escalation, cross-model review); R3 small samples (5 per class, owner approval); R4 client code to an unapproved provider (policy off by default); R5 OmniRoute terms-risk features off; R6 OmniRoute surface (localhost, scoped tokens, its MCP not registered); R7 billing columns applied before declared; R8 comparisons cost double (sampling, never billed); R9 invoices show time and tier only. | Agreed | done (SCOPE-143) | 2026-10-23 |
| 17 | Order | R1 spike and run capture before the major project starts; SCOPE-136 Amendment B alongside; then tier table, OmniRoute and policy, comparison mode, G.O.D. proposals, billing columns. | Agreed | done (SCOPE-143) | 2026-10-23 |
| 18 | Per-command model tier (raised during /buildscope) | Each kit command declares its own tier for its own turn in the main session (dbpush on Haiku; buildscope, createSpecs, /wxG-O-D, /implement on Opus); the owner's /model choice is never changed silently; spike first, subagent hand-off as fallback. Ledger D-0018. | Added | done (SCOPE-143) | 2026-10-23 |

## Cost estimate shown (not a decision)
From this session's real use (about 950,000 tokens in about 45 agent-minutes, so about 1.3 million tokens per agent-hour, cache share unknown), 4 agents, 24/7 for 3 weeks (about 2,000 agent-hours), at API prices: Opus about $5,000-12,000, Sonnet about $2,600-6,000, Haiku about $120-300. Inside a flat subscription a cheaper tier saves window, not dollars; savings in dollars come from the work beyond the cap. To be replaced by the measured day.

## Open items
- R1: whether Claude Code hooks report model, tokens and timing for subagents in every mode.
- How the subscription meters the different Claude tiers against the window (Unknown).
- OmniRoute install, Windows support, and the per-project allow-list mechanics, verified at spec time.
- Start date of the major project (asked, not given).

## Next step
Recorded. Ledger written through the ledger script: 17 entries, D-0001 to D-0017, `check` passes (first live run of SPEC-142 T005). Live finding: the import uses each row's short label as the `question`, so a natural question ("Should my Claude subscription go through a proxy?") matched D-0007 at only 0.50, under the default 0.75 threshold. Fix tracked for SPEC-142: write a natural-language question per row at close, and containment scoring in `file.mjs`. Then handed to `/buildscope --from-md docs/brainstorms/2026-10-23-agent-model-routing.md`: **SCOPE-143 Agent Model Routing and Metering drafted 2026-10-23** (16 FRs, 10 scenarios, 8 success metrics; buildscope gate score 93, valid; number from the database). Written locally to `specs/Project-Scope/143-agent-model-routing-metering.md`; not pushed. Next: `/createSpecs 143` on the owner's request.
