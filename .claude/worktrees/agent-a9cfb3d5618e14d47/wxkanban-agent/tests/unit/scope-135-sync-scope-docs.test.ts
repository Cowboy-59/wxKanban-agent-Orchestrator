// [SCOPE 135 / T019] BEGIN — dbpush stores scope documents and records the synced hash (FR-021)
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readScopeSyncMarker, scopeSyncHash, stripScopeSyncMarker } from '@wxkanban/preflight';

const calls: Array<Record<string, unknown>> = [];
let failNext = false;

vi.mock('../../core/orchestrator/mcp-client', () => ({
	callMcpToolWithEnvelope: async (_name: string, args: Record<string, unknown>) => {
		calls.push(args);
		if (failNext) return { success: false, blockingIssues: ['blocked by preflight'] };
		return { success: true, data: {} };
	},
}));

import { syncScopeDocs, listScopeDocuments } from '../../core/orchestrator/sync-scope-docs';

describe('SPEC-135 T019 — syncScopeDocs', () => {
	let root = '';
	const dir = () => join(root, 'specs', 'Project-Scope');
	const now = () => '2026-10-28T15:00:00.000Z';

	beforeEach(() => {
		calls.length = 0;
		failNext = false;
		root = mkdtempSync(join(tmpdir(), 'wxk-135-sync-'));
		mkdirSync(join(dir(), '010-x', 'checklists'), { recursive: true });
		writeFileSync(join(dir(), '010-x.md'), '# Scope 010: X\r\n\r\nBody.\r\n');
		writeFileSync(join(dir(), '011-y.md'), '# Scope 011: Y\n');
		writeFileSync(join(dir(), 'README.md'), 'not a scope');
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('lists only NNN-*.md scope documents', () => {
		expect(listScopeDocuments(root)).toEqual(['010-x.md', '011-y.md']);
	});

	it('stores each scope as doctype scope titled by file name, then writes the marker of what was stored', async () => {
		const result = await syncScopeDocs({ projectId: 'p', projectRoot: root, now });
		expect(result).toEqual({ pushed: ['010-x.md', '011-y.md'], unchanged: 0, errors: [] });
		expect(calls[0]).toEqual({ projectId: 'p', doctype: 'scope', title: '010-x.md', bodyMarkdown: '# Scope 010: X\r\n\r\nBody.\r\n' });

		const local = readFileSync(join(dir(), '010-x.md'), 'utf8');
		// After a push the stored content equals the local file (minus its marker) and its hash is the marker's.
		expect(stripScopeSyncMarker(local)).toBe(calls[0].bodyMarkdown);
		expect(readScopeSyncMarker(local)).toEqual({ hash: scopeSyncHash(calls[0].bodyMarkdown as string), at: now() });
		expect(local.startsWith('<!-- wxkanban:synced sha256=')).toBe(true);
		expect(local.split('\r\n').length).toBe(5); // CRLF kept, marker line added
	});

	it('does not re-send a file unchanged since its last sync, and re-sends one edited since', async () => {
		await syncScopeDocs({ projectId: 'p', projectRoot: root, now });
		calls.length = 0;
		expect(await syncScopeDocs({ projectId: 'p', projectRoot: root, now })).toEqual({ pushed: [], unchanged: 2, errors: [] });
		writeFileSync(join(dir(), '011-y.md'), `${readFileSync(join(dir(), '011-y.md'), 'utf8')}More.\n`);
		const again = await syncScopeDocs({ projectId: 'p', projectRoot: root, now });
		expect(again.pushed).toEqual(['011-y.md']);
		expect(calls[0].bodyMarkdown).toBe('# Scope 011: Y\nMore.\n');
	});

	it('a dry run reports the plan and writes nothing', async () => {
		const result = await syncScopeDocs({ projectId: 'p', projectRoot: root, dryRun: true, now });
		expect(result.pushed).toEqual(['010-x.md', '011-y.md']);
		expect(calls).toHaveLength(0);
		expect(readFileSync(join(dir(), '011-y.md'), 'utf8')).toBe('# Scope 011: Y\n');
	});

	it('a refused store leaves the file without a marker and reports the error', async () => {
		failNext = true;
		const result = await syncScopeDocs({ projectId: 'p', projectRoot: root, now });
		expect(result.pushed).toEqual([]);
		expect(result.errors[0]).toBe('010-x.md: blocked by preflight');
		expect(readFileSync(join(dir(), '011-y.md'), 'utf8')).toBe('# Scope 011: Y\n');
	});
});
// [SCOPE 135 / T019] END
