/**
 * Company agent tokens — a third-party agent's admission ticket for one company.
 * SCOPE-134 / T026.
 *
 * DELIBERATELY NOT `mcpapitokens`. That table's `projectid` is NOT NULL with an FK, and
 * `scoped-query.ts` refuses every project-scoped operation without both a project and a
 * customer. This credential cannot read or write project data at all — its entire power
 * is "this agent may connect to this company" plus "here are its grants" — so it never
 * meets that machinery and nothing hardened for SOC 2 H-3 has to move.
 *
 * What bounds an agent's reach is the per-project grant, not this token.
 */

import { pgTable, uuid, text, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './company.js';

// [SCOPE 134 / T026] BEGIN — `companyagenttokens` Drizzle schema
export const companyagenttokens = pgTable(
  'companyagenttokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyid: uuid('companyid')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    // e.g. KAIN. Matches the `NAME:` half of mcpapitokens.clientbinding, so one agent
    // reads the same in both places rather than having two spellings.
    agentname: varchar('agentname', { length: 64 }).notNull(),
    // SHA-256 only. The raw token is returned once at creation and never persists —
    // a credential re-readable from the database is readable by anything reaching it.
    tokenhash: text('tokenhash').notNull(),
    // First 12 characters, so two tokens are tellable apart in a list without the value
    // being recoverable from what is shown.
    tokenprefix: text('tokenprefix').notNull(),
    label: varchar('label', { length: 200 }),
    issuedbyid: uuid('issuedbyid').notNull(),
    issuedat: timestamp('issuedat', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    lastusedat: timestamp('lastusedat', { withTimezone: true, mode: 'date' }),
    // Soft revoke, matching every other credential and grant here (projectusers uses
    // removedat for the same reason): who revoked what, and when, stays answerable.
    revokedat: timestamp('revokedat', { withTimezone: true, mode: 'date' }),
    revokedbyid: uuid('revokedbyid'),
  },
  (table) => ({
    tokenhashUnique: uniqueIndex('companyagenttokens_tokenhash_key').on(table.tokenhash),
    companyidIdx: index('companyagenttokens_companyid_idx').on(table.companyid),
  }),
);
// [SCOPE 134 / T026] END

export type CompanyAgentToken = typeof companyagenttokens.$inferSelect;
export type NewCompanyAgentToken = typeof companyagenttokens.$inferInsert;
