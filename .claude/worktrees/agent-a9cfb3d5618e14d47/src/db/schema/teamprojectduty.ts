import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { companyprojects } from './companyproject.js';

/**
 * TeamProjectDuty
 * Maps duty types available to a specific project.
 * Copied from subscription defaults when project is created.
 * Updated when admin changes subscription duty types.
 */
export const teamprojectduty = pgTable(
  'teamprojectduty',
  {
    teamprojectdutyid: uuid('teamprojectdutyid')
      .primaryKey()
      .defaultRandom(),
    projectid: uuid('projectid')
      .notNull()
      .references(() => companyprojects.id, { onDelete: 'cascade' }),
    dutyname: text('dutyname').notNull(), // e.g., 'Developer', 'QA'
    sequence: integer('sequence').notNull(), // 0-6 for standard, 7+ for custom
    isavailable: boolean('isavailable').notNull().default(true), // Can this duty be assigned?
    issystemdefault: boolean('issystemdefault').notNull().default(true), // wxKanban default?
    createdat: timestamp('createdat').notNull().defaultNow(),
    updatedat: timestamp('updatedat').notNull().defaultNow(),
  },
  (table) => {
    return {
      // Unique constraint: each project cannot have duplicate duty names
      projectDutyUniqueIdx: uniqueIndex(
        'teamprojectduty_project_duty_unique'
      ).on(table.projectid, table.dutyname),

      // Indexes for querying
      projectSequenceIdx: index('teamprojectduty_project_sequence_idx').on(
        table.projectid,
        table.sequence
      ),
      projectIdIdx: index('teamprojectduty_project_id_idx').on(
        table.projectid
      ),
      availableIdx: index('teamprojectduty_available_idx').on(table.isavailable),
      systemDefaultIdx: index('teamprojectduty_system_default_idx').on(
        table.issystemdefault
      ),
    };
  }
);

export type TeamProjectDuty = typeof teamprojectduty.$inferSelect;
export type NewTeamProjectDuty = typeof teamprojectduty.$inferInsert;
