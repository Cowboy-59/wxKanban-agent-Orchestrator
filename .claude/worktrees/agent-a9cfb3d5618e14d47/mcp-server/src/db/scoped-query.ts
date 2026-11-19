/**
 * Spec 028 / T009 — Scoped query helpers.
 *
 * Every tool handler under `/call` receives a per-request `ScopedDb` instead
 * of the raw `db` import. The helpers refuse to read or write a project-scoped
 * table when:
 *   1. there is no resolved `mcpScope` on the request, or
 *   2. the caller passes a `projectid` that disagrees with `mcpScope.projectId`.
 *
 * Tables listed in `PROJECT_SCOPED_TABLES` must be accessed via these helpers;
 * a CI grep (T011 — `scripts/check-no-direct-db.sh`) enforces no direct
 * `db.select/insert/update/delete` outside this module + bootstrap paths.
 */
import { and, eq, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from './connection.js';
import type { McpScope } from '../middleware/auth.js';

export class ScopeViolationError extends Error {
  readonly code = 'scope-violation';
  constructor(message: string) {
    super(message);
    this.name = 'ScopeViolationError';
  }
}

/** Tables that carry a per-project tenancy column. Updates here. */
export const PROJECT_SCOPED_TABLES = new Set<string>([
  'events',
  'projectdocuments',
  'projecttasks',
  'projectspecifications',
  'projectproposals',
  'mcpapitokens',
  'mcprequestaudit',
  'feedbacksubmissions', // [SCOPE 043 / T002] User Feedback — scope-bind submit/list/answer
]);

function requireScope(scope: McpScope | undefined, tableName: string): {
  projectId: string;
  customerId: string;
} {
  if (!scope || scope.authMode === 'dev-bypass') {
    throw new ScopeViolationError(
      `scope-required: ${tableName} access requires an authenticated token (MCP_AUTH_REQUIRED=true).`,
    );
  }
  if (!scope.projectId || !scope.customerId) {
    throw new ScopeViolationError(
      `scope-incomplete: ${tableName} access requires resolved projectId+customerId.`,
    );
  }
  return { projectId: scope.projectId, customerId: scope.customerId };
}

export interface ScopedDb {
  /**
   * Select rows from `table` automatically AND-ed with `projectid = scope.projectId`.
   * Additional `where` is composed via AND.
   */
  selectScoped<T extends PgTable>(table: T, extraWhere?: SQL): Promise<unknown[]>;
  insertScoped<T extends PgTable>(
    table: T,
    values: Record<string, unknown>,
  ): Promise<unknown[]>;
  updateScoped<T extends PgTable>(
    table: T,
    set: Record<string, unknown>,
    extraWhere?: SQL,
  ): Promise<unknown[]>;
  /** Escape hatch for read-only joins / aggregates that resolve scope manually. */
  raw: typeof db;
  scope: McpScope;
}

function tableNameOf(table: PgTable): string {
  // Drizzle stores the SQL name on a Symbol; fall back to a readable string.
  for (const sym of Object.getOwnPropertySymbols(table)) {
    if (sym.description?.includes('Name')) {
      const v = (table as unknown as Record<symbol, unknown>)[sym];
      if (typeof v === 'string') return v;
    }
  }
  return 'unknown';
}

function projectidCol(table: PgTable): unknown {
  // Drizzle exposes columns under their JS property name, which is camelCase
  // (`projectId`) for several scoped tables (projectdocuments, projecttasks,
  // projectspecifications) and lowercase (`projectid`) for others. Resolve
  // either casing so scope enforcement finds the tenancy column rather than
  // throwing scope-missing-column.
  const t = table as unknown as Record<string, unknown>;
  return t['projectid'] ?? t['projectId'];
}

// Resolve the JS PROPERTY NAME of the tenancy column, for building insert /
// value maps. Drizzle insert values are keyed by property name, so a literal
// lowercase 'projectid' is silently dropped on camelCase-keyed tables
// (projectspecifications/projecttasks/projectdocuments) — letting the caller's
// projectId survive and bypass scope enforcement. Write-side twin of the
// projectidCol read bug. See specs/028-HostedMCPDeployment/bug-reports/
// 2026-05-28-scoped-query-tenancy-column-defects.md (Defect 5).
function projectidKey(table: PgTable): string | null {
  const t = table as unknown as Record<string, unknown>;
  if (t['projectId'] !== undefined) return 'projectId';
  if (t['projectid'] !== undefined) return 'projectid';
  return null;
}

export function withScope(scope: McpScope | undefined): ScopedDb {
  return {
    scope: scope ?? { tokenId: null, customerId: null, projectId: null, tokenPrefix: null, userId: null, authMode: 'dev-bypass' },
    raw: db,
    async selectScoped(table, extraWhere) {
      const tname = tableNameOf(table);
      if (!PROJECT_SCOPED_TABLES.has(tname)) {
        return db.select().from(table as never).where(extraWhere ?? (undefined as unknown as SQL));
      }
      const { projectId } = requireScope(scope, tname);
      const col = projectidCol(table);
      if (!col) {
        throw new ScopeViolationError(`scope-missing-column: ${tname}.projectid not defined`);
      }
      const where = extraWhere
        ? and(eq(col as never, projectId), extraWhere)
        : eq(col as never, projectId);
      return db.select().from(table as never).where(where as SQL);
    },
    async insertScoped(table, values) {
      const tname = tableNameOf(table);
      if (!PROJECT_SCOPED_TABLES.has(tname)) {
        return db.insert(table as never).values(values as never).returning();
      }
      const { projectId } = requireScope(scope, tname);
      const key = projectidKey(table);
      if (!key) {
        throw new ScopeViolationError(`scope-missing-column: ${tname}.projectid not defined`);
      }
      const incoming = (values as Record<string, unknown>)[key];
      if (incoming && incoming !== projectId) {
        throw new ScopeViolationError(
          `scope-mismatch: insert into ${tname} with ${key}=${String(incoming)} from scope=${projectId}`,
        );
      }
      const merged = { ...values, [key]: projectId };
      return db.insert(table as never).values(merged as never).returning();
    },
    async updateScoped(table, set, extraWhere) {
      const tname = tableNameOf(table);
      if (!PROJECT_SCOPED_TABLES.has(tname)) {
        return db.update(table as never).set(set as never).where(extraWhere ?? (undefined as unknown as SQL)).returning();
      }
      const { projectId } = requireScope(scope, tname);
      const col = projectidCol(table);
      if (!col) {
        throw new ScopeViolationError(`scope-missing-column: ${tname}.projectid not defined`);
      }
      const where = extraWhere
        ? and(eq(col as never, projectId), extraWhere)
        : eq(col as never, projectId);
      return db.update(table as never).set(set as never).where(where as SQL).returning();
    },
  };
}
