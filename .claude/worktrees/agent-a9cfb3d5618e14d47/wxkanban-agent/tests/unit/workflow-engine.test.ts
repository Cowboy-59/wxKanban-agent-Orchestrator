import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../core/orchestrator/workflow-engine';
import { ProjectContext } from '../../core/context/project-context';
import { LifecycleStage } from '../../core/schemas/lifecycle';
import { BuildScopeWorker } from '../../workers/ai/buildscope-worker';
import { LifecycleClient } from '../../services/lifecycle-api/lifecycle-client';

vi.mock('../../core/orchestrator/command-handlers/dbpush', () => ({
	handleDbPushCommand: vi.fn().mockResolvedValue({ success: true, message: 'mock push' }),
}));

// SCOPE-123 — gates read the stage of the scope a command names.
function scopeIn(stage: LifecycleStage): NonNullable<ProjectContext['scope']> {
	return { scopeId: 'scope-1', specNumber: '101', label: 'SPEC-101', stage, taskCount: 2, openTaskCount: 1, blockers: [] };
}

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

	// SCOPE-123 FR-008 — buildscope is scope-creating: it runs whatever stage the
	// project's scopes are in, so a new scope can be added to a released project.
	it('runs in any stage, with no project stage consulted', async () => {
		const context = makeContext({ lifecycleStage: LifecycleStage.Release });
		vi.spyOn(BuildScopeWorker, 'generateScopeDraft').mockResolvedValue({
			title: 'Late Feature',
			problemStatement: '',
			objectives: [],
		});
		vi.spyOn(LifecycleClient, 'createArtifactStatic').mockResolvedValue({ success: true, id: 'art-r' });
		vi.spyOn(LifecycleClient, 'transitionFeatureStatic').mockResolvedValue({ success: true });

		const { result, audit } = await WorkflowEngine.runBuildScope(context, { title: 'Late Feature' }, 'test-user');

		expect(result.success).toBe(true);
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

	it('returns policy denial for a scoped command on a scope in the wrong stage', async () => {
		const context = makeContext({ scope: scopeIn(LifecycleStage.Design) });
		const { result } = await WorkflowEngine.dispatch(context, 'runqa', {});

		expect(result.success).toBe(false);
		expect(result.error).toContain('STAGE_DENIED');
		expect(result.error).toContain('SPEC-101 is in Design');
	});

	it('respects custom commands from context', async () => {
		const context = makeContext({ customCommands: ['my-tool'] });
		// my-tool is allowed but has no handler
		const { result } = await WorkflowEngine.dispatch(context, 'my-tool', {});

		expect(result.success).toBe(false);
		expect(result.error).toContain('No handler registered');
	});

	it('blocks spec-gated command without spec verification', async () => {
		const context = makeContext({ scope: scopeIn(LifecycleStage.Implementation) });
		const { result } = await WorkflowEngine.dispatch(context, 'implement', {});

		expect(result.success).toBe(false);
		expect(result.error).toContain('IMPLEMENTATION BLOCKED');
	});

	it('allows spec-gated command with full verification', async () => {
		const context = makeContext({ scope: scopeIn(LifecycleStage.Implementation) });
		const { result } = await WorkflowEngine.dispatch(context, 'implement', {}, 'user', {
			specVerification: {
				specExists: true,
				tasksExist: true,
				documentsExist: true,
				specStatus: 'in_progress',
			},
		});
		// implement handler is now registered (spec 026). Without a real scope/task argument
		// it returns the argument-validation error.
		expect(result.success).toBe(false);
		expect(result.error).toContain('implement requires <scope>/<task>');
	});

	it('blocks spec-gated command even with --force --reason (escalation only, no bypass)', async () => {
		const context = makeContext({ scope: scopeIn(LifecycleStage.Implementation) });
		const { result } = await WorkflowEngine.dispatch(context, 'implement', {}, 'user', {
			specVerification: { specExists: false, tasksExist: false, documentsExist: false },
			override: { force: true, reason: 'emergency hotfix' },
		});
		// Force override no longer bypasses — command is blocked, escalation logged
		expect(result.success).toBe(false);
		expect(result.error).toContain('ESCALATION');
	});
});
