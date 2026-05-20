// Buildscope worker — spec 019 R15.
//
// Delegates to the MCP tool `project.buildscope` (see mcp-server/src/server.ts)
// which is the canonical implementation. Previously this file was a placeholder
// that echoed default field values; running the CLI appeared to succeed but
// wrote no spec file. The MCP tool writes a real
// specs/Project-Scope/NNN-<shortName>.md via project-kit's buildScope().

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

export class BuildScopeWorker {
	static async generateScopeDraft(input: Partial<ScopeDraft> & Record<string, unknown>): Promise<ScopeDraft> {
		const args = mapInputsToMcpArgs(input as Record<string, unknown>);

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
			status?: 'created' | 'updated' | 'template_only' | 'draft_interview';
			specNumber?: string;
			shortName?: string;
			questions?: string[];
			blockingIssues?: string[];
			canProceedToCreateSpecs?: boolean;
			message?: string;
		};
		if (mcpResult.success === false) {
			throw new Error(mcpResult.error || 'buildscope: project.buildscope returned success=false');
		}

		// BUG-6: when MCP returns status=draft_interview, NO spec file was
		// written and the user must answer clarification questions before
		// rerunning. Previously the CLI surfaced "Spec X created" anyway,
		// leaving the user to discover downstream that the file was missing.
		if (mcpResult.status === 'draft_interview') {
			const questionList = (mcpResult.questions ?? []).map(q => `  - ${q}`).join('\n');
			const blockerList = (mcpResult.blockingIssues ?? []).map(b => `  - ${b}`).join('\n');
			const parts = [
				mcpResult.message || `buildscope: scope ${mcpResult.specNumber ?? '?'} needs clarification before a draft can be written.`,
			];
			if (questionList) parts.push(`Questions:\n${questionList}`);
			if (blockerList) parts.push(`Blocking issues:\n${blockerList}`);
			parts.push('Re-run buildscope with the missing fields filled in.');
			throw new Error(parts.join('\n\n'));
		}

		// Map BuildScopeResult → ScopeDraft so WorkflowEngine.runBuildScope's
		// return contract holds. The real spec file was written server-side
		// by project.buildscope; this object is just the CLI confirmation.
		const title =
			(typeof mcpResult.shortName === 'string' && mcpResult.shortName) ||
			(typeof args['featureDescription'] === 'string' && (args['featureDescription'] as string)) ||
			'Untitled Feature';
		const problemStatement =
			typeof args['businessProblem'] === 'string' ? (args['businessProblem'] as string) : 'See generated spec file.';
		const objectives = pickSuccessMetrics(args['successMetrics']);
		const verb = mcpResult.status === 'updated' ? 'updated' : mcpResult.status === 'template_only' ? 'scaffolded from template' : 'created';
		const notes = `Spec ${mcpResult.specNumber ?? '?'} ${verb} via project.buildscope (mode: ${mcpResult.mode ?? 'unknown'}).`;

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
