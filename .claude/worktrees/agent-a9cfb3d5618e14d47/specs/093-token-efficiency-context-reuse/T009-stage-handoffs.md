# T009 — create_specs Structured Stage Handoffs (FR-009)

Spec 093 · Task T009 (`2816ba86-87e4-448c-b5b1-4f5af1b64e94`) · FR-009 "Structured create_specs stage handoffs"

## Question

FR-009 asks the create_specs pipeline to *pass schema-validated structured artifacts between
capture → specify → clarify → plan → tasks → lifecycle, so each stage consumes structured input
rather than re-reading and re-summarizing the growing document tree.* The premise: stages re-read
prior stages' markdown and re-summarize it, burning editor-AI tokens.

## Finding — the premise does not hold for the pipeline FR-009 names

`project.create_specs` is **not a multi-call LLM pipeline.** It is:

1. **One upstream editor-AI call** that emits a single schema-validated object
   (`CreateSpecsInputSchema`, `mcp-server/src/utils/schemas.ts:345`) — `{ projectId, specNumber,
   featureName, scopeContent, phase, priority, tasks[], generateLifecycle }`. The `tasks[]` are
   already typed (`SpecTaskSchema`, schemas.ts:328).
2. Followed by **deterministic DB writes + template renders over that one object** — zero server
   model calls (`wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts:1-4`: "No AI call
   inside this handler — the editor AI does all generation").

The "capture → specify → clarify → plan → tasks → lifecycle" names are **labels on deterministic
steps**, not distinct model invocations with handoffs. Every derived document —
`spec`/`plan`/`tasks`/`tests`/`quickstart`/`lifecycle`/`checklist` — is rendered from the **same
typed object**, never from a previously-rendered file. No stage serializes to markdown and
re-parses it to feed the next. The `tasks` handoff FR-009 wanted is already typed; the derived docs
already consume structured input.

**So the inter-stage re-summarization FR-009 targeted does not exist in create_specs, and there is
no editor-token saving available from restructuring it — it is already single-pass over one
schema-validated object.**

## The three residual "markdown → structure" re-parses — all correct to leave as-is

The pipeline does re-parse markdown in three server-side spots. None is an inter-stage handoff, and
each is either correct-by-design or cheap; all are **deterministic and cost zero editor/LLM tokens**
(the premise of 093 is editor-context tokens):

1. **Preflight extractors** (`shared/preflight/src/extractors.ts`, driven from `server.ts:1889`).
   Regex-extract business problem / actors / metrics from `scopeContent` to **score** it.
   **Must stay:** preflight is a validation gate — its job is to check the actual document, so it
   *must* parse the real markdown, not trust the AI's structured self-report. Structuring this away
   would defeat the gate.
2. **Dependency-line scrape** (`parseDepsFromContent`, `scope-edges.ts:88`, from `server.ts:2140`).
   Regex-pulls the `**Depends On**` / `**Related Scopes**` lines to build scope-flow edges.
   Deterministic, server-side, cheap. This is the *one* spot that could accept structured input
   instead (see Optional below) — a robustness nicety, not a token win.
3. **Lifecycle status re-derivation** (`lifecycle-generator.ts:464/483`, from `server.ts:2110`).
   Re-derives phase/progress from the stored `status` enum via lookup tables. Reads structured DB
   rows (not markdown); deterministic.

## Decision

**FR-009 is architecturally already satisfied for the create_specs pipeline it names.** No code
change delivers the editor-token efficiency 093 targets, because the pipeline is already single-call
+ structured and the residual re-parses are deterministic (zero editor tokens) and correct to keep.

FR-009 acceptance — *"each stage consumes structured input rather than re-reading and re-summarizing
the growing document tree"* — holds today: a single schema-validated object is threaded through all
stages; the tasks handoff is typed; no derived doc re-parses a prior stage's markdown.

## Optional (NOT done — separate thread, zero token benefit)

Add optional typed `dependsOn?: string[]` / `relatedScopes?: string[]` to `CreateSpecsInputSchema`,
have the createspecs prompt emit them, and prefer them in the handler over `parseDepsFromContent`
(keeping the regex as a fallback). This would make scope-edge capture consume structured input
instead of regex-scraping the markdown — a **robustness** improvement (de-brittles the exact-format
dependency regex), not a token saving. It touches the create_specs core path + prompt + schema +
registry rebuild and saves zero editor tokens, so it is **out of 093's token-efficiency remit** and
left for a separate correctness thread if desired.

## Adjacent note

The **legacy** `wxAI-pipeline` command (`_wxAI/commands/wxAI-pipeline.md`) still documents a
multi-command flow (`wxk_spec_create` → `wxk_scope_import` → `wxk_doc_import`) — those were separate
calls that *would* re-read between steps. But those `wxk_*` tools are **no longer in the MCP tool
surface** (the current surface exposes `project.create_specs`, a single call). The legacy pipeline
is deprecated and is not the pipeline FR-009 names; if it is ever revived, structured handoffs would
apply there, but that is a separate scope.
