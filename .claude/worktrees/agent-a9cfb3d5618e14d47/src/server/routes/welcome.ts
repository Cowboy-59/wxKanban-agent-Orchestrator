/**
 * Customer welcome message — SysAdmin API (SCOPE-109 / SPEC-109).
 *
 * Mirrors the newsletter's SysAdmin surface: read/update the standing message,
 * publish it, test-send to the review inbox, see reach, run the one-time
 * backfill, and retry failures. All routes require SYSADMIN.
 */

import { Router, Response } from "express";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { requireSysAdmin } from "../middleware/requireSysAdmin.js";
import { db } from "../db/client.js";
import { welcomesends } from "../../db/schema/welcomesends.js";
import {
  getWelcomeMessage,
  updateWelcomeMessage,
  publishWelcomeMessage,
  sendWelcomeTest,
  getEligibleRecipients,
  sendWelcomeTo,
  capacityView,
  LOW_CAPACITY_THRESHOLD,
} from "../services/WelcomeMessageService.js";
import { newsletterSenderConfigured } from "../lib/ses.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("welcome-routes");
const router = Router();

router.use(authenticateToken);
router.use(requireSysAdmin);

// [SCOPE 109 / T004] BEGIN — SysAdmin welcome-message API

const patchSchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  body: z.string().optional(),
  joinlink: z.string().max(1000).nullable().optional(),
  linkcapacity: z.number().int().min(0).max(1_000_000).optional(),
});

/** Shape returned to the client for the whole surface. */
async function buildView(): Promise<Record<string, unknown>> {
  const msg = await getWelcomeMessage();
  const cap = capacityView(msg);
  const [tallies] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${welcomesends.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${welcomesends.status} = 'failed')::int`,
    })
    .from(welcomesends);
  const eligible = await getEligibleRecipients();
  return {
    id: msg.id,
    subject: msg.subject,
    body: msg.body,
    status: msg.status,
    joinlink: msg.joinlink,
    publishedat: msg.publishedat,
    updatedat: msg.updatedat,
    capacity: cap.capacity,
    consumed: cap.consumed,
    remaining: cap.remaining,
    lowcapacity: cap.low,
    exhausted: cap.exhausted,
    lowthreshold: LOW_CAPACITY_THRESHOLD,
    sentcount: tallies?.sent ?? 0,
    failedcount: tallies?.failed ?? 0,
    eligiblecount: eligible.length,
    senderconfigured: newsletterSenderConfigured(),
    backfill: backfillState,
  };
}

/** GET / — the standing message plus reach, capacity and eligibility. */
router.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json(await buildView());
});

/** PATCH / — edit the standing message (returns a live message to draft). */
router.patch("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
    return;
  }
  await updateWelcomeMessage(parsed.data, req.userid ?? null);
  res.json(await buildView());
});

/** POST /publish — arm the triggers (draft -> live). */
router.post("/publish", async (req: AuthRequest, res: Response): Promise<void> => {
  const msg = await getWelcomeMessage();
  if (!msg.subject.trim() || !msg.body.trim()) {
    res.status(400).json({ error: "Subject and body are required before publishing." });
    return;
  }
  await publishWelcomeMessage(req.userid ?? null);
  res.json(await buildView());
});

/** POST /test — send to the review inbox. No capacity, no record (FR-003). */
router.post("/test", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    await sendWelcomeTest();
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Welcome test send failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Test send failed" });
  }
});

/** GET /sends — per-recipient records, most recent first (FR-010). */
router.get("/sends", async (req: AuthRequest, res: Response): Promise<void> => {
  const onlyFailed = String(req.query["status"] ?? "") === "failed";
  const rows = await db
    .select()
    .from(welcomesends)
    .where(onlyFailed ? eq(welcomesends.status, "failed") : sql`true`)
    .orderBy(desc(welcomesends.createdat))
    .limit(500);
  res.json({ sends: rows });
});
// [SCOPE 109 / T004] END

// [SCOPE 109 / T009] BEGIN — one-time backfill runner
/**
 * In-memory progress for the backfill. A single standing message means at most
 * one run at a time; the `running` flag is the claim that prevents a second.
 */
const backfillState: {
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  stoppedreason: string | null;
  startedat: string | null;
  finishedat: string | null;
} = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  stoppedreason: null,
  startedat: null,
  finishedat: null,
};

const SEND_DELAY_MS = Number(process.env["NEWSLETTER_SEND_DELAY_MS"] ?? 300);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function runBackfill(): Promise<void> {
  const recipients = await getEligibleRecipients();
  backfillState.total = recipients.length;

  for (const r of recipients) {
    const result = await sendWelcomeTo(r, "backfill");
    if (result.sent) backfillState.sent++;
    else if (result.skipped === "no_capacity") {
      // Stop cleanly rather than grinding through the rest (FR-009).
      backfillState.stoppedreason = "Link capacity exhausted";
      break;
    } else if (result.skipped) backfillState.skipped++;
    else backfillState.failed++;
    await sleep(SEND_DELAY_MS);
  }

  backfillState.running = false;
  backfillState.finishedat = new Date().toISOString();
  logger.info({ ...backfillState }, "Welcome backfill finished");
}

/** POST /backfill — start the one-time catch-up run (FR-008). */
router.post("/backfill", async (_req: AuthRequest, res: Response): Promise<void> => {
  if (backfillState.running) {
    res.status(409).json({ error: "A backfill is already running." });
    return;
  }
  const msg = await getWelcomeMessage();
  if (msg.status !== "live") {
    res.status(400).json({ error: "Publish the welcome message before running a backfill." });
    return;
  }
  Object.assign(backfillState, {
    running: true,
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    stoppedreason: null,
    startedat: new Date().toISOString(),
    finishedat: null,
  });
  void runBackfill().catch((err) => {
    backfillState.running = false;
    backfillState.stoppedreason = err instanceof Error ? err.message : "run failed";
    logger.error({ err }, "Welcome backfill crashed");
  });
  res.status(202).json({ started: true });
});
// [SCOPE 109 / T009] END

// [SCOPE 109 / T010] BEGIN — retry failed sends
/**
 * POST /retry — re-attempt failed recipients (FR-011).
 *
 * Only `failed` rows are targeted, so a success can never be re-sent. The old
 * failed row is removed first: the partial unique index permits many failed rows,
 * and leaving them would make the failed tally grow on every retry attempt.
 */
router.post("/retry", async (req: AuthRequest, res: Response): Promise<void> => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : null;
  const msg = await getWelcomeMessage();
  if (msg.status !== "live") {
    res.status(400).json({ error: "The welcome message must be live to retry." });
    return;
  }

  // FR-011: refuse up front when there is nothing left to spend, rather than
  // discovering it partway and half-processing the list.
  if (capacityView(msg).exhausted) {
    res.status(400).json({ error: "Link capacity is exhausted — raise it or replace the link before retrying." });
    return;
  }

  const failed = await db
    .select()
    .from(welcomesends)
    .where(eq(welcomesends.status, "failed"))
    .limit(500);
  const targets = ids ? failed.filter((f) => ids.includes(f.id)) : failed;

  let sent = 0;
  let stillFailed = 0;
  let stoppedreason: string | null = null;

  for (const t of targets) {
    // Remove the old failed row first so a successful retry leaves exactly one
    // record and the failed tally does not inflate on every attempt.
    await db.delete(welcomesends).where(eq(welcomesends.id, t.id));
    const result = await sendWelcomeTo(
      { userid: t.userid, email: t.email, name: null },
      "retry",
    );

    if (result.sent) {
      sent++;
    } else if (result.skipped) {
      // A SKIP writes no row of its own (the send never got as far as reserving),
      // so restoring the row we just deleted is what stops this person's failure
      // record from disappearing entirely.
      await db.insert(welcomesends).values({
        welcomemessageid: t.welcomemessageid,
        userid: t.userid,
        email: t.email,
        status: "failed",
        error: `retry skipped: ${result.skipped}`,
        trigger: t.trigger,
      });
      stillFailed++;
      if (result.skipped === "no_capacity") {
        stoppedreason = "Link capacity exhausted";
        break;
      }
    } else {
      // A post-reservation failure already wrote its own fresh failed row.
      stillFailed++;
    }
    await sleep(SEND_DELAY_MS);
  }

  logger.info({ sent, stillFailed, stoppedreason }, "Welcome retry finished");
  res.json({ sent, stillFailed, stoppedreason });
});
// [SCOPE 109 / T010] END

export default router;
