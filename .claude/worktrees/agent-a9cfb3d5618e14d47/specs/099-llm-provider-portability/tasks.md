# Tasks: SCOPE-099 — LLM Provider Portability

**Spec Number**: 099
**Scope**: `specs/Project-Scope/099-llm-provider-portability.md`
**Spec ID**: `4efb0617-6977-4ec4-9244-f3a3d7393c1f`
**Created**: 2026-07-15

> Materialized from the database. `create_specs` writes tasks to the DB only; the
> fence task-id index (`buildTaskIdIndex`) reads **this file**, so a fence referencing
> `099/TNNN` fails `auditfences` with UNKNOWN_TASK unless the task appears in the table
> below. Keep the `T00N` ids and the DB `Task ID` column in sync.

## Implementation Order

Each step is independently shippable and revertable. **All code lands while still
running Gemini** — the endpoint flip (T009) is last and is an env var, so rollback
needs no deploy.

| Task | Title | Status | Task ID |
| --- | --- | --- | --- |
| T001 | `llm-provider.ts` — openai-compatible provider + resolveEndpoint seam | done | `75141383-740f-440f-9b05-8ec3e2d7b20c` |
| T002 | `llm-stream.ts` — use resolveEndpoint + port missing Anthropic trim | done | `c57bde1f-ee0d-40fb-b69d-858286a6f43e` |
| T003 | `overview.ts` — cut interview to streamChat + implement FR-020 window | done | `c5ccb8d8-9256-497b-92fd-ce711231500f` |
| T004 | `ScopeService.ts` — jsonMode + delete the OPENAI_API_KEY defect | done | `d334a55e-8329-4d7c-8f16-409361f09aa5` |
| T005 | `ScopeChatService.ts` — BOTH Gemini call sites + real system role (HIGHEST RISK) | done | — |
| T006 | Embeddings — send dimensions + reconcile app/mcp drift | done | — |
| T007 | `capabilityindex` re-index on the new 768-dim model | done | — |
| T009 | Env contract — App Runner both services (docs still todo) | partial | — |
| T008 | `CONTEXT.md` — correct the AI Provider glossary entry | todo | — |
| T009 | Env contract — `.env.example` + App Runner (both services) | todo | — |
| T010 | Amend SPEC-025 and SCOPE-076 pointers | todo | — |
| T011 | Kit `ai-client.ts` onto openai-compatible (SHIPS TO CUSTOMERS) | todo | `6af92b1f-89b4-4f5c-bb55-737fa282ff82` |
| T012 | Remove Banner Studio AI image generation (product decision) | todo | `c6a36a97-35c8-4019-8fd3-67eafc50ee21` |
| T013 | Replace the retired Groq default `llama-3.3-70b-versatile` with `openai/gpt-oss-120b` (feedback triage, groq preset, kit `ai-client.ts`, `.env.example`) | done, except `.env.example` (read-denied in the editor; still names the old model) | — |

### T013 — Groq retired the default model (2026-10-09)

**Verified 2026-10-09:**
- Groq's `/models` list no longer includes `llama-3.3-70b-versatile`, and a chat call returns
  `404 model_not_found`.
- The hosted MCP sets neither `GROQ_MODEL` nor `LLM_PROVIDER`, so feedback AI triage
  (`mcp-server/src/utils/feedback-triage.ts`) has logged "Feedback triage skipped (LLM unavailable)
  — Groq API error: 404" on every report since at least 2026-09-10. Severity and classification
  are blank for all of them.
- The app itself is unaffected: `LLM_PROVIDER=openai-compatible`, `LLM_MODEL=gpt-oss-120b` on
  Cerebras. The app service's `GROQ_MODEL` still names the dead model, but nothing reads it while
  the provider is openai-compatible.

**Change:** set the default to `openai/gpt-oss-120b`, Groq's largest general model, in four
places:
- `feedback-triage.ts`
- the `groq` preset in `src/server/ai/llm-provider.ts`
- `wxkanban-agent/workers/ai/ai-client.ts`
- `.env.example`

Then verify with a live triage call.

### Amendment A (2026-07-15) — "off Gemini" is FOUR surfaces, not two

The original scope covered generation + embeddings. A full sweep of every Google touchpoint found two more:

- **T011 — the kit's own AI client.** `wxkanban-agent/workers/ai/ai-client.ts:76-78` has its own hardcoded Gemini endpoint, separate from the app's. **It ships to customers**, so without this the product still hard-depends on Google after the app doesn't.
- **T012 — Banner Studio images.** `image-provider.ts` uses `imagen-4.0-generate-001` (`:predict`) and `gemini-2.5-flash-image` (`:generateContent`, img2img). No OpenAI-compatible shortcut exists — the HF router is chat-only and image APIs aren't standardised. **Decision: cut the feature, don't port it** (Andy, 2026-07-15). Upload + brand overlay stays.
- **T005 widened.** `ScopeChatService` has **two** Gemini call sites, not one: `:142` (streaming) and `:329` (non-streaming, carrying the same `?? OPENAI_API_KEY` defect as `ScopeService:549`). Both must move or the service ships half-migrated.

### T003 — Done (2026-07-15): FR-020 measured, not asserted

156 lines of inline dispatch + SSE parsing deleted; the interview now calls `streamChat`. Zero inline-provider symbols remain in `overview.ts` (no `llmResponse`, no `generativelanguage`, no per-vendor keys, no `content_block_delta`). Client untouched, as designed — it parses the route's frames, not the provider's.

**Prompt tokens per turn, measured live against Cerebras `gpt-oss-120b`:**

| turn | BEFORE (whole transcript) | AFTER (windowed) |
|---|---|---|
| 4 | 225 prompt + 2048 res = 2273 | 225 + 1024 = 1249 |
| 8 | 365 + 2048 = 2413 | 365 + 1024 = 1389 |
| 12 | 505 + 2048 = 2553 | 435 + 1024 = **1459** |
| 16 | 645 + 2048 = 2693 | 435 + 1024 = **1459** |

AFTER **plateaus at 435** from turn ~10 (window engages); BEFORE climbs unbounded at ~+140/4 turns. 44% fewer reserved tokens across sampled turns. The reserved column is what decides a 429 — providers count reserved `max_tokens` against TPM, so on an 8K/min tier the old code fit ~3 turns/minute and the new one fits ~5 with the prompt half no longer growing.

Two traps avoided: `streamChat` defaults `temperature` to **0.4** but the interview has always run **0.7** (passed explicitly), and the inline loop was `while (!aborted)` while `streamChat` has no abort concept (so `onDelta` guards on `aborted`). Behavior change worth knowing: a client disconnect now persists the **complete** assistant turn rather than a partial one.

**Fence debt — deliberately NOT paid here.** Editing `overview.ts` voided its legacy exemption: `auditfences-scanner.ts:88` hashes the WHOLE FILE (`sha256(body)`), so any edit to a file in `.wxai/auditfences-legacy.json` promotes every un-fenced declaration in it from INFO to ERROR. That surfaced 3 pre-existing functions (`loadAuthorizedDraft`, `isImagePaste`, `buildEmptyOverviewTemplate`) that **spec 025 wrote, not 099**. Fencing them under `099/T003` would misattribute authorship — the same failure `emitFence` commits when an edit drops a fence. Left as-is pending a decision (re-baseline vs fence under the true owner). Context: `src/` already has **435** fence errors and `auditfences` exits **1** today, so this is a pre-existing systemic gap, not a T003 regression — but it does mean CLAUDE.md's "CI runs --strict" cannot currently be passing.

### Amendment B (2026-07-15) — free tier VALIDATED

Cerebras `gpt-oss-120b` verified end-to-end **through `resolveEndpoint`, no code change** — `https://api.cerebras.ai/v1`, 500ms round trip, coherent business-analyst questioning, `jsonMode` returning clean JSON. **1M tokens/day free**, 10× the Groq llama tier that was exhausted. This retires the central risk: the target endpoint works and costs nothing.

Still true: **FR-020 (T003) must land before the flip (T009)** — free-tier limits are reservation-based, so an unwindowed transcript hits a 429 mid-interview regardless of vendor.

## Gating Rules

- **T002 gates T003.** `overview.ts:803-804` drops a leading assistant turn (Anthropic
  rejects one); `streamChat` has no equivalent. Cutting the interview over before that
  trim is ported breaks `LLM_PROVIDER=anthropic` on first use.
- **T003 carries FR-020.** The transcript window is the same code block the cutover
  deletes — doing it separately means writing it twice.
- **FR-020 (T003) gates T009.** Free-tier limits are reservation-based (reserved
  `max_tokens` counts against tokens-per-minute), so flipping to a free endpoint before
  the window lands buys a 429 mid-interview.
- **T007 is a gate, not a follow-up.** Vectors from different embedding models are
  semantically incomparable even at identical width; a partial re-index degrades search
  silently rather than erroring.

## T001 — Done (2026-07-15)

Verified against live providers, not mocks — 12/12 checks passed:

- Gemini path unchanged (`gemini-3.1-flash-lite` → 200, returns "OK").
- `openai-compatible` works end-to-end on `gpt-oss-120b` via Groq's OpenAI endpoint.
- FR-001: unknown `LLM_PROVIDER` now throws `LlmConfigError` instead of silently
  falling back to groq + the exhausted 100k-tok/day tier.
- `LLM_BASE_URL` cannot leak into a fixed-endpoint provider (gemini/groq/anthropic keep
  their preset base URL). This was a real bug caught during verification: reading
  `LLM_BASE_URL` before the preset pointed Gemini at the Cerebras URL staged in `.env`.
- `jsonMode` works. Discovered by surfacing the response body: OpenAI JSON mode requires
  the literal word "json" in the messages or the call 400s, so `generateOpenAi` now
  guarantees that precondition rather than trusting each call site to remember.
- All provider errors now carry the response body — "400 Bad Request" alone is
  unactionable, and the old code discarded the one field that explains the failure.

Regression: 259/259 unit tests pass. (`companyInvariants` and
`engagementPermissionIsolation` fail to *load* on a pre-existing Zod env-validation
`process.exit(1)` in `config.ts:45`; neither imports `llm-provider`.)
