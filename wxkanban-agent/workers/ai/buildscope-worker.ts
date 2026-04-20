// Buildscope worker — spec 019 R15.
//
// Delegates to the MCP tool `project.buildscope` (see mcp-server/src/server.ts)
// which is the canonical implementation. Previously this file was a placeholder
// that echoed default field values; running the CLI appeared to succeed but
// wrote no spec file. The MCP tool writes a real
// specs/Project-Scope/NNN-<shortName>.md via project-kit's buildScope().

import { ScopeDraft } from '../../core/schemas/artifacts';

const MCP_URL = process.env['MCP_HTTP_URL'] || 'http://localhost:3002';

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

		let response: Response;
		try {
			response = await fetch(`${MCP_URL}/call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Connection: 'close' },
				body: JSON.stringify({ tool: 'project.buildscope', args }),
			});
		} catch (err) {
			throw new Error(
				`buildscope: MCP not reachable at ${MCP_URL}/call (${(err as Error).message}). ` +
				`Start the kit runtime with \`node scripts/init.mjs\` or \`node scripts/setup-mcp.mjs\`.`
			);
		}

		if (!response.ok) {
			throw new Error(`buildscope: MCP /call returned ${response.status} ${response.statusText}`);
		}

		const envelope = (await response.json()) as { content?: Array<{ text?: string }> };
		const text = envelope.content?.[0]?.text;
		if (typeof text !== 'string') {
			throw new Error('buildscope: MCP response missing content[0].text');
		}

		const mcpResult = JSON.parse(text) as {
			success?: boolean;
			error?: string;
			mode?: string;
			specNumber?: string;
			shortName?: string;
		};
		if (mcpResult.success === false) {
			throw new Error(mcpResult.error || 'buildscope: project.buildscope returned success=false');
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
		const notes =
			`Spec ${mcpResult.specNumber ?? '?'} created via project.buildscope (mode: ${mcpResult.mode ?? 'unknown'}).`;

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
