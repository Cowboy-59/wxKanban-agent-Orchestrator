import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  marketingleads,
  type MarketingLead,
} from "../../db/schema/marketingleads.js";
import { notifications } from "../../db/schema/notification.js";
import { userprofiles } from "../../db/schema/userprofiles.js";
import { sendEmail, isValidEmail } from "../lib/email.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("marketing-lead-notification");

// [SCOPE 046 / T003] BEGIN — New-lead notification (best-effort in-app + email)
/**
 * Notify the wxperts team of a newly captured marketing lead and reconcile the
 * notify leg on the source-of-truth row. In-app inbox entries go to every active
 * SYSADMIN; an email goes to MARKETING_NOTIFY_EMAIL when configured (otherwise to
 * the SYSADMIN addresses). Best-effort: success sets notifystatus='sent', any
 * failure sets 'failed' so the lead can be retried later. NEVER throws — a failed
 * notification must not roll back or lose the persisted lead (spec 046 FR-009).
 */
export async function sendNewLeadNotification(
  row: MarketingLead,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ref = row.id.slice(0, 8);
    const message =
      `New ${row.segment} lead (${ref}) from ${row.sourceproperty}: ` +
      `${row.email}${row.company ? ` — ${row.company}` : ""}.`;

    // In-app leg — one inbox entry per active SYSADMIN.
    const admins = await db
      .select({ id: userprofiles.id, emailaddr: userprofiles.emailaddr })
      .from(userprofiles)
      .where(
        and(eq(userprofiles.usertype, "SYSADMIN"), eq(userprofiles.active, true)),
      );

    if (admins.length > 0) {
      await db.insert(notifications).values(
        admins.map((a) => ({
          userid: a.id,
          type: "marketing_lead",
          entityid: row.id,
          entitytype: "marketinglead",
          message,
        })),
      );
    }

    // Email leg — explicit recipient if configured, else the SYSADMIN addresses.
    const configured = process.env.MARKETING_NOTIFY_EMAIL?.trim();
    const recipients = configured
      ? configured.split(",").map((e) => e.trim()).filter((e) => isValidEmail(e))
      : admins.map((a) => a.emailaddr).filter((e) => isValidEmail(e));

    if (recipients.length === 0) {
      throw new Error("no valid marketing-notification recipient");
    }

    const html =
      `<p>${message}</p>` +
      `<ul>` +
      `<li>Email: ${row.email}</li>` +
      (row.name ? `<li>Name: ${row.name}</li>` : "") +
      (row.company ? `<li>Company: ${row.company}</li>` : "") +
      (row.platformfrom ? `<li>Converting from: ${row.platformfrom}</li>` : "") +
      `<li>Segment: ${row.segment} · Source: ${row.sourceproperty} · Locale: ${row.locale}</li>` +
      `</ul>`;

    await sendEmail(recipients.join(","), `[wxKanban] New ${row.segment} lead`, html, message);

    await db
      .update(marketingleads)
      .set({ notifystatus: "sent", updatedat: new Date() })
      .where(eq(marketingleads.id, row.id));

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, leadid: row.id }, "new-lead notification failed");
    // Mark the leg failed; never throw — the lead is already persisted.
    try {
      await db
        .update(marketingleads)
        .set({ notifystatus: "failed", updatedat: new Date() })
        .where(eq(marketingleads.id, row.id));
    } catch (markErr) {
      logger.error({ markErr, leadid: row.id }, "failed to mark notifystatus=failed");
    }
    return { ok: false, error };
  }
}
// [SCOPE 046 / T003] END
