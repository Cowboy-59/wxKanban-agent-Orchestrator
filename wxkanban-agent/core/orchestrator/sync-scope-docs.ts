// [SCOPE 135 / T019] BEGIN — dbpush stores each scope document and records the synced hash locally
// SPEC-135 / FR-021. dbpush walked specs/NNN-name/ only, so a scope document reached the project
// solely through the one-off push-scope-doc.ts, and buildscope's "stored copy" was really spec.md.
// This module gives every specs/Project-Scope/NNN-*.md a stored copy (projectdocuments, doctype
// 'scope', title = the file name, the push-scope-doc convention) and writes the hash of what was
// stored into line 1 of the local file, so a later edit can tell when a colleague pushed since.
//
// A file whose text still matches its own marker has not changed since it was last synced and is
// not re-sent. Errors are collected per file, never thrown: one unpushable scope must not stop the
// rest, and the spec push report stays about specs.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readScopeSyncMarker, scopeSyncHash, stripScopeSyncMarker, withScopeSyncMarker } from '@wxkanban/preflight';
import { callMcpToolWithEnvelope } from './mcp-client';

export interface SyncScopeDocsResult {
	/** File names pushed (or, on a dry run, that would be pushed). */
	pushed: string[];
	/** Files unchanged since their last sync, not re-sent. */
	unchanged: number;
	errors: string[];
}

export interface SyncScopeDocsOptions {
	projectId: string;
	projectRoot: string;
	dryRun?: boolean;
	/** ISO timestamp for the marker; injectable so tests are stable. */
	now?: () => string;
}

/** The top-level scope documents: specs/Project-Scope/NNN-*.md. */
export function listScopeDocuments(projectRoot: string): string[] {
	const dir = join(projectRoot, 'specs', 'Project-Scope');
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => /^\d{3,}-.*\.md$/.test(name))
		.sort();
}

export async function syncScopeDocs(options: SyncScopeDocsOptions): Promise<SyncScopeDocsResult> {
	const result: SyncScopeDocsResult = { pushed: [], unchanged: 0, errors: [] };
	const dir = join(options.projectRoot, 'specs', 'Project-Scope');
	const now = options.now ?? (() => new Date().toISOString());

	for (const name of listScopeDocuments(options.projectRoot)) {
		const file = join(dir, name);
		const text = readFileSync(file, 'utf8');
		const hash = scopeSyncHash(text);
		if (readScopeSyncMarker(text)?.hash === hash) {
			result.unchanged += 1;
			continue;
		}
		if (options.dryRun) {
			result.pushed.push(name);
			continue;
		}
		try {
			const envelope = await callMcpToolWithEnvelope('project.upsert_document', {
				projectId: options.projectId,
				doctype: 'scope',
				title: name,
				// The stored copy is the document without the marker; the marker records ITS hash.
				bodyMarkdown: stripScopeSyncMarker(text),
			});
			if (envelope.success === false) {
				const issues = envelope.blockingIssues.length > 0 ? envelope.blockingIssues : ['upsert_document returned success:false'];
				for (const issue of issues) result.errors.push(`${name}: ${issue}`);
				continue;
			}
			// Only after the store succeeded: the marker claims "the stored copy is this text".
			writeFileSync(file, withScopeSyncMarker(text, hash, now()), 'utf8');
			result.pushed.push(name);
		} catch (err) {
			result.errors.push(`${name}: ${(err as Error).message}`);
		}
	}
	return result;
}
// [SCOPE 135 / T019] END
