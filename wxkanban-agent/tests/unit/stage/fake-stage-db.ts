// SCOPE-123 test support — an in-memory database that answers exactly the SQL core/stage issues.
//
// Each statement is matched by shape; anything unrecognised throws, so a new query in the module
// fails these tests loudly instead of silently returning nothing.

import type { StageDb, StageQueryClient } from '../../../core/stage/scope-stage';

export interface FakeSpec {
	id: string;
	projectid: string;
	specnumber: string;
	title: string;
	status: string;
	createdat: string;
}

export interface FakeTask {
	id: string;
	specid: string | null;
	status: string;
}

export interface FakePhaseRow {
	id: string;
	specificationid: string;
	phase: string;
	enteredat: string;
	exitedat: string | null;
	approvedby: string | null;
	notes: string | null;
	blockers: string | null;
	createdat: string;
}

export interface FakeEvent {
	projectid: string;
	type: string;
	source: string;
	actor: string;
	raw_content: string;
	metadata: Record<string, unknown>;
}

export interface FakeTestItem {
	id: string;
	specid: string | null;
}

export class FakeStageDb implements StageDb {
	specs: FakeSpec[] = [];
	tasks: FakeTask[] = [];
	phases: FakePhaseRow[] = [];
	events: FakeEvent[] = [];
	testItems: FakeTestItem[] = [];
	// Policy-adapter support: companyprojects ids and projectdocuments.specid values.
	projects: string[] = ['project-1'];
	documents: Array<{ specid: string }> = [];
	// Every statement, in order, for structural assertions.
	statements: string[] = [];
	locks: string[] = [];
	// Runs when the advisory lock is taken: lets a test change state between an advance's
	// assessment and its locked write (the race the lock-time recount exists for).
	onLock?: () => void;
	transactions = 0;
	private clock = Date.UTC(2026, 9, 4, 12, 0, 0);

	private now(): string {
		this.clock += 1000;
		return new Date(this.clock).toISOString();
	}

	addSpec(spec: Partial<FakeSpec> & { id: string; specnumber: string }): FakeSpec {
		const row: FakeSpec = {
			projectid: 'project-1',
			title: `Spec ${spec.specnumber}`,
			status: 'planned',
			createdat: new Date(Date.UTC(2026, 0, 1)).toISOString(),
			...spec,
		};
		this.specs.push(row);
		return row;
	}

	addTasks(specid: string, statuses: string[]): FakeTask[] {
		const rows = statuses.map((status, i) => ({ id: `${specid}-task-${this.tasks.length + i}`, specid, status }));
		this.tasks.push(...rows);
		return rows;
	}

	openRows(specid: string): FakePhaseRow[] {
		return this.phases.filter((p) => p.specificationid === specid && p.exitedat === null);
	}

	async transaction<T>(fn: (tx: StageQueryClient) => Promise<T>): Promise<T> {
		this.transactions += 1;
		const snapshot = JSON.stringify({ phases: this.phases, events: this.events });
		try {
			return await fn({ query: (sql, params) => this.query(sql, params) });
		} catch (err) {
			const restored = JSON.parse(snapshot) as { phases: FakePhaseRow[]; events: FakeEvent[] };
			this.phases = restored.phases;
			this.events = restored.events;
			throw err;
		}
	}

	async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
		const s = sql.replace(/\s+/g, ' ').trim();
		this.statements.push(s);
		const rows = (r: unknown[]): { rows: T[] } => ({ rows: r as T[] });

		if (s.startsWith('SELECT id FROM companyprojects WHERE id = $1')) {
			return rows(this.projects.includes(String(params[0])) ? [{ id: params[0] }] : []);
		}
		if (s.startsWith('SELECT COUNT(*)::text AS c FROM projecttasks WHERE specid = $1')) {
			return rows([{ c: String(this.tasks.filter((t) => t.specid === params[0]).length) }]);
		}
		if (s.startsWith('SELECT COUNT(*)::text AS c FROM projectdocuments WHERE specid = $1')) {
			return rows([{ c: String(this.documents.filter((d) => d.specid === params[0]).length) }]);
		}
		if (/\bprojectphases\b/.test(s)) {
			throw new Error('FakeStageDb: a gate path read projectphases (SCOPE-123 FR-006 forbids it)');
		}

		if (s.startsWith('SELECT pg_advisory_xact_lock')) {
			this.locks.push(String(params[0]));
			this.onLock?.();
			return rows([]);
		}

		if (s.startsWith('SELECT id, phase, enteredat, exitedat, approvedby, notes, blockers FROM specificationphases WHERE specificationid = $1 AND exitedat IS NULL')) {
			return rows(this.openRows(String(params[0])));
		}
		if (s.startsWith('SELECT id, phase, enteredat, exitedat, approvedby, notes, blockers FROM specificationphases WHERE specificationid = $1 ORDER BY')) {
			return rows(
				this.phases
					.filter((p) => p.specificationid === params[0])
					.sort((a, b) => a.enteredat.localeCompare(b.enteredat) || a.createdat.localeCompare(b.createdat)),
			);
		}
		if (s.startsWith('UPDATE specificationphases SET exitedat = clock_timestamp() WHERE id = $1')) {
			const row = this.phases.find((p) => p.id === params[0]);
			if (row) row.exitedat = this.now();
			return rows([]);
		}
		if (s.startsWith('INSERT INTO specificationphases (id, specificationid, phase, enteredat, exitedat, notes) SELECT')) {
			const spec = this.specs.find((x) => x.id === params[3]);
			if (spec) {
				const at = this.now();
				this.phases.push({ id: String(params[0]), specificationid: spec.id, phase: String(params[1]), enteredat: spec.createdat, exitedat: at, approvedby: null, notes: String(params[2]), blockers: null, createdat: at });
			}
			return rows([]);
		}
		if (s.startsWith('INSERT INTO specificationphases (id, specificationid, phase, enteredat, approvedby, notes, blockers) VALUES')) {
			const at = this.now();
			this.phases.push({ id: String(params[0]), specificationid: String(params[1]), phase: String(params[2]), enteredat: at, exitedat: null, approvedby: (params[3] as string | null) ?? null, notes: (params[4] as string | null) ?? null, blockers: (params[5] as string | null) ?? null, createdat: at });
			return rows([]);
		}
		if (s.startsWith('INSERT INTO specificationphases (id, specificationid, phase, enteredat, notes, blockers) VALUES')) {
			const at = this.now();
			this.phases.push({ id: String(params[0]), specificationid: String(params[1]), phase: String(params[2]), enteredat: at, exitedat: null, approvedby: null, notes: (params[3] as string | null) ?? null, blockers: (params[4] as string | null) ?? null, createdat: at });
			return rows([]);
		}

		if (s.startsWith('SELECT id, projectid, specnumber, title, status FROM projectspecifications WHERE id = $1')) {
			return rows(this.specs.filter((x) => x.id === params[0]));
		}
		if (s.startsWith('SELECT id, projectid, specnumber, title, status FROM projectspecifications WHERE projectid = $1 ORDER BY specnumber')) {
			return rows(this.specs.filter((x) => x.projectid === params[0]).sort((a, b) => a.specnumber.localeCompare(b.specnumber)));
		}
		if (s.startsWith('SELECT id, projectid, specnumber, title, status FROM projectspecifications WHERE projectid = $1 AND id = $2')) {
			return rows(this.specs.filter((x) => x.projectid === params[0] && x.id === params[1]));
		}
		if (s.startsWith('SELECT id, projectid, specnumber, title, status FROM projectspecifications WHERE projectid = $1 AND (specnumber = $2')) {
			if (!s.includes('CASE WHEN')) throw new Error('FakeStageDb: numeric spec match must be CASE-guarded');
			const wanted = String(params[1]);
			return rows(
				this.specs.filter(
					(x) =>
						x.projectid === params[0] &&
						(x.specnumber === wanted || (/^\d+$/.test(x.specnumber) && /^\d+$/.test(wanted) && Number(x.specnumber) === Number(wanted))),
				),
			);
		}
		if (s.startsWith('SELECT ps.projectid, ps.id AS specid, ps.specnumber, sp.phase,')) {
			const ids = params[0] as string[];
			const inactive = params[1] as string[];
			const closed = params[2] as string[];
			return rows(
				this.specs
					.filter((x) => ids.includes(x.projectid) && !inactive.includes(x.status))
					.sort((a, b) => a.specnumber.localeCompare(b.specnumber))
					.map((x) => {
						const mine = this.tasks.filter((t) => t.specid === x.id);
						return {
							projectid: x.projectid,
							specid: x.id,
							specnumber: x.specnumber,
							phase: this.openRows(x.id)[0]?.phase ?? null,
							total: mine.length,
							open: mine.filter((t) => !closed.includes(t.status)).length,
						};
					}),
			);
		}
		if (s.startsWith('SELECT COUNT(*)::int AS total')) {
			const closed = params[1] as string[];
			const mine = this.tasks.filter((t) => t.specid === params[0]);
			return rows([{ total: mine.length, open: mine.filter((t) => !closed.includes(t.status)).length }]);
		}
		if (s.startsWith('SELECT DISTINCT specid FROM projecttasks')) {
			const ids = params[0] as string[];
			return rows(Array.from(new Set(this.tasks.filter((t) => ids.includes(t.id) && t.specid).map((t) => t.specid))).map((specid) => ({ specid })));
		}
		if (s.startsWith('SELECT DISTINCT specid FROM testplanitems')) {
			const ids = params[0] as string[];
			return rows(Array.from(new Set(this.testItems.filter((t) => ids.includes(t.id) && t.specid).map((t) => t.specid))).map((specid) => ({ specid })));
		}

		if (s.startsWith('INSERT INTO events')) {
			this.events.push({
				projectid: String(params[1]),
				type: String(params[2]),
				source: String(params[3]),
				actor: String(params[4]),
				raw_content: String(params[5]),
				metadata: JSON.parse(String(params[6])) as Record<string, unknown>,
			});
			return rows([]);
		}

		throw new Error(`FakeStageDb: unrecognised statement: ${s.slice(0, 120)}`);
	}
}
