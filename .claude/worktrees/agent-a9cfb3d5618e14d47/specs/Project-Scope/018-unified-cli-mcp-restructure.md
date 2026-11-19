# Spec 018: Unified CLI and AI Gateway for MCP Tool Access

> ⚠️ **SUPERSEDED BY [019-agent-orchestrator-kit.md](019-agent-orchestrator-kit.md)** (2026-04-09)
>
> The gateway, guardrail, routing, CLI, and upgrade-distribution concerns in this document are now delivered by the `wxKanban-agent-Orchestrator` kit rather than a standalone gateway service. Specifically:
>
> - **R1–R4** (central gateway, guardrails, LLM routing, structured output) → delivered by `wxkanban-agent/core/orchestrator` + `core/policy` + `workers/ai` in the kit.
> - **R5** (source vs generated artifact dirs) → retained as a repo-hygiene rule only.
> - **R6** (MCP parity between two trees) → **obsolete**. The kit ships a single `mcp-server/` tree; there is no second tree to reconcile.
> - **R7** (runtime-aware MCP tests) → retained loosely: tests declare their runtime, but no dual-runtime enforcement.
> - **R8** (unified CLI) → delivered by `apps/command-gateway/cli.ts`.
> - **R9** (upgrade distribution + user-controlled adoption) → delivered by the kit update flow (`kitVersion` + changelog + accept/reject/defer).
> - **R10** (cross-project drift logging) → **obsolete**. No multi-tree drift exists once the kit is the single source.
> - **R11** (staged CI rollout from advisory to mandatory) → **obsolete** for the same reason.
>
> This file is kept for historical context. Do not implement against it. See 019 for the active requirements.

## Introduction

This scope defines a central AI Gateway that proxies CLI, IDE, and AI agent requests to MCP tools. The gateway must convert free-form natural language into structured MCP tool calls with policy guardrails and provider routing.

This scope also defines governance for:
- Source-of-truth scope location vs generated artifact location
- MCP parity between main project MCP and project-kit MCP
- Runtime-aware MCP testing to prevent repeated integration drift
- Controlled MCP upgrade distribution across installed projects
- Cross-project drift observability and feedback

## Resolved Decisions

1. Routing policy: primary provider plus fallback.
2. Parity enforcement rollout: start with advisory CI, then move to mandatory CI gate after a 30-day stabilization window.
3. Drift visibility: implement cross-project drift logging and feedback aggregation.
4. Drift persistence channel: store drift events in both GitHub and wxKanban database table.
5. Mandatory-mode merge blocking severities: critical and high.
6. Update adoption policy: support per-project deferrals and maintenance windows, with reminder notifications every 30 days.

## Requirement 1 - Central AI Gateway Request Mediation

**User Story**: As an AI-assisted developer, I want all free-form AI requests mediated through a central gateway so that any agent can reliably execute MCP tool workflows.

**Acceptance Criteria**:
1. WHEN a CLI, IDE, or AI agent submits free-form intent THEN the system SHALL process the request through a single gateway mediation path before MCP tool execution.
2. WHEN mediation is complete THEN the system SHALL produce a structured tool call payload including tool name and validated arguments.
3. WHEN the request cannot be mapped to an allowed MCP tool THEN the system SHALL reject execution with a policy-safe error.

## Requirement 2 - Guardrails and Policy Enforcement

**User Story**: As a platform owner, I want policy controls on gateway tool execution so that off-domain prompts and unsafe actions are blocked.

**Acceptance Criteria**:
1. WHEN a request contains prompt-injection or off-domain patterns THEN the system SHALL block tool execution and return a guarded response.
2. WHEN a request targets a tool outside policy or permission scope THEN the system SHALL deny execution.
3. WHEN a request is approved THEN the system SHALL record an auditable execution trail with tool identity and request metadata.

## Requirement 3 - LLM Routing for Free-Form to MCP Mapping

**User Story**: As a developer using mixed AI providers, I want provider-agnostic routing so that free-form requests consistently become valid MCP calls.

**Acceptance Criteria**:
1. WHEN free-form input is received THEN the system SHALL use the primary provider first.
2. WHEN the primary provider fails or confidence is below threshold THEN the system SHALL use a configured fallback provider.
3. WHEN provider-specific behavior differs THEN the system SHALL normalize output into a consistent MCP call contract before tool execution.
4. WHEN both providers fail policy or quality checks THEN the system SHALL fail closed and not execute MCP tools.

## Requirement 4 - Structured Output for Automation

**User Story**: As an AI agent integrator, I want machine-readable output so that follow-up actions can be automated.

**Acceptance Criteria**:
1. WHEN structured output mode is requested THEN the system SHALL return JSON output with execution result and metadata.
2. WHEN execution fails THEN the system SHALL return structured error details suitable for automated handling.
3. WHEN output is human mode THEN the system SHALL return readable summaries without breaking structured mode behavior.

## Requirement 5 - Source and Generated Artifact Mapping

**User Story**: As a maintainer, I want explicit scope/source mapping so that intent and generated files never conflict.

**Acceptance Criteria**:
1. WHEN scope intent is changed THEN the system SHALL treat specs/Project-Scope/018-unified-cli-mcp-restructure.md as the authoritative source.
2. WHEN create-specs artifacts are generated THEN the system SHALL store them under specs/018-unified-cli-mcp-restructure/.
3. WHEN reviewing changes THEN the system SHALL validate that generated artifacts do not redefine or override Project-Scope intent.

## Requirement 6 - MCP Parity Contract (Main MCP and Project-Kit MCP)

**User Story**: As a project owner, I want both MCP implementations to stay functionally identical for shared logic so that behavior is predictable in all workflows.

**Acceptance Criteria**:
1. WHEN shared MCP logic is modified in one tree THEN the system SHALL apply equivalent changes to the other MCP tree before completion.
2. WHEN parity review is performed THEN the system SHALL verify alignment of tool behavior, schema validation, and auth/permission behavior.
3. WHEN an intentional runtime wrapper difference exists THEN the system SHALL document it explicitly as a transport exception.

## Requirement 7 - Runtime-Aware MCP Test Guardrails

**User Story**: As a developer, I want clear test guardrails so that runtime-specific assumptions do not cause false validation.

**Acceptance Criteria**:
1. WHEN any MCP test is executed THEN the test record SHALL state runtime mode (stdio or HTTP/SSE).
2. WHEN a fix is validated in one runtime THEN the system SHALL NOT mark it complete until parity-sensitive checks are executed for the other required runtime context.
3. WHEN an MCP instance is already running and matches target runtime THEN tests SHOULD use that instance to avoid environment divergence.

## Requirement 8 - Unified CLI Alignment

**User Story**: As a CLI user, I want a coherent command surface that routes correctly to MCP behaviors.

**Acceptance Criteria**:
1. WHEN bridge commands are invoked THEN the router SHALL register and route them through MCP bridge execution paths.
2. WHEN alias commands are used THEN the system SHALL resolve them to the same underlying behavior as canonical commands.
3. WHEN command-surface changes are made THEN the scope SHALL be updated to reflect actual implemented behavior.

## Requirement 9 - MCP Upgrade Distribution and User-Controlled Adoption

**User Story**: As a maintainer of multiple MCP-enabled projects, I want MCP updates distributed from GitHub with clear changelog context and user approval controls so that all installs can be updated safely and transparently.

**Acceptance Criteria**:
1. WHEN a new MCP release is published in GitHub THEN the system SHALL allow installed projects to detect and fetch update metadata.
2. WHEN update metadata is presented THEN the system SHALL include version delta, command/tool changes, behavioral impacts, and why the update is recommended.
3. WHEN a project has available updates THEN the system SHALL prompt the user to accept or reject the update before applying it.
4. WHEN the user rejects an update THEN the system SHALL keep the current version and record the rejection decision without forcing immediate adoption.
5. WHEN the user accepts an update THEN the system SHALL apply the update and report post-update status.
6. WHEN a command is added or behavior is changed THEN the system SHALL surface those specific changes in the changelog summary presented to the user.
7. WHEN a project defers an update THEN the system SHALL store a deferral state with maintenance window metadata.
8. WHEN an update remains deferred THEN the system SHALL send reminder notifications every 30 days until the user accepts or re-defers.

## Requirement 10 - Cross-Project Drift Logging and Feedback

**User Story**: As a platform maintainer, I want to see drift issues across all installed projects so that parity breaks are visible, triaged quickly, and fixed systematically.

**Acceptance Criteria**:
1. WHEN a parity check runs in any project THEN the system SHALL emit a structured drift report including project identifier, MCP versions, changed paths, and severity.
2. WHEN drift is detected THEN the system SHALL record the event in both:
   - a GitHub feedback channel (issue, discussion, or designated report artifact), and
   - a wxKanban database drift table for query and aggregation.
3. WHEN a drift event is resolved THEN the system SHALL update resolution status and timestamp in both GitHub feedback and the wxKanban database drift table.
4. WHEN maintainers review drift health THEN the system SHALL provide aggregated visibility by project, frequency, unresolved age, and severity.
5. WHEN rollout is in advisory mode THEN drift findings SHALL be visible without blocking merges.
6. WHEN rollout is promoted to mandatory mode THEN unresolved critical and high drift SHALL block merge for parity-scoped changes.

## Requirement 11 - Practical CI Rollout for Parity Gates

**User Story**: As a delivery lead, I want parity enforcement introduced in stages so that we can tune signal quality before hard-fail enforcement.

**Acceptance Criteria**:
1. WHEN parity CI is first introduced THEN the system SHALL run in advisory mode for a 30-day stabilization period.
2. WHEN the 30-day advisory period completes and false positives are acceptable THEN the system SHALL switch to mandatory gate mode.
3. WHEN mandatory mode is active THEN parity gate failures with critical or high severity SHALL block parity-scoped merges.
4. WHEN rollback is needed due to tool instability THEN the system SHALL support temporary downgrade back to advisory mode with explicit owner approval.

## Architecture

AI Agent / CLI / IDE -> AI Gateway (guardrails + provider routing + policy) -> MCP Server -> wxKanban DB

Cross-project drift reporting flow:
Project parity check -> structured drift event -> GitHub feedback + wxKanban drift table -> maintainer review and triage

## Scope Boundary

### In Scope

- AI Gateway intent, routing expectations, and policy controls
- CLI/MCP bridge alignment requirements
- Source-vs-generated directory governance
- MCP parity and testing guardrails
- MCP upgrade distribution governance and user acceptance flow
- Cross-project drift logging, aggregation, and feedback
- Practical staged rollout from advisory to mandatory CI parity gates

### Out of Scope

- New provider implementation work in this step
- Transport refactors in this step
- Database schema changes in this step

## Open Questions

1. Should reminder notifications support escalation tiers after repeated 30-day deferrals?

## Status

- Date: 2026-03-31
- Phase: scope normalization and governance alignment
- Priority: high
- Implementation impact in this step: documentation only
