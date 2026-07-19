// archive-files command handler — Spec 103 / T007.
// Kit file-sync for the non-destructive Archive feature. The wxKanban DB is the
// source of truth for a scope/spec group's `archived` status (the server sets it);
// this handler reconciles the ON-DISK files to match by moving the group to (or
// from) an archive folder. Reversible, no loss: it never overwrites an existing
// target, so an already-synced group is a no-op rather than a clobber.
//
// Layout mirror (live ⇄ archived):
//   specs/Project-Scope/NNN-*.md   ⇄  specs/_archive/Project-Scope/NNN-*.md
//   specs/NNN-*/                   ⇄  specs/_archive/NNN-*/
import * as fs from 'fs-extra';
import * as path from 'path';

export type ArchiveAction = 'archive' | 'unarchive';

export interface ArchiveFilesArgs {
	specNumber: string; // three-digit spec/scope number, e.g. "103"
	action: ArchiveAction;
	projectRoot?: string; // defaults to process.cwd()
}

export interface MovePair {
	from: string; // project-relative source path
	to: string; // project-relative destination path
}

export interface ArchiveFilesHandlerResult {
	exitCode: 0 | 1 | 2;
	output: string;
	result?: {
		action: ArchiveAction;
		specNumber: string;
		moved: MovePair[];
		skipped: string[];
	};
}

const ARCHIVE_DIRNAME = '_archive';

// [SCOPE 103 / T007] BEGIN — resolve the on-disk group's source→dest moves
//
// Enumerates the two members of a scope/spec group (the Project-Scope markdown
// doc and the specs/NNN-<slug>/ folder) in the SOURCE location for the requested
// direction, and pairs each with its mirrored path in the DESTINATION location.
// Matching is by the `NNN-` prefix so the slug never needs to be known here.
// Absolute paths in; callers relativize for display.
export async function resolveArchiveMoves(
	projectRoot: string,
	specNumber: string,
	action: ArchiveAction,
): Promise<Array<{ from: string; to: string }>> {
	const specsRoot = path.join(projectRoot, 'specs');
	const archiveRoot = path.join(specsRoot, ARCHIVE_DIRNAME);
	const prefix = `${specNumber}-`;
	const moves: Array<{ from: string; to: string }> = [];

	// Scope doc lives under Project-Scope/ in both locations.
	const liveScopeDir = path.join(specsRoot, 'Project-Scope');
	const archiveScopeDir = path.join(archiveRoot, 'Project-Scope');
	const fromScopeDir = action === 'archive' ? liveScopeDir : archiveScopeDir;
	const toScopeDir = action === 'archive' ? archiveScopeDir : liveScopeDir;

	// Spec group folder lives directly under specs/ (live) or specs/_archive/.
	const fromSpecsDir = action === 'archive' ? specsRoot : archiveRoot;
	const toSpecsDir = action === 'archive' ? archiveRoot : specsRoot;

	// 1) Scope doc(s): NNN-*.md
	if (await fs.pathExists(fromScopeDir)) {
		for (const name of await fs.readdir(fromScopeDir)) {
			if (name.startsWith(prefix) && name.endsWith('.md')) {
				moves.push({
					from: path.join(fromScopeDir, name),
					to: path.join(toScopeDir, name),
				});
			}
		}
	}

	// 2) Spec group folder(s): NNN-*/  (Project-Scope and _archive never match the
	// numeric prefix, so they are naturally excluded).
	if (await fs.pathExists(fromSpecsDir)) {
		const entries = await fs.readdir(fromSpecsDir, { withFileTypes: true });
		for (const ent of entries) {
			if (ent.isDirectory() && ent.name.startsWith(prefix)) {
				moves.push({
					from: path.join(fromSpecsDir, ent.name),
					to: path.join(toSpecsDir, ent.name),
				});
			}
		}
	}

	return moves;
}
// [SCOPE 103 / T007] END

// [SCOPE 103 / T007] BEGIN — handleArchiveFilesCommand (reversible group move)
export async function handleArchiveFilesCommand(
	args: ArchiveFilesArgs,
): Promise<ArchiveFilesHandlerResult> {
	const projectRoot = args.projectRoot ?? process.cwd();

	if (!/^\d{3}$/.test(args.specNumber)) {
		return {
			exitCode: 2,
			output: `archive:files — --spec-number must be three digits (got '${args.specNumber}')`,
		};
	}
	if (args.action !== 'archive' && args.action !== 'unarchive') {
		return {
			exitCode: 2,
			output: `archive:files — --action must be 'archive' or 'unarchive' (got '${args.action}')`,
		};
	}

	const moves = await resolveArchiveMoves(projectRoot, args.specNumber, args.action);
	const moved: MovePair[] = [];
	const skipped: string[] = [];

	for (const m of moves) {
		const rel: MovePair = {
			from: path.relative(projectRoot, m.from),
			to: path.relative(projectRoot, m.to),
		};
		// No-loss guard: if the destination already holds this member, leave both
		// in place and report a skip rather than overwrite.
		if (await fs.pathExists(m.to)) {
			skipped.push(rel.to);
			continue;
		}
		await fs.ensureDir(path.dirname(m.to));
		await fs.move(m.from, m.to, { overwrite: false });
		moved.push(rel);
	}

	const lines: string[] = [`archive:files — ${args.action} scope ${args.specNumber}`];
	if (moved.length === 0 && skipped.length === 0) {
		lines.push(
			`  nothing to move — no on-disk files matched ${args.specNumber}-* in the ${args.action === 'archive' ? 'live' : 'archive'} location`,
		);
	}
	for (const m of moved) lines.push(`  moved: ${m.from} -> ${m.to}`);
	for (const s of skipped) lines.push(`  skipped (target exists): ${s}`);

	return {
		exitCode: 0,
		output: lines.join('\n'),
		result: { action: args.action, specNumber: args.specNumber, moved, skipped },
	};
}
// [SCOPE 103 / T007] END
