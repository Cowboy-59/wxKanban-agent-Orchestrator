// Spec 103 / T007 — reconcile the on-disk spec/scope files to the DB's archived
// status. The wxKanban app archives a scope by setting its DB status (server
// writes the DB); the kit is the only side that can touch the local filesystem,
// so this module moves each group to/from specs/_archive/ to match.
//
// Source of truth: project.cockpit_summary now returns `archivedSpecNumbers`
// (the specs whose DB status is 'archived'). We diff that against what is
// currently sitting under specs/_archive/ on disk and move both directions:
//   - archived in DB but files still live      → move to specs/_archive/
//   - files under specs/_archive/ but not archived in DB (restored) → move back
//
// Best-effort by design — callers (dbpush) must not fail if MCP is unreachable;
// errors are collected and returned, never thrown. Idempotent: re-running with
// an already-synced tree is a no-op. Fences hand-written (the orchestrator
// implement CLI is broken — memory: feedback_orchestrator_cli_broken).

import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { callMcpTool, type McpCallOptions } from './mcp-client';
import { handleArchiveFilesCommand } from './command-handlers/archive-files';

// [SCOPE 103 / T007] BEGIN — sync types + on-disk archived-set detection
export interface SyncArchivedFilesResult {
	archived: string[]; // spec numbers moved live → specs/_archive/ this run
	unarchived: string[]; // spec numbers moved specs/_archive/ → live this run
	skipped: string[]; // members left in place because the target already existed
	errors: string[];
}

interface CockpitArchivedSummary {
	archivedSpecNumbers?: string[];
}

// The set of three-digit spec numbers whose group currently sits under
// specs/_archive/ (either its scope doc or its spec folder is there).
function listArchivedOnDisk(projectRoot: string): Set<string> {
	const nums = new Set<string>();
	const archiveRoot = join(projectRoot, 'specs', '_archive');
	if (!existsSync(archiveRoot)) return nums;

	for (const ent of readdirSync(archiveRoot, { withFileTypes: true })) {
		if (ent.isDirectory() && ent.name !== 'Project-Scope') {
			const m = ent.name.match(/^(\d{3})-/);
			if (m) nums.add(m[1]!);
		}
	}
	const scopeDir = join(archiveRoot, 'Project-Scope');
	if (existsSync(scopeDir)) {
		for (const name of readdirSync(scopeDir)) {
			const m = name.match(/^(\d{3})-.*\.md$/);
			if (m) nums.add(m[1]!);
		}
	}
	return nums;
}
// [SCOPE 103 / T007] END

// [SCOPE 103 / T007] BEGIN — syncArchivedFiles (cockpit_summary → archive:files)
/**
 * Reconcile the on-disk spec/scope files to the DB's archived status. Moves each
 * group to/from specs/_archive/ so the filesystem matches. Best-effort: never
 * throws; MCP or per-group failures are collected in `errors`.
 */
export async function syncArchivedFiles(input: {
	projectId: string;
	projectRoot?: string;
	dryRun?: boolean;
	mcpOptions?: McpCallOptions;
}): Promise<SyncArchivedFilesResult> {
	const projectRoot = input.projectRoot ?? process.cwd();
	const result: SyncArchivedFilesResult = { archived: [], unarchived: [], skipped: [], errors: [] };

	let archivedSpecNumbers: string[];
	try {
		const summary = await callMcpTool<CockpitArchivedSummary>(
			'project.cockpit_summary',
			{ projectId: input.projectId },
			input.mcpOptions ?? {},
		);
		archivedSpecNumbers = (summary.archivedSpecNumbers ?? []).filter((n) => /^\d{3}$/.test(n));
	} catch (err) {
		result.errors.push(`cockpit_summary: ${(err as Error).message}`);
		return result;
	}

	const archivedSet = new Set(archivedSpecNumbers);

	// 1) DB says archived → ensure the group's files are under specs/_archive/.
	for (const num of archivedSet) {
		if (input.dryRun) {
			result.archived.push(num);
			continue;
		}
		try {
			const r = await handleArchiveFilesCommand({ specNumber: num, action: 'archive', projectRoot });
			if (r.exitCode !== 0) {
				result.errors.push(`archive ${num}: exit ${r.exitCode}`);
				continue;
			}
			if ((r.result?.moved.length ?? 0) > 0) result.archived.push(num);
			if (r.result?.skipped.length) result.skipped.push(...r.result.skipped);
		} catch (err) {
			result.errors.push(`archive ${num}: ${(err as Error).message}`);
		}
	}

	// 2) Files under specs/_archive/ but no longer archived in the DB → restore.
	for (const num of listArchivedOnDisk(projectRoot)) {
		if (archivedSet.has(num)) continue;
		if (input.dryRun) {
			result.unarchived.push(num);
			continue;
		}
		try {
			const r = await handleArchiveFilesCommand({ specNumber: num, action: 'unarchive', projectRoot });
			if (r.exitCode !== 0) {
				result.errors.push(`unarchive ${num}: exit ${r.exitCode}`);
				continue;
			}
			if ((r.result?.moved.length ?? 0) > 0) result.unarchived.push(num);
			if (r.result?.skipped.length) result.skipped.push(...r.result.skipped);
		} catch (err) {
			result.errors.push(`unarchive ${num}: ${(err as Error).message}`);
		}
	}

	return result;
}
// [SCOPE 103 / T007] END
