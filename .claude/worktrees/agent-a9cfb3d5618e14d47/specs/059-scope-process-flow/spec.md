# Spec 059: Per-Scope Process Flow

**Spec Number**: 059
**Status**: `draft`
**Created**: 2026-06-18
**Depends On**: existing `projectdocuments` table + `specid` column, `projectspecifications`,
`projecttasks`, `taskdependency`, the MCP lifecycle generator
(`mcp-server/src/utils/lifecycle-generator.ts`), `src/server/ai/llm-provider.ts`,
SPEC-021 (report/PDF + ReportLinkCard conventions)

---

## Overview

For each scope/spec, generate a **Process Flow** document made of two Mermaid `flowchart`s:

1. **Task & dependency flow** — deterministic, built from that spec's `projecttasks` and the
   `taskdependency` edges. Shows the real execution order of the work.
2. **AI-derived process flow** — an LLM reads the spec's narrative (`projectspecifications.content`)
   and renders the business process it describes (steps, decisions, actors).

The document is stored per spec (`projectdocuments`, `doctype='ScopeProcessFlow'`, `specid` set) and
surfaced as a **per-scope link in the project detail view** — one link per scope, opening that scope's
flow.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | Admin / Project owner / Team member |
| **Storage** | `projectdocuments`, `doctype='ScopeProcessFlow'`, `specid` = the spec, `projectid` set |
| **Part 1 — task flow** | Deterministic from `projecttasks` + `taskdependency`; **rebuilt live on every view** (always current — no mutation hooks needed) |
| **Part 2 — AI flow** | Generated **server-side** by the wxKanban app via `llm-provider`; **refreshed on-demand** (not on the kit auto-trigger) |
| **Diagram tech** | Mermaid `flowchart` (consistent with lifecycle Mermaid conventions) |
| **Surface** | Per-scope link in the **project detail** view; opens a viewer rendering the two flowcharts |
| **Out of scope** | PDF rendering (markdown/Mermaid only for v1), editing the AI flow by hand, cross-scope flow merging |

### Why two generation paths (the kit-isn't-an-AI-client boundary)

Part 1 is pure data → it can regenerate inside the MCP lifecycle machinery on every
`create_specs` / `implement` / task-sync event, exactly like the auto `lifecycle` doctype, with **no
AI**. Part 2 needs an LLM; per the project rule that the **kit/MCP is a workflow engine, not an AI
client**, the AI flow is produced by the **wxKanban server** (which legitimately uses `llm-provider`)
and refreshed on demand — never by the kit's auto-trigger.

---

## User Scenarios

### US1 — View a scope's process flow

1. User opens a project's **detail** view
2. Each scope row shows a **Process Flow** link
3. Clicking it opens a viewer rendering the scope's task-dependency flowchart and AI-derived flow

**Expected outcome**: The viewer shows the most recent stored `ScopeProcessFlow` doc for that spec.
If none exists, the link reads "not created".

### US2 — Task flow stays current automatically

1. A task or dependency in a scope changes (created, completed, re-linked) via `implement`/task-sync
2. The MCP generator regenerates **Part 1** (task-dependency flowchart) and upserts the doc (DB-only)

**Expected outcome**: The task flow always reflects current tasks without manual action. Part 2 (AI)
is left as-is until explicitly refreshed.

### US3 — Refresh the AI-derived flow

1. Admin clicks **Refresh AI flow** in the viewer (or calls the regenerate endpoint)
2. The wxKanban server reads the spec content, calls `llm-provider` to produce a Mermaid `flowchart`,
   validates it parses, and upserts it into the doc's Part 2

**Expected outcome**: Part 2 reflects the latest spec narrative; Part 1 is untouched.

---

## Functional Requirements

- **FR-001**: New per-spec document `doctype='ScopeProcessFlow'` in `projectdocuments` with `specid`
  set. The `content` holds combined markdown with two fenced Mermaid `flowchart` blocks (Part 1 = task
  flow, Part 2 = AI flow), each under a clear heading.
- **FR-002**: A deterministic generator builds **Part 1** from `projecttasks` (nodes: task name +
  status) and `taskdependency` (`blockedbyid` → `taskid` edges) for a given `specid`, emitting a valid
  Mermaid `flowchart`.
- **FR-003**: Part 1 (task flow) is **rebuilt live on every view** by the server (`renderCurrent`)
  from current `projecttasks` + `taskdependency`, so it always reflects the latest tasks without any
  mutation hooks. It must **not** call any LLM. *(Implementation note: this supersedes the original
  MCP auto-trigger design — recompute-on-view achieves the same "always current" outcome far more
  simply and is fully testable locally; an MCP-side push remains a possible future optimisation but
  is unnecessary for correctness.)*
- **FR-004**: A server-side generator builds **Part 2** by sending `projectspecifications.content` to
  `llm-provider` with a prompt that returns a Mermaid `flowchart` of the described process. Output is
  validated as parseable Mermaid before storing; on failure, Part 2 is left unchanged and the error
  logged.
- **FR-005**: `POST /api/projects/:projectId/specs/:specId/process-flow/regenerate` (authenticated)
  regenerates the requested part(s): `?part=ai` (default), `?part=tasks`, or `?part=all`.
- **FR-006**: `GET /api/projects/:projectId/specs/:specId/process-flow` returns the stored
  `ScopeProcessFlow` markdown for rendering. 404 if not yet generated.
- **FR-007**: The **project detail** view lists each scope with a **Process Flow** link/badge. The
  badge reads "not created" when no `ScopeProcessFlow` doc exists for that spec — wired through a
  spec-level doc-status query (`specid IS NOT NULL`), parallel to the existing project-level
  `/api/admin/doc-status`.
- **FR-008**: The process-flow viewer renders both Mermaid flowcharts client-side using the existing
  `mermaid@10` library, with a **Refresh AI flow** action (calls FR-005 with `part=ai`).
- **FR-009**: Tenant scoping — non-admin users can only view/regenerate process flows for specs in
  projects of their own company.

---

## Non-Functional Requirements

- **NFR-001**: Part 1 generation is pure SQL + string building; < 1 second per scope.
- **NFR-002**: Part 2 uses the configured `LLM_PROVIDER` (default groq per the project LLM contract);
  one spec at a time, on-demand, so no batch LLM load on auto-triggers.
- **NFR-003**: A malformed LLM result never corrupts the doc — validation gates the write; the prior
  Part 2 is preserved on failure.
- **NFR-004**: All endpoints require JWT auth; company-scoped as in FR-009.

---

## Open Risks

- The MCP generator currently produces the `lifecycle` doctype only; adding `ScopeProcessFlow`
  regeneration must not slow the create_specs / implement hot path — Part 1 generation should be cheap
  and incremental.
- Mermaid `flowchart` output from an LLM can be syntactically invalid; FR-004's validation is
  load-bearing.
- The project detail view does not currently list per-scope document items; FR-007 adds that surface
  (and a spec-level doc-status query that does not exist yet).
