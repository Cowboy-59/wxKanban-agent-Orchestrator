# wxKanban Agent Orchestrator Kit

A self-contained, installable orchestration kit that brings **deterministic lifecycle management**, **stage-gated commands**, **AI-assisted workflows**, and **full audit trails** to any project in the wxKanban ecosystem.

The kit enforces a 6-phase development lifecycle. Every command is gated by the current phase — you can't skip ahead, and every action is recorded.

---

## Design Overview

### The Problem

Software projects drift. Specs get written but not followed. Tests get skipped. Releases happen without proper QA. There's no single source of truth for where a project actually is in its lifecycle.

### The Solution

The orchestrator kit installs into any project and provides:

1. **A 6-phase lifecycle** that every feature must progress through sequentially
2. **Stage-gated commands** — only the right actions are available at the right time
3. **Cross-cutting commands** that work in any phase (database sync, pipeline orchestration)
4. **Structured outputs** — every command returns a typed `CommandResult` + `AuditRecord`
5. **Multi-project isolation** — all projects share one wxKanban database, isolated by `projectId`
6. **AI routing** — primary + fallback AI providers for scope drafting and analysis

### Architecture

```
Consumer Project (any stack)
  |
  +-- wxkanban-agent/                  <-- this kit
  |     +-- apps/command-gateway/      CLI + HTTP entry points
  |     +-- core/
  |     |     +-- context/             Project context resolution
  |     |     +-- policy/              Stage-gated command policy
  |     |     +-- orchestrator/        Workflow engine + command handlers
  |     |     +-- schemas/             TypeScript types (lifecycle, commands, artifacts)
  |     +-- workers/ai/               AI client (Gemini + OpenAI fallback)
  |     +-- adapters/mcp/             MCP tool wrappers
  |     +-- services/lifecycle-api/   HTTP client to MCP server
  |     +-- scripts/                  Verification gate
  |
  +-- mcp-server/                      MCP Project Hub (HTTP/SSE on :3002)
  +-- .wxkanban-project.json           Per-install config (projectId, kitVersion)
  +-- .wxai/project.json               Current lifecycle stage
  +-- ai-settings.json                 AI adapter config + custom commands
```

**Command flow:**
```
User / AI agent
  -> CLI (cli.ts) or HTTP Gateway (http.ts) or MCP Adapter (server.ts)
    -> Project Context resolved from config files
    -> Policy Engine evaluates stage gate
    -> Workflow Engine dispatches to handler
      -> Handler executes (may call AI worker, MCP tools, file I/O)
      -> Audit record created
    -> Structured CommandResult returned
```

---

## The 6-Phase Lifecycle

Every feature progresses through these phases in order. You cannot skip phases or go backward.

| # | Phase | Purpose | Available Commands |
|---|-------|---------|-------------------|
| 1 | **Design** | Define what to build | `buildscope`, `createspecs` |
| 2 | **Implementation** | Build it | `implement`, `createtesttasks` |
| 3 | **QA Testing** | Automated verification | `runqa` |
| 4 | **Human Testing** | Manual verification + feedback | `runhuman` |
| 5 | **Beta** | Controlled release | `prepareRelease` |
| 6 | **Release** | Ship it | `finalizeRelease` |

**Cross-cutting commands** (available in every phase):
- `dbpush` — validate and sync all local data to the wxKanban database
- `pipeline-agent` — multi-phase orchestration (run, resume, retry, status)

---

## Commands Reference

### Stage-Gated Commands

#### `buildscope`
Interactive Senior Business Analyst workflow for building scope documents. Follows a strict 5-phase process (defined in `_wxAI/commands/buildscope.md`):

1. **Discovery** — 5 probing questions (business context, users, integrations, success metrics, constraints)
2. **Draft Generation** — initial scope from discovery answers
3. **Section-by-Section Review** — 6 sections each presented with reasoning and STOP/WAIT for user approval: Overview, User Scenarios, Functional Requirements, Technical Specs, Success Criteria, Constraints
4. **Final Review** — summary of all approved sections, last-chance questions
5. **File Generation** — writes `specs/Project-Scope/NNN-name.md` + `checklists/requirements.md`

```bash
wxkanban-agent buildscope --featureDescription "Time tracking and billing for consultants"
wxkanban-agent buildscope --featureDescription "Audit system" --quick     # skip interactive review
wxkanban-agent buildscope --editSpecNumber 005                            # edit existing scope
```

Auto-numbers specs (`001`, `002`, ...) and generates kebab-case short names from the description.

#### `createspecs`
Full spec pipeline that orchestrates the entire workflow in one call (defined in `_wxAI/commands/createSpecs.md`). Creates a complete spec directory with all artifacts:

| File | Purpose |
|------|---------|
| `spec.md` | Detailed specification |
| `plan.md` | Implementation plan |
| `tasks.md` | Task breakdown with status tracking |
| **`tests.md`** | **Test plan — unit, integration, E2E test cases linked to tasks** |
| `quickstart.md` | Developer quickstart guide |
| `lifecycle.json` | Phase tracking and progress |
| `checklists/requirements.md` | Quality checklist |

```bash
wxkanban-agent createspecs --specNumber 020 --featureName "User Authentication" --phase design
```

Every spec gets a `tests.md` by default (3 test cases per task: happy path, validation error, edge case). Disable with `--generateTests false`.

#### `implement`
*Available in Implementation phase.* Executes implementation with scope-first enforcement and task checklist validation.

#### `createtesttasks`
*Available in Implementation phase.* Generates test task definitions from specifications.

#### `runqa`
*Available in QA Testing phase.* Executes automated QA verification against specifications.

#### `runhuman` (wxht)
*Available in Human Testing phase.* Interactive human testing workflow — presents test scenarios, collects pass/fail results, captures feedback, and can generate new specs from failed tests.

#### `prepareRelease`
*Available in Beta phase.* Prepares a controlled release with changelog and validation.

#### `finalizeRelease`
*Available in Release phase.* Finalizes the release and marks the feature as shipped.

### Cross-Cutting Commands

#### `dbpush`
Validates all local spec files, tasks, and lifecycle data, then pushes everything to the wxKanban database via MCP. Ensures the database is always in sync with local changes.

```bash
wxkanban-agent dbpush                # validate and push
wxkanban-agent dbpush --dry-run      # validate only, no push
wxkanban-agent dbpush --force        # push even with validation warnings
```

#### `pipeline-agent`
Multi-phase pipeline orchestration. Runs the full lifecycle pipeline for a feature, with support for pausing, resuming, retrying failed phases, and skipping phases.

```bash
wxkanban-agent pipeline-agent run "Add user auth"           # run full pipeline
wxkanban-agent pipeline-agent run --dry-run "Add user auth" # preview
wxkanban-agent pipeline-agent run --skip-dbpush "Feature"   # skip a phase
wxkanban-agent pipeline-agent status                        # show all pipelines
wxkanban-agent pipeline-agent resume                        # resume last failed
wxkanban-agent pipeline-agent resume pipeline-1713045600000 # resume specific
wxkanban-agent pipeline-agent retry                         # retry failed phases
```

---

## Quick Start

### Prerequisites

- **Node.js >= 20** on PATH
- wxKanban MCP server running (default: `http://localhost:3002`)
- `.wxkanban-project.json` in project root (created at kit install time)

### Running Commands

**CLI gateway** (interactive use):
```bash
# Show available commands for current lifecycle stage
npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts --help

# Run buildscope (guided mode — 5-phase interactive flow)
npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts buildscope \
  --featureDescription "Time tracking and billing for consultants"

# Run buildscope (quick mode — skip interactive review)
npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts buildscope \
  --featureDescription "Audit system" --quick

# Run createspecs (generates spec dir with spec.md, plan.md, tasks.md, tests.md, lifecycle.json)
npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts createspecs \
  --specNumber 020 --featureName "User Authentication" --phase design

# Check kit version
npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts --version
```

**HTTP gateway** (programmatic use):
```bash
# Start the HTTP gateway on port 3003
npx tsx wxkanban-agent/apps/command-gateway/src/http.ts

# List available commands for current stage
curl http://localhost:3003/commands

# Dispatch buildscope
curl -X POST http://localhost:3003/dispatch \
  -H "Content-Type: application/json" \
  -d '{"command": "buildscope", "input": {"featureDescription": "My Feature", "quick": true}, "user": "alice"}'

# Dispatch createspecs
curl -X POST http://localhost:3003/dispatch \
  -H "Content-Type: application/json" \
  -d '{"command": "createspecs", "input": {"specNumber": "020", "featureName": "Auth System", "phase": "design"}, "user": "alice"}'

# Health check
curl http://localhost:3003/health
```

### Verify Installation

Runs a 5-step verification that proves the kit is fully operational:

```bash
npx tsx wxkanban-agent/scripts/verify-install.ts
```

Checks:
1. `.wxkanban-project.json` exists and is valid
2. MCP server is healthy at configured URL
3. wxKanban database is reachable via MCP
4. Policy engine loads and evaluates correctly
5. `buildscope` executes successfully end-to-end

On success, writes `install-verified-at` timestamp to `.wxkanban-project.json`.

### Run Tests

```bash
cd wxkanban-agent
npx vitest run --config vitest.config.ts
```

41 tests across 5 test suites:
- `lifecycle.test.ts` — stage enum, command mapping, cross-cutting commands
- `command-policy.test.ts` — stage gating, cross-cutting bypass, custom commands, structured denial
- `workflow-engine.test.ts` — dispatch routing, audit records, policy enforcement
- `transitions.test.ts` — forward-only transitions, no skipping, stage ordering
- `mcp-adapter.test.ts` — tool registration, project scoping, command routing

---

## Custom Commands (Multi-Project Extension)

Consumer projects can register their own commands by adding a `customCommands` array to `ai-settings.json`:

```json
{
  "customCommands": ["my-lint", "my-deploy", "my-audit"]
}
```

Custom commands are allowed in **every lifecycle stage** (like cross-cutting commands). They appear in `--help` output and pass policy evaluation, but require a handler registered in the workflow engine to actually execute.

---

## Configuration Files

| File | Purpose |
|------|---------|
| `.wxkanban-project.json` | Project ID, kit version, MCP server config |
| `.wxai/project.json` | Current lifecycle stage |
| `ai-settings.json` | AI adapter config, custom commands |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MCP_BASE_URL` | `http://localhost:3002` | MCP server URL |
| `WXKANBAN_API_TOKEN` | — | Per-project API token for MCP auth |
| `WXKANBAN_PROJECT_ID` | — | Project ID (fallback if not in config file) |
| `GATEWAY_HTTP_PORT` | `3003` | HTTP gateway port |
| `GEMINI_API_KEY` | — | Primary AI provider key |
| `OPENAI_API_KEY` | — | Fallback AI provider key |

---

## Project Structure

```
wxkanban-agent/
  apps/command-gateway/src/
    cli.ts                    CLI entry point
    http.ts                   HTTP/Express entry point (port 3003)
  core/
    context/
      project-context.ts      ProjectContext interface
      repo-config.ts          .wxkanban-project.json loader
    orchestrator/
      workflow-engine.ts       Command dispatch + audit
      transitions.ts           Stage transition validation
      command-handlers/
        buildscope.ts          Interactive scope drafting
        createspecs.ts         Spec generation + test plan
        dbpush.ts              Database sync wrapper
        pipeline-agent.ts      Multi-phase pipeline orchestration
        pipeline-agent-run.ts  Pipeline execution helper
        wxht.ts                Human testing workflow
    policy/
      command-policy.ts        Stage gate evaluation
      command-rules-loader.ts  Custom rules from ai-settings.json
    schemas/
      lifecycle.ts             6 stages + command mapping + cross-cutting
      commands.ts              CommandRequest<T>, CommandResult<T>
      artifacts.ts             ScopeDraft, AuditRecord, Feature, HandoffBundle
  adapters/mcp/
    server.ts                  MCP tool registration + routing
    tools/run-buildscope.ts    Buildscope MCP tool wrapper
  services/lifecycle-api/
    lifecycle-client.ts        HTTP client to MCP server
    artifact-service.ts        Document/spec operations
    feature-service.ts         Task operations
  workers/ai/
    ai-client.ts               Primary (Gemini) + fallback (OpenAI) routing
    buildscope-worker.ts       AI-powered scope draft generation
  scripts/
    verify-install.ts          R11 install verification gate
  web/
    wxht-api.ts                Express routes for human testing UI
  tests/unit/
    lifecycle.test.ts          8 tests
    command-policy.test.ts     10 tests
    workflow-engine.test.ts    8 tests
    transitions.test.ts        9 tests
    mcp-adapter.test.ts        6 tests
  vitest.config.ts             Test configuration
  tsconfig.json                TypeScript (ES2020, CommonJS, strict)
  package.json                 Scripts: test, verify, gateway:cli, gateway:http, dbpush
```

---

## Spec Reference

The orchestrator kit is defined by **Spec 019** at `specs/Project-Scope/019-agent-orchestrator-kit.md`. It contains 13 requirements (R0-R13) covering bootstrap, MCP runtime, command gateway, lifecycle policy, AI routing, structured outputs, adapter installation, kit updates, audit trails, wxKanban migration, and multi-project onboarding.
