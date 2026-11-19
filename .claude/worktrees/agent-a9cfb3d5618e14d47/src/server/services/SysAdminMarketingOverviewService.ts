/**
 * SysAdmin Marketing Overview (spec 064 / Phase A)
 *
 * A read-only rollup of the marketing work done so far. Every source is computed
 * in its own try/catch so one failing query degrades that metric to `null` rather
 * than 500-ing the whole page (fail-open — the spec 043 resilience pattern).
 *
 * Audience comes from `marketingcontacts` (same app Postgres, no Drizzle schema —
 * queried with the raw postgres-js client), reusing the dedupe/invalid-email
 * idioms proven in marketing/site/deploy/lambda/{count-check,send-customer-announce}.mjs.
 * Funnel + module counts come from the app marketing tables. Engagement/clicks
 * (DynamoDB) are deferred — surfaced as a placeholder, never queried here.
 */

import { client } from "../db/client.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("marketing-overview-service");

// The valid-email regex the Lambda scripts use to drop malformed imports. Escaped
// for a JS string → Postgres sees `^[^@\s]+@[^@\s]+\.[^@\s]+$`.
const VALID_EMAIL_RE = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";

const WINDEV_SITE_URL = "https://windev.wxperts.com";

export interface KeyCount {
  key: string;
  count: number;
}

export interface MarketingOverview {
  audience: {
    total: number;
    distinctEmails: number;
    duplicateEmails: number;
    handsOnCohort: number;
    invalidOrBlank: number;
    bySignuplist: KeyCount[];
  } | null;
  leads: { total: number; byStatus: KeyCount[]; bySegment: KeyCount[] } | null;
  campaigns: { total: number; byStatus: KeyCount[] } | null;
  assets: { total: number; byType: KeyCount[]; byStatus: KeyCount[] } | null;
  posts: {
    total: number;
    upcomingScheduled: number;
    byChannel: KeyCount[];
    byStatus: KeyCount[];
  } | null;
  // [SCOPE 070 / T005] tracked-link clicks rollup (replaces the deferred engagement placeholder)
  links: {
    total: number;
    totalClicks: number;
    top: Array<{ code: string; clickcount: number; destinationurl: string }>;
  } | null;
  channels: {
    windevSiteUrl: string;
    windevSiteLive: boolean;
    landingDocsCount: number | null;
    engagementTracking: "deferred" | "links";
  };
  generatedAt: string;
}

// [SCOPE 064 / T001] BEGIN — fail-open marketing overview aggregation
// MODIFIED-BY [SCOPE 070 / T005] — added the tracked-link clicks rollup (links)
/** Run a metric query, logging and returning `fallback` on any failure (fail-open). */
async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.error({ err, metric: label }, "marketing overview sub-query failed (degrading to null)");
    return fallback;
  }
}

async function audience(): Promise<MarketingOverview["audience"]> {
  return safe(
    "audience",
    async () => {
      const [totals] = await client<
        { total: number; distinctemails: number; handson: number; invalid: number }[]
      >`
        select
          count(*)::int as total,
          count(distinct lower(email))::int as distinctemails,
          count(*) filter (where wantshandson)::int as handson,
          count(*) filter (
            where email is null or email = '' or email !~ ${VALID_EMAIL_RE}
          )::int as invalid
        from marketingcontacts
      `;
      const bySignuplist = await client<{ key: string; count: number }[]>`
        select coalesce(signuplist, '(none)') as key, count(*)::int as count
        from marketingcontacts
        group by signuplist
        order by count desc
      `;
      return {
        total: totals.total,
        distinctEmails: totals.distinctemails,
        duplicateEmails: Math.max(0, totals.total - totals.distinctemails),
        handsOnCohort: totals.handson,
        invalidOrBlank: totals.invalid,
        bySignuplist: bySignuplist.map((r) => ({ key: r.key, count: r.count })),
      };
    },
    null,
  );
}

async function groupCounts(table: string, column: string): Promise<KeyCount[]> {
  // table/column are internal literals (never user input) — safe to interpolate
  // via client.unsafe for the dynamic identifier.
  const rows = await client.unsafe<{ key: string; count: number }[]>(
    `select coalesce(${column}::text, '(none)') as key, count(*)::int as count
       from ${table} group by ${column} order by count desc`,
  );
  return rows.map((r) => ({ key: r.key, count: r.count }));
}

async function leads(): Promise<MarketingOverview["leads"]> {
  return safe(
    "leads",
    async () => {
      const [byStatus, bySegment] = await Promise.all([
        groupCounts("marketingleads", "status"),
        groupCounts("marketingleads", "segment"),
      ]);
      const total = byStatus.reduce((n, r) => n + r.count, 0);
      return { total, byStatus, bySegment };
    },
    null,
  );
}

async function campaignsRollup(): Promise<MarketingOverview["campaigns"]> {
  return safe(
    "campaigns",
    async () => {
      const byStatus = await groupCounts("campaigns", "status");
      return { total: byStatus.reduce((n, r) => n + r.count, 0), byStatus };
    },
    null,
  );
}

async function assetsRollup(): Promise<MarketingOverview["assets"]> {
  return safe(
    "assets",
    async () => {
      const [byType, byStatus] = await Promise.all([
        groupCounts("marketingassets", "type"),
        groupCounts("marketingassets", "status"),
      ]);
      return { total: byStatus.reduce((n, r) => n + r.count, 0), byType, byStatus };
    },
    null,
  );
}

async function postsRollup(): Promise<MarketingOverview["posts"]> {
  return safe(
    "posts",
    async () => {
      const [byChannel, byStatus] = await Promise.all([
        groupCounts("campaignposts", "channel"),
        groupCounts("campaignposts", "status"),
      ]);
      const [up] = await client<{ count: number }[]>`
        select count(*)::int as count from campaignposts
        where status = 'scheduled' and scheduledat is not null and scheduledat > now()
      `;
      return {
        total: byStatus.reduce((n, r) => n + r.count, 0),
        upcomingScheduled: up?.count ?? 0,
        byChannel,
        byStatus,
      };
    },
    null,
  );
}

async function landingDocsCount(): Promise<number | null> {
  return safe(
    "landingDocs",
    async () => {
      const [row] = await client<{ count: number }[]>`
        select count(*)::int as count from wxkanbanhelp where category = 'docs'
      `;
      return row?.count ?? 0;
    },
    null,
  );
}

// [SCOPE 070 / T005] tracked-link clicks rollup — reads the denormalized clickcount
// counter (never COUNT(*) over click rows), so the dashboard read stays O(1).
async function linksRollup(): Promise<MarketingOverview["links"]> {
  return safe(
    "links",
    async () => {
      const [totals] = await client<{ total: number; totalclicks: number }[]>`
        select count(*)::int as total, coalesce(sum(clickcount), 0)::int as totalclicks
        from marketinglinks where status = 'active'
      `;
      const top = await client<
        { code: string; clickcount: number; destinationurl: string }[]
      >`
        select code, clickcount, destinationurl from marketinglinks
        where status = 'active' order by clickcount desc limit 5
      `;
      return {
        total: totals?.total ?? 0,
        totalClicks: totals?.totalclicks ?? 0,
        top: top.map((r) => ({
          code: r.code,
          clickcount: r.clickcount,
          destinationurl: r.destinationurl,
        })),
      };
    },
    null,
  );
}

/** Assemble the full read-only marketing rollup. Never throws — fields fail-open to null. */
export async function getMarketingOverview(): Promise<MarketingOverview> {
  const [aud, lds, cmp, ast, pst, lnk, docs] = await Promise.all([
    audience(),
    leads(),
    campaignsRollup(),
    assetsRollup(),
    postsRollup(),
    linksRollup(),
    landingDocsCount(),
  ]);

  return {
    audience: aud,
    leads: lds,
    campaigns: cmp,
    assets: ast,
    posts: pst,
    links: lnk,
    channels: {
      windevSiteUrl: WINDEV_SITE_URL,
      windevSiteLive: true,
      landingDocsCount: docs,
      engagementTracking: lnk ? "links" : "deferred",
    },
    generatedAt: new Date().toISOString(),
  };
}
// [SCOPE 064 / T001] END
