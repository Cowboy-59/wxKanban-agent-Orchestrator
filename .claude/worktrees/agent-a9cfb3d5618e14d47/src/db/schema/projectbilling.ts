/**
 * Project billings — a consulting company's billing settings for a client project it is
 * engaged on. SPEC-005 Amendment B, FR-014 / T022. Migration 0073 (applied 2026-11-02).
 *
 * A company bills its OWN projects through companyprojects.billed / hourlyrate / resourcerate.
 * A CLIENT's project belongs to the client: the consultant never writes that row, and the
 * client never sees the consultant's billing state. This table holds the consultant's side,
 * one row per (billing company, project).
 */

import { pgTable, uuid, boolean, numeric, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './company.js';
import { companyprojects } from './companyproject.js';
import { customers } from './customer.js';
import { userprofiles } from './userprofiles.js';

// [SCOPE 005 / T022] BEGIN — `projectbillings` Drizzle schema (FR-014)
export const projectbillings = pgTable(
  'projectbillings',
  {
    id: uuid('id').primaryKey().defaultRandom(), // the app writes UUID v7
    /** The BILLING (consulting) company, not the project's owner. */
    companyid: uuid('companyid')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    projectid: uuid('projectid')
      .notNull()
      .references(() => companyprojects.id, { onDelete: 'cascade' }),
    /** A Customer of companyid; pre-filled from customers.clientcompanyid. */
    customerid: uuid('customerid').references(() => customers.id, { onDelete: 'set null' }),
    billed: boolean('billed').notNull().default(false),
    /** Developer rate override; NULL = the billing company's default. */
    hourlyrate: numeric('hourlyrate', { precision: 10, scale: 2 }),
    /** Resource rate override; NULL = the billing company's default. */
    resourcerate: numeric('resourcerate', { precision: 10, scale: 2 }),
    updatedbyid: uuid('updatedbyid').references(() => userprofiles.id, { onDelete: 'set null' }),
    createdat: timestamp('createdat', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
    updatedat: timestamp('updatedat', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
  },
  (table) => ({
    companyProjectKey: uniqueIndex('projectbillings_company_project_key').on(table.companyid, table.projectid),
    projectidIdx: index('projectbillings_projectid_idx').on(table.projectid),
  }),
);
// [SCOPE 005 / T022] END

export type ProjectBilling = typeof projectbillings.$inferSelect;
export type NewProjectBilling = typeof projectbillings.$inferInsert;
