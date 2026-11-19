// SCOPE-123 FR-001 / Amendment B — the kit's view of a scope's stage.
//
// The kit has no database connection in a customer project; it reaches the hub only through MCP
// tools. A scoped command therefore asks `project.scope_stage` for the named scope's stage, task
// counts and blockers before the gate runs.
//
// If the hub cannot be reached the lookup FAILS, and the caller refuses the scoped command. It does
// not fall back to `.wxai/project.json` or any other local value: a gate that disappears offline is
// not a gate. Scope-creating and cross-cutting commands need no lookup and are unaffected.

import { McpClient, getDefaultMcpClient } from '../http/mcp-client';
import type { ScopeStageFacts } from '../policy/policy';
import { isStage } from './vocabulary';

export type ScopeFactsLookup =
	| { ok: true; facts: ScopeStageFacts }
	| { ok: false; reason: string };

// [SCOPE 123 / T018] BEGIN — fetchScopeFacts: ask the hub for the named scope's stage
// [SCOPE 123 / T021] MODIFIED-BY — carries tracked and inactive
export async function fetchScopeFacts(opts: {
	projectId: string;
	specNumber: string;
	projectRoot?: string;
	client?: McpClient;
}): Promise<ScopeFactsLookup> {
	const client = opts.client ?? getDefaultMcpClient(opts.projectRoot);
	let res;
	try {
		res = await client.callTool<unknown>('project.scope_stage', {
			projectId: opts.projectId,
			specNumber: opts.specNumber,
		});
	} catch (err) {
		return { ok: false, reason: err instanceof Error ? err.message : String(err) };
	}
	if (!res.ok) {
		return { ok: false, reason: `project.scope_stage failed (${res.status}): ${res.error ?? 'unknown error'}` };
	}
	const wire = res.data as { content?: Array<{ text?: string }> } | undefined;
	const text = wire?.content?.[0]?.text;
	let body: { scope?: Partial<ScopeStageFacts> } | undefined;
	try {
		body = (text ? JSON.parse(text) : res.data) as { scope?: Partial<ScopeStageFacts> } | undefined;
	} catch {
		return { ok: false, reason: 'project.scope_stage returned a body that is not JSON.' };
	}
	const scope = body?.scope;
	if (!scope || !isStage(scope.stage) || typeof scope.label !== 'string') {
		return { ok: false, reason: 'project.scope_stage returned no recognisable scope stage.' };
	}
	return {
		ok: true,
		facts: {
			scopeId: scope.scopeId ?? null,
			specNumber: scope.specNumber ?? opts.specNumber,
			label: scope.label,
			stage: scope.stage,
			taskCount: Number(scope.taskCount ?? 0),
			openTaskCount: Number(scope.openTaskCount ?? 0),
			blockers: Array.isArray(scope.blockers) ? scope.blockers : [],
			// Amendment C: untracked scopes are judged on their inferred stage; archived/deferred
			// scopes refuse scoped commands.
			tracked: scope.tracked !== false,
			inactive: scope.inactive === true,
		},
	};
}
// [SCOPE 123 / T018] END

// [SCOPE 123 / T018] BEGIN — formatHubUnreachable: why a scoped command was not run offline
export function formatHubUnreachable(command: string, specNumber: string, reason: string): string {
	return (
		`HUB_UNREACHABLE — '${command}' gates on SPEC-${specNumber}'s stage, which only wxKanban holds, ` +
		`and it could not be read: ${reason}\n` +
		`The command was not run. Scoped commands never fall back to a local stage; ` +
		`reconnect and retry. Commands that act on no scope (dbpush, auditfences, buildscope, ...) still run.`
	);
}
// [SCOPE 123 / T018] END
