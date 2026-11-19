import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

// [SCOPE 078 / T002] BEGIN — infrahealthchecks table (Infrastructure Health Monitor)
// One row per check key, UPSERTED every monitor run (current-state model, not an append
// log). The four v1 checks (connection headroom, memory+CPU, storage, App Runner instance
// ceiling vs connection budget) each keep exactly one row; the sysadmin dashboard reads
// non-ok rows urgent-first plus an overall "last checked" derived from max(evaluatedat).
export const infrahealthchecks = pgTable(
  "infrahealthchecks",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // stable rule identifier (e.g. rds-connection-headroom) — unique, drives idempotent upsert
    checkkey: varchar("checkkey", { length: 64 }).notNull().unique(),
    // what was measured, e.g. rds:wxkanban or apprunner:wxKanban — lets a check kind cover
    // multiple resources later without a schema change
    resource: varchar("resource", { length: 128 }).notNull(),
    status: varchar("status", { length: 10 }).notNull(), // ok | caution | urgent
    title: varchar("title", { length: 200 }).notNull(),
    detail: text("detail"), // live numbers in words ("connections 176 of 1500, 12%")
    solution: text("solution"), // remediation + command/config change; null when ok
    // raw numbers + thresholds applied, for transparency and a future trends feature
    readings: jsonb("readings").$type<Record<string, unknown>>(),
    evaluatedat: timestamp("evaluatedat").defaultNow().notNull(), // drives stale-monitor flag
    createdat: timestamp("createdat").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("idx_infrahealthchecks_status").on(table.status),
    evaluatedatIdx: index("idx_infrahealthchecks_evaluatedat").on(
      table.evaluatedat,
    ),
  }),
);
// [SCOPE 078 / T002] END

export type InfraHealthCheck = typeof infrahealthchecks.$inferSelect;
export type NewInfraHealthCheck = typeof infrahealthchecks.$inferInsert;
