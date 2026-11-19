# Task Breakdown: Dev Plan Integration

**Feature**: Dev Plan Integration
**Spec**: 081
**Date Generated**: 2026-06-30
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001: devplan-generator module (MCP server) | high | done |
| 2 | T002: Dependency edges via the SCOPE-073 scope-edges resolver | high | todo |
| 3 | T003: Auto-refresh on the lifecycle triggers (DB-only doctype) | high | todo |
| 4 | T004: dev-plan skill ships via .claude/skills kit-sync | medium | todo |
| 5 | T005: Cockpit "Development Plan" panel | high | todo |
| 6 | T006: dev-plan in the Cockpit help catalog + command wrapper | medium | todo |
| 7 | T007: Bump COCKPIT + repackage VSIX | medium | todo |
| 8 | T008: GET /api/admin/doc-status — add devplan field | high | todo |
| 9 | T009: "Development Plan" ReportLinkCard on the Admin dashboard | high | todo |
| 10 | T010: Development Plan viewer route + in-app review/print | high | done |
| 11 | T011: POST /api/admin/projects/:id/devplan/regenerate | medium | todo |
| 12 | T012: Unit tests — devplan-generator determinism + coverage | high | todo |
| 13 | T013: Integration tests — endpoints + auto-refresh + fail-open | high | todo |
| 14 | T014: Docs — CLAUDE.md devplan doctype + dashboard conventions | low | todo |

## Task Details

### T001 — T001: devplan-generator module (MCP server)

Add mcp-server/src/utils/devplan-generator.ts exporting generateProjectDevplanMarkdown(projectId) + pushDevplanToDb(projectId). Builds the DETERMINISTIC markdown only: status-at-a-glance table (per-spec/scope state + task %), foundation-up phase grouping, the Mermaid dependency map, and the critical path. State markers derived from spec/task rows; phase grouping derived from the dependency edges. No LLM. Mirrors lifecycle-generator.ts structure. FR-003.

### T002 — T002: Dependency edges via the SCOPE-073 scope-edges resolver

devplan-generator consumes the SCOPE-073 scope-edges resolver (scopeflow-generator / scope-edges) for the dependency map and phase ordering — it does NOT re-derive a graph. Map each edge A->B (B depends on A) into the Mermaid flowchart grouped into phase subgraphs, status-colored nodes. Avoid mermaid-breaking chars in labels. FR-004.

### T003 — T003: Auto-refresh on the lifecycle triggers (DB-only doctype)

Call pushDevplanToDb immediately ALONGSIDE the existing pushLifecycleToDb at the same create_specs + implement/task-sync call sites (DECISION 2026-06-30), wrapped in its own try/catch fail-open guard so a devplan failure never affects the lifecycle write. Upsert a per-project projectdocuments row with doctype=devplan, specid IS NULL, DB-only on the hosted server (does not write the dev working tree). Non-blocking: a failed build degrades to the last good row. FR-001, FR-002.

### T004 — T004: dev-plan skill ships via .claude/skills kit-sync

Confirm sync-to-orchestrator mirrors .claude/skills/dev-plan to the orchestrator and into consumer projects (it already auto-discovers .claude/skills/*). Add a guard/test so a freshly provisioned consumer has the skill present with 0 manual steps. Align the skill so, when a devplan doctype already exists, the narrative half (START HERE, exit gates, what-remains) enriches the deterministic skeleton rather than recomputing it. FR-005, FR-006.

### T005 — T005: Cockpit "Development Plan" panel

Add a new Dev Cockpit panel that renders the plan as a CHECKLIST with done / not-done marks, sourced from a new `devplan` field added to the existing cockpit_summary MCP payload the Cockpit already polls (DECISION 2026-06-30 — reuse cockpit_summary, no new tool/permission-matrix entry). Read-only, refreshes with the other Cockpit panels. FR-008.

### T006 — T006: dev-plan in the Cockpit help catalog + command wrapper

Add a dev-plan entry to vscode-extension/src/services/helpCatalog.ts STANDARD set (all 3 lists) so it surfaces in Cockpit Help, and add _wxAI/commands/dev-plan.md as the command wrapper. FR-007.

### T007 — T007: Bump COCKPIT + repackage VSIX

Bump the COCKPIT version (sync-all-versions) and repackage the .vsix so the new panel + help entry ship; the kit release carries the skill via sync. FR-012.

### T008 — T008: GET /api/admin/doc-status — add devplan field

Extend the doc-status query + response so each project status object includes a devplan field (ISO timestamp or null), checking projectdocuments for doctype=devplan with specid IS NULL for the company's projects. FR-009.

### T009 — T009: "Development Plan" ReportLinkCard on the Admin dashboard

Add a ReportLinkCard ("Development Plan") inside ProjectOverviewCard (below the existing Overview/Lifecycle/Audit links), showing "not created" (indigo, text-xs) until the devplan doctype first exists. Per CLAUDE.md Admin Dashboard conventions. FR-009.

### T010 — T010: Development Plan viewer route + in-app review/print

Mirror the ProjectLifecycle plumbing EXACTLY (DECISION 2026-06-30 — "same as lifecycle"): add GET /api/projects/:id/devplan serving the rendered Development Plan PDF, opened via <iframe> in the dashboard/tab the same way the Lifecycle tab serves /api/projects/:id/lifecycle, with browser print / save-as-PDF. Reuses the SCOPE-021 PDF pipeline. The spec 048 Amendment A regenerate-to-refresh lag applies equally and is accepted for parity. FR-010.

### T011 — T011: POST /api/admin/projects/:id/devplan/regenerate

Admin-only endpoint that forces a fresh build of the narrative + PDF (mirrors the lifecycle regenerate route). Returns the updated doc-status timestamp. FR-011.

### T012 — T012: Unit tests — devplan-generator determinism + coverage

Vitest: generator output includes 100% of the project's specs/scopes (every item carries a state marker), the Mermaid map renders without parser errors (fixture render), phase grouping is foundation-up from the edges, and the same inputs produce identical output (no LLM / no nondeterminism). Success Criteria #3.

### T013 — T013: Integration tests — endpoints + auto-refresh + fail-open

doc-status returns devplan field; GET /devplan serves a document; regenerate updates the timestamp; create_specs and implement/task-sync each advance the devplan row updatedat in the same operation with 0 manual steps; a forced generator failure degrades to the last good row and never blocks the op. Success Criteria #1, #4.

### T014 — T014: Docs — CLAUDE.md devplan doctype + dashboard conventions

Update CLAUDE.md: add the devplan doctype to the Project Lifecycle Documents section (auto-refreshed deterministic skeleton + on-demand skill narrative/PDF, coexists with lifecycle), and add the new "Development Plan" ReportLinkCard to the Admin Dashboard Conventions (doc-status field + ReportLinkCard placement). FR-012.
