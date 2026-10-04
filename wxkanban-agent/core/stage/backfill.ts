// SCOPE-123 FR-007 — backfill a project's scopes that have no tracked stage.
//
// Projects in the broken state have zero open `specificationphases` rows. Each untracked scope's
// stage is inferred by running the SAME exit rule the live advance uses (FR-012), starting from
// Design and stepping forward only while the evidence for leaving each stage is present. The first
// stage whose exit condition fails is where the scope lands, and that failing condition is recorded
// with the evidence for every stage it passed.
//
// That makes the inference conservative by construction: a stage is skipped only on positive
// evidence, a gate that cannot be read stops the walk, and a scope with no tasks is Design. The
// spec status is recorded as context but never promotes a scope on its own: it is hand-set and has
// drifted from the code before (SCOPE-123 Business Problem).
//
// An explicit command, run per project (decision 3, 2026-10-04): `planBackfill` is the dry run;
// `applyBackfill` writes, and only scopes that still have no open row, so a second run changes
// nothing.

import { LifecycleStage } from '../schemas/lifecycle';
import { StageDb, StageQueryClient, lockScope, openInitialStage, readOpenStageRow } from './store';
import {
	ScopeGateChecker,
	ScopeRecord,
	StageBlocker,
	StageEnteredHook,
	inferStage,
	recordStageEvent,
} from './advance';
import { INACTIVE_SCOPE_STATUSES, scopeLabel } from './vocabulary';

export type BackfillAction = 'write' | 'skip-tracked' | 'skip-inactive';

export interface BackfillScopePlan {
	scopeId: string;
	specNumber: string;
	title: string;
	status: string;
	action: BackfillAction;
	// Set for 'write' (the inferred stage) and 'skip-tracked' (the stage already recorded).
	stage: LifecycleStage | null;
	taskCount: number;
	openTaskCount: number;
	evidence: string[];
	stoppedBy: StageBlocker[];
}

export interface BackfillApplyResult {
	scopeId: string;
	specNumber: string;
	outcome: 'written' | 'skipped-tracked' | 'skipped-inactive';
	stage: LifecycleStage | null;
	// Set when the stage was written but its entry work (onStageEntered) failed.
	hookError?: string;
}

// [SCOPE 123 / T011] BEGIN — inferScopeStage: walk the live exit rule forward from Design
// [SCOPE 123 / T020] MODIFIED-BY — delegates to advance.inferStage, which the gates now share
export async function inferScopeStage(
	db: StageQueryClient,
	scope: ScopeRecord,
	gates: ScopeGateChecker,
): Promise<{
	stage: LifecycleStage;
	evidence: string[];
	stoppedBy: StageBlocker[];
	taskCount: number;
	openTaskCount: number;
}> {
	return inferStage(db, scope, gates);
}
// [SCOPE 123 / T011] END

// [SCOPE 123 / T011] BEGIN — planBackfill: the dry run, one entry per scope in the project
export async function planBackfill(
	db: StageQueryClient,
	projectId: string,
	gates: ScopeGateChecker,
): Promise<BackfillScopePlan[]> {
	const result = await db.query<{
		id: string;
		projectid: string;
		specnumber: string;
		title: string;
		status: string;
	}>(
		`SELECT id, projectid, specnumber, title, status
		   FROM projectspecifications
		  WHERE projectid = $1
		  ORDER BY specnumber, createdat`,
		[projectId],
	);

	const plans: BackfillScopePlan[] = [];
	for (const row of result.rows) {
		const scope: ScopeRecord = {
			id: row.id,
			projectId: row.projectid,
			specNumber: row.specnumber,
			title: row.title,
			status: row.status,
		};
		const base = { scopeId: scope.id, specNumber: scope.specNumber, title: scope.title, status: scope.status };

		if (INACTIVE_SCOPE_STATUSES.includes(scope.status)) {
			plans.push({ ...base, action: 'skip-inactive', stage: null, taskCount: 0, openTaskCount: 0, evidence: [`status '${scope.status}' is inactive`], stoppedBy: [] });
			continue;
		}

		const open = await readOpenStageRow(db, scope.id);
		if (open) {
			plans.push({ ...base, action: 'skip-tracked', stage: open.phase, taskCount: 0, openTaskCount: 0, evidence: [`already tracked in ${open.phase} since ${open.enteredAt}`], stoppedBy: [] });
			continue;
		}

		const inferred = await inferScopeStage(db, scope, gates);
		plans.push({
			...base,
			action: 'write',
			stage: inferred.stage,
			taskCount: inferred.taskCount,
			openTaskCount: inferred.openTaskCount,
			evidence: inferred.evidence,
			stoppedBy: inferred.stoppedBy,
		});
	}
	return plans;
}
// [SCOPE 123 / T011] END

// [SCOPE 123 / T011] BEGIN — applyBackfill: write the planned stages, idempotently
//
// Re-checks each scope under its lock and skips any that gained an open row since the plan was
// made, so a concurrent advance or a second run is never overwritten.
export async function applyBackfill(
	db: StageDb,
	projectId: string,
	plans: readonly BackfillScopePlan[],
	options: { actor: string; source: string; onStageEntered?: StageEnteredHook },
): Promise<BackfillApplyResult[]> {
	const results: BackfillApplyResult[] = [];
	for (const plan of plans) {
		if (plan.action !== 'write' || plan.stage === null) {
			results.push({
				scopeId: plan.scopeId,
				specNumber: plan.specNumber,
				outcome: plan.action === 'skip-inactive' ? 'skipped-inactive' : 'skipped-tracked',
				stage: plan.stage,
			});
			continue;
		}
		const stage = plan.stage;
		const notes =
			`Backfilled by SCOPE-123 FR-007. Evidence: ${plan.evidence.join('; ')}. ` +
			`Stopped at ${stage}: ${plan.stoppedBy.map((b) => b.message).join(' ') || 'final stage'}`;
		const outcome = await db.transaction(async (tx) => {
			await lockScope(tx, plan.scopeId);
			const written = await openInitialStage(tx, {
				scopeId: plan.scopeId,
				stage,
				notes,
				blockers: plan.stoppedBy.length > 0 ? JSON.stringify(plan.stoppedBy) : null,
			});
			if (written.status === 'written') {
				await recordStageEvent(tx, {
					projectId,
					type: 'stage_backfilled',
					source: options.source,
					actor: options.actor,
					rawContent: `${scopeLabel(plan.specNumber)} backfilled at ${stage}`,
					metadata: {
						specId: plan.scopeId,
						specNumber: plan.specNumber,
						stage,
						evidence: plan.evidence,
						stoppedBy: plan.stoppedBy.map((b) => b.kind),
						specificationPhaseId: written.openedRowId,
					},
				});
			}
			return written.status;
		});
		// A scope placed in a stage gets that stage's entry work, the same as one that advanced into
		// it (e.g. a scope backfilled into HumanTesting has its human set released). A failure here
		// is reported, not thrown: the stage row stands, and the work is idempotent to retry.
		let hookError: string | undefined;
		if (outcome === 'written' && options.onStageEntered) {
			try {
				await options.onStageEntered({ projectId, scopeId: plan.scopeId, from: null, to: stage });
			} catch (err) {
				hookError = err instanceof Error ? err.message : String(err);
			}
		}
		results.push({
			scopeId: plan.scopeId,
			specNumber: plan.specNumber,
			outcome: outcome === 'written' ? 'written' : 'skipped-tracked',
			stage,
			...(hookError !== undefined ? { hookError } : {}),
		});
	}
	return results;
}
// [SCOPE 123 / T011] END
