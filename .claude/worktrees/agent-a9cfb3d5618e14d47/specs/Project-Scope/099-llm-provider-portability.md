# SCOPE-099: LLM Provider Portability

**Scope Number**: SCOPE-099
**Status**: `draft`
**Created**: 2026-07-15
**Last Reviewed**: 2026-07-15 (codebase mapped; endpoints smoke-tested; Gemini status verified directly)
**Depends On**: SPEC-025 FR-019/FR-020 (Project Overview Builder — the provider contract and the unbuilt transcript window), SCOPE-074 (embeddings abstraction), SCOPE-065 (per-call provider/model override). Conventions authority: `CLAUDE.md`.
**Related Scopes**: SCOPE-076 (Bring-Your-Own LLM) must be amended to `Depends On: SCOPE-099` — it predicts this work at its line 19 and inherits the `resolveEndpoint` seam. SCOPE-075 owns the drifted app-side embeddings copy reconciled here.
**Source**: `specs/Project-Scope/099-llm-provider-portability.md`

---

## Overview

Every AI call wxKanban makes — generation and embeddings — is welded to a specific vendor by a hardcoded base URL. Generation is dispatched by three duplicated copies of the same provider switch: `src/server/ai/llm-provider.ts` (non-streaming, 9 consumers), `src/server/ai/llm-stream.ts` (streaming), and a third inline copy inside `src/server/routes/overview.ts` that bypasses both. Two services — `ScopeChatService` and `ScopeService` — skip the abstraction entirely and read `GEMINI_API_KEY` directly.

This scope makes the provider a configuration value in fact rather than in principle. It adds a generic `openai-compatible` generation provider parameterized by base URL, key, and model — deliberately mirroring the shape `resolveEmbeddingsConfig` already uses rather than inventing a second pattern — and collapses the three dispatches behind a single `resolveEndpoint` resolution point. It moves embeddings off `gemini-embedding-001` onto a 768-dimension OpenAI-compatible model, and implements the transcript window that SPEC-025 FR-020 specified but nobody built.

The result: running on Gemini, on a free endpoint, or on a self-hosted model becomes an environment change, and Google stops being a dependency at all.

## Business Problem

wxKanban cannot leave an AI vendor, and wastes tokens while it stays.

SPEC-025 FR-019 promises the provider is swappable without code changes. That promise is false: swapping means editing three duplicated dispatches plus two Gemini-hardcoded services. The team has no leverage when a vendor degrades, reprices, or fails.

The waste is measured, not estimated. `routes/overview.ts` re-sends the **entire** interview transcript on every turn at `max_tokens: 2048`, so tokens grow quadratically with interview length. A two-message smoke call to a free endpoint consumed **1,135 of an 8,000 tokens/minute budget**, because reserved `max_tokens` counts against the rate limit rather than tokens actually used. A real interview therefore walks into a hard 429 mid-conversation and the user loses their session. Gemini only made that waste cheap; every free tier makes it fatal. Halving `max_tokens` alone halves the per-request reservation.

The glossary is actively causing defects. `CONTEXT.md` defines the AI Provider as "Primary: Gemini. Fallback: OpenAI" — a fallback that does not exist in code (`groq|gemini|anthropic`). That entry is the traceable root cause of a live bug: `ScopeService.ts:549` reads `GEMINI_API_KEY ?? OPENAI_API_KEY` and posts the result to a Google endpoint, silently 400ing and fail-opening to "no conflicts" forever. A developer read the glossary and implemented what it said.

The desired outcome: one code path issues generation requests, one resolution point decides the endpoint, and no Google key is required to run the product.

## Actors

Primary: A developer or operator configuring which model and endpoint wxKanban's AI calls use.
Secondary: A project owner running the Overview AI interview; a SysAdmin managing hosted-MCP and App Runner environment configuration; an enterprise customer requiring data residency (SCOPE-076, which inherits this scope's `resolveEndpoint` seam).

Key value: switching model or vendor — including to a self-hosted model — becomes an environment change with a one-line rollback and no deploy.

## Scope Boundary

1. **Generic `openai-compatible` generation provider.** A fourth `LlmProvider` value parameterized by `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. `groq` is already OpenAI-compatible with a frozen base URL, so this generalizes an existing call rather than adding a new one.
2. **One `resolveEndpoint` seam.** Resolution order: per-call override, then env, then provider default. Returns `{provider, wire, baseUrl, apiKey, model}` where `wire` is `openai|anthropic|gemini`. The real axis of variation is wire format (three of them), not vendor (unbounded). This is the seam SCOPE-076 later fills from a per-tenant record.
3. **Dispatch consolidation.** The interview route uses the shared `streamChat`; its inline copy is deleted. Includes porting the Anthropic leading-assistant-turn trim that exists only in the inline copy (`overview.ts:803-804`) and is missing from `streamChat`.
4. **SPEC-025 FR-020.** Bounded transcript window via `OVERVIEW_HISTORY_TURNS`; `max_tokens` 2048 → 1024. Applied once at the route, above the wire mapping.
5. **Portable `jsonMode`.** Mapped per wire: OpenAI `response_format`, Gemini `responseMimeType`, Anthropic prompt-instruction (best-effort, documented). Plus a shared `parseJsonLoose` hoisted from `MarketingAIService.ts:57-58`, since reasoning models fence their JSON.
6. **Gemini-hardcoded services migrated.** `ScopeService` conflict check → `generateOnce({jsonMode:true})`; `ScopeChatService` → `streamChat`.
7. **Embeddings off Gemini.** Target a 768-dimension OpenAI-compatible model (`BAAI/bge-base-en-v1.5` via `https://api.deepinfra.com/v1/openai`, or `nomic-embed-text` self-hosted — both natively 768, matching `vector(768)` with no index change). Fix the latent bug where `embedOpenAiCompatible` ignores `cfg.dimensions`. Reconcile the drifted app and mcp-server copies. Perform the mandatory one-time re-index.
8. **Fix the `CONTEXT.md` AI Provider entry** that caused the `ScopeService` defect.

## Out of Scope

- Per-tenant endpoint configuration, embeddings parity for a generation-only customer LLM, and on-prem deployment of the pgvector index — all remain SCOPE-076, which depends on this scope.
- Collapsing `groq` into `openai-compatible`. It becomes a preset row pointing at the same sender; `MARKETING_LLM_PROVIDER` and all existing consumers are untouched.
- Unpinning the hosted MCP's feedback triage from Groq. `mcp-server/src/utils/feedback-triage.ts:140-142` hard-throws on any non-groq `LLM_PROVIDER` by deliberate design. It stays pinned.
- Removing the `gemini` provider branch. Retained deliberately so rollback is one env var with no deploy.
- Repairing the hosted MCP's own `GEMINI_API_KEY` (a separate App Runner console fix — see Open Questions).
- Re-tuning `business-analyst.ts` prompts beyond verifying no regression.
- Changing the `vector(768)` index width.

## User Scenarios

### US1 — Operator moves generation to a free endpoint (happy path)
An operator sets `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL=gpt-oss-120b` and restarts. No code changes.
**Expected:** the Overview interview streams normally; the assistant's questions render; a Pino line records `{provider, wire, model}` once from `resolveEndpoint`.

### US2 — Long interview on a rate-limited free tier
A project owner runs a 15-turn Overview interview against an endpoint with an 8,000 tokens/minute cap.
**Expected:** per-turn prompt tokens plateau at the `OVERVIEW_HISTORY_TURNS` window instead of climbing; the interview completes without a 429; the assistant still references earlier context within the window.

### US3 — Rollback after a bad provider
An operator flips to a new endpoint, finds latency unacceptable, and reverts `LLM_PROVIDER=gemini`.
**Expected:** behavior returns to today's exactly; no deploy, no code change, no data migration.

### US4 — Google fully removed (the acceptance case)
`GEMINI_API_KEY` is unset entirely.
**Expected:** the Overview interview, scope chat, the scope conflict check, and capability search all succeed. Nothing throws "GEMINI_API_KEY not configured".

### US5 — Reasoning model returns a blank turn (regression guard)
Generation runs on a model that streams only a reasoning channel.
**Expected:** this must not present as an empty assistant bubble with no error. `gpt-oss-120b` was verified to put content on `delta.content` while *also* emitting `delta.reasoning` and a `channel` key — so the current normalizer works, but the failure mode is one config change away and must be trapped explicitly.

### US6 — Embeddings swap without a re-index (failure case)
The embeddings model changes but the index is not rebuilt.
**Expected:** the system must not silently return nonsense. Old Gemini vectors and new-model vectors are semantically incomparable even at identical width, so the re-index is a gate, not a follow-up.

## Functional Requirements

### FR-001 — Generic OpenAI-compatible generation provider
`LLM_PROVIDER` MUST accept `openai-compatible`, resolving base URL, key, and model from `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.
- [ ] An unknown `LLM_PROVIDER` value MUST NOT silently fall back to a working-but-wrong provider; it MUST fail loudly at startup. (Today it warns and returns `groq` — during this scope's own drafting that fallback silently routed the app onto the exhausted 100K/day tier.)
- [ ] `openai-compatible` with a missing base URL or key throws a typed config error naming the missing variable.
- [ ] Self-hosting requires only changing `LLM_BASE_URL`; no code path is provider-name-aware.

### FR-002 — Single endpoint resolution seam
All generation MUST resolve its endpoint through one `resolveEndpoint`, ordering per-call override > env > provider default.
- [ ] `resolveEndpoint` accepts an optional `baseUrl`/`apiKey` override (the SCOPE-076 per-tenant seam) without further refactor.
- [ ] It is the single place that logs `{provider, wire, model}`.
- [ ] The SCOPE-065 per-call override (`MarketingAIService` pinning Anthropic) keeps working unchanged.

### FR-003 — Dispatch consolidation
Exactly one code path MUST issue generation requests.
- [ ] `routes/overview.ts` contains no inline provider dispatch or SSE parsing; it calls `streamChat`.
- [ ] `streamChat` drops a leading assistant turn before an Anthropic call (ported from `overview.ts:803-804`), and this lands *before* the interview is cut over.
- [ ] The route's own SSE contract (`chunk`/`done`/`heartbeat`/`error`) is unchanged, so `InterviewChatPanel.tsx` needs no edit.
- [ ] Trim order is window-then-trim; trimming before slicing can re-expose an assistant turn at index 0.

### FR-004 — Bounded transcript window (implements SPEC-025 FR-020)
The interview MUST send a bounded window, not the whole transcript.
- [ ] `OVERVIEW_HISTORY_TURNS` (default 10) caps the turns sent; `max_tokens` is 1024.
- [ ] The canonical opener is preserved after windowing.
- [ ] Per-turn prompt tokens are flat across a 15-turn interview.
- [ ] Lands with FR-003 (same code block) and before any endpoint flip.

### FR-005 — Portable JSON mode
`jsonMode` MUST be honored across wire formats.
- [ ] OpenAI → `response_format: {type:'json_object'}`; Gemini → `responseMimeType` (preserving today's behavior); Anthropic → prompt instruction, documented as best-effort.
- [ ] A shared `parseJsonLoose<T>()` strips prose/fences before parsing, used at every JSON call site.
- [ ] `ScopeService`'s existing fail-open (`return []`) is preserved — it is an advisory, not a gate.

### FR-006 — Remove direct Gemini coupling
No service may read `GEMINI_API_KEY` directly.
- [ ] `ScopeService` conflict check uses `generateOnce({jsonMode:true})`; the `GEMINI_API_KEY ?? OPENAI_API_KEY` defect is deleted, not patched.
- [ ] `ScopeChatService` uses `streamChat` with a real `system` role instead of a faked user/model turn pair, and its `token`/`scope_update`/`split_proposal` frames still emit correctly.
- [ ] No user-facing string instructs setting `GEMINI_API_KEY`.

### FR-007 — Embeddings portability and re-index
Embeddings MUST run on a 768-dimension OpenAI-compatible model with no Google dependency.
- [ ] `embedOpenAiCompatible` sends `dimensions` when the config specifies it, instead of ignoring `cfg.dimensions`.
- [ ] The app and mcp-server embeddings copies expose the same provider set (they have drifted: app `gemini|selfhosted`, mcp `gemini|openai|selfhosted`).
- [ ] `capabilityindex` is fully re-indexed; mixed-model vectors never coexist.
- [ ] A vector whose width ≠ the index width fails loudly rather than being written.

### FR-008 — Correct the AI Provider glossary entry
`CONTEXT.md` MUST describe the providers that exist.
- [ ] The "Fallback: OpenAI" claim is removed; generation vs embeddings providers are distinguished.
- [ ] The entry states that provider choice is configuration, naming no vendor as permanent.

## Data Requirements

No schema changes. No new tables, columns, or migrations.

`capabilityindex` is unchanged structurally — `vector(768)` stays 768, which is why `BAAI/bge-base-en-v1.5` and `nomic-embed-text` were chosen (both natively 768). The scope requires a **data migration, not a schema migration**: every existing row's embedding must be recomputed on the new model, because vectors from different models are not comparable even at identical width. Partial re-index is a failure state — search silently degrades rather than erroring.

## API Routes

No new or removed routes.

`POST /api/projects/:id/overview/draft/:id/ai-message` is modified internally (inline dispatch replaced by `streamChat`, transcript windowed) but its request shape, response shape, and SSE event contract are unchanged. That invariance is what keeps the client untouched, and it is an acceptance criterion of FR-003.

## Frontend Components

No new or modified components.

`InterviewChatPanel.tsx` parses the *route's* SSE frames, not the provider's, so provider changes are invisible to it. If this scope requires a client edit, the route's SSE contract has been broken — treat that as a defect, not a task.

## Success Metrics

- Provider swap costs zero lines of code: the Overview interview runs end-to-end against Gemini, a free OpenAI-compatible endpoint, and a self-hosted endpoint using env changes only — satisfying SPEC-025 FR-019, unmet since it was written.
- Per-turn prompt tokens stay flat across a 15-turn interview (currently linear growth per turn, quadratic in total), and a 15-turn interview completes on an 8,000 tokens/minute tier with zero 429s.
- Generation dispatch copies drop from 3 to 1, and services reading `GEMINI_API_KEY` directly drop from 2 to 0, verified by grep.
- With `GEMINI_API_KEY` unset entirely, 4 of 4 AI surfaces succeed: Overview interview, scope chat, scope conflict check, capability search.
- `capabilityindex` is 100% re-indexed on the new model and `project.search_capabilities` returns ranked matches for a known-present capability — the reuse check works again, having returned a 400 during this scope's own creation.
- Rollback to Gemini takes 1 env var and 0 deploys.

## Constraints

- Fences are orchestrator-written and never hand-authored. Steps that MODIFY existing fenced files must route through the hosted `/call` implement path; the local `implement` CLI has no fence-DB client and strips fences on modify. `auditfences` must pass before push.
- All code lands while still running Gemini. The endpoint flip is the last step and is an env var — this is what makes rollback free and is why the `gemini` branch is retained.
- FR-004 must land before any flip to a free endpoint. Free-tier limits are reservation-based, so the unwindowed transcript hits a 429 wall regardless of vendor.
- Generation and embeddings must target **different** endpoints. The HF router's OpenAI-compatible endpoint is chat-only, and neither Cerebras nor Groq serves embeddings at all. One base URL cannot serve both; the config must not imply otherwise.
- No `any`. The existing SSE payload types are explicitly shaped — keep that. Pino only, no `console.log`.
- No push until the product owner says push.

## Verified Findings

Recorded because they were established by direct test during drafting, and two of them contradict the assumptions this scope started from.

- **`gpt-oss-120b` works on the OpenAI wire format.** HTTP 200, first delta 311ms, 591ms total, coherent business-analyst questioning unprompted. Content arrives on `delta.content`, so the existing normalizer is untouched — but the model *also* streams `delta.reasoning` and a `channel` key (see US5).
- **The O(n²) cost is real and measured.** `x-ratelimit-limit-tokens: 8000`, `remaining: 6865` after a two-message call — 1,135 tokens consumed because reserved `max_tokens` counts against the cap.
- **Gemini is NOT refusing service.** `generateContent` on `gemini-3.1-flash-lite` → 200. `batchEmbedContents` at 768d → 200. `ListModels` → 200, model present. The premise that Google was blocking us did not survive testing; this scope's driver is lock-in plus measured waste, not a Google outage.
- **The hosted MCP's embeddings 400 is its own key problem**, not a Google change — local key succeeds on the identical call. Out of scope here; see Open Questions.
- **The embeddings abstraction already has the design this scope wants for generation.** `resolveEmbeddingsConfig` already does provider + baseUrl + model + apiKey. Generation should mirror it, not invent a parallel pattern.

## Open Questions

1. **The hosted MCP's `GEMINI_API_KEY` is broken** (`project.search_capabilities` → 400 while the same call succeeds locally). Out of scope, but it blocks the reuse check for every `buildscope` run until fixed in the App Runner console. Who fixes it, and when?
2. **Which embeddings endpoint ships as the default** — DeepInfra `BAAI/bge-base-en-v1.5` (hosted, ~$0.01/M tokens) or self-hosted `nomic-embed-text` (free, needs a host)? Both are natively 768. Not blocking design; both use the same code path.
3. **When does the re-index run**, and does capability search degrade or hard-fail while it is in flight?
4. **Does `ScopeChatService`'s prompt survive a real `system` role?** It currently fakes the system prompt as a user/model turn pair and asks the model to emit SSE frame names as text. This is the highest-risk item and may need its own prompt revision task.
5. **`buildscope` reported this scope created and persisted nothing** (`validatescope 099` → "Could not find scope"). This file was written directly with product-owner approval. The phantom-success is a shipped-product defect worth its own ticket — it silently loses user work.

## Notes

- SPEC-025 line 233 defers the Gemini-hardcoded services to "spec 027", but SPEC-027 is Kit Runtime Hygiene (port autoselect / process cleanup) and has nothing to do with LLM providers. That pointer is dangling and must be repointed at SCOPE-099.
- SCOPE-076 line 19 already predicts this work ("*mostly a configurable base-URL + model + key*"). Amend it to `Depends On: SCOPE-099` and narrow it to per-tenant config, embeddings parity, and deployment.
- Implementation order (each step independently shippable and revertable): A `llm-provider.ts` additive → B `llm-stream.ts` + Anthropic trim → C interview cutover + FR-020 → D jsonMode + Gemini stragglers → E env flip.
