# Spec 018: Unified CLI and AI Gateway for MCP Tool Access

## Overview

This specification defines the Central AI Gateway, CLI/MCP alignment, source/generated artifact governance, MCP parity enforcement, runtime-aware testing guardrails, MCP upgrade distribution, cross-project drift logging, and staged CI rollout for parity gates.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | AI agent, CLI user, IDE developer |
| **Secondary Actors** | Platform maintainer, delivery lead, project owner |
| **Key Value** | Single mediation path for all AI requests to MCP tools, with parity enforcement and drift observability |
| **Scope Boundary** | IN: AI Gateway mediation, guardrails, LLM routing, structured output, CLI bridge routing, source/generated governance, MCP parity contract, runtime-aware test guardrails, upgrade distribution, drift logging, CI rollout. OUT: New LLM provider implementation, transport refactors, database schema changes (current step) |

---

## User Stories

### US-018-01: Central AI Gateway Request Mediation
**As an** AI-assisted developer  
**I want** all free-form AI requests mediated through a central gateway  
**So that** any agent can reliably execute MCP tool workflows

**Acceptance Criteria:**
- WHEN a CLI, IDE, or AI agent submits free-form intent THEN the system SHALL process the request through a single gateway mediation path before MCP tool execution
- WHEN mediation is complete THEN the system SHALL produce a structured tool call payload including tool name and validated arguments
- WHEN the request cannot be mapped to an allowed MCP tool THEN the system SHALL reject execution with a policy-safe error

### US-018-02: Guardrails and Policy Enforcement
**As a** platform owner  
**I want** policy controls on gateway tool execution  
**So that** off-domain prompts and unsafe actions are blocked

**Acceptance Criteria:**
- WHEN a request contains prompt-injection or off-domain patterns THEN the system SHALL block tool execution and return a guarded response
- WHEN a request targets a tool outside policy or permission scope THEN the system SHALL deny execution
- WHEN a request is approved THEN the system SHALL record an auditable execution trail with tool identity and request metadata

### US-018-03: LLM Routing for Free-Form to MCP Mapping
**As a** developer using mixed AI providers  
**I want** provider-agnostic routing  
**So that** free-form requests consistently become valid MCP calls

**Acceptance Criteria:**
- WHEN free-form input is received THEN the system SHALL use the primary provider first
- WHEN the primary provider fails or confidence is below threshold THEN the system SHALL use a configured fallback provider
- WHEN provider-specific behavior differs THEN the system SHALL normalize output into a consistent MCP call contract before tool execution
- WHEN both providers fail policy or quality checks THEN the system SHALL fail closed and not execute MCP tools

### US-018-04: Structured Output for Automation
**As an** AI agent integrator  
**I want** machine-readable output  
**So that** follow-up actions can be automated

**Acceptance Criteria:**
- WHEN structured output mode is requested THEN the system SHALL return JSON output with execution result and metadata
- WHEN execution fails THEN the system SHALL return structured error details suitable for automated handling
- WHEN output is human mode THEN the system SHALL return readable summaries without breaking structured mode behavior

### US-018-05: Source and Generated Artifact Mapping
**As a** maintainer  
**I want** explicit scope/source mapping  
**So that** intent and generated files never conflict

**Acceptance Criteria:**
- WHEN scope intent is changed THEN the system SHALL treat `specs/Project-Scope/018-unified-cli-mcp-restructure.md` as the authoritative source
- WHEN create-specs artifacts are generated THEN the system SHALL store them under `specs/018-unified-cli-mcp-restructure/`
- WHEN reviewing changes THEN the system SHALL validate that generated artifacts do not redefine or override Project-Scope intent

### US-018-06: MCP Parity Contract
**As a** project owner  
**I want** both MCP implementations to stay functionally identical for shared logic  
**So that** behavior is predictable in all workflows

**Acceptance Criteria:**
- WHEN shared MCP logic is modified in one tree THEN the system SHALL apply equivalent changes to the other MCP tree before completion
- WHEN parity review is performed THEN the system SHALL verify alignment of tool behavior, schema validation, and auth/permission behavior
- WHEN an intentional runtime wrapper difference exists THEN the system SHALL document it explicitly as a transport exception

### US-018-07: Runtime-Aware MCP Test Guardrails
**As a** developer  
**I want** clear test guardrails  
**So that** runtime-specific assumptions do not cause false validation

**Acceptance Criteria:**
- WHEN any MCP test is executed THEN the test record SHALL state runtime mode (stdio or HTTP/SSE)
- WHEN a fix is validated in one runtime THEN the system SHALL NOT mark it complete until parity-sensitive checks are executed for the other required runtime context
- WHEN an MCP instance is already running and matches target runtime THEN tests SHOULD use that instance to avoid environment divergence

### US-018-08: Unified CLI Command Surface
**As a** CLI user  
**I want** a coherent command surface that routes correctly to MCP behaviors  
**So that** commands are consistent and predictable

**Acceptance Criteria:**
- WHEN bridge commands are invoked THEN the router SHALL register and route them through MCP bridge execution paths
- WHEN alias commands are used THEN the system SHALL resolve them to the same underlying behavior as canonical commands
- WHEN command-surface changes are made THEN the scope SHALL be updated to reflect actual implemented behavior

### US-018-09: MCP Upgrade Distribution and User-Controlled Adoption
**As a** maintainer of multiple MCP-enabled projects  
**I want** MCP updates distributed from GitHub with clear changelog context and user approval controls  
**So that** all installs can be updated safely and transparently

**Acceptance Criteria:**
- WHEN a new MCP release is published in GitHub THEN the system SHALL allow installed projects to detect and fetch update metadata
- WHEN update metadata is presented THEN the system SHALL include version delta, command/tool changes, behavioral impacts, and why the update is recommended
- WHEN a project has available updates THEN the system SHALL prompt the user to accept or reject the update before applying it
- WHEN the user rejects an update THEN the system SHALL keep the current version and record the rejection decision without forcing immediate adoption
- WHEN the user accepts an update THEN the system SHALL apply the update and report post-update status
- WHEN a command is added or behavior is changed THEN the system SHALL surface those specific changes in the changelog summary presented to the user
- WHEN a project defers an update THEN the system SHALL store a deferral state with maintenance window metadata
- WHEN an update remains deferred THEN the system SHALL send reminder notifications every 30 days until the user accepts or re-defers

### US-018-10: Cross-Project Drift Logging and Feedback
**As a** platform maintainer  
**I want** to see drift issues across all installed projects  
**So that** parity breaks are visible, triaged quickly, and fixed systematically

**Acceptance Criteria:**
- WHEN a parity check runs in any project THEN the system SHALL emit a structured drift report including project identifier, MCP versions, changed paths, and severity
- WHEN drift is detected THEN the system SHALL record the event in both a GitHub feedback channel and a wxKanban database drift table
- WHEN a drift event is resolved THEN the system SHALL update resolution status and timestamp in both GitHub feedback and the wxKanban database drift table
- WHEN maintainers review drift health THEN the system SHALL provide aggregated visibility by project, frequency, unresolved age, and severity
- WHEN rollout is in advisory mode THEN drift findings SHALL be visible without blocking merges
- WHEN rollout is promoted to mandatory mode THEN unresolved critical and high drift SHALL block merge for parity-scoped changes

### US-018-11: Staged CI Rollout for Parity Gates
**As a** delivery lead  
**I want** parity enforcement introduced in stages  
**So that** we can tune signal quality before hard-fail enforcement

**Acceptance Criteria:**
- WHEN parity CI is first introduced THEN the system SHALL run in advisory mode for a 30-day stabilization period
- WHEN the 30-day advisory period completes and false positives are acceptable THEN the system SHALL switch to mandatory gate mode
- WHEN mandatory mode is active THEN parity gate failures with critical or high severity SHALL block parity-scoped merges
- WHEN rollback is needed due to tool instability THEN the system SHALL support temporary downgrade back to advisory mode with explicit owner approval

---

## Architecture

```
AI Agent / CLI / IDE
        │
        ▼
┌─────────────────────────────────┐
│        AI Gateway               │
│  ┌─────────────────────────┐    │
│  │ Guardrails & Policy     │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ LLM Router (primary +   │    │
│  │ fallback provider)      │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ MCP Tool Call Builder   │    │
│  └─────────────────────────┘    │
└──────────────┬──────────────────┘
               │
               ▼
       MCP Server (stdio │ HTTP/SSE)
               │
               ▼
         wxKanban DB
```

**Cross-project drift reporting flow:**

```
Project parity check
        │
        ▼
Structured drift event
        │
        ├──► GitHub feedback (issue / discussion / report artifact)
        │
        └──► wxKanban mcpdriftevents table
                │
                ▼
        Maintainer review & triage
```

---

## Open Questions

1. Should reminder notifications support escalation tiers after repeated 30-day deferrals?
