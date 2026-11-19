# Plan 074: System Capability Index

**Spec**: `specs/074-capability-index/spec.md` · **Scope**: SCOPE-074
**Generated**: in-conversation (manual createSpecs fallback; not DB-synced)

---

## Technical context

- **Where it lives:** the hosted MCP server (`mcp-server/`), alongside `lifecycle-generator.ts`. Server-side, DB-only — no working-tree access, no AI in the *orchestration* path (embeddings are a deterministic API call, not editor-AI reasoning, so this respects kit-is-a-workflow-engine).
- **Stack:** Node/TS, Postgres + `pgvector`, Drizzle ORM, Pino. Embeddings via an HTTP provider abstraction.
- **DB target:** the hosted MCP production Postgres (distinct from local `.env`); `pgvector` extension must be enabled there.

## Decisions (resolved during scope authoring)

- **pgvector in the existing Postgres** — no separate vector service (KISS).
- **Source-agnostic record** — `sourcetype` scope/app/code; forward-compat to SCOPE-075 at zero cost.
- **Embeddings: Gemini default** (`text-embedding-004`, 768-dim), reusing the already-wired `GEMINI_API_KEY`; **separate** `EMBEDDINGS_PROVIDER`/`EMBEDDINGS_MODEL` knobs (generation runs on groq, which has no embeddings).
- **Bring-your-own** — a `selfhosted` OpenAI-compatible embeddings option (per-tenant base URL) for data residency (SCOPE-076); cloud default + opt-in.
- **Producer/consumer with SPEC-060, not circular** — this spec owns the store + APIs; SPEC-060 supplies owned-surface content and also queries.
- **Discovery, not authority** — search results never become written artifacts.

## Open decisions (flag, don't block)

- **Vector dimension vs the BYO future.** v1 = 768 (Gemini). If a residency customer's self-hosted embedding model differs (e.g. bge-large = 1024), that tenant needs a re-index and possibly a per-tenant dimension. Defer the per-tenant-dimension question to SCOPE-076; v1 is single-dimension.
- **Where the trigger re-embed lives.** This spec provides `index_capabilities` + the hook to call it; the owned-surface *content* is SPEC-060's. If SPEC-060 ships after 074, the hook is wired but fed by a stub until 060 lands. Confirm sequencing with SPEC-060.
- **Corpus-load vs cached index for single-scope detection.** This is SPEC-060's concern (it queries the index); noted here only because the index is the thing that makes the cached path possible.

## Architecture / file plan

- `mcp-server/src/db/schema.ts` — add `capabilityindex` table (+ `pgvector` column type).
- `mcp-server/migrations/*` — drizzle-generated migration; enable `pgvector` extension; apply to hosted prod DB.
- `mcp-server/src/utils/embeddings-provider.ts` — provider abstraction (`gemini` | `openai` | `selfhosted`), `embed(texts) → vectors`.
- `mcp-server/src/utils/capability-index.ts` — `indexCapabilities(projectId, sourceRef, sourceType, caps)` (replace-by-source + embed), `searchCapabilities(projectId, queryText, opts)` (similarity query).
- `mcp-server/src/server.ts` — register `project.index_capabilities` + `project.search_capabilities`; add to `PERMISSION_MATRIX`; call index on the create_specs / implement / buildscope-edit hooks.
- `.env.example` — `EMBEDDINGS_PROVIDER`, `EMBEDDINGS_MODEL`, `EMBEDDINGS_BASE_URL` (selfhosted).

## Phases

1. Schema + migration (`capabilityindex`, pgvector extension).
2. Embeddings provider abstraction (Gemini default; selfhosted hook).
3. `capability-index.ts` (embed, upsert-by-source, search).
4. MCP tools + `PERMISSION_MATRIX` registration.
5. Trigger wiring (re-index on the three hooks; content from SPEC-060).
6. Tests (idempotent re-index, tenant isolation, search ranking with a mock embedder).

## Risks

- **Storage residency** — index holds IP-derived embeddings; for residency customers it must run in their environment (SCOPE-076), not the hosted DB. Embeddings are not anonymization (inversion).
- **Dimension lock-in** — switching embedding model = full re-index.
- **BYO embeddings gap** — a customer LLM may be generation-only; residency embeddings path is SCOPE-076's to resolve.
- **Provider cost/limits** — embedding-everything at scale; mitigated by embedding small owned-surface units, not whole docs.
- **Migration target** — must hit the hosted MCP prod DB; local-only migration is a no-op for production.

## Conventions check (CLAUDE.md)

- TypeScript 100%, no `any`/`@ts-ignore`; Pino logging; table/column naming (lowercase, concatenated, no underscores); UUID v7 PKs; DB via the established client; new MCP tools need `PERMISSION_MATRIX`; server-side deterministic generation (no kit-internal AI).
