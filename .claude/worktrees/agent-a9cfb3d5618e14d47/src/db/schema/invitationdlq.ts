/**
 * Invitation Dead-Letter Queue (DLQ) Schema
 * Captures failed invitation batches for manual review
 *
 * Purpose: Store failed jobs after all retry attempts exhausted
 * Used for: Post-mortem analysis, manual retry, debugging
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { desc } from 'drizzle-orm';
import { invitationbatches } from './invitationbatch';

/**
 * invitationdlqs (Dead-Letter Queue)
 *
 * When an invitation batch fails after 5 retry attempts:
 * 1. Job is moved to BullMQ DLQ
 * 2. Record inserted here with full job data + error
 * 3. Admin can review and manually retry
 */
export const invitationdlqs = pgTable(
  'invitationdlqs',
  {
    // Primary Key
    dlqid: uuid('dlqid').primaryKey().defaultRandom(),

    // Foreign Key (references batch that failed)
    batchid: uuid('batchid').notNull(),

    // Job Data (JSON stringified for debugging)
    jobdata: text('jobdata').notNull(),
    // Example content:
    // {
    //   "projectId": "...",
    //   "batchId": "...",
    //   "invitations": [
    //     { "email": "alice@example.com", "role": "member" }
    //   ],
    //   "chunkIndex": 0,
    //   "totalChunks": 3
    // }

    // Error Information
    error: text('error').notNull(),
    // Example: "5/10 invitations failed: alice@example.com, bob@example.com"

    // Timestamps
    createdat: timestamp('createdat').notNull().defaultNow(),
    // When this DLQ entry was created (failure time)
  },
  (table) => {
    return {
      // Foreign Key Constraint
      fkBatch: foreignKey({
        columns: [table.batchid],
        foreignColumns: [invitationbatches.batchid],
      }).onDelete('cascade'),

      // Indexes for Common Queries
      idxBatchid: index('idx_invitationdlqs_batchid').on(table.batchid),
      idxCreatedat: index('idx_invitationdlqs_createdat').on(table.createdat),
      // Index for "show recent failures" query
      idxCreatedatDesc: index('idx_invitationdlqs_createdat_desc')
        .on(desc(table.createdat)),
    };
  }
);

export type InvitationDLQ = typeof invitationdlqs.$inferSelect;
export type InvitationDLQInsert = typeof invitationdlqs.$inferInsert;
