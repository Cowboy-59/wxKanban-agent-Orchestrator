import { describe, it, expect } from 'vitest';
import { LifecycleStage, STAGE_ORDER } from '../../core/schemas/lifecycle';

describe('LifecycleStage enum', () => {
	it('has exactly 6 stages', () => {
		const stages = Object.values(LifecycleStage);
		expect(stages).toHaveLength(6);
	});

	it('has correct string values matching DB storage (spec 030 Path A)', () => {
		expect(LifecycleStage.Design).toBe('Design');
		expect(LifecycleStage.Implementation).toBe('Implementation');
		expect(LifecycleStage.QATesting).toBe('QA');
		expect(LifecycleStage.HumanTesting).toBe('HumanTesting');
		expect(LifecycleStage.Beta).toBe('Beta');
		expect(LifecycleStage.Release).toBe('Release');
	});
});

describe('STAGE_ORDER (spec 030 FR-011)', () => {
	it('contains every LifecycleStage exactly once in canonical order', () => {
		expect(STAGE_ORDER).toEqual([
			LifecycleStage.Design,
			LifecycleStage.Implementation,
			LifecycleStage.QATesting,
			LifecycleStage.HumanTesting,
			LifecycleStage.Beta,
			LifecycleStage.Release,
		]);
	});
});
