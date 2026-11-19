// [SCOPE 131 / T014] BEGIN — cancellation confirmation email (FR-009, FR-013)
/**
 * SPEC-131 T014. One email, to the company's active ADMIN, confirming the date
 * their subscription ends and how to reverse it before then.
 *
 * Two constraints shape this module:
 *
 * 1. **It can never block the cancellation.** Every path returns a result object
 *    and throws nothing. A cancellation that succeeded at Stripe and in our
 *    database must not report failure to the customer because a mail server was
 *    briefly unreachable — that would invite them to click cancel again, and the
 *    second attempt would 409.
 *
 * 2. **It is sent in the recipient's language.** `userprofiles.language` carries
 *    the preferred locale, and the six authored bundles are plain objects with no
 *    React in them, so the server can resolve against the same strings the UI uses
 *    rather than keeping a second English-only copy that silently drifts.
 *
 * Deliberately NOT sent on pause, un-cancel or resume. SCOPE-067 already emails a
 * customer whose card failed; adding more billing mail around reversible, low-stakes
 * actions is how two systems end up both writing to the same customer about the
 * same subscription on the same day.
 */
import { and, eq } from "drizzle-orm";
import { companies } from "../../db/schema/company.js";
import { userprofiles } from "../../db/schema/userprofiles.js";
import { db } from "../../db/client.js";
import { sendEmail } from "../lib/email.js";
import { createLogger } from "../lib/logger.js";
import { enUS } from "../../client/i18n/locales/en-US.js";
import { frFR } from "../../client/i18n/locales/fr-FR.js";
import { esES } from "../../client/i18n/locales/es-ES.js";
import { itIT } from "../../client/i18n/locales/it-IT.js";
import { deDE } from "../../client/i18n/locales/de-DE.js";
import { ptBR } from "../../client/i18n/locales/pt-BR.js";

const logger = createLogger("subscription-cancellation-email");

const BUNDLES: Record<string, unknown> = {
  "en-US": enUS,
  "fr-FR": frFR,
  "es-ES": esES,
  "it-IT": itIT,
  "de-DE": deDE,
  "pt-BR": ptBR,
};

/**
 * Resolve one key against the recipient's bundle, falling back to en-US per key —
 * the same guarantee the client resolver gives. A missing key yields English, never
 * a blank line in an email.
 */
function t(
  locale: string,
  key: string,
  vars?: Record<string, string>,
): string {
  const lookup = (bundle: unknown): string | undefined => {
    let node: unknown = bundle;
    for (const part of key.split(".")) {
      if (typeof node !== "object" || node === null) return undefined;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === "string" ? node : undefined;
  };

  const raw = lookup(BUNDLES[locale]) ?? lookup(enUS) ?? key;
  if (!vars) return raw;
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.split(`{{${name}}}`).join(value),
    raw,
  );
}

export interface CancellationEmailResult {
  sent: boolean;
  to?: string;
  reason?: string;
}

/**
 * Send the confirmation. Resolves to a result; never rejects.
 */
export async function sendCancellationConfirmation(
  companyId: string,
  effectiveDate: Date | null,
): Promise<CancellationEmailResult> {
  try {
    const [company] = await db
      .select({ name: companies.name, billingemail: companies.billingemail })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) return { sent: false, reason: "no_company" };

    // The active ADMIN is the addressee, because they are the person who can
    // reverse this. `billingemail` is a fallback only: it is often a shared
    // accounts-payable box that cannot sign in to undo anything.
    const [admin] = await db
      .select({ email: userprofiles.emailaddr, language: userprofiles.language })
      .from(userprofiles)
      .where(
        and(
          eq(userprofiles.companyid, companyId),
          eq(userprofiles.usertype, "ADMIN"),
          eq(userprofiles.active, true),
        ),
      )
      .limit(1);

    const recipient = admin?.email ?? company.billingemail ?? null;
    if (!recipient) return { sent: false, reason: "no_recipient" };

    const locale = admin?.language ?? "en-US";
    const dateLabel = effectiveDate
      ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(effectiveDate)
      : t(locale, "subscriptionLifecycle.effectiveDateUnknown");

    const subject = t(locale, "subscriptionLifecycle.emailSubject", { date: dateLabel });
    const heading = t(locale, "subscriptionLifecycle.emailHeading");
    const body = t(locale, "subscriptionLifecycle.emailBody", {
      date: dateLabel,
      company: company.name,
    });
    const undoHeading = t(locale, "subscriptionLifecycle.emailUndoHeading");
    const undoBody = t(locale, "subscriptionLifecycle.emailUndoBody", { date: dateLabel });
    const footer = t(locale, "subscriptionLifecycle.emailFooter");

    const settingsUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/settings?tab=billing`;

    const html = `<!DOCTYPE html>
<html lang="${locale}">
  <body style="margin:0;padding:24px;background:#f5f6f8;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;">${heading}</h1>
      <p style="margin:0 0 20px;line-height:1.6;">${body}</p>
      <h2 style="margin:24px 0 8px;font-size:16px;">${undoHeading}</h2>
      <p style="margin:0 0 24px;line-height:1.6;">${undoBody}</p>
      <p style="margin:0 0 24px;">
        <a href="${settingsUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
          ${t(locale, "subscriptionLifecycle.wallPausedCta")}
        </a>
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">${footer}</p>
    </div>
  </body>
</html>`;

    const text = [heading, "", body, "", undoHeading, undoBody, "", settingsUrl, "", footer].join("\n");

    await sendEmail(recipient, subject, html, text);

    logger.info({ companyId, to: recipient, locale }, "Sent cancellation confirmation");
    return { sent: true, to: recipient };
  } catch (error) {
    // Swallowed on purpose — see constraint 1 in the module header.
    logger.error(
      { error: error instanceof Error ? error.message : String(error), companyId },
      "Failed to send cancellation confirmation (the cancellation itself stands)",
    );
    return { sent: false, reason: "error" };
  }
}
// [SCOPE 131 / T014] END
