/**
 * Hosted MCP API tokens — issued API tokens, hashed at rest.
 * Part of Spec 028: Hosted MCP Deployment — FR-009.
 */

import { pgTable, uuid, text, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './company.js';
import { companyprojects } from './companyproject.js';
import { userprofiles } from './userprofiles.js';

// [SCOPE 028 / T001] BEGIN — `mcpapitokens` Drizzle schema (hosted-MCP token table)
// MODIFIED-BY: [SCOPE 133 / T001] — added `clientbinding` (agent identity, SCOPE-131)
export const mcpapitokens = pgTable(
  'mcpapitokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerid: uuid('customerid')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    projectid: uuid('projectid')
      .notNull()
      .references(() => companyprojects.id, { onDelete: 'cascade' }),
    tokenhash: text('tokenhash').notNull(),
    tokenprefix: text('tokenprefix').notNull(),
    name: text('name').notNull(),
    issuedbyid: uuid('issuedbyid')
      .notNull()
      .references(() => userprofiles.id, { onDelete: 'restrict' }),
    issuedat: timestamp('issuedat', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    expiresat: timestamp('expiresat', { withTimezone: true, mode: 'date' }),
    revokedat: timestamp('revokedat', { withTimezone: true, mode: 'date' }),
    revokedbyid: uuid('revokedbyid').references(() => userprofiles.id, {
      onDelete: 'set null',
    }),
    lastusedat: timestamp('lastusedat', { withTimezone: true, mode: 'date' }),
    // Agent identity: `NAME:<sha256-of-token>`, e.g. `KAIN:<hash>`. The token half is
    // hashed so no plaintext credential is persisted beside its own hash. NULLABLE and
    // must stay so — unbound tokens (the kit, the Cockpit) authenticate unchanged.
    // Column applied to production 2026-09-23; see specs/117-.../schema-change-log.md.
    clientbinding: varchar('clientbinding', { length: 255 }),
    createdat: timestamp('createdat', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    tokenhashUnique: uniqueIndex('mcpapitokens_tokenhash_unique').on(table.tokenhash),
    customerProjectIdx: index('mcpapitokens_customer_project_idx').on(
      table.customerid,
      table.projectid,
    ),
    projectRevokedatIdx: index('mcpapitokens_project_revokedat_idx').on(
      table.projectid,
      table.revokedat,
    ),
  }),
);
// [SCOPE 028 / T001] END

export type McpApiToken = typeof mcpapitokens.$inferSelect;
export type NewMcpApiToken = typeof mcpapitokens.$inferInsert;
