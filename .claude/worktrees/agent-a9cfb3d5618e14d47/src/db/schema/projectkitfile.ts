/**
 * Project Kit File Schema
 * 
 * Stores individual rendered files within a project kit.
 * Part of Spec 011: New Project — AI-Ready Project Provisioning
 */

import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { projectkits } from './projectkit';

export const projectkitfiles = pgTable('projectkitfiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  kitid: uuid('kitid')
    .notNull()
    .references(() => projectkits.id, { onDelete: 'cascade' }),
  filepath: varchar('filepath', { length: 500 }).notNull(),
  filetype: varchar('filetype', { length: 50 }).notNull(),
  content: text('content').notNull(),
  createdat: timestamp('createdat').defaultNow().notNull(),
});

// Type exports
export type ProjectKitFile = typeof projectkitfiles.$inferSelect;
export type NewProjectKitFile = typeof projectkitfiles.$inferInsert;
