import { describe, it, expect } from 'vitest';
import { LifecycleStage, AllowedCommandsByStage, CrossCuttingCommands } from '../../core/schemas/lifecycle';

describe('LifecycleStage enum', () => {
	it('has exactly 6 stages', () => {
		const stages = Object.values(LifecycleStage);
		expect(stages).toHaveLength(6);
	});

	it('has correct string values', () => {
		expect(LifecycleStage.Design).toBe('Design');
		expect(LifecycleStage.Implementation).toBe('Implementation');
		expect(LifecycleStage.QATesting).toBe('QA Testing');
		expect(LifecycleStage.HumanTesting).toBe('Human Testing');
		expect(LifecycleStage.Beta).toBe('Beta');
		expect(LifecycleStage.Release).toBe('Release');
	});
});

describe('AllowedCommandsByStage', () => {
	it('has a mapping for every lifecycle stage', () => {
		for (const stage of Object.values(LifecycleStage)) {
			expect(AllowedCommandsByStage[stage]).toBeDefined();
			expect(Array.isArray(AllowedCommandsByStage[stage])).toBe(true);
		}
	});

	it('maps Design to buildscope and createspecs', () => {
		expect(AllowedCommandsByStage[LifecycleStage.Design]).toEqual(['buildscope', 'createspecs']);
	});

	it('maps Implementation to implement and createtesttasks', () => {
		expect(AllowedCommandsByStage[LifecycleStage.Implementation]).toEqual(['implement', 'createtesttasks']);
	});

	it('maps each stage to at least one command', () => {
		for (const stage of Object.values(LifecycleStage)) {
			expect(AllowedCommandsByStage[stage].length).toBeGreaterThan(0);
		}
	});
});

describe('CrossCuttingCommands', () => {
	it('contains dbpush and pipeline-agent', () => {
		expect(CrossCuttingCommands).toContain('dbpush');
		expect(CrossCuttingCommands).toContain('pipeline-agent');
	});

	it('has no overlap with stage-specific commands', () => {
		const allStageCommands = Object.values(AllowedCommandsByStage).flat();
		for (const cmd of CrossCuttingCommands) {
			expect(allStageCommands).not.toContain(cmd);
		}
	});
});
