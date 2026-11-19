/**
 * Project rooms — the YappChatt room an agent uses for one project.
 * SCOPE-134 / T004 (migration 0068).
 *
 * Written server-side by the agent broker on first connect, from a grant-resolved
 * projectId, so a room is authoritative and never a client claim (FR-013). Holds NO
 * credential: the agent keeps its own `yca_` token, as the SCOPE-102 bridge does.
 */

import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companyprojects } from './companyproject.js';

// [SCOPE 134 / T004] BEGIN — `projectrooms` Drizzle schema
// MODIFIED-BY: [SCOPE 144 / T004] — owneryappchattid, retiredat; one LIVE room per (project, agent)
export const projectrooms = pgTable(
  'projectrooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectid: uuid('projectid')
      .notNull()
      .references(() => companyprojects.id, { onDelete: 'cascade' }),
    agentname: varchar('agentname', { length: 64 }).notNull(),
    conversationid: varchar('conversationid', { length: 255 }).notNull(),
    // Set on each mint. YappChatt never revokes an agent token, so a room whose timestamp
    // keeps moving is accumulating live credentials. Observability, not prevention.
    agenttokenmintedat: timestamp('agenttokenmintedat', { withTimezone: true, mode: 'date' }),
    // SCOPE-144: declared before the column exists in production — do not push until the owner applies specs/144-company-yappchatt-account/sql/0001-company-yappchatt.sql
    // owneryappchattid  the YappChatt account that owns the room; null = a pre-SCOPE-144 room (FR-007 retires it).
    // retiredat         when the room was retired and replaced; null = the live room.
    owneryappchattid: uuid('owneryappchattid'),
    retiredat: timestamp('retiredat', { withTimezone: true, mode: 'date' }),
    createdat: timestamp('createdat', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
    updatedat: timestamp('updatedat', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
  },
  (table) => ({
    // SCOPE-144: replaces projectrooms_projectid_agentname_key, so retired rooms keep their row.
    projectAgentActiveKey: uniqueIndex('projectrooms_projectid_agentname_active_key')
      .on(table.projectid, table.agentname)
      .where(sql`${table.retiredat} IS NULL`),
    projectIdx: index('projectrooms_projectid_idx').on(table.projectid),
  }),
);
// [SCOPE 134 / T004] END

export type ProjectRoom = typeof projectrooms.$inferSelect;
export type NewProjectRoom = typeof projectrooms.$inferInsert;
