// Re-export relevant schema from main project
// These are the tables we'll be working with for MCP tools

import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer } from 'drizzle-orm/pg-core';


// Events table (new for MCP)
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('projectid').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  source: varchar('source', { length: 50 }).notNull(),
  actor: varchar('actor', { length: 255 }).notNull(),
  rawContent: text('raw_content').notNull(),
  normalizedContent: text('normalized_content'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Project Documents (existing table)
export const projectdocuments = pgTable('projectdocuments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('projectid').notNull(),
  specId: uuid('specid'),
  doctype: varchar('doctype', { length: 50 }),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content').notNull(),
  filepath: varchar('filepath', { length: 1000 }),
  isGenerated: boolean('isgenerated').default(false),
  createdById: uuid('createdbyid'),
  sourceEventId: uuid('sourceeventid'),
  taskIds: jsonb('taskids').default('[]'),
  tags: jsonb('tags').default('[]'),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});


// Project Tasks (existing table)
export const projecttasks = pgTable('projecttasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('projectid').notNull(),
  specId: uuid('specid'),
  createdById: uuid('createdbyid'),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('open').notNull(),
  priority: varchar('priority', { length: 50 }).default('medium').notNull(),
  dueDate: timestamp('duedate', { withTimezone: true }),
  sourceEventId: uuid('sourceeventid'),
  documentIds: jsonb('documentids').default('[]'),
  assignee: varchar('assignee', { length: 255 }),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});


// Project Specifications (existing table)
export const projectspecifications = pgTable('projectspecifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('projectid').notNull(),
  specNumber: varchar('specnumber', { length: 10 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content'),
  status: varchar('status', { length: 50 }).default('draft').notNull(),
  specOrder: integer('specorder').default(0),
  isOptional: boolean('isoptional').default(false),
  createdById: uuid('createdbyid'),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});

// Company Projects (existing table - for project context)
export const companyprojects = pgTable('companyprojects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userid'),
  companyId: uuid('companyid'),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('active'),
  createdAt: timestamp('createdat', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedat', { withTimezone: true }).defaultNow().notNull(),
});

// Export types
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type ProjectDocument = typeof projectdocuments.$inferSelect;
export type NewProjectDocument = typeof projectdocuments.$inferInsert;
export type ProjectTask = typeof projecttasks.$inferSelect;
export type NewProjectTask = typeof projecttasks.$inferInsert;
export type ProjectSpecification = typeof projectspecifications.$inferSelect;
export type CompanyProject = typeof companyprojects.$inferSelect;
