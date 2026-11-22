// SCOPE-135 / FR-016 — the kit worker sends what only the caller's disk knows, and writes an edit
// back to the file it read (field reports 56b8f6d2 and c4e40bb5).

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
let nextResponse: Record<string, unknown> = {};

vi.mock('../../core/http/mcp-client', () => ({
	McpClient: class {
		async callTool(tool: string, args: Record<string, unknown>) {
			calls.push({ tool, args });
			return { ok: true, status: 200, data: { content: [{ text: JSON.stringify(nextResponse) }] } };
		}
	},
}));

import {
	BuildScopeWorker,
	collectLocalSpecNumbers,
	findLocalScopeFile,
	parseArrayInputs,
} from '../../workers/ai/buildscope-worker';

describe('SCOPE-135 FR-016 — buildscope worker', () => {
	let originalCwd = '';
	let root = '';

	beforeEach(() => {
		calls.length = 0;
		originalCwd = process.cwd();
		root = mkdtempSync(join(tmpdir(), 'wxk-135-worker-'));
		mkdirSync(join(root, 'specs', 'Project-Scope'), { recursive: true });
		for (const dir of ['001-auth', '015-billing', '018-identity-access', '019-x', '020-y']) {
			mkdirSync(join(root, 'specs', dir));
		}
		writeFileSync(join(root, 'specs', 'Project-Scope', '010-parametres-serveur.md'), '# Scope 010: Paramètres\n\nauthored\n');
		writeFileSync(join(root, 'specs', 'Project-Scope', '015-billing.md'), '# Scope 015\n');
		process.chdir(root);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(root, { recursive: true, force: true });
	});

	it('collects numbers from specs/ folders and Project-Scope files', () => {
		expect(collectLocalSpecNumbers(root)).toEqual(['001', '010', '015', '018', '019', '020']);
	});

	it('finds the local scope file by number, exact or differently padded', () => {
		expect(findLocalScopeFile(root, '010')).toBe(join(root, 'specs', 'Project-Scope', '010-parametres-serveur.md'));
		expect(findLocalScopeFile(root, '10')).toBe(join(root, 'specs', 'Project-Scope', '010-parametres-serveur.md'));
		expect(findLocalScopeFile(root, '099')).toBeNull();
	});

	it('parses JSON-string array flags and names a malformed one', () => {
		const parsed = parseArrayInputs({ functionalRequirements: '[{"title":"a"}]', successMetrics: 'not json', featureDescription: '[x' });
		expect(parsed.functionalRequirements).toEqual([{ title: 'a' }]);
		expect(parsed.successMetrics).toBe('not json');
		expect(parsed.featureDescription).toBe('[x');
		expect(() => parseArrayInputs({ userScenarios: '[{bad' })).toThrow('--userScenarios must be a JSON array');
	});

	it('a create sends localSpecNumbers (c4e40bb5)', async () => {
		nextResponse = { success: true, status: 'drafted', specNumber: '021', shortName: 'x', filePath: 'specs/Project-Scope/021-x.md', scopeContent: '# Scope 021: X\n' };
		await BuildScopeWorker.generateScopeDraft({ 'feature-description': 'X', quick: true });
		expect(calls[0].args.localSpecNumbers).toEqual(['001', '010', '015', '018', '019', '020']);
		expect(existsSync(join(root, 'specs', 'Project-Scope', '021-x.md'))).toBe(true);
	});

	it('an edit sends the local file and writes the result back to it, creating no second file (56b8f6d2)', async () => {
		nextResponse = {
			success: true,
			status: 'draft_updated',
			specNumber: '010',
			shortName: 'parametres-serveur-stored-slug',
			filePath: 'specs/Project-Scope/010-parametres-serveur-stored-slug.md',
			checklistPath: 'specs/Project-Scope/010-parametres-serveur-stored-slug/checklists/requirements.md',
			scopeContent: '# Scope 010: Paramètres\n\nauthored and edited\n',
			checklistContent: '# checklist\n',
			editDiff: { hunks: [{ line: 3, before: ['authored'], after: ['authored and edited'] }], text: '@@ line 3 @@\n- authored\n+ authored and edited' },
		};
		await BuildScopeWorker.generateScopeDraft({ 'feature-description': 'Correct the actors', 'edit-spec-number': '010', yes: true });

		expect(calls[0].args.currentScopeContent).toBe('# Scope 010: Paramètres\n\nauthored\n');
		expect(calls[0].args.localSpecNumbers).toBeUndefined();
		expect(calls[0].args.yes).toBeUndefined(); // [SCOPE 135 / T018] the confirm flag is the kit's
		const scopeDir = join(root, 'specs', 'Project-Scope');
		expect(readFileSync(join(scopeDir, '010-parametres-serveur.md'), 'utf8')).toBe('# Scope 010: Paramètres\n\nauthored and edited\n');
		expect(existsSync(join(scopeDir, '010-parametres-serveur', 'checklists', 'requirements.md'))).toBe(true);
		expect(readdirSync(scopeDir).filter((name) => name.startsWith('010-'))).toEqual(['010-parametres-serveur', '010-parametres-serveur.md']);
	});

	it('prints clarification questions as text, not [object Object]', async () => {
		nextResponse = {
			success: true,
			status: 'draft_interview',
			specNumber: '021',
			questions: [{ field: 'functionalRequirements', question: 'What are the functional requirements?' }],
			blockingIssues: ['Functional requirements are required'],
		};
		await expect(BuildScopeWorker.generateScopeDraft({ 'feature-description': 'X' })).rejects.toThrow(
			'functionalRequirements: What are the functional requirements?',
		);
	});

	// [SCOPE 135 / T018] BEGIN — diff before write; nothing written until confirmed (FR-020)
	describe('edit confirmation', () => {
		const editResponse = {
			success: true,
			status: 'draft_updated',
			specNumber: '010',
			shortName: 'parametres-serveur',
			filePath: 'specs/Project-Scope/010-parametres-serveur.md',
			scopeContent: '# Scope 010: Paramètres\n\nauthored and edited\n',
			checklistContent: '# checklist\n',
			editDiff: { hunks: [{ line: 3, before: ['authored'], after: ['authored and edited'] }], text: '@@ line 3 @@\n- authored\n+ authored and edited' },
		};
		const scopeFile = () => join(root, 'specs', 'Project-Scope', '010-parametres-serveur.md');
		const checklistFile = () => join(root, 'specs', 'Project-Scope', '010-parametres-serveur', 'checklists', 'requirements.md');
		const original = '# Scope 010: Paramètres\n\nauthored\n';

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('a declined confirm leaves the scope and checklist untouched, shows the diff, and says so', async () => {
			nextResponse = editResponse;
			const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
			const ask = vi.spyOn(BuildScopeWorker, 'confirmWrite').mockResolvedValue(false);
			const draft = await BuildScopeWorker.generateScopeDraft({ 'feature-description': 'x', 'edit-spec-number': '010' });
			expect(ask).toHaveBeenCalledOnce();
			expect(out.mock.calls.map((c) => String(c[0])).join('')).toContain('- authored\n+ authored and edited');
			expect(readFileSync(scopeFile(), 'utf8')).toBe(original);
			expect(existsSync(checklistFile())).toBe(false);
			expect(draft.notes).toContain('NOT written');
		});

		it('a confirmed edit writes exactly the diffed change', async () => {
			nextResponse = editResponse;
			vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
			vi.spyOn(BuildScopeWorker, 'confirmWrite').mockResolvedValue(true);
			await BuildScopeWorker.generateScopeDraft({ 'feature-description': 'x', 'edit-spec-number': '010' });
			expect(readFileSync(scopeFile(), 'utf8')).toBe('# Scope 010: Paramètres\n\nauthored and edited\n');
			expect(existsSync(checklistFile())).toBe(true);
		});

		it('--yes writes without asking', async () => {
			nextResponse = editResponse;
			vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
			const ask = vi.spyOn(BuildScopeWorker, 'confirmWrite');
			await BuildScopeWorker.generateScopeDraft({ 'feature-description': 'x', 'edit-spec-number': '010', yes: 'true' });
			expect(ask).not.toHaveBeenCalled();
			// [SCOPE 135 / T020] the server is told, so the Amendment Log entry records the unattended write.
			expect(calls[calls.length - 1].args.unattended).toBe(true);
			expect(calls[calls.length - 1].args.yes).toBeUndefined();
			expect(readFileSync(scopeFile(), 'utf8')).toContain('authored and edited');
		});

		it('with no terminal and no --yes nothing is written', async () => {
			nextResponse = editResponse;
			vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
			const draft = await BuildScopeWorker.generateScopeDraft({ 'feature-description': 'x', 'edit-spec-number': '010' });
			expect(readFileSync(scopeFile(), 'utf8')).toBe(original);
			expect(draft.notes).toMatch(/rerun with --yes|declined/);
		});
	});
	// [SCOPE 135 / T018] END

	// [SCOPE 135 / T027] BEGIN — the kit stops when a server drops the sourceRecord pointer (FR-026, FR-027)
	describe('sourceRecord strip guard', () => {
		const pointer = 'docs/brainstorms/x.md#3,4a';
		const createFile = () => join(root, 'specs', 'Project-Scope', '021-x.md');
		const editFile = () => join(root, 'specs', 'Project-Scope', '010-parametres-serveur.md');
		const original = '# Scope 010: Paramètres\n\nauthored\n';
		const header = (line: string) => `# Scope 021: X\n\n**Source**: \`specs/Project-Scope/021-x.md\`\n${line}\n## Overview\nx\n`;
		const logged = (entries: Array<{ letter: string; value?: string }>) =>
			`# Scope 010: Paramètres\n\nauthored and edited\n\n## Amendment Log\n` +
			entries
				.map((e) => `\n### 2026-11-22 — Amendment ${e.letter}\n\n- Reason: r\n- Items: FR-001${e.value ? `\n- Source Record: ${e.value}` : ''}\n`)
				.join('');
		const createResponse = (scopeContent: string) => ({
			success: true, status: 'drafted', specNumber: '021', shortName: 'x', filePath: 'specs/Project-Scope/021-x.md', scopeContent,
		});
		const editResponse = (scopeContent: string) => ({
			success: true, status: 'draft_updated', specNumber: '010', shortName: 'parametres-serveur',
			filePath: 'specs/Project-Scope/010-parametres-serveur.md', scopeContent,
			editDiff: { hunks: [{ line: 3, before: ['authored'], after: ['authored and edited'] }], text: '@@' },
		});

		beforeEach(() => {
			vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		});
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('--source-record reaches the server as sourceRecord, unparsed', async () => {
			nextResponse = createResponse(header(`**Source Record**: ${pointer}`));
			await BuildScopeWorker.generateScopeDraft({ 'feature-description': 'X', quick: true, 'source-record': pointer });
			expect(calls[0].args.sourceRecord).toBe(pointer);
			expect(existsSync(createFile())).toBe(true);
		});

		it('a create whose header lacks the pointer stops and writes nothing', async () => {
			nextResponse = createResponse(header(''));
			await expect(
				BuildScopeWorker.generateScopeDraft({ 'feature-description': 'X', quick: true, 'source-record': pointer }),
			).rejects.toThrow('server too old: sourceRecord was not applied');
			expect(existsSync(createFile())).toBe(false);
		});

		it('a create whose header carries a different pointer stops', async () => {
			nextResponse = createResponse(header('**Source Record**: none'));
			await expect(
				BuildScopeWorker.generateScopeDraft({ 'feature-description': 'X', quick: true, 'source-record': pointer }),
			).rejects.toThrow('server too old: sourceRecord was not applied');
		});

		it('an edit whose last entry carries the letter and pointer is written', async () => {
			nextResponse = editResponse(logged([{ letter: 'C', value: pointer }]));
			await BuildScopeWorker.generateScopeDraft({ 'feature-description': 'x', 'edit-spec-number': '010', amendment: 'C', 'source-record': pointer, yes: true });
			expect(readFileSync(editFile(), 'utf8')).toContain(`- Source Record: ${pointer}`);
		});

		it('an edit whose entry lacks the pointer stops and leaves the file untouched', async () => {
			nextResponse = editResponse(logged([{ letter: 'C' }]));
			await expect(
				BuildScopeWorker.generateScopeDraft({ 'feature-description': 'x', 'edit-spec-number': '010', amendment: 'C', 'source-record': pointer, yes: true }),
			).rejects.toThrow('server too old: sourceRecord was not applied');
			expect(readFileSync(editFile(), 'utf8')).toBe(original);
		});

		it('an earlier entry with the same pointer does not pass the edit guard', async () => {
			nextResponse = editResponse(logged([{ letter: 'B', value: pointer }, { letter: 'C' }]));
			await expect(
				BuildScopeWorker.generateScopeDraft({ 'feature-description': 'x', 'edit-spec-number': '010', amendment: 'C', 'source-record': pointer, yes: true }),
			).rejects.toThrow('server too old: sourceRecord was not applied');
			expect(readFileSync(editFile(), 'utf8')).toBe(original);
		});

		it('a last entry with the pointer but a different letter does not pass', async () => {
			nextResponse = editResponse(logged([{ letter: 'B', value: pointer }]));
			await expect(
				BuildScopeWorker.generateScopeDraft({ 'feature-description': 'x', 'edit-spec-number': '010', amendment: 'C', 'source-record': pointer, yes: true }),
			).rejects.toThrow('server too old: sourceRecord was not applied');
		});

		it('draft_interview is not checked: the interview error comes back, not the guard', async () => {
			nextResponse = { success: true, status: 'draft_interview', specNumber: '021', questions: [{ field: 'businessProblem', question: 'Why?' }] };
			await expect(
				BuildScopeWorker.generateScopeDraft({ 'feature-description': 'X', 'source-record': pointer }),
			).rejects.toThrow('businessProblem: Why?');
		});
	});
	// [SCOPE 135 / T027] END

	// [SCOPE 135 / T029] BEGIN — the edit guard counts entries against the document sent (FR-027)
	describe('sourceRecord edit guard — entry count', () => {
		const pointer = 'docs/brainstorms/x.md#3,4a';
		const editFile = () => join(root, 'specs', 'Project-Scope', '010-parametres-serveur.md');
		const alreadyLogged =
			'# Scope 010: Paramètres\n\nauthored\n\n## Amendment Log\n\n' +
			`### 2026-11-22 — Amendment C\n\n- Reason: r\n- Items: FR-001\n- Source Record: ${pointer}\n`;

		beforeEach(() => {
			vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		});
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('a server that returns the sent document unchanged does not pass on its existing last entry', async () => {
			writeFileSync(editFile(), alreadyLogged);
			nextResponse = {
				success: true, status: 'draft_updated', specNumber: '010', shortName: 'parametres-serveur',
				filePath: 'specs/Project-Scope/010-parametres-serveur.md', scopeContent: alreadyLogged,
				editDiff: { hunks: [], text: '' },
			};
			await expect(
				BuildScopeWorker.generateScopeDraft({ 'feature-description': 'x', 'edit-spec-number': '010', amendment: 'C', 'source-record': pointer, yes: true }),
			).rejects.toThrow('server too old: sourceRecord was not applied');
			expect(calls[calls.length - 1].args.currentScopeContent).toBe(alreadyLogged);
			expect(readFileSync(editFile(), 'utf8')).toBe(alreadyLogged);
		});
	});
	// [SCOPE 135 / T029] END
});
