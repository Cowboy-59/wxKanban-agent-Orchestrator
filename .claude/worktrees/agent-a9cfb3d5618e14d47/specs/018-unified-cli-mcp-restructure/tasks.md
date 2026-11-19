# Tasks: Unified CLI and AI Gateway (Spec 018)

## Phase 0: Research and Governance Artifacts

- [ ] [T018-001] [P1] Document guardrail patterns catalog (prompt injection, off-domain detection)
- [ ] [T018-002] [P1] Document LLM provider normalization contract (Gemini vs OpenAI output differences)
- [ ] [T018-003] [P1] Create MCP parity surface map (main vs kit — shared tools vs transport exceptions)
- [ ] [T018-004] [P1] Create CLI command surface inventory (canonical commands + aliases)
- [ ] [T018-005] [P1] Write CI parity gate design notes (advisory thresholds, mandatory criteria)

## Phase 1: Database & Schema

### Drizzle Schema
- [ ] [T018-006] [P1] Create Drizzle schema for `mcpdriftevents` table
- [ ] [T018-007] [P1] Create Drizzle schema for `mcpupdateadoptions` table
- [ ] [T018-008] [P1] Create Drizzle schema for `mcpparityconfig` table

### Migrations
- [ ] [T018-009] [P1] Generate migration for `mcpdriftevents`
- [ ] [T018-010] [P1] Generate migration for `mcpupdateadoptions`
- [ ] [T018-011] [P1] Generate migration for `mcpparityconfig`
- [ ] [T018-012] [P1] Add performance indexes for drift event queries (projectid, severity, resolvedstatus, createdat)
- [ ] [T018-013] [P1] Add indexes for update adoption queries (projectid, decisionstate, nextreminderat)

## Phase 2: AI Gateway Service

### Core Gateway
- [ ] [T018-014] [P1] Create `src/server/services/gateway/GatewayService.ts` (mediation orchestrator)
- [ ] [T018-015] [P1] Create `src/server/services/gateway/GuardrailsPolicy.ts` (injection detection, tool allowlist)
- [ ] [T018-016] [P1] Create `src/server/services/gateway/LLMRouter.ts` (primary + fallback provider routing)
- [ ] [T018-017] [P1] Create `src/server/services/gateway/MCPToolCallBuilder.ts` (normalize LLM output to MCP call)
- [ ] [T018-018] [P1] Create `src/server/services/gateway/GatewayAuditLog.ts` (Pino-based execution trail)

### Gateway Types
- [ ] [T018-019] [P1] Create `src/shared/types/gateway.ts` (GatewayContext, GatewayResult, PolicyDecision, MCPToolCall)

### Gateway API
- [ ] [T018-020] [P1] Create `src/server/routes/gateway.ts` — POST /api/gateway/invoke
- [ ] [T018-021] [P1] Register gateway routes in main Express app
- [ ] [T018-022] [P2] Write unit tests for GuardrailsPolicy
- [ ] [T018-023] [P2] Write unit tests for LLMRouter (mock providers)
- [ ] [T018-024] [P2] Write unit tests for MCPToolCallBuilder
- [ ] [T018-025] [P2] Write integration test for POST /api/gateway/invoke

## Phase 3: CLI Bridge Alignment

- [ ] [T018-026] [P1] Create `src/server/cli/CLIBridgeRouter.ts` (register + route bridge commands)
- [ ] [T018-027] [P1] Implement alias resolution map in CLIBridgeRouter
- [ ] [T018-028] [P1] Validate command surface against spec on CLI startup
- [ ] [T018-029] [P2] Write CLI bridge routing unit tests

## Phase 4: Drift Logging and Feedback

### Drift Service
- [ ] [T018-030] [P1] Create `src/server/services/drift/DriftEventService.ts`
  - `emit(event: DriftEvent)` — write to mcpdriftevents + GitHub
  - `resolve(eventId, note)` — update resolved status in DB and GitHub
  - `aggregate(filters)` — summary by project/severity/age
- [ ] [T018-031] [P1] Create `src/server/services/drift/GitHubFeedbackClient.ts` (create/update GitHub issues)

### Drift API
- [ ] [T018-032] [P1] Implement GET /api/drift/events (list with filters: project, severity, status)
- [ ] [T018-033] [P1] Implement GET /api/drift/events/:id (single event detail)
- [ ] [T018-034] [P1] Implement PATCH /api/drift/events/:id/resolve (mark resolved)
- [ ] [T018-035] [P1] Implement GET /api/drift/summary (aggregated stats)
- [ ] [T018-036] [P1] Register drift routes in main Express app
- [ ] [T018-037] [P2] Write unit tests for DriftEventService
- [ ] [T018-038] [P2] Write integration tests for drift API endpoints

## Phase 5: MCP Upgrade Distribution

### Update Adoption Service
- [ ] [T018-039] [P1] Create `src/server/services/updates/UpdateAdoptionService.ts`
  - `checkAvailable(projectId)` — fetch latest GitHub release metadata
  - `presentToUser(projectId, version)` — changelog summary
  - `recordDecision(projectId, version, decision)` — write to mcpupdateadoptions
  - `applyUpdate(projectId, version)` — apply update, report status
- [ ] [T018-040] [P1] Create `src/server/services/updates/GitHubReleasePoller.ts` (poll GitHub releases API)
- [ ] [T018-041] [P1] Create reminder cron job — find overdue deferred updates and notify

### Update Adoption API
- [ ] [T018-042] [P1] Implement GET /api/updates/available (per projectId)
- [ ] [T018-043] [P1] Implement GET /api/updates/changelog/:version (version delta detail)
- [ ] [T018-044] [P1] Implement POST /api/updates/decide (accept / defer / reject)
- [ ] [T018-045] [P1] Implement POST /api/updates/apply (apply accepted update)
- [ ] [T018-046] [P1] Register update routes in main Express app
- [ ] [T018-047] [P2] Write unit tests for UpdateAdoptionService
- [ ] [T018-048] [P2] Write unit tests for reminder cron logic

## Phase 6: Parity CI Gates

### GitHub Actions
- [ ] [T018-049] [P1] Create `.github/workflows/parity-check.yml` (advisory mode: report artifact, no fail)
- [ ] [T018-050] [P1] Add mandatory gate logic to parity-check.yml (fail on critical/high when mandatory)
- [ ] [T018-051] [P1] Add gate mode env var bootstrap (read from mcpparityconfig or PARITY_GATE_MODE env)

### Parity Gate Service
- [ ] [T018-052] [P1] Create `src/server/services/parity/ParityGateService.ts`
  - `getMode()` — read from mcpparityconfig
  - `setMode(mode, actorId)` — update gatemode
  - `rollback(actorId)` — revert to advisory, record rollbackat/rollbackby

### Parity Gate API
- [ ] [T018-053] [P1] Implement GET /api/parity/config (current gate configuration)
- [ ] [T018-054] [P1] Implement PATCH /api/parity/config (set mode — admin only)
- [ ] [T018-055] [P1] Register parity routes in main Express app
- [ ] [T018-056] [P2] Write unit tests for ParityGateService

## Phase 7: Frontend (Admin UI)

- [ ] [T018-057] [P2] Create DriftEventsPanel component (list drift events with severity badges)
- [ ] [T018-058] [P2] Create DriftEventDetail component (show paths, versions, resolve action)
- [ ] [T018-059] [P2] Create ParityGateToggle component (advisory / mandatory switch — admin only)
- [ ] [T018-060] [P2] Create UpdateAdoptionPanel component (available updates, accept/defer/reject)
- [ ] [T018-061] [P2] Add drift and update panels to Admin Dashboard

## Phase 8: Testing

- [ ] [T018-062] [P2] Playwright E2E: POST /api/gateway/invoke success and guardrail block flows
- [ ] [T018-063] [P2] Playwright E2E: drift event emit, list, and resolve flow
- [ ] [T018-064] [P2] Playwright E2E: update adoption accept and defer flow
- [ ] [T018-065] [P2] Playwright E2E: parity gate mode switch (advisory → mandatory → rollback)
