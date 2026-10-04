// SCOPE-123 — entry point for per-scope stage progression.
//
// The MCP server bundles THIS file (mcp-server `postbuild`, alongside the policy adapter) into
// dist/_kit/scope-stage.cjs; the application imports it directly and esbuild bundles it into
// dist/server.cjs. Both consumers therefore run byte-identical stage logic.

import { StageDb, StageQueryClient } from './store';

export * from './vocabulary';
export * from './store';
export * from './advance';
export * from './rollup';
export * from './backfill';
export * from './lookup';

interface PgClientLike extends StageQueryClient {
	release(err?: Error | boolean): void;
}

export interface PgPoolLike extends StageQueryClient {
	connect(): Promise<PgClientLike>;
}

// [SCOPE 123 / T005] BEGIN — stageDbFromPool: adapt a node-postgres pool to the StageDb interface
// [SCOPE 123 / T021] MODIFIED-BY — release(err) after a failed ROLLBACK
//
// Both consumers own a `pg.Pool`. A transaction needs ONE connection for its whole length, so it
// checks a client out of the pool rather than using pool.query, which may pick a different
// connection per statement.
export function stageDbFromPool(pool: PgPoolLike): StageDb {
	return {
		query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
			pool.query<T>(sql, params),
		transaction: async <T>(fn: (tx: StageQueryClient) => Promise<T>): Promise<T> => {
			const client = await pool.connect();
			// [SCOPE 123 / T021] A connection whose ROLLBACK failed is in an unknown state:
			// release it WITH the error so the pool destroys it instead of reusing it.
			let broken: Error | undefined;
			try {
				await client.query('BEGIN');
				const result = await fn({
					query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) =>
						client.query<R>(sql, params),
				});
				await client.query('COMMIT');
				return result;
			} catch (err) {
				try {
					await client.query('ROLLBACK');
				} catch (rollbackErr) {
					// The original error is the one worth reporting.
					broken = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
				}
				throw err;
			} finally {
				client.release(broken);
			}
		},
	};
}
// [SCOPE 123 / T005] END
