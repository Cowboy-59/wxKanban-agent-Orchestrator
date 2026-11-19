# SCOPE-081: Dev-Plan — Integrated Build Roadmap

**Status:** Draft (interactive buildscope, 2026-06-30)
**Stage:** Design
**Author:** Andy + orchestrator
**Depends on:** SCOPE-073, SCOPE-021, SCOPE-042 (see Dependencies)

---

## Overview

A developer returning to a project after time away has no single answer to "where am I, what's built, what do I build next, and what's in the way." Today that picture is scattered across the kanban board, the lifecycle doc, individual spec task files, and tribal memory.

The `dev-plan` skill already produces that answer as a foundation-up roadmap — a status-at-a-glance table, a color-coded Mermaid dependency map, and a phased build order with exit gates — plus a print-ready PDF. But it lives only as an on-demand Claude Code skill in the developer's working tree. It is not part of the running system: it never refreshes on its own, it is invisible in the web app and the Dev Cockpit, and consumer projects keep no per-project copy in the database.

SCOPE-081 makes the dev-plan a first-class, always-available capability of every wxKanban project — the way the project lifecycle already is. The MCP server **deterministically** regenerates a per-project `devplan` document (status + phase grouping + dependency map + critical path) on every scope/spec/task change, reusing the SCOPE-073 scope-edges resolver, with **no LLM in the write path**. The judgment narrative (the "▶ START HERE" orientation, per-phase exit gates, "what remains") and the print-ready PDF stay with the `dev-plan` skill, run on demand and surfaced through the Dev Cockpit and the Admin dashboard. The skill ships to every consumer through the existing `.claude/skills` kit-sync, so the capability travels with the kit.

## Business Problem

Re-entry friction is a tax on every developer who context-switches between projects — exactly the audience the kit serves. The methodology already captures the data needed to answer "what next" (scopes, specs, tasks, dependency edges), but never assembles it into the one artifact a returning developer reads first. The lifecycle doc shows *phase distribution*; it does not show *build order and blockers*. The result is wasted re-orientation time and decisions made without seeing the critical path. Making the build roadmap auto-maintained and visible in both the editor and the web app removes that tax and reinforces the dependency-graph / "what unblocks the most" thinking the methodology exists to teach.

### Core Design

Two halves, mirroring the lifecycle architecture and the SPEC-059 deterministic/judgment split:

- **Deterministic half (MCP server, auto-refreshed):** a new `devplan` `projectdocuments` doctype, DB-only on the hosted server, regenerated on the same triggers that refresh `lifecycle` (`create_specs`, `implement`/task-sync). It carries only what can be derived without an LLM: the per-spec status table (state + task %), the foundation-up phase grouping, the Mermaid dependency map (edges from the **SCOPE-073 scope-edges resolver**), and the critical path. No LLM in the path; fail-open and never blocking.
- **Judgment half (the skill, on demand):** the `dev-plan` skill authors the "▶ START HERE" block, per-phase exit gates, and "what remains" prose, and renders `specs/DEVELOPMENT-PLAN.md` + PDF. It ships to consumers via `.claude/skills` kit-sync.

Both surfaces — Dev Cockpit and the Admin dashboard — read the deterministic doctype; the skill enriches it on demand. `devplan` coexists with `lifecycle` as a separate doctype; it does not replace it.

---

## User Scenarios & Testing

### US1 — Auto-refresh on change
A developer runs `implement` or `create_specs`; the MCP server regenerates the project's `devplan` doctype so the status table, phase grouping, dependency map, and critical path reflect the new state — with no manual step.

### US2 — Glance from Cockpit
A developer opens Dev Cockpit and sees a **"Development Plan" panel** rendering the plan as a checklist with done / not-done marks, plus a `dev-plan` entry in the help catalog to invoke the full skill.

### US3 — Review and print from the dashboard
An admin opens the Admin dashboard, clicks the per-project **Development Plan** link, reviews the rendered document in-app, and prints / saves it as PDF. The link shows **"not created"** until the doctype first exists, like the other report links.

### US4 — On-demand regenerate
An admin clicks **Regenerate** on the dashboard (or runs the skill) to force a fresh build of the narrative + PDF.

### US5 — Re-entry after months
The "▶ START HERE" block and per-phase exit gates orient the developer — current phase, single next action, nearest blocker — without reading every spec.

### US6 — Ships with the kit
A new consumer project receives the `dev-plan` skill automatically through the kit; no separate install.

---

## Functional Requirements

### FR-001 — `devplan` doctype
Add a new per-project `devplan` `projectdocuments` doctype, DB-only on the hosted server (exactly like `lifecycle`).

### FR-002 — Auto-refresh on the lifecycle triggers
The MCP server regenerates `devplan` on the same triggers that refresh `lifecycle` (`create_specs`, `implement`/task-sync), with no LLM in the path and no added blocking latency (fail-open to the last good result).

### FR-003 — Deterministic content
The auto-generated content covers the data-derivable parts: status-at-a-glance table (per-spec state + task %), foundation-up phase grouping, the Mermaid dependency map, and the critical path.

### FR-004 — Reuse the SCOPE-073 resolver
Dependency edges come from the SCOPE-073 scope-edges resolver; SCOPE-081 does not re-derive a graph.

### FR-005 — Skill authors the judgment layer + PDF
The `dev-plan` skill authors the "▶ START HERE" block, per-phase exit gates, and "what remains" prose, and renders `specs/DEVELOPMENT-PLAN.md` + PDF on demand.

### FR-006 — Kit distribution
The skill ships to every consumer project through the existing `.claude/skills` kit-sync — no new distribution path.

### FR-007 — Cockpit help catalog
`dev-plan` appears in the Cockpit help catalog (STANDARD set), discoverable like other first-class commands.

### FR-008 — Cockpit "Development Plan" panel
A new Cockpit panel renders the plan as a checklist with done / not-done marks, sourced from the deterministic `devplan` data over MCP (e.g. `cockpit_summary` or a dedicated field).

### FR-009 — Admin dashboard link + doc-status
A per-project "Development Plan" `ReportLinkCard` on the Admin dashboard, showing "not created" until the doctype first exists; `GET /api/admin/doc-status` includes a `devplan` field.

### FR-010 — Reviewable + printable view
The dashboard link opens a rendered, reviewable Development Plan view in-app with print / save-as-PDF.

### FR-011 — Regenerate affordance
An admin Regenerate affordance (a `POST` endpoint) forces a fresh build of the narrative + PDF.

### FR-012 — Packaging / release
Bump COCKPIT and repackage the VSIX (new panel + help-catalog entry); the kit release carries the skill via sync.

---

## Data Requirements

- New `projectdocuments` doctype value `devplan` (per-project, `specid IS NULL`), DB-only on the hosted server — same storage discipline as `lifecycle`.
- No new tables. Inputs are existing scope/spec/task rows plus the SCOPE-073 scope-edges output. The on-demand PDF reuses the SCOPE-021 `ProjectDocument` PDF-bytes storage pattern.

## API Routes

- `GET /api/admin/doc-status` — extend the per-project status object with a `devplan` field (ISO timestamp or null).
- `GET /api/projects/:id/devplan` — serve the rendered Development Plan (HTML/PDF) for the in-app viewer (mirrors the lifecycle viewer route).
- `POST /api/admin/projects/:id/devplan/regenerate` — admin-triggered rebuild (mirrors the lifecycle regenerate route).

## Frontend Components

- **Web:** a `ReportLinkCard` ("Development Plan", with "not created" state) inside `ProjectOverviewCard` on the Admin dashboard; a Development Plan viewer (iframe/print) reusing the Lifecycle-tab pattern.
- **Cockpit:** a "Development Plan" panel (checklist with done / not-done marks) reading the deterministic `devplan` data; a help-catalog entry in the STANDARD set.

---

## Success Criteria

1. **Auto-currency.** 100% of `create_specs` and `implement`/task-sync operations that change scope/spec/task state produce an updated `devplan` doctype row in the same operation (the row's `updatedat` advances), with **zero** manual regeneration steps. *(FR-001, FR-002)*
2. **Time-to-orient.** A returning developer can state the current phase, the single next action, and the nearest blocker from the Cockpit "Development Plan" panel or the dashboard view in **under 30 seconds**, without opening any spec file. *(FR-005, FR-008, FR-010)*
3. **Coverage & render integrity.** The auto-generated status table includes **100%** of the project's specs/scopes (every item carries a state marker), and the Mermaid dependency map renders to PDF with **0** parser errors. *(FR-003, FR-004)*
4. **Never blocks.** 0 added blocking latency on `create_specs`/`implement`; a failed `devplan` build degrades silently to the last good result. *(FR-002)*
5. **Ships with the kit.** A freshly provisioned consumer project has the `dev-plan` skill present with 0 manual install steps. *(FR-006)*

---

## Constraints & Notes

### Constraints
- **No LLM in the auto-refresh path.** Server-side AI authoring of the narrative is explicitly out; the narrative is skill-authored, on demand.
- **DB-only on the hosted server.** The auto `devplan` doctype does not write the developer's working tree; the skill writes `specs/DEVELOPMENT-PLAN.md` locally when run.
- **Reuse, don't invent.** Reuses the SCOPE-073 resolver, the SCOPE-021 doctype/PDF/viewer pattern, the SCOPE-048 lifecycle push hooks, the SCOPE-059 two-path precedent, and the SCOPE-042 Cockpit host. Net-new is the `devplan` generator, the Cockpit panel, and the dashboard link/viewer/regenerate.
- `CLAUDE.md` conventions throughout (lowercase table/field names, 100% TypeScript, Pino logging, no AI in the kit/MCP write path).
- Builder-facing only (admin/sysadmin/developer roles); never exposed to the consumer's end customers.

### Non-Goals / Out of Scope
- A server-side LLM authoring the narrative (rejected option).
- Replacing the `lifecycle` doctype — `devplan` and `lifecycle` coexist as distinct views.
- A new dependency-graph engine — edges come from SCOPE-073.
- Editing specs/code, running the orchestrator, or assigning audit severities from the skill.

### Dependencies
- **Primary:** SCOPE-073 (Scope Flow & Validation — scope-edges resolver for the dependency map), SCOPE-021 (Project Lifecycle PDF — the `projectdocuments` doctype + PDF-render + in-app viewer pattern), SCOPE-042 (Dev Cockpit — host for the new panel + help-catalog entry).
- **Secondary:** SCOPE-059 (per-scope process flow — the "generated doctype refreshed on CRUD" MCP pattern to copy), SCOPE-019 (Orchestrator Kit — `.claude/skills` kit-sync distribution), SCOPE-048 (lifecycle doctype — the `create_specs`/`implement` push hooks this piggybacks on).

### Clarifications (resolved 2026-06-30)
- **Cockpit data path → reuse `cockpit_summary`.** The "Development Plan" panel reads its checklist data from a new `devplan` field added to the existing `cockpit_summary` MCP payload the Cockpit already polls — one round-trip, no new tool to register/permission.
- **Trigger reuse → alongside `pushLifecycleToDb`.** `pushDevplanToDb` is called immediately next to the existing lifecycle push at the same `create_specs` + `implement`/task-sync sites, wrapped in its own fail-open guard so a `devplan` failure never affects the lifecycle write.
- **Viewer rendering → same as lifecycle.** Mirror the `ProjectLifecycle` plumbing exactly: the dashboard/tab serves the rendered PDF via iframe with an admin regenerate endpoint (reusing the SCOPE-021 pattern). The same regenerate-to-refresh lag that spec 048 Amendment A flags for the Lifecycle tab applies equally here, and is accepted for parity.

### Open Questions
- None outstanding.

### Notes
- **Precedent:** SPEC-059's deterministic-Part-1 / judgment-Part-2 split is the exact shape followed here.
- **Educational tie:** an always-current, glanceable build roadmap teaches "what unblocks the most" / critical-path thinking the methodology exists to build.
- Numbered SCOPE-081 (after SCOPE-080 kit field-defect hardening).
