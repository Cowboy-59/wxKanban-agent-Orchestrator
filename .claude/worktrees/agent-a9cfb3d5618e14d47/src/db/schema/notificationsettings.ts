import { pgTable, uuid, varchar, time, boolean, timestamp } from 'drizzle-orm/pg-core';
import { companies } from './company.js';

export const notificationsettings = pgTable('notificationsettings', {
  settingid: uuid('settingid').primaryKey().defaultRandom(),
    companyid: uuid('companyid')
      .notNull()
      .unique()
      .references(() => companies.id, { onDelete: 'cascade' }),
  emailfrequency: varchar('emailfrequency', { length: 20 }).default('daily').notNull(), // 'daily', 'weekly', 'monthly', 'never'
  emailtime: time('emailtime').default('09:00:00').notNull(), // HH:MM:SS format
  includeprojectupdate: boolean('includeprojectupdate').default(true).notNull(),
  includeteamactivity: boolean('includeteamactivity').default(true).notNull(),
  includefinancials: boolean('includefinancials').default(true).notNull(),
  createdat: timestamp('createdat').defaultNow().notNull(),
  updatedat: timestamp('updatedat').defaultNow().notNull(),
});

export type NotificationSettings = typeof notificationsettings.$inferSelect;
export type NewNotificationSettings = typeof notificationsettings.$inferInsert;
