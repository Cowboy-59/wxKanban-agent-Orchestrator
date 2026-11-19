/**
 * Customer welcome message (SCOPE-109 / SPEC-109).
 *
 * One standing message, sent automatically at the two moments a person becomes a
 * customer: subscription activation (FR-005) and invitation acceptance (FR-006).
 *
 * There is exactly ONE code path that sends a welcome — `sendWelcomeTo`. Both
 * triggers, the backfill and retry all call it. Nothing else may send a welcome;
 * that is what stops the dedupe and capacity rules from drifting apart between
 * four callers.
 *
 * Delivery is direct SES (matching the newsletter), which has no queue-level
 * retry or dead-letter net. Two things compensate and are load-bearing rather
 * than polish: the partial unique index (successful sends only) so a transient
 * failure never permanently bars a person, and FR-011 retry.
 */

import { eq, sql } from "drizzle-orm";
import { db, client } from "../db/client.js";
import { welcomemessages } from "../../db/schema/welcomemessages.js";
import {
  welcomesends,
  type WelcomeSendTrigger,
} from "../../db/schema/welcomesends.js";
import { sendNewsletterEmail, newsletterSenderConfigured } from "../lib/ses.js";
import { createLogger } from "../lib/logger.js";
// [SCOPE 109 / T004] Capacity arithmetic lives in a pure shared module so the
// client agrees on "low"/"exhausted" and the boundaries stay unit-testable.
import { capacityView, LOW_CAPACITY_THRESHOLD } from "../../shared/welcome-capacity.js";

const logger = createLogger("welcome-message-service");

export { capacityView, LOW_CAPACITY_THRESHOLD };

/** Review inbox for test sends — same convention as the newsletter (FR-003). */
const REVIEW_TO = process.env["NEWSLETTER_REVIEW_TO"] || "andy@wxperts.com";

/** Why a send did not happen. Recorded, never thrown at the caller. */
export type WelcomeSkipReason =
  | "not_live"
  | "no_capacity"
  | "already_welcomed"
  | "sender_unconfigured"
  | "invalid_email";

export interface WelcomeRecipient {
  userid: string | null;
  email: string;
  name: string | null;
}

export interface SendWelcomeResult {
  sent: boolean;
  skipped?: WelcomeSkipReason;
  error?: string;
}

const VALID_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// [SCOPE 109 / T002] BEGIN — the single standing welcome record
/**
 * Return the one welcome message, creating an empty draft on first access so the
 * authoring surface always has something to edit. The singleton shape is also
 * enforced in the DB by a unique index on a constant expression.
 */
export async function getWelcomeMessage(): Promise<
  typeof welcomemessages.$inferSelect
> {
  const [existing] = await db.select().from(welcomemessages).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(welcomemessages)
    .values({
      subject: "Welcome aboard",
      body: "",
      status: "draft",
      linkcapacity: 0,
      linkconsumed: 0,
    })
    .returning();
  logger.info({ id: created!.id }, "Created the standing welcome message draft");
  return created!;
}

/**
 * Update the standing message. Any content edit returns a live message to draft
 * (FR-001) so a half-written welcome can never be sent by a trigger mid-edit.
 */
export async function updateWelcomeMessage(
  patch: {
    subject?: string;
    body?: string;
    joinlink?: string | null;
    linkcapacity?: number;
  },
  updatedbyid: string | null,
): Promise<typeof welcomemessages.$inferSelect> {
  const current = await getWelcomeMessage();

  const set: Record<string, unknown> = { updatedat: new Date(), updatedbyid };
  if (patch.subject !== undefined) set["subject"] = patch.subject;
  if (patch.body !== undefined) set["body"] = patch.body;
  if (patch.joinlink !== undefined) set["joinlink"] = patch.joinlink;
  if (patch.linkcapacity !== undefined) set["linkcapacity"] = patch.linkcapacity;

  // Editing the message content disarms the triggers until an explicit publish.
  const touchesContent =
    patch.subject !== undefined ||
    patch.body !== undefined ||
    patch.joinlink !== undefined;
  if (touchesContent && current.status === "live") {
    set["status"] = "draft";
    logger.info({ id: current.id }, "Live welcome edited — returned to draft");
  }

  const [updated] = await db
    .update(welcomemessages)
    .set(set)
    .where(eq(welcomemessages.id, current.id))
    .returning();
  return updated!;
}

/** Publish the draft (draft -> live), arming both triggers. */
export async function publishWelcomeMessage(
  updatedbyid: string | null,
): Promise<typeof welcomemessages.$inferSelect> {
  const current = await getWelcomeMessage();
  const [updated] = await db
    .update(welcomemessages)
    .set({
      status: "live",
      publishedat: new Date(),
      updatedat: new Date(),
      updatedbyid,
    })
    .where(eq(welcomemessages.id, current.id))
    .returning();
  logger.info({ id: current.id }, "Welcome message published (live)");
  return updated!;
}

// [SCOPE 109 / T002] END

// [SCOPE 109 / T003] BEGIN — the one send path
/** Wrap the body in the email shell, substituting the join link and first name. */
function renderWelcomeHtml(
  body: string,
  joinlink: string | null,
  name: string | null,
): string {
  const firstName = (name || "").trim().split(/\s+/)[0] || "there";
  const withTokens = body
    .replace(/\{\{\s*firstname\s*\}\}/gi, firstName)
    .replace(/\{\{\s*joinlink\s*\}\}/gi, joinlink || "");
  // Same plain-text-to-HTML treatment the newsletter uses, so a body typed as
  // plain text keeps its line breaks instead of collapsing into one blob.
  const html = /<(p|div|h[1-6]|ul|ol|table|blockquote)\b/i.test(withTokens)
    ? withTokens
    : withTokens
        .replace(/\r\n/g, "\n")
        .split(/\n{2,}/)
        .map((b) => b.trim())
        .filter((b) => b.length > 0)
        .map((b) => `<p style="margin:0 0 16px">${b.replace(/\n/g, "<br>")}</p>`)
        .join("\n");
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.5">
<div style="max-width:640px;margin:0 auto;padding:16px">
${html}
</div></body></html>`;
}

/**
 * Send the welcome to one person, exactly once, ever.
 *
 * Capacity and dedupe are one primitive. In a single transaction we:
 *   1. conditionally claim capacity (`linkconsumed < linkcapacity`), and
 *   2. insert the `welcomesends` row, whose partial unique index rejects a
 *      second SUCCESSFUL welcome for this email.
 * If either rejects, no email is sent. That is what makes this correct when a
 * trigger fires while the backfill is running, without any locking of our own.
 *
 * The row is written as `sent` optimistically inside the transaction because the
 * unique index is what reserves the person; if SES then fails we flip the row to
 * `failed` AND release the capacity claim, so a run of failures cannot silently
 * drain the link. The released row stays `failed`, which the partial index
 * permits, leaving the person retryable (FR-011).
 *
 * Never throws — callers are live billing and onboarding paths (FR-005/FR-006).
 */
export async function sendWelcomeTo(
  recipient: WelcomeRecipient,
  trigger: WelcomeSendTrigger,
): Promise<SendWelcomeResult> {
  try {
    if (!recipient.email || !VALID_EMAIL_RE.test(recipient.email)) {
      return { sent: false, skipped: "invalid_email" };
    }
    if (!newsletterSenderConfigured()) {
      logger.warn("Welcome not sent — SES sender not configured");
      return { sent: false, skipped: "sender_unconfigured" };
    }

    const msg = await getWelcomeMessage();
    if (msg.status !== "live") return { sent: false, skipped: "not_live" };

    // Claim capacity + reserve the person atomically.
    let sendId: string | null = null;
    try {
      sendId = await db.transaction(async (tx) => {
        const claimed = await tx
          .update(welcomemessages)
          .set({ linkconsumed: sql`${welcomemessages.linkconsumed} + 1` })
          .where(
            sql`${welcomemessages.id} = ${msg.id} and ${welcomemessages.linkconsumed} < ${welcomemessages.linkcapacity}`,
          )
          .returning({ id: welcomemessages.id });
        if (claimed.length === 0) throw new CapacityExhausted();

        const [row] = await tx
          .insert(welcomesends)
          .values({
            welcomemessageid: msg.id,
            userid: recipient.userid,
            email: recipient.email,
            status: "sent",
            trigger,
            sentat: new Date(),
          })
          .returning({ id: welcomesends.id });
        return row!.id;
      });
    } catch (e) {
      if (e instanceof CapacityExhausted) {
        logger.warn({ email: recipient.email }, "Welcome blocked — link capacity exhausted");
        return { sent: false, skipped: "no_capacity" };
      }
      // Postgres 23505 = unique_violation, i.e. the partial index rejected a
      // second SUCCESSFUL welcome for this address. Anything else is a real
      // error and must not be mislabelled as "already welcomed" — that would
      // hide a broken send behind a benign-looking skip.
      const code = (e as { code?: string } | null)?.code;
      if (code === "23505") {
        logger.info({ email: recipient.email }, "Welcome skipped — already welcomed");
        return { sent: false, skipped: "already_welcomed" };
      }
      logger.error({ err: e, email: recipient.email }, "Welcome reservation failed");
      return { sent: false, error: e instanceof Error ? e.message : "reserve failed" };
    }

    // Deliver. Failure flips the row and gives the capacity back.
    try {
      await sendNewsletterEmail({
        to: recipient.email,
        subject: msg.subject,
        html: renderWelcomeHtml(msg.body, msg.joinlink, recipient.name),
      });
      logger.info({ email: recipient.email, trigger }, "Welcome sent");
      return { sent: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : "send failed";
      await releaseFailedSend(sendId, msg.id, error);
      logger.error({ email: recipient.email, err }, "Welcome send failed — capacity released");
      return { sent: false, error };
    }
  } catch (err) {
    // Belt and braces: this function is called from live billing/onboarding
    // paths and must never propagate.
    logger.error({ err }, "sendWelcomeTo failed unexpectedly");
    return { sent: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

class CapacityExhausted extends Error {}

/** Flip a reserved row to failed and hand its capacity claim back. */
async function releaseFailedSend(
  sendId: string,
  messageId: string,
  error: string,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(welcomesends)
        .set({ status: "failed", error, sentat: null })
        .where(eq(welcomesends.id, sendId));
      await tx
        .update(welcomemessages)
        .set({ linkconsumed: sql`greatest(0, ${welcomemessages.linkconsumed} - 1)` })
        .where(eq(welcomemessages.id, messageId));
    });
  } catch (err) {
    logger.error({ err, sendId }, "Failed to release capacity for a failed welcome");
  }
}

/** Test send to the review inbox — no capacity consumed, no record written (FR-003). */
export async function sendWelcomeTest(): Promise<void> {
  const msg = await getWelcomeMessage();
  if (!newsletterSenderConfigured()) throw new Error("SES sender not configured");
  await sendNewsletterEmail({
    to: REVIEW_TO,
    subject: `[TEST] ${msg.subject}`,
    html: renderWelcomeHtml(msg.body, msg.joinlink, "Test Recipient"),
  });
  logger.info({ to: REVIEW_TO }, "Welcome test sent");
}
// [SCOPE 109 / T003] END

// [SCOPE 109 / T007] BEGIN — welcome the users of a newly-activated company
/**
 * Welcome the active users of a company whose subscription just went live
 * (FR-005). At first activation that is normally just the signing-up owner, but
 * addressing the set rather than guessing "the" user keeps it correct if a
 * company activates with a team already attached.
 *
 * Never throws: the caller is the Stripe webhook, and a welcome must not be able
 * to fail or delay an activation.
 */
export async function welcomeCompanyUsers(
  companyid: string,
): Promise<void> {
  try {
    const rows = await client<
      { id: string; email: string; name: string | null }[]
    >`
      select id, emailaddr as email, fullname as name
        from userprofiles
       where companyid = ${companyid}
         and active = true
         and emailaddr is not null and emailaddr <> ''
    `;
    for (const r of rows) {
      await sendWelcomeTo(
        { userid: r.id, email: r.email, name: r.name },
        "subscription",
      );
    }
  } catch (err) {
    logger.error({ err, companyid }, "welcomeCompanyUsers failed (non-fatal)");
  }
}
// [SCOPE 109 / T007] END

// [SCOPE 109 / T009] BEGIN — eligibility + backfill population
/**
 * Registered users who have not yet been welcomed (FR-008).
 *
 * Eligibility deliberately excludes users on non-ACTIVE companies: a PENDING
 * company has not paid, and one of them is a deliberate test account — a naive
 * backfill would email it. Deduped case-insensitively so one person on two
 * companies is welcomed once.
 */
export async function getEligibleRecipients(): Promise<WelcomeRecipient[]> {
  const rows = await client<
    { id: string; email: string; name: string | null }[]
  >`
    select distinct on (lower(u.emailaddr))
           u.id, u.emailaddr as email, u.fullname as name
      from userprofiles u
      join companies c on c.id = u.companyid
     where u.active = true
       and c.subscriptionstatus = 'ACTIVE'
       and u.emailaddr is not null and u.emailaddr <> ''
       and u.emailaddr ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
       and u.updatesunsubscribedat is null
       and not exists (
         select 1 from welcomesends w
          where lower(w.email) = lower(u.emailaddr) and w.status = 'sent'
       )
     order by lower(u.emailaddr), u.id
  `;
  return rows.map((r) => ({ userid: r.id, email: r.email, name: r.name }));
}
// [SCOPE 109 / T009] END
