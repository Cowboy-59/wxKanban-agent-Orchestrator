// SCOPE-123 FR-003, FR-010, FR-011, FR-012 — the ONE place a scope's stage advances.
//
// Task completion reaches the database through two doors: the application's task service and the
// MCP `project.update_task_status` tool. Both call `advanceScope` after their own write commits.
// Putting the rule in each caller would guarantee they disagree the first time one is edited.
//
// The rule, per stage (FR-012):
//
//   Design          leaves when the scope has at least one task (createSpecs finished — FR-011)
//   Implementation  leaves when it has tasks and none is open (FR-003)
//   QA              leaves when no task is open, at least one machine test exists for the scope,
//                   and the machine test gate is clear (FR-010; "no tests stops in QA")
//   HumanTesting    leaves when no task is open and every released human test is signed
//   Beta            leaves when no task is open and every forced test of either kind is clear
//   Release         final; never leaves
//
// A project with testing switched off (`skiptesting`) passes the test conditions.
//
// After a trigger the service keeps advancing while the stage it lands in is also clear, one
// canTransition-checked step at a time, each step recorded on its own. It stops at the first stage
// with something outstanding and returns what that is, so a refusal can say what would move it.
//
// The test gate is INJECTED. The application passes TestGateService narrowed to the scope; the MCP
// server passes its own test_gate_status logic narrowed the same way. This module never decides on
// its own whether a test is signed (SCOPE-111: one source of that answer per process).

import { LifecycleStage } from '../schemas/lifecycle';
import { canTransition, getNextStage } from '../orchestrator/transitions';
import {
	StageDb,
	StageQueryClient,
	lockScope,
	readOpenStageRow,
	readScopeStage,
	uuidv7,
	writeTransition,
	IllegalTransitionError,
} from './store';
import { CLOSED_TASK_STATUSES, INACTIVE_SCOPE_STATUSES, scopeLabel } from './vocabulary';

export type GateRequirement = 'ai' | 'user' | 'all';

export interface GateBlockingItem {
	itemKey: string;
	title: string;
	why: string;
}

export interface ScopeGateVerdict {
	passed: boolean;
	// The project has testing switched off; the gate passes with the evidence still listed.
	skipped: boolean;
	// Items of this requirement that belong to the scope, forced or not. QA uses it to tell
	// "no machine tests exist" apart from "every machine test is clear".
	itemCount: number;
	blocking: GateBlockingItem[];
}

export type ScopeGateChecker = (query: {
	projectId: string;
	scopeId: string;
	requirement: GateRequirement;
}) => Promise<ScopeGateVerdict>;

export type StageBlockerKind =
	| 'no_tasks'
	| 'open_tasks'
	| 'no_machine_tests'
	| 'gate'
	| 'gate_unavailable'
	| 'final_stage'
	| 'scope_inactive'
	| 'stage_hook_failed';

export interface StageBlocker {
	kind: StageBlockerKind;
	message: string;
	count?: number;
	requirement?: GateRequirement;
	items?: GateBlockingItem[];
}

export interface ScopeRecord {
	id: string;
	projectId: string;
	specNumber: string;
	title: string;
	status: string;
}

export interface ScopeAssessment {
	scope: ScopeRecord;
	stage: LifecycleStage;
	taskCount: number;
	openTaskCount: number;
	ready: boolean;
	next: LifecycleStage | null;
	blockers: StageBlocker[];
	// Amendment C: false when the scope has no stage row yet; `stage` is then inferred by the
	// backfill's rule (read-only) and `inferredEvidence` says from what.
	tracked: boolean;
	inferredEvidence?: string[];
}

export interface StageExitFacts {
	stage: LifecycleStage;
	taskCount: number;
	openTaskCount: number;
	gate?: { requirement: GateRequirement; verdict?: ScopeGateVerdict; error?: string };
}

// [SCOPE 123 / T015] BEGIN — which test gate guards each stage's exit
export const STAGE_EXIT_GATE: Readonly<Record<LifecycleStage, GateRequirement | null>> = {
	[LifecycleStage.Design]: null,
	[LifecycleStage.Implementation]: null,
	[LifecycleStage.QATesting]: 'ai',
	[LifecycleStage.HumanTesting]: 'user',
	[LifecycleStage.Beta]: 'all',
	[LifecycleStage.Release]: null,
};

const GATE_NAME: Readonly<Record<GateRequirement, string>> = {
	ai: 'machine test gate',
	user: 'human test sign-off gate',
	all: 'release test gate',
};
// [SCOPE 123 / T015] END

// [SCOPE 123 / T016] BEGIN — evaluateStageExit: the pure FR-012 rule for one stage
export function evaluateStageExit(facts: StageExitFacts): { ready: boolean; blockers: StageBlocker[] } {
	const blockers: StageBlocker[] = [];
	const { stage, taskCount, openTaskCount } = facts;

	if (stage === LifecycleStage.Release) {
		return {
			ready: false,
			blockers: [{ kind: 'final_stage', message: 'Release is the final stage.' }],
		};
	}

	if (stage === LifecycleStage.Design) {
		if (taskCount === 0) {
			blockers.push({
				kind: 'no_tasks',
				message: 'The scope has no tasks yet. Run createSpecs to generate them.',
			});
		}
		return { ready: blockers.length === 0, blockers };
	}

	if (taskCount === 0) {
		blockers.push({ kind: 'no_tasks', message: 'The scope has no tasks.' });
	} else if (openTaskCount > 0) {
		blockers.push({
			kind: 'open_tasks',
			count: openTaskCount,
			message: `${openTaskCount} of ${taskCount} tasks still open.`,
		});
	}

	const requirement = STAGE_EXIT_GATE[stage];
	if (requirement) {
		const gate = facts.gate;
		if (!gate || gate.requirement !== requirement) {
			// The gate was not evaluated. Only acceptable when something else already blocks; the
			// caller skips the gate query when tasks are open.
			if (blockers.length === 0) {
				blockers.push({
					kind: 'gate_unavailable',
					requirement,
					message: `The ${GATE_NAME[requirement]} was not evaluated.`,
				});
			}
		} else if (gate.error !== undefined || !gate.verdict) {
			blockers.push({
				kind: 'gate_unavailable',
				requirement,
				message: `The ${GATE_NAME[requirement]} could not be evaluated: ${gate.error ?? 'no verdict'}.`,
			});
		} else if (!gate.verdict.skipped) {
			if (requirement === 'ai' && gate.verdict.itemCount === 0) {
				blockers.push({
					kind: 'no_machine_tests',
					requirement,
					message:
						'The scope has no machine tests, so QA cannot clear it. Run /wxCreateTestPlan for this scope.',
				});
			} else if (!gate.verdict.passed) {
				blockers.push({
					kind: 'gate',
					requirement,
					count: gate.verdict.blocking.length,
					items: gate.verdict.blocking,
					message: `The ${GATE_NAME[requirement]} has ${gate.verdict.blocking.length} forced test(s) outstanding: ${gate.verdict.blocking
						.slice(0, 5)
						.map((b) => `${b.itemKey} (${b.why})`)
						.join(', ')}${gate.verdict.blocking.length > 5 ? ', ...' : ''}.`,
				});
			}
		}
	}

	return { ready: blockers.length === 0, blockers };
}
// [SCOPE 123 / T016] END

// [SCOPE 123 / T005] BEGIN — reading the scope and its task counts
export async function readScopeRecord(
	db: StageQueryClient,
	scopeId: string,
): Promise<ScopeRecord | null> {
	const result = await db.query<{
		id: string;
		projectid: string;
		specnumber: string;
		title: string;
		status: string;
	}>(
		`SELECT id, projectid, specnumber, title, status
		   FROM projectspecifications
		  WHERE id = $1`,
		[scopeId],
	);
	const row = result.rows[0];
	return row
		? {
				id: row.id,
				projectId: row.projectid,
				specNumber: row.specnumber,
				title: row.title,
				status: row.status,
			}
		: null;
}

export async function countScopeTasks(
	db: StageQueryClient,
	scopeId: string,
): Promise<{ taskCount: number; openTaskCount: number }> {
	const result = await db.query<{ total: number | string; open: number | string }>(
		`SELECT COUNT(*)::int AS total,
		        COUNT(*) FILTER (WHERE status <> ALL($2::text[]))::int AS open
		   FROM projecttasks
		  WHERE specid = $1`,
		[scopeId, CLOSED_TASK_STATUSES],
	);
	const row = result.rows[0];
	return { taskCount: Number(row?.total ?? 0), openTaskCount: Number(row?.open ?? 0) };
}
// [SCOPE 123 / T005] END

// [SCOPE 123 / T015] BEGIN — runGate: ask the injected gate, never fail open
async function runGate(
	gates: ScopeGateChecker,
	scope: ScopeRecord,
	requirement: GateRequirement,
): Promise<NonNullable<StageExitFacts['gate']>> {
	try {
		const verdict = await gates({ projectId: scope.projectId, scopeId: scope.id, requirement });
		return { requirement, verdict };
	} catch (err) {
		// The application's phase check fails OPEN on a gate error. An automatic advance must not:
		// a scope left in QA by mistake costs a retry, one moved past a failing test costs a release.
		return { requirement, error: err instanceof Error ? err.message : String(err) };
	}
}
// [SCOPE 123 / T015] END

// [SCOPE 123 / T016] BEGIN — assessStage: facts plus the FR-012 verdict for one stage
// [SCOPE 123 / T020] MODIFIED-BY — an untracked scope is judged on its inferred stage (decision 9)
//
// `full` evaluates the test gate even when tasks are open, so a refusal can name both (FR-010).
// The advance loop passes false and skips the gate query when tasks already block.
export async function assessStage(
	db: StageQueryClient,
	scope: ScopeRecord,
	stage: LifecycleStage,
	gates: ScopeGateChecker,
	options: { full: boolean; counts?: { taskCount: number; openTaskCount: number } },
): Promise<ScopeAssessment> {
	const counts = options.counts ?? (await countScopeTasks(db, scope.id));

	if (INACTIVE_SCOPE_STATUSES.includes(scope.status)) {
		return {
			scope,
			stage,
			...counts,
			ready: false,
			next: null,
			tracked: true,
			blockers: [
				{
					kind: 'scope_inactive',
					message: `${scopeLabel(scope.specNumber)} is ${scope.status}; inactive scopes do not advance.`,
				},
			],
		};
	}

	const requirement = STAGE_EXIT_GATE[stage];
	let gate: StageExitFacts['gate'];
	if (requirement && (options.full || counts.openTaskCount === 0)) {
		gate = await runGate(gates, scope, requirement);
	}

	const verdict = evaluateStageExit({ stage, ...counts, gate });
	return {
		scope,
		stage,
		...counts,
		ready: verdict.ready,
		next: getNextStage(stage) ?? null,
		blockers: verdict.blockers,
		tracked: true,
	};
}

export async function assessScope(
	db: StageQueryClient,
	scopeId: string,
	gates: ScopeGateChecker,
	options: { full: boolean } = { full: true },
): Promise<ScopeAssessment | null> {
	const scope = await readScopeRecord(db, scopeId);
	if (!scope) return null;
	const open = await readOpenStageRow(db, scopeId);
	if (open) return assessStage(db, scope, open.phase, gates, options);
	if (INACTIVE_SCOPE_STATUSES.includes(scope.status)) {
		return assessStage(db, scope, LifecycleStage.Design, gates, options);
	}
	const inferred = await inferStage(db, scope, gates);
	const assessment = await assessStage(db, scope, inferred.stage, gates, {
		full: options.full,
		counts: { taskCount: inferred.taskCount, openTaskCount: inferred.openTaskCount },
	});
	return { ...assessment, tracked: false, inferredEvidence: inferred.evidence };
}
// [SCOPE 123 / T016] END

// [SCOPE 123 / T020] BEGIN — inferStage: walk the live exit rule forward from Design, read-only
//
// The FR-007 inference, shared by the backfill (which then records it) and by every gate judging a
// scope that has no stage row yet (Amendment C, decision 9: judge it on its inferred stage, write
// nothing). A stage is passed only on positive evidence, so the inference is conservative.
export async function inferStage(
	db: StageQueryClient,
	scope: ScopeRecord,
	gates: ScopeGateChecker,
	counts?: { taskCount: number; openTaskCount: number },
): Promise<{
	stage: LifecycleStage;
	evidence: string[];
	stoppedBy: StageBlocker[];
	taskCount: number;
	openTaskCount: number;
}> {
	const c = counts ?? (await countScopeTasks(db, scope.id));
	const evidence: string[] = [
		`status '${scope.status}' (recorded, not used to promote)`,
		`${c.taskCount} task(s), ${c.openTaskCount} open`,
	];
	let stage = LifecycleStage.Design;
	for (;;) {
		const assessment = await assessStage(db, scope, stage, gates, { full: false, counts: c });
		const next = getNextStage(stage);
		if (!assessment.ready || !next) {
			return { stage, evidence, stoppedBy: assessment.blockers, ...c };
		}
		evidence.push(`left ${stage}: exit conditions met`);
		stage = next;
	}
}
// [SCOPE 123 / T020] END

export interface StageEventInput {
	projectId: string;
	type: 'stage_transition' | 'stage_transition_refused' | 'stage_backfilled';
	source: string;
	actor: string;
	rawContent: string;
	metadata: Record<string, unknown>;
}

// [SCOPE 123 / T005] BEGIN — recordStageEvent: each transition is recorded as an event
//
// The `events` table is the store the MCP side already writes (`update_spec_status` records its
// transitions there too). Raw SQL so the application, which has no mirror of that table, can write
// it through the same function.
export async function recordStageEvent(db: StageQueryClient, event: StageEventInput): Promise<void> {
	await db.query(
		`INSERT INTO events (id, projectid, type, source, actor, raw_content, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
		[
			uuidv7(),
			event.projectId,
			event.type,
			event.source.slice(0, 50),
			event.actor.slice(0, 255),
			event.rawContent,
			JSON.stringify(event.metadata),
		],
	);
}
// [SCOPE 123 / T005] END

export interface AdvanceOptions {
	gates: ScopeGateChecker;
	// Who closed the task or signed the test; recorded on the event.
	actor: string;
	// 'app' or 'mcp-server' — which door the trigger came through.
	source: string;
	// What triggered this attempt, e.g. 'task_status' or 'test_signoff'.
	trigger: string;
	// Upper bound on steps per call. The stage list has six entries, so five is every possible move.
	maxSteps?: number;
	// Runs after each committed step, before the next stage is assessed. Each surface uses it to do
	// what entering a stage means there; today that is releasing the scope's human test set on
	// entering HumanTesting (SCOPE-111: testers are asked only then). If it throws, the advance
	// stops at the stage it just entered and reports why, rather than judging that stage's gate
	// on a state the hook failed to produce.
	onStageEntered?: StageEnteredHook;
}

export type StageEnteredHook = (event: {
	projectId: string;
	scopeId: string;
	from: LifecycleStage | null;
	to: LifecycleStage;
}) => Promise<void>;

export interface AdvanceStep {
	from: LifecycleStage;
	to: LifecycleStage;
	specificationPhaseId: string;
}

export interface AdvanceResult {
	scopeId: string;
	found: boolean;
	startStage: LifecycleStage | null;
	endStage: LifecycleStage | null;
	steps: AdvanceStep[];
	// What stopped the advance at endStage. Empty only when the scope was not found.
	blockers: StageBlocker[];
	refused?: { from: LifecycleStage; to: LifecycleStage; reason: string };
}

// [SCOPE 123 / T005] BEGIN — advanceScope: the shared service both doors call
// [SCOPE 123 / T021] MODIFIED-BY — re-ensure the current stage's entry work; re-count tasks under the lock
export async function advanceScope(
	db: StageDb,
	scopeId: string,
	options: AdvanceOptions,
): Promise<AdvanceResult> {
	const scope = await readScopeRecord(db, scopeId);
	if (!scope) {
		return { scopeId, found: false, startStage: null, endStage: null, steps: [], blockers: [] };
	}

	const open = await readOpenStageRow(db, scopeId);
	const startStage = open ? open.phase : LifecycleStage.Design;

	// The work that goes with being in a stage (releasing human tests on HumanTesting) runs again on
	// every advance, not only on the step into the stage, so a failed run is retried by the next
	// trigger. Hooks are idempotent by contract. Untracked scopes have entered nothing yet.
	if (open && options.onStageEntered) {
		try {
			await options.onStageEntered({ projectId: scope.projectId, scopeId, from: null, to: startStage });
		} catch (err) {
			return {
				scopeId,
				found: true,
				startStage,
				endStage: startStage,
				steps: [],
				blockers: [
					{
						kind: 'stage_hook_failed',
						message: `${scopeLabel(scope.specNumber)} is in ${startStage}, but the work that goes with that stage failed again: ${err instanceof Error ? err.message : String(err)}. It is retried on every advance.`,
					},
				],
			};
		}
	}

	const steps: AdvanceStep[] = [];
	const maxSteps = options.maxSteps ?? 5;
	let stage = startStage;
	let blockers: StageBlocker[] = [];

	// Always ends on an assessment, so the result says what holds the scope where it stopped.
	for (let attempt = 0; attempt < maxSteps + 3; attempt++) {
		const assessment = await assessStage(db, scope, stage, options.gates, { full: false });
		if (!assessment.ready || !assessment.next || steps.length >= maxSteps) {
			blockers = assessment.blockers;
			break;
		}
		const from = stage;
		const to = assessment.next;

		// [SCOPE 123 / T006] MODIFIED-BY — the advance asks canTransition before it writes
		const check = canTransition(from, to);
		if (!check.allowed) {
			const reason = check.reason ?? 'not allowed';
			await recordStageEvent(db, {
				projectId: scope.projectId,
				type: 'stage_transition_refused',
				source: options.source,
				actor: options.actor,
				rawContent: `${scopeLabel(scope.specNumber)} stage move ${from} -> ${to} refused: ${reason}`,
				metadata: { specId: scope.id, specNumber: scope.specNumber, from, to, reason, trigger: options.trigger },
			});
			return {
				scopeId,
				found: true,
				startStage,
				endStage: from,
				steps,
				blockers: assessment.blockers,
				refused: { from, to, reason },
			};
		}

		const moved = await db.transaction(async (tx) => {
			await lockScope(tx, scopeId);
			// Re-read under the lock: another door may have moved the scope since the assessment.
			const current = await readScopeStage(tx, scopeId);
			if (current !== from) return { moved: false as const, current };
			// The task counts were read before the lock; a task reopened since must stop the move.
			// (The loop then re-assesses with fresh counts and reports the open task.)
			const recount = await countScopeTasks(tx, scopeId);
			const stillReady =
				from === LifecycleStage.Design
					? recount.taskCount > 0
					: recount.taskCount > 0 && recount.openTaskCount === 0;
			if (!stillReady) return { moved: false as const, current };
			const notes = `Advanced on ${options.trigger}: ${from} exit conditions met.`;
			const { openedRowId } = await writeTransition(tx, { scopeId, from, to, notes });
			await recordStageEvent(tx, {
				projectId: scope.projectId,
				type: 'stage_transition',
				source: options.source,
				actor: options.actor,
				rawContent: `${scopeLabel(scope.specNumber)} moved ${from} -> ${to}`,
				metadata: {
					specId: scope.id,
					specNumber: scope.specNumber,
					from,
					to,
					trigger: options.trigger,
					specificationPhaseId: openedRowId,
				},
			});
			return { moved: true as const, openedRowId };
		});

		if (moved.moved) {
			steps.push({ from, to, specificationPhaseId: moved.openedRowId });
			stage = to;
			// [SCOPE 123 / T015] MODIFIED-BY — the surface's stage-entry work (e.g. release human tests)
			if (options.onStageEntered) {
				try {
					await options.onStageEntered({ projectId: scope.projectId, scopeId, from, to });
				} catch (err) {
					blockers = [
						{
							kind: 'stage_hook_failed',
							message: `${scopeLabel(scope.specNumber)} entered ${to}, but the work that goes with entering it failed: ${err instanceof Error ? err.message : String(err)}. It is retried on every advance.`,
						},
					];
					return { scopeId, found: true, startStage, endStage: stage, steps, blockers };
				}
			}
		} else {
			// Lost a race; continue from wherever the other writer left it.
			stage = moved.current;
		}
	}

	return { scopeId, found: true, startStage, endStage: stage, steps, blockers };
}
// [SCOPE 123 / T005] END

// [SCOPE 123 / T005] BEGIN — advanceScopesForTasks: resolve task ids to scopes, advance each once
//
// The write paths know task ids, not scope ids. One task belongs to at most one scope; several
// tasks in one write can belong to several scopes, each advanced once.
export async function scopeIdsForTasks(
	db: StageQueryClient,
	taskIds: readonly string[],
): Promise<string[]> {
	if (taskIds.length === 0) return [];
	const result = await db.query<{ specid: string }>(
		`SELECT DISTINCT specid FROM projecttasks WHERE id = ANY($1::uuid[]) AND specid IS NOT NULL`,
		[taskIds],
	);
	return result.rows.map((r) => r.specid);
}

export async function scopeIdsForTestItems(
	db: StageQueryClient,
	itemIds: readonly string[],
): Promise<string[]> {
	if (itemIds.length === 0) return [];
	const result = await db.query<{ specid: string }>(
		`SELECT DISTINCT specid FROM testplanitems WHERE id = ANY($1::uuid[]) AND specid IS NOT NULL`,
		[itemIds],
	);
	return result.rows.map((r) => r.specid);
}

export async function advanceScopes(
	db: StageDb,
	scopeIds: readonly string[],
	options: AdvanceOptions,
): Promise<AdvanceResult[]> {
	const results: AdvanceResult[] = [];
	for (const scopeId of Array.from(new Set(scopeIds))) {
		results.push(await advanceScope(db, scopeId, options));
	}
	return results;
}
// [SCOPE 123 / T005] END

// Re-exported so callers catching a refused write need one import.
export { IllegalTransitionError };
