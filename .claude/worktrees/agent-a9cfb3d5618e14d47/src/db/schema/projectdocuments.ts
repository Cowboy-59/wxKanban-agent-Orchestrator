import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  customType,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});
import { v7 as uuidv7 } from "uuid";
import { companyprojects } from "./companyproject";
import { projectspecifications } from "./projectspecification";
import { userprofiles } from "./userprofiles";


export const projectdocuments = pgTable("projectdocuments", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),

  // Project is always required
  projectid: uuid("projectid")
    .notNull()
    .references(() => companyprojects.id, { onDelete: "cascade" }),


  // Null = project-level doc; set = spec-scoped doc
  specid: uuid("specid").references(() => projectspecifications.id, {

    onDelete: "cascade",
  }),

  // Document type:
  //   Project-level: 'overview', 'readme', 'architecture'
  //   Spec-level:    'spec', 'plan', 'tasks', 'contracts', 'datamodel', 'quickstart', 'checklist'
  doctype: varchar("doctype", { length: 50 }).notNull(),

  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull().default(""),

  // Relative path from project root if this doc is backed by a file on disk
  filepath: varchar("filepath", { length: 500 }),

  // true = AI-generated; false = manually authored
  isgenerated: boolean("isgenerated").notNull().default(false),

  // Rendered PDF bytes (e.g. lifecycle PDF). Null if not yet generated.
  pdfcontent: bytea("pdfcontent"),
  pdfgeneratedat: timestamp("pdfgeneratedat", { withTimezone: true }),

  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
  createdbyid: uuid("createdbyid").references(() => userprofiles.id, {

    onDelete: "set null",
  }),
});

export type ProjectDocument = typeof projectdocuments.$inferSelect;
export type NewProjectDocument = typeof projectdocuments.$inferInsert;
