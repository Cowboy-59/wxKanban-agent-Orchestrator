import {
  pgTable,
  uuid,
  integer,
  boolean,
  text,
  timestamp,
  numeric,
  varchar,
  index,
  uniqueIndex,
  date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projecttasks } from "./projecttask";
import { companyprojects } from "./companyproject";
import { userprofiles } from "./userprofiles";
import { companies } from "./company";
import { projectphases } from "./projectphase";
import { aispecsessions } from "./aispecsession";
import { projectspecifications } from "./projectspecification"; // [SCOPE 005 / T002]
import { projectinvoices } from "./projectinvoice"; // [SCOPE 005 / T002]

export const projecttimeentries = pgTable(
  "projecttimeentries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // [SCOPE 005 / T002] MODIFIED-BY — nullable since 0072: a Time & Billing entry sits on
    // a scope or project line, not a task. Legacy task-timer entries still set it.
    taskid: uuid("taskid").references(() => projecttasks.id, { onDelete: "cascade" }),
    projectid: uuid("projectid")
      .notNull()
      .references(() => companyprojects.id, { onDelete: "cascade" }),
    userid: uuid("userid")
      .notNull()
      .references(() => userprofiles.id, { onDelete: "cascade" }),
    companyid: uuid("companyid")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    phaseid: uuid("phaseid").references(() => projectphases.id, {
      onDelete: "set null",
    }),
    aispecsessionid: uuid("aispecsessionid").references(() => aispecsessions.id, {
      onDelete: "set null",
    }),
    starttime: timestamp("starttime").notNull(),
    endtime: timestamp("endtime"), // nullable: null = timer still running
    duration: integer("duration"), // minutes; nullable while timer is running
    billable: boolean("billable").default(true).notNull(),
    entryrate: numeric("entryrate", { precision: 10, scale: 2 }), // rate snapshot at creation: user > project > company
    notes: text("notes"),
    completionnotesummary: text("completionnotesummary"),
    source: varchar("source", { length: 20 }).default("manual").notNull(), // 'manual' | 'ai'
    invoiced: boolean("invoiced").default(false).notNull(),
    invoicedat: timestamp("invoicedat"),
    // [SCOPE 005 / T002] BEGIN — Time and Billing entries (FR-005, FR-007, FR-009, FR-011)
    // Declared ONLY after 0072_scope005_time_billing.sql was hand-applied and verified
    // (2026-11-01; SCOPE-117 change log). CHECKs in the DDL enforce the value sets below,
    // that a resource entry has a model, and that a negative duration (a correction) has a note.
    // category NULL = legacy task-timer entry, excluded from Time & Billing and statements.
    specid: uuid("specid").references(() => projectspecifications.id, { onDelete: "set null" }),
    category: varchar("category", { length: 10 }), // 'developer' | 'resource'
    line: varchar("line", { length: 12 }), // 'scope' | 'brainstorm' | 'process'
    model: varchar("model", { length: 100 }), // Resource entries only
    enteredbyid: uuid("enteredbyid").references(() => userprofiles.id, { onDelete: "set null" }),
    // Set = billed on that statement and read-only (FR-011). RESTRICT keeps the statement.
    invoiceid: uuid("invoiceid").references(() => projectinvoices.id, { onDelete: "restrict" }),
    // The day the work counts on. Statements bucket by this, never by the no-tz starttime.
    workdate: date("workdate", { mode: "string" }),
    // Agents behind a Resource entry: distinct runs for an agent pull, 1 for a manual entry.
    resourcecount: integer("resourcecount"),
    // [SCOPE 005 / T002] END
    // [SCOPE 005 / T029] BEGIN — timer Pause/Resume (FR-006 Amendment F). Declared ONLY after
    // 0077_scope005_timer_pause.sql was hand-applied and verified (SCOPE-117 change log).
    pausedat: timestamp("pausedat"), // set while the running timer is paused
    pausedseconds: integer("pausedseconds").default(0).notNull(), // total paused seconds, not billed
    // [SCOPE 005 / T029] END
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    aisessionIdx: index("idx_projecttimeentries_aisession")
      .on(table.aispecsessionid)
      .where(sql`${table.aispecsessionid} IS NOT NULL`),
    // [SCOPE 005 / T002] BEGIN — indexes from 0072
    // FR-007: one agent-pull entry per (company, project, line, scope, day, model). COALESCE because
    // project lines have no specid and PostgreSQL treats NULLs as distinct.
    // MODIFIED-BY: [SCOPE 143 / T027] — companyid leads the key (migration 0076), so a consultant's
    // pull and the client company's own pull on an engaged project never share a row.
    agentpullIdx: uniqueIndex("idx_projecttimeentries_agentpull")
      .on(
        table.companyid,
        table.projectid,
        table.line,
        sql`COALESCE(${table.specid}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        table.workdate,
        table.model,
      )
      .where(sql`${table.source} = 'agentrun'`),
    companyWorkdateIdx: index("idx_projecttimeentries_company_workdate")
      .on(table.companyid, table.workdate)
      .where(sql`${table.category} IS NOT NULL`),
    invoiceIdx: index("idx_projecttimeentries_invoice")
      .on(table.invoiceid)
      .where(sql`${table.invoiceid} IS NOT NULL`),
    // [SCOPE 005 / T002] END
  }),
);

export type ProjectTimeEntry = typeof projecttimeentries.$inferSelect;
export type NewProjectTimeEntry = typeof projecttimeentries.$inferInsert;
