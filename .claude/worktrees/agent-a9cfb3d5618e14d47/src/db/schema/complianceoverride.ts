import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { companyprojects } from './companyproject.js';
import { userprofiles } from './userprofiles.js';
import { teamprojectduty } from './teamprojectduty.js';

/**
 * ComplianceOverride
 * Immutable audit trail for compliance rule violations that were explicitly overridden.
 * Records are created but never updated or deleted (compliance audit requirements).
 */
export const complianceoverride = pgTable(
  'complianceoverride',
  {
    complianceoverrideid: uuid('complianceoverrideid')
      .primaryKey()
      .defaultRandom(),
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
    securitystandard: text('securitystandard').notNull(), // 'SOC2' or 'HITRUST'
    violatedrules: text('violatedrules').notNull(), // Comma-separated rule IDs
    overriddenby: uuid('overriddenby')
      .notNull()
      .references(() => userprofiles.id), // Team Manager who approved override
    reason: text('reason').notNull(), // Documented justification (min 50 chars)
    createdat: timestamp('createdat').notNull().defaultNow(),
  },
  (table) => {
    return {
      // Indexes for compliance auditing
      projectIdx: index('complianceoverride_project_idx').on(table.projectid),
      userIdx: index('complianceoverride_user_idx').on(table.userid),
      overriddenByIdx: index('complianceoverride_overridden_by_idx').on(
        table.overriddenby
      ),
      securityStandardIdx: index('complianceoverride_security_standard_idx').on(
        table.securitystandard
      ),
      createdAtIdx: index('complianceoverride_created_at_idx').on(
        table.createdat
      ),
    };
  }
);

export type ComplianceOverride = typeof complianceoverride.$inferSelect;
export type NewComplianceOverride = typeof complianceoverride.$inferInsert;
