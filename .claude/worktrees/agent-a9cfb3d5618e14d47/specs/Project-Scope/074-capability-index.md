# SCOPE-074: System Capability Index (semantic reuse index)

**Scope Number**: SCOPE-074
**Status**: `draft`
**Created**: 2026-06-27
**Last Reviewed**: 2026-06-27 (interactive buildscope — authored in-conversation; small infrastructure scope)
**Depends On**: SPEC-028 (Hosted MCP Deployment — the MCP tool surface + the `create_specs` / `implement` / buildscope-edit trigger hooks), Postgres + the `pgvector` extension, **Gemini embeddings** (v1 — reuses the existing `GEMINI_API_KEY` + Google generative-language API already wired in `src/server/ai/llm-provider.ts`; embeddings ride a separate `EMBEDDINGS_PROVIDER`/`EMBEDDINGS_MODEL` knob since generation runs on groq, which has no embeddings). Conventions authority: `CLAUDE.md`.
**Related Scopes**: produces nothing on its own — it is consumed by SCOPE-060 (analyzescope common-process detection + dependency derivation), SCOPE-073 (scope-flow shared-substrate connections), and SCOPE-066 (FAQ semantic search). The owned-surface *content* is produced by SCOPE-060's extraction (producer/consumer of a shared store, not a circular build dependency). **North star:** SCOPE-075 (Portfolio Capability Analyzer) — the cross-app future this index is the foundation for.
**Source**: `specs/Project-Scope/074-capability-index.md`

---

## Overview

A shared, per-project **semantic index of capabilities** — the processes, tables, routes, doctypes, commands (and, later, whole-app features) that some unit *owns* — stored as vector embeddings in Postgres via `pgvector`. It lets any feature ask "does a capability like this already exist, and who owns it?" by **semantic similarity** rather than exact text match, which is what makes cross-unit reuse detection work when two units describe the same thing in different words.

It is kept current exactly like the lifecycle and scope-flow documents: when a scope changes (`create_specs`, `implement`/task-sync, buildscope edit), that scope's owned-surface is re-embedded, so the index always reflects the latest state with no full rebuild and no stale "run `all` first" step.

It is **infrastructure, not a feature surface** — no UI of its own. It exposes a write API (index a unit's capabilities) and a read API (semantic search). SCOPE-060 both writes to it (the owned-surface it extracts) and reads from it (to detect common processes); SCOPE-073 and SCOPE-066 read from it.

The capability record is deliberately **source-agnostic**: a capability is owned by a *source*, and the source is `scope:NNN` today but can be `app:<name>` or `code:<repo>` later — at zero extra cost now. That single choice is what lets this index grow from "reuse across one project's scopes" into the cross-application analyzer described in SCOPE-075, without a schema rewrite.

## Business Problem

Reuse detection — the whole point of SCOPE-060's common-process work — only works if there is something to compare against. Comparing a scope against the entire corpus by loading every other scope into the LLM on each run is slow, token-heavy, and gets worse as the corpus grows. Worse, exact-text matching misses the real cases: two units that do the same thing described in different words. Without a semantic index, "is this already built somewhere?" is either unanswerable or prohibitively expensive — so duplicate processes and functions get built anyway, which is exactly the waste the methodology exists to prevent.

The same gap, one level up, is the motivating future (SCOPE-075): a company with several siloed apps cannot see what those apps have in common, so it keeps rebuilding the same capability in each. The cheapest way to make that future reachable is to build the reuse index now with a source-agnostic record, prove it on the easy input (this project's scopes — itself a multi-component portfolio of app + kit + MCP + cockpit + sites), and add app/code extractors later.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | The consuming features — SCOPE-060 (analyzescope), SCOPE-073 (scope-flow), SCOPE-066 (FAQ) — which call the index's write/read APIs. Not a human directly. |
| **Secondary Actors** | The hosted MCP server (hosts the store, runs the embedding pipeline, serves the APIs); the embeddings provider (Gemini by default, or a customer-provided endpoint per SCOPE-076); and downstream the developer/architect whose reuse decisions the index informs. |
| **Key Value** | Cheap, always-current, semantic "does this capability already exist, and who owns it?" — the substrate that makes reuse detection (and, later, cross-app consolidation) possible. |
| **Scope Boundary** | **IN (included)**: the `pgvector` store; the embedding pipeline; the write (index) and read (search) APIs; tenant scoping; re-embedding on the three triggers. **OUT (excluded)**: the owned-surface extraction itself (SCOPE-060); what consumers do with matches; app/code capability extractors and the build/extend/share recommendation engine (SCOPE-075); any UI. |

**Capability record (source-agnostic):** `id` (UUID v7), `projectid` (tenant scope), `sourcetype` (`scope` | `app` | `code`, extensible), `sourceref` (e.g. `073` or `app:billing@alitho`), `owner` (the unit that owns the capability), `capabilitytype` (`process` | `table` | `route` | `doctype` | `command` | `workflow`), `name`, `description` (the embedded text), `embedding` (vector), `createdat`, `updatedat`.

**Write path:** an MCP tool indexes a unit's capabilities; re-indexing a `sourceref` replaces only that source's rows. Driven by the same triggers as the lifecycle/scope-flow generators (the content is SCOPE-060's extracted owned-surface).

**Read path:** an MCP tool does a semantic similarity search (query text → ranked matches with owner + score), tenant-scoped.

**Storage:** `pgvector` in the existing Postgres — an extension plus one table, no separate vector service.

---

## User Scenarios

### US1 — Index a scope's capabilities on change
A scope's owned-surface is extracted (by SCOPE-060) and sent to the index on a trigger.
**Expected:** the source's prior rows are replaced with the current set and embedded; re-sending unchanged content yields the same rows (idempotent per `sourceref`).

### US2 — Find an existing capability by meaning
A caller searches "store and dedupe user-submitted bug reports."
**Expected:** the index returns the owning unit(s) (e.g. SCOPE-043's `feedbacksubmissions` process) ranked by similarity, even though the query shares no exact wording — tenant-scoped to the caller's project.

### US3 — Nothing similar exists
A caller searches for a genuinely novel capability.
**Expected:** an empty or low-score result set, so the caller can treat the capability as net-new rather than a duplicate.

### US4 — Source-agnostic by construction
The same index is queried for a capability whose source is an app rather than a scope (future).
**Expected:** the record and query work unchanged — `sourcetype='app'` is just another value; no schema change is required to support the SCOPE-075 portfolio use case.

---

## Functional Requirements

### FR-001 — Source-agnostic capability record
The index MUST store capabilities with a source-agnostic identity so non-scope sources are supported without schema change.

**Acceptance Criteria**:
- [ ] Each record carries `sourcetype` (`scope` | `app` | `code`, extensible), `sourceref`, `owner`, `capabilitytype`, `name`, `description`, `embedding`
- [ ] Adding a new `sourcetype` value requires no migration
- [ ] Names follow `CLAUDE.md` conventions (lowercase, concatenated, no underscores)

### FR-002 — pgvector storage + embedding pipeline
Capabilities MUST be embedded and stored in Postgres via `pgvector` — no separate vector service.

**Acceptance Criteria**:
- [ ] The `description` text is embedded via the configured embeddings provider and stored as a vector
- [ ] Similarity search uses a `pgvector` index (e.g. cosine) and is tenant-scoped
- [ ] The embeddings provider is configurable via `EMBEDDINGS_PROVIDER`/`EMBEDDINGS_MODEL` (separate from `LLM_PROVIDER`), defaulting to **Gemini** `text-embedding-004`
- [ ] The `pgvector` column dimension matches the model (768 for `text-embedding-004`); changing provider/model is a one-time full re-index migration, not a runtime toggle
- [ ] The embeddings abstraction supports a **customer-provided endpoint** (bring-your-own, configurable base URL, per tenant) so a customer's content is embedded by *their own* model and never leaves their environment — Gemini is the wxKanban-dogfood default; the customer endpoint is the data-residency path (owned by SCOPE-076). If the customer's model does not serve embeddings, that gap is SCOPE-076's to resolve, not this scope's.

### FR-003 — Write API + trigger-driven re-embedding
A write API MUST (re)index a source's capabilities, and it MUST be invoked on `create_specs`, `implement`/task-sync, and buildscope edit.

**Acceptance Criteria**:
- [ ] Re-indexing a `sourceref` deletes that source's prior rows and inserts the current set atomically
- [ ] Re-indexing unchanged content produces the same row set (idempotent)
- [ ] The write API is registered in the MCP `PERMISSION_MATRIX`

### FR-004 — Semantic search API
A read API MUST return capabilities semantically similar to a query, with owner and score, tenant-scoped.

**Acceptance Criteria**:
- [ ] Returns ranked matches with `owner`, `sourceref`, `capabilitytype`, and a similarity score
- [ ] Supports a top-K limit and optional `sourcetype`/`capabilitytype` filters
- [ ] A user only ever searches capabilities within their own company's project(s)
- [ ] The read API is registered in the MCP `PERMISSION_MATRIX`

### FR-005 — Discovery, not authority
Similarity results MUST be treated as ranked discovery candidates, never as a final written artifact.

**Acceptance Criteria**:
- [ ] The index never writes to scope docs or `projectdocuments`
- [ ] Consumers decide what to do with matches; the index only returns them

### FR-006 — Infrastructure only
The index MUST have no UI and be reached only through its APIs.

**Acceptance Criteria**:
- [ ] No client route or page is added by this scope
- [ ] All access is via the write/read MCP tools

---

## Technical Sections

- **Storage:** a new tenant-scoped table (working name `capabilityindex`) with a `pgvector` column; the `pgvector` extension enabled on the hosted MCP's production Postgres (distinct from the local `.env` DB). Migration drizzle-generated.
- **Write tool:** `project.index_capabilities` (`projectId`, `sourceRef`, `sourceType`, `capabilities[]`) — replace-by-sourceref + embed. Called by SCOPE-060's extraction at the triggers (alongside the existing `pushLifecycleToDb` / scope-flow hooks in `mcp-server/src/server.ts`).
- **Read tool:** `project.search_capabilities` (`projectId`, `queryText`, `topK`, filters) → ranked matches. Both tools MUST be added to `PERMISSION_MATRIX` (role-checker) or they are rejected as unknown tools before dispatch.
- **Embeddings:** a small provider abstraction (mirroring `llm-provider`'s shape) since generation providers (groq) don't offer embeddings. **v1 = Gemini** (`text-embedding-004`, 768-dim) via the already-wired `GEMINI_API_KEY` + `generativelanguage.googleapis.com` (`:embedContent`); OpenAI/Voyage drop in later. Knobs: `EMBEDDINGS_PROVIDER` (default `gemini`), `EMBEDDINGS_MODEL` (default `text-embedding-004`).
- **Generator/module:** `mcp-server/src/utils/capability-index.ts` (embed, upsert-by-source, search). Server-side, reads/writes the DB only.

---

## Success Criteria

1. **Source-agnostic.** A capability from a non-scope source (`app`/`code`) stores and searches with no schema change. *(FR-001)*
2. **Always current, cheap.** A scope's capabilities re-embed on the triggers; search answers "does this exist?" without loading the corpus into the LLM. *(FR-002, FR-003, FR-004)*
3. **Semantic, tenant-safe.** A meaning-based query finds the owning unit despite different wording, only within the caller's company. *(FR-004)*
4. **Discovery, not authority.** The index returns candidates and writes nothing to scopes/docs. *(FR-005)*
5. **Infrastructure only.** Reachable solely through its APIs; no UI. *(FR-006)*

---

## Constraints & Notes

### Constraints
- `pgvector` in the existing Postgres — no separate vector service (KISS, reuse-don't-invent).
- Source-agnostic record from day one — the one forward-compatible choice that keeps the SCOPE-075 portfolio future open at zero cost.
- Semantic search is approximate — discovery only, never a final/written artifact.
- Tenant-scoped consistent with existing isolation; migration targets the hosted MCP prod DB.
- Producer/consumer with SCOPE-060, not circular: this scope owns the store + APIs; SCOPE-060 supplies the content.
- **The index location is itself a residency decision.** The stored embeddings + metadata are IP-derived (and embeddings are not anonymization — inversion can recover information). For a data-residency customer (SCOPE-076), the index must live in *their* environment, not wxKanban's hosted DB — using their LLM (processing residency) does not by itself keep the index in their walls (storage residency).

### Out of Scope (v1 / later)
- App/code capability extractors (SCOPE-075 / future) — v1 indexes scope owned-surface only.
- The build/extend/share recommendation engine (SCOPE-075).
- Adding OpenAI/Voyage as alternate embeddings providers (v1 ships Gemini only, behind a swappable abstraction).
- Any UI — consumers surface results, not this scope.

### Dependencies
- SPEC-028 (MCP tool surface + trigger hooks), Postgres + `pgvector`, Gemini embeddings (reuses the existing `GEMINI_API_KEY`).
- SCOPE-060 supplies the owned-surface content (producer/consumer).
- Consumed by SCOPE-060, SCOPE-073, SCOPE-066.

### Open Questions
- **Vector dimension vs the BYO future:** v1 is 768 (Gemini); a customer self-hosted embedding model may differ (e.g. 1024), implying a per-tenant dimension / re-index — deferred to SCOPE-076.
- **Trigger content sequencing:** the re-embed hook is wired here, but the owned-surface content comes from SCOPE-060 — confirm whether 060 or 074 ships first (stub the hook until 060 lands).
- **Single-scope corpus access:** whether SCOPE-060's detection loads the corpus on the fly or reads a cached index — SCOPE-060's call, noted here because the index enables the cached path.

### Notes
- **North star (SCOPE-075):** this index is the foundation for a cross-application **Portfolio Capability Analyzer** — point it at a company's fleet of apps, find common capabilities across them, and recommend a new app vs a shared company workflow vs a feature in an existing app. The motivating real case is American Litho (`devteam@alitho.com`): several siloed apps, duplicated data access, no cross-app view. v1 deliberately stays within one project's scopes; the source-agnostic record is what makes the jump cheap.
- **Dogfood first:** wxKanban is itself a multi-component portfolio (app + kit + MCP + cockpit + marketing sites), so cross-component reuse can be tested here before pointing the analyzer at a customer.
- Numbered SCOPE-074 (071 onboarding, 072 user-home, 073 scope-flow already allocated).
