import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { userprofiles } from "./userprofiles.js";
import { externalconnections } from "./externalconnection.js";

// [SCOPE 017 / T007] BEGIN — synchistory: operational record of sync runs
/**
 * A record of each sync run against a connection. SPEC-017 FR-011.
 *
 * This CASCADES from its connection, unlike `credentialauditlogs` — deliberately.
 * Sync history is operational telemetry, not an audit trail: it answers "did the
 * last sync work and what did it move", which is meaningless once the connection
 * is gone. Credential ACCESS during a sync is recorded separately in
 * `credentialauditlogs`, which survives.
 *
 * `triggeredby` is SET NULL rather than CASCADE so deleting a user does not erase
 * the record that a sync happened.
 */
export const synchistory = pgTable(
  "synchistory",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    connectionid: uuid("connectionid")
      .notNull()
      .references(() => externalconnections.id, { onDelete: "cascade" }),

    triggeredby: uuid("triggeredby").references(() => userprofiles.id, {
      onDelete: "set null",
    }),

    // 'incremental' | 'full' | 'automatic'
    synctype: varchar("synctype", { length: 20 }).notNull(),
    // 'pending' | 'running' | 'completed' | 'failed'
    status: varchar("status", { length: 20 }).notNull(),

    startedat: timestamp("startedat").defaultNow().notNull(),
    completedat: timestamp("completedat"),

    itemsprocessed: integer("itemsprocessed").default(0).notNull(),
    itemsadded: integer("itemsadded").default(0).notNull(),
    itemsupdated: integer("itemsupdated").default(0).notNull(),
    itemsfailed: integer("itemsfailed").default(0).notNull(),

    errormessage: text("errormessage"),
    syncresult: jsonb("syncresult"),
  },
  (table) => ({
    connectionidIdx: index("idx_synchistory_connectionid").on(table.connectionid),
    statusIdx: index("idx_synchistory_status").on(table.status),
    startedatIdx: index("idx_synchistory_startedat").on(table.startedat),
  }),
);

export type SyncHistory = typeof synchistory.$inferSelect;
export type NewSyncHistory = typeof synchistory.$inferInsert;
// [SCOPE 017 / T007] END
