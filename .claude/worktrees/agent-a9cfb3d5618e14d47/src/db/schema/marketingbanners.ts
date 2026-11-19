import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { companies } from "./company";
import { campaigns } from "./campaigns";
import { marketinglinks } from "./marketinglinks";

// [SCOPE 070 / T001] BEGIN — marketingbanners table (Banner Studio: AI-composited clickable banner)
// MODIFIED-BY: [SCOPE 070 / Amendment-B] — v2 rich-overlay columns (eyebrow, multi-line
// accent headline, badge, bullets, CTA url, overlay anchor) + AI background version history
// MODIFIED-BY: [SCOPE 070 / Amendment-D] — overlaylayout (per-element drag/resize overrides)
// A promotional banner: an AI-generated background (`backgroundurl`) plus a brand
// overlay composited to a PNG (`renderedurl`, a versioned key so re-renders never serve
// a stale cache) at a frozen size preset. `linkid` points at the tracked marketinglinks
// row behind /r/:code. `frames` is the Phase-2 transition hook (empty in Phase 1).
// Published banners are served on-site by (targetsegment, slot).
export const marketingbanners = pgTable(
  "marketingbanners",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    companyid: uuid("companyid").references(() => companies.id, {
      onDelete: "cascade",
    }),
    campaignid: uuid("campaignid").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    linkid: uuid("linkid").references(() => marketinglinks.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    sizepreset: varchar("sizepreset", { length: 20 }).notNull(), // og|mrec|leaderboard|skyscraper|halfpage|mobile
    width: integer("width").notNull(), // frozen from the preset at create
    height: integer("height").notNull(),
    layout: varchar("layout", { length: 20 }).notNull(), // hero|horizontal|vertical (overlay archetype)
    prompt: text("prompt"), // AI background prompt
    headline: varchar("headline", { length: 255 }),
    subhead: varchar("subhead", { length: 500 }),
    ctatext: varchar("ctatext", { length: 80 }),
    // [SCOPE 070 / Amendment-B] v2 rich-overlay fields (all optional; renderer falls back
    // to the single `headline` when `headlinesegments` is null → v1 banners unchanged).
    eyebrow: varchar("eyebrow", { length: 255 }), // small label above the headline
    headlinesegments: jsonb("headlinesegments"), // [{ text, accent }] ordered lines (multi-line + per-line accent)
    badge: varchar("badge", { length: 120 }), // pill text, e.g. "★ COMING JULY 5TH"
    bulletslabel: varchar("bulletslabel", { length: 120 }), // e.g. "Full conversion:"
    bullets: jsonb("bullets"), // string[] feature lines
    ctaurl: varchar("ctaurl", { length: 200 }), // plain URL shown beside the CTA (display only; click target is /r/:code)
    overlayanchor: varchar("overlayanchor", { length: 20 }), // left-center|left-bottom|center|... (text-stack position)
    // [SCOPE 070 / Amendment-D] per-element absolute overrides from the drag/resize editor:
    // { [key]: { x, y, scale } } where x,y are 0..1 fractions of (width,height) of the
    // element's top-left, and scale multiplies its auto font size (logo height for the logo).
    // When present the renderer positions every element absolutely; null → auto-stack layout.
    overlaylayout: jsonb("overlaylayout"),
    brandtokens: jsonb("brandtokens"), // per-banner colour/font overrides (defaults from banner-brand)
    backgroundurl: varchar("backgroundurl", { length: 1000 }), // CloudFront URL of the AI background (active version)
    bgversions: jsonb("bgversions"), // [{ url, kind: 'generate'|'edit', instruction?, createdat }] history
    renderedurl: varchar("renderedurl", { length: 1000 }), // CloudFront URL of the composited PNG (versioned)
    frames: jsonb("frames"), // Phase-2 transition frames; [] in Phase 1
    status: varchar("status", { length: 20 }).default("draft").notNull(), // draft|published|archived
    targetsegment: varchar("targetsegment", { length: 20 }), // windev|careerchanger|broad
    slot: varchar("slot", { length: 40 }), // named on-site placement
    createdbyid: uuid("createdbyid"),
    createdat: timestamp("createdat").defaultNow().notNull(),
    updatedat: timestamp("updatedat").defaultNow().notNull(),
  },
  (table) => ({
    campaignidIdx: index("idx_marketingbanners_campaignid").on(
      table.campaignid,
    ),
    statusIdx: index("idx_marketingbanners_status").on(table.status),
    segmentSlotIdx: index("idx_marketingbanners_segment_slot").on(
      table.targetsegment,
      table.slot,
    ),
  }),
);
// [SCOPE 070 / T001] END

export type MarketingBanner = typeof marketingbanners.$inferSelect;
export type NewMarketingBanner = typeof marketingbanners.$inferInsert;
