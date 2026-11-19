import { describe, it, expect } from 'vitest';
import { canTransition, getNextStage, getStageIndex, getStageOrder } from '../../core/orchestrator/transitions';
import { LifecycleStage } from '../../core/schemas/lifecycle';

describe('canTransition', () => {
	it('allows transition to the next stage', () => {
		const result = canTransition(LifecycleStage.Design, LifecycleStage.Implementation);
		expect(result.allowed).toBe(true);
	});

	it('allows staying in the same stage', () => {
		const result = canTransition(LifecycleStage.Design, LifecycleStage.Design);
		expect(result.allowed).toBe(true);
	});

	it('denies backward transition', () => {
		const result = canTransition(LifecycleStage.Implementation, LifecycleStage.Design);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('backward');
	});

	it('denies skipping stages', () => {
		const result = canTransition(LifecycleStage.Design, LifecycleStage.QATesting);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('skip');
	});

	it('allows full forward chain one step at a time', () => {
		const stages = getStageOrder();
		for (let i = 0; i < stages.length - 1; i++) {
			const result = canTransition(stages[i], stages[i + 1]);
			expect(result.allowed).toBe(true);
		}
	});
});

describe('getNextStage', () => {
	it('returns Implementation after Design', () => {
		expect(getNextStage(LifecycleStage.Design)).toBe(LifecycleStage.Implementation);
	});

	it('returns undefined after Release', () => {
		expect(getNextStage(LifecycleStage.Release)).toBeUndefined();
	});
});

describe('getStageIndex', () => {
	it('returns 0 for Design', () => {
		expect(getStageIndex(LifecycleStage.Design)).toBe(0);
	});

	it('returns 5 for Release', () => {
		expect(getStageIndex(LifecycleStage.Release)).toBe(5);
	});
});

describe('getStageOrder', () => {
	it('has 6 stages in order', () => {
		const order = getStageOrder();
		expect(order).toHaveLength(6);
		expect(order[0]).toBe(LifecycleStage.Design);
		expect(order[5]).toBe(LifecycleStage.Release);
	});
});
