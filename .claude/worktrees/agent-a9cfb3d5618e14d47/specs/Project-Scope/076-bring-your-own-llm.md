# SCOPE-076: Bring-Your-Own / Customer-Provided LLM & Embeddings (charter stub)

**Scope Number**: SCOPE-076
**Status**: `charter` (placeholder — not yet specified)
**Created**: 2026-06-27
**Last Reviewed**: 2026-06-27 (charter stub reserved; driven by American Litho already running its own LLM)
**Depends On**: the existing LLM provider contract (SPEC-019 / SPEC-025 FR-019 — `LLM_PROVIDER` governs server + kit) and the embeddings abstraction introduced in SCOPE-074. Conventions authority: `CLAUDE.md`.
**Related Scopes**: enables the data-residency guarantee for SCOPE-075 (Portfolio Capability Analyzer) and any AI-using scope (SCOPE-060 / 074 / 065 / 066); cloud providers remain the default for wxKanban's own dogfood.
**Source**: `specs/Project-Scope/076-bring-your-own-llm.md`

---

## Charter (intent only — full scope deferred)

Let wxKanban point its AI calls — **generation and embeddings** — at a **customer-provided LLM endpoint** instead of a third-party cloud, so a customer's code and data are processed by *their own* model and never leave their environment.

**Driving case:** **American Litho already runs its own LLM.** The capability/portfolio analysis must be **set up against Alitho's LLM** — their proprietary app code (schemas, routes, business logic) cannot be embedded or analyzed by Google/OpenAI/Anthropic. This is the concrete reason "own LLM ability" is required, and it is a likely trust requirement for any enterprise customer of the portfolio analyzer.

**Why it's a stub today (the cheap step is already in flight):** the codebase already calls groq via the **OpenAI-compatible** API, so adding a `selfhosted`/bring-your-own provider is mostly a configurable base-URL + model + key. SCOPE-074's embeddings abstraction is being built to accept a customer endpoint. Cloud (groq/gemini) stays the default for wxKanban's own use; the customer endpoint is an opt-in.

**What this scope must still decide / build:**
1. **Per-tenant endpoint configuration** — the LLM/embeddings endpoint is set per customer/project, not one global env var (different customers, different models).
2. **API adapter layer** — Alitho's LLM may or may not be OpenAI-compatible; if not, an adapter normalizes it. (Open: what API does Alitho's LLM actually expose?)
3. **Embeddings parity** — the capability index needs *embeddings* in-environment too. If the customer's model is generation-only, decide the embeddings path (a local embedding model in their environment vs an agreed exception). (Open: does Alitho's LLM serve embeddings?)
4. **Deployment / reachability model** — true "code never leaves the walls" may require running the analyzer **inside the customer's environment** (on-prem/in-tenant), not just calling their endpoint from wxKanban's hosted server. (Open: is Alitho's LLM reachable from outside with auth, or must wxKanban deploy inside?)
5. **Dimension consequence** — a customer embedding model has its own vector dimension; per SCOPE-074 this is a one-time re-index, and may imply a per-tenant index dimension.

**Residency has two halves — BYO-LLM only solves one.** The LLM stores nothing of the customer's (it is stateless weights at inference; it processes, it does not persist). So data residency splits:

- **Processing residency** — the customer's code is *read/reasoned over* by *their* LLM, not a cloud provider. Solved by this scope (point at their endpoint).
- **Storage residency** — the *embeddings + capability metadata* derived from their code persist in whatever Postgres the SCOPE-074 index runs on. If that is wxKanban's hosted DB, IP-derived data still sits on wxKanban infrastructure even though the LLM was the customer's. And embeddings are **not** anonymization (inversion can recover information). So true "nothing leaves the walls" requires the **index to live in the customer's environment too** — i.e. an on-prem / in-tenant deployment, not just a remote endpoint call. This is the load-bearing deployment decision (item 4), not a detail.

**Immediate open questions for Alitho (gate the spec):** what is their LLM / what API does it expose; does it do embeddings or generation only; and is it reachable from wxKanban's hosted server or does the work (LLM **and** the pgvector index) need to run on-prem.

**Not yet decided:** everything else — reserved number + documented intent. Run interactive `buildscope` once the Alitho LLM details are known.
