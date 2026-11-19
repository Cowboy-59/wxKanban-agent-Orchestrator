/**
 * Project agent connections — one row per project agent connection, start to stop.
 * SPEC-151 / T002 (SCOPE-132 Amendment D, FR-058). Applied by hand:
 * specs/151-project-agent-connections/sql/0001-projectagentconnections.sql.
 *
 * Written by the project agent through /api/project-agent/connections with its kit token, so the
 * project is always the token's, never a client claim (FR-013). Holds no secret, and `repo` is the
 * folder name only, never a path.
 */

import { pgTable, uuid, varchar, timestamp, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { companyprojects } from './companyproject.js';

// [SCOPE 151 / T002] BEGIN — `projectagentconnections` Drizzle schema
export const projectagentconnections = pgTable(
  'projectagentconnections',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectid: uuid('projectid')
      .notNull()
      .references(() => companyprojects.id, { onDelete: 'cascade' }),
    conversationid: varchar('conversationid', { length: 255 }),
    agenttag: varchar('agenttag', { length: 100 }).notNull(),
    machine: varchar('machine', { length: 255 }).notNull(),
    repo: varchar('repo', { length: 255 }).notNull(),
    kitversion: varchar('kitversion', { length: 50 }),
    state: varchar('state', { length: 20 }).notNull().default('idle'), // idle | working | waiting
    connectedat: timestamp('connectedat', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
    lastseenat: timestamp('lastseenat', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
    disconnectedat: timestamp('disconnectedat', { withTimezone: true, mode: 'date' }),
    endreason: varchar('endreason', { length: 20 }), // stopped | stale | replaced; null while open
    // [SCOPE 154 / T001] BEGIN — Autopilot run marker (SCOPE-132 Amendment H, FR-008)
    // Nullable; distinguishes an active unattended run from an idle agent connection, so the
    // server can derive a missed-heartbeat alert from this record alone, with no second table.
    // Applied by hand and verified 2026-11-07 before this declaration (SCOPE-117 change log).
    autopilotrunactive: boolean('autopilotrunactive'),
    // [SCOPE 154 / T001] END
    // [SCOPE 155 / T001] BEGIN — K.A.I.N. session status columns (SCOPE-132 Amendment G piece A, FR-003)
    // All five nullable/defaulted so a server that doesn't yet know them is unaffected. Overwrite-only;
    // no history. Applied by hand and verified 2026-11-07 before this declaration (migration 0079,
    // specs/117-production-schema-integrity/schema-change-log.md).
    sessionsummary: varchar('sessionsummary', { length: 1500 }),
    lastentry: varchar('lastentry', { length: 500 }),
    blockers: jsonb('blockers'),
    sharing: boolean('sharing').notNull().default(false),
    summaryat: timestamp('summaryat', { withTimezone: true, mode: 'date' }),
    // [SCOPE 155 / T001] END
  },
  (table) => ({
    projectOpenKey: uniqueIndex('projectagentconnections_projectid_open_key')
      .on(table.projectid)
      .where(sql`${table.disconnectedat} IS NULL`),
    projectConnectedIdx: index('idx_projectagentconnections_project_connected').on(table.projectid, table.connectedat),
  }),
);
// [SCOPE 151 / T002] END

export type ProjectAgentConnection = typeof projectagentconnections.$inferSelect;
export type NewProjectAgentConnection = typeof projectagentconnections.$inferInsert;
