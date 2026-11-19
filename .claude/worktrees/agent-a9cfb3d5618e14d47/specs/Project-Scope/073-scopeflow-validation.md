# SCOPE-073: Scope Flow & Cross-Scope Validation

**Scope Number**: SCOPE-073
**Status**: `draft`
**Created**: 2026-06-27
**Last Reviewed**: 2026-06-27 (interactive buildscope — section-by-section, approved through all eight sections)
**Depends On**: SCOPE-048 (lifecycle consolidation — the per-project, DB-driven generator pattern this scope sits beside), SPEC-028 (Hosted MCP Deployment — transport, project-scoped tokens, and the `create_specs` / `implement` trigger hooks), SPEC-019 (Agent Orchestrator Kit — the editor-side parser and MCP client that captures and sends edges), SCOPE-074 (System Capability Index — supplies the semantic shared-substrate/common-capability data behind cross-cluster connections). Conventions authority: `CLAUDE.md`.
**Related Scopes**: coexists with SCOPE-060 (`/analyzescope` — the on-demand auditor that owns judgment findings + severities; this scope defers all verdicts to it) and SCOPE-059 (per-scope `ScopeProcessFlow` — this scope never writes that doctype). The reference resolver logic lives in the `scope-flow-map` dev skill (`.claude/skills/scope-flow-map/`).
**Source**: `specs/Project-Scope/073-scopeflow-validation.md`

---

## Overview

A new per-project, auto-generated document in the lifecycle family — `projectdocuments` doctype `scopeflow` — that renders the whole project's cross-scope dependency graph as a Mermaid diagram and keeps it always-current. It regenerates automatically on the same triggers as the lifecycle doc — `create_specs` and `implement`/task-sync — plus at buildscope edit time, so the overall picture never drifts from the scopes.

It is the structural sibling of the `lifecycle` doc. Where `lifecycle` shows phase distribution and progress, `scopeflow` shows how the scopes connect: explicit `Depends On` (hard) and `Related Scopes` (soft) edges, references to implementation specs that have no scope of their own (the SCOPE-NNN vs SPEC-NNN namespace, shown as external nodes), and a deterministic grouping of scopes into process clusters.

On every change, the changed scope is validated against the overall flow. The system runs deterministic graph-health checks — dependency cycles, a dependency on a missing or not-yet-built scope, SCOPE/SPEC namespace collisions, non-reciprocal relationships, and orphaned deferrals (a scope hands a capability "to a later scope" that no scope owns) — and surfaces them as **non-blocking warnings**. It never blocks the edit, `create_specs`, or `implement`.

The whole path is deterministic and server-generated from edges held in the database — no AI in the generation or validation path, consistent with kit-is-a-workflow-engine. Because the hosted server has no working tree, dependency edges are captured into the DB at the trigger points (the editor parses them from the scope text and sends them; the server stores, generates, and validates).

It coexists with, and does not replace: the on-demand `/analyzescope` auditor, which owns judgment findings and severities; and SCOPE-059's per-scope process flow. This scope owns exactly one thing those don't provide — the always-current, whole-build connection picture plus automatic, non-blocking structural validation on every change.

## Business Problem

Scopes are authored one at a time, section by section, in isolation. But the system they describe is a web: scopes depend on each other, reuse each other's tables and services, and split single user journeys across several scopes. That connective structure exists only as prose scattered across dozens of `Depends On` and `Related Scopes` lines — it is never assembled into one view. The result is that nobody can see what they are actually building, and structural defects accumulate silently between scopes where no single-document review can catch them.

These defects are real and have already bitten this project. A scope cites `SPEC-048` while the integer collides with `SCOPE-048` (a different feature), so a marketing scope reads as if it depends on lifecycle consolidation. A scope points its `Depends On` at `SCOPE-027`, which has no scope file at all. A capability gets deferred "to a later scope" that never takes ownership. A dependency points at a higher-numbered scope that isn't built yet. Each of these is cheap to fix at authoring time and expensive once it has propagated into specs, tasks, and code — but today there is no automatic moment where the change is checked against the whole.

The two existing tools do not close this gap. The `lifecycle` document is auto-current but shows phase and progress, not structure — it answers "how far along" not "how does this connect." The `/analyzescope` auditor can find these conflicts, but it is on-demand and judgment-driven: someone has to remember to run it, and it is not deterministic enough to fire on every change. So the connection picture is either stale (a hand-made map) or absent, and structural validation happens only when a human thinks to ask.

There is also a learning cost. The kit's audience are sharp systems-thinkers still building software judgment, and dependency-graph reasoning — cycles, ownership, forward references, namespace discipline — is exactly the kind of structural thinking the methodology exists to teach. An always-on, always-current flow that flags a broken connection the moment it is introduced turns every scope edit into a small, concrete lesson in seeing the system whole.

What is missing is a single, always-current, deterministic picture of how the scopes connect, paired with an automatic, non-blocking check that tells the author — at the moment of change — whether their edit fits the overall flow or breaks it.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | The developer or architect authoring or editing a scope (and downstream, any kit consumer building their own scopes); the validation runs on their changes. |
| **Secondary Actors** | The editor/kit (parses the changed scope's dependency edges and sends them at each trigger); the hosted MCP server (stores the edges, generates the document, runs validation); the wxKanban app (renders the document). |
| **Key Value** | One always-current, deterministic picture of how every scope connects, plus an automatic non-blocking check of each change against the overall flow — a structural defect caught, and taught, at the moment it is introduced rather than months later in code. |
| **Scope Boundary** | **IN (included)**: deterministic edge capture at the three triggers; the edge store; the namespace-aware resolver; `scopeflow` document generation (Mermaid graph + deterministic clusters); warn-only graph-health validation; the app read/render. **OUT (excluded)**: blocking or gating any change (always warn-only); judgment findings and severities (stay in `/analyzescope`); implicit shared-substrate edges + narrative clustering (stay in the `scope-flow-map` dev skill); SCOPE-059's `ScopeProcessFlow` doctype; PDF export; editing scope docs to "fix" a warning. |

**Capture mechanism:** at each trigger (`create_specs`, `implement`/task-sync, buildscope edit), the editor deterministically parses the changed scope's `Depends On` and `Related Scopes` lines into normalized edges — honoring the SCOPE-NNN versus SPEC-NNN namespace — and sends them to the server, which upserts them into a scope-dependency edge store keyed by project and scope.

**Generate mechanism:** a server-side generator, a sibling of `lifecycle-generator.ts`, builds the Mermaid dependency graph and a deterministic clustering from the stored edges and upserts it as the `scopeflow` document — per project, DB-only, exactly like the `lifecycle` doc.

**Validate mechanism:** on the same triggers, deterministic graph-health runs over the stored edges — cycles, a dependency on a missing or not-yet-built scope, SCOPE/SPEC namespace collisions, non-reciprocal relationships, and orphaned deferrals — and returns the results as non-blocking warnings in the trigger's response, also recorded in the document. It never blocks.

**Storage:** the edges live in a new database table; the rendered document lives in `projectdocuments` with `doctype='scopeflow'`, `specid` null, one row per project.

---

## User Scenarios

### US1 — A clean change keeps the flow current
An author finishes editing SCOPE-073 and adds a `Depends On: SCOPE-042`. On `create_specs` (or the buildscope-edit trigger), the editor sends the parsed edges, the server stores them, regenerates the `scopeflow` document, and runs graph-health. The new edge resolves cleanly.
**Expected:** the `scopeflow` doc now shows the 073→042 edge; the trigger response reports zero warnings; the document is byte-stable on a re-run with no further edits.

### US2 — A broken dependency is warned, not blocked
An author adds `Depends On: SCOPE-091` (a scope that does not exist) and, separately, a cycle where A depends on B and B already depends on A. On the next trigger, validation runs over the stored edges.
**Expected:** the change still succeeds (nothing is blocked); the response carries two non-blocking warnings — "dependency on missing/unbuilt scope SCOPE-091" and "dependency cycle A↔B" — and the same warnings are recorded in the `scopeflow` document.

### US3 — A namespace collision is surfaced
An author writes `Depends On: SCOPE-048` intending the marketing module, but `SCOPE-048` is Lifecycle Consolidation while the marketing module is `SPEC-048`. The resolver, honoring the prefix, records the edge as written and the graph-health pass flags the likely collision.
**Expected:** a non-blocking warning naming both the cited `SCOPE-048` and the colliding `SPEC-048`, so the author can correct the prefix; no edge is silently mis-attributed.

### US4 — The whole-build picture sits beside the lifecycle
A developer opens the project and views the `scopeflow` document — a Mermaid dependency graph of every scope, its clusters, and external impl-spec references — rendered inline next to the always-current `lifecycle` doc.
**Expected:** the graph reflects the latest state with no manual regeneration; it renders inline (Mermaid) in the app; when no scopes have edges yet it shows an empty-state, not an error.

### US5 — An orphaned deferral is caught
An author writes that a capability is "deferred to a later scope," but no scope ever takes ownership of it.
**Expected:** graph-health emits a non-blocking "orphaned deferral" warning identifying the deferring scope and the unowned capability, recorded in the document — teaching the author that a deferral must name an owner.

---

## Functional Requirements

### FR-001 — Deterministic dependency-edge capture at the triggers
On `create_specs`, `implement`/task-sync, and buildscope edit, the editor MUST parse the changed scope's `Depends On` and `Related Scopes` into normalized edges and send them to the server, which MUST persist them.

**Acceptance Criteria**:
- [ ] Each captured edge records: source scope number, target number, target namespace (`scope` | `spec` | `bare`), and kind (`dependsOn` | `related`)
- [ ] Parsing strips dates, versions, and FR/task ids so they never become edges
- [ ] A scope with `Depends On: None` records zero edges and clears any prior edges for that scope
- [ ] Re-sending the same scope text produces the same edge set (no duplicates)

### FR-002 — Scope-dependency edge store
Edges MUST live in a new per-project DB table, keyed so that re-capturing a scope replaces only that scope's outgoing edges.

**Acceptance Criteria**:
- [ ] The table is tenant-scoped (per project/company) consistent with existing isolation
- [ ] Re-capturing scope N deletes N's prior outgoing edges and inserts the current set atomically
- [ ] Table/column names follow the `CLAUDE.md` conventions (lowercase, concatenated, no underscores)

### FR-003 — Namespace-aware resolution
The resolver MUST honor the SCOPE-NNN vs SPEC-NNN namespace exactly as the reference implementation does.

**Acceptance Criteria**:
- [ ] `SCOPE-NNN` resolves to a scope node; flagged if no such scope exists
- [ ] `SPEC-NNN` resolves to an external impl-spec node even when a same-numbered scope exists
- [ ] `spec NNN` / `Spec NNN` (legacy spaced) resolves to a scope if one exists, else external
- [ ] bare `NNN` / `(NNN)` resolves to a scope only if one exists, else is dropped
- [ ] slash lists (`SPEC-046/048`) inherit the first item's prefix

### FR-004 — `scopeflow` document generation
On each trigger the server MUST regenerate a per-project `scopeflow` document from the stored edges and upsert it to `projectdocuments` (`doctype='scopeflow'`, `specid` null), DB-only.

**Acceptance Criteria**:
- [ ] The document contains one Mermaid graph of all scopes, with solid edges for `dependsOn`, dotted for `related`, and dashed external nodes for impl-spec references
- [ ] Scopes are grouped into deterministic clusters (a fixed algorithm, no per-run judgment)
- [ ] Exactly one `scopeflow` row exists per project (upsert, not insert)
- [ ] Generation reads only the DB (no working-tree/file access) and calls no AI

### FR-005 — Deterministic graph-health validation
On each trigger the server MUST run structural checks over the stored edges.

**Acceptance Criteria**:
- [ ] Detects: dependency cycles; a dependency on a missing or not-yet-built scope; SCOPE/SPEC namespace collisions; non-reciprocal `Related Scopes`; and orphaned deferrals
- [ ] Each issue carries a stable, category-prefixed id and names the scope(s) and edge involved
- [ ] No issue carries a severity label (severity is `/analyzescope`'s domain)
- [ ] A flow with no issues yields an empty findings set, not invented ones

### FR-006 — Non-blocking warning surfacing
Validation results MUST be returned to the caller and recorded in the document, and MUST never block the operation.

**Acceptance Criteria**:
- [ ] `create_specs`, `implement`/task-sync, and buildscope edit all complete successfully even when issues exist
- [ ] The trigger response includes the current warnings (count + list)
- [ ] The same warnings are written into a section of the `scopeflow` document

### FR-007 — Determinism and idempotence
Identical inputs MUST produce identical output.

**Acceptance Criteria**:
- [ ] Re-generating from an unchanged edge set produces a byte-identical document (clusters, node order, ids all stable)
- [ ] Warning ids and counts are stable across re-runs on unchanged inputs

### FR-008 — In-app rendering
The app MUST display the `scopeflow` document inline, alongside the lifecycle doc.

**Acceptance Criteria**:
- [ ] The stored Mermaid renders inline; the warnings section is shown
- [ ] When the project has no edges yet, an empty-state is shown (not an error)
- [ ] Tenant isolation: a user only sees their own company's projects' flow
- [ ] No generate/refresh control in the app — generation is trigger-driven only

### FR-009 — Coexistence boundaries
This feature MUST stay in its lane relative to the existing tools.

**Acceptance Criteria**:
- [ ] It never writes SCOPE-059's `ScopeProcessFlow` doctype
- [ ] It never assigns finding severities or remediation (defers to `/analyzescope`)
- [ ] It does not edit any scope `.md` to fix a warning

---

## Technical Sections

### Capture path (commands / API)
A new MCP tool, `project.set_scope_dependencies`, taking `projectId`, the source scope number, and the parsed edge array. The editor calls it at all three triggers: from the buildscope-edit finalize step, and folded into the `create_specs` and `implement`/task-sync flows (which already run at `mcp-server/src/server.ts` ~2000 and ~2453, right where `pushLifecycleToDb` is called). The new tool MUST be registered in the MCP `PERMISSION_MATRIX` (role-checker) or it is rejected as an unknown tool before dispatch. The hosted MCP auto-deploys on push to main, so no separate deploy step beyond the kit release.

### Edge parser (shared, deterministic)
The namespace-aware resolver in the reference implementation (`.claude/skills/scope-flow-map/scripts/extract_scope_edges.py`) is ported to TypeScript as the single source of edge logic — SCOPE/SPEC/bare classification, slash-list expansion, noise stripping. The editor uses it to parse before sending; the server trusts the normalized edges it receives. One algorithm, defined once.

### Data / storage
A new tenant-scoped table — working name `scopedependencies` — with: id (UUID v7), projectid (FK), sourcescope, targetnumber, targetnamespace (`scope` | `spec` | `bare`), kind (`dependsOn` | `related`), createdat. Re-capturing a scope deletes that scope's outgoing rows and inserts the current set in one transaction. Names follow `CLAUDE.md` conventions (lowercase, concatenated, no underscores). The migration is drizzle-generated and MUST be applied to the hosted MCP's production DB (which is distinct from the local `.env` DB). The rendered document is upserted to `projectdocuments` (`doctype='scopeflow'`, `specid` null), one row per project, mirroring `pushLifecycleToDb`.

### Server generator
A new module `mcp-server/src/utils/scopeflow-generator.ts`, sibling to `lifecycle-generator.ts`, exporting: a graph builder over the stored edges, `generateScopeFlowMarkdown(graph)` (Mermaid graph + deterministic clusters + a warnings section), `runGraphHealth(graph)` (returns the warning set), and `pushScopeFlowToDb(projectId, content)`. It is invoked at the same hook points as the lifecycle push, plus after each `set_scope_dependencies` call. It reads only the DB and calls no AI.

### Deterministic clustering
A fixed, order-independent algorithm (e.g. connected-components over the dependency graph, or the shared-substrate heuristic held in reserve earlier) — chosen in the plan. The requirement is reproducibility: same edges in, same clusters out.

### Validation module
Graph-health functions over the stored edges: cycle detection (DFS), missing/not-yet-built target, SCOPE/SPEC namespace collision, non-reciprocal `Related Scopes`, and orphaned deferrals. Each warning gets a stable category-prefixed id and names the scope(s) and edge. Open detail for the plan: orphaned-deferral detection needs deferral data, which lives in free prose ("deferred to a later scope"); v1 reliably handles only explicit, machine-readable deferrals (e.g. "deferred to SCOPE-NNN"), and the looser prose case is noted as a limitation.

### Client / app surface
A read-only route, `GET /api/projects/:projectId/scopeflow`, returning the stored document; rendered inline (Mermaid) in a panel beside the lifecycle view where `lifecycleDoc` is already loaded (`ProjectWorkspacePage`), with the warnings section shown. Empty-state when no document exists yet. No generate or refresh control — generation is trigger-driven only.

### Build / deploy notes
New MCP tool → `PERMISSION_MATRIX` entry + redeploy (automatic on push to main). If the buildscope prompt is changed to call the new tool, the prompt registry must be rebuilt (`build-prompts.mjs`) and the three skill copies kept in sync. No new user-facing slash command — the feature is automatic.

---

## Success Criteria

1. **Always current.** 100% of the 3 triggers refresh the `scopeflow` document within one trigger cycle, with 0 manual regeneration steps. *(FR-001, FR-004, FR-006)*
2. **Deterministic.** Regenerating from an unchanged edge set yields a byte-identical document (0 diff) and identical warning ids/counts across 100% of re-runs. *(FR-007)*
3. **Namespace-correct.** 0% of `SPEC-NNN` references resolve to a same-numbered scope, and 100% of SCOPE/SPEC collisions are surfaced as a warning naming both. *(FR-003, FR-005)*
4. **Warn, never block.** 100% of the 3 triggers complete successfully when structural issues exist, with 0 blocked operations. *(FR-006)*
5. **Real defects, not noise.** All 5 check types (cycles, missing/unbuilt deps, namespace collisions, non-reciprocal relations, explicit orphaned deferrals) are detected with the scope(s) and edge named; a structurally clean flow yields 0 warnings. *(FR-005)*
6. **Coexists in its lane.** 0 writes to SCOPE-059's `ScopeProcessFlow` doctype, 0 severities assigned, 0 scope-doc edits; an empty-state shows when 0 edges exist. *(FR-008, FR-009)*
7. **AI-free path.** 0 AI calls in generation/validation — both read only the database, consistent with kit-is-a-workflow-engine. *(FR-004, FR-005)*

---

## Constraints & Notes

### Constraints
- Warn-only is absolute: the feature never blocks an edit, `create_specs`, or `implement`. Escalation to a gate would be a separate, later decision.
- Deterministic and server-generated from DB edges, calling no AI — consistent with kit-is-a-workflow-engine.
- The hosted MCP has no working tree, so the server never reads scope files; edges are always supplied by the editor and stored, then generated/validated from the DB.
- `CLAUDE.md` is the convention authority — DB naming, the SCOPE-NNN vs SPEC-NNN namespace, KISS, and spec-first are non-negotiable.
- Reuse, don't invent: mirror the `lifecycle-generator` pattern (per-project doctype upsert, same hook points), reuse the reference resolver's edge logic, and reuse `projectdocuments` plus the app's existing document rendering. Net-new is one table, one MCP tool, one generator module, and one read route plus a render panel.
- The migration must be applied to the hosted MCP's production database, which is distinct from the local `.env` database.

### Out of Scope (v1 / later)
- Any blocking or gating behavior (always warn).
- Judgment findings, severities, and remediation — owned by `/analyzescope`.
- The implicit shared-substrate edges and narrative clustering that need judgment — those stay in the on-demand `scope-flow-map` dev skill.
- PDF export — the `scopeflow` doc is rendered inline only, mirroring the auto `lifecycle` doc.
- Loose prose orphaned-deferral detection — v1 detects only explicit, machine-readable deferrals ("deferred to SCOPE-NNN").
- Cross-project or portfolio-wide flow — per-project only, like the lifecycle doc.
- Auto-correcting namespace prefixes in scope docs.

### Dependencies
- The lifecycle generation infrastructure and its trigger hooks — SCOPE-048 (the per-project, DB-driven generator this one sits beside) and SPEC-028 (hosted MCP transport, project-scoped tokens, and the `create_specs` / `implement` hook points).
- SPEC-019 (the kit / editor-side parser and MCP client that captures and sends edges).
- The reference resolver in the `scope-flow-map` dev skill — the logic ported to TypeScript.
- `CLAUDE.md` as conventions authority.
- Coexists with (not dependencies): `/analyzescope` (SCOPE-060) and SCOPE-059's per-scope process flow.

### Notes
- **Open plan-level questions** to settle in `plan.md`: the clustering algorithm (connected-components versus the shared-substrate heuristic); how robustly orphaned deferrals can be parsed deterministically; and the exact capture wiring (a standalone `set_scope_dependencies` tool called alongside the hooks, versus extending the `create_specs` input).
- **Educational rationale:** warning at the moment of change turns each scope edit into a concrete lesson in dependency-graph thinking — cycles, ownership, forward references, namespace discipline — for the kit's career-changer audience, serving the methodology's mission.
- **Process note:** authored interactively in-conversation. A reference implementation (the `scope-flow-map` dev skill, built this session) already prototypes the resolver, the Mermaid rendering, and the namespace-aware logic, which de-risks the TypeScript port.
- Numbered SCOPE-073 because 071 (onboarding landing) and 072 (user home) are already allocated.
