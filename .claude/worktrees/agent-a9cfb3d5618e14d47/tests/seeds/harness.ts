// Seed harness — binds a drizzle handle to a wxktest_ clone and proves it landed there.
//
// WHY A POOL-LEVEL search_path, NOT `SET search_path`
// `SET search_path` applies to ONE session. A Pool hands out many connections, and a
// seed or test that runs `SET` on the connection it happens to hold has done nothing for
// the next one. That connection then resolves unqualified writes against `public` —
// which on this machine is PRODUCTION.
//
// Passing `options: '-c search_path=…'` in the Pool config applies it to every connection
// the pool opens, including ones created later under load. This is the single most
// important line in this file.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/db/schema/index.js";

// [SCOPE 120 / T005] BEGIN — Seed context bound to a test clone, with isolation asserted
const PREFIX = "wxktest_";

export interface SeedContext {
  /** Drizzle handle whose every connection resolves unqualified names inside the clone. */
  db: ReturnType<typeof drizzle<typeof schema>>;
  pool: Pool;
  /** The clone this context is pinned to. */
  schemaName: string;
}

/**
 * Build a seed/test context against a clone.
 *
 * Refuses any schema name outside the `wxktest_` prefix, and verifies via
 * `current_schema()` that the search_path actually took — a schema that does not exist
 * resolves silently to `public`, which is the failure mode that would destroy production.
 */
export async function createSeedContext(schemaName: string): Promise<SeedContext> {
  if (!schemaName?.startsWith(PREFIX)) {
    throw new Error(
      `refusing to seed "${schemaName}" — only "${PREFIX}" schemas may be written to`,
    );
  }
  if (!/^[a-z0-9_]+$/.test(schemaName)) {
    throw new Error(`"${schemaName}" is not a safe identifier`);
  }

  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("no DATABASE_URL / TEST_DATABASE_URL in the environment");

  // pg 8.12+ reads sslmode=require as verify-full; SSL is configured explicitly instead.
  const clean = url.replace(/([?&])sslmode=[^&]*/g, "$1").replace(/[?&]$/, "");

  const pool = new Pool({
    connectionString: clean,
    ssl: { rejectUnauthorized: false },
    options: `-c search_path=${schemaName},public`,
  });

  const probe = await pool.query("SELECT current_schema() AS s");
  const actual = probe.rows[0]?.s;
  if (actual !== schemaName) {
    await pool.end();
    throw new Error(
      `current_schema() is "${actual}" but the clone is "${schemaName}" — ` +
        `writes would land outside the clone. DATABASE_URL here is PRODUCTION.`,
    );
  }

  return { db: drizzle(pool, { schema }), pool, schemaName };
}
// [SCOPE 120 / T005] END

// [SCOPE 120 / T005] BEGIN — Seed composition: run each seed at most once per context
/**
 * A scope's seed declares what it needs and gets it, without re-authoring the world.
 * Running the same seed twice in one context is a no-op, so a diamond dependency
 * (two scopes both needing the base company) inserts the base rows exactly once.
 */
export interface Seed<T = unknown> {
  /** Stable identity — the composition key. Use the scope folder name. */
  readonly name: string;
  /** Seeds that must run first. */
  readonly requires?: readonly Seed<never>[];
  run(ctx: SeedContext, resolved: SeedResults): Promise<T>;
}

export type SeedResults = Record<string, unknown>;

export async function runSeed(ctx: SeedContext, seed: Seed, results: SeedResults = {}): Promise<SeedResults> {
  if (seed.name in results) return results;

  for (const dep of seed.requires ?? []) {
    await runSeed(ctx, dep as Seed, results);
  }

  results[seed.name] = await seed.run(ctx, results);
  return results;
}
// [SCOPE 120 / T005] END
