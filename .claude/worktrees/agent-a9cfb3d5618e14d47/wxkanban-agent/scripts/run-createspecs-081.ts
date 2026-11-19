import * as fs from 'fs';
import * as path from 'path';
import { handleCreateSpecs } from '../core/orchestrator/command-handlers/createspecs';

// SCOPE-081 — Dev-Plan: Integrated Build Roadmap.
// Dogfood wrapper (mirrors run-createspecs-025.ts): generates the local
// specs/081-*/{spec,plan,tasks,tests,quickstart,checklists}.md artifacts from
// the approved Project-Scope doc + the task breakdown below. No DB write here —
// DB materialization is a separate dbpush / MCP create_specs step.
const SCOPE_PATH = path.resolve(process.cwd(), 'specs/Project-Scope/081-dev-plan-integration.md');

const tasks = [
	// G1 — MCP deterministic generator (the lifecycle-style auto-refresh half)
	{ title: 'T001: devplan-generator module (MCP server)', description: 'Add mcp-server/src/utils/devplan-generator.ts exporting generateProjectDevplanMarkdown(projectId) + pushDevplanToDb(projectId). Builds the DETERMINISTIC markdown only: status-at-a-glance table (per-spec/scope state + task %), foundation-up phase grouping, the Mermaid dependency map, and the critical path. State markers derived from spec/task rows; phase grouping derived from the dependency edges. No LLM. Mirrors lifecycle-generator.ts structure. FR-003.', priority: 'high', status: 'todo' },
	{ title: 'T002: Dependency edges via the SCOPE-073 scope-edges resolver', description: 'devplan-generator consumes the SCOPE-073 scope-edges resolver (scopeflow-generator / scope-edges) for the dependency map and phase ordering — it does NOT re-derive a graph. Map each edge A->B (B depends on A) into the Mermaid flowchart grouped into phase subgraphs, status-colored nodes. Avoid mermaid-breaking chars in labels. FR-004.', priority: 'high', status: 'todo' },
	{ title: 'T003: Auto-refresh on the lifecycle triggers (DB-only doctype)', description: 'Call pushDevplanToDb immediately ALONGSIDE the existing pushLifecycleToDb at the same create_specs + implement/task-sync call sites (DECISION 2026-06-30), wrapped in its own try/catch fail-open guard so a devplan failure never affects the lifecycle write. Upsert a per-project projectdocuments row with doctype=devplan, specid IS NULL, DB-only on the hosted server (does not write the dev working tree). Non-blocking: a failed build degrades to the last good row. FR-001, FR-002.', priority: 'high', status: 'todo' },

	// G2 — Skill (judgment narrative + PDF) + kit distribution
	{ title: 'T004: dev-plan skill ships via .claude/skills kit-sync', description: 'Confirm sync-to-orchestrator mirrors .claude/skills/dev-plan to the orchestrator and into consumer projects (it already auto-discovers .claude/skills/*). Add a guard/test so a freshly provisioned consumer has the skill present with 0 manual steps. Align the skill so, when a devplan doctype already exists, the narrative half (START HERE, exit gates, what-remains) enriches the deterministic skeleton rather than recomputing it. FR-005, FR-006.', priority: 'medium', status: 'todo' },

	// G3 — Dev Cockpit
	{ title: 'T005: Cockpit "Development Plan" panel', description: 'Add a new Dev Cockpit panel that renders the plan as a CHECKLIST with done / not-done marks, sourced from a new `devplan` field added to the existing cockpit_summary MCP payload the Cockpit already polls (DECISION 2026-06-30 — reuse cockpit_summary, no new tool/permission-matrix entry). Read-only, refreshes with the other Cockpit panels. FR-008.', priority: 'high', status: 'todo' },
	{ title: 'T006: dev-plan in the Cockpit help catalog + command wrapper', description: 'Add a dev-plan entry to vscode-extension/src/services/helpCatalog.ts STANDARD set (all 3 lists) so it surfaces in Cockpit Help, and add _wxAI/commands/dev-plan.md as the command wrapper. FR-007.', priority: 'medium', status: 'todo' },
	{ title: 'T007: Bump COCKPIT + repackage VSIX', description: 'Bump the COCKPIT version (sync-all-versions) and repackage the .vsix so the new panel + help entry ship; the kit release carries the skill via sync. FR-012.', priority: 'medium', status: 'todo' },

	// G4 — Web app / Admin dashboard
	{ title: 'T008: GET /api/admin/doc-status — add devplan field', description: 'Extend the doc-status query + response so each project status object includes a devplan field (ISO timestamp or null), checking projectdocuments for doctype=devplan with specid IS NULL for the company\'s projects. FR-009.', priority: 'high', status: 'todo' },
	{ title: 'T009: "Development Plan" ReportLinkCard on the Admin dashboard', description: 'Add a ReportLinkCard ("Development Plan") inside ProjectOverviewCard (below the existing Overview/Lifecycle/Audit links), showing "not created" (indigo, text-xs) until the devplan doctype first exists. Per CLAUDE.md Admin Dashboard conventions. FR-009.', priority: 'high', status: 'todo' },
	{ title: 'T010: Development Plan viewer route + in-app review/print', description: 'Mirror the ProjectLifecycle plumbing EXACTLY (DECISION 2026-06-30 — "same as lifecycle"): add GET /api/projects/:id/devplan serving the rendered Development Plan PDF, opened via <iframe> in the dashboard/tab the same way the Lifecycle tab serves /api/projects/:id/lifecycle, with browser print / save-as-PDF. Reuses the SCOPE-021 PDF pipeline. The spec 048 Amendment A regenerate-to-refresh lag applies equally and is accepted for parity. FR-010.', priority: 'high', status: 'todo' },
	{ title: 'T011: POST /api/admin/projects/:id/devplan/regenerate', description: 'Admin-only endpoint that forces a fresh build of the narrative + PDF (mirrors the lifecycle regenerate route). Returns the updated doc-status timestamp. FR-011.', priority: 'medium', status: 'todo' },

	// G5 — Tests & docs
	{ title: 'T012: Unit tests — devplan-generator determinism + coverage', description: 'Vitest: generator output includes 100% of the project\'s specs/scopes (every item carries a state marker), the Mermaid map renders without parser errors (fixture render), phase grouping is foundation-up from the edges, and the same inputs produce identical output (no LLM / no nondeterminism). Success Criteria #3.', priority: 'high', status: 'todo' },
	{ title: 'T013: Integration tests — endpoints + auto-refresh + fail-open', description: 'doc-status returns devplan field; GET /devplan serves a document; regenerate updates the timestamp; create_specs and implement/task-sync each advance the devplan row updatedat in the same operation with 0 manual steps; a forced generator failure degrades to the last good row and never blocks the op. Success Criteria #1, #4.', priority: 'high', status: 'todo' },
	{ title: 'T014: Docs — CLAUDE.md devplan doctype + dashboard conventions', description: 'Update CLAUDE.md: add the devplan doctype to the Project Lifecycle Documents section (auto-refreshed deterministic skeleton + on-demand skill narrative/PDF, coexists with lifecycle), and add the new "Development Plan" ReportLinkCard to the Admin Dashboard Conventions (doc-status field + ReportLinkCard placement). FR-012.', priority: 'low', status: 'todo' },
];

async function main(): Promise<void> {
	if (!fs.existsSync(SCOPE_PATH)) {
		throw new Error(`Scope file not found: ${SCOPE_PATH}`);
	}
	const scopeContent = fs.readFileSync(SCOPE_PATH, 'utf-8');

	console.log(`\n[createspecs wrapper] Calling handleCreateSpecs with ${tasks.length} tasks`);
	console.log(`[createspecs wrapper] Scope content: ${scopeContent.length} chars`);

	const { result, audit } = await handleCreateSpecs({
		specNumber: '081',
		featureName: 'Dev Plan Integration',
		scopeContent,
		phase: 'design',
		priority: 'high',
		tasks,
		generateLifecycle: true,
		generateTests: true,
		user: 'andy@wxperts.com',
	});

	const auditPath = path.resolve(process.cwd(), `specs/081-dev-plan-integration/audit-createspecs.json`);
	fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));
	console.log(`\n[createspecs wrapper] Audit record: ${auditPath}`);

	console.log(`\n[createspecs wrapper] Result summary:`);
	console.log(JSON.stringify(result, null, 2));
}

main().catch((err: Error) => {
	console.error(`Fatal: ${err.message}`);
	console.error(err.stack);
	process.exit(1);
});
