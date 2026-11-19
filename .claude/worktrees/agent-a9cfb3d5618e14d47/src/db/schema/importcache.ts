import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { companies } from "./company.js";

export const importcache = pgTable(
  "importcache",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    sourceuri: text("sourceuri").notNull(),

    companyid: uuid("companyid")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    content: text("content").notNull(),

    contenthash: text("contenthash").notNull(),

    fetchedat: timestamp("fetchedat").defaultNow().notNull(),
  },
  (table) => ({
    sourceuriCompanyidUnique: uniqueIndex("importcache_sourceuri_companyid_uq")
      .on(table.sourceuri, table.companyid),
  }),
);

export type ImportCache = typeof importcache.$inferSelect;
export type NewImportCache = typeof importcache.$inferInsert;
