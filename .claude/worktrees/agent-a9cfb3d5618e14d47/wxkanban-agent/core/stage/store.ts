// SCOPE-123 FR-002 — `specificationphases` as the per-scope system of record.
//
// A scope's current stage is its single OPEN row (exitedat IS NULL). A scope with no open row has
// never been progressed and reads as Design. Entering a stage closes the open row and opens the
// next one inside one transaction, under a per-scope advisory lock, so two writers racing (two
// tasks closing at once, through two different doors) cannot leave two open rows.
//
// There is deliberately no unique index enforcing "one open row per scope": adding one is DDL, and
// this scope carries none (production has no migration ledger). The lock is the guard.
//
// Written against a minimal query interface so the application and the MCP server, which each own
// their own pg pool, can run the same code. No pg import: the kit ships no database dependency.

import { randomBytes } from 'crypto';
import { LifecycleStage } from '../schemas/lifecycle';
import { canTransition } from '../orchestrator/transitions';
import { parseStage } from './vocabulary';

export interface StageQueryClient {
	query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface StageDb extends StageQueryClient {
	transaction<T>(fn: (tx: StageQueryClient) => Promise<T>): Promise<T>;
}

export interface StagePhaseRow {
	id: string;
	phase: LifecycleStage;
	enteredAt: string;
	exitedAt: string | null;
	approvedBy: string | null;
	notes: string | null;
	blockers: string | null;
}

interface RawPhaseRow {
	id: string;
	phase: string;
	enteredat: string | Date;
	exitedat: string | Date | null;
	approvedby: string | null;
	notes: string | null;
	blockers: string | null;
}

// [SCOPE 123 / T003] BEGIN — errors raised by the stage store
export class ScopeStageIntegrityError extends Error {
	constructor(public readonly scopeId: string, public readonly openRows: number) {
		super(
			`Scope ${scopeId} has ${openRows} open specificationphases rows; exactly one is allowed. ` +
				`Refusing to read or move its stage until the extra rows are closed.`,
		);
		this.name = 'ScopeStageIntegrityError';
	}
}

export class StaleStageError extends Error {
	constructor(
		public readonly scopeId: string,
		public readonly expected: LifecycleStage,
		public readonly actual: LifecycleStage,
	) {
		super(`Scope ${scopeId} moved to ${actual} while a move from ${expected} was being written.`);
		this.name = 'StaleStageError';
	}
}
// [SCOPE 123 / T003] END

// [SCOPE 123 / T006] BEGIN — IllegalTransitionError: canTransition refused the move
export class IllegalTransitionError extends Error {
	constructor(
		public readonly from: LifecycleStage,
		public readonly to: LifecycleStage,
		public readonly reason: string,
	) {
		super(`Stage move ${from} -> ${to} refused: ${reason}`);
		this.name = 'IllegalTransitionError';
	}
}
// [SCOPE 123 / T006] END

// [SCOPE 123 / T003] BEGIN — uuidv7: time-ordered primary keys without a dependency
export function uuidv7(now: number = Date.now()): string {
	const bytes = randomBytes(16);
	const ms = BigInt(now);
	for (let i = 0; i < 6; i++) {
		bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & BigInt(0xff));
	}
	bytes[6] = (bytes[6]! & 0x0f) | 0x70;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
// [SCOPE 123 / T003] END

// [SCOPE 123 / T003] BEGIN — reading a scope's stage rows
function toIso(value: string | Date | null): string | null {
	if (value === null) return null;
	return value instanceof Date ? value.toISOString() : String(value);
}

function toPhaseRow(raw: RawPhaseRow, where: string): StagePhaseRow {
	return {
		id: raw.id,
		phase: parseStage(raw.phase, where),
		enteredAt: toIso(raw.enteredat) ?? '',
		exitedAt: toIso(raw.exitedat),
		approvedBy: raw.approvedby,
		notes: raw.notes,
		blockers: raw.blockers,
	};
}

export async function readOpenStageRow(
	db: StageQueryClient,
	scopeId: string,
): Promise<StagePhaseRow | null> {
	const result = await db.query<RawPhaseRow>(
		`SELECT id, phase, enteredat, exitedat, approvedby, notes, blockers
		   FROM specificationphases
		  WHERE specificationid = $1
		    AND exitedat IS NULL`,
		[scopeId],
	);
	if (result.rows.length > 1) {
		throw new ScopeStageIntegrityError(scopeId, result.rows.length);
	}
	const row = result.rows[0];
	return row ? toPhaseRow(row, `specificationphases(open row of ${scopeId}).phase`) : null;
}

// A scope with no open row has never been progressed and reads as Design (FR-002).
export async function readScopeStage(
	db: StageQueryClient,
	scopeId: string,
): Promise<LifecycleStage> {
	const open = await readOpenStageRow(db, scopeId);
	return open ? open.phase : LifecycleStage.Design;
}

export async function readStageHistory(
	db: StageQueryClient,
	scopeId: string,
): Promise<StagePhaseRow[]> {
	const result = await db.query<RawPhaseRow>(
		`SELECT id, phase, enteredat, exitedat, approvedby, notes, blockers
		   FROM specificationphases
		  WHERE specificationid = $1
		  ORDER BY enteredat ASC, createdat ASC`,
		[scopeId],
	);
	return result.rows.map((row) => toPhaseRow(row, `specificationphases(${scopeId}).phase`));
}
// [SCOPE 123 / T003] END

// [SCOPE 123 / T003] BEGIN — lockScope: serialise every stage write for one scope
//
// Transaction-scoped, so it is released by COMMIT or ROLLBACK and can never leak.
export async function lockScope(tx: StageQueryClient, scopeId: string): Promise<void> {
	await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 123))`, [scopeId]);
}
// [SCOPE 123 / T003] END

export interface TransitionWrite {
	scopeId: string;
	from: LifecycleStage;
	to: LifecycleStage;
	notes?: string | null;
	blockers?: string | null;
	approvedBy?: string | null;
}

// [SCOPE 123 / T003] BEGIN — writeTransition: close the open row, open the next, atomically
//
// Must be called inside a transaction that already holds lockScope(scopeId). Every move is checked
// by canTransition first (T006): a move it rejects throws and writes nothing.
export async function writeTransition(
	tx: StageQueryClient,
	write: TransitionWrite,
): Promise<{ openedRowId: string }> {
	// [SCOPE 123 / T006] MODIFIED-BY — canTransition governs every write; this is its runtime caller
	const verdict = canTransition(write.from, write.to);
	if (!verdict.allowed) {
		throw new IllegalTransitionError(write.from, write.to, verdict.reason ?? 'not allowed');
	}
	const to = parseStage(write.to, 'writeTransition.to');

	const open = await readOpenStageRow(tx, write.scopeId);
	if (open) {
		if (open.phase !== write.from) {
			throw new StaleStageError(write.scopeId, write.from, open.phase);
		}
		await tx.query(`UPDATE specificationphases SET exitedat = clock_timestamp() WHERE id = $1`, [open.id]);
	} else {
		if (write.from !== LifecycleStage.Design) {
			throw new StaleStageError(write.scopeId, write.from, LifecycleStage.Design);
		}
		// The scope sat in Design implicitly (no row). Record that stage as closed history, entered
		// when the scope was created, so readStageHistory reconstructs the whole path.
		await tx.query(
			`INSERT INTO specificationphases (id, specificationid, phase, enteredat, exitedat, notes)
			 SELECT $1, ps.id, $2, ps.createdat, clock_timestamp(), $3
			   FROM projectspecifications ps
			  WHERE ps.id = $4`,
			[
				uuidv7(),
				LifecycleStage.Design,
				'Design held implicitly: no stage row existed before this scope first advanced.',
				write.scopeId,
			],
		);
	}

	const openedRowId = uuidv7();
	await tx.query(
		`INSERT INTO specificationphases (id, specificationid, phase, enteredat, approvedby, notes, blockers)
		 VALUES ($1, $2, $3, clock_timestamp(), $4, $5, $6)`,
		[
			openedRowId,
			write.scopeId,
			to,
			write.approvedBy ?? null,
			write.notes ?? null,
			write.blockers ?? null,
		],
	);
	return { openedRowId };
}
// [SCOPE 123 / T003] END

// [SCOPE 123 / T011] BEGIN — openInitialStage: the backfill's one write, skipped when tracked
//
// Not a transition: the scope has no tracked stage yet, so there is no `from` for canTransition to
// judge. Refuses (returns 'skipped') when the scope already has an open row, which is what makes
// the backfill idempotent.
export async function openInitialStage(
	tx: StageQueryClient,
	input: { scopeId: string; stage: LifecycleStage; notes: string; blockers: string | null },
): Promise<{ status: 'written'; openedRowId: string } | { status: 'skipped' }> {
	const stage = parseStage(input.stage, 'openInitialStage.stage');
	const open = await readOpenStageRow(tx, input.scopeId);
	if (open) return { status: 'skipped' };
	const openedRowId = uuidv7();
	await tx.query(
		`INSERT INTO specificationphases (id, specificationid, phase, enteredat, notes, blockers)
		 VALUES ($1, $2, $3, clock_timestamp(), $4, $5)`,
		[openedRowId, input.scopeId, stage, input.notes, input.blockers],
	);
	return { status: 'written', openedRowId };
}
// [SCOPE 123 / T011] END
