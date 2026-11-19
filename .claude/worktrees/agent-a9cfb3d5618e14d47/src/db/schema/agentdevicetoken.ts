/**
 * K.A.I.N. device tokens — one K.A.I.N. sign-in per person and device.
 * SPEC-152 / T003 (SCOPE-132 Amendment F, FR-065). Applied by hand:
 * specs/152-kain-signin-agent-reach/sql/0001-agentdevicetokens.sql.
 *
 * K.A.I.N. signs in with the person's own wxKanban email and password; the password is never
 * stored. Only the device token's SHA-256 lives here. Rows are revoked, never deleted.
 */

import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { userprofiles } from './userprofiles.js';
import { companies } from './company.js';

// [SCOPE 152 / T003] BEGIN — `agentdevicetokens` Drizzle schema
export const agentdevicetokens = pgTable(
  'agentdevicetokens',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userid: uuid('userid')
      .notNull()
      .references(() => userprofiles.id, { onDelete: 'cascade' }),
    companyid: uuid('companyid')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    devicename: varchar('devicename', { length: 100 }).notNull(),
    tokenhash: varchar('tokenhash', { length: 64 }).notNull(),
    createdat: timestamp('createdat', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
    lastusedat: timestamp('lastusedat', { withTimezone: true, mode: 'date' }),
    revokedat: timestamp('revokedat', { withTimezone: true, mode: 'date' }),
    revokedbyid: uuid('revokedbyid'),
    revokereason: varchar('revokereason', { length: 32 }), // revoked | replaced | password_changed; null while live
  },
  (table) => ({
    tokenhashKey: uniqueIndex('agentdevicetokens_tokenhash_key').on(table.tokenhash),
    userDeviceLiveKey: uniqueIndex('agentdevicetokens_user_device_live_key')
      .on(table.userid, table.devicename)
      .where(sql`${table.revokedat} IS NULL`),
    companyIdx: index('idx_agentdevicetokens_company').on(table.companyid, table.createdat),
  }),
);
// [SCOPE 152 / T003] END

export type AgentDeviceToken = typeof agentdevicetokens.$inferSelect;
export type NewAgentDeviceToken = typeof agentdevicetokens.$inferInsert;
