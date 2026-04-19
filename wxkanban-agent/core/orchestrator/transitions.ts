// Workflow transitions — defines valid stage transitions and enforces ordering
import { LifecycleStage } from '../schemas/lifecycle';

const STAGE_ORDER: LifecycleStage[] = [
	LifecycleStage.Design,
	LifecycleStage.Implementation,
	LifecycleStage.QATesting,
	LifecycleStage.HumanTesting,
	LifecycleStage.Beta,
	LifecycleStage.Release,
];

export interface TransitionResult {
	allowed: boolean;
	from: LifecycleStage;
	to: LifecycleStage;
	reason?: string;
}

export function canTransition(from: LifecycleStage, to: LifecycleStage): TransitionResult {
	const fromIndex = STAGE_ORDER.indexOf(from);
	const toIndex = STAGE_ORDER.indexOf(to);

	if (fromIndex === -1 || toIndex === -1) {
		return { allowed: false, from, to, reason: 'Unknown lifecycle stage' };
	}

	// Only forward transitions allowed (next stage or same stage)
	if (toIndex === fromIndex) {
		return { allowed: true, from, to };
	}

	if (toIndex === fromIndex + 1) {
		return { allowed: true, from, to };
	}

	if (toIndex < fromIndex) {
		return {
			allowed: false,
			from,
			to,
			reason: `Cannot move backward from '${from}' to '${to}'. Stages progress forward only.`,
		};
	}

	return {
		allowed: false,
		from,
		to,
		reason: `Cannot skip from '${from}' to '${to}'. Must progress through intermediate stages.`,
	};
}

export function getNextStage(current: LifecycleStage): LifecycleStage | undefined {
	const index = STAGE_ORDER.indexOf(current);
	if (index === -1 || index === STAGE_ORDER.length - 1) {
		return undefined;
	}
	return STAGE_ORDER[index + 1];
}

export function getStageIndex(stage: LifecycleStage): number {
	return STAGE_ORDER.indexOf(stage);
}

export function getStageOrder(): readonly LifecycleStage[] {
	return STAGE_ORDER;
}
