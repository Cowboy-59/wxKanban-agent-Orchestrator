# Harness setup (app/ — alitho-mcp)

Copy-paste ready. Four things about this codebase break a naive Vitest setup; each is handled below.

| # | Hazard | Fix |
|---|---|---|
| 1 | `src/db/client.ts` builds a `pg.Pool` **at module load** | mock `pg` in `setupFiles` (runs before test-file imports) |
| 2 | `src/config/env.ts` **throws at import** without `UAT_PG*`, and loads repo-root `.env` | force fake vars in `setupFiles`, assigned with `=` |
| 3 | NodeNext source imports `./foo.js` but the file is `foo.ts` | `resolveId` plugin mapping `.js` → `.ts` |
| 4 | Tool handlers are closures, not exports | drive `buildServer()` over `InMemoryTransport` |

## Install

`vitest` is only in the **root** `node_modules` and there are no npm workspaces, so add it to `app/`:

```bash
cd app && npm i -D vitest
```

## `app/vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * The source is NodeNext: it imports `./foo.js` for a file that is really `foo.ts`.
 * Vite does not remap that, so every relative import would 404. Map them back.
 */
const nodeNextJsToTs: Plugin = {
  name: 'nodenext-js-to-ts',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.') || !source.endsWith('.js')) return null;
    const candidate = resolve(dirname(importer.split('?')[0]), `${source.slice(0, -3)}.ts`);
    return existsSync(candidate) ? candidate : null;
  },
};

export default defineConfig({
  plugins: [nodeNextJsToTs],
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/integration/**', 'node_modules/**', 'dist/**'],
    // Order matters: env before mock-pg, both before any src/ import.
    setupFiles: ['./tests/setup/env.ts', './tests/setup/mock-pg.ts', './tests/setup/mock-pace.ts'],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 10_000,
    reporters: ['default'],
  },
});
```

## `app/tests/setup/env.ts`

```ts
/**
 * Forces a fake DB config for the unit tier.
 *
 * config/env.ts calls dotenv with `override: false`, so whatever is already in process.env
 * wins over repo-root .env. Assigning with `=` (never `??=`) therefore guarantees the unit
 * tier cannot reach a real host even on a developer machine with live UAT credentials.
 */
process.env.DB_TARGET = 'UAT';
process.env.UAT_PGHOST = 'db.test.invalid';
process.env.UAT_PGPORT = '5432';
process.env.UAT_PGUSER = 'test_user';
process.env.UAT_PGDATABASE = 'GPMGT_TEST';
// A bare literal — LocalSecretProvider returns it as-is (dev-only path, warns once).
process.env.UAT_PGPASSWORD = 'test-password';
// `require` = encrypt, skip cert verification: no CA file read, no TLS throw. pg is mocked anyway.
process.env.UAT_PGSSLMODE = 'require';

// Never let a stray dev escape hatch or vault provider bleed into tests.
delete process.env.ALLOW_INSECURE_DB;
delete process.env.SECRETS_PROVIDER;
delete process.env.PROD_PGHOST;
```

Tests that assert on `config/env.ts` or `config/tls.ts` behavior must mutate `process.env` and
re-import with `vi.resetModules()` — `env` is a module-level `const`, evaluated once per module graph.

## `app/tests/setup/mock-pg.ts`

Mock at the **pool boundary** and leave drizzle real, so generated SQL — table and column names
against `db/schema.ts` — is genuinely exercised. A typo'd column shows up as an unmatched query.

```ts
import { vi } from 'vitest';

export interface PgHandler { match: RegExp; rows: unknown[]; rowCount?: number }

/** Test-facing control surface for the fake pool. */
export const pgMock = {
  /** Every SQL string the code sent, in order. Assert shape/params against this. */
  calls: [] as Array<{ sql: string; values: unknown[] }>,
  handlers: [] as PgHandler[],
  /** Route the next queries matching `match` to `rows`. */
  on(match: RegExp, rows: unknown[]) { this.handlers.push({ match, rows }); return this; },
  reset() { this.calls = []; this.handlers = []; },
  /** Unmatched queries return [] — flip to true to make them throw instead. */
  strict: false,
};

const query = vi.fn(async (sqlOrConfig: any, maybeValues?: unknown[]) => {
  const sql = typeof sqlOrConfig === 'string' ? sqlOrConfig : sqlOrConfig?.text ?? '';
  const values = (typeof sqlOrConfig === 'string' ? maybeValues : sqlOrConfig?.values) ?? [];
  pgMock.calls.push({ sql, values });
  const hit = pgMock.handlers.find((h) => h.match.test(sql));
  if (!hit) {
    if (pgMock.strict) throw new Error(`pgMock: no handler for SQL:\n${sql}`);
    return { rows: [], rowCount: 0, fields: [] };
  }
  return { rows: hit.rows, rowCount: hit.rowCount ?? hit.rows.length, fields: [] };
});

class FakePool {
  query = query;
  connect = vi.fn(async () => ({ query, release: vi.fn() }));
  end = vi.fn(async () => {});
  on = vi.fn();
}

vi.mock('pg', () => {
  const pg = { Pool: FakePool, Client: FakePool };
  return { default: pg, ...pg };
});
```

Reset between tests:

```ts
import { beforeEach } from 'vitest';
import { pgMock } from '../setup/mock-pg.js';
beforeEach(() => pgMock.reset());
```

## `app/tests/setup/mock-pace.ts`

PACE is a swappable singleton, so no module mock is needed — just install a fake.

```ts
import { vi } from 'vitest';
import type { PaceClient } from '../../src/integrations/pace/types.js';

/** A PaceClient whose every method is a spy resolving to `{}` — override per test. */
export function fakePaceClient(overrides: Partial<PaceClient> = {}): PaceClient {
  const base = new Proxy({ configured: true } as any, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'then') return undefined; // don't look thenable
      target[prop] = vi.fn(async () => ({}));
      return target[prop];
    },
  });
  return Object.assign(base, overrides) as PaceClient;
}
```

Install and restore per test:

```ts
import { getPaceClient, setPaceClient } from '../../src/integrations/pace/client.js';

let original: PaceClient;
beforeEach(() => { original = getPaceClient(); });
afterEach(() => setPaceClient(original));
```

The default instance is `NotConfiguredPaceClient`, which throws
`ToolError('…', 'PACE_NOT_CONFIGURED')` from every method. That is **documented Spec 005 behavior** —
assert it explicitly rather than treating it as a failure.

## `app/tests/helpers/mcp.ts` — invoking tool handlers

The only way to reach a `registerTool` handler. Also exercises zod input validation and the
`safeTool` error envelope, which unit-calling an exported function would skip.

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../../src/mcp/server.js';

export interface ToolHarness {
  client: Client;
  listToolNames(): Promise<string[]>;
  /** Call a tool and return its parsed JSON payload plus the isError flag. */
  call<T = any>(name: string, args?: Record<string, unknown>): Promise<{ data: T; isError: boolean; text: string }>;
  close(): Promise<void>;
}

export async function startHarness(): Promise<ToolHarness> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer();
  const client = new Client({ name: 'test-sweep', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    async listToolNames() {
      return (await client.listTools()).tools.map((t) => t.name).sort();
    },
    async call(name, args = {}) {
      const res: any = await client.callTool({ name, arguments: args });
      const text = (res?.content ?? []).map((c: any) => c.text).join('\n');
      let data: any;
      try { data = JSON.parse(text); } catch { data = text; }
      return { data, isError: !!res?.isError, text };
    },
    async close() { await client.close(); },
  };
}
```

`InMemoryTransport` resolves through the SDK's `./*` export wildcard (verified on SDK 1.29.0).

## Live tier — `app/vitest.live.config.ts`

Opt-in only, read-only, UAT only.

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.js';

export default mergeConfig(base, defineConfig({
  test: {
    include: ['tests/integration/**/*.live.test.ts'],
    exclude: ['tests/unit/**'],
    // No env/pg stubs — real .env, real pool. Only the guard runs.
    setupFiles: ['./tests/setup/live-guard.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
}));
```

```ts
// app/tests/setup/live-guard.ts
if ((process.env.DB_TARGET ?? 'UAT') !== 'UAT') {
  throw new Error(`Live tests are UAT-only. DB_TARGET=${process.env.DB_TARGET} refused.`);
}
if (process.env.TEST_SWEEP_LIVE !== '1') {
  throw new Error('Live tier requires TEST_SWEEP_LIVE=1 (explicit opt-in).');
}
```

Run with: `cd app && TEST_SWEEP_LIVE=1 npx vitest run --config vitest.live.config.ts`
(PowerShell: `$env:TEST_SWEEP_LIVE=1; npx vitest run --config vitest.live.config.ts`).

Live tests must be **read-only**: `select` only, no PACE `update*`/`delete*`/`complete*`/`fixup`
calls. Anything mutating stays in the unit tier against the fake pool.

## Directory layout

```
app/
  vitest.config.ts
  vitest.live.config.ts
  tests/
    inventory.json          # generated, committed — the re-run anchor
    INVENTORY.md            # generated, human-readable
    TEST-PLAN.md            # authored in Phase 2
    TEST-REPORT.md          # authored in Phase 5
    .last-run.json          # vitest JSON output (gitignored)
    setup/   env.ts  mock-pg.ts  mock-pace.ts  live-guard.ts
    helpers/ mcp.ts  fixtures.ts
    unit/    config/  lib/  db/  integrations/pace/  mcp/tools/
    integration/            # *.live.test.ts
```

Add `app/tests/.last-run.json` to `.gitignore`.
