import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { externalconnections } from "./externalconnection.js";

// [SCOPE 017 / T008] BEGIN — connectionhealth: health-check results over time
/**
 * The result of each health check against a connection. SPEC-017 FR-013.
 *
 * Operational, so it CASCADES from its connection — a health history for a
 * connection that no longer exists answers no question anyone will ask.
 *
 * The current health of a connection is denormalised onto
 * `externalconnections.healthstatus` / `.healthcheckedat` so the dashboard's
 * Connections tile can be answered with one query rather than a correlated
 * subquery per connection. This table is the history behind that value.
 */
export const connectionhealth = pgTable(
  "connectionhealth",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    connectionid: uuid("connectionid")
      .notNull()
      .references(() => externalconnections.id, { onDelete: "cascade" }),

    // 'healthy' | 'warning' | 'error' — note there is no 'unknown' here.
    // 'unknown' is the absence of a check, which is a missing row, not a result.
    status: varchar("status", { length: 20 }).notNull(),
    // 'automatic' (the 15-minute job) | 'manual' ("Test connection")
    checktype: varchar("checktype", { length: 20 }).notNull(),

    responsetimems: integer("responsetimems"),
    errorcode: varchar("errorcode", { length: 100 }),
    errormessage: text("errormessage"),

    checkedat: timestamp("checkedat").defaultNow().notNull(),
  },
  (table) => ({
    connectionidIdx: index("idx_connectionhealth_connectionid").on(table.connectionid),
    checkedatIdx: index("idx_connectionhealth_checkedat").on(table.checkedat),
  }),
);

export type ConnectionHealth = typeof connectionhealth.$inferSelect;
export type NewConnectionHealth = typeof connectionhealth.$inferInsert;
// [SCOPE 017 / T008] END
