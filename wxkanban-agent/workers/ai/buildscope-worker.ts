// Buildscope worker — spec 019 R15.
//
// Delegates to the MCP tool `project.buildscope` (see mcp-server/src/server.ts)
// which is the canonical implementation. Previously this file was a placeholder
// that echoed default field values; running the CLI appeared to succeed but
// wrote no spec file. The MCP tool writes a real
// specs/Project-Scope/NNN-<shortName>.md via project-kit's buildScope().

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { ScopeDraft } from '../../core/schemas/artifacts';
import { McpClient } from '../../core/http/mcp-client';

function kebabToCamel(s: string): string {
	return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function mapInputsToMcpArgs(input: Record<string, unknown>): Record<string, unknown> {
	const args: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) {
		args[kebabToCamel(key)] = value;
	}
	// Backwards-compat: older CLI usage passed `--title`; map to featureDescription.
	if (args['featureDescription'] == null && typeof args['title'] === 'string') {
		args['featureDescription'] = args['title'];
	}
	return args;
}

function pickSuccessMetrics(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String);
	if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
	return [];
}

// [SCOPE 135 / T012] BEGIN — the kit sends what only the caller's disk knows
// FR-016. The hosted server cannot read this machine, so two things it needs come from here: the
// spec numbers that exist only on disk (c4e40bb5 was handed an 018 that sat unpushed in specs/), and
// the author's own scope file on an edit (56b8f6d2 was merged into an older stored copy, and this
// worker then wrote that result over a differently-named path).

/** CLI flags arrive as strings; these inputs must reach the server as arrays. */
const ARRAY_INPUTS = ['functionalRequirements', 'userScenarios', 'secondaryActors', 'successMetrics', 'localSpecNumbers'];

export function parseArrayInputs(args: Record<string, unknown>): Record<string, unknown> {
	const parsed: Record<string, unknown> = { ...args };
	for (const key of ARRAY_INPUTS) {
		const value = parsed[key];
		if (typeof value !== 'string' || !value.trim().startsWith('[')) continue;
		try {
			parsed[key] = JSON.parse(value);
		} catch (error) {
			throw new Error(`buildscope: --${key} must be a JSON array (${(error as Error).message}).`);
		}
	}
	return parsed;
}

/** Every spec number present in specs/NNN-* and specs/Project-Scope/NNN-* under `root`. */
export function collectLocalSpecNumbers(root: string): string[] {
	const numbers = new Set<string>();
	for (const dir of [join(root, 'specs'), join(root, 'specs', 'Project-Scope')]) {
		if (!existsSync(dir)) continue;
		for (const name of readdirSync(dir)) {
			const match = name.match(/^(\d{3,})[-_]/);
			if (match) numbers.add(match[1]);
		}
	}
	return [...numbers].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

/** The local scope file for `specNumber`, matched on its exact numeric prefix, or null. */
export function findLocalScopeFile(root: string, specNumber: string): string | null {
	const dir = join(root, 'specs', 'Project-Scope');
	if (!existsSync(dir)) return null;
	const names = readdirSync(dir).filter((name) => /^\d{3,}-.*\.md$/.test(name));
	// Exact prefix first ("010-…" for "010"); otherwise the same number differently padded ("0010-…").
	const exact = names.find((name) => name.startsWith(`${specNumber}-`));
	if (exact) return join(dir, exact);
	const wanted = parseInt(specNumber, 10);
	if (!Number.isFinite(wanted)) return null;
	const padded = names.find((name) => parseInt(name, 10) === wanted);
	return padded ? join(dir, padded) : null;
}
// [SCOPE 135 / T012] END

// [SCOPE 124 / T020] BEGIN — buildscope reports what it actually did
// MODIFIED-BY: [SCOPE 135 / T012] — sends local numbers / the local file; writes an edit back in place
export class BuildScopeWorker {
	static async generateScopeDraft(input: Partial<ScopeDraft> & Record<string, unknown>): Promise<ScopeDraft> {
		const args = parseArrayInputs(mapInputsToMcpArgs(input as Record<string, unknown>));
		const root = process.cwd();

		// [SCOPE 135 / T012] FR-016 — an edit is applied to the author's file and written back to it;
		// a create is numbered past what is on disk as well as what is stored.
		const editNumber = typeof args['editSpecNumber'] === 'string' ? (args['editSpecNumber'] as string) : null;
		const localScopeFile = editNumber ? findLocalScopeFile(root, editNumber) : null;
		if (localScopeFile && args['currentScopeContent'] == null) {
			args['currentScopeContent'] = readFileSync(localScopeFile, 'utf8');
		}
		if (!editNumber && args['localSpecNumbers'] == null) {
			args['localSpecNumbers'] = collectLocalSpecNumbers(root);
		}

		// Spec 028 / T021 — go through the shared mcp-client so bearer auth +
		// 429-retry + hosted-base-URL resolution are handled centrally.
		const mcp = new McpClient();
		const result = await mcp.callTool<{ content?: Array<{ text?: string }> }>(
			'project.buildscope',
			args,
		);

		if (!result.ok) {
			throw new Error(
				`buildscope: MCP /call returned ${result.status} — ${result.error ?? 'unknown error'}`,
			);
		}

		const text = result.data?.content?.[0]?.text;
		if (typeof text !== 'string') {
			throw new Error('buildscope: MCP response missing content[0].text');
		}

		const mcpResult = JSON.parse(text) as {
			success?: boolean;
			error?: string;
			mode?: string;
			// [SCOPE 124 / T020] The server drafts; this client is what creates the file. It answers
			// 'drafted' / 'draft_updated' now, and the older words still arrive from older servers.
			status?: 'drafted' | 'draft_updated' | 'created' | 'updated' | 'template_only' | 'draft_interview';
			specNumber?: string;
			shortName?: string;
			// [SCOPE 135 / T012] The server sends { field, question } objects; this was typed as strings,
			// so the CLI printed "[object Object]" for every clarification question.
			questions?: Array<string | { field?: string; question?: string }>;
			blockingIssues?: string[];
			canProceedToCreateSpecs?: boolean;
			message?: string;
			// [SCOPE 028 / Phase 12 — FR-021] content the client writes locally.
			filePath?: string;
			scopeContent?: string;
			checklistPath?: string;
			checklistContent?: string;
			// [SCOPE 135 / T012] additive fields from a SCOPE-135 server; absent on older servers.
			missingInputs?: string[];
			advisories?: string[];
			// [SCOPE 077 / FR-008] orchestrator in-chat reuse check — surfaced inline.
			reuseWarning?: string;
			reuseMatches?: Array<{ owner: string; name: string; capabilityType: string; score: number }>;
		};
		if (mcpResult.success === false) {
			throw new Error(mcpResult.error || 'buildscope: project.buildscope returned success=false');
		}

		// BUG-6: when MCP returns status=draft_interview, NO spec file was
		// written and the user must answer clarification questions before
		// rerunning. Previously the CLI surfaced "Spec X created" anyway,
		// leaving the user to discover downstream that the file was missing.
		if (mcpResult.status === 'draft_interview') {
			const questionList = (mcpResult.questions ?? [])
				.map(q => `  - ${typeof q === 'string' ? q : `${q.field ?? 'input'}: ${q.question ?? ''}`}`)
				.join('\n');
			const blockerList = (mcpResult.blockingIssues ?? []).map(b => `  - ${b}`).join('\n');
			const parts = [
				mcpResult.message || `buildscope: scope ${mcpResult.specNumber ?? '?'} needs clarification before a draft can be written.`,
			];
			if (questionList) parts.push(`Questions:\n${questionList}`);
			if (blockerList) parts.push(`Blocking issues:\n${blockerList}`);
			parts.push('Re-run buildscope with the missing fields filled in.');
			throw new Error(parts.join('\n\n'));
		}

		// [SCOPE 028 / Phase 12 — FR-021] Write-first: the server no longer writes
		// files (on the hosted MCP those writes hit the server container, not the
		// developer's machine). The client authors the scope + checklist files in
		// the local workspace from the returned content, then the DB is the
		// source of truth for cross-host pull.
		// [SCOPE 135 / T012] An edit of a local file is written back to THAT file, and its checklist
		// beside it. The server's suggested path is derived from the stored title and can name a
		// different slug — writing there forked the scope into a second file.
		const scopeTarget = localScopeFile
			? localScopeFile
			: typeof mcpResult.filePath === 'string'
				? resolve(root, mcpResult.filePath)
				: null;
		const checklistTarget = localScopeFile
			? join(localScopeFile.replace(/\.md$/, ''), 'checklists', 'requirements.md')
			: typeof mcpResult.checklistPath === 'string'
				? resolve(root, mcpResult.checklistPath)
				: null;
		if (scopeTarget && typeof mcpResult.scopeContent === 'string') {
			mkdirSync(dirname(scopeTarget), { recursive: true });
			writeFileSync(scopeTarget, mcpResult.scopeContent, 'utf8');
		}
		if (checklistTarget && typeof mcpResult.checklistContent === 'string') {
			mkdirSync(dirname(checklistTarget), { recursive: true });
			writeFileSync(checklistTarget, mcpResult.checklistContent, 'utf8');
		}

		// Map BuildScopeResult → ScopeDraft so WorkflowEngine.runBuildScope's
		// return contract holds. The scope file is now written above by the
		// client; this object is just the CLI confirmation.
		const title =
			(typeof mcpResult.shortName === 'string' && mcpResult.shortName) ||
			(typeof args['featureDescription'] === 'string' && (args['featureDescription'] as string)) ||
			'Untitled Feature';
		const problemStatement =
			typeof args['businessProblem'] === 'string' ? (args['businessProblem'] as string) : 'See generated spec file.';
		const objectives = pickSuccessMetrics(args['successMetrics']);
		const verb =
			mcpResult.status === 'updated' || mcpResult.status === 'draft_updated'
				? 'updated'
				: mcpResult.status === 'template_only'
					? 'scaffolded from template'
					: 'created';
		// [SCOPE 077 / FR-008] Surface the orchestrator reuse check inline so the
		// developer sees overlapping existing scopes while authoring (warn-only).
		const reuseNote = mcpResult.reuseWarning ? `\n\n${mcpResult.reuseWarning}` : '';
		// [SCOPE 135 / T012] Say where the file went and what is still open, not just the verb.
		const whereNote = scopeTarget ? ` Written to ${relative(root, scopeTarget).replace(/\\/g, '/')}.` : '';
		const missingNote = mcpResult.missingInputs && mcpResult.missingInputs.length > 0
			? `\n\nStill blocked — supply: ${mcpResult.missingInputs.join(', ')}.`
			: '';
		const advisoryNote = mcpResult.advisories && mcpResult.advisories.length > 0
			? `\n\nAdvisory (not enforced by the gate): ${mcpResult.advisories.join('; ')}.`
			: '';
		const notes = `Spec ${mcpResult.specNumber ?? '?'} ${verb} via project.buildscope (mode: ${mcpResult.mode ?? 'unknown'}).${whereNote}${missingNote}${advisoryNote}${reuseNote}`;

		return {
			title,
			problemStatement,
			objectives,
			constraints: [],
			acceptanceCriteria: [],
			notes,
		};
	}
}
// [SCOPE 124 / T020] END
