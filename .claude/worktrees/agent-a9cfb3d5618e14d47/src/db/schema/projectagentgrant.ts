/**
 * Project agent grants — which projects an agent has been allowed to see.
 * SCOPE-134 / T027.
 *
 * A Company Access Token proves an agent may CONNECT to a company (see
 * `companyagenttoken.ts`). This table decides what it may REACH. That split is the whole
 * safety argument: the credential is company-wide, its reach is an explicit allowlist a
 * human ticked and can withdraw.
 *
 * Keyed per AGENT, not per project, so a second agent inherits nothing.
 */

import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companyprojects } from './companyproject.js';

// [SCOPE 134 / T027] BEGIN — `projectagentgrants` Drizzle schema
export const projectagentgrants = pgTable(
  'projectagentgrants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectid: uuid('projectid')
      .notNull()
      .references(() => companyprojects.id, { onDelete: 'cascade' }),
    // Matches companyagenttokens.agentname and the `NAME:` half of
    // mcpapitokens.clientbinding, so one agent reads the same everywhere.
    agentname: varchar('agentname', { length: 64 }).notNull(),
    grantedbyid: uuid('grantedbyid').notNull(),
    grantedat: timestamp('grantedat', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    // Soft revoke, matching projectusers.removedat: who withdrew access, and when, stays
    // answerable. The live-grant unique index in migration 0070 covers only NULL rows,
    // so re-granting after a revoke is not blocked by history.
    revokedat: timestamp('revokedat', { withTimezone: true, mode: 'date' }),
    revokedbyid: uuid('revokedbyid'),
  },
  (table) => ({
    // "May this agent act on this project, right now" runs on every call, not once per
    // session — unticking has to stop work already in progress.
    lookupIdx: index('projectagentgrants_lookup_idx').on(table.agentname, table.projectid),
  }),
);
// [SCOPE 134 / T027] END

export type ProjectAgentGrant = typeof projectagentgrants.$inferSelect;
export type NewProjectAgentGrant = typeof projectagentgrants.$inferInsert;
