import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  date,
  timestamp,
  customType,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { userprofiles } from "./userprofiles";


// Custom tsvector type for full-text search
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// Custom bytea type for storing rendered PDF bytes (e.g. the Database ER Diagram PDF).
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Master document store for compliance framework documents and audit reports.
 * Stores SOC2, HIPAA, HITRUST, GDPR documents and generated audit reports.
 * All documents are tamper-evident via SHA-256 hash.
 * Full-text search enabled via PostgreSQL tsvector/GIN index.
 */
export const wxkanbandocuments = pgTable("wxkanbandocuments", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),

  // Document classification
  // 'compliance_framework' | 'audit_report' | 'policy' | 'procedure'
  documenttype: varchar("documenttype", { length: 50 }).notNull(),

  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  filename: varchar("filename", { length: 255 }),

  // Full document content (markdown or plain text)
  filecontent: text("filecontent"),

  // SHA-256 hash of filecontent for tamper detection
  filehash: varchar("filehash", { length: 64 }),

  // Compliance framework: 'SOC2' | 'HIPAA' | 'HITRUST' | 'GDPR' | null (general)
  framework: varchar("framework", { length: 50 }),

  version: varchar("version", { length: 20 }),
  effectivedate: date("effectivedate"),

  // 'active' | 'superseded' | 'draft'
  status: varchar("status", { length: 20 }).notNull().default("active"),

  // Count of compliance tasks extracted from this document
  extractedtasks: integer("extractedtasks").notNull().default(0),

  createdby: uuid("createdby").references(() => userprofiles.id, { onDelete: "set null" }),

  // [SCOPE 021 / T010] Rendered PDF bytes for generated docs (Database ER Diagram). Null until generated.
  pdfcontent: bytea("pdfcontent"),
  pdfgeneratedat: timestamp("pdfgeneratedat", { withTimezone: true }),

  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),

  // PostgreSQL full-text search vector (updated via trigger or on write)
  fulltextsearch: tsvector("fulltextsearch"),
});

export type WxKanbanDocument = typeof wxkanbandocuments.$inferSelect;
export type NewWxKanbanDocument = typeof wxkanbandocuments.$inferInsert;
