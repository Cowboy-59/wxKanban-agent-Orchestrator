import { sql, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { marketinglinks } from "../../db/schema/marketinglinks.js";
import { marketinglinkclicks } from "../../db/schema/marketinglinkclicks.js";
import { createLogger } from "./logger.js";

const logger = createLogger("banner-click-writer");

// [SCOPE 070 / T002] BEGIN — batched click writer (keeps /r/:code off the per-click DB path)
// /r/:code is the launch hot path. Awaiting a DB insert per click would open a connection
// per redirect and risk a storm against the postgres-js pool / RDS db.t3.small ~200-conn
// ceiling. Instead clicks land in an in-memory buffer and are flushed in batches: a short
// unref'd timer, an opportunistic drain at the start of the next redirect (App Runner CPU-
// throttles AFTER the response, so true fire-and-forget would drop writes — the SCOPE-043
// lesson), and a final flush on shutdown. A flush is one multi-row INSERT plus one atomic
// counter UPDATE per affected link (counted clicks only).
export interface PendingClick {
  linkid: string;
  iphash: string | null;
  uaclass: string;
  referrer: string | null;
  counted: boolean;
}

const buffer: PendingClick[] = [];
const FLUSH_INTERVAL_MS = 2000;
const MAX_BUFFER = 500;
let flushTimer: NodeJS.Timeout | null = null;
let flushing = false;
let shutdownHooked = false;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushClicks();
  }, FLUSH_INTERVAL_MS);
  // Don't keep the event loop alive solely to flush.
  if (typeof flushTimer.unref === "function") flushTimer.unref();
}

export function enqueueClick(c: PendingClick): void {
  buffer.push(c);
  ensureShutdownFlush();
  if (buffer.length >= MAX_BUFFER) {
    void flushClicks();
    return;
  }
  scheduleFlush();
}

/** Drain the buffer: one INSERT for the rows + one atomic counter bump per link. */
export async function flushClicks(): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer.splice(0, buffer.length);
  try {
    await db.insert(marketinglinkclicks).values(
      batch.map((c) => ({
        linkid: c.linkid,
        iphash: c.iphash,
        uaclass: c.uaclass,
        referrer: c.referrer,
        counted: c.counted,
      })),
    );
    // Aggregate counted clicks per link, then one atomic increment each.
    const counts = new Map<string, number>();
    for (const c of batch) {
      if (c.counted) counts.set(c.linkid, (counts.get(c.linkid) ?? 0) + 1);
    }
    for (const [linkid, delta] of counts) {
      await db
        .update(marketinglinks)
        .set({ clickcount: sql`${marketinglinks.clickcount} + ${delta}` })
        .where(eq(marketinglinks.id, linkid));
    }
  } catch (err) {
    // Best-effort: a failed flush drops that batch rather than blocking redirects.
    logger.error({ err, dropped: batch.length }, "click flush failed");
  } finally {
    flushing = false;
    if (buffer.length > 0) scheduleFlush();
  }
}

/** Register a one-time shutdown flush so the last buffered clicks aren't lost. */
export function ensureShutdownFlush(): void {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const onExit = (): void => {
    void flushClicks();
  };
  process.once("SIGTERM", onExit);
  process.once("SIGINT", onExit);
  process.once("beforeExit", onExit);
}
// [SCOPE 070 / T002] END
