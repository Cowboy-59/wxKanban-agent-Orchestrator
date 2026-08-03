import type { DbConnection } from "../../core/engine.js";

// [SCOPE 121 / T004] BEGIN — Postgres driver loading
interface TaggedSql {
  (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<ReadonlyArray<Record<string, unknown>>>;
  unsafe(
    sql: string,
    params?: readonly unknown[],
    options?: { simple?: boolean },
  ): Promise<ReadonlyArray<Record<string, unknown>>>;
  end(options?: { timeout?: number }): Promise<void>;
}

type PostgresFactory = (
  url: string,
  options?: { prepare?: boolean; max?: number },
) => TaggedSql;

/**
 * The kit strips database dependencies before shipping to consumers, so the
 * driver is imported dynamically and its absence is reported as guidance.
 */
export async function loadPostgresDriver(): Promise<PostgresFactory> {
  let mod: unknown;
  try {
    mod = await import("postgres");
  } catch {
    throw new Error(
      "wxDBAnalyze needs the 'postgres' driver, which is not installed here. " +
        "Run it from a project that has database dependencies installed.",
    );
  }
  const candidate = (mod as { default?: unknown }).default ?? mod;
  if (typeof candidate !== "function") {
    throw new Error("the 'postgres' module did not export a callable factory");
  }
  return candidate as PostgresFactory;
}
// [SCOPE 121 / T004] END

// [SCOPE 121 / T004] BEGIN — Read-only connection guard
export class ReadOnlyGuardError extends Error {
  constructor(reported: string) {
    super(
      "refusing to probe: default_transaction_read_only reported " +
        `${JSON.stringify(reported)} rather than "on". wxDBAnalyze will not ` +
        "read from a connection that is capable of writing.",
    );
    this.name = "ReadOnlyGuardError";
  }
}

/**
 * Wrap a live driver handle in the read-only guard.
 *
 * The guard is SET and then independently VERIFIED. Setting alone is a silent
 * check: if the statement were ignored, every subsequent probe would run on a
 * writable session while appearing safe.
 */
export async function buildReadOnlyConnection(
  sql: TaggedSql,
): Promise<DbConnection> {
  try {
    await sql`set default_transaction_read_only = on`;
    const rows = await sql`show default_transaction_read_only`;
    const reported = String(
      rows[0]?.default_transaction_read_only ?? "<absent>",
    );
    if (reported !== "on") throw new ReadOnlyGuardError(reported);
  } catch (error) {
    await sql.end({ timeout: 5 }).catch(() => undefined);
    throw error;
  }

  return {
    async query(text: string, params: readonly unknown[] = []) {
      // simple: false forces the extended query protocol even when params is
      // empty (postgres.js otherwise defaults simple mode to
      // args.length === 0). Postgres's simple query protocol allows a single
      // string to carry multiple ';'-separated statements — including a
      // re-arming `set default_transaction_read_only = off`, which is legal
      // to reissue inside a read-only session because it is session state,
      // not a write. The extended protocol used here parses exactly one
      // statement per call, so a stray ';' cannot smuggle a second one in.
      // The guard's integrity depends on this option staying set.
      return sql.unsafe(text, params, { simple: false });
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

/** Open a guarded read-only connection to a PostgreSQL database. */
export async function createReadOnlyConnection(
  url: string,
): Promise<DbConnection> {
  const factory = await loadPostgresDriver();
  // max: 1 is deliberate — do not "optimise" this back up. postgres.js pools
  // physical sockets and dispatches each query to whichever socket is idle;
  // a physical connection is not pinned to this `sql` handle. The
  // `set default_transaction_read_only = on` above only armed the one socket
  // that happened to run it. Nothing in DbConnection forbids concurrent use
  // (e.g. a future caller doing Promise.all over conn.query(...)), and with
  // max > 1 that would silently open a second, unguarded socket on which a
  // write would succeed. Forcing a single socket is what makes "the guard is
  // on" mean every query on this connection is guarded, not just the first.
  return buildReadOnlyConnection(factory(url, { prepare: false, max: 1 }));
}
// [SCOPE 121 / T004] END
