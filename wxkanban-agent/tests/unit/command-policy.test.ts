import { describe, it, expect } from 'vitest';
import { CommandPolicyEngine, SpecVerification } from '../../core/policy/command-policy';
import { LifecycleStage } from '../../core/schemas/lifecycle';

describe('CommandPolicyEngine.evaluate', () => {
	it('allows stage-specific command in correct stage', () => {
		expect(CommandPolicyEngine.evaluate(LifecycleStage.Design, 'buildscope')).toBe(true);
		expect(CommandPolicyEngine.evaluate(LifecycleStage.Design, 'createspecs')).toBe(true);
		expect(CommandPolicyEngine.evaluate(LifecycleStage.Implementation, 'implement')).toBe(true);
	});

	it('denies stage-specific command in wrong stage', () => {
		expect(CommandPolicyEngine.evaluate(LifecycleStage.Release, 'buildscope')).toBe(false);
		expect(CommandPolicyEngine.evaluate(LifecycleStage.Design, 'implement')).toBe(false);
		expect(CommandPolicyEngine.evaluate(LifecycleStage.QATesting, 'createspecs')).toBe(false);
	});

	it('allows cross-cutting commands in every stage', () => {
		for (const stage of Object.values(LifecycleStage)) {
			expect(CommandPolicyEngine.evaluate(stage, 'dbpush')).toBe(true);
			expect(CommandPolicyEngine.evaluate(stage, 'pipeline-agent')).toBe(true);
		}
	});

	it('denies unknown commands', () => {
		expect(CommandPolicyEngine.evaluate(LifecycleStage.Design, 'nonexistent')).toBe(false);
	});

	it('allows custom commands when provided', () => {
		expect(CommandPolicyEngine.evaluate(LifecycleStage.Design, 'my-custom-cmd', ['my-custom-cmd'])).toBe(true);
	});

	it('does not allow custom commands when not provided', () => {
		expect(CommandPolicyEngine.evaluate(LifecycleStage.Design, 'my-custom-cmd')).toBe(false);
	});
});

describe('CommandPolicyEngine.evaluateWithDetails', () => {
	it('returns structured approval for allowed command', () => {
		const result = CommandPolicyEngine.evaluateWithDetails(LifecycleStage.Design, 'buildscope');
		expect(result.allowed).toBe(true);
		expect(result.reason).toBeUndefined();
		expect(result.stage).toBe(LifecycleStage.Design);
		expect(result.command).toBe('buildscope');
		expect(result.allowedCommands).toContain('buildscope');
		expect(result.allowedCommands).toContain('dbpush');
	});

	it('returns structured denial with reason for disallowed command', () => {
		const result = CommandPolicyEngine.evaluateWithDetails(LifecycleStage.Release, 'buildscope');
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('buildscope');
		expect(result.reason).toContain('Release');
		expect(result.stage).toBe(LifecycleStage.Release);
		expect(result.command).toBe('buildscope');
	});

	it('includes cross-cutting commands in allowedCommands list', () => {
		const result = CommandPolicyEngine.evaluateWithDetails(LifecycleStage.Beta, 'prepareRelease');
		expect(result.allowedCommands).toContain('prepareRelease');
		expect(result.allowedCommands).toContain('dbpush');
		expect(result.allowedCommands).toContain('pipeline-agent');
	});

	it('includes custom commands in allowedCommands list', () => {
		const result = CommandPolicyEngine.evaluateWithDetails(
			LifecycleStage.Design, 'custom-lint', ['custom-lint', 'custom-deploy']
		);
		expect(result.allowed).toBe(true);
		expect(result.allowedCommands).toContain('custom-lint');
		expect(result.allowedCommands).toContain('custom-deploy');
		expect(result.allowedCommands).toContain('buildscope');
	});
});

describe('CommandPolicyEngine.isSpecGatedCommand', () => {
	it('returns true for implementation-phase commands', () => {
		expect(CommandPolicyEngine.isSpecGatedCommand('implement')).toBe(true);
		expect(CommandPolicyEngine.isSpecGatedCommand('createtesttasks')).toBe(true);
		expect(CommandPolicyEngine.isSpecGatedCommand('runqa')).toBe(true);
		expect(CommandPolicyEngine.isSpecGatedCommand('runhuman')).toBe(true);
		expect(CommandPolicyEngine.isSpecGatedCommand('prepareRelease')).toBe(true);
		expect(CommandPolicyEngine.isSpecGatedCommand('finalizeRelease')).toBe(true);
	});

	it('returns false for design-phase and cross-cutting commands', () => {
		expect(CommandPolicyEngine.isSpecGatedCommand('buildscope')).toBe(false);
		expect(CommandPolicyEngine.isSpecGatedCommand('createspecs')).toBe(false);
		expect(CommandPolicyEngine.isSpecGatedCommand('dbpush')).toBe(false);
		expect(CommandPolicyEngine.isSpecGatedCommand('pipeline-agent')).toBe(false);
	});
});

describe('CommandPolicyEngine.evaluateSpecFirst', () => {
	const VERIFIED: SpecVerification = {
		specExists: true,
		tasksExist: true,
		documentsExist: true,
		specStatus: 'in_progress',
	};

	it('allows spec-gated command when spec is fully verified', () => {
		const result = CommandPolicyEngine.evaluateSpecFirst(
			LifecycleStage.Implementation, 'implement', VERIFIED
		);
		expect(result.allowed).toBe(true);
		expect(result.requiresSpecCheck).toBe(true);
	});

	it('blocks when spec does not exist in DB', () => {
		const result = CommandPolicyEngine.evaluateSpecFirst(
			LifecycleStage.Implementation, 'implement',
			{ specExists: false, tasksExist: true, documentsExist: true }
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('IMPLEMENTATION BLOCKED');
		expect(result.reason).toContain('spec');
	});

	it('blocks when tasks do not exist in DB', () => {
		const result = CommandPolicyEngine.evaluateSpecFirst(
			LifecycleStage.Implementation, 'implement',
			{ specExists: true, tasksExist: false, documentsExist: true }
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('tasks');
	});

	it('blocks when documents do not exist in DB', () => {
		const result = CommandPolicyEngine.evaluateSpecFirst(
			LifecycleStage.Implementation, 'implement',
			{ specExists: true, tasksExist: true, documentsExist: false }
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('documents');
	});

	it('blocks when no verification provided', () => {
		const result = CommandPolicyEngine.evaluateSpecFirst(
			LifecycleStage.Implementation, 'implement', undefined
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('verification not performed');
	});

	it('blocks on invalid spec status', () => {
		const result = CommandPolicyEngine.evaluateSpecFirst(
			LifecycleStage.Implementation, 'implement',
			{ specExists: true, tasksExist: true, documentsExist: true, specStatus: 'draft' }
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('draft');
	});

	it('blocks --force --reason override and logs escalation (no bypass allowed)', () => {
		const result = CommandPolicyEngine.evaluateSpecFirst(
			LifecycleStage.Implementation, 'implement',
			{ specExists: false, tasksExist: true, documentsExist: true },
			{ force: true, reason: 'hotfix per manager approval' }
		);
		expect(result.allowed).toBe(false);
		expect(result.overrideUsed).toBe(true);
		expect(result.reason).toContain('ESCALATION');
		expect(result.reason).toContain('hotfix');
	});

	it('passes through non-spec-gated commands without verification', () => {
		const result = CommandPolicyEngine.evaluateSpecFirst(
			LifecycleStage.Design, 'buildscope', undefined
		);
		expect(result.allowed).toBe(true);
		expect(result.requiresSpecCheck).toBe(false);
	});

	it('still enforces stage gate even for spec-gated commands', () => {
		const result = CommandPolicyEngine.evaluateSpecFirst(
			LifecycleStage.Design, 'implement', VERIFIED
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('not permitted');
	});
});
