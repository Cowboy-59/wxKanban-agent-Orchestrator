import {
  pgTable,
  uuid,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { companyprojects } from './companyproject.js';
import { userprofiles } from './userprofiles.js';
import { teamprojectduty } from './teamprojectduty.js';

/**
 * DutyAssignment
 * Links team members to specific duties they can perform on a project.
 * One record per user-duty-project combination.
 */
export const dutyassignment = pgTable(
  'dutyassignment',
  {
    dutyassignmentid: uuid('dutyassignmentid').primaryKey().defaultRandom(),
    projectid: uuid('projectid')
      .notNull()
      .references(() => companyprojects.id, { onDelete: 'cascade' }),
    userid: uuid('userid')
      .notNull()
      .references(() => userprofiles.id, { onDelete: 'cascade' }),
    teamprojectdutyid: uuid('teamprojectdutyid')
      .notNull()
      .references(() => teamprojectduty.teamprojectdutyid, {
        onDelete: 'cascade',
      }),
    assignedby: uuid('assignedby')
      .notNull()
      .references(() => userprofiles.id), // Team Manager who made assignment
    createdat: timestamp('createdat').notNull().defaultNow(),
  },
  (table) => {
    return {
      // Unique constraint: each user can have at most one assignment per duty per project
      userDutyProjectUniqueIdx: uniqueIndex(
        'dutyassignment_user_duty_project_unique'
      ).on(table.projectid, table.userid, table.teamprojectdutyid),

      // Indexes for querying
      projectUserIdx: index('dutyassignment_project_user_idx').on(
        table.projectid,
        table.userid
      ),
      projectDutyIdx: index('dutyassignment_project_duty_idx').on(
        table.projectid,
        table.teamprojectdutyid
      ),
      userProjectIdx: index('dutyassignment_user_project_idx').on(
        table.userid,
        table.projectid
      ),
      assignedByIdx: index('dutyassignment_assigned_by_idx').on(
        table.assignedby
      ),
    };
  }
);

export type DutyAssignment = typeof dutyassignment.$inferSelect;
export type NewDutyAssignment = typeof dutyassignment.$inferInsert;
