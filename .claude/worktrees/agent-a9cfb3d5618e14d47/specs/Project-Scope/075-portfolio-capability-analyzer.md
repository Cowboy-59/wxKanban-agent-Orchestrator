# SCOPE-075: Portfolio Capability Analyzer

**Scope Number**: SCOPE-075
**Status**: `draft`
**Created**: 2026-06-27
**Last Reviewed**: 2026-06-27 (interactive buildscope — section-by-section, approved through all eight sections; replaces the earlier charter stub)
**Depends On**: SCOPE-074 (System Capability Index — the substrate both search and report read), SCOPE-076 (Bring-Your-Own LLM — residency for company portfolios), `src/server/ai/llm-provider.ts`, `src/server/services/MarkdownPdfRenderer.ts`, the SPEC-021 ProjectLifecycle PDF pattern, `companyprojects` (company → projects). Conventions authority: `CLAUDE.md`.
**Related Scopes**: realizes the north star the SCOPE-060/073/074 work built toward; coexists with SCOPE-073 (per-project flow), SCOPE-060 (on-demand audit), SCOPE-077 (auto per-scope analysis) — consumed/parallel, not reimplemented.
**Source**: `specs/Project-Scope/075-portfolio-capability-analyzer.md`

---

## Overview

SCOPE-075 turns the SCOPE-074 capability index into a **Portfolio Capability Analyzer**: an in-app surface that looks across **all of a company's projects** to find where capabilities/scopes overlap or could be reused — and, for any new need, recommends whether to **build a new app/project, extract a shared company workflow, or add a feature to something that already exists**. It is the "see the whole company as one system, build it once" tool — the north star the SCOPE-060/073/074 work was building toward.

In v1 it lives as a per-project **Portfolio Analyzer** tab on the project-detail page (added beside Lifecycle; the six lifecycle-phase tabs are hidden). The tab has two parts:

1. **AI cross-project reuse search** — the developer asks in natural language ("do we already have invoicing?"), and it searches the company's capability index across every project for scopes/capabilities worth reusing here, listing the matches (owner project + scope + similarity) in a block under the question.
2. **Portfolio analysis report** — a generated build/extend/share recommendation across the company's projects, shown as a PDF the way the Lifecycle report is. It is generated from the capability index, never hand-authored. (v1 ships the tab with an empty-state placeholder here until the report generator lands within this scope.)

It depends on the SCOPE-074 index being **populated across the company's projects** — so this scope includes an owned-surface producer that indexes each scope's capabilities; the search and report both read that index. The LLM honors a customer's own endpoint (SCOPE-076) when data residency is required.

**Out of v1 (the expansion):** extractors that ingest *external, running apps'* DB schemas, routes, and code — the American Litho cross-application case. v1 analyzes the company's **wxKanban projects/scopes**; ingesting non-wxKanban apps is the follow-on that makes it a true cross-*application* analyzer.

## Business Problem

A company doesn't build one project — it accumulates many, over years, often by different people. Each is scoped in its own silo (which is exactly what SCOPE-060/073/074 improved *within* a project). But nothing looks *across* projects. So the same capability gets built again and again — invoicing in three projects, a customer lookup in four — because no one can see that it already exists somewhere else in the company. The reuse signal that the capability index makes possible *within* a project simply isn't surfaced *across* the portfolio.

The cost lands in three places. **Wasted build:** teams re-implement what they already own, then maintain N copies and fix the same bug N times. **Wrong structural calls:** when a new need arrives, the "do we build a new app, extend an existing one, or extract a shared workflow?" decision is made blind — usually defaulting to "build new, it's easier," which compounds the sprawl. **Lost institutional memory:** a developer joining a project has no way to ask "has the company solved this before?" and get an answer grounded in the actual scopes, so prior work is invisible and unreused.

This is the same waste the methodology fights, one level up. SCOPE-074 built the substrate that can answer "does this already exist, and who owns it?" — but only per project and only via API. Without a surface that runs that question **across the whole portfolio** and turns the answer into a recommendation, the index's value stays locked away from the people making build decisions.

At the extreme, this is the American Litho case — several autonomous apps, each hitting the database its own way, with duplication nobody can see across them. That's the motivating endpoint; but the *same* problem exists for any company with more than one wxKanban project today. v1 closes it for the company's own projects; the external-app version is the expansion.

What's missing is a place where a developer can, at the moment they're scoping new work, **see what the company already has that's relevant, and get a clear build/extend/share recommendation** — grounded in the real capability index, not guesswork or memory.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | The developer/architect scoping new work on a project — uses the Portfolio Analyzer tab to find reuse across the company and get a build/extend/share recommendation, at scoping time. |
| **Secondary Actors** | The owned-surface producer (indexes each scope's capabilities into the SCOPE-074 index across the company's projects); the app-server LLM (`llm-provider`, or the customer's endpoint via SCOPE-076) for the search synthesis + the report's recommendations; the SCOPE-074 capability index (the substrate both read); the wxKanban app (renders the tab + the report PDF). |
| **Key Value** | At the moment of scoping, a developer sees what the company already has that's relevant — across every project — and gets a clear build-new / extend-existing / extract-shared-workflow recommendation, grounded in the real index, not memory. |
| **Scope Boundary** | **IN (included)**: the owned-surface producer (populate SCOPE-074 across all company projects, kept current on scope change); company-wide cross-project capability search (AI + vector); the portfolio analysis report generator (build/extend/share recommendation) + its PDF; the Portfolio Analyzer tab (search area + results block + report/PDF) and the tab restructure (hide the 6 lifecycle-phase tabs). **OUT (excluded)**: extractors for external/non-wxKanban running apps (DB schema/routes/code ingestion — the American Litho expansion); auto-editing scopes or creating projects to act on a recommendation (advisory only); the SCOPE-074 index store/APIs (owned by 074); the per-project flow/analysis tools (SCOPE-073/060/077 — coexist/consumed, not reimplemented). |

**Owned-surface producer:** for each scope in each of the company's projects, extract the capabilities it *introduces* (processes, tables, routes, doctypes, commands) and index them into SCOPE-074's `capabilityindex` with `sourcetype='scope'` and the owner project/scope. Runs in the app server (LLM-assisted extraction), refreshed when a scope changes — this fills the index the analyzer reads.

**Cross-project search:** the developer's natural-language question is embedded and vector-searched against the `capabilityindex` for all projects in the caller's company, returning ranked matches (owner project + scope + similarity), optionally with a one-line LLM synthesis. Results list in a block under the question.

**Report generator:** reads the company's capability index, clusters capabilities, surfaces cross-project overlaps/duplication, and produces the build/extend/share recommendation as markdown → PDF (mirroring the SPEC-021 ProjectLifecycle PDF). On-demand / admin-triggered.

**Surface:** the Portfolio Analyzer tab shows the search area above and the report PDF below (empty-state until first generated). The six lifecycle-phase tabs are hidden; the tab set becomes Lifecycle, Portfolio Analyzer, Learning, Kit (plus the existing Overview/Stack/Theme/Compliance/Bug Reports).

**Residency:** all LLM calls honor the customer's own endpoint via SCOPE-076 when configured.

---

## User Scenarios

### US1 — Find reuse before building (the core)
A developer scoping new work opens the Portfolio Analyzer tab and asks "do we already have invoicing?" The search runs across every project in the company and lists matches with similarity and a one-line synthesis.
**Expected:** relevant existing scopes surface despite different wording; the developer reuses instead of rebuilding; results scoped to their company only.

### US2 — Genuinely new
The developer searches for a capability nothing in the portfolio covers.
**Expected:** an empty or low-score result set, so they treat it as net-new with confidence.

### US3 — Generate the portfolio report
An admin clicks Generate. The build/extend/share report is produced from the capability index and rendered as a PDF: clusters, cross-project overlaps, and a recommendation per cluster.
**Expected:** the PDF reflects the current index, names the overlapping projects/scopes; a no-change re-gen is stable.

### US4 — Empty-state before first generation
A developer opens the tab before any report exists.
**Expected:** the search works immediately; the report area shows a "not generated yet" empty state (not an error), with the admin Generate action.

### US5 — A residency company's portfolio stays in its walls
For a company configured with its own LLM endpoint (SCOPE-076), the search synthesis and the report are produced by their model.
**Expected:** the company's scope content is sent only to their endpoint; behavior otherwise identical.

### US6 — Index stays current
A scope is added or edited in any of the company's projects.
**Expected:** the producer re-indexes that scope, so a subsequent search reflects it without manual re-indexing.

### US7 — Tab restructure
A developer opens a project's detail page.
**Expected:** the six lifecycle-phase tabs are gone; Portfolio Analyzer sits beside Lifecycle (with Learning, Kit, and the existing Overview/Stack/Theme/Compliance/Bug Reports).

---

## Functional Requirements

### FR-001 — Owned-surface producer
Each scope's introduced capabilities MUST be indexed into the SCOPE-074 `capabilityindex` for every project in the company, kept current on scope change.

**Acceptance Criteria**:
- [ ] Extracts the capabilities a scope introduces (process/table/route/doctype/command/workflow) with owner project + scope
- [ ] Writes them to `capabilityindex` (`sourcetype='scope'`), replace-by-source per scope
- [ ] Re-indexes a scope on content change; runs in the app server (LLM-assisted), fail-open, cost-gated

### FR-002 — Company-wide cross-project search
A search MUST return capability matches from across all of the caller's company's projects.

**Acceptance Criteria**:
- [ ] Embeds the query and vector-searches `capabilityindex` for every project in the company
- [ ] Returns ranked matches with owner project, owner scope, capability, similarity
- [ ] Optionally includes a one-line LLM synthesis; returns empty cleanly when nothing matches

### FR-003 — Portfolio analysis report
An admin-triggered generator MUST produce a build/extend/share recommendation report from the company's capability index, as a PDF.

**Acceptance Criteria**:
- [ ] Clusters capabilities, surfaces cross-project overlaps, recommends new-app / shared-workflow / feature-in-existing per cluster, naming the projects/scopes involved
- [ ] Rendered as a PDF (mirrors SPEC-021 ProjectLifecycle) and upserted to `projectdocuments`
- [ ] On-demand only; a no-change re-gen is stable

### FR-004 — Portfolio Analyzer tab
The project-detail page MUST present a Portfolio Analyzer tab with the search area above and the report below.

**Acceptance Criteria**:
- [ ] Search box → results block listing matches under the question
- [ ] Report area renders the PDF when present; shows a "not generated yet" empty-state (not an error) otherwise, with an admin Generate action
- [ ] No auto-generation from the UI beyond the explicit Generate action

### FR-005 — Tab restructure
The six lifecycle-phase tabs MUST be hidden on the project-detail page.

**Acceptance Criteria**:
- [ ] design / implementation / qa / human-testing / beta / release tabs are not shown
- [ ] Lifecycle, Portfolio Analyzer, Learning, Kit are present (alongside existing Overview/Stack/Theme/Compliance/Bug Reports)
- [ ] Hiding the phase tabs does not break phase data/routes used elsewhere

### FR-006 — Provider configuration + residency
Search synthesis and report generation MUST honor the configured provider and a customer-provided endpoint.

**Acceptance Criteria**:
- [ ] Uses the standard provider config; respects a per-tenant customer endpoint via SCOPE-076 when set
- [ ] For a residency-configured company, scope content is sent only to the customer's endpoint

### FR-007 — Tenant isolation
All search/report data MUST be confined to the caller's company.

**Acceptance Criteria**:
- [ ] Search spans only the caller's company's projects; never another company's
- [ ] The report covers only the caller's company's projects
- [ ] A user cannot reach a project/company they don't belong to

### FR-008 — Advisory only
The analyzer MUST recommend, never act.

**Acceptance Criteria**:
- [ ] It never edits scopes, creates projects, or gates any operation
- [ ] Recommendations are surfaced for a human to act on; reuse decisions stay with the developer

---

## Technical Sections

- **App-side embeddings helper:** `src/server/ai/embeddings.ts` (gemini-embedding-001 @ `outputDimensionality:768`, matching the live `capabilityindex` vector(768)) — the app needs its own embed function (mcp-server's `embeddings-provider` is a separate package). Honors a customer endpoint via SCOPE-076.
- **Capability index access (same DB):** the app reads/writes `capabilityindex` directly (app DB == hosted MCP DB). Add `src/db/schema/capabilityindex.ts` mirror (or raw parameterized SQL) for the cosine query (`$1::vector` cast).
- **Owned-surface producer:** extends the SCOPE-077 app worker (or a sibling job): per changed scope, LLM-extract introduced capabilities and upsert into `capabilityindex` (replace-by-source). Fail-open, debounced, default-off env gate.
- **Cross-project search endpoint:** `POST /api/projects/:id/portfolio/search { query }` → resolve company project ids (`companyprojects WHERE companyid`) → embed query → cosine search `capabilityindex WHERE projectid IN (…)` → ranked matches (+ optional `llm-provider` synthesis). Mounted in `app.ts`; `authenticateToken` + company-scoped.
- **Report generator:** `src/server/services/PortfolioAnalysisGenerator.ts` — read company `capabilityindex`, cluster, find overlaps, `llm-provider` recommendation, markdown → PDF via `MarkdownPdfRenderer`, upsert `projectdocuments` (`doctype='PortfolioAnalysis'`). Routes: `POST /api/admin/projects/:id/portfolio/regenerate`, `GET /api/projects/:id/portfolio` (PDF inline) mirroring `projectLifecycle.ts`.
- **Frontend:** `ProjectWorkspacePage.tsx` — hide the 6 phases (`PhaseTabBar` set), add a `portfolio` tab slug beside `lifecycle`; new `PortfolioAnalyzerTab.tsx` (search box → results block; report PDF iframe when present, else empty-state + admin Generate).
- **Reuse, don't invent:** net-new = app embeddings helper, owned-surface producer (extends 077), search endpoint, `PortfolioAnalysisGenerator` + routes, the tab component. Reused = SCOPE-074 `capabilityindex`, `llm-provider`, `MarkdownPdfRenderer`, `ProjectDocumentService`, `projectLifecycle.ts` PDF pattern, SCOPE-076 endpoint, `PhaseTabBar`.

---

## Success Criteria

1. **Reuse surfaced before building.** A query for a capability that exists elsewhere returns the owning project + scope in the top 3 results despite different wording, across the company's projects. *(FR-002)*
2. **Index populated + current.** 100% of the company's scopes are indexed; a changed scope re-indexes within one producer cycle. *(FR-001)*
3. **Report generates.** Admin generation produces a build/extend/share PDF naming the overlapping projects/scopes, covering only the company's projects; a no-change re-gen is stable. *(FR-003)*
4. **Tabs restructured.** 0 of the 6 lifecycle-phase tabs are shown; Portfolio Analyzer is present beside Lifecycle. *(FR-005)*
5. **Tenant-safe.** 0% cross-company leakage — search and report span only the caller's company's projects. *(FR-007)*
6. **Residency honored.** For a residency-configured company, 100% of search/report LLM calls go to the customer's endpoint and 0% to a third party. *(FR-006)*
7. **Advisory only.** 0 scope edits, project creations, or gating actions performed by the analyzer. *(FR-008)*

---

## Constraints & Notes

### Constraints
- **Advisory only** — recommends; never edits scopes, creates projects, or gates anything.
- **Tenant-scoped to the company** — search/report span only the caller's company's projects.
- **Same database** — the app reads/writes `capabilityindex` directly (app DB == hosted MCP DB, verified); no cross-DB bridge.
- **AI in the app server only** — `llm-provider` (kit-is-a-workflow-engine); customer endpoint via SCOPE-076 for residency.
- **Report is on-demand** (admin-triggered); search is real-time.
- **Producer is cost-gated** — owned-surface indexing runs behind an env gate (default-off), like SCOPE-077.
- **Reuse, don't invent** — SCOPE-074 index, `llm-provider`, `MarkdownPdfRenderer`, `projectLifecycle` PDF pattern, `ProjectDocumentService`, `PhaseTabBar`, `companyprojects`.
- `CLAUDE.md` conventions throughout.

### Out of Scope (v1 / later)
- Extractors for external/non-wxKanban running apps — DB schema/routes/code ingestion (the American Litho cross-application expansion).
- Auto-acting on a recommendation (creating the new app, extracting the shared workflow).
- The SCOPE-074 index store/APIs (owned by 074).
- Any refactor the report recommends — surfaced for humans to execute.

### Dependencies
- SCOPE-074 (capability index), SCOPE-076 (BYO LLM / residency), `llm-provider`, `MarkdownPdfRenderer`, `ProjectDocumentService`, the SPEC-021 ProjectLifecycle PDF pattern, `PhaseTabBar`, `companyprojects`.
- Coexists with SCOPE-073/060/077.

### Open Questions (resolve in `plan.md`)
- Owned-surface extraction: LLM-assisted vs deterministic parse of the scope's Technical Sections/FRs.
- Report clustering: vector neighborhoods vs shared-substrate heuristic.
- Producer placement: extend the SCOPE-077 worker vs a dedicated job; the env-gate name.
- App-side `capabilityindex` access: drizzle schema mirror vs raw parameterized SQL.
- Search v1: pure ranked vector list vs adding an LLM synthesis line.

### Notes
- **North star realized incrementally** — v1 analyzes the company's own wxKanban projects; external-app extractors (American Litho's running apps) are the expansion to a true cross-application analyzer.
- **Educational tie** — answers "has the company already solved this?" at scoping time, with evidence, turning the portfolio into reusable institutional memory.
- Numbered SCOPE-075 (replacing the charter stub).
