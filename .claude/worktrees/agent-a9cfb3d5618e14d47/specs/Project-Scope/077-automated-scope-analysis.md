# SCOPE-077: Automated Scope Analysis (server-side, on-change)

**Scope Number**: SCOPE-077
**Status**: `draft`
**Created**: 2026-06-27
**Last Reviewed**: 2026-06-27 (Amendment A — added the orchestrator in-chat reuse check at buildscope authoring; approved)
**Depends On**: SCOPE-060 (analyzescope — the analysis logic + the dependency-write path this reuses), SCOPE-074 (System Capability Index — common-process search), SCOPE-073 (scope-flow — structural facts), SCOPE-076 (Bring-Your-Own LLM — customer endpoint / residency), `src/server/ai/llm-provider.ts` (`generateOnce`), SCOPE-063 (`BugSuggestionService` fail-open pattern), SPEC-028 (Hosted MCP — read/write tools + events log for the trigger bridge). Conventions authority: `CLAUDE.md`.
**Related Scopes**: the automated counterpart to SCOPE-060 (on-demand editor command); mirrors SPEC-059's deterministic-Part-1 / AI-Part-2 split; the continuous-analysis precondition for SCOPE-075 (Portfolio Capability Analyzer).
**Source**: `specs/Project-Scope/077-automated-scope-analysis.md`

---

## Overview

A server-side service in the wxKanban app that automatically runs the *semantic* half of scope analysis whenever a scope changes — deriving the scope's true `Depends On`, detecting processes that already exist elsewhere (for reuse), and surfacing gaps and issues against the rest of the system — so the analysis is always current without a developer remembering to run `/analyzescope` by hand.

It is the automated counterpart to SCOPE-060. SCOPE-060 stays the on-demand, interactive, human-invoked deep dive in the editor; this scope runs the same class of analysis automatically, in the background, debounced on every scope change. The two are deliberately separate: one is the manual microscope, the other is the always-on monitor.

It follows SPEC-059's two-path model precisely. The *deterministic* findings already auto-refresh in the MCP on scope-change triggers — common-process detection via the SCOPE-074 capability index, and structural facts (cycles, broken/forward deps, namespace collisions, blast radius) via the SCOPE-073 scope-flow graph. This scope adds the *AI-driven* findings, generated server-side in the wxKanban app via `llm-provider` — which the app legitimately uses (kit-is-a-workflow-engine keeps AI out of the kit/MCP, not out of the app server, per the SPEC-059 / SPEC-065 / SPEC-063 precedent).

It runs debounced on every scope change (`create_specs`, `implement`/task-sync, buildscope-edit), asynchronously and non-blocking — it never gates the edit, mirroring SCOPE-073's warn-only philosophy and tolerating brief staleness. Its outputs are persisted (the derived `Depends On` written back, the findings and reuse recommendations stored as a per-scope document and surfaced in-app), and they feed the same 074 index and 073 flow the deterministic half uses. The LLM call uses the configured provider, and a customer's own endpoint via SCOPE-076 when data residency is required.

It does not replace the editor command (060) or the deterministic generators (073/074); it orchestrates the deterministic layer and adds the automatic AI layer on top.

## Business Problem

The valuable half of scope analysis is the half that depends on a human remembering to run it — and therefore the half that decays. The deterministic checks we are already automating (structural validation in 073, duplicate-capability detection in 074) fire on every scope change without anyone asking. But the *semantic* judgment — working out a scope's true dependencies, deciding that a process it describes already exists somewhere and should be reused, and spotting what it is missing relative to the rest of the system — only happens when a developer manually invokes `/analyzescope`. In practice that means it mostly does not happen: the command is one more discretionary step, and discretionary steps get skipped under deadline.

The cost of skipping it is exactly the waste the methodology exists to prevent. A scope's `Depends On` stays incomplete or wrong (the namespace collisions and the `SCOPE-027` / `SPEC-046/048` errors already found are this failure mode). Duplicate processes get built because nobody ran the reuse check at authoring time. Gaps surface in QA or production instead of at the scope stage where they are cheap. And because the derived dependencies feed the 074 index and the 073 flow, stale manual analysis means the *automated* layers are working from incomplete data — the whole reuse-and-connection system is only as current as the last time someone happened to run the manual command.

There is also a scale wall. The on-demand model is already strained across this project's ~50 scopes; it is completely infeasible at the portfolio scale that SCOPE-075 targets, where the analysis must run continuously across many apps with no human in the loop. Manual analysis is a dead end for the north star — automation is not a convenience there, it is a precondition.

What is missing is for the semantic analysis to run automatically, on every change, with no one having to remember — so the derived dependencies, reuse recommendations, and gap findings stay continuously accurate and keep the deterministic layers fed, while the manual deep-dive remains available for when a human wants to go deeper.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | The developer/architect authoring or editing scopes — the analysis runs automatically on their changes and writes back the derived `Depends On`, reuse recommendations, and gap findings they consume; they never invoke it. |
| **Secondary Actors** | The wxKanban app server's scope-analysis worker (event-triggered, debounced); the LLM provider (the configured provider, or the customer's own endpoint via SCOPE-076); and the MCP deterministic layer (SCOPE-073 structural facts + SCOPE-074 reuse candidates) whose outputs this service consumes and augments. |
| **Key Value** | The high-judgment half of scope analysis stays continuously current with zero human initiative — keeping dependencies, reuse recommendations, and gaps accurate, and keeping the deterministic layers fed with correct semantic data. |
| **Scope Boundary** | **IN (included)**: the scope-change event + debounce pipeline; the server-side LLM analysis (derive `Depends On`, reuse recommendations, gap findings); writing the derived `Depends On` back; persisting findings as a per-scope document and surfacing them in-app; consuming and augmenting the 073/074 deterministic outputs; **and the orchestrator (MCP) in-chat reuse check at buildscope authoring — the SCOPE-074 capability search surfaced inline in the AI chat (Amendment A, FR-008)**. **OUT (excluded)**: the deterministic generators themselves (owned by 073/074); the on-demand editor command (SCOPE-060); the interactive "ask what to do" *human decision* (the orchestrator surfaces the match; the human decides reuse/extend/proceed); the customer-LLM endpoint plumbing (SCOPE-076); the cross-app portfolio analysis (SCOPE-075); and any change-blocking or gating (always non-blocking). |

**Trigger & debounce:** a scope change emits an event (`create_specs`, `implement`/task-sync, buildscope-edit). The worker debounces — waiting until edits settle — then runs the analysis once for that scope, asynchronously.

**Analysis:** the worker assembles the scope content plus the deterministic context already computed (SCOPE-074 common-process candidates, SCOPE-073 structural facts) and calls `llm-provider` to produce the semantic findings: the scope's true `Depends On`, reuse recommendations, and gaps relative to the current system.

**Persist & feed:** the derived `Depends On` is written back through the same path SCOPE-060 uses; the findings and recommendations are stored as a per-scope `projectdocuments` document and surfaced in-app; the results feed the 074 index and 073 flow.

**Fail-open:** the worker runs async; on LLM or other failure it logs and retries, and never blocks the originating operation — mirroring SCOPE-063's `BugSuggestionService` resilience and SCOPE-073's warn-only stance.

---

## User Scenarios

### US1 — A scope edit auto-refreshes its analysis
A developer edits a scope's content and moves on. A few seconds after the edits settle, the worker derives the scope's `Depends On`, checks its processes against the system, and finds the gaps.
**Expected:** the derived `Depends On` is written back, the findings + reuse recommendations are stored and visible in-app, and the developer did nothing to trigger it.

### US2 — Reuse is caught without anyone asking
A developer writes a scope describing "store and dedupe submitted bug reports," unaware SCOPE-043 already owns that via `feedbacksubmissions`. The auto-analysis (using 074's match) surfaces a reuse recommendation naming SCOPE-043.
**Expected:** the recommendation appears automatically; the duplicate is flagged at authoring time, not after it ships — and no one ran `/analyzescope`.

### US3 — The LLM is down; nothing breaks
The provider is unreachable or slow when a scope changes.
**Expected:** the originating operation (`create_specs` / edit / `implement`) completes normally; the analysis fails open, is logged, and retried later; the edit is never blocked or delayed waiting on the LLM.

### US4 — Rapid edits don't spam the LLM
A developer makes ten edits to a scope over a minute.
**Expected:** the debounce collapses them into a single analysis run after the edits settle — not ten — keeping LLM cost and noise bounded.

### US5 — A residency customer's content never leaves their walls
For a customer configured with their own LLM endpoint (SCOPE-076), a scope change triggers analysis against *their* model.
**Expected:** the scope content is sent only to the customer's endpoint, not a third-party provider; behavior is otherwise identical.

### US6 — The deep dive still exists
A developer wants more than the always-on summary and runs `/analyzescope` (SCOPE-060) in the editor for a deeper pass.
**Expected:** the on-demand command works unchanged alongside the automatic service; they don't conflict, and both read/write the same persisted analysis.

### US7 — Reuse is answered in the chat, at authoring time (Amendment A)
A developer describes a new scope in buildscope — "store and dedupe submitted bug reports." Before the scope is saved, the orchestrator runs the SCOPE-074 capability search and replies inline in the chat, naming the existing scope (SCOPE-043) that already owns that process.
**Expected:** the overlap is surfaced conversationally while the developer is still authoring — no document to open, no `/analyzescope` run. The orchestrator names the owning SCOPE/SPEC + title and offers reuse / extend / proceed; the developer makes the call. Warn-only; authoring is never blocked.

---

## Functional Requirements

### FR-001 — Scope-change event + debounce pipeline
The app server MUST run the analysis automatically on scope-change events (`create_specs`, `implement`/task-sync, buildscope-edit), debounced.

**Acceptance Criteria**:
- [ ] Each of the three triggers enqueues an analysis for the changed scope
- [ ] Rapid successive changes to one scope collapse into a single run after a quiet interval (debounce)
- [ ] The analysis runs asynchronously — the originating operation returns without waiting for it

### FR-002 — Server-side semantic analysis via `llm-provider`
The worker MUST produce the semantic findings using the app's `llm-provider`, augmenting the deterministic context.

**Acceptance Criteria**:
- [ ] It assembles the scope content + SCOPE-074 common-process candidates + SCOPE-073 structural facts before calling the LLM
- [ ] It produces: the derived `Depends On`, reuse recommendations (each naming the owning scope), and gap/missing findings
- [ ] No AI runs in the kit/MCP — the LLM call is in the app server only

### FR-003 — Write back the derived `Depends On`
The derived dependencies MUST be persisted to the scope through the same mechanism SCOPE-060 uses.

**Acceptance Criteria**:
- [ ] Writes use the SCOPE-060 dependency-write path (no second, divergent writer)
- [ ] Writing is idempotent — an unchanged derivation produces no spurious diff
- [ ] The derived `Depends On` feeds the SCOPE-074 index and SCOPE-073 flow

### FR-004 — Persist + surface findings
Findings and recommendations MUST be stored per scope and viewable in-app.

**Acceptance Criteria**:
- [ ] Stored as a per-scope `projectdocuments` document (its own doctype), one row per scope, upserted
- [ ] Surfaced in-app alongside the scope (and reconcilable with the on-demand report)
- [ ] No finding carries a blocking severity — recommendations and warnings only

### FR-005 — Fail-open and non-blocking
The service MUST never block or delay the originating operation, and MUST tolerate failure.

**Acceptance Criteria**:
- [ ] `create_specs` / edit / `implement` complete normally regardless of analysis success or LLM availability
- [ ] LLM/analysis failures are logged and retried; a persistent failure degrades silently (last good analysis remains)
- [ ] Mirrors SCOPE-063 `BugSuggestionService` fail-open behavior

### FR-006 — Provider configuration + residency
The LLM call MUST honor the configured provider and a customer-provided endpoint.

**Acceptance Criteria**:
- [ ] Uses the standard provider config; respects a per-tenant customer endpoint via SCOPE-076 when set
- [ ] For a residency-configured tenant, scope content is sent only to the customer's endpoint, never a third-party provider

### FR-007 — Coexistence with SCOPE-060 and the deterministic layers
The automatic service MUST share state with, not duplicate, the on-demand command and the deterministic generators.

**Acceptance Criteria**:
- [ ] The automatic and on-demand (SCOPE-060) analyses read/write the same persisted analysis + `Depends On` — no divergent stores
- [ ] The deterministic findings come from SCOPE-073/074; this service does not re-implement them
- [ ] Running the on-demand command and the automatic service on the same scope does not conflict or double-write

### FR-008 — Orchestrator in-chat reuse check at buildscope authoring (Amendment A)
The MCP orchestrator MUST run the SCOPE-074 capability search during scope authoring (buildscope) and return any reuse match inline in the chat, before the scope is persisted.

**Acceptance Criteria**:
- [ ] The search runs on the authored feature description during buildscope, before the scope is saved
- [ ] A match returns the owning SCOPE/SPEC number + title inline in the chat response (reuse / extend / proceed)
- [ ] No match returns nothing — the check is silent when there is no overlap
- [ ] Warn-only: it never blocks or gates authoring; the developer makes the reuse decision
- [ ] It reuses `project.search_capabilities` (SCOPE-074) — no second search path, and no LLM call in the kit/MCP (deterministic search only)
- [ ] It fails open: a search error logs and authoring proceeds normally

---

## Technical Sections

- **Worker / service:** a new `src/server/services/AutoScopeAnalysisService.ts` in the wxKanban app server, modeled on `src/server/services/BugSuggestionService.ts` (SCOPE-063) for fail-open + throttled on-demand AI, and on SPEC-059's server-side AI-flow path. Calls `src/server/ai/llm-provider.ts` (`generateOnce`); respects a customer endpoint via SCOPE-076.
- **Trigger bridge (central integration to resolve):** scope changes originate in the hosted MCP (`create_specs`, `implement`) and buildscope-edit, but the analysis runs in the app server — different runtimes, and the hosted MCP DB is distinct from the app DB. Candidate mechanisms (decided in `plan.md`): (a) the MCP writes a `project event` on scope change and the app polls/subscribes + enqueues; (b) an MCP→app webhook; (c) Postgres `LISTEN/NOTIFY`. The worker reads scope content + deterministic context via MCP read tools, not cross-DB queries.
- **Deterministic context assembly:** before the LLM call, fetch SCOPE-074 `project.search_capabilities` (common-process candidates) + the SCOPE-073 scope-flow/graph (structural facts) and include them in the prompt so the LLM augments rather than recomputes them.
- **Debounce:** per-scope debounce; in-memory timer vs durable work queue (survives deploys) decided in `plan.md` — durable preferred if runs must not be lost.
- **Write-back + persistence:** derived `Depends On` written through the SCOPE-060 dependency-write path (app→MCP), no second writer. Findings upserted to `projectdocuments` under a new doctype (working name `AutoScopeAnalysis`), one row per scope, reconcilable with SCOPE-060's on-demand report.
- **Fail-open:** async, non-blocking; failures logged + retried with backoff; last good analysis retained (SCOPE-063 pattern, SCOPE-073 warn-only).
- **Reuse, don't invent:** net-new is the `AutoScopeAnalysisService`, the trigger bridge, and the `AutoScopeAnalysis` doctype. `llm-provider`, the fail-open pattern, the dependency-write path, capability search, the structural graph, and the customer endpoint are all reused.
- **Orchestrator in-chat reuse check (Amendment A, FR-008):** lives in the **MCP orchestrator** (not the app server), wired into the buildscope authoring flow. It calls `project.search_capabilities` (SCOPE-074) on the authored feature description and folds any match into the buildscope chat response — deterministic search only, no LLM in the kit/MCP. This is the synchronous, conversational counterpart to the app-server background path: same 074 search underneath, surfaced at the earliest possible moment (before the scope is saved) instead of after. Fail-open: a search error is logged and authoring continues. Gated on SCOPE-074's hosted-DB migration + `search_capabilities` tool registration landing first.

---

## Success Criteria

1. **Zero-initiative coverage.** 100% of scope changes trigger an analysis run automatically — no manual `/analyzescope` required for dependencies and findings to refresh. *(FR-001)*
2. **Never blocks.** 0 added blocking latency, and 100% of `create_specs`/edit/`implement` operations still succeed even when the LLM provider is unreachable. *(FR-005)*
3. **Bounded cost.** N rapid edits to a single scope within the debounce window produce exactly 1 analysis run. *(FR-001)*
4. **Always current.** Derived `Depends On`, reuse recommendations, and gap findings reflect the latest scope content within one debounce cycle of the last change. *(FR-002, FR-003, FR-004)*
5. **Reuse caught hands-free.** A scope describing a process an existing scope already owns produces a reuse recommendation naming that owner, with no manual run. *(FR-002)*
6. **Residency honored.** For a residency-configured tenant, 100% of scope content is sent only to the customer's endpoint and 0% to a third-party provider. *(FR-006)*
7. **One store, no divergence.** The automatic service and the on-demand SCOPE-060 command read and write the same persisted analysis + `Depends On`, with 0 double-writes or conflicts. *(FR-007)*
8. **Reuse answered in-chat at authoring time.** A scope authored in buildscope that overlaps an existing scope produces an inline chat reply naming the owner, before the scope is saved, with 0 blocking of authoring. *(FR-008)*

---

## Constraints & Notes

### Constraints
- **Non-blocking / fail-open is absolute** — never blocks or delays `create_specs`/edit/`implement`; a failed analysis degrades silently to the last good result.
- **AI runs in the app server only** — never the kit/MCP (kit-is-a-workflow-engine).
- **Reuse, don't invent** — the SCOPE-060 dependency-write path, the 073/074 deterministic outputs, `llm-provider`, SCOPE-063's fail-open pattern, and the SCOPE-076 customer endpoint are reused; net-new is the worker, the trigger bridge, and the `AutoScopeAnalysis` doctype.
- **Cross-host discipline** — the app reaches scope content + deterministic context through MCP read APIs, not direct coupling to the hosted MCP database.
- **Cost-bounded** — debounced per scope; one run per quiet interval.
- `CLAUDE.md` conventions throughout (naming, TS, Pino, no AI in the kit).

### Out of Scope (v1 / later)
- The deterministic generation itself (owned by SCOPE-073 / SCOPE-074).
- The on-demand editor command (SCOPE-060).
- The interactive "ask what to do" reuse *decision* (a human makes it — the orchestrator surfaces the match, per FR-008, but does not decide).
- The customer-LLM endpoint plumbing (SCOPE-076).
- The cross-app portfolio analysis (SCOPE-075).
- Any change-blocking or gating (always non-blocking).

### Dependencies
- SCOPE-060 (analysis logic + dependency-write path), SCOPE-074 (capability index + search), SCOPE-073 (structural graph), SCOPE-076 (customer-LLM / residency), `llm-provider`, SCOPE-063 (fail-open pattern), SPEC-059 (two-path precedent), SPEC-028 (MCP read/write tools + events log for the trigger bridge).

### Open Questions
- **Trigger bridge mechanism:** events-log poll vs MCP→app webhook vs Postgres `LISTEN/NOTIFY`, and how the app crosses the MCP-vs-app DB boundary (lean: read via MCP tools).
- **Debounce implementation:** in-memory timer vs a durable work queue that survives deploys.
- **Doctype reconciliation:** whether `AutoScopeAnalysis` is the same doctype SCOPE-060 writes on-demand or a sibling that reconciles with it.
- **Sequencing:** this is the last of the family — it depends on SCOPE-060/073/074/076 existing first.

### Notes
- **North-star enabler:** continuous automated analysis is the precondition for SCOPE-075 — manual analysis cannot scale to a portfolio of apps.
- **Precedent:** SPEC-059's deterministic-Part-1 / AI-Part-2 split is the exact shape being followed.
- **Educational tie:** surfacing reuse and gaps automatically at authoring time teaches the dependency-graph and DRY thinking the methodology exists to build — without the developer having to remember to ask.
- Numbered SCOPE-077 (after 076 bring-your-own-LLM).
- **Amendment A (2026-06-27):** added the orchestrator in-chat reuse check at buildscope authoring (US7, FR-008, success criterion 8) — the SCOPE-074 capability search answered inline in the AI chat, warn-only, deterministic (no kit/MCP LLM). It is the synchronous, authoring-time sibling of the existing app-server background path; both ride the same 074 search. Approved by Andy 2026-06-27 (trigger = buildscope authoring; deterministic-only confirmed).
