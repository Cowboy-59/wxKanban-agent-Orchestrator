// SPEC-143 / FR-002 — agentruns (one row per agent run or command turn).
//
// Applied by hand: specs/143-agent-model-routing-metering/agentruns.sql (2026-10-24) and
// src/db/migrations/0075_scope143_agentruns_company.sql (companyid + route official, applied and
// verified 2026-11-02). Exported from src/db/schema/index.ts since SPEC-143 T024. Declare a new
// column here only after its migration is applied and verified (Drizzle selects every column).
//
// No prompt text, code, file contents or customer data may ever be added to this table.
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { companies } from "./company.js";
import { companyprojects } from "./companyproject.js";
import { aispecsessions } from "./aispecsession.js";
import { projecttasks } from "./projecttask.js";

export const agentruns = pgTable(
  "agentruns",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectid: uuid("projectid")
      .notNull()
      .references(() => companyprojects.id, { onDelete: "cascade" }),
    // [SCOPE 143 / T024] FR-017: the company that bills the run, set by the server from the
    // sending credential; never taken from the record. For an engaged client project this is
    // the consulting company, not the project's owner.
    companyid: uuid("companyid")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    aispecsessionid: uuid("aispecsessionid").references(() => aispecsessions.id, {
      onDelete: "set null",
    }),
    taskid: uuid("taskid").references(() => projecttasks.id, { onDelete: "set null" }),
    command: varchar("command", { length: 100 }),
    kind: varchar("kind", { length: 20 }).notNull(), // session | subagent | command
    difficulty: varchar("difficulty", { length: 20 }), // easy | moderate | heavy | null (unclassified)
    model: varchar("model", { length: 100 }).notNull(),
    provider: varchar("provider", { length: 100 }).notNull(),
    route: varchar("route", { length: 20 }).notNull(), // always official (Amendment A; CHECK narrowed by 0075)
    // Unknown numbers are null, never guessed.
    inputtokens: integer("inputtokens"),
    outputtokens: integer("outputtokens"),
    cachereadtokens: integer("cachereadtokens"),
    cachewritetokens: integer("cachewritetokens"),
    activeseconds: integer("activeseconds"),
    waitingseconds: integer("waitingseconds"),
    escalated: boolean("escalated").default(false).notNull(),
    comparisonid: uuid("comparisonid"),
    variant: varchar("variant", { length: 20 }), // current | candidate | null
    firstpass: boolean("firstpass"), // tests passed on the first cycle
    neverbilled: boolean("neverbilled").default(false).notNull(), // true for every comparison run

    starttime: timestamp("starttime").notNull(),
    endtime: timestamp("endtime"),
    createdat: timestamp("createdat").defaultNow().notNull(),
  },
  (table) => ({
    projectStartIdx: index("idx_agentruns_project_start").on(table.projectid, table.starttime),
    companyStartIdx: index("idx_agentruns_company_start").on(table.companyid, table.starttime),
    aisessionIdx: index("idx_agentruns_aispecsession")
      .on(table.aispecsessionid)
      .where(sql`${table.aispecsessionid} IS NOT NULL`),
  }),
);

export type AgentRun = typeof agentruns.$inferSelect;
export type NewAgentRun = typeof agentruns.$inferInsert;
