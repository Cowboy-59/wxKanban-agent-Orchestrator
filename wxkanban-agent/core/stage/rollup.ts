// SCOPE-123 FR-006 — the project's stage is a rollup of its scopes, never a gate.
//
// Rule (decided by the product owner 2026-10-04): the project is at the LOWEST stage among its
// active scopes. It reads as far along as its least advanced scope, so it shows Release only when
// every scope is there. A project with no active scopes reads as Design.
//
// A scope with no stage row yet (Amendment C, decision 9) counts at its task-count lower bound
// (untrackedLowerBound), flagged `tracked: false`: a list view cannot run the full inference per
// scope, and the bound can only make the rollup read earlier, never later.
//
// Nothing in the policy layer calls this. It exists for display and reporting surfaces.

import { LifecycleStage } from '../schemas/lifecycle';
import { StageQueryClient } from './store';
import {
	CLOSED_TASK_STATUSES,
	INACTIVE_SCOPE_STATUSES,
	lowestStage,
	parseStage,
	untrackedLowerBound,
} from './vocabulary';

export interface ScopeStageRow {
	scopeId: string;
	specNumber: string;
	stage: LifecycleStage;
	// false: no stage row yet; `stage` is the task-count lower bound.
	tracked: boolean;
}

interface RawStageRow {
	projectid: string;
	specid: string;
	specnumber: string;
	phase: string | null;
	total: number | string;
	open: number | string;
}

// One query shape for both readers: each active scope's open stage row plus its task counts.
const STAGE_ROWS_SQL = `
	SELECT ps.projectid, ps.id AS specid, ps.specnumber, sp.phase,
	       (SELECT COUNT(*)::int FROM projecttasks t WHERE t.specid = ps.id) AS total,
	       (SELECT COUNT(*)::int FROM projecttasks t
	         WHERE t.specid = ps.id AND t.status <> ALL($3::text[])) AS open
	  FROM projectspecifications ps
	  LEFT JOIN specificationphases sp
	         ON sp.specificationid = ps.id
	        AND sp.exitedat IS NULL
	 WHERE ps.projectid = ANY($1::uuid[])
	   AND ps.status <> ALL($2::text[])
	 ORDER BY ps.specnumber`;

// [SCOPE 123 / T009] BEGIN — readStageRows: every active scope's display stage, one query
// [SCOPE 123 / T020] MODIFIED-BY — untracked scopes take the task-count lower bound, flagged
async function readStageRows(
	db: StageQueryClient,
	projectIds: readonly string[],
): Promise<Array<ScopeStageRow & { projectId: string }>> {
	if (projectIds.length === 0) return [];
	const result = await db.query<RawStageRow>(STAGE_ROWS_SQL, [
		projectIds,
		INACTIVE_SCOPE_STATUSES,
		CLOSED_TASK_STATUSES,
	]);
	return result.rows.map((row) => {
		const tracked = row.phase !== null;
		return {
			projectId: row.projectid,
			scopeId: row.specid,
			specNumber: row.specnumber,
			tracked,
			stage: tracked
				? parseStage(row.phase, `specificationphases(open row of ${row.specid}).phase`)
				: untrackedLowerBound(Number(row.total), Number(row.open)),
		};
	});
}

export async function readProjectScopeStages(
	db: StageQueryClient,
	projectId: string,
): Promise<ScopeStageRow[]> {
	const rows = await readStageRows(db, [projectId]);
	return rows.map(({ scopeId, specNumber, stage, tracked }) => ({ scopeId, specNumber, stage, tracked }));
}
// [SCOPE 123 / T009] END

// [SCOPE 123 / T009] BEGIN — resolveRollupStages: the rollup for many projects in one query
// For list views (project cards). A project with no active scopes reads as Design, the same as
// resolveProjectRollupStage.
export async function resolveRollupStages(
	db: StageQueryClient,
	projectIds: readonly string[],
): Promise<Map<string, LifecycleStage>> {
	const rows = await readStageRows(db, projectIds);
	const byProject = new Map<string, LifecycleStage[]>();
	for (const row of rows) {
		const list = byProject.get(row.projectId) ?? [];
		list.push(row.stage);
		byProject.set(row.projectId, list);
	}
	const rollups = new Map<string, LifecycleStage>();
	for (const projectId of projectIds) {
		rollups.set(projectId, lowestStage(byProject.get(projectId) ?? []));
	}
	return rollups;
}
// [SCOPE 123 / T009] END

// [SCOPE 123 / T009] BEGIN — resolveProjectRollupStage: lowest stage among active scopes
export async function resolveProjectRollupStage(
	db: StageQueryClient,
	projectId: string,
): Promise<LifecycleStage> {
	const rows = await readProjectScopeStages(db, projectId);
	return lowestStage(rows.map((r) => r.stage));
}
// [SCOPE 123 / T009] END
