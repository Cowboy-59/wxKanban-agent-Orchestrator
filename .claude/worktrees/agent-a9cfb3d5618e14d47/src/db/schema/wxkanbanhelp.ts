import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/**
 * wxKanban Online Help System Table
 * Stores help articles, CLI commands documentation, and user guides
 */
export const wxkanbanhelp = pgTable("wxkanbanhelp", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),

  // Help article categorization
  category: varchar("category", { length: 50 }).notNull(), // 'cli', 'ui', 'api', 'guide', 'faq'
  subcategory: varchar("subcategory", { length: 50 }), // e.g., 'database', 'testing', 'deployment'

  // Content identification
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(), // URL-friendly identifier
  description: varchar("description", { length: 500 }),

  // Content storage
  content: text("content").notNull(), // Markdown content
  contentType: varchar("contenttype", { length: 20 }).notNull().default("markdown"), // 'markdown', 'html', 'text'

  // For CLI commands - structured data
  command: varchar("command", { length: 255 }), // Full command string
  commandAlias: varchar("commandalias", { length: 50 }), // Short alias
  usage: text("usage"), // Usage examples
  arguments: text("arguments"), // JSON array of arguments
  options: text("options"), // JSON array of options
  examples: text("examples"), // JSON array of example commands

  // Metadata
  tags: text("tags"), // JSON array of searchable tags
  relatedTopics: text("relatedtopics"), // JSON array of related help IDs
  prerequisites: text("prerequisites"), // JSON array of prerequisite knowledge

  // Versioning
  version: varchar("version", { length: 20 }).notNull().default("1.0.0"),
  minAppVersion: varchar("minappversion", { length: 20 }), // Minimum wxKanban version
  maxAppVersion: varchar("maxappversion", { length: 20 }), // Maximum wxKanban version (for deprecated features)

  // Status and visibility
  status: varchar("status", { length: 20 }).notNull().default("active"), // 'active', 'draft', 'deprecated', 'archived'
  visibility: varchar("visibility", { length: 20 }).notNull().default("public"), // 'public', 'internal', 'admin'

  // User engagement metrics
  viewCount: integer("viewcount").notNull().default(0),
  helpfulCount: integer("helpfulcount").notNull().default(0),
  notHelpfulCount: integer("nothelpfulcount").notNull().default(0),

  // Search optimization
  searchKeywords: text("searchkeywords"), // Comma-separated keywords for search
  isSearchable: boolean("issearchable").notNull().default(true),

  // [SCOPE 044 / T001] Public landing-page Docs fields. Records with
  // category = 'docs' are surfaced on the public /docs page (Scope 044).
  summary: text("summary"), // Multi-line overview of what the how-to video covers
  videourl: varchar("videourl", { length: 1000 }), // S3 (public-read) video URL; optional
  posterurl: varchar("posterurl", { length: 1000 }), // S3 (public-read) poster image; optional
  sortorder: integer("sortorder").notNull().default(0), // Public docs index ordering

  // Audit timestamps
  createdAt: timestamp("createdat").defaultNow().notNull(),
  updatedAt: timestamp("updatedat").defaultNow().notNull(),
  publishedAt: timestamp("publishedat"), // When made publicly available
  deprecatedAt: timestamp("deprecatedat"), // When marked as deprecated

  // Author information
  createdBy: uuid("createdby"), // Reference to userprofiles
  updatedBy: uuid("updatedby"), // Reference to userprofiles
  reviewedBy: uuid("reviewedby"), // Reference to userprofiles (for approval)
});

export type WxKanbanHelp = typeof wxkanbanhelp.$inferSelect;
export type NewWxKanbanHelp = typeof wxkanbanhelp.$inferInsert;

/**
 * Predefined help categories
 */
export const HelpCategory = {
  CLI: "cli",
  UI: "ui",
  API: "api",
  GUIDE: "guide",
  FAQ: "faq",
  TROUBLESHOOTING: "troubleshooting",
  REFERENCE: "reference",
  DOCS: "docs", // [SCOPE 044 / T001] Public landing-page documentation records
} as const;

export type HelpCategory = typeof HelpCategory[keyof typeof HelpCategory];

/**
 * Help content status values
 */
export const HelpStatus = {
  ACTIVE: "active",
  DRAFT: "draft",
  DEPRECATED: "deprecated",
  ARCHIVED: "archived",
} as const;

export type HelpStatus = typeof HelpStatus[keyof typeof HelpStatus];

/**
 * Help visibility levels
 */
export const HelpVisibility = {
  PUBLIC: "public",
  INTERNAL: "internal",
  ADMIN: "admin",
} as const;

export type HelpVisibility = typeof HelpVisibility[keyof typeof HelpVisibility];
