# Implementation Plan: Unified CLI and AI Gateway (Spec 018)

## Technical Context

### Tech Stack
- **Backend:** Express + TypeScript + Drizzle ORM
- **Database:** PostgreSQL with JSONB support
- **AI Providers:** Gemini API (primary), OpenAI (fallback)
- **CLI:** Node.js CLI bridge (existing bd/wxKanban CLI)
- **CI:** GitHub Actions workflows for parity checks
- **Logging:** Pino (structured JSON, no console.log)
- **Encryption:** AES-256-GCM for any stored credentials
- **Testing:** Vitest (unit), Playwright (E2E)

### Existing Infrastructure
- MCP server (`src/server/mcp/`) — main project MCP
- Project-kit MCP (`project-kit/mcp/`) — per-project MCP
- Express API (`src/server/`) — existing REST endpoints
- Drizzle schema (`src/db/schema/`) — existing entity schemas

---

## Constitution Check

### Project Rules Compliance
- ✅ TypeScript strict mode — no `any`, no `@ts-ignore`
- ✅ Drizzle ORM for all DB access — no raw SQL in services
- ✅ Pino logging only — no console.log
- ✅ UUID v7 primary keys on all new tables
- ✅ AES-256-GCM for any stored credentials or tokens
- ✅ All secrets in environment variables
- ✅ Role-based access enforced on all API endpoints
- ✅ Database naming: lowercase, no underscores

### Compliance Requirements
- ✅ SOC2: Auditable execution trail for all gateway tool calls
- ✅ GDPR: No PII stored in drift events beyond project identifier
- ✅ HIPAA: Not applicable (no PHI in gateway or drift flows)
- ✅ Security: Guardrails block prompt injection; policy denies out-of-scope tools

---

## Architecture Overview

```
CLI / IDE / AI Agent
        │
        ▼
GatewayService.mediate(intent, context)
        │
        ├── GuardrailsPolicy.check(intent)   → block if unsafe
        ├── LLMRouter.resolve(intent)         → primary → fallback → fail closed
        └── MCPToolCallBuilder.build(payload) → structured tool call
                │
                ▼
        MCPClient.invoke(toolName, args)
                │
                ▼
        GatewayAuditLog.record(trailEntry)
```

---

## Phase 0: Research and Governance Artifacts

**Deliverables:**
- Guardrail patterns catalog (prompt injection, off-domain patterns)
- LLM provider normalization contract document
- MCP parity surface map (main vs kit — which tools are shared vs transport-specific)
- CLI command surface inventory (canonical commands + aliases)
- CI parity gate design notes

---

## Phase 1: Database & Schema

### New Tables
| Table | Purpose |
|-------|---------|
| `mcpdriftevents` | Cross-project parity drift event log |
| `mcpupdateadoptions` | Per-project update acceptance/deferral state |
| `mcpparityconfig` | Global parity CI gate mode configuration |

**Deliverables:**
- 3 Drizzle schema files under `src/db/schema/`
- 3 Drizzle migrations via `npm run db:generate`

---

## Phase 2: AI Gateway Service

### GatewayService
- Accepts: `{ intent: string, context: GatewayContext }`
- Returns: `GatewayResult` (structured JSON or human-readable)
- Orchestrates: guardrails → LLM router → MCP tool call builder

### GuardrailsPolicy
- Pattern-based prompt injection detection
- Tool allowlist enforcement per policy scope
- Returns: `PolicyDecision { allowed: boolean, reason?: string }`

### LLMRouter
- Primary provider: Gemini API
- Fallback provider: OpenAI
- Confidence threshold config: default 0.7
- Fail-closed on dual failure

### MCPToolCallBuilder
- Normalizes LLM output to `MCPToolCall { toolName, args }`
- Schema validation against MCP tool manifest

### GatewayAuditLog
- Writes to structured log via Pino
- Captures: `toolName`, `requestId`, `actorId`, `decision`, `timestamp`

**Deliverables:**
- `src/server/services/gateway/GatewayService.ts`
- `src/server/services/gateway/GuardrailsPolicy.ts`
- `src/server/services/gateway/LLMRouter.ts`
- `src/server/services/gateway/MCPToolCallBuilder.ts`
- `src/server/services/gateway/GatewayAuditLog.ts`
- Gateway API route: `POST /api/gateway/invoke`
- Unit tests for each gateway class

---

## Phase 3: CLI Bridge Alignment

### CLIBridgeRouter
- Registers bridge commands in CLI routing table
- Resolves alias commands to canonical implementations
- Validates command-surface against spec on startup

**Deliverables:**
- `src/server/cli/CLIBridgeRouter.ts`
- Updated CLI command surface documentation in `specs/018-unified-cli-mcp-restructure/`
- Alias resolution map

---

## Phase 4: Drift Logging and Feedback

### DriftEventService
- `emit(event: DriftEvent)` — writes to `mcpdriftevents` + GitHub feedback
- `resolve(eventId, resolutionNote)` — updates resolved status in DB and GitHub
- `aggregate(filters)` — returns drift summary by project/severity/age

### GitHub Feedback Integration
- Creates GitHub issue/discussion for each drift event (via GitHub API)
- Tags with severity label
- Updates issue on resolution

**Deliverables:**
- `src/server/services/drift/DriftEventService.ts`
- `src/server/services/drift/GitHubFeedbackClient.ts`
- API endpoints: `GET /api/drift/events`, `PATCH /api/drift/events/:id/resolve`
- Unit tests for DriftEventService

---

## Phase 5: MCP Upgrade Distribution

### UpdateAdoptionService
- `checkAvailable(projectId)` — fetches latest GitHub release metadata
- `presentToUser(projectId, version)` — returns changelog summary
- `recordDecision(projectId, version, decision)` — writes to `mcpupdateadoptions`
- `applyUpdate(projectId, version)` — applies update and reports status
- `scheduleReminders()` — cron: finds deferred updates past `nextreminderat`, sends notifications

**Deliverables:**
- `src/server/services/updates/UpdateAdoptionService.ts`
- `src/server/services/updates/GitHubReleasePoller.ts`
- API endpoints: `GET /api/updates/available`, `POST /api/updates/decide`, `POST /api/updates/apply`
- Reminder cron job

---

## Phase 6: Parity CI Gates

### CI Artifacts
- `parity-check.yml` — GitHub Actions workflow for parity checks
- Advisory mode: produces report artifact, does not fail job
- Mandatory mode: fails job on critical/high severity drift
- Gate mode read from `mcpparityconfig` (or GitHub env var for bootstrap)

### ParityGateService
- `getMode()` — reads current gate mode from DB
- `setMode(mode, actorId)` — updates `mcpparityconfig.gatemode`
- `rollback(actorId)` — reverts to advisory, records rollbackat/rollbackby

**Deliverables:**
- `.github/workflows/parity-check.yml`
- `src/server/services/parity/ParityGateService.ts`
- API endpoints: `GET /api/parity/config`, `PATCH /api/parity/config`
- Admin UI toggle for gate mode (advisory / mandatory)

---

## Phase 7: Test Coverage

**Deliverables:**
- Gateway unit tests (guardrails, router, builder, audit)
- Drift service unit tests
- UpdateAdoption service unit tests
- Parity gate unit tests
- Playwright E2E: gateway invocation flow
- Playwright E2E: drift event creation and resolution
- Playwright E2E: update adoption accept/defer flow

---

## Dependency Notes

| Depends On | Reason |
|------------|--------|
| 002-Scope (Admin) | Project entity and projectid FK |
| Main MCP implementation | Gateway invokes MCP tools |
| Project-kit MCP | Parity checks compare against kit MCP |
