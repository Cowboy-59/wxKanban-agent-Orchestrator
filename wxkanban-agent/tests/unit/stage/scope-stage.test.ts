// SCOPE-123 — per-scope stage progression: store, advance, rollup, backfill.
//
// The defining assertion of this scope is INDEPENDENCE: two scopes in one project, at different
// stages, each moving on its own evidence. Most tests below are variations on it.

import { describe, it, expect } from 'vitest';
import { LifecycleStage } from '../../../core/schemas/lifecycle';
import {
	advanceScope,
	applyBackfill,
	assessScope,
	evaluateStageExit,
	findScopeByRef,
	IllegalTransitionError,
	parseStage,
	planBackfill,
	readScopeStage,
	readStageHistory,
	readProjectScopeStages,
	resolveProjectRollupStage,
	resolveRollupStages,
	scopeIdsForTasks,
	scopeRefFromArgs,
	ScopeGateChecker,
	ScopeGateVerdict,
	ScopeStageIntegrityError,
	UnknownStageValueError,
	writeTransition,
} from '../../../core/stage/scope-stage';
import { FakeStageDb } from './fake-stage-db';

type Req = 'ai' | 'user' | 'all';

function verdict(partial: Partial<ScopeGateVerdict> = {}): ScopeGateVerdict {
	return { passed: true, skipped: false, itemCount: 1, blocking: [], ...partial };
}

function gates(table: Partial<Record<Req, ScopeGateVerdict | Error>>, calls: Req[] = []): ScopeGateChecker {
	return async ({ requirement }) => {
		calls.push(requirement);
		const v = table[requirement] ?? verdict();
		if (v instanceof Error) throw v;
		return v;
	};
}

const allClear = gates({});
const opts = (g: ScopeGateChecker = allClear) => ({ gates: g, actor: 'tester', source: 'test', trigger: 'task_status' });

describe('SCOPE-123 FR-009 — one stage vocabulary, rejected not coerced', () => {
	it('accepts every LifecycleStage value', () => {
		for (const stage of Object.values(LifecycleStage)) {
			expect(parseStage(stage, 'test')).toBe(stage);
		}
	});

	it('rejects the uppercase set from the old schema comment instead of mapping it', () => {
		for (const bad of ['DESIGN', 'IMPLEMENTATION', 'HUMAN_TESTING', 'qa', 'design', '', null, 7]) {
			expect(() => parseStage(bad, 'test')).toThrow(UnknownStageValueError);
		}
	});

	it('refuses to read a scope whose open row holds an unrecognised value', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		db.phases.push({ id: 'p1', specificationid: 's1', phase: 'IMPLEMENTATION', enteredat: '2026-01-01', exitedat: null, approvedby: null, notes: null, blockers: null, createdat: '2026-01-01' });
		await expect(readScopeStage(db, 's1')).rejects.toThrow(UnknownStageValueError);
	});
});

describe('SCOPE-123 FR-002 — specificationphases invariants', () => {
	it('a scope with no open row reads as Design', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		expect(await readScopeStage(db, 's1')).toBe(LifecycleStage.Design);
	});

	it('a full six-stage traversal never leaves two open rows, and history reconstructs the path', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		const order = [
			LifecycleStage.Design,
			LifecycleStage.Implementation,
			LifecycleStage.QATesting,
			LifecycleStage.HumanTesting,
			LifecycleStage.Beta,
			LifecycleStage.Release,
		];
		for (let i = 0; i < order.length - 1; i++) {
			await db.transaction((tx) => writeTransition(tx, { scopeId: 's1', from: order[i]!, to: order[i + 1]! }));
			expect(db.openRows('s1')).toHaveLength(1);
			expect(db.openRows('s1')[0]!.phase).toBe(order[i + 1]);
		}
		const history = await readStageHistory(db, 's1');
		expect(history.map((h) => h.phase)).toEqual(order);
		expect(history.filter((h) => h.exitedAt === null)).toHaveLength(1);
	});

	it('refuses to read a scope holding two open rows', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		for (const id of ['a', 'b']) {
			db.phases.push({ id, specificationid: 's1', phase: 'QA', enteredat: '2026-01-01', exitedat: null, approvedby: null, notes: null, blockers: null, createdat: '2026-01-01' });
		}
		await expect(readScopeStage(db, 's1')).rejects.toThrow(ScopeStageIntegrityError);
	});
});

describe('SCOPE-123 FR-003 / T006 — canTransition governs every write at runtime', () => {
	it('refuses a skip and writes nothing', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		await expect(
			db.transaction((tx) => writeTransition(tx, { scopeId: 's1', from: LifecycleStage.Design, to: LifecycleStage.QATesting })),
		).rejects.toThrow(IllegalTransitionError);
		expect(db.phases).toHaveLength(0);
	});

	it('refuses a backward move and writes nothing', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		await db.transaction((tx) => writeTransition(tx, { scopeId: 's1', from: LifecycleStage.Design, to: LifecycleStage.Implementation }));
		const before = db.phases.length;
		await expect(
			db.transaction((tx) => writeTransition(tx, { scopeId: 's1', from: LifecycleStage.Implementation, to: LifecycleStage.Design })),
		).rejects.toThrow(/backward/);
		expect(db.phases).toHaveLength(before);
	});

	it('refuses a move from a stage the scope is not in', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		await expect(
			db.transaction((tx) => writeTransition(tx, { scopeId: 's1', from: LifecycleStage.Implementation, to: LifecycleStage.QATesting })),
		).rejects.toThrow(/moved to Design/);
	});
});

describe('SCOPE-123 FR-011 — a scope leaves Design when its tasks exist', () => {
	it('a scope with no tasks stays in Design', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		const result = await advanceScope(db, 's1', opts());
		expect(result.steps).toHaveLength(0);
		expect(result.endStage).toBe(LifecycleStage.Design);
		expect(result.blockers[0]!.kind).toBe('no_tasks');
		expect(db.phases).toHaveLength(0);
	});

	it('createSpecs generating tasks moves the scope to Implementation, and no further while tasks are open', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		db.addTasks('s1', ['todo', 'todo', 'todo']);
		const result = await advanceScope(db, 's1', opts());
		expect(result.steps.map((s) => s.to)).toEqual([LifecycleStage.Implementation]);
		expect(result.blockers[0]).toMatchObject({ kind: 'open_tasks', count: 3 });
		expect(await readScopeStage(db, 's1')).toBe(LifecycleStage.Implementation);
	});
});

describe('SCOPE-123 FR-003 — closing the last task advances that scope, and only that scope', () => {
	function project(): FakeStageDb {
		const db = new FakeStageDb();
		db.addSpec({ id: 'a', specnumber: '101' });
		db.addSpec({ id: 'b', specnumber: '102' });
		return db;
	}

	it('closing a task that is not the last advances nothing', async () => {
		const db = project();
		const [t1] = db.addTasks('a', ['todo', 'todo']);
		await advanceScope(db, 'a', opts());
		t1!.status = 'done';
		const result = await advanceScope(db, 'a', opts());
		expect(result.steps).toHaveLength(0);
		expect(result.endStage).toBe(LifecycleStage.Implementation);
		expect(result.blockers[0]).toMatchObject({ kind: 'open_tasks', count: 1 });
	});

	it('closing the last task advances the scope and records each step as an event', async () => {
		const db = project();
		const tasks = db.addTasks('a', ['todo', 'todo']);
		await advanceScope(db, 'a', opts());
		for (const t of tasks) t.status = 'done';
		const result = await advanceScope(db, 'a', opts(gates({ ai: verdict({ passed: false, blocking: [{ itemKey: 'T-1', title: 'x', why: 'unsigned' }] }) })));
		expect(result.steps.map((s) => `${s.from}->${s.to}`)).toEqual(['Implementation->QA']);
		const transitions = db.events.filter((e) => e.type === 'stage_transition');
		expect(transitions.map((e) => `${e.metadata['from']}->${e.metadata['to']}`)).toEqual(['Design->Implementation', 'Implementation->QA']);
	});

	it('sibling scopes are unchanged, verified by re-reading each sibling open row', async () => {
		const db = project();
		db.addTasks('b', ['todo']);
		await advanceScope(db, 'b', opts());
		const siblingBefore = JSON.stringify(db.openRows('b'));
		const tasks = db.addTasks('a', ['todo']);
		await advanceScope(db, 'a', opts());
		tasks[0]!.status = 'completed';
		await advanceScope(db, 'a', opts());
		expect(JSON.stringify(db.openRows('b'))).toBe(siblingBefore);
		expect(db.openRows('b')[0]!.phase).toBe(LifecycleStage.Implementation);
		expect(await readScopeStage(db, 'a')).not.toBe(LifecycleStage.Implementation);
	});

	it('done, completed and orphaned all count as closed; blocked counts as open', async () => {
		const db = project();
		db.addTasks('a', ['done', 'completed', 'orphaned', 'blocked']);
		const result = await advanceScope(db, 'a', opts());
		expect(result.endStage).toBe(LifecycleStage.Implementation);
		expect(result.blockers[0]).toMatchObject({ kind: 'open_tasks', count: 1 });
	});
});

describe('SCOPE-123 FR-010 / FR-012 — the advance respects the test gates and keeps going while clear', () => {
	function implementedScope(): FakeStageDb {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		db.addTasks('s1', ['done', 'done']);
		return db;
	}

	it('stops in QA when the scope has no machine tests, and says to run /wxCreateTestPlan', async () => {
		const db = implementedScope();
		const result = await advanceScope(db, 's1', opts(gates({ ai: verdict({ itemCount: 0 }) })));
		expect(result.endStage).toBe(LifecycleStage.QATesting);
		expect(result.blockers[0]!.kind).toBe('no_machine_tests');
		expect(result.blockers[0]!.message).toContain('/wxCreateTestPlan');
	});

	it('does not leave QA while a forced machine test is failing, and does once it is signed', async () => {
		const db = implementedScope();
		const failing = gates({ ai: verdict({ passed: false, blocking: [{ itemKey: 'MT-7', title: 'login', why: 'failing' }] }), user: verdict({ passed: false, blocking: [{ itemKey: 'HT-1', title: 'ux', why: 'unsigned' }] }) });
		const first = await advanceScope(db, 's1', opts(failing));
		expect(first.endStage).toBe(LifecycleStage.QATesting);
		expect(first.blockers[0]).toMatchObject({ kind: 'gate', requirement: 'ai' });
		expect(first.blockers[0]!.message).toContain('MT-7 (failing)');

		const signed = gates({ user: verdict({ passed: false, blocking: [{ itemKey: 'HT-1', title: 'ux', why: 'unsigned' }] }) });
		const second = await advanceScope(db, 's1', { ...opts(signed), trigger: 'test_signoff' });
		expect(second.steps.map((s) => s.to)).toEqual([LifecycleStage.HumanTesting]);
		expect(second.blockers[0]).toMatchObject({ kind: 'gate', requirement: 'user' });
	});

	it('leaving HumanTesting waits for every released human test sign-off', async () => {
		const db = implementedScope();
		const pending = gates({ user: verdict({ passed: false, blocking: [{ itemKey: 'HT-2', title: 'flow', why: 'unsigned' }] }) });
		const r1 = await advanceScope(db, 's1', opts(pending));
		expect(r1.endStage).toBe(LifecycleStage.HumanTesting);
		const r2 = await advanceScope(db, 's1', opts(gates({ all: verdict({ passed: false, blocking: [{ itemKey: 'MT-9', title: 'r', why: 'retest-outstanding' }] }) })));
		expect(r2.steps.map((s) => s.to)).toEqual([LifecycleStage.Beta]);
		expect(r2.blockers[0]).toMatchObject({ kind: 'gate', requirement: 'all' });
	});

	it('with every gate clear the scope advances step by step to Release, one row and one event per step', async () => {
		const db = implementedScope();
		const result = await advanceScope(db, 's1', opts());
		expect(result.steps.map((s) => s.to)).toEqual([
			LifecycleStage.Implementation,
			LifecycleStage.QATesting,
			LifecycleStage.HumanTesting,
			LifecycleStage.Beta,
			LifecycleStage.Release,
		]);
		expect(result.blockers[0]!.kind).toBe('final_stage');
		expect(db.events.filter((e) => e.type === 'stage_transition')).toHaveLength(5);
		expect(db.phases.filter((p) => p.specificationid === 's1')).toHaveLength(6);
	});

	it('a project with testing switched off moves its scopes on tasks alone', async () => {
		const db = implementedScope();
		const skipped = verdict({ skipped: true, passed: true, itemCount: 0 });
		const result = await advanceScope(db, 's1', opts(gates({ ai: skipped, user: skipped, all: skipped })));
		expect(result.endStage).toBe(LifecycleStage.Release);
	});

	it('a gate that cannot be evaluated stops the advance instead of failing open', async () => {
		const db = implementedScope();
		const result = await advanceScope(db, 's1', opts(gates({ ai: new Error('db down') })));
		expect(result.endStage).toBe(LifecycleStage.QATesting);
		expect(result.blockers[0]).toMatchObject({ kind: 'gate_unavailable', requirement: 'ai' });
	});

	it('judges an untracked scope on its inferred stage and writes nothing (Amendment C, decision 9)', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		db.addTasks('s1', ['done', 'done']);
		const report = await assessScope(db, 's1', gates({ ai: verdict({ itemCount: 0 }) }), { full: true });
		expect(report!.tracked).toBe(false);
		expect(report!.stage).toBe(LifecycleStage.QATesting);
		expect(report!.blockers[0]!.kind).toBe('no_machine_tests');
		expect(report!.inferredEvidence!.join(' ')).toContain('left Implementation');
		expect(db.phases).toHaveLength(0);
	});

	it('the gate is not queried while tasks are open (the advance), but is for a full report', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		db.addTasks('s1', ['done']);
		await advanceScope(db, 's1', opts(gates({ ai: verdict({ itemCount: 0 }) })));
		db.addTasks('s1', ['todo']);
		const calls: Req[] = [];
		await advanceScope(db, 's1', opts(gates({}, calls)));
		expect(calls).toEqual([]);
		const report = await assessScope(db, 's1', gates({ ai: verdict({ itemCount: 0 }) }, calls), { full: true });
		expect(calls).toEqual(['ai']);
		expect(report!.blockers.map((b) => b.kind)).toEqual(['open_tasks', 'no_machine_tests']);
	});

	it('runs the stage-entry hook once per step, with the stage just entered', async () => {
		const db = implementedScope();
		const entered: string[] = [];
		await advanceScope(db, 's1', { ...opts(), onStageEntered: async ({ from, to }) => { entered.push(`${from}->${to}`); } });
		expect(entered).toEqual([
			'Design->Implementation',
			'Implementation->QA',
			'QA->HumanTesting',
			'HumanTesting->Beta',
			'Beta->Release',
		]);
	});

	it('a failing stage-entry hook stops the advance at the stage it just entered', async () => {
		const db = implementedScope();
		const result = await advanceScope(db, 's1', {
			...opts(),
			onStageEntered: async ({ to }) => {
				if (to === LifecycleStage.HumanTesting) throw new Error('release failed');
			},
		});
		expect(result.endStage).toBe(LifecycleStage.HumanTesting);
		expect(result.blockers[0]).toMatchObject({ kind: 'stage_hook_failed' });
		expect(result.blockers[0]!.message).toContain('release failed');
		expect(await readScopeStage(db, 's1')).toBe(LifecycleStage.HumanTesting);
	});

	it('re-runs the current stage entry work on the next advance, so a failed release is retried (review fix)', async () => {
		const db = implementedScope();
		let fail = true;
		const calls: string[] = [];
		const hook = async ({ from, to }: { from: LifecycleStage | null; to: LifecycleStage }) => {
			calls.push(`${from}->${to}`);
			if (to === LifecycleStage.HumanTesting && fail) throw new Error('release failed');
		};
		const pending = gates({ user: verdict({ passed: false, blocking: [{ itemKey: 'HT-1', title: 'x', why: 'unsigned' }] }) });
		const first = await advanceScope(db, 's1', { ...opts(pending), onStageEntered: hook });
		expect(first.blockers[0]!.kind).toBe('stage_hook_failed');
		fail = false;
		const second = await advanceScope(db, 's1', { ...opts(pending), onStageEntered: hook });
		expect(calls[calls.length - 1]).toBe('null->HumanTesting');
		expect(second.blockers[0]).toMatchObject({ kind: 'gate', requirement: 'user' });
		expect(second.endStage).toBe(LifecycleStage.HumanTesting);
	});

	it('a task reopened between the assessment and the locked write stops the move (review fix)', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101' });
		const [t1] = db.addTasks('s1', ['todo']);
		await advanceScope(db, 's1', opts());
		t1!.status = 'done';
		db.onLock = () => {
			t1!.status = 'in_progress';
			db.onLock = undefined;
		};
		const result = await advanceScope(db, 's1', opts());
		expect(result.steps).toHaveLength(0);
		expect(result.endStage).toBe(LifecycleStage.Implementation);
		expect(result.blockers[0]).toMatchObject({ kind: 'open_tasks', count: 1 });
		expect(db.openRows('s1')[0]!.phase).toBe(LifecycleStage.Implementation);
	});

	it('an archived scope never advances', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's1', specnumber: '101', status: 'archived' });
		db.addTasks('s1', ['done']);
		const result = await advanceScope(db, 's1', opts());
		expect(result.steps).toHaveLength(0);
		expect(result.blockers[0]!.kind).toBe('scope_inactive');
	});
});

describe('SCOPE-123 FR-012 — evaluateStageExit table', () => {
	it.each([
		[LifecycleStage.Design, 0, 0, false],
		[LifecycleStage.Design, 3, 3, true],
		[LifecycleStage.Implementation, 3, 1, false],
		[LifecycleStage.Implementation, 3, 0, true],
		[LifecycleStage.Implementation, 0, 0, false],
	])('%s with %i tasks / %i open -> ready %s', (stage, taskCount, openTaskCount, ready) => {
		expect(evaluateStageExit({ stage, taskCount, openTaskCount }).ready).toBe(ready);
	});

	it('Release never leaves', () => {
		expect(evaluateStageExit({ stage: LifecycleStage.Release, taskCount: 1, openTaskCount: 0 }).ready).toBe(false);
	});
});

describe('SCOPE-123 FR-006 — the project stage is the lowest active scope stage', () => {
	it('reads as far along as its least advanced active scope', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 'a', specnumber: '101' });
		db.addSpec({ id: 'b', specnumber: '102' });
		db.addSpec({ id: 'c', specnumber: '103', status: 'archived' });
		db.addTasks('a', ['done']);
		db.addTasks('b', ['todo']);
		await advanceScope(db, 'a', opts());
		await advanceScope(db, 'b', opts());
		expect(await resolveProjectRollupStage(db, 'project-1')).toBe(LifecycleStage.Implementation);
	});

	it('a project with no active scopes reads as Design', async () => {
		const db = new FakeStageDb();
		expect(await resolveProjectRollupStage(db, 'project-1')).toBe(LifecycleStage.Design);
	});

	it('untracked scopes count at their task-count lower bound, flagged untracked (Amendment C)', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 'none', specnumber: '101' });
		db.addSpec({ id: 'open', specnumber: '102' });
		db.addSpec({ id: 'closed', specnumber: '103' });
		db.addTasks('open', ['todo', 'done']);
		db.addTasks('closed', ['done']);
		const rows = await readProjectScopeStages(db, 'project-1');
		expect(rows.map((r) => [r.scopeId, r.stage, r.tracked])).toEqual([
			['none', LifecycleStage.Design, false],
			['open', LifecycleStage.Implementation, false],
			['closed', LifecycleStage.QATesting, false],
		]);
		await advanceScope(db, 'open', opts());
		expect((await readProjectScopeStages(db, 'project-1')).find((r) => r.scopeId === 'open')!.tracked).toBe(true);
	});

	it('the batched rollup agrees with the single-project rollup, for every project asked about', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 'a', specnumber: '101' });
		db.addSpec({ id: 'b', specnumber: '102' });
		db.addSpec({ id: 'x', specnumber: '201', projectid: 'project-2' });
		db.addTasks('a', ['done']);
		db.addTasks('b', ['todo']);
		db.addTasks('x', ['done']);
		for (const id of ['a', 'b', 'x']) await advanceScope(db, id, opts());
		const rollups = await resolveRollupStages(db, ['project-1', 'project-2', 'project-empty']);
		expect(rollups.get('project-1')).toBe(await resolveProjectRollupStage(db, 'project-1'));
		expect(rollups.get('project-2')).toBe(LifecycleStage.Release);
		expect(rollups.get('project-empty')).toBe(LifecycleStage.Design);
	});
});

describe('SCOPE-123 FR-007 — conservative, idempotent backfill', () => {
	function affected(): FakeStageDb {
		const db = new FakeStageDb();
		db.addSpec({ id: 'unstarted', specnumber: '101', status: 'draft' });
		db.addSpec({ id: 'building', specnumber: '102', status: 'implementing' });
		db.addSpec({ id: 'built', specnumber: '103', status: 'released' });
		db.addSpec({ id: 'gone', specnumber: '104', status: 'archived' });
		db.addTasks('building', ['done', 'todo']);
		db.addTasks('built', ['done', 'done']);
		return db;
	}

	it('a scope whose work has not started derives as Design', async () => {
		const plan = await planBackfill(affected(), 'project-1', allClear);
		expect(plan.find((p) => p.scopeId === 'unstarted')).toMatchObject({ action: 'write', stage: LifecycleStage.Design });
	});

	it('infers from evidence, not from the hand-set status: no machine tests stops a "released" scope in QA', async () => {
		const plan = await planBackfill(affected(), 'project-1', gates({ ai: verdict({ itemCount: 0 }) }));
		expect(plan.find((p) => p.scopeId === 'building')).toMatchObject({ stage: LifecycleStage.Implementation });
		const built = plan.find((p) => p.scopeId === 'built')!;
		expect(built.stage).toBe(LifecycleStage.QATesting);
		expect(built.stoppedBy[0]!.kind).toBe('no_machine_tests');
		expect(built.evidence.join(' ')).toContain("status 'released' (recorded, not used to promote)");
		expect(plan.find((p) => p.scopeId === 'gone')!.action).toBe('skip-inactive');
	});

	it('an unreadable gate resolves to the earlier stage, with the reason recorded', async () => {
		const plan = await planBackfill(affected(), 'project-1', gates({ ai: new Error('timeout') }));
		const built = plan.find((p) => p.scopeId === 'built')!;
		expect(built.stage).toBe(LifecycleStage.QATesting);
		expect(built.stoppedBy[0]!.kind).toBe('gate_unavailable');
	});

	it('the dry run writes nothing; apply writes one open row per scope; a second run changes nothing', async () => {
		const db = affected();
		const plan = await planBackfill(db, 'project-1', allClear);
		expect(db.phases).toHaveLength(0);

		await applyBackfill(db, 'project-1', plan, { actor: 'tester', source: 'test' });
		expect(db.openRows('unstarted')).toHaveLength(1);
		expect(db.openRows('building')).toHaveLength(1);
		expect(db.openRows('built')).toHaveLength(1);
		expect(db.openRows('gone')).toHaveLength(0);
		expect(db.openRows('built')[0]!.notes).toContain('Backfilled by SCOPE-123 FR-007');
		const snapshot = JSON.stringify(db.phases);

		const second = await planBackfill(db, 'project-1', allClear);
		expect(second.filter((p) => p.action === 'write')).toHaveLength(0);
		const results = await applyBackfill(db, 'project-1', second, { actor: 'tester', source: 'test' });
		expect(results.every((r) => r.outcome !== 'written')).toBe(true);
		expect(JSON.stringify(db.phases)).toBe(snapshot);
	});

	it('apply runs the stage-entry hook for each written scope, and reports a hook failure without unwinding', async () => {
		const db = affected();
		const plan = await planBackfill(db, 'project-1', gates({ ai: verdict({ passed: true, itemCount: 1 }), user: verdict({ passed: false, blocking: [{ itemKey: 'HT-1', title: 'x', why: 'unsigned' }] }) }));
		expect(plan.find((p) => p.scopeId === 'built')!.stage).toBe(LifecycleStage.HumanTesting);
		const entered: string[] = [];
		const results = await applyBackfill(db, 'project-1', plan, {
			actor: 't',
			source: 'test',
			onStageEntered: async ({ scopeId, from, to }) => {
				entered.push(`${scopeId}:${from}->${to}`);
				if (to === LifecycleStage.HumanTesting) throw new Error('release failed');
			},
		});
		expect(entered.sort()).toEqual(['building:null->Implementation', 'built:null->HumanTesting', 'unstarted:null->Design']);
		const built = results.find((r) => r.scopeId === 'built')!;
		expect(built.outcome).toBe('written');
		expect(built.hookError).toBe('release failed');
		expect(db.openRows('built')[0]!.phase).toBe(LifecycleStage.HumanTesting);
	});

	it('apply skips a scope that gained an open row after the plan was made', async () => {
		const db = affected();
		const plan = await planBackfill(db, 'project-1', allClear);
		await advanceScope(db, 'building', opts());
		const before = db.openRows('building')[0]!.id;
		const results = await applyBackfill(db, 'project-1', plan, { actor: 'tester', source: 'test' });
		expect(results.find((r) => r.scopeId === 'building')!.outcome).toBe('skipped-tracked');
		expect(db.openRows('building')).toHaveLength(1);
		expect(db.openRows('building')[0]!.id).toBe(before);
	});
});

describe('SCOPE-123 FR-001 — finding the scope a command names', () => {
	it('matches spec numbers numerically as well as textually', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 's17', specnumber: '017' });
		expect((await findScopeByRef(db, 'project-1', { specNumber: '17' }))!.id).toBe('s17');
		expect((await findScopeByRef(db, 'project-1', { specNumber: '0017' }))!.id).toBe('s17');
		expect(await findScopeByRef(db, 'project-2', { specNumber: '017' })).toBeNull();
		expect((await findScopeByRef(db, 'project-1', { specId: 's17' }))!.specNumber).toBe('017');
	});

	it('reads the scope from tool arguments', () => {
		expect(scopeRefFromArgs({ specNumber: '123' })).toEqual({ specId: undefined, specNumber: '123' });
		expect(scopeRefFromArgs({ specId: 'abc' })).toEqual({ specId: 'abc', specNumber: undefined });
		expect(scopeRefFromArgs({ projectId: 'p' })).toBeNull();
		expect(scopeRefFromArgs(undefined)).toBeNull();
	});

	it('maps task ids to their scopes', async () => {
		const db = new FakeStageDb();
		db.addSpec({ id: 'a', specnumber: '101' });
		db.addSpec({ id: 'b', specnumber: '102' });
		const ta = db.addTasks('a', ['todo', 'todo']);
		const tb = db.addTasks('b', ['todo']);
		const ids = await scopeIdsForTasks(db, [ta[0]!.id, ta[1]!.id, tb[0]!.id]);
		expect(ids.sort()).toEqual(['a', 'b']);
	});
});
