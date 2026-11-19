# SCOPE-060: Scope Analysis (`/analyzescope`)

**Scope Number**: SCOPE-060
**Status**: `draft`
**Created**: 2026-06-19
**Last Reviewed**: 2026-06-27 (**Amendment A** — single-scope determination, dependency authoring & reuse dedup; see Amendments). Originally 2026-06-19 (authored in-conversation; lightweight dev-tooling scope).
**Depends On**: SPEC-019 (Agent Orchestrator Kit — `/analyzescope` is an auto-discovered consumer-side command in `_wxAI/commands/`), SCOPE-013 (scopeAudit — sibling read-only audit discipline), SCOPE-016 (help — Cockpit Help auto-discovery surfaces the command), SCOPE-074 (System Capability Index — Amendment A's common-process detection queries it for reuse, and writes extracted owned-surface to it). Conventions authority: `CLAUDE.md`.
**Related Scopes**: complements SPEC-059 (per-scope Process Flow report — `/analyzescope --flow` reuses its Mermaid `flowchart TD` conventions but never writes its `ScopeProcessFlow` doctype); complements `/wxAI-analyze` (which audits `spec.md`↔`plan.md`↔`tasks.md` *inside one implementation spec folder* — this scope audits the upstream `Project-Scope/*.md` docs instead).
**Source**: `specs/Project-Scope/060-scope-analysis.md`

---

## Overview

A read-only `/analyzescope` slash command that audits **scope definitions** (`specs/Project-Scope/NNN-*.md`) — the source documents every downstream spec, task, and line of code is generated from. It runs editor-AI-driven (the kit stays a **workflow engine**; the editor AI does the reasoning, the command persists the report). It audits a **single scope** for holes, ambiguity, and internal contradictions, or the **whole corpus** for cross-scope conflicts (boundary overlap, contradictory decisions, duplicate requirements, broken/cyclic dependency graphs, schema/command/naming collisions, and the SCOPE-NNN vs SPEC-NNN integer clashes). An optional `--flow` renders an audit-annotated process-flow diagram per scope so holes land *on the flow*, not just in a table.

The command carries an **adversarial-auditor + veteran-mentor persona**: it hunts for the gap with evidence (every finding quotes the offending line) and, for each finding, adds a one-line *Why it matters* that teaches the failure mode it prevents — serving the kit's career-changer audience.

## Business Problem

Scopes are authored carefully via interactive `buildscope`, but section-by-section and single-doc. Drift and cross-scope conflict accumulate silently: two scopes claim the same table or slash command, a `Depends On` points at an archived scope, a deferral is handed to a scope that never took ownership, or a doc calls itself "Spec 047" while SPEC-047 is a different feature. Nothing audits the scope layer today — `/wxAI-analyze` only checks consistency *inside* one implementation spec folder. These defects are cheapest to fix at the scope stage, before they propagate into specs and code. `/analyzescope` gives a repeatable, deterministic read → analyze → persisted-report pass over one scope or all of them, and teaches the reader to catch the same issues themselves.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | The developer/architect maintaining the scope corpus (and, downstream, any kit consumer auditing their own scopes). |
| **Secondary Actors** | The **editor AI agent** (runs the analysis); the **kit** (ships the command, persists the report). |
| **Key Value** | Scope-layer defects (holes, ambiguity, cross-scope conflicts) are caught and *taught* before they reach specs/code — deterministically and read-only. |
| **Capture mechanism** | A `/analyzescope` editor-AI-driven command (single / `all` / `--cross` / `--flow` modes). |
| **Storage** | A markdown report under `specs/Project-Scope/_analysis/` (per-scope or `cross-scope-analysis.md`). Disk-only in v1 (repo-wide docs, not per-project `projectdocuments`). |
| **Scope Boundary** | **IN**: read-only audit of `Project-Scope/*.md`; single-scope passes (completeness, FR quality, coverage symmetry, ambiguity, internal contradiction, dependency hygiene, convention alignment, metadata); cross-scope passes (boundary overlap, contradictory decisions, duplicate requirements, dependency-graph integrity, schema/migration & command collisions, numbering collisions, orphaned deferrals, terminology drift); deterministic IDs; persisted markdown report; optional audit-annotated process-flow diagram (`--flow`). **OUT**: editing scope docs to "fix" findings (remediation is offered, never auto-applied); downstream spec/plan/tasks fidelity (owned by `/wxAI-analyze`); writing SPEC-059's `ScopeProcessFlow` doctype; any MCP tool / server handler (pure editor-AI prompt in v1); persisting to `projectdocuments` (deferred). |

---

## User Scenarios

### US1 — Audit one scope before generating specs
A developer finishing a scope runs `/analyzescope 047`. The report flags FRs with weak acceptance criteria, uncovered scenarios, and convention violations, each with a *Why it matters* line, and writes `specs/Project-Scope/_analysis/047-stack-style-analysis.md`. No scope file is modified.
**Expected:** a deterministic, evidence-backed report; the scope `.md` is untouched; a re-run with no edits diffs empty.

### US2 — Find conflicts across the whole corpus
Before a planning session, the developer runs `/analyzescope all`. The report includes a cross-scope conflict matrix and a dependency-graph summary, surfacing boundary overlaps, broken/cyclic dependencies, duplicate requirements, and SCOPE-vs-SPEC numbering collisions.
**Expected:** every scope is loaded token-efficiently; real conflicts are flagged with the two scopes and the offending lines; clean pairs are not false-flagged.

### US3 — See the holes on the flow
The developer adds `--flow` (`/analyzescope 047 --flow`). Each analyzed scope gets a Mermaid `flowchart TD` derived from its actors/scenarios/FRs, with gap nodes marked and footnoted to finding IDs, and a one-line note on what the diagram reveals that the prose hid.
**Expected:** the diagram is traceable to the scope text (no invented steps); gaps are visually marked and mapped to findings; it does not write SPEC-059's `ScopeProcessFlow` doctype.

---

## Functional Requirements

### FR-001 — Read-only scope audit with persisted report

`/analyzescope` MUST analyze `Project-Scope/*.md` without modifying any scope doc, and MUST persist its findings report under `specs/Project-Scope/_analysis/`.

**Acceptance Criteria**:
- [ ] No file under `Project-Scope/` (other than `_analysis/`) is modified by a run
- [ ] A single-scope run writes `_analysis/<NNN>-<slug>-analysis.md`; an `all` run writes `_analysis/cross-scope-analysis.md`
- [ ] The same report is emitted to chat and to the file

### FR-002 — Mode selection (single / all / cross / flow)

The command MUST parse `{{args}}` into modes: `<NNN>` (single), `all`/`--all` (corpus + cross matrix), `<NNN> --cross` (single + cross), and `--flow` addable to any.

**Acceptance Criteria**:
- [ ] `<NNN>` resolves to one file by prefix; ambiguous/no match stops with a message
- [ ] `all` analyzes every scope and produces the cross-scope matrix + dependency-graph summary
- [ ] `--flow` adds an audit-annotated process-flow diagram per analyzed scope

### FR-003 — Single-scope detection passes

A single-scope audit MUST run: structural completeness, FR quality (non-empty testable acceptance criteria), coverage symmetry (scenario↔FR↔success-criterion), ambiguity, internal contradiction, intra-doc dependency hygiene, convention alignment (`CLAUDE.md`), and metadata sanity.

**Acceptance Criteria**:
- [ ] Each pass emits findings with a stable category-prefixed ID and a quoted location
- [ ] An FR with zero acceptance criteria is CRITICAL; a `CLAUDE.md` MUST-violation is CRITICAL
- [ ] A clean scope yields a success report with metrics, not invented findings

### FR-004 — Cross-scope conflict detection

An `all`/`--cross` audit MUST detect: boundary overlap, contradictory decisions, duplicate requirements, dependency-graph integrity (missing/archived/cyclic/forward deps, non-reciprocal relations), schema/migration collisions, command/namespace collisions, numbering collisions (SCOPE-NNN vs SPEC-NNN), orphaned deferrals, and terminology drift.

**Acceptance Criteria**:
- [ ] Each cross finding names the conflicting scopes and quotes the evidence
- [ ] A `Depends On` pointing at a missing/archived scope is flagged CRITICAL
- [ ] A SCOPE-NNN/SPEC-NNN integer clash is surfaced explicitly

### FR-005 — Deterministic, token-efficient, evidence-backed

Re-running on unchanged inputs MUST produce identical finding IDs and counts; findings MUST cite specific lines; loading MUST use progressive disclosure and cap the findings table (~50) with an overflow summary.

**Acceptance Criteria**:
- [ ] A no-edit re-run diffs empty (stable IDs/counts)
- [ ] Every finding quotes the offending line/heading as evidence
- [ ] Corpus runs load headings/tables first, full bodies only when a finding needs them

### FR-006 — Adversarial-auditor + mentor persona

The command MUST adopt the principal-architect adversarial-auditor + veteran-mentor persona, adding a one-line *Why it matters* to each finding (or cluster) without diluting severity or burying evidence.

**Acceptance Criteria**:
- [ ] Each finding (or like-cluster) carries a one-line *Why it matters*
- [ ] Severities are not softened to be agreeable; no findings are invented to look thorough

### FR-007 — Process-flow diagram option (`--flow`)

With `--flow`, the command MUST render one Mermaid `flowchart TD` per analyzed scope, derived from the scope narrative, matching SPEC-059's diagram conventions, with gap nodes marked and footnoted to finding IDs — and MUST NOT write SPEC-059's `ScopeProcessFlow` `projectdocuments` doctype.

**Acceptance Criteria**:
- [ ] The diagram is traceable to the scope text (no invented steps), ≤ ~20 nodes, decision diamonds, one-line labels
- [ ] Gap nodes are styled and footnoted to finding IDs with a legend
- [ ] No `ScopeProcessFlow` doctype is written

### FR-008 — In-app surfacing (view + PDF), generated in VS Code only

The reports MUST be viewable and exportable in the wxKanban app, surfaced like SPEC-059's Process Flow: a per-scope **Scope Analysis** report from the scope card (and SpecList / matrix rows), and a project-wide **Project Scope Analysis** report from the Admin Dashboard. The app **never generates** these — generation stays in VS Code via `/analyzescope` (kit-is-a-workflow-engine). The command pushes each report to `projectdocuments` via `project.upsert_document` (per-scope `doctype=ScopeAnalysis` keyed by `specId`; project-wide `doctype=ProjectScopeAnalysis`, `specid` null); the app reads + renders it (Mermaid inline) and offers PDF. There is **no Refresh/regenerate** control in the app.

**Acceptance Criteria**:
- [ ] The scope card shows two links — **Scope Process Flow** and **Scope Analysis** — opening the two reports; the dashboard shows a **Project Scope Analysis** tile with a "not created" badge until pushed
- [ ] The viewer renders the stored markdown (including Mermaid) and exports a PDF; when no report exists it shows a "generate in VS Code with /analyzescope" empty state (404, not an error)
- [ ] Running `/analyzescope <NNN>` populates the per-scope view; `/analyzescope all` populates the dashboard view; the app exposes no generate/refresh action
- [ ] Tenant isolation: a user only reaches reports for their own company's projects

---

## Technical Sections

### Commands / API
- **`/analyzescope`** — consumer-side slash command, auto-discovered from `_wxAI/commands/` (like `wxAI-analyze`/`buildscope`); editor-AI-driven, no kit-internal AI. Source: `_wxAI/commands/analyzescope.md`.
- **Generation has no server handler** — the analysis is editor-AI reasoning, not deterministic server parsing (KISS, kit-is-a-workflow-engine). The only server code is **read-only**: view + PDF routes.
- **App view/PDF routes** (`src/server/routes/scopeAnalysis.ts`, read-only): per-scope `GET /api/projects/:projectId/specs/:specId/scope-analysis` (+`/pdf`), project-wide `GET /api/projects/:projectId/scope-analysis` (+`/pdf`), and `GET /api/projects/:projectId/scope-analysis-status` for card badges. 404 when no stored report. Backed by `ScopeAnalysisService` (read-only store access). PDF via the existing `MarkdownPdfRenderer`.
- **MCP push** — the command writes the report to `projectdocuments` via `project.upsert_document`, extended (SCOPE-060) with an optional `specId` so per-scope rows match/upsert by `(projectId, doctype, specId)` while project-level docs match by `(projectId, doctype)` with `specid` null. Requires the hosted MCP redeploy to take effect.

### Data / Storage
- **Report artifact (disk)** — markdown under `specs/Project-Scope/_analysis/` (`<NNN>-<slug>-analysis.md` or `cross-scope-analysis.md`); the editor writes the file directly (write-first), tracked in git so analyses are diffable.
- **Report doc (DB)** — pushed to `projectdocuments`: per-scope `doctype=ScopeAnalysis` (`specid` set, one row per spec) and project-wide `doctype=ProjectScopeAnalysis` (`specid` null, one row per project). This DB copy is what the app renders; the disk file is the dev's working artifact.

### Client
- **`ScopeAnalysisPage`** (`src/client/pages/ScopeAnalysisPage.tsx`) — one viewer for both routes (`/projects/:projectId/specs/:specId/scope-analysis` and `/projects/:projectId/scope-analysis`), renders Mermaid inline + PDF button, **no refresh**. Entry points: the scope card (`ScopeKanbanCard`) two-link footer, `SpecList` / `ScopeMatrixView` row icons, and the Admin Dashboard **Project Scope Analysis** tile (`DashboardProjectGrid`, status from `/api/admin/doc-status`).

### Help / Discoverability
- Surfaced in the Cockpit Help catalog via auto-discovery (`vscode-extension/src/services/helpCatalog.ts`); promoted into the Standard set beside `validatescope`. Documented flags (`--all`/`--cross`/`--flow`) are auto-extracted from the command's Arguments bullets.

---

## Success Criteria

1. **Read-only with a persisted report.** A run audits a scope and writes a report under `_analysis/`, leaving every scope `.md` untouched. *(FR-001)*
2. **All modes work.** `<NNN>`, `all`, `--cross`, and `--flow` each produce the expected report shape. *(FR-002/004/007)*
3. **Real defects, not noise.** Single + cross passes surface genuine holes/conflicts with quoted evidence, and a clean scope yields a metrics-only success report. *(FR-003/004/005)*
4. **Deterministic.** A no-edit re-run diffs empty. *(FR-005)*
5. **Teaches as it audits.** Each finding carries a *Why it matters*; severities are honest. *(FR-006)*
6. **Flow option stays in its lane.** `--flow` renders a traceable, audit-annotated diagram and never writes SPEC-059's doctype. *(FR-007)*

---

## Constraints & Notes

### Constraints
- **Read-only on scope docs.** The only write is the `_analysis/` report; remediation edits are offered, never auto-applied.
- **`CLAUDE.md` is the convention authority.** Naming, SCOPE-vs-SPEC namespaces, workflow-engine, KISS, spec-first — violations are CRITICAL; the scope changes, not the convention.
- **Kit stays a workflow engine.** The editor AI reasons; the command persists. No kit-internal AI.
- **Reuse, don't invent.** Mirrors `/wxAI-analyze`'s read-only discipline and SPEC-059's surfacing pattern (view + PDF, `projectdocuments` doctype, doc-status tile) and diagram conventions; net-new = the command file, the read-only view/PDF routes + viewer, the two doctypes, and a `specId` on the existing `project.upsert_document`.
- **Generation is VS Code only.** Reports are authored by the editor AI and pushed to the DB; the app has no generate/refresh action — it views + exports.

### Out of Scope (v1 / later)
- **No server-side generation** — the app never runs the analysis; it only views/exports what `/analyzescope` pushed. (Persistence to `projectdocuments` IS in scope — see FR-008.)
- **No downstream fidelity** — spec/plan/tasks coverage is `/wxAI-analyze`'s job.
- **No auto-remediation** — findings are reported; edits require explicit approval.

### Dependencies
- SPEC-019 (auto-discovered command surface), SCOPE-016 (Help discovery), `CLAUDE.md` (conventions). Related: SPEC-059 (diagram conventions), `/wxAI-analyze` (downstream sibling).

### Notes
- **Educational rationale:** the *Why it matters* mentoring turns each audit into a lesson in spec judgment — the kit's mission.
- **Process note:** authored in-conversation as a lightweight dev-tooling scope (the command file shipped first, then this scope documents it spec-first). Numbered SCOPE-060 because SCOPE-059 is allocated to Process Flow.

---

## Amendments

### Amendment A — Single-Scope Determination, Dependency Authoring & Reuse Dedup (2026-06-27)

**Why.** Scopes are authored one at a time, in isolation, so each one's true connection to the rest of the system is never worked out. The original SCOPE-060 framed `/analyzescope` as a read-only adversarial *auditor*. This amendment promotes its **single-scope** mode into the place where a scope is **reconnected to the whole**: it works out how the scope actually works, what it really depends on, which of its processes already exist elsewhere (so they aren't built twice), and where it falls short of the current system — and it **writes the derived dependencies back**. Single-scope is the purpose; `all` is just that dependency/common-process discovery run across the corpus to build the comparison index. This makes `/analyzescope` the upstream **producer** of the `Depends On` edges that SCOPE-073 (scope-flow + validation) **consumes**.

**A.1 — What `/analyzescope <NNN>` determines for a single scope.**

*How the scope works (visualized):*

- **Process flow** — the processes the scope needs/uses, as a flow.
- **Data flow** — a read / write / create map of the entities the scope touches, rendered as a data-flow view.

*Reuse & dependencies (semantic, editor-AI):*

- **Common-process detection** — for each process, whether it is already defined or used elsewhere in the system (compared against the scope/spec corpus).
- **Interactive dedup** — when a process is common, **pause and ask what to do** (reuse the owner's, extract a shared module, or proceed), so the same process/function is not built twice at implementation.
- **Derived `Depends On`** — a dependency is the *owner of a reused process*; analyzescope derives these from the common-process scan and **writes** them into the scope's `Depends On` (with a short `reuses: <process>` note).
- **Owned / net-new surface** — the inverse: what this scope uniquely introduces (new processes, tables, routes, doctypes, commands), so it is discoverable as the owner by later scans and implementation gets a clean "reuse these / build these new" split.
- **Pattern conformance** — whether the scope follows an established system pattern (e.g. DB-row-first + best-effort-notify, doctype-upsert, the `llm-provider` contract) or reinvents one.

*Gaps & fit (semantic, editor-AI):*

- **Missing / issues vs the current overall system** — what is absent or wrong judged against what has already been developed, not just inside the doc.
- **Operational prerequisites** — new infra/secrets/migrations implied (S3, SES, API key, schema change) — the "won't run until X exists" facts.
- **Complexity / KISS signal** — rough size from net-new vs reused, with a flag on speculative abstraction.
- **(Kept — original intra-scope audit)** coverage symmetry, ambiguity / untestable acceptance criteria, internal contradictions, naming-convention conformance (already in the Execution Steps).

*Structural facts (deterministic — computed from the SCOPE-073 dependency graph, displayed in the single-scope view):*

- **Reverse dependencies (blast radius)** — who depends on what this scope owns; what breaks if it changes.
- **Build-readiness / blockers** — implementable now, or blocked by depending on unbuilt / higher-numbered scopes.
- **Cycle / collision membership** — whether this scope sits in a dependency cycle or a SCOPE/SPEC numbering collision.

**A.2 — Behavioral changes (these override the original where they conflict).**

- **Not read-only anymore.** The original Operating Constraint "STRICTLY READ-ONLY on scope docs … never edit a `Project-Scope/*.md`" is relaxed for **one specific write**: analyzescope writes the derived `Depends On` (and its `reuses:` notes) into the analyzed scope. All other edits remain offer-only/approval-gated; the audit findings stay read-only.
- **Interactive.** Common-process detection introduces a pause-and-decide step; the chosen outcome is recorded (see A.4).

**A.3 — Relationship to SCOPE-073 and SPEC-059 (the seam).**

- **SCOPE-073 (scope-flow + validation)** is the deterministic **consumer**: it reads the `Depends On` analyzescope writes, renders the whole-build flow, and runs structural validation. The "structural facts" in A.1 are 073's graph queries surfaced per-scope. Net: **analyzescope decides (semantic), 073 shows + validates (deterministic).**
- **SPEC-059 (per-scope Process Flow)** overlaps the "how the scope works" half. **Open decision (A.4):** whether analyzescope **absorbs** the per-scope flow (retiring/​folding SPEC-059) or **reuses** it. This amendment does not yet decide; it only states analyzescope must surface a process flow and a data flow.

**A.4 — Open decisions (resolve in `plan.md`).**

- **Comparison surface** for "common" / "overall system": **v1 = scope/spec corpus only** (tractable; the hosted MCP has no working tree). Comparing against the implemented codebase is a later enhancement.
- **Where the reuse decision is recorded** so `implement` honors it: **v1 = a derived `Depends On` edge to the owner + a `reuses: <process>` note** in the scope (no new registry — KISS; SCOPE-073 already reads `Depends On`).
- **Per-scope flow ownership:** absorb SPEC-059 vs reuse it (A.3). Leaning **absorb**, since the single-scope tool is becoming the natural home and SPEC-059 is still `draft`.
- **Common-process index bootstrapping:** single-scope common-process detection needs the corpus-wide process/owned-surface inventory that `all` builds — decide whether single-scope loads other scopes on the fly (token cost) or reads a cached index from a prior `all` run.

**A.5 — `all` mode, reframed.** `all` is **batch dependency + common-process discovery** across every scope (building the comparison index and writing each scope's derived `Depends On`), not a separate heavyweight conflict audit. Cross-scope conflicts (cycles, broken deps, collisions) are then a *consequence* visible once all the edges exist — and their always-on, deterministic form lives in SCOPE-073, not here.
