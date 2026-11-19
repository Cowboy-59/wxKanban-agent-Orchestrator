/**
 * Hosted MCP request audit — append-only per-request log.
 * Part of Spec 028: Hosted MCP Deployment — FR-008.
 *
 * Append-only by service convention: no UPDATE/DELETE in handlers.
 * Retention 90 days; archive job is out of scope for spec 028.
 */

import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { mcpapitokens } from './mcpapitokens.js';

// [SCOPE 028 / T002] BEGIN — `mcprequestaudit` Drizzle schema (per-request hosted-MCP audit log)
export const mcprequestaudit = pgTable(
  'mcprequestaudit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestid: uuid('requestid').notNull(),
    tokenid: uuid('tokenid').references(() => mcpapitokens.id, { onDelete: 'set null' }),
    customerid: uuid('customerid'),
    projectid: uuid('projectid'),
    // [SCOPE 043 / audit] The project the caller ASKED for, vs `projectid` above
    // which is the project their TOKEN is bound to. Written by the MCP server's
    // audit middleware. Requires migration 0061 — see that file for the mandatory
    // apply ordering.
    requestedprojectid: uuid('requestedprojectid'),
    tool: text('tool'),
    methodpath: text('methodpath').notNull(),
    durationms: integer('durationms').notNull(),
    outcome: text('outcome').notNull(),
    errorcode: text('errorcode'),
    responsestatus: integer('responsestatus').notNull(),
    clientip: text('clientip'),
    useragent: text('useragent'),
    createdat: timestamp('createdat', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    tokenCreatedIdx: index('mcprequestaudit_token_createdat_idx').on(table.tokenid, table.createdat),
    projectCreatedIdx: index('mcprequestaudit_project_createdat_idx').on(table.projectid, table.createdat),
    outcomeCreatedIdx: index('mcprequestaudit_outcome_createdat_idx').on(table.outcome, table.createdat),
  }),
);
// [SCOPE 028 / T002] END

export type McpRequestAudit = typeof mcprequestaudit.$inferSelect;
export type NewMcpRequestAudit = typeof mcprequestaudit.$inferInsert;

/**
 * Outcome enum values per FR-008. Kept as a const tuple rather than a Postgres
 * ENUM type so handlers can extend the vocabulary without a schema migration.
 * Service-side validation enforces membership.
 */
export const MCP_AUDIT_OUTCOMES = [
  'success',
  'auth-failed',
  'throttled',
  'scope-violation',
  'error',
] as const;

export type McpAuditOutcome = (typeof MCP_AUDIT_OUTCOMES)[number];
