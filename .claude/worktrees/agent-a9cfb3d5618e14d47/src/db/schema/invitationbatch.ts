/**
 * Invitation Batch Schema
 * Tracks bulk team member invitation operations
 *
 * Purpose: Record metadata for CSV uploads and invitation campaigns
 * Related to: EmailQueue, user team invitations
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { userprofiles } from './userprofiles';
import { companyprojects } from './companyproject';

/**
 * invitationbatches
 *
 * Stores information about bulk invitation campaigns:
 * - CSV upload from user
 * - Number of invitations queued
 * - Progress tracking (completed vs failed)
 * - Timestamps for analytics
 */
export const invitationbatches = pgTable(
  'invitationbatches',
  {
    // Primary Key
    batchid: uuid('batchid').primaryKey().defaultRandom(),

    // Foreign Keys
    projectid: uuid('projectid').notNull(),
    userid: uuid('userid').notNull(),

    // Invitation Count
    totalcount: integer('totalcount').notNull(), // Total invitations in batch
    successcount: integer('successcount').notNull().default(0), // Successfully sent
    failedcount: integer('failedcount').notNull().default(0), // Failed after retries

    // Status Tracking
    status: varchar('status', { length: 50 }).notNull().default('queued'),
    // Values: 'queued' | 'processing' | 'completed' | 'failed'

    // Timestamps
    createdat: timestamp('createdat').notNull().defaultNow(),
    completedat: timestamp('completedat'), // When batch finished (success or failure)
  },
  (table) => {
    return {
      // Foreign Key Constraints
      fkProject: foreignKey({
        columns: [table.projectid],
        foreignColumns: [companyprojects.id],
      }).onDelete('cascade'),

      fkUser: foreignKey({
        columns: [table.userid],
        foreignColumns: [userprofiles.id],
      }).onDelete('cascade'),

      // Indexes for Common Queries
      idxProjectid: index('idx_invitationbatches_projectid').on(table.projectid),
      idxUserid: index('idx_invitationbatches_userid').on(table.userid),
      idxStatus: index('idx_invitationbatches_status').on(table.status),
      idxCreatedat: index('idx_invitationbatches_createdat').on(table.createdat),

      // Unique Constraints
      ukBatchid: uniqueIndex('uk_invitationbatches_batchid').on(table.batchid),
    };
  }
);

export type InvitationBatch = typeof invitationbatches.$inferSelect;
export type InvitationBatchInsert = typeof invitationbatches.$inferInsert;
