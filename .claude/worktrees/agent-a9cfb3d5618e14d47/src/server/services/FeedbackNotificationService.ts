import { eq } from "drizzle-orm";
import { db } from "~/db/client.js";
import { feedbacksubmissions, type FeedbackSubmission } from "~/db/schema/feedbacksubmissions.js";
import { notifications } from "~/db/schema/notification.js";
import { userprofiles } from "~/db/schema/userprofiles.js";
import { sendEmail, isValidEmail } from "~/server/lib/email.js";
import { logger } from "~/server/lib/logger.js";

// Submitter-facing message for the current row state. The in-app inbox always
// gets one; email is sent only when the submitter chose the 'email' channel.
// SMS + the AI-assistant channel are reserved for v2.
// [SCOPE 043 / T008] BEGIN — Notification channels (in-app + email) with pending + retry
// MODIFIED-BY: [SCOPE 110 / T004] — regression message for reopened auto-errors
// MODIFIED-BY: [SCOPE 148 / T005] — the triaged wording (FR-009), shared with the MCP copy
/**
 * SPEC-148 FR-009. The MCP's feedback-status.ts carries the same constant, and
 * mcp-server/tests/feedback-status-drift.test.ts fails if the two ever differ.
 */
export const TRIAGED_MESSAGE =
  "We're looking at your issue and have triaged it for correction. The fix will be in an upcoming release.";

function messageForStatus(row: FeedbackSubmission, note?: string | null): string {
  const ref = row.id.slice(0, 8);
  // A record returned to 'new' with reopenedat set is a recurrence of a closed
  // error (FR-010) — surface it as a regression, not a generic status change.
  if (row.status === "new" && row.reopenedat) {
    return `A previously closed error "${row.title}" (${ref}) has recurred and was reopened as a regression.`;
  }
  switch (row.status) {
    case "needsinfo":
      return `Your report "${row.title}" (${ref}) needs more info: ${row.clarificationquestion ?? "please add details."}`;
    case "triaged":
      return `Your report "${row.title}" (${ref}): ${TRIAGED_MESSAGE}`;
    case "inprogress":
      return `Your report "${row.title}" (${ref}) is now in progress.`;
    case "resolved": {
      // Mirrors the MCP builder so the two surfaces word a resolution the same
      // way. The app's triage UI has no resolution note to pass yet — its
      // transitionStatus() and addInternalNote() are separate actions — so this
      // branch takes the plain form here today. The parameter exists so the
      // wording cannot drift the moment the UI does supply one.
      const said = note?.trim();
      return said
        ? `Your report "${row.title}" (${ref}) has been resolved: ${said}`
        : `Your report "${row.title}" (${ref}) has been resolved.`;
    }
    case "declined":
      return `Your report "${row.title}" (${ref}) was declined: ${row.declinereason ?? "no reason given"}.`;
    default:
      return `Your report "${row.title}" (${ref}) status: ${row.status}.`;
  }
}
// [SCOPE 043 / T008] END

/**
 * Deliver a status-change notification to the submitter over their chosen
 * channel and reconcile the notify leg on the source-of-truth row. In-app inbox
 * is always written (v1 baseline); email is attempted only for the 'email'
 * channel. Best-effort and idempotent enough for manual retry: success sets
 * notifystatus='done', any failure sets 'failed' so SysAdmin can retry. Never
 * throws — a failed notification must not undo a real status change.
 */
// [SCOPE 043 / T008] BEGIN — Notification channels (in-app + email) with pending + retry
export async function sendFeedbackNotification(
  row: FeedbackSubmission,
  note?: string | null,
): Promise<{ ok: boolean; error?: string }> {
// [SCOPE 043 / T008] END
  try {
    const message = messageForStatus(row, note);

    // In-app leg (always) — the Dev Cockpit reads this inbox.
    await db.insert(notifications).values({
      userid: row.userid,
      type: "feedback_status",
      entityid: row.id,
      entitytype: "feedback",
      message,
    });

    // Email leg — only when the submitter opted into email.
    if (row.notificationchannel === "email") {
      const [user] = await db
        .select()
        .from(userprofiles)
        .where(eq(userprofiles.id, row.userid));
      if (!user?.emailaddr || !isValidEmail(user.emailaddr)) {
        throw new Error("submitter has no valid email address");
      }
      await sendEmail(
        user.emailaddr,
        `[wxKanban feedback] ${row.title}`,
        `<p>${message}</p>`,
        message,
      );
    }

    await db
      .update(feedbacksubmissions)
      .set({ notifystatus: "done", updatedat: new Date() })
      .where(eq(feedbacksubmissions.id, row.id));

    return { ok: true };
  } catch (err) {
    const error = (err as Error).message;
    // Reconcile: mark the leg failed so it is retryable from SysAdmin (no worker).
    try {
      await db
        .update(feedbacksubmissions)
        .set({ notifystatus: "failed", updatedat: new Date() })
        .where(eq(feedbacksubmissions.id, row.id));
    } catch {
      // best effort
    }
    logger.warn({ feedbackId: row.id, error }, "feedback notification failed — marked for retry");
    return { ok: false, error };
  }
}

/** Manual retry entry point for the SysAdmin triage surface (T006). */
// [SCOPE 043 / T008] BEGIN — Notification channels (in-app + email) with pending + retry
export async function retryFeedbackNotification(
  feedbackId: string,
): Promise<{ ok: boolean; error?: string }> {
// [SCOPE 043 / T008] END
  const [row] = await db
    .select()
    .from(feedbacksubmissions)
    .where(eq(feedbacksubmissions.id, feedbackId));
  if (!row) return { ok: false, error: "feedback not found" };
  return sendFeedbackNotification(row as FeedbackSubmission);
}
