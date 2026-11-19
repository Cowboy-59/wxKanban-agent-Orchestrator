# Tasks 074: System Capability Index

**Spec**: `specs/074-capability-index/spec.md` · **Plan**: `specs/074-capability-index/plan.md`
**Generated**: in-conversation (manual createSpecs fallback; not DB-synced — these task IDs are not yet in wxKanban)
`[P]` = parallelizable with siblings.

---

- **T001 — Schema + pgvector migration**
  Add `capabilityindex` table to `mcp-server/src/db/schema.ts` (FR-001 columns; `vector(768)`); generate the drizzle migration; enable the `pgvector` extension. Apply to the hosted MCP prod DB.
  *Done when:* the table + cosine index + `(projectid, sourceref)` btree exist on the prod DB; `pgvector` enabled.

- **T002 [P] — Embeddings provider abstraction**
  `mcp-server/src/utils/embeddings-provider.ts`: `embed(texts: string[]) → number[][]` dispatching on `EMBEDDINGS_PROVIDER` (`gemini` default via `GEMINI_API_KEY` + `:embedContent`; `selfhosted` OpenAI-compatible `/v1/embeddings` with `EMBEDDINGS_BASE_URL`). Add the three env vars to `.env.example`.
  *Done when:* Gemini path returns 768-dim vectors; selfhosted path hits a configurable base URL; provider/model are env-driven. (FR-002)

- **T003 — Capability index module**
  `mcp-server/src/utils/capability-index.ts`: `indexCapabilities(projectId, sourceRef, sourceType, caps[])` (delete-by-source + insert + embed, in one transaction) and `searchCapabilities(projectId, queryText, {topK, sourceType, capabilityType})` (embed query + cosine top-K, tenant-scoped).
  *Done when:* re-index is idempotent per `sourceRef`; search returns ranked matches with owner/sourceref/type/score. (FR-003, FR-004)

- **T004 — Write MCP tool + permission**
  Register `project.index_capabilities` in `mcp-server/src/server.ts`; add to `PERMISSION_MATRIX`.
  *Done when:* the tool is callable and rejected-if-unregistered behavior is gone. (FR-003)

- **T005 [P] — Read MCP tool + permission**
  Register `project.search_capabilities`; add to `PERMISSION_MATRIX`.
  *Done when:* semantic search callable, tenant-scoped. (FR-004)

- **T006 — Trigger wiring**
  Call `indexCapabilities` on the `create_specs`, `implement`/task-sync, and buildscope-edit hooks (next to the existing `pushLifecycleToDb` calls). Content from SPEC-060's owned-surface; until 060 lands, wire the hook with a guarded no-op/stub.
  *Done when:* a scope change re-indexes that scope's capabilities (or no-ops cleanly when no content). (FR-003)

- **T007 [P] — Tests**
  Unit tests with a mock embedder: idempotent re-index per source; tenant isolation (no cross-company leakage); search ranking sanity; empty-result on novel query.
  *Done when:* tests green; no real provider calls in CI. (FR-003/004/005)

- **T008 [P] — Docs**
  Update `.env.example` and a short README note on the two tools + the embeddings/residency knobs.
  *Done when:* env vars + tool contracts documented.

## Dependencies / order
T001 → T003 → (T004, T005, T006). T002 before T003. T007/T008 after the module + tools. T006 is soft-blocked on SPEC-060 for real content (stub acceptable).

## Notes
- No code is written by this task list — implementation runs through `implement` once these are in wxKanban (pending MCP reconnect; see the MCP/kit follow-up).
- Residency (SCOPE-076) and the portfolio jump (SCOPE-075) are explicitly out of these tasks.
