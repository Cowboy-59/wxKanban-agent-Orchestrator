import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestratorMcpAdapter } from '../../adapters/mcp/server';
import { ProjectContext } from '../../core/context/project-context';
import { LifecycleStage } from '../../core/schemas/lifecycle';
import { BuildScopeWorker } from '../../workers/ai/buildscope-worker';
import { LifecycleClient } from '../../services/lifecycle-api/lifecycle-client';

vi.mock('../../core/orchestrator/command-handlers/dbpush', () => ({
	handleDbPushCommand: vi.fn().mockResolvedValue({ success: true }),
}));

function makeContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
	return {
		projectId: 'test-project-mcp',
		projectName: 'MCP Test',
		description: 'Test project for MCP adapter',
		lifecycleStage: LifecycleStage.Design,
		features: [],
		artifacts: [],
		...overrides,
	};
}

describe('OrchestratorMcpAdapter', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns tool definitions for current stage', () => {
		const adapter = new OrchestratorMcpAdapter(makeContext());
		const tools = adapter.getToolDefinitions();

		// Design stage: buildscope, createspecs + cross-cutting: dbpush, pipeline-agent
		expect(tools.length).toBeGreaterThanOrEqual(4);
		const names = tools.map(t => t.name);
		expect(names).toContain('orchestrator.buildscope');
		expect(names).toContain('orchestrator.dbpush');
	});

	it('handles tool call for buildscope', async () => {
		const context = makeContext();
		const adapter = new OrchestratorMcpAdapter(context);

		vi.spyOn(BuildScopeWorker, 'generateScopeDraft').mockResolvedValue({
			title: 'MCP Test',
			problemStatement: 'test',
			objectives: ['obj'],
		});
		vi.spyOn(LifecycleClient, 'createArtifactStatic').mockResolvedValue({ success: true, id: 'mcp-art-1' });
		vi.spyOn(LifecycleClient, 'transitionFeatureStatic').mockResolvedValue({ success: true });

		const result = await adapter.handleToolCall({
			tool: 'orchestrator.buildscope',
			args: { title: 'MCP Test' },
			projectId: 'test-project-mcp',
			apiToken: 'test-token',
			user: 'mcp-test-user',
		});

		expect(result.success).toBe(true);
		expect(result.data).toBeDefined();
	});

	it('rejects mismatched project ID', async () => {
		const adapter = new OrchestratorMcpAdapter(makeContext());

		const result = await adapter.handleToolCall({
			tool: 'orchestrator.buildscope',
			args: {},
			projectId: 'wrong-project',
			apiToken: 'test-token',
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain('mismatch');
	});

	it('strips orchestrator. prefix from tool name', async () => {
		const adapter = new OrchestratorMcpAdapter(makeContext());

		vi.spyOn(BuildScopeWorker, 'generateScopeDraft').mockResolvedValue({
			title: 'Test',
			problemStatement: '',
			objectives: [],
		});
		vi.spyOn(LifecycleClient, 'createArtifactStatic').mockResolvedValue({ success: true, id: 'x' });
		vi.spyOn(LifecycleClient, 'transitionFeatureStatic').mockResolvedValue({ success: true });

		const result = await adapter.handleToolCall({
			tool: 'orchestrator.buildscope',
			args: {},
			projectId: 'test-project-mcp',
			apiToken: 'test-token',
		});

		expect(result.success).toBe(true);
	});

	it('includes custom commands in tool definitions', () => {
		const adapter = new OrchestratorMcpAdapter(makeContext({ customCommands: ['my-lint'] }));
		const tools = adapter.getToolDefinitions();
		const names = tools.map(t => t.name);
		expect(names).toContain('orchestrator.my-lint');
	});
});
