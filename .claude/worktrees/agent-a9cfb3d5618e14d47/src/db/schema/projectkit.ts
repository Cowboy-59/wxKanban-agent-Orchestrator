/**
 * Project Kit Schema
 * 
 * Tracks AI-ready project kit generation status and metadata.
 * Part of Spec 011: New Project — AI-Ready Project Provisioning
 */

import { pgTable, uuid, varchar, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { companyprojects } from './companyproject.js';


export const projectkits = pgTable('projectkits', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectid: uuid('projectid')
    .notNull()
    .references(() => companyprojects.id, { onDelete: 'cascade' }),

  status: varchar('status', { length: 50 }).notNull().default('generating'),
  primaryai: varchar('primaryai', { length: 50 }).notNull().default('generic'),
  kitversion: varchar('kitversion', { length: 20 }).notNull().default('1.0.0'),
  kitcontent: jsonb('kitcontent'),
  downloadcount: integer('downloadcount').notNull().default(0),
  generatedat: timestamp('generatedat', { withTimezone: true }),
  createdat: timestamp('createdat').defaultNow().notNull(),
  updatedat: timestamp('updatedat').defaultNow().notNull(),
});

// Kit content type definition
export interface KitContent {
  files: KitFileMetadata[];
  variables: Record<string, string>;
  importMode: boolean;
}

export interface KitFileMetadata {
  filepath: string;
  filetype: 'command' | 'mcp' | 'settings' | 'context' | 'config' | 'spec';
  size: number;
  hash: string;
}

// Type exports
export type ProjectKit = typeof projectkits.$inferSelect;
export type NewProjectKit = typeof projectkits.$inferInsert;
