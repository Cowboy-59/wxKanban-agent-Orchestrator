import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { companies } from './company.js';

/**
 * SubscriptionDutyType
 * Stores custom duty types per company/subscription at admin level.
 * These duties are copied to all projects under the company.
 */
export const subscriptiondutytype = pgTable(
  'subscriptiondutytype',
  {
    subscriptiondutytypeid: uuid('subscriptiondutytypeid')
      .primaryKey()
      .defaultRandom(),
    companyid: uuid('companyid')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    dutyname: text('dutyname').notNull(), // e.g., 'Developer', 'QA', 'Code Reviewer'
    allowedfor: text('allowedfor').notNull(), // 'SOC2', 'HITRUST', or 'BOTH'
    isdefault: boolean('isdefault').notNull().default(false), // True if wxKanban default
    createdat: timestamp('createdat').notNull().defaultNow(),
    updatedat: timestamp('updatedat').notNull().defaultNow(),
  },
  (table) => {
    return {
      // Unique constraint: each company cannot have duplicate duty names
      companydutyUniqueIdx: uniqueIndex(
        'subscriptiondutytype_company_duty_unique'
      ).on(table.companyid, table.dutyname),

      // Indexes for querying
      companyIdIdx: index('subscriptiondutytype_company_id_idx').on(
        table.companyid
      ),
      isDefaultIdx: index('subscriptiondutytype_is_default_idx').on(
        table.isdefault
      ),
      allowedForIdx: index('subscriptiondutytype_allowed_for_idx').on(
        table.allowedfor
      ),
    };
  }
);

export type SubscriptionDutyType = typeof subscriptiondutytype.$inferSelect;
export type NewSubscriptionDutyType = typeof subscriptiondutytype.$inferInsert;
