import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../core/orchestrator/workflow-engine';
import { ProjectContext } from '../../core/context/project-context';
import { LifecycleStage } from '../../core/schemas/lifecycle';
import { BuildScopeWorker } from '../../workers/ai/buildscope-worker';
import { LifecycleClient } from '../../services/lifecycle-api/lifecycle-client';

vi.mock('../../core/orchestrator/command-handlers/dbpush', () => ({
	handleDbPushCommand: vi.fn().mockResolvedValue({ success: true, message: 'mock push' }),
}));

function makeContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
	return {
		projectId: 'test-project-001',
		projectName: 'Test Project',
		description: 'A test project',
		lifecycleStage: LifecycleStage.Design,
		features: [],
		artifacts: [],
		...overrides,
	};
}

describe('WorkflowEngine.runBuildScope', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns success result with artifact in Design stage', async () => {
		const context = makeContext();
		const input = { title: 'Test Feature', problemStatement: 'Test problem', objectives: ['Obj 1'] };

		vi.spyOn(BuildScopeWorker, 'generateScopeDraft').mockResolvedValue({
			title: 'Test Feature',
			problemStatement: 'Test problem',
			objectives: ['Obj 1'],
			constraints: [],
			acceptanceCriteria: [],
			notes: '',
		});
		vi.spyOn(LifecycleClient, 'createArtifactStatic').mockResolvedValue({ success: true, id: 'art-1' });
		vi.spyOn(LifecycleClient, 'transitionFeatureStatic').mockResolvedValue({ success: true });

		const { result, audit } = await WorkflowEngine.runBuildScope(context, input, 'test-user');

		expect(result.success).toBe(true);
		expect(result.artifact).toBeDefined();
		expect(result.artifact!.title).toBe('Test Feature');
		expect(audit.command).toBe('buildscope');
		expect(audit.user).toBe('test-user');
		expect(audit.timestamp).toBeDefined();
	});

	it('returns failure result (no throw) when stage disallows command', async () => {
		const context = makeContext({ lifecycleStage: LifecycleStage.Release });
		const input = { title: 'Test' };

		const { result, audit } = await WorkflowEngine.runBuildScope(context, input, 'test-user');

		expect(result.success).toBe(false);
		expect(result.error).toContain('buildscope');
		expect(result.error).toContain('Release');
		expect(audit.command).toBe('buildscope');
	});

	it('returns failure result when artifact creation fails', async () => {
		const context = makeContext();
		const input = { title: 'Test' };

		vi.spyOn(BuildScopeWorker, 'generateScopeDraft').mockResolvedValue({
			title: 'Test',
			problemStatement: '',
			objectives: [],
		});
		vi.spyOn(LifecycleClient, 'createArtifactStatic').mockResolvedValue({ success: false });

		const { result, audit } = await WorkflowEngine.runBuildScope(context, input);

		expect(result.success).toBe(false);
		expect(result.error).toBe('Artifact creation failed');
		expect(audit.command).toBe('buildscope');
	});
});

describe('WorkflowEngine.runDbPush', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('succeeds in any stage because dbpush is cross-cutting', async () => {
		for (const stage of [LifecycleStage.Design, LifecycleStage.Release, LifecycleStage.QATesting]) {
			const context = makeContext({ lifecycleStage: stage });
			const { result } = await WorkflowEngine.runDbPush(context, { dryRun: true });
			expect(result.success).toBe(true);
		}
	});
});

describe('WorkflowEngine.dispatch', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('routes buildscope to runBuildScope', async () => {
		const context = makeContext();
		const input = { title: 'Dispatched Feature' };

		vi.spyOn(BuildScopeWorker, 'generateScopeDraft').mockResolvedValue({
			title: 'Dispatched Feature',
			problemStatement: '',
			objectives: [],
		});
		vi.spyOn(LifecycleClient, 'createArtifactStatic').mockResolvedValue({ success: true, id: 'art-d' });
		vi.spyOn(LifecycleClient, 'transitionFeatureStatic').mockResolvedValue({ success: true });

		const { result, audit } = await WorkflowEngine.dispatch(context, 'buildscope', input, 'user-1');

		expect(result.success).toBe(true);
		expect(audit.command).toBe('buildscope');
	});

	it('returns failure for unknown command', async () => {
		const context = makeContext();
		const { result, audit } = await WorkflowEngine.dispatch(context, 'nonexistent', {});

		expect(result.success).toBe(false);
		expect(result.error).toContain('nonexistent');
		expect(audit.command).toBe('nonexistent');
	});

	it('returns policy denial for disallowed command', async () => {
		const context = makeContext({ lifecycleStage: LifecycleStage.Release });
		const { result } = await WorkflowEngine.dispatch(context, 'buildscope', {});

		expect(result.success).toBe(false);
		expect(result.error).toContain('not permitted');
	});

	it('respects custom commands from context', async () => {
		const context = makeContext({ customCommands: ['my-tool'] });
		// my-tool is allowed but has no handler
		const { result } = await WorkflowEngine.dispatch(context, 'my-tool', {});

		expect(result.success).toBe(false);
		expect(result.error).toContain('No handler registered');
	});

	it('blocks spec-gated command without spec verification', async () => {
		const context = makeContext({ lifecycleStage: LifecycleStage.Implementation });
		const { result } = await WorkflowEngine.dispatch(context, 'implement', {});

		expect(result.success).toBe(false);
		expect(result.error).toContain('IMPLEMENTATION BLOCKED');
	});

	it('allows spec-gated command with full verification', async () => {
		const context = makeContext({ lifecycleStage: LifecycleStage.Implementation });
		const { result } = await WorkflowEngine.dispatch(context, 'implement', {}, 'user', {
			specVerification: {
				specExists: true,
				tasksExist: true,
				documentsExist: true,
				specStatus: 'in_progress',
			},
		});
		// implement has no handler registered yet, so it will fail with "No handler"
		expect(result.success).toBe(false);
		expect(result.error).toContain('No handler registered');
	});

	it('blocks spec-gated command even with --force --reason (escalation only, no bypass)', async () => {
		const context = makeContext({ lifecycleStage: LifecycleStage.Implementation });
		const { result } = await WorkflowEngine.dispatch(context, 'implement', {}, 'user', {
			specVerification: { specExists: false, tasksExist: false, documentsExist: false },
			override: { force: true, reason: 'emergency hotfix' },
		});
		// Force override no longer bypasses — command is blocked, escalation logged
		expect(result.success).toBe(false);
		expect(result.error).toContain('ESCALATION');
	});
});
