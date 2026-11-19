# Spec 074: System Capability Index (semantic reuse index)

**Spec Number**: 074 (1:1 with SCOPE-074 — same integer in both namespaces, deliberately, to avoid a SCOPE/SPEC collision)
**Status**: `draft`
**Created**: 2026-06-27
**Scope**: `specs/Project-Scope/074-capability-index.md`
**Generated**: in-conversation (manual createSpecs fallback — hosted MCP `project.create_specs` was not connected in-session; not pushed to DB)

---

## Overview

A per-project **semantic capability index** stored in Postgres via `pgvector`. It records the capabilities each unit *owns* (processes, tables, routes, doctypes, commands — and later whole-app features) and lets other features ask "does a capability like this already exist, and who owns it?" by vector similarity. Infrastructure only: no UI, reached through two MCP tools (one write, one read). It is the substrate behind SPEC-060's reuse/dependency detection, SCOPE-073's shared-substrate edges, and SCOPE-066's FAQ search.

The capability record is **source-agnostic** (`sourcetype` = `scope` | `app` | `code`) so the same index scales from this project's scopes to a customer's app fleet (SCOPE-075) with no schema change.

## Functional Requirements

### FR-001 — Source-agnostic capability record
Capabilities are stored with `{ id, projectid, sourcetype, sourceref, owner, capabilitytype, name, description, embedding, createdat, updatedat }`.
- Adding a new `sourcetype` value requires no migration.
- `capabilitytype` ∈ `process | table | route | doctype | command | workflow`.
- Names follow CLAUDE.md conventions (lowercase, concatenated, no underscores).

### FR-002 — Embedding + pgvector storage
`description` is embedded via the configured embeddings provider and stored as a `pgvector` column; similarity search is tenant-scoped.
- Default provider **Gemini** `text-embedding-004` (768-dim); configurable via `EMBEDDINGS_PROVIDER` / `EMBEDDINGS_MODEL` (separate from `LLM_PROVIDER`).
- A `selfhosted` (OpenAI-compatible `/v1/embeddings`, configurable base URL, per-tenant) option exists for bring-your-own / data-residency (SCOPE-076); cloud is the default, self-hosted is opt-in.
- Column dimension is fixed to the active model; switching provider/model is a one-time full re-index, not a runtime toggle.

### FR-003 — Write API + idempotent re-index
`project.index_capabilities` (re)indexes a source's capabilities.
- Re-indexing a `sourceref` deletes that source's prior rows and inserts the current set atomically.
- Re-indexing unchanged content yields the same row set (idempotent).
- Invoked on `create_specs`, `implement`/task-sync, and buildscope edit (content supplied by SPEC-060's owned-surface extraction).
- Registered in the MCP `PERMISSION_MATRIX`.

### FR-004 — Semantic search API
`project.search_capabilities` returns capabilities similar to a query text.
- Returns ranked matches with `owner`, `sourceref`, `capabilitytype`, similarity score.
- Supports `topK` and optional `sourcetype` / `capabilitytype` filters.
- Tenant-scoped: a caller only searches its own company's project(s).
- Registered in the MCP `PERMISSION_MATRIX`.

### FR-005 — Discovery, not authority
Similarity results are ranked discovery candidates only.
- The index never writes to scope docs or `projectdocuments`.
- Consumers decide what to do with matches.

### FR-006 — Infrastructure only
- No client route or page is added by this spec.
- All access is via the two MCP tools.

## Data Model

New tenant-scoped table `capabilityindex`:

| column | type | notes |
|---|---|---|
| id | uuid (v7) | PK |
| projectid | uuid | FK → projects; tenant scope |
| sourcetype | text | `scope` \| `app` \| `code` (extensible) |
| sourceref | text | e.g. `073` or `app:billing@alitho` |
| owner | text | owning unit identifier |
| capabilitytype | text | `process` \| `table` \| `route` \| `doctype` \| `command` \| `workflow` |
| name | text | short label |
| description | text | the embedded text |
| embedding | vector(768) | pgvector; dim = active model |
| createdat / updatedat | timestamptz | |

Indexes: a `pgvector` similarity index (cosine) on `embedding`; a btree on `(projectid, sourceref)` for replace-by-source.

## API (MCP tools)

- **`project.index_capabilities`** — `{ projectId, sourceRef, sourceType, capabilities: [{ owner, capabilityType, name, description }] }` → replaces the source's rows, embeds, returns count.
- **`project.search_capabilities`** — `{ projectId, queryText, topK?, sourceType?, capabilityType? }` → `[{ owner, sourceRef, capabilityType, name, score }]`.

Both require `PERMISSION_MATRIX` entries (role-checker rejects unregistered tools before dispatch).

## Embeddings provider abstraction

A small module mirroring `src/server/ai/llm-provider.ts`'s shape (generation providers like groq don't serve embeddings). Providers: `gemini` (default, via existing `GEMINI_API_KEY` + `generativelanguage.googleapis.com:embedContent`), `openai`, `selfhosted` (OpenAI-compatible base URL). Selected by `EMBEDDINGS_PROVIDER`; model by `EMBEDDINGS_MODEL`.

## Non-functional

- **Determinism / idempotence:** re-indexing unchanged content is stable; search ranking is approximate (discovery only).
- **Tenant isolation:** every read/write scoped by `projectId`; a user never reaches another company's rows.
- **Residency:** the index *location* is itself a residency decision — stored embeddings are IP-derived and not anonymization (inversion risk). For a residency customer, the index runs in their environment (SCOPE-076), not wxKanban's hosted DB.
- **Logging:** Pino only, no `console.log`. DB access via `src/db/client.ts` pattern. 100% TypeScript, no `any`.

## Integration / triggers

The write API is called on the same hooks where the lifecycle generator runs (`mcp-server/src/server.ts` ~2000 create_specs, ~2453 implement/task-sync) plus the buildscope-edit path. The *content* (owned-surface) is produced by SPEC-060; this spec provides the API and the trigger wiring to call it.

## Out of Scope

- App/code capability extractors and the build/extend/share engine (SCOPE-075).
- The owned-surface extraction itself (SPEC-060).
- OpenAI/Voyage as shipped providers (abstraction supports them; v1 ships Gemini + the selfhosted hook).
- Any UI.
