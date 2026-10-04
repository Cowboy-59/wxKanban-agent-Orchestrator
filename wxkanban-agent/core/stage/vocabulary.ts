// SCOPE-123 FR-009 — the one stage vocabulary for per-scope progression.
//
// A scope's stage is a `LifecycleStage` value. `projectphases.phasename` already stores these
// byte for byte, and `specificationphases.phase` now stores the same values. The uppercase set in
// that table's schema comment was never written by live code; using it would have added a
// vocabulary instead of removing one.
//
// Values are validated where they cross into or out of the database and REJECTED when they do not
// match, never coerced. A coerced stage is a gate decision made on a value nobody wrote.

import { LifecycleStage, STAGE_ORDER } from '../schemas/lifecycle';

// [SCOPE 123 / T013] BEGIN — UnknownStageValueError: an unrecognised stage is refused, not mapped
export class UnknownStageValueError extends Error {
	constructor(
		public readonly value: unknown,
		public readonly where: string,
	) {
		super(
			`Unrecognised stage value ${JSON.stringify(value)} at ${where}. ` +
				`Valid stages: ${STAGE_ORDER.join(', ')}. ` +
				`Stage values are rejected, never coerced (SCOPE-123 FR-009).`,
		);
		this.name = 'UnknownStageValueError';
	}
}
// [SCOPE 123 / T013] END

// [SCOPE 123 / T013] BEGIN — isStage: exact membership in the stage vocabulary
export function isStage(value: unknown): value is LifecycleStage {
	return typeof value === 'string' && (STAGE_ORDER as readonly string[]).includes(value);
}
// [SCOPE 123 / T013] END

// [SCOPE 123 / T013] BEGIN — parseStage: the boundary check every read and write goes through
export function parseStage(value: unknown, where: string): LifecycleStage {
	if (isStage(value)) return value;
	throw new UnknownStageValueError(value, where);
}
// [SCOPE 123 / T013] END

// [SCOPE 123 / T013] BEGIN — stage ordering helpers (rollup and comparisons)
export function stageIndex(stage: LifecycleStage): number {
	return STAGE_ORDER.indexOf(stage);
}

export function lowestStage(stages: readonly LifecycleStage[]): LifecycleStage {
	let lowest: LifecycleStage = LifecycleStage.Release;
	for (const stage of stages) {
		if (stageIndex(stage) < stageIndex(lowest)) lowest = stage;
	}
	return stages.length === 0 ? LifecycleStage.Design : lowest;
}

// A scope's display label, used in every refusal so the caller can see which scope was judged.
export function scopeLabel(specNumber: string): string {
	return `SPEC-${specNumber}`;
}
// [SCOPE 123 / T013] END

// [SCOPE 123 / T005] BEGIN — which task statuses count as closed
//
// `done` is the MCP's word and `completed` the app's; both mean the work is finished. `orphaned`
// is set by the PM sync when the external item it mirrors is gone, so nobody can work it, and a
// scope must not wait on it forever. Every other status, `blocked` included, is open.
export const CLOSED_TASK_STATUSES: readonly string[] = ['done', 'completed', 'orphaned'];

export function isClosedTaskStatus(status: string): boolean {
	return CLOSED_TASK_STATUSES.includes(status);
}

// Scopes in these statuses are no longer active: they never advance and never count toward the
// project's rollup stage.
export const INACTIVE_SCOPE_STATUSES: readonly string[] = ['archived', 'deferred'];
// [SCOPE 123 / T005] END

// [SCOPE 123 / T020] BEGIN — untrackedLowerBound: a display stage for a scope with no stage row
//
// Amendment C, decision 9. A gate judges an untracked scope on its full inferred stage, which
// needs test-gate queries; a list view showing every scope cannot afford that per scope. This is
// the cheap bound from task counts alone. The full inference never stops earlier than it (both
// need tasks to leave Design and no open task to leave Implementation), so a rollup over these
// values can only read earlier than the truth, never later.
export function untrackedLowerBound(taskCount: number, openTaskCount: number): LifecycleStage {
	if (taskCount === 0) return LifecycleStage.Design;
	if (openTaskCount > 0) return LifecycleStage.Implementation;
	return LifecycleStage.QATesting;
}
// [SCOPE 123 / T020] END
