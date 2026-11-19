# Spec 019: wxKanban Agent Orchestrator Kit

## Introduction

This scope defines the **wxKanban Agent Orchestrator Kit** — a self-contained, installable bundle that delivers deterministic lifecycle orchestration, MCP-mediated database access, AI adapter integration, and audit-trailed command execution for **any project** that participates in the wxKanban ecosystem.

The kit is designed as a **reusable, multi-project platform**. Consumer projects (e.g., `project-kit`, internal tools, client deliverables) install the kit once and immediately gain a 6-phase lifecycle (Design → Implementation → QA Testing → Human Testing → Beta → Release), stage-gated commands, structured AI routing, and full audit trails — all backed by the shared wxKanban database with row-level `projectid` isolation.

The kit replaces the gateway/parity/drift governance described in spec 018. Instead of maintaining two MCP trees with a parity contract between them, a single MCP server (`mcp-server/`) ships **inside** the kit and is installed per project. wxKanban itself is Consumer #0 (the reference implementation and test bed); `project-kit` and other projects onboard after the reference migration completes.

Source repository: [`Cowboy-59/wxKanban-agent-Orchestrator`](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator)

## Resolved Decisions

1. **Single MCP tree, hosted.** wxKanban operates one MCP server, deployed at `https://mcp.wxperts.com` (spec 028). The kit does NOT ship `mcp-server/` to consumers — it ships a thin HTTPS client only. There is no "main vs kit" MCP split to reconcile, and there is no consumer-side stateful service. (Updated 2026-05-20 — was "kit ships mcp-server/ on localhost:3002"; superseded by spec 028 hosted MCP. Triggered by BUG-20 follow-up.)
2. **Database access is hosted-only.** Consumer kit installs reach wxKanban data exclusively via HTTPS to `https://mcp.wxperts.com`. **No consumer-side Postgres connection exists or is permitted.** The wxKanban database remains shared, single-tenant-at-the-row-scope; tenant isolation is enforced by `projectid` row scoping inside the hosted MCP service (spec 028 FR-003/FR-004), behind the customer's firewall, never on the consumer's machine. (Updated 2026-05-20 — was "all installs point at the central wxKanban database" which encoded a direct DB connection from every consumer; that architecture was incompatible with customer security policy. Triggered by BUG-20 follow-up.)
3. **`DATABASE_URL_ENCRYPTED` is RETIRED.** The encrypted-DB-URL distribution mechanism (`KitEncryptionService.encryptDatabaseUrl(...)`, `EMBEDDED_DATABASE_URL` injection in `mcp-server/src/config.ts`, `DATABASE_URL_ENCRYPTED` env var in the kit `.env`) is removed from the kit as of v1.1.0. Consumer kits no longer carry DB credentials in any form — encrypted or otherwise. Wherever older decisions or requirements in this spec reference `DATABASE_URL_ENCRYPTED`, treat as historical. (Retired 2026-05-20 — superseded by spec 028 token-authenticated HTTPS. Triggered by BUG-20 follow-up.)
4. **`WXKANBAN_API_TOKEN` is a per-project bearer token for hosted-MCP HTTPS calls.** Generated per project at `init` time and stored hashed at rest server-side. Sent as `Authorization: Bearer <token>` on every request to `https://mcp.wxperts.com`. The hosted MCP resolves it to `(customerId, projectId)` and enforces project scope (spec 028 FR-003). Its role as a *DB-URL decryption key* is retired alongside Decision #3. Committed sample values must be placeholders only. (Role updated 2026-05-20 — was "decryption key for DATABASE_URL_ENCRYPTED + cross-pollination guard"; now "bearer token for hosted MCP." Triggered by BUG-20 follow-up.)
5. **`projectid` is the sole tenant key.** It ties specs, tasks, documents, time entries, audit events, and lifecycle state together for a given project.
6. **wxKanban is Consumer #0.** The wxKanban repository itself installs and dogfoods the kit before any other project onboards.
7. **Mixed-stack support.** The kit runs out of its own bundled `node_modules` inside `wxkanban-agent/` and `mcp-server/`. Consumer projects only need Node installed; they are not required to be Node projects themselves.
8. **Distribution model:** phased. Phase 1 uses `git clone`-based installation (current repo state). Phase 2 introduces a `npx wxkanban-kit init` bootstrap CLI wrapping the same install logic.
9. **Testing runtime:** HTTP/SSE is the only supported runtime at this time. Tests declare the runtime in their preamble; no dual-runtime enforcement.
10. **018 disposition:** archived in place with a supersession banner. Surviving requirements are re-homed here.
11. **Update deferral escalation:** deferred kit updates escalate on a 30 / 60 / 90 day schedule — 30d reminder, 60d warning, 90d forced prompt that blocks further deferral without `--force --reason`.
12. **Phase 2 distribution mechanism:** GitHub-release tarball with a tiny stub. Each release of `wxKanban-agent-Orchestrator` attaches a `kit.tar.gz` to its GitHub release; a small stub package fetches, verifies, extracts, and runs `init`. **No npm registry publish** for the kit itself at this time.
13. **Node runtime model:** consumer machines must have **Node ≥ 20 on PATH**. The kit ships a `bin/wxkanban-agent` (POSIX) and `bin/wxkanban-agent.cmd` (Windows) wrapper that locates the system Node. **No bundled Node runtime.** Document the Node requirement in the install guide.
14. **Policy mapping location:** the stage → allowed-commands mapping lives **in code** at `core/policy/command-policy.ts`. Per-install YAML/JSON override is **not supported** at this time.

## Requirement 0 — Secrets Scrub (Prerequisite)

> ⚠️ **DEFERRED 2026-04-09 — owner-accepted risk.** The wxKanban Postgres credentials at `pgkanban.wxperts.com` are exposed in the public orchestrator repo (`mcp-server/decrypted-url.txt` plaintext, plus encrypted blob co-located with its decryption key in `ai-settings.json`). The owner has explicitly chosen to defer DB password rotation. R0 acceptance criteria below remain canonical for when execution is authorized; until then, R0 is the **only** requirement in 019 not blocking other phases. Migration phases A–D may proceed in parallel without R0 completion. Resume R0 by saying "run R0" — the runbook is at [`../019-agent-orchestrator-kit/r0-secrets-scrub-runbook.md`](../019-agent-orchestrator-kit/r0-secrets-scrub-runbook.md).

**User Story**: As a maintainer of the orchestrator repository, I want committed secrets removed and replaced with init-time placeholders so that the public repo cannot leak project credentials.

**Acceptance Criteria**:
1. WHEN the orchestrator repo is inspected THEN `.env`, `mcp-server/decrypted-url.txt`, and any file containing a real `WXKANBAN_API_TOKEN` SHALL be absent from the main branch and added to `.gitignore`.
2. WHEN `ai-settings.json` is shipped in the kit THEN `WXKANBAN_API_TOKEN` SHALL hold a placeholder string (e.g. `"{{generated_at_init}}"`), not a real token.
3. WHEN a previously committed token or URL is removed THEN git history SHALL be scrubbed (BFG or `git filter-repo`) and the token rotated in any live system that accepts it.
4. WHEN the kit is installed THEN `init` SHALL generate a fresh `WXKANBAN_API_TOKEN`, write it to the local `ai-settings.json`, and register it against the project row in the wxKanban DB.

## Requirement 1 — Kit Bootstrap and Installation

**User Story**: As a developer starting a new project, I want a single command to install the orchestrator kit into my project so that I can begin using wxKanban lifecycle commands immediately.

**Acceptance Criteria**:
1. WHEN `git clone <kit-repo> my-project` (Phase 1) or `npx wxkanban-kit init <target>` (Phase 2) is run THEN the system SHALL materialize `wxkanban-agent/`, `mcp-server/`, `_wxAI/`, `scripts/`, `ai-settings.json`, and `.wxkanban-project.json` into the target directory.
2. WHEN initialization runs THEN the system SHALL generate a fresh UUIDv7 `projectid` and persist it in `.wxkanban-project.json` and the kit's runtime config.
3. WHEN initialization runs THEN the system SHALL generate a fresh `WXKANBAN_API_TOKEN` and persist it only to the local `ai-settings.json` (never committed back to the kit repo).
4. WHEN initialization completes THEN the system SHALL execute `node scripts/setup-mcp.mjs` followed by `node scripts/mcp-health-check.mjs` and fail the install if either step returns non-zero.
5. WHEN the target directory already contains a `.wxkanban-project.json` THEN the system SHALL refuse to overwrite unless `--force` is passed with an explicit reason.

## Requirement 2 — Project Registration in wxKanban DB

**User Story**: As a wxKanban maintainer, I want every kit install to register itself in the central database so that lifecycle state, audit events, and documents can be correlated to a known project.

**Acceptance Criteria**:
1. WHEN `init` runs THEN the system SHALL insert or upsert a row in the `projects` table keyed by the generated `projectid`.
2. WHEN the project row is created THEN the system SHALL store the kit version, install timestamp, generated API token hash, and a human-readable project name supplied by the installer.
3. WHEN registration fails (DB unreachable, decryption failure, duplicate projectid) THEN the system SHALL roll back the local install and surface a structured error.

## Requirement 3 — MCP Runtime Contract (Hosted)

**User Story**: As an AI agent or CLI user, I want a predictable MCP endpoint so that tool calls route reliably to wxKanban's hosted MCP service.

**Updated 2026-05-20** — was "kit's local MCP server on localhost:3002"; now hosted MCP at `https://mcp.wxperts.com` per spec 028. Triggered by BUG-20 follow-up. The hosted-side acceptance criteria (deployment surface, TLS, auth middleware, project scoping, audit logging) are owned by spec 028 FR-001 through FR-010; this requirement defines the *consumer-side client contract* against that hosted service.

**Acceptance Criteria**:
1. WHEN the kit's MCP client makes a tool call THEN it SHALL target `https://mcp.wxperts.com` by default, overridable via `WXKANBAN_MCP_BASE_URL` (or the equivalent `MCP_BASE_URL` field in `.wxai/project.json` per spec 027 `resolveServiceUrl`). Plain HTTP is forbidden in production; localhost overrides are permitted for dev/test only.
2. WHEN the kit performs a readiness check (e.g. at `init` or before a workflow run) THEN it SHALL probe `GET https://mcp.wxperts.com/health` and treat 200 + `{"status":"ok"}` as ready. `GET /tools` alone SHALL NOT be treated as sufficient. The legacy local probe (`mcp-health-check.mjs`) is retired; see R16 (DEPRECATED) for the historical local-MCP probe sequence.
3. WHEN any MCP tool call is sent THEN the kit SHALL include `Authorization: Bearer ${WXKANBAN_API_TOKEN}` and `X-WxKanban-Project-Id: ${WXKANBAN_PROJECT_ID}` headers. The kit SHALL NOT attempt to enforce project scoping or token validity itself — those checks live server-side per spec 028 FR-003.
4. WHEN the hosted MCP responds with `401 missing-token`, `401 invalid-token`, or `403 project-mismatch` THEN the kit SHALL surface the error verbatim to the caller and exit non-zero. It SHALL NOT silently retry, fall back, or attempt a local DB path — no local DB path exists.
5. WHEN the kit's MCP client is configured THEN it SHALL be able to invoke at minimum the following tools against the hosted MCP: `project.capture_event`, `project.upsert_document`, `project.create_task`, `project.update_task_status`, `project.link_doc_to_task`, `project.list_open_items`. The tool surface is owned by spec 028 FR-005; the kit's client is contract-only — adding a tool is a spec 028 change, not a 019 change.
6. WHEN the kit makes a hosted-MCP call THEN it SHALL set a `User-Agent: wxkanban-agent/<version>` header so per-version usage is observable in the hosted audit log (spec 028 FR-010).
7. WHEN `WXKANBAN_API_TOKEN` is missing, empty, or a placeholder THEN the kit SHALL refuse to make any MCP call and SHALL exit with a message pointing the user at `wxkanban-agent kit:configure` (spec 028 FR-008).

## Requirement 4 — Unified Command Gateway

**User Story**: As a developer, I want a single CLI entry point that routes lifecycle commands through the orchestrator workflow engine so that command behavior is consistent regardless of which adapter I use.

**Acceptance Criteria**:
1. WHEN a command is invoked via `apps/command-gateway/cli.ts` or `apps/command-gateway/http.ts` THEN the system SHALL resolve the project context from `.wxkanban-project.json`, git metadata, and CLI arguments before execution.
2. WHEN a command is dispatched THEN the system SHALL route it through `core/orchestrator/workflow-engine.ts`, which applies policy, invokes the relevant worker, calls the lifecycle API, and records the transition.
3. WHEN a command completes THEN the system SHALL return a `CommandResult<TArtifact>` payload containing the artifact, lifecycle transition, and audit record.
4. WHEN the CLI is invoked without arguments THEN it SHALL print the list of commands available in the current lifecycle stage.
5. WHEN the canonical command set changes THEN this spec SHALL be updated to match implemented behavior. The current canonical set is:

   - **Stage-gated**: `buildscope`, `createspecs`, `createtesttasks`, `implement`, `runqa`, `runhuman` (wxht), `prepareRelease`, `finalizeRelease`
   - **Cross-cutting** (any stage): `dbpush`, `pipeline-agent`

## Requirement 5 — Lifecycle Policy Engine (Stage-Gated Commands)

**User Story**: As a platform owner, I want command execution gated by lifecycle stage so that workflow steps cannot be skipped and off-stage commands are refused.

**Acceptance Criteria**:
1. WHEN a command is dispatched THEN `core/policy/command-policy.ts` SHALL evaluate the current `LifecycleStage` against an `AllowedCommandsByStage` mapping and deny execution if the command is not permitted. The canonical stages and their allowed commands are:

   - **Design**: `buildscope`, `createspecs`
   - **Implementation**: `implement`, `createtesttasks`
   - **QA Testing**: `runqa`
   - **Human Testing**: `runhuman`
   - **Beta**: `prepareRelease`
   - **Release**: `finalizeRelease`
   Cross-cutting commands (`dbpush`, `pipeline-agent`) are permitted in any stage.
2. WHEN a policy denial occurs THEN the system SHALL return a structured error naming the current stage, the denied command, and the stages in which it would be allowed.
3. WHEN a command carries an explicit `--force --reason "<text>"` override THEN the system SHALL log an audit record with severity `warn`, proceed with execution, and surface the override in the next handoff bundle.
4. WHEN a command transitions the feature to a new stage THEN the transition SHALL be recorded atomically with the artifact write in the wxKanban DB.

## Requirement 6 — AI Routing for the Web Editor (Kit-Internal AI Client)

**Scope clarification (2026-05-15)**: This requirement governs the **wxKanban web editor's AI surfaces only** — the BA-interview chat panel and proposal-overview drafting in [`src/client/pages/OverviewEditorPage.tsx`](src/client/pages/OverviewEditorPage.tsx), driven by [`src/server/ai/llm-provider.ts`](src/server/ai/llm-provider.ts) and (legacy) [`wxkanban-agent/workers/ai/ai-client.ts`](wxkanban-agent/workers/ai/ai-client.ts). These surfaces run in a browser where no editor AI is present, so the kit legitimately acts as an AI client.

**VS Code commands (`buildscope`, `createspecs`, `implement`, `runqa`, `runhuman`, `prepareRelease`, `finalizeRelease`) MUST NOT call kit-internal AI.** Their content is generated by the user's editor AI (Claude Code, Cursor, Blackbox, Copilot) and handed to the kit via MCP tools / CLI input files. The kit's role is workflow enforcement (validate, write files, emit fences, log audit, enforce stage gates), not generation. See Requirement 6a below for the input-driven contract that replaces today's AI-calling CLI handlers.

**User Story**: As a developer using the web Proposal Editor with no editor-side AI available, I want provider-agnostic routing so that BA-interview content keeps streaming even when one provider is unavailable.

**Acceptance Criteria**:
1. WHEN a worker invokes `workers/ai/ai-client.ts` THEN the system SHALL call the configured primary provider first.
2. WHEN the primary provider fails, times out, or returns output with confidence below the configured threshold THEN the system SHALL retry via the configured fallback provider.
3. WHEN either provider returns output THEN the system SHALL normalize it into a provider-agnostic shape before returning to the worker.
4. WHEN both providers fail policy or schema validation THEN the system SHALL fail closed, record the failure in the audit log, and SHALL NOT execute any MCP tool.
5. WHEN the kit's `ai-client.ts` is loaded THEN the primary provider SHALL be selected from the same `LLM_PROVIDER` environment variable defined by **spec 025 FR-019** (values: `groq` | `gemini` | `anthropic`), defaulting to `groq` with model `llama-3.3-70b-versatile` when unset. The kit and the wxKanban Express server share one provider contract — operators configure one env var, both surfaces honour it.
6. WHEN the selected primary provider's API key is missing THEN the kit SHALL fail closed with a clear error referencing the expected env var (`GROQ_API_KEY`, `GEMINI_API_KEY`, or `ANTHROPIC_API_KEY`); the kit SHALL NOT silently fall back to a different provider's API key.
7. WHEN the operator has not configured a fallback provider explicitly THEN the kit SHALL default the fallback to the next provider in the documented preference order (`groq` → `gemini` → `anthropic`) using the env var that is actually populated, so a single key is sufficient to run.
8. WHEN `implement` (and every other `SPEC_GATED_COMMANDS` entry) calls the AI client and the response is empty or malformed THEN the audit log entry SHALL include the provider name, model, HTTP status, and the first 200 characters of the raw response body — fixing the "Unexpected end of JSON input" diagnostic gap surfaced on 2026-05-14.
9. WHEN a handler-specific env var `LLM_PROVIDER_<HANDLER>` is set (e.g., `LLM_PROVIDER_IMPLEMENT=anthropic`, `LLM_PROVIDER_BUILDSCOPE=groq`) THEN the kit SHALL prefer it over the global `LLM_PROVIDER` for that handler only — so a single deployment can route low-stakes conversational surfaces (BA interview, proposal drafting, scope ideation) to a free model and route high-stakes code-generating surfaces (`implement`, `createspecs`) to a paid model. The handler name in the variable SHALL be the uppercase command id (`IMPLEMENT`, `CREATESPECS`, `BUILDSCOPE`, `RUNQA`, `RUNHUMAN`, `PREPARERELEASE`, `FINALIZERELEASE`).
10. WHEN a handler-specific env var is unset THEN the kit SHALL fall back to the global `LLM_PROVIDER`, preserving today's single-knob behaviour for operators who don't want per-handler tuning.
11. WHEN the kit's runtime config endpoint or audit log emits provider information THEN it SHALL include both the global default and the effective per-handler resolution map — so the user (or a downstream consumer-project operator) can verify which provider actually ran each command, not just which one was configured globally.

**Rationale (AC 1–8)**: The kit's original `ai-client.ts` hardcoded Gemini as primary and OpenAI `gpt-4` as fallback with no env-var dispatch, producing the `AI response is not valid JSON: Unexpected end of JSON input` failure that blocked `implement` end-to-end. Aligning the kit on spec 025 FR-019's `LLM_PROVIDER` contract makes Groq + Llama 3.3 70B the free, out-of-the-box default for orchestrator usage too.

**Rationale (AC 9–11)**: Observed on 2026-05-15 with `implement 028/T001`: Llama 3.3 70B is excellent for the BA-interview / proposal-overview surfaces (the work being done *before* code is written — conversational, low-stakes synthesis), but its code-generation quality is too inconsistent to ship without heavy human review (out-of-scope content bleed, broken `pgEnum` syntax, missing acceptance criteria, placeholder migrations). The right shape is a **two-tier provider strategy**: free model for the pre-code surfaces, higher-quality paid model for the code-emitting handlers. A handler-keyed env-var override lets one operator (or consumer-project owner) make that choice without code changes, and supports the broader educational-mission goal of letting customers plug in whatever AI provider they have access to on a per-surface basis.

**Subsequent correction (2026-05-15)**: ACs 9–11 above (the per-handler `LLM_PROVIDER_<HANDLER>` override) remain in place but are now a **narrow edge-case mechanism for CI/automation only**, not the recommended path. The primary path for VS Code commands is Requirement 6a below: the kit does not call AI for code-emitting commands at all — the user's editor AI generates content and hands it to the kit via MCP / `--input`. Per-handler env overrides are useful only for headless CI runs where no editor AI is present.

## Requirement 6a — MCP-Input-Driven Code-Emitting Commands

**User Story**: As a developer working in VS Code with my own AI assistant (Claude Code, Cursor, Blackbox, Copilot), I want code-emitting kit commands to accept the proposal generated by *my* AI so that I am not billed twice for AI usage and the kit cannot pick a model on my behalf.

**Acceptance Criteria**:

1. WHEN the user invokes any code-emitting kit command (`implement`, and future `createspecs`, `buildscope`, etc.) via the CLI THEN the command SHALL accept the proposal as input via a `--input <path>` flag pointing to a JSON file produced by the user's editor AI. The command SHALL NOT call any kit-internal AI provider.
2. WHEN the same command is invoked via MCP THEN the MCP tool SHALL accept the proposal as a structured tool-call argument, route it through the identical validation / fencing / audit pipeline as the CLI path, and return the same `CommandResult` artifact.
3. WHEN `--input` is omitted from the CLI THEN the command SHALL print the prompt + spec context (the same content previously sent to the kit's AI client) to stdout in a "for-your-editor-AI" form, so a developer can copy/paste it into their editor's chat. This replaces today's behaviour of calling the kit's AI directly.
4. WHEN the proposal fails schema validation (missing `path`, `body`, `action`; invalid `action` value; non-array `files`) THEN the command SHALL return exit code 3 with a parser error including byte offset and 160-char context window (preserving today's Spec 019 R7 AC 7 diagnostic contract).
5. WHEN the proposal is accepted THEN the command SHALL apply it with the existing validation pipeline: fence-eligibility check, drift detection, `--accept-drift` honouring, fence emission, file write (atomic via `tmp + rename`), DB-side fence record (when configured), tasks.md mark-done. None of this changes from today's handler — only the input source changes.
6. WHEN the user passes `--input -` (single hyphen) THEN the command SHALL read the proposal from stdin. This lets a pipeline write `cat proposal.json | wxkanban-agent implement 028/T001 --input -`.
7. WHEN `--input` is given AND a deprecated AI-related flag (`--ai-provider`, `--temperature`, etc., if any are introduced later) is also present THEN the command SHALL print a clear deprecation notice and proceed with the input file (input wins).
8. WHEN `workers/ai/ai-client.ts` is imported into any handler under `core/orchestrator/command-handlers/` THEN this SHALL be considered a design defect: code-emitting handlers MUST NOT depend on the AI client. The build SHALL surface an architecture lint (`tsc-no-ai-in-handlers` or equivalent) at PR time once introduced. The web-editor surfaces under `src/server/` are exempt — they legitimately use the AI client.

**Rationale**: The kit's customers — career-changing developers learning lifecycle methodology — almost always have an editor-side AI subscription (Claude Code, Cursor, Copilot) configured *before* they install the kit. Making the kit re-run AI generation through its own provider creates four problems at once: (1) **double billing** — customer pays once for editor AI, once for kit AI; (2) **model pinning** — customer's editor AI choice is bypassed by the kit's `LLM_PROVIDER` default, which may be a weaker model; (3) **double-debugging surface** — generation failures could now happen in either the editor AI or the kit AI, and the customer has to triage which; (4) **kit becomes a creative engine** — straying from the workflow-engine charter and inviting endless prompt-engineering investment. MCP exists precisely so the editor AI can drive tools. The kit's value is workflow enforcement (fencing, gates, audit, spec-first discipline). This requirement realigns the CLI surface with that charter.

**Observed harm (2026-05-15)**: With Llama 3.3 70B driving `implement 028/T001`, the AI emitted out-of-scope content (a second table from a different task), broken `pgEnum` syntax that would not compile, placeholder migration SQL, and missed two of the four documented acceptance criteria. Manual salvage took 30+ minutes for what was nominally an automated step. A user's Claude Code or Cursor — which already had the full project context in their conversation — would not have made these mistakes.

### Compliance state (2026-05-15)

| Handler | MCP-input-driven? | Notes |
| --- | --- | --- |
| `implement` | ✅ | Refactored 2026-05-15. AI call removed. Accepts `--input <path>`, `--input -` (stdin), `--proposal-json`, or `--print-prompt`. See [`command-handlers/implement.ts`](wxkanban-agent/core/orchestrator/command-handlers/implement.ts). |
| `buildscope` | ✅ | Already MCP-driven via [`BuildScopeWorker`](wxkanban-agent/workers/ai/buildscope-worker.ts) → MCP tool `project.buildscope`. The dead in-process `handleBuildScopeInteractive` (with its stub `promptUser`) was removed 2026-05-15. |
| `createspecs` | ✅ | Refactored 2026-05-15. Already took structured input (`scopeContent` + `tasks`) from the caller; now also wired into `WorkflowEngine.dispatch` (was previously orphaned) and gets `--input <path>` / `--input -` / `--print-prompt` flags matching `implement`. |
| `runqa`, `runhuman`, `prepareRelease`, `finalizeRelease` | ⚠️ Not yet implemented | When these handlers land, they MUST follow the same contract from day one. The architecture lint (AC 8) catches regressions. |

## Requirement 7 — Structured, Schema-Validated Outputs

**User Story**: As an automation integrator, I want every orchestrator output to be machine-readable and schema-validated so that downstream agents can chain actions reliably.

**Acceptance Criteria**:
1. WHEN any worker produces an artifact THEN the artifact SHALL be validated against a Zod schema defined in `core/schemas/` before being persisted or returned.
2. WHEN structured output mode is requested THEN the CLI and HTTP gateways SHALL return JSON conforming to `CommandResult<TArtifact>` with `success` (boolean), optional `artifact` (generic), and optional `error` (string). Command handlers additionally return a sibling `audit` object containing `timestamp`, `command`, `input`, `result`, and `user`.
3. WHEN execution fails THEN the system SHALL return `CommandResult` with `success: false` and an `error` string describing the failure. The sibling `audit` object SHALL still be populated for traceability.
4. WHEN human-readable output is requested THEN the system SHALL render a summary view without altering the structured payload shape.
5. WHEN `implement` (or any handler that requires structured JSON from the AI) calls `ai-client.ts` THEN the client SHALL request provider-native JSON-mode where supported, mapped per provider: Groq / OpenAI-compatible → `response_format: { type: "json_object" }`; Gemini → `generationConfig.responseMimeType: "application/json"`; Anthropic → no parameter (Claude follows JSON instructions natively without a wire-level flag).
6. WHEN JSON-mode is requested THEN the contract returned by the AI SHALL be a top-level JSON object, never a bare array (Groq/OpenAI JSON-mode guarantees object output only). Handlers that previously asked for `[{...}, {...}]` SHALL ask for `{ "files": [{...}, {...}] }` (or the analogous wrapper for their domain) and the corresponding parser SHALL unwrap the named field before validating the array.
7. WHEN the AI response fails to JSON-parse after JSON-mode was requested THEN the audit log entry SHALL include the parser error message, the byte offset, and a 160-character window of the raw text around the failure point — so the next debugging session does not have to re-run the request to see what the model emitted.

**Rationale (AC 5–7)**: Llama 3.3 70B (the free default per R6 AC 5) is inconsistent about escaping backslashes inside JSON string literals — code bodies with regex patterns like `\s`, `\d`, `\w` get emitted as bare backslashes, producing "Bad escaped character in JSON" errors at `implement` time (observed on 2026-05-15 with `implement 028/T001 --dry-run`). Groq's JSON-mode is a thin enforcement layer that constrains decoding to grammar-valid JSON and largely eliminates this failure mode at zero cost. The contract reshape (`{ files: [...] }` object instead of bare array) is the only price.

## Requirement 8 — AI Adapter Installation Matrix

**User Story**: As a developer using any of several AI tools, I want the kit to install its command set into the correct location for my tool so that the same lifecycle commands work from Claude Code, Blackbox AI, Cursor, or GitHub Copilot without manual glue.

**Acceptance Criteria**:
1. WHEN `init` runs THEN the system SHALL read `ai-settings.json` → `aiAdapters` and, for each selected adapter, write or update the adapter-specific settings file and copy (or symlink) the commands directory.
2. WHEN the Claude Code adapter is selected THEN the system SHALL merge the `mcpServers` block into `.claude/settings.json` and expose `_wxAI/commands/` under `.claude/commands/`.
3. WHEN the Cursor adapter is selected THEN the system SHALL write to `.cursor/mcp.json` and copy commands into `.cursor/rules/`.
4. WHEN the Blackbox AI adapter is selected THEN the system SHALL write to `_wxAI-global/settings.json` and expose commands under `_wxAI-global/commands/`.
5. WHEN the Copilot adapter is selected THEN the system SHALL append MCP server configuration to workspace settings and copy commands into `.github/`.
6. WHEN adapter installation fails for one adapter THEN the system SHALL continue with remaining adapters and report the failure without rolling back successful adapter installs.

## Requirement 9 — Kit Update Distribution with User Acceptance

> **Extended by Amendment A (2026-08-20)** — release notes across all three version lines, at the end of this document. Amendment A also records two corrections to the acceptance criteria below.

**User Story**: As a maintainer of multiple kit installs, I want updates distributed from GitHub with clear changelogs and per-install acceptance controls so that upgrades are safe, visible, and never forced.

**Acceptance Criteria**:
1. WHEN `scripts/kit-update.mjs` runs THEN it SHALL read `kitVersion` from `.wxkanban-project.json` and compare against the latest release metadata from the orchestrator repo.
2. WHEN a newer version is available THEN the system SHALL display a changelog summary including version delta, added or changed commands, behavioral impacts, and recommendation rationale.
3. WHEN the user accepts the update THEN the system SHALL apply it, re-run `setup-mcp.mjs` and `mcp-health-check.mjs`, and report post-update status.
4. WHEN the user rejects the update THEN the system SHALL keep the current version, record the rejection with timestamp, and SHALL NOT prompt again until a newer release is published.
5. WHEN the user defers the update THEN the system SHALL record a deferral state with optional maintenance-window metadata and SHALL escalate notifications on a 30 / 60 / 90 day schedule:
   - **30 days** after deferral: reminder notification, deferral may be renewed without friction.
   - **60 days** after deferral: warning notification with cumulative deferral age.
   - **90 days** after deferral: forced prompt that blocks further deferral unless the user passes `--force --reason "<text>"`, which is recorded as an audit override.
6. WHEN an update adds or changes a command THEN the changelog summary SHALL list those specific changes.

## Requirement 10 — Audit Trail for Every Orchestrator Action

**User Story**: As a compliance reviewer, I want every orchestrator action recorded in the wxKanban database so that lifecycle decisions, AI calls, policy denials, and overrides are fully traceable.

**Acceptance Criteria**:
1. WHEN any command is dispatched THEN the system SHALL emit a `project.capture_event` with command name, input digest, stage before/after, operator identity, and AI provider used (if any).
2. WHEN a policy denies or a user overrides a command THEN the system SHALL record the denial or override as a distinct audit event with severity.
3. WHEN an AI worker is invoked THEN the system SHALL record provider identity, token counts, latency, and fallback usage (if any).
4. WHEN an MCP tool is called through the orchestrator THEN the system SHALL record the tool name, argument digest, and result status.

## Requirement 11 — Install Verification Gate

**User Story**: As an installer, I want a single post-install command that proves the kit is fully operational so that I know the project is ready for use before I start working.

**Acceptance Criteria**:
1. WHEN post-install verification runs THEN the system SHALL confirm: (a) MCP server is up and healthy, (b) the wxKanban DB is reachable and the project row exists, (c) the policy engine loads its stage/command mapping, (d) at least one command (`buildscope --dry-run`) executes successfully end-to-end.
2. WHEN any verification step fails THEN the system SHALL surface a structured error pointing at the failing step and SHALL NOT mark the install complete.
3. WHEN verification succeeds THEN the system SHALL write an `install-verified-at` timestamp into `.wxkanban-project.json`.

## Requirement 12 — wxKanban as Consumer #0 (Phased Migration)

**User Story**: As the wxKanban maintainer, I want wxKanban itself to migrate onto the kit in phases so that the kit is proven on the reference project before any other project onboards.

**Acceptance Criteria**:
1. WHEN Phase A runs THEN the wxKanban repository SHALL install the kit alongside its existing server code, without removing or modifying existing functionality. The kit's `mcp-server/` runs as an additional process.
2. WHEN Phase B runs THEN wxKanban's existing spec and task creation flows SHALL be routed through the kit's command gateway in parallel with the legacy path. Outputs from both paths SHALL be compared, and any divergence SHALL be logged.
3. WHEN Phase C runs THEN the legacy path SHALL be cut over to the kit as the sole source of truth, and the legacy endpoints SHALL be removed from `src/server/`.
4. WHEN each phase completes THEN the phase transition SHALL be recorded in a wxKanban audit event and reflected in `specs/projectlifecycle.md`.
5. WHEN the migration encounters a blocking divergence in Phase B THEN Phase C SHALL be blocked until the divergence is resolved in the kit, not in wxKanban-specific patches.

## Requirement 13 — Multi-Project Onboarding

**User Story**: As a developer of a new project (e.g., `project-kit`), I want to install the orchestrator kit and have it fully operational against the shared wxKanban database so that my project benefits from lifecycle governance, audit trails, and AI-assisted commands without building its own infrastructure.

**Acceptance Criteria**:
1. WHEN a new consumer project runs `init` THEN it SHALL receive its own `projectid`, API token, and encrypted database URL — fully isolated from all other kit installs via row-level `projectid` scoping.
2. WHEN the new project's install verification passes (R11) THEN the project SHALL be able to execute any command permitted by its current lifecycle stage without modification to the kit source.
3. WHEN a consumer project's lifecycle stage advances THEN the stage transition SHALL be recorded in the shared wxKanban database and visible in that project's audit trail.
4. WHEN a consumer project requires project-specific command behavior THEN it SHALL extend the kit via custom command handlers in its own codebase, registered through `ai-settings.json` → `customCommands`, without forking the kit.
5. WHEN the kit is updated THEN all consumer projects SHALL be notified per R9 and SHALL be able to accept, reject, or defer the update independently.

## Requirement 14 — kitRoutes.ts Migration to GitHub Release Proxy

**User Story**: As a wxKanban maintainer, I want the `/api/kit/download` endpoint to fetch the latest orchestrator kit from the `wxKanban-agent-Orchestrator` GitHub release (instead of assembling files from `KitGenerationService`), so that the kit's source-of-truth is the orchestrator repo (Decision #13) and wxKanban no longer duplicates kit-assembly logic.

**Context**: Spec 019 Decision #13 locks the plan: *"Kit source-of-truth: GitHub orchestrator repo (K3b). KitGenerationService will be deleted. kitRoutes.ts /download becomes a thin endpoint that fetches the latest GitHub release tarball, injects per-project WXKANBAN_API_TOKEN (via ApiTokenService) and encrypted DB URL (via KitEncryptionService) server-side, and streams to the user."*

As of 2026-04-20, the orchestrator repo has been brought up to date (Phase A), the missing pieces have been added (Phase B), and `v0.1.0` is published as a GitHub release with `kit.tar.gz` (5.5 MB) and `kit.zip` (8.6 MB) artifacts (Phase C). This requirement captures Phase D: the wxKanban-side wiring to consume that release.

**Updated 2026-05-20** — R14's archive *delivery mechanism* (GitHub-release proxy, SHA-256 verify, streamed injection) is unchanged. R14's archive *contents* are updated to match the spec 028 hosted-MCP architecture: the kit zip no longer contains `mcp-server/`, and the per-project injection no longer includes an encrypted `DATABASE_URL`. The kit ships as a thin HTTPS client only; `WXKANBAN_API_TOKEN` + `WXKANBAN_MCP_BASE_URL` + `WXKANBAN_PROJECT_ID` are the per-project values injected. Triggered by BUG-20 follow-up.

**Acceptance Criteria**:

1. WHEN a consumer requests `GET /api/kit/download` THEN the endpoint SHALL fetch the latest `wxKanban-agent-Orchestrator` GitHub release (or a pinned version if `?version=v0.x.y` is supplied) and retrieve both the archive and its `.sha256` checksum file.

2. WHEN the archive is downloaded THEN the endpoint SHALL verify the SHA-256 against the sidecar checksum BEFORE any further processing. On mismatch it SHALL fail with HTTP 502 and log an audit event; no partial archive SHALL be streamed to the user.

3. WHEN the request includes `?platform=windows` OR the `User-Agent` indicates Windows AND no explicit `platform` query param is present THEN the endpoint SHALL serve `kit.zip`. Otherwise it SHALL default to `kit.tar.gz`.

4. WHEN serving the archive THEN the endpoint SHALL inject per-project files into the archive before streaming: (a) `.wxkanban-project.json` populated with the consumer's `projectid`, `createdAt`, `kitVersion`, `mcpBaseUrl` (default `https://mcp.wxperts.com`), and standard paths; (b) `ai-settings.json` populated via `ApiTokenService` (new `WXKANBAN_API_TOKEN`) with `WXKANBAN_MCP_BASE_URL`, `WXKANBAN_API_TOKEN`, and `WXKANBAN_PROJECT_ID` fields — **no `DATABASE_URL_ENCRYPTED` is injected; the kit carries no DB credentials in any form** (Decision #3); (c) `ProjectOverview.md` populated from `projectdocuments` (doctype `'ProjectOverview'`, fallback to `'overview'` for legacy AI-scaffolding naming, both scoped to `projectid` with `specid IS NULL`), overwriting the default template that ships in the kit tarball. If no row exists or the row is empty, the default template ships unchanged. DB lookup failures SHALL log a warning and fall through to the default template (never fail the download). Injection SHALL preserve archive type (re-tar for `.tar.gz`, re-zip for `.zip`). (Updated 2026-05-20 — removed encrypted DB URL from `ai-settings.json`; added `mcpBaseUrl` to project json. Triggered by BUG-20 follow-up.)

5. WHEN the endpoint returns a successful response THEN it SHALL emit a `project.capture_event` audit record (`type: 'kit_download'`) containing the consumer's projectId, the orchestrator release tag served, the archive format, and the response duration.

6. WHEN the endpoint runs during normal traffic for 7 consecutive days with zero divergence (no archive corruption, no injection failures) THEN `src/server/services/KitGenerationService.ts` AND `src/server/services/KitEncryptionService.ts` SHALL be deleted along with their route wiring and dead imports. `ApiTokenService` SHALL be retained — it issues the per-project `WXKANBAN_API_TOKEN` used by the hosted MCP. (Updated 2026-05-20 — added `KitEncryptionService` to the deletion list since `DATABASE_URL_ENCRYPTED` is retired; was "retained, used by injection step." Triggered by BUG-20 follow-up.)

7. WHEN wxKanban itself requests a kit download THEN it SHALL be able to re-install its own `wxkanban-agent/` (CLI + workers + adapters) from the served archive (Consumer #0 dogfood test). The downloaded kit SHALL contain no `mcp-server/` directory. This verifies the full round-trip before broader rollout. (Updated 2026-05-20 — removed `mcp-server/` from the dogfood payload; kit is client-only post-spec-028. Triggered by BUG-20 follow-up.)

8. WHEN the orchestrator release API is unreachable OR returns a 4xx/5xx THEN the endpoint SHALL fail with HTTP 503 and a clear error message; it SHALL NOT fall back to the old `KitGenerationService` path.

**Implementation Contract**:

**HTTP surface** — `GET /api/kit/download`:

| Query Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `version` | string (e.g., `v0.1.0`) | `latest` | Pinned orchestrator release tag |
| `platform` | `unix` \| `windows` | derived from User-Agent, fallback `unix` | Selects `.tar.gz` vs `.zip` |

| Response Header | Value |
| --- | --- |
| `Content-Type` | `application/gzip` OR `application/zip` |
| `Content-Disposition` | `attachment; filename=wxkanban-kit-{projectId}-{version}.{ext}` |
| `X-Kit-Version` | served orchestrator release tag |
| `X-Kit-Sha256` | SHA-256 of the archive AS SERVED (post-injection) |

**Server-side flow (one handler, no background job):**

1. `resolveRelease(version)` — GitHub API call to `/repos/Cowboy-59/wxKanban-agent-Orchestrator/releases/latest` or `/releases/tags/:tag`. Return the asset URLs for `{kit.tar.gz, kit.tar.gz.sha256, kit.zip, kit.zip.sha256}`.
2. `fetchAndVerify(archiveUrl, checksumUrl)` — stream the archive into a temp path; fetch checksum; compute SHA-256 of the archive; compare; delete temp + throw HTTP 502 on mismatch.
3. `injectPerProjectFiles(archivePath, projectId, format)` — extract archive to temp dir; call `ApiTokenService.generateToken(projectId)` → produces `WXKANBAN_API_TOKEN`; render `.wxkanban-project.json` + `ai-settings.json` with `WXKANBAN_API_TOKEN`, `WXKANBAN_MCP_BASE_URL` (default `https://mcp.wxperts.com`, overridable via server env), `WXKANBAN_PROJECT_ID`, projectId, createdAt (ISO), kitVersion; query `projectdocuments` for the project's `ProjectOverview` content (mirrors `KitGenerationService.resolveProjectOverviewContent`) and overwrite `ProjectOverview.md` if the row exists and is non-empty; write all three into the extract dir; re-archive (tar-gz or zip matching the original format); compute final SHA-256 for `X-Kit-Sha256` header. (Updated 2026-05-20 — removed `KitEncryptionService.encryptDatabaseUrl(...)` call and the encrypted-blob field; injection now carries no DB credentials. Triggered by BUG-20 follow-up.)
4. `streamResponse(archivePath, res)` — stream the re-packaged archive to the client; delete temp dir in `finally`.
5. `recordAudit(...)` — emit `project.capture_event` with `type: 'kit_download'`, metadata `{ release, platform, shaServed, durationMs, userAgent }`.

**Caching** — on-disk LRU keyed by `(releaseTag, platform)` with 1-hour TTL for the VERIFIED archive (pre-injection). Skip cache when `version=latest` is within 60 seconds of the previous `latest` lookup AND the resolved tag hasn't changed. Injection ALWAYS runs per-request (per-project secrets must not be cached).

**Dependencies** — use `node-fetch` / native `fetch` for GitHub API (no new SDK); use `tar` npm package for `.tar.gz` handling; use `adm-zip` or `yauzl` for `.zip` handling. Prefer tools already in wxKanban's `package.json`; add only if absent.

**DB schema** — `projectkits` and `projectkitfiles` tables become obsolete after the 7-day bake. Drop in a follow-up migration AFTER `KitGenerationService.ts` is deleted. Do not drop in the same PR; bake period requires them for rollback.

**Feature flag** — guard the new handler behind `KIT_DOWNLOAD_SOURCE` env var: `orchestrator` (new path, default in staging) OR `legacy` (current `KitGenerationService` path). Enables instant rollback without a deploy during the 7-day bake. Flag is removed alongside `KitGenerationService.ts` deletion.

**Error mapping**:

- Release not found (404 from GitHub API) → `HTTP 404 — orchestrator release {tag} not found`
- GitHub API unreachable → `HTTP 503 — kit source unavailable, retry`
- Checksum mismatch → `HTTP 502 — kit integrity check failed`
- Injection failure → `HTTP 500 — kit personalization failed`; audit event with stack.

**Out of Scope**:

- **Client-side install stubs** — no separate `install.sh` or `install.ps1` consumer-side scripts. The download endpoint returns a ready-to-extract archive; consumers extract with their native tools. (Revisit if onboarding feedback demands a helper.)
- **Multi-region caching / CDN** — single-region on-disk LRU only. If wxKanban goes multi-region, replace with S3 or similar.
- **Signed archive verification beyond SHA-256** — no GPG / Sigstore signing of the archive. SHA-256 against the GitHub-published sidecar is the integrity boundary. (Tracked for a future R15 if supply-chain requirements escalate.)
- **Per-release changelogs / update notifications** — handled by R9 (Kit Update Distribution). R14 only covers the download path.
- **Migration of existing kit installs** — projects already provisioned from `KitGenerationService` do not get re-downloaded automatically. They continue to function; they pick up the new path only if they re-download.
- **Rollback of the v0.1.0 orchestrator release** — the orchestrator repo's release process is governed by spec 019 R9, not this requirement.

**Risks**:

1. **GitHub Release API rate limits.** Unauthenticated GitHub API is 60 requests/hour per IP; authenticated is 5000/hour. Mitigation: use a GitHub App token (`GITHUB_KIT_TOKEN` env var) for release-API calls; cache verified archives for 1 hour to absorb bursts. Monitor 429 responses in audit log.
2. **Archive size growth over time.** Current v0.1.0: 5.5 MB (tar) / 8.6 MB (zip) including bundled `node_modules`. If the kit grows past ~100 MB, streaming + injection latency becomes user-visible. Mitigation: reassess bundling strategy (e.g., split runtime deps) if any release exceeds 50 MB.
3. **SHA-256 sidecar tampering.** If an attacker modifies both the archive AND the `.sha256` in the release, the verification step passes false-positive. Mitigation: rely on GitHub release integrity (HTTPS + release-asset ACLs). Flagged as out-of-scope above (supply-chain signing) — accept the risk for now.
4. **Legacy code deletion bakes too long.** If the 7-day bake passes but an edge case surfaces on day 8, we'd want `KitGenerationService.ts` back. Mitigation: deletion goes through a PR with full review; the code remains recoverable from git history; the feature flag `KIT_DOWNLOAD_SOURCE=legacy` is NOT deleted until the service itself is deleted.
5. **Injection writes the per-project `WXKANBAN_API_TOKEN` into a user-delivered archive.** If an archive is accidentally cached or logged with the injected token, the token leaks and a hostile party could impersonate the project against the hosted MCP. Mitigation: (a) inject ONLY during the streaming response, never persist the injected archive to disk beyond the temp dir cleaned up in `finally`; (b) NEVER cache post-injection archives; (c) redact `X-Kit-Sha256` and any `Authorization: Bearer` headers in any logs that include response bodies; (d) revoke + rotate any token whose archive may have been logged via the spec 028 FR-009 token-revocation surface. (Updated 2026-05-20 — removed `encrypted DATABASE_URL` from the leak scenario since it no longer ships; added FR-009 rotation pointer as the recovery action. Triggered by BUG-20 follow-up.)
6. **Platform detection misfires.** User-Agent sniffing can be wrong (curl on Windows sends a Windows UA; a WSL shell might send a Linux UA). Mitigation: (a) `?platform=` query param is authoritative; (b) UA is only a fallback; (c) both formats are functionally equivalent — a misfire produces a zip that a Mac user has to `unzip` instead of `tar`, not a broken archive.

## Requirement 15 — BuildScope CLI → MCP wiring

**User Story**: As a developer running `wxkanban-agent buildscope …` inside an installed kit, I want the CLI to actually create a scope file under `specs/Project-Scope/`, not echo a stub. Today the CLI-wired handler (`wxkanban-agent/workers/ai/buildscope-worker.ts`) is a placeholder that returns default field values and writes nothing; the canonical implementation at `mcp-server` (`project.buildscope` → `buildScope()` in `project-kit`) is unreachable from the CLI.

**Context**: The legacy path calls `BuildScopeWorker.generateScopeDraft` which literally documents itself as "In real use, call AI service and validate with Zod" and returns `{title: 'Untitled Feature', objectives: ['Objective 1'], ...}`. Meanwhile `project.buildscope` is fully implemented, stage-gated to Design, role-gated to editor/admin, registered in `_wxAI/commands/buildscope.md` as the canonical source-of-truth path, and already produces a real `specs/Project-Scope/NNN-<shortName>.md` file via `buildScope()`.

Surfaced from a real install attempt on the JobScheduler project — running `wxkanban-agent buildscope --feature-description "…"` appeared to succeed but wrote no spec file.

**Acceptance Criteria**:

1. WHEN the CLI dispatches the `buildscope` command THEN `BuildScopeWorker.generateScopeDraft` SHALL POST to `${MCP_HTTP_URL}/call` (default `http://localhost:3002`) with `tool: 'project.buildscope'` and map CLI flags into the MCP tool's `BuildScopeInput` schema.
2. WHEN a CLI flag uses kebab-case (`--feature-description`) THEN it SHALL be converted to the matching camelCase field (`featureDescription`) before being sent to MCP.
3. WHEN neither `--feature-description` nor `--featureDescription` is provided but `--title` is, the worker MAY fall back to title as the feature description — accommodating the older flag name without changing schema.
4. WHEN the MCP call succeeds THEN the worker SHALL return a `ScopeDraft`-shaped object summarizing the created spec (`shortName` → `title`, `specNumber` surfaced in `notes`, `businessProblem` preserved) so that the existing `WorkflowEngine.runBuildScope` return contract holds.
5. WHEN the MCP call fails (non-2xx, malformed payload, or `success: false`) THEN the worker SHALL throw with the MCP error. It SHALL NOT fall back to the legacy stub defaults — silent success with garbage content is worse than visible failure.
6. WHEN `MCP_HTTP_URL` is not reachable THEN the thrown error SHALL include the URL and a hint pointing at `scripts/setup-mcp.mjs` / `scripts/init.mjs`.
7. Existing unit tests that mock `BuildScopeWorker.generateScopeDraft` at the class level (workflow-engine, mcp-adapter test suites) MUST continue to pass without modification — the mock boundary is unchanged.

**Out of scope**:

- Rewriting the dead interactive handler at `core/orchestrator/command-handlers/buildscope.ts`. It can be deleted in a follow-up once R15 is stable; until then it stays as reference for the shape of a fully guided CLI flow.
- Wiring `createspecs`, `implement`, `runqa`, and other still-stub CLI handlers. Each gets its own FR when addressed — this requirement covers `buildscope` only.
- Adding stage-advance to the CLI (the gap flagged in R14's status). Tracked separately.

## Requirement 16 — MCP lifecycle safety (project-identity verification + honest startup)

> ⚠️ **DEPRECATED 2026-05-20 — superseded by spec 028.** R16's premise (PID-file hygiene + project-identity verification for a *local* MCP server running on the consumer's machine) is moot once the kit ships no `mcp-server/` (Decision #1). The historical text below is retained for anyone debugging a pre-v1.1.0 kit install. New kit work SHALL NOT extend R16; route MCP-lifecycle concerns through spec 028 (hosted MCP) or, for the v1.1.0 cutover cleanup, through R15 AC#5 (legacy-mcp-server removal during `upgrade-kit.mjs`). Triggered by BUG-20 follow-up.

**User Story**: As a developer running multiple kit-installed projects from the same workstation, I need `init.mjs` and `setup-mcp.mjs` to refuse to silently adopt an MCP server that belongs to a different project, refuse to report success when the child process never actually bound the port, and launch the transport declared in `.wxkanban-project.json` rather than a hardcoded default. Otherwise scope numbers, task lookups, and audit events leak between projects with no visible signal.

**Source**: Bug report filed 2026-04-20 by andy@wxperts.com — `specs/019-agent-orchestrator-kit/bug-reports/2026-04-20-mcp-startup-cross-project-binding.md`. Reproduced end-to-end: a MCP process started the previous day for `projectId=ba924193…` ("wxKanban Development", 24 scopes) was silently adopted by `init.mjs` in a fresh project `c9ee6375…` ("Job Scheduler", 0 scopes). First `buildscope` call returned `specNumber: "025"` — correct for the bound project, catastrophically wrong for the one the developer was in.

Three distinct bugs, fixed together as one coherent "MCP lifecycle safety" FR because any one fix alone still leaves a gap.

**Acceptance Criteria**:

1. WHEN either `scripts/init.mjs` OR `scripts/setup-mcp.mjs` detects an MCP process already listening on port 3002 via its PID file THEN it SHALL POST `{tool: 'project.mcp_health', args: {}}` to `http://localhost:3002/call` and parse `projectContext.projectId` from the response. Both entry points enforce this check so running `setup-mcp.mjs` directly (outside `init.mjs`) remains safe.
2. WHEN the running MCP's `projectContext.projectId` does NOT equal the local `.env`'s `WXKANBAN_PROJECT_ID` THEN the detecting script SHALL log the mismatch (both IDs), kill the stale PID, remove `.mcp-server.pid`, and restart MCP with the correct environment. It SHALL NOT silently adopt a foreign-project server.
3. WHEN `.wxkanban-project.json` declares `"mcpServer": "<path>"` THEN `scripts/setup-mcp.mjs` SHALL launch THAT entrypoint. WHEN the field is missing or the declared file does not exist THEN it SHALL default to `mcp-server/dist/index-http.js` and fail loud if that file is also absent. The stdio entrypoint `dist/index.js` was removed in kit v0.3.2 (see Requirement 17); fallback to it is no longer permitted.
4. WHEN `setup-mcp.mjs` spawns the MCP child process THEN it SHALL poll `GET http://localhost:3002/health` (up to ~15s with ~1.5s backoff) before writing `.mcp-server.pid` and printing a success message. On timeout it SHALL tail the last N lines of `logs/mcp-server.log` to stderr and exit non-zero without writing the PID file.
5. WHEN any of the three verification steps (project-identity check, transport-aware entrypoint, port-bind verification) fails at startup THEN the failure SHALL be visible in the CLI output — not buried in `logs/mcp-server.log`.
6. WHEN R16 is implemented THEN the verification flow in the bug report's "Suggested Verification After Fix" section MUST pass:
   - Start MCP in project A, confirm health reports A's id.
   - Run `init.mjs` in project B.
   - Expected: mismatch detected, A's MCP killed, B's MCP started on HTTP transport, healthy.
   - `buildscope` in B returns `specNumber: "001"`.
   - `mcp_health.projectContext.projectId` equals B's id.

**Out of scope**:

- Multi-project simultaneous MCP instances (running A and B concurrently on different ports). Workstation design is still "one MCP per machine at a time." Per-project port allocation would be a larger architectural change — tracked separately if consumer demand emerges.
- Preventing a user from manually starting a foreign-project MCP (e.g., via `node mcp-server/dist/index-http.js` directly). R16 only protects the `init.mjs` / `setup-mcp.mjs` entry points — hand-edits remain the user's responsibility.
- Fixing `mcp-server/dist` naming if multiple transports ship. The spec treats `index-http.js` vs `index.js` as config, not as a code rename.

**Rollback / workaround** (if R16 ever needs to be backed out):

1. `powershell Stop-Process -Id $(netstat -ano | grep :3002 | awk '{print $5}') -Force`
2. `rm .mcp-server.pid`
3. `set -a; source .env; set +a`
4. `nohup node mcp-server/dist/index-http.js >> logs/mcp-server.log 2>&1 &`

Reproduced from the bug report's "Workarounds Until Fixed" section.

## Requirement 17 — Stdio transport removal (HTTP-only kit runtime)

**User Story**: As a kit author, I need a single MCP transport (HTTP) so that the runtime contract, IaC, parent-watcher, and health probes are unambiguous. The legacy stdio entrypoint duplicates startup logic, ships an obsolete `npm start` script that launches the wrong server, and creates a documented "fallback" path (R16 AC#3) that nothing reaches in current deployments.

**Source**: Dead-code analysis 2026-05-15 — kit's `repo-config.ts`, gateway runtime, all hosted-MCP IaC (spec 028), and every kit test target `mcp-server/dist/index-http.js`. Stdio is referenced only by orphaned scripts (`start-with-env.mjs`, `test-help.mjs`), an out-of-date README example, and spec 011's NewProject AI-settings template.

**Updated 2026-05-20** — R17's directive (HTTP-only MCP, stdio retired) is unchanged. R17's *scope* narrows: post-spec-028, the MCP server runs only on wxKanban-operated infrastructure (`mcp.wxperts.com`, App Runner). The kit no longer ships `mcp-server/`, so several R17 ACs that referenced consumer-shipped kit files (`scripts/setup-mcp.mjs`, the `MCP_HTTP_PORT` env block, the `mcp-server/README.md` migration note) are now obsolete or absorbed into spec 028. The hosted MCP source tree (still in this repo under `mcp-server/`) keeps the HTTP-only invariant. Triggered by BUG-20 follow-up.

**Acceptance Criteria**:

1. The hosted MCP service SHALL run a single entrypoint: `mcp-server/src/index-http.ts` → `mcp-server/dist/index-http.js`. The kit SHALL ship no MCP server at all (Decision #1). (Updated 2026-05-20 — was "kit ships single entrypoint"; now "hosted service runs single entrypoint, kit ships none." Triggered by BUG-20 follow-up.)
2. `mcp-server/src/index.ts`, `mcp-server/start-with-env.mjs`, `mcp-server/test-help.mjs`, and `mcp-server/src/config.ts.backup` SHALL be deleted.
3. `mcp-server/package.json` `start` and `dev` scripts SHALL point at the HTTP entrypoint; `start:http` / `dev:http` aliases MAY be removed or kept as compatibility aliases.
4. `ServerConfig.transport` SHALL be either removed or narrowed to the literal `'http'`. The `TRANSPORT` env var SHALL be ignored if read.
5. `src/server/routes/kitSetupRoutes.ts`, `_wxAI/commands/sync-starter-kit.md`, `_wxAI/commands/wxAI-project-init.md`, `mcp-server/README.md`, and `tests/test-mcp-changes.test.ts` SHALL be updated to reference the HTTP entrypoint exclusively. (`scripts/setup-mcp.mjs` and `src/server/services/KitGenerationService.ts` are removed from this list — both are being deleted per R14 AC#6 and R16 DEPRECATED status; no point updating files that are going away.) (Updated 2026-05-20 — pruned the file list. Triggered by BUG-20 follow-up.)
6. Spec 011 NewProject (AI Settings template) SHALL be amended to target the hosted MCP at `https://mcp.wxperts.com` (or the consumer's `WXKANBAN_MCP_BASE_URL` override) with a `WXKANBAN_API_TOKEN` + `WXKANBAN_PROJECT_ID` env block. The previously-proposed `MCP_HTTP_PORT` + `API_KEY` block is obsolete (no local MCP to address); the previously-replaced `DATABASE_URL` plaintext block is doubly obsolete. (Updated 2026-05-20 — pointed the template at the hosted endpoint. Triggered by BUG-20 follow-up.)
7. Existing Claude Desktop / local-stdio users SHALL be given a migration note in the kit's onboarding docs (`wxkanban-agent/docs/hosted-mcp-migration.md` already exists for this purpose) pointing to the hosted MCP configuration steps (spec 028 `kit:configure` flow). `mcp-server/README.md` ceases to be a user-facing document — it now documents the hosted service, not a local install. (Updated 2026-05-20 — moved the migration note out of `mcp-server/README.md` since that file no longer ships to consumers. Triggered by BUG-20 follow-up.)

**Out of scope**:

- Hosted MCP deployment/auth/scoping details (spec 028 owns those — R17 only locks the HTTP-only transport invariant that spec 028 inherits).
- Re-introducing stdio for a future "local-only" mode — would be a new spec.
- Re-introducing a consumer-shipped MCP for air-gapped customers — explicitly out of scope per spec 028 §"hosted-only by design".

## Requirement 18 — MCP port lifecycle (auto-allocation + collision recovery + URL sync)

> ⚠️ **DEPRECATED 2026-05-20 — superseded by spec 028.** R18's premise (auto-allocate a local TCP port for an MCP server running on the consumer's machine, recover from EADDRINUSE, keep `.wxkanban-project.json mcpHttpUrl` in sync) is moot once the kit ships no `mcp-server/` (Decision #1) — there is no consumer-side port to allocate. The kit's `mcpBaseUrl` is now a fixed HTTPS URL (`https://mcp.wxperts.com`, overridable for dev). The historical text below is retained for anyone debugging a pre-v1.1.0 kit install. New kit work SHALL NOT extend R18. Triggered by BUG-20 follow-up.

**User Story**: As a developer running multiple kit-installed projects on one workstation, I need the kit to pick a free MCP port automatically at init, auto-shift on collision at startup, and keep `.wxkanban-project.json mcpHttpUrl` in sync with the actually-bound port — so I never have to debug port conflicts or stale URLs by hand.

**Source**: Bug report `E:\AI_Development\Tci\TCI-ExpenseManager\BugReport.md` (2026-05-14), Bugs 2/3/4. Confirmed reproduction: YappChat held `:3002`, TCI-ExpenseManager's MCP silently failed to start; later collision with command-gateway on `:3003` produced a silent-exit failure mode; `.wxkanban-project.json mcpHttpUrl` stayed at `:3002` even after `.env` was changed.

**Acceptance Criteria**:

1. **Init-time allocation**: The kit's project initializer SHALL allocate `MCP_HTTP_PORT` by trying `3002` first; on EADDRINUSE, scanning `3003..3099` for the first free port (via `net.createServer().listen(port)`); then writing the chosen port to `.env` as `MCP_HTTP_PORT` AND to `.wxkanban-project.json` as `"mcpHttpUrl": "http://localhost:<port>"`.
2. **Pre-flight bind in setup-mcp.mjs**: Before spawning the MCP child, `scripts/setup-mcp.mjs` SHALL attempt to bind the configured port via `net.createServer().listen(port)`. On EADDRINUSE it SHALL: (a) run the R16 identity probe — if the foreign listener IS this project's own MCP, adopt it; (b) otherwise, scan `3003..3099` for the next free port, rewrite `.env` `MCP_HTTP_PORT` and `.wxkanban-project.json` `mcpHttpUrl` to the new port, log the shift with both old and new values, and spawn against the new port.
3. **mcpHttpUrl auto-sync**: On every successful MCP startup, `scripts/setup-mcp.mjs` SHALL verify that `.wxkanban-project.json mcpHttpUrl` matches `MCP_HTTP_PORT` and rewrite it if drifted. The actually-bound port is the source of truth; the json field is derived.
4. **No hardcoded :3002 in errors**: All user-facing error messages SHALL interpolate the configured `MCP_HTTP_PORT` rather than hardcode `:3002`.

**Out of scope**:

- Multi-instance-per-project MCP (still one MCP per project at a time — R16 invariant).
- Ports outside the `30xx` range.
- Notifying already-running AI clients of a port shift (Claude Desktop etc. need a restart to pick up new MCP endpoints).

**Verification** (mirrors TCI-ExpenseManager bug repro):

1. Start a foreign MCP on `:3002` from another project.
2. Run kit init in a fresh project — expected: init writes `MCP_HTTP_PORT=3003` (or first free) to `.env`, `mcpHttpUrl=http://localhost:3003` to `.wxkanban-project.json`.
3. Manually edit `.env` to a taken port; run `setup-mcp.mjs` — expected: detects collision, auto-shifts, both files updated, MCP starts on new port.
4. Manually edit `.wxkanban-project.json mcpHttpUrl` to a stale value; run `setup-mcp.mjs` — expected: file rewritten to match `MCP_HTTP_PORT` on successful start.

## Architecture

```
Consumer Project (any stack)
  ├── wxkanban-agent/              (kit — orchestrator runtime; HTTPS client only)
  │     ├── apps/command-gateway/  (cli.ts, http.ts — entry points)
  │     ├── core/
  │     │     ├── context/         (project-context.ts)
  │     │     ├── policy/          (command-policy.ts — stage gates)
  │     │     ├── orchestrator/    (workflow-engine.ts, command-handlers/)
  │     │     └── schemas/         (Zod: commands.ts, artifacts.ts, lifecycle.ts)
  │     ├── workers/ai/            (ai-client.ts with primary+fallback)
  │     ├── adapters/mcp/          (HTTPS client wrappers; targets mcp.wxperts.com)
  │     └── services/lifecycle-api/
  ├── _wxAI/                       (kit — commands, rules, scripts)
  ├── scripts/                     (init.mjs, upgrade-kit.mjs, check-kit-version.mjs)
  ├── ai-settings.json             (kit — adapter matrix + WXKANBAN_MCP_BASE_URL + token)
  └── .wxkanban-project.json       (per-install: projectid, kitVersion, mcpBaseUrl)

        │  HTTPS (Authorization: Bearer WXKANBAN_API_TOKEN,
        │         X-WxKanban-Project-Id: WXKANBAN_PROJECT_ID)
        ▼
  https://mcp.wxperts.com              (spec 028 — hosted MCP service)
        │  • token → (customerId, projectId)
        │  • project-scoped reads/writes only
        ▼
  Shared wxKanban Database (central, behind wxKanban's network boundary)

No consumer-side mcp-server/, no consumer-side Postgres connection.
(Updated 2026-05-20 — removed local mcp-server/; added hosted MCP boundary. Triggered by BUG-20 follow-up.)
```

Command flow:

```
AI agent / CLI / IDE
  → Command Gateway (cli.ts / http.ts)        [consumer machine]
    → ProjectContext resolver
    → CommandPolicyEngine (stage gate)
    → WorkflowEngine
      → AI Worker (primary → fallback → Zod validate)
      → MCP Tool Call via HTTPS               [consumer → hosted]
          POST https://mcp.wxperts.com/call
          Authorization: Bearer ${WXKANBAN_API_TOKEN}
          X-WxKanban-Project-Id: ${WXKANBAN_PROJECT_ID}
          ─────────── network boundary ───────────
        → Token + project-scope enforcement   [hosted MCP]
        → projectid-scoped DB read/write       [hosted MCP → wxKanban DB]
        → Audit row in mcprequestaudit         [hosted MCP, spec 028 FR-010]
      → Lifecycle Transition (also via HTTPS MCP tool call)
      → Audit Event project.capture_event (also via HTTPS MCP tool call)
  → Structured CommandResult                  [consumer receives JSON]
```

## Requirement 15 — Kit Upgrade (preserve-mode)

**User Story**: As a consumer-project owner with a kit already installed, I want a single command (and a VSCode notice when one is available) to upgrade my kit to a newer version without touching my project credentials, my customized template files, or my running services' identity.

**Background**: The initial-install path (R14 `/api/projects/:id/kit/download`) injects fresh per-project credentials and ships customizable templates — correct for a first install, wrong for an upgrade. R15 introduces a parallel preserve-mode path so subsequent kit version bumps do not silently rotate credentials or trample consumer-customized template files.

**Updated 2026-05-20** — R15's upgrade-mode envelope (strip per-project files, strip customizable templates, preserve credentials) is unchanged. R15's *included* kit contents change to match spec 028: upgrade archives no longer contain `mcp-server/`. The v1.1.0 release is the cutover — `scripts/upgrade-kit.mjs` gains a one-time "strip legacy local MCP" step when upgrading from a pre-v1.1.0 kit, so consumer projects don't end up with a stale `mcp-server/` directory after the upgrade. Triggered by BUG-20 follow-up.

**Acceptance Criteria**:

1. WHEN a consumer requests `GET /api/projects/:id/kit/upgrade?platform=unix|windows[&version=vX.Y.Z]` THEN the server SHALL refuse with HTTP 409 if no prior `projectkits` row exists for the project (initial-install path is the right surface for that case).
2. WHEN the upgrade endpoint succeeds THEN the returned archive SHALL exclude per-project files (`.wxkanban-project.json`, `ai-settings.json`, `.env`) and customizable templates (`CLAUDE.md`, `AI.md`, `ProjectOverview.md`, `README.md`). The archive SHALL include all other kit-internal directories (`bin/`, `wxkanban-agent/`, `_wxAI/`, `scripts/`, `.vscode/`, `package.json`, `package-lock.json`). The archive SHALL NOT include `mcp-server/` — the kit is a client-only payload from v1.1.0 forward (Decision #1, spec 028). (Updated 2026-05-20 — removed `mcp-server/` from the include list. Triggered by BUG-20 follow-up.)
3. WHEN the upgrade archive is served THEN response headers SHALL include `X-Kit-Mode: upgrade`, `X-Kit-Version: <toVersion>`, `X-Kit-FromVersion: <consumer's current version>`, `X-Kit-Sha256: <sha>`.
4. WHEN an upgrade is served THEN the server SHALL emit an audit event via `project.capture_event` with `event: 'kit_upgrade'`, `fromVersion`, `toVersion`, `bytes`, `durationMs`. SHA-256 SHALL NOT be logged.
5. WHEN a consumer runs `node scripts/upgrade-kit.mjs [version]` (shipped in the kit from R15 onward) THEN the script SHALL: read current version from `.wxkanban-project.json`; stop the local MCP server + orchestrator gateway via PID files if present (legacy from pre-v1.1.0 kits); **if upgrading from a pre-v1.1.0 kit, remove the local `mcp-server/` directory, `scripts/setup-mcp.mjs`, `scripts/mcp-health-check.mjs`, and `.mcp-server.pid` after stopping the process — these no longer belong on the consumer**; download the upgrade archive from `/api/projects/:id/kit/upgrade`; verify SHA-256 against the response header and refuse to extract on mismatch; extract in place; update the `version`, `kitVersion`, and `mcpBaseUrl` (default `https://mcp.wxperts.com` if absent) fields in `.wxkanban-project.json` (preserve `projectId`, `createdAt`, all other fields); re-run `scripts/init.mjs`; print a final summary including from-version → to-version, file count changed, file count removed (legacy cleanup), and the location of the previous kit code if rollback is needed. (Updated 2026-05-20 — added the legacy-mcp-server cleanup step for the v1.1.0 cutover; added `mcpBaseUrl` to the preserved/upgraded fields. Triggered by BUG-20 follow-up.)
6. WHEN `scripts/upgrade-kit.mjs` cannot reach wxKanban THEN it SHALL fall back to direct GitHub release download (mirroring `init.mjs`'s download path) BUT print a warning that no audit event was recorded server-side.
7. WHEN a VSCode workspace containing `.wxkanban-project.json` is opened THEN `.vscode/tasks.json` SHALL run `node scripts/check-kit-version.mjs` as a `folderOpen` task with `"reveal": "always", "focus": false`. The script SHALL: read current version from `.wxkanban-project.json`; query `GET /api/projects/:id/kit/latest-version`; print a single-line up-to-date notice and exit 0 if current ≥ latest; print a clearly-bordered multi-line notice (current version, available version, release notes URL, exact upgrade command) and exit 0 if an upgrade is available. The check SHALL NOT block workspace open.
8. WHEN a consumer requests `GET /api/projects/:id/kit/latest-version` THEN the server SHALL return JSON `{ "currentVersion": "<from projectkits>", "latestVersion": "<resolved from GitHub latest, cached 60s>", "upgradeAvailable": <bool>, "releaseUrl": "<github release page>", "publishedAt": "<ISO8601>" }`. This endpoint SHALL be cheap (no archive fetch, no decryption) and safe to call on every workspace open.
9. WHEN the upgrade endpoint resolves a target version older than the consumer's current version THEN the server SHALL refuse with HTTP 409 unless `?allowDowngrade=true` is passed. Downgrade flow remains otherwise identical to upgrade.
10. WHEN tests are written for R15 THEN the suite SHALL cover: refuse-without-prior-install, customizable-template-strip, per-project-file-strip, response-header presence, audit emission, upgrade-script SHA verify, version-check up-to-date / upgrade-available, downgrade refusal.
11. WHEN `GET /api/projects/:id/kit/upgrade` or `GET /api/projects/:id/kit/latest-version` is called THEN the server SHALL accept either (a) a JWT in the `Authorization: Bearer` header or session cookie (browser-driven path, same as the rest of the API), OR (b) the consumer's `WXKANBAN_API_TOKEN` value in the `Authorization: Bearer` header (headless-script path, the token already in the kit's `.env`). When an API token is used:
    - (a) it SHALL be looked up via `apiTokenService.validateToken` and rejected with HTTP 401 if missing or revoked,
    - (b) if the token row has a non-null `projectid`, the URL `:id` MUST equal that `projectid` — otherwise reject with HTTP 403 ("API token is scoped to a different project") so a token issued for project A cannot reach project B's endpoints,
    - (c) `req.userid` / `req.companyid` SHALL come from the token row, `req.usertype` SHALL be hydrated from the `userprofiles` table so downstream `canManageProjectKit` works unchanged.
    The `/api/projects/:id/kit/download` endpoint SHALL remain JWT-only because it issues a fresh API token in its response, which would be a footgun if the request itself authenticated with an API token.

**Out of Scope (R15.x candidates)**:

- wxKanban UI "Upgrade kit" button on the project page (CLI is sufficient for v1; UI is additive)
- Smart-merge of customizable templates that the consumer hasn't edited (always-strip is simpler and safer)
- Compatibility metadata in the version-check response ("requires re-init due to schema change")
- Auto-upgrade on workspace open (always opt-in via the printed command — never silent)

**Implementation notes**:

- Server: extend `KitProxyService` with `serveUpgrade(res, opts)` that shares `resolveRelease`/`fetchAndVerify` with `serve()` but routes to a new `stripForUpgrade(workDir)` step instead of `writePerProjectFiles`. New `latestVersion(opts)` method shares the GitHub `latest` resolve cache (`LATEST_RESOLVE_TTL_MS`).
- Routes: add `GET /api/projects/:id/kit/upgrade` and `GET /api/projects/:id/kit/latest-version` in `kitRoutes.ts`. Both gated by the existing `projectAccess` middleware.
- Consumer scripts: `scripts/upgrade-kit.mjs` and `scripts/check-kit-version.mjs` ship in the kit from the next orchestrator release after R15 lands. `.vscode/tasks.json` template gains the third `folderOpen` task.
- Bootstrap: consumers on pre-R15 kits (e.g. v0.1.8, v0.1.9) require a one-time manual upgrade to the first R15-shipping kit (e.g. v0.1.10) via direct GitHub download + extract. From v0.1.10 onward, all upgrades use `upgrade-kit.mjs`.
- KitGenerationService legacy path: out of scope — R15 only ships through KitProxyService (R14 Phase D path).

## Scope Boundary

### In Scope

- Kit bootstrap, registration, and verification flow
- **Consumer-side HTTPS client contract against the hosted MCP** (`mcp.wxperts.com`) — request shape, auth headers, error handling, tool surface (R3)
- Command gateway (CLI + HTTP) and workflow engine
- 6-phase lifecycle (Design → Implementation → QA Testing → Human Testing → Beta → Release)
- Stage-gated lifecycle policy engine with cross-cutting command support
- AI routing with primary + fallback providers
- Zod-validated structured outputs (`CommandResult<TArtifact>` + `AuditRecord`)
- AI adapter installation matrix (Claude Code, Blackbox AI, Cursor, Copilot)
- Kit update distribution with accept/reject/defer
- Kit upgrade (preserve-mode) for installed consumer projects with VSCode-on-folder-open version notice (R15)
- Audit trail via `project.capture_event` (sent to hosted MCP over HTTPS)
- wxKanban-as-Consumer-#0 phased migration
- Multi-project onboarding (project-kit and beyond) with row-level isolation enforced server-side
- Custom command handler extension point for consumer projects

### Out of Scope

- New AI provider implementations beyond what currently exists in `workers/ai/`
- Additional MCP transports (stdio, WebSocket) beyond HTTPS — R17 invariant
- wxKanban database schema changes beyond what kit registration requires
- Publishing the kit as an npm package (deferred; Phase 2 bootstrap CLI may or may not live on npm)
- Cross-project drift logging and parity CI gates (obsolete under single-tree model)
- **Consumer-side MCP server** — the kit no longer ships `mcp-server/`. Retired 2026-05-20 per spec 028.
- **Consumer-side Postgres connection** — direct DB access from the kit is forbidden. All DB access is mediated by the hosted MCP. Retired 2026-05-20 per Decision #2 + spec 028.
- **Hosted MCP deployment, auth middleware, token issuance/rotation, project-scope enforcement, and per-request audit logging** — owned by spec 028 FR-001 through FR-010. R3 only defines the *client* side of that contract.
- **Encrypted-DATABASE_URL kit distribution** — retired 2026-05-20 per Decision #3.
- **Air-gapped customers / self-hosted MCP** — explicitly out of scope at v1 per spec 028 §"hosted-only by design". A follow-on spec would re-introduce a sealed self-host appliance if there's demand.

## Open Questions

1. **Custom command registration mechanism**: R13 AC4 references `ai-settings.json` → `customCommands` as the extension point for consumer-specific handlers. The exact schema for this registration needs to be defined when the first non-wxKanban consumer onboards.

## Status

- **Date**: 2026-04-20
- **Amendments**: **A** (2026-08-20) — release notes across all three version lines (APP / KIT / COCKPIT); extends R9 with AC7–AC14 and records two corrections to R9 AC1 and AC5. **B** (2026-10-25) — a help flag never runs a command and an unknown option never writes; extends R4 with AC6–AC14.
- **Phase**: implementation (R14 migration in progress)
- **Priority**: high
- **Source of truth for generated artifacts**: `specs/019-agent-orchestrator-kit/`
- **R14 migration progress**:
  - **Phase A (reverse-sync)** ✓ orchestrator repo brought up to date with wxKanban working copy (commit `4ac9ffa` on orchestrator/main)
  - **Phase B (fill gaps)** ✓ bin wrappers, CLAUDE.md template, .vscode/tasks.json template, .gitattributes, release workflow added (commits `468e357`, `0df70cd` on orchestrator/main)
  - **Phase C (first release)** ✓ [`v0.1.0`](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/releases/tag/v0.1.0) published with `kit.tar.gz` (5.5 MB) + `kit.zip` (8.6 MB) + SHA-256 sidecars
  - **Phase D (wxKanban wiring)** ⏳ in progress — this requirement. Next: implement `/api/kit/download` as GitHub-release proxy behind `KIT_DOWNLOAD_SOURCE` feature flag, run 7-day bake, then delete `KitGenerationService.ts`
- **Implementation state**: Core schemas, policy engine, and workflow engine scaffolded in `wxkanban-agent/`. Command handlers `buildscope` and `createspecs` have working Q&A + file I/O; `dbpush` delegates to core; `pipeline-agent` and `wxht` are partial. MCP adapter, CLI gateway, and HTTP gateway are stubs. Lifecycle API client returns mock data.
- **Known gap**: No CLI command exists to advance lifecycle stage (transitions.ts has the logic but no handler surfaces it). Tracked for a follow-up R15.
- **Dependencies**: [`Cowboy-59/wxKanban-agent-Orchestrator`](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator) repository accessible and Requirement 0 (secrets scrub) completed
- **Bug-fix log**:
  - **2026-04-20** [`mcp-startup-cross-project-binding`](../019-agent-orchestrator-kit/bug-reports/2026-04-20-mcp-startup-cross-project-binding.md)
  - **2026-04-24** [`createspecs-dispatcher-and-cli-gaps`](../019-agent-orchestrator-kit/bug-reports/2026-04-24-createspecs-dispatcher-and-cli-gaps.md)
  - **2026-04-24** [`setup-mcp-skips-identity-check-when-running`](../019-agent-orchestrator-kit/bug-reports/2026-04-24-setup-mcp-skips-identity-check-when-running.md)
  - **2026-05-02** [`kit-v0.1.8-bundle-and-buildscope-fixes`](../019-agent-orchestrator-kit/bug-reports/2026-05-02-kit-v0.1.8-bundle-and-buildscope-fixes.md) — full sweep: all 13 reported issues fixed in two passes. First pass: BUG-1/2/3 (Windows blockers), BUG-5 (buildScope content invention), BUG-10 (embedded DB decryption noise + consumer PG-ignore landing). Second pass: BUG-4 (workspace-root resolver), BUG-6/7/8/9 (CLI status branch, `--key=value` parser, `--help` docs, MCP error-body surfacing), BUG-11 (`start-http.mjs` cwd dependency), BUG-12/13 (placeholder check + env-name stop-words).

## Amendment A — Release notes across all three version lines (2026-08-20)

### What prompted Amendment A

Feedback `09153770` was resolved on 2026-08-20 and the submitter was told, in full:

> Your report "wxUIUXCodeReview: add 10 check types derived from SyncDB PR #5 review" (09153770) has been resolved.

No version. No date. Nothing to upgrade to. The triage note that named the release went to
`internalnotes`, which no submitter-facing projection returns, so the one fact the reporter needed
was written in the only place they cannot read. Commit `cc714a13` fixed that leg — a resolution note
now reaches the submitter — but it is per-report and hand-typed, and it answers nothing for the
consumers who never filed a report and are simply being told to upgrade.

R9 AC2 and AC6 already require the other half:

> AC2 — the system SHALL display a changelog summary including version delta, added or changed
> commands, behavioral impacts, and recommendation rationale.
>
> AC6 — WHEN an update adds or changes a command THEN the changelog summary SHALL list those
> specific changes.

So the capability is specified. This amendment does not add it. It corrects the **assumption
underneath it**, which a reuse check surfaced: R9 is written throughout as if there were one
version, and there are three.

### Why R9 as written does not cover it

`.husky/pre-push` maintains three version lines that move independently, on different triggers:

| Line | File | Bumped when |
|------|------|-------------|
| APP | `src/client/version.ts` | **every** push to `main`, unless the pending range already touched the file |
| KIT | `wxkanban-agent/package.json` | only when the range touches `wxkanban-agent/`, `_wxAI/commands/` or `_wxAI/skills/` |
| COCKPIT | `vscode-extension/package.json` | only when the range touches `vscode-extension/` |

All three are patch-only, and the hook commits the bump and exits non-zero to force a re-push.

R9 speaks only of `kitVersion` — AC1 compares it against the orchestrator's latest release, and the
whole accept/reject/defer machine is keyed to it. A consumer on kit 1.7.58 is simultaneously running
app 1.5.311 behind the hosted MCP and Cockpit 0.2.37 in their editor, and R9 has nothing to say
about either. "What changed in this release" is therefore ambiguous as R9 stands: it cannot be
answered without naming which line is being described.

This is a real gap rather than a wording quibble, because the two uncovered lines are the ones the
user interacts with most directly — the Cockpit is their UI, and the app is the product.

### What a consumer actually sees today

One thing, and it is a hyperlink.

`cockpitTreeProvider.ts` renders a tooltip carrying the version pair and, if present, `releaseUrl`.
`kit-update-check.ts` prints the same link to the terminal. Both **deliberately** avoid fetching the
release body, and `KitProxyService` does not return it.

The server-side changelog machinery from the retired spec 018 — `GitHubReleasePoller`,
`UpdateAdoptionService.presentToUser`, `GET /api/updates/changelog/:version` — is real code with
**no consumer in `src/client` or the extension**, no tests, a dead `runReminderSweep()`, and a
default repo of `Cowboy-59/wxKanban` rather than the orchestrator repo where kit releases are
actually cut. Building notes for that path would deliver them to nobody.

The GitHub release page is consequently the **entire delivery surface**, and any requirement here
must target it first. Everything else is optional refinement on top.

### What is on that page today

Whatever was typed into `--notes` when `sync-to-orchestrator.mjs --release` ran, or — when the flag
is omitted — the literal string `Synced from wxKanban repo on <date>.`

That fallback contains no `###` headings, so `parseSections` classifies zero bullets into every
bucket and yields an all-empty `ChangelogDetail`. The one automated reader of the body cannot read
the body it is given.

### The source that already exists

`wxkanban-agent/CHANGELOG.md` is 713 lines, actively maintained, and already sectioned
`## Unreleased` with `### Added` / `### Fixed` — which is exactly the shape `parseSections` expects.
`changelog.md` does the same for the app and states its own discipline: "This is NOT a dump of git
commits — document meaningful changes only."

Neither file is read by any code. The notes have been written all along and then something else is
hand-typed into the release. **The gap is a pipe, not a product**, and the requirements below are
sized accordingly.

### The two rules that keep the notes honest

**Ground the summary in the tag, not the calendar.** The obvious implementation — "this release
contains whatever feedback was resolved since the last one" — is derivable with no new column and is
wrong. Resolved does not mean shipped. On the day this amendment was written there were four
commits marked resolved and unpushed; a date-windowed changelog would have told customers all of it
shipped. A check that reports "shipped" identically whether or not the thing shipped is the
false-confirmation shape catalogued in `wxUIUXCodeReview` §5, and here it makes a false claim to
customers rather than to us.

**Placement decides publication; `.gitignore` does not.** The release guard reads
`git status --porcelain`; the sync copies with `cpSync` over the tree. A file that is *untracked*
inside a mirrored directory blocks the release. A file that is *gitignored* inside one is invisible
to the guard and still copied — so it ships silently to a public GitHub release. `sync-to-orchestrator.mjs`
says this in its own comments ("the sync mirrors the FILESYSTEM, not git"; "ignored is not
untracked"). Gitignoring a generated artifact inside a mirrored tree therefore makes it *more*
likely to leak, not less.

### Added acceptance criteria

Extending Requirement 9. Numbering continues from AC6.

7. Release notes SHALL be produced **per version line** — APP, KIT, COCKPIT — and every set of notes
   SHALL state which line and which version it describes. A note that does not name its line is
   not compliant, because the reader is running all three.

8. When a release advances more than one line, the notes SHALL be emitted per line rather than
   merged into a single undifferentiated list, and SHALL state the versions of the other lines
   advanced in the same release so a reader can reconcile what they are being offered.

9. Notes SHALL be derived from the commit range contained in the **release tag**, and from the
   feedback whose fixing commits fall inside that range. Derivation from a date window, from
   feedback status alone, or from any source that cannot distinguish *fixed* from *shipped*, is
   prohibited.

10. Where a release fixes a reported item, the notes SHALL be able to name that item in the
    reporter's own terms. This closes the loop `cc714a13` opened from the other end: the reporter is
    told which release carries their fix, and the release says which reports it carries.

11. The generated notes SHALL be written to a path outside every mirrored tree (`KIT_DIRS` and
    `.claude/`), and SHALL additionally be gitignored. Placement is the control; the ignore entry is
    defence in depth. The release SHALL refuse to proceed when a notes artifact is found inside a
    mirrored tree.

12. The notes SHALL be produced in the section format the existing parser consumes — `### Added`,
    `### Changed`, `### Fixed`, `### Breaking` — so that the body is machine-readable as well as
    human-readable, and SHALL be passed to the release as its body rather than left in a file. The
    date-stamp fallback SHALL NOT be published as release notes.

13. Summarisation SHALL NOT run inside the kit. The kit is a workflow engine, not an AI client, so
    the summarising step SHALL be a server-delivered command prompt executed by the operator's AI
    assistant. A human SHALL review the draft before it becomes a release body; no path may publish
    generated notes unreviewed.

14. The maintained changelog files (`wxkanban-agent/CHANGELOG.md`, `changelog.md`) SHALL be the
    working source and SHALL be updated as part of producing the notes, so that the file and the
    published body cannot diverge.

### Corrections to R9 as written

Recorded here rather than edited in place, so the original text stays readable:

- **AC1 names `scripts/kit-update.mjs`, which does not exist.** The shipped scripts are
  `scripts/upgrade-kit.mjs` (applies the upgrade) and `scripts/check-kit-version.mjs` (the
  folder-open notice). Read AC1 against those.

- **AC5's escalation is partly built and partly dead.** The 30-day reminder exists in
  `UpdateAdoptionService.runReminderSweep()`; the 60- and 90-day steps do not. `runReminderSweep()`
  has **no caller anywhere in the repo** — no cron, no route, no scheduler — so no deferral reminder
  has ever been sent. This is pre-existing and is not resolved by this amendment; it is stated so the
  next implementer does not read green code as a working feature.

- This document contains **two sections numbered "Requirement 15"** — "BuildScope CLI → MCP wiring"
  and "Kit Upgrade (preserve-mode)". Pre-existing collision, unchanged here; cite them by title.

### Out of scope for this amendment

- **A `fixedinversion` column on `feedbacksubmissions`.** AC10 can be satisfied at note-generation
  time from the commit range. A stored, queryable fix-version — which would let "what shipped in
  1.5.312" be a report rather than a derivation, and give the release-warden agent somewhere to
  write its answer — remains unbuilt and belongs to SCOPE-043.
- **Building the spec-018 update-adoption UI.** `UpdateAdoptionPanel` was specified there and never
  built; 018 is retired ("Do not implement against it"). Reviving that surface is a separate
  decision and is not required to deliver notes to the release page.
- **Reviving `runReminderSweep()`.** Noted above as an R9 gap; fixing it is R9 work, not this
  amendment's.
- **Marketing release announcements.** SCOPE-064's newsletter carries "release notes, new features"
  to a mailing list. Different audience, different scope, unchanged here.

## Amendment B — A help flag never runs a command; an unknown option never writes (2026-10-25)

### What prompted Amendment B

Customer report package of 2026-10-25 (one three-person team; the same defect class sits in 48
feedback reports from 14 companies since June, 22 still open from 7). On 2026-10-19 the team's Claude
session ran `wxkanban-agent dbpush --help` to read the options. It ran a real push: about 45 duplicate
documents created and about 20 overwritten. It reproduced on wxKanban itself on 2026-10-25. Brainstorm
record: `docs/brainstorms/2026-10-25-kit-write-safety.md`, decision 5a; acceptance bar decision 1
(every kit write is **repeatable**, **contained** and **loud**).

### Why Requirement 4 as written does not cover it

R4 AC4 defines help only for the bare CLI ("invoked without arguments"). Nothing defines what a help
flag does after a command name, and nothing says what a command does with an option it does not know.
Verified in code (2026-10-25):

- `apps/command-gateway/src/cli.ts:301` prints help only when `--help`/`-h` is the **first** argument.
  After a command, `--help` becomes `rawOptions.help = true` (`cli.ts:341-353`) and the command is
  dispatched (`WorkflowEngine.dispatch`, `cli.ts:480`); `-h` becomes a positional (`cli.ts:355`).
  So `dbpush --help` pushes, `buildscope --help` drafts, `implement 123 --help` runs batch mode.
- `kit:configure` is handled before the help check (`cli.ts:293`) and writes config when given a
  token and project id, help flag or not.
- `dbpush.ts:1039-1056` (`parseDbPushArgv`) has no branch for an unrecognised argument — typos and
  help flags are dropped silently and the push runs.
- **dbpush has two option parsers that disagree.** Through the gateway, `WorkflowEngine.runDbPush`
  (`core/orchestrator/workflow-engine.ts:80-86`) maps `dry-run`, `force`, `skip-lifecycle` and `spec`
  but **not `--scope`**, so `wxkanban-agent dbpush --scope 017` silently pushes every spec.
  `--skip-lifecycle` is accepted on both paths and read nowhere.
- `workers/ai/buildscope-worker.ts:18-27` forwards **every** option key to the server, `help` and `_`
  included; the server keeps working only because its schemas strip unknown keys.
- On the hosted MCP no tool input schema is strict (`mcp-server/src/utils/schemas.ts` — zod default
  strip). A misspelled field on a write tool is silently dropped and the write proceeds without it.
- A bare `--help` outside a configured project throws ("No .wxkanban-project.json found",
  `cli.ts:298`) instead of printing help.

### Added acceptance criteria

Extending Requirement 4. Numbering continues from AC5.

6. WHEN `--help` or `-h` appears **anywhere** on a command line that names a command THEN the system
   SHALL print that command's help — its purpose, its options, and whether it writes — and exit 0
   **without dispatching the command**, without any network call, and without writing any file. This
   applies to every command, including `kit:configure` and `implement <scope>` batch mode.

7. The help-flag rule SHALL be enforced in `WorkflowEngine.dispatch`, the single point that both the
   CLI and the HTTP gateway (`apps/command-gateway/src/http.ts` `/dispatch`) pass through, as well as
   in `cli.ts` before option parsing — so neither entrance can run a command that was asked for help.

8. WHEN the CLI is invoked with only `--help` or `-h` and no command THEN it SHALL print the command
   list, including outside a configured project (no throw). The session-start update checks it runs
   today (`ensureCockpitUpToDate`, `ensureKitUpToDate`, `cli.ts:305-306`, relied on by the
   SessionStart hook) SHALL keep running: bare help names no command, so it runs none; only a help flag after a command is locked down by AC6.

9. Every command SHALL declare its options in one registry (name, value type, whether the command
   writes). The registry is the source of the per-command help in AC6.

10. WHEN a command that writes (to the hub, the database, or the filesystem) receives an option not in
    its registry THEN it SHALL refuse **before any network call**, exit non-zero, and name the valid
    options and the nearest match. A command that only reads SHALL warn and continue.

11. dbpush SHALL have **one** option parser, used by both `npx tsx wxkanban-agent/dbpush.ts` and the
    gateway. `--scope` SHALL be honoured on both paths. `--skip-lifecycle` SHALL be implemented or
    removed from the parser and from `_wxAI/commands/dbpush.md`. The unknown-option refusal SHALL
    happen inside the parser, ahead of the first network call (`project.list_open_items`,
    `dbpush.ts:812`), dry run included.

12. The buildscope worker SHALL forward only the options its registry declares, never every key.

13. Every hosted MCP **write** tool SHALL reject an input field its schema does not declare, returning
    `InvalidParams` that names the field. Enforced once, at the tool dispatch point
    (`mcp-server/src/server.ts`, between the stage check and the tool switch), from a tool-name →
    schema map — including the test-lifecycle tools, which use hand-written JSON schemas. Write tools
    are the editor/admin entries of `mcp-server/src/auth/role-checker.ts` plus `capture_event`,
    `submit_feedback`, `answer_feedback`, `triage_feedback` and `manage_my_feedback`. The envelope keys
    that transports add on their own (`projectId`, `projectid`, and `_` from kits that predate AC12)
    SHALL be allowed so deployed kits keep working; `help` is not an envelope key. The advertised
    (ListTools) schema of each write tool SHALL state `additionalProperties: false`.

14. Each AC6–AC13 behavior SHALL ship a regression test on the **real path** the customer used — the
    CLI entry point and the MCP HTTP endpoint, not a unit test of a parser — that fails without the
    fix. At minimum: `dbpush --help`, `dbpush -h`, `dbpush --helo`, `dbpush --scope NNN` (pushes only
    NNN), `buildscope --help`, `implement NNN --help` and `kit:configure --help` each produce **zero**
    hub writes (asserted by a recording endpoint), and an unknown field on `project.upsert_document`
    is refused by the deployed server (live probe).

### Release order

Kit (and Cockpit, if its bundled kit changes) before the server, per the batch build order. AC13 is
safe for deployed kits because of the envelope-key allowance; it still ships after the kit release
that carries AC12, so that `_` can later be dropped from the allowance.

### Out of scope for this amendment

- dbpush defaulting to a dry run — group 3 topic (the customer's runbook).
- Undo, version history, pulling web-created scopes down — group 1 topic (push-only model).
- Strict schemas on **read** tools — a misspelled read field loses no data; revisit if reported.

### Clarifications — Session 2026-10-25 (Amendment B)

| # | Question | Decision |
|---|----------|----------|
| 1 | New scope or an amendment? | Amend SCOPE-019 — it owns the command gateway (brainstorm decision 3). |
| 2 | Phase it? | No — ships whole with the batch (brainstorm decision 4). |
| 3 | Bare `--help` with no command: keep the session-start update checks? | Keep — it runs no command; only `<command> --help` is locked down (owner, 2026-10-25). |
