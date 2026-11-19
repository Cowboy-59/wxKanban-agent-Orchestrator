import * as fs from 'fs';
import * as path from 'path';
import { handleCreateSpecs } from '../core/orchestrator/command-handlers/createspecs';

// SCOPE-083 — Kit auto-update (notify + confirm-apply at session start).
// Dogfood wrapper (mirrors run-createspecs-081.ts): generates the local
// specs/083-*/{spec,plan,tasks,tests,lifecycle} artifacts from the approved
// Project-Scope doc + the task breakdown below. Local-only; DB materialization
// is a separate step. Tasks carry T00n: ids so the generated tasks.md feeds the
// auditfences task-id index for fencing this scope's already-written code.
const SCOPE_PATH = path.resolve(process.cwd(), 'specs/Project-Scope/083-kit-auto-update-at-session.md');

const tasks = [
	{ title: 'T001: Session-start kit-update check (ensureKitUpToDate) + entry-point wiring', description: 'New wxkanban-agent/core/orchestrator/kit-update-check.ts exporting ensureKitUpToDate: throttled once-per-process + ~6h cache in .wxai/kit-update-check.json, runs check-kit-version.mjs --json in the background, prints notify banner on upgrade-available, silent in the author repo via the git-drift signal, WXKANBAN_NO_KIT_UPDATE_CHECK opt-out. Wired into cli.ts --help branch and http.ts gateway boot next to ensureCockpitUpToDate. FR-001, FR-002.', priority: 'high', status: 'done' },
	{ title: 'T002: upgrade-kit --from-server download/extract apply mode', description: 'Add --from-server (and --version) to scripts/upgrade-kit.mjs: download release tarball from GET /api/projects/:id/kit/download?platform=unix (TLS-trust + token/url resolution), extract via tar -xzf to a temp dir, treat the extract root as --source through the existing copy/preserve/install pipeline; keep the confirm prompt; clean up temp on all exits. FR-003.', priority: 'high', status: 'done' },
	{ title: 'T003: Dev Cockpit "Kit update available" row + upgradeKit command', description: 'Add vscode-extension/src/services/kitUpdate.ts (reads the .wxai/kit-update-check.json cache), a CockpitNode kind kit-update row in cockpitTreeProvider.ts (shown only when an update is available and not the author repo), and the wxkanban.cockpit.upgradeKit command in extension.ts + package.json that runs upgrade-kit --from-server in an integrated terminal. FR-004.', priority: 'high', status: 'done' },
	{ title: 'T004: Cockpit self-update reliability — refresh bundled .vsix on upgrade', description: 'Fix scripts/upgrade-kit.mjs so it copies the source vscode-extension/*.vsix into the consumer on every upgrade (KIT_DIRS excludes vscode-extension), so ensureCockpitUpToDate can advance the installed cockpit instead of staying pinned at the first-install version. FR-005.', priority: 'medium', status: 'done' },
	{ title: 'T005: Fence traceability + auditfences baseline re-capture', description: 'Bring the out-of-band code under fences via implement, and re-capture the auditfences legacy baseline (.wxai/auditfences-legacy.json) since editing cli.ts/http.ts un-baselined their pre-existing unfenced functions. Verify auditfences is clean for the changed files.', priority: 'medium', status: 'todo' },
];

async function main(): Promise<void> {
	if (!fs.existsSync(SCOPE_PATH)) {
		throw new Error(`Scope file not found: ${SCOPE_PATH}`);
	}
	const scopeContent = fs.readFileSync(SCOPE_PATH, 'utf-8');

	console.log(`\n[createspecs wrapper] Calling handleCreateSpecs with ${tasks.length} tasks`);
	console.log(`[createspecs wrapper] Scope content: ${scopeContent.length} chars`);

	const { result, audit } = await handleCreateSpecs({
		specNumber: '083',
		featureName: 'Kit auto-update — notify + confirm-apply at session start',
		scopeContent,
		phase: 'implementation',
		priority: 'medium',
		tasks,
		generateLifecycle: true,
		generateTests: true,
		user: 'andy@wxperts.com',
	});

	const auditPath = path.resolve(process.cwd(), `specs/083-kit-auto-update-at-session/audit-createspecs.json`);
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
