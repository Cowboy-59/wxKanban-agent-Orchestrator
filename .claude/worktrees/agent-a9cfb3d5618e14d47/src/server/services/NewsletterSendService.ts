/**
 * Newsletter send (spec 064 / Phase B)
 *
 * Recipient selection ports the deduped/valid-email SQL proven in
 * marketing/site/deploy/lambda/send-customer-announce.mjs, adding an
 * `unsubscribedat IS NULL` filter. The send itself runs server-side via SES as a
 * BACKGROUND job: POST …/send marks the issue `sending` and returns; this worker
 * iterates recipients, writes a per-recipient newslettersends row, throttles for
 * SES rate limits, and rolls sent/failed counts onto the issue (terminal `sent`).
 * A per-recipient failure is recorded, never fatal.
 */

import { eq } from "drizzle-orm";
import { db, client } from "../db/client.js";
import { newsletterissues } from "../../db/schema/newsletterissues.js";
import { newslettersends } from "../../db/schema/newslettersends.js";
import { sendNewsletterEmail, newsletterSenderConfigured } from "../lib/ses.js";
import {
  buildUnsubscribeUrl,
  buildUserUnsubscribeUrl,
  type NewsletterCategory,
} from "../lib/newsletter-unsubscribe.js";
import { createLogger } from "../lib/logger.js";
// [SCOPE 064] Per-recipient language: translate the issue once per distinct
// member language, then send each member their own localized copy.
import { translateText, TRANSLATION_LOCALES } from "./MarketingAIService.js";
import { DEFAULT_LOCALE, resolveSupportedLocale } from "../../shared/locales.js";
import { HANDS_ON_SEGMENT } from "../../shared/newsletter-segments.js";

const logger = createLogger("newsletter-send-service");

// Same valid-email regex the Lambda scripts use to drop malformed imports.
const VALID_EMAIL_RE = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";
const SEND_DELAY_MS = Number(process.env.NEWSLETTER_SEND_DELAY_MS ?? 300); // ~3/sec, under SES limits

// [SCOPE 064 / T010] Amendment A — an issue targets one or both audiences.
export type Audience = "marketing" | "users" | "both";

export interface Recipient {
  kind: "contact" | "user"; // contact → marketingcontacts, user → userprofiles
  id: string;
  name: string | null;
  email: string;
  // [SCOPE 064] Preferred send language. Users carry their profile language;
  // marketing contacts have no language column so they default to en-US.
  language: string;
}

/** The fields of an issue that drive recipient resolution. */
export interface AudienceSpec {
  audience: Audience;
  segment: string; // marketingcontacts.signuplist — used when audience includes marketing
  usercategory: NewsletterCategory | null; // used when audience includes users
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// [SCOPE 064 / T005] BEGIN — recipient selection + background SES send
/**
 * Deduped, valid, non-unsubscribed marketing contacts for a segment.
 *
 * Normally `segment` is a `marketingcontacts.signuplist` value. The reserved
 * virtual sentinel HANDS_ON_SEGMENT (FR-014) instead targets the orthogonal
 * `wantshandson = true` cohort — same email-validity / unsubscribe / dedupe rules,
 * only the membership predicate changes, so the preview count and the send match.
 */
export async function getRecipients(segment: string): Promise<Recipient[]> {
  const rows =
    segment === HANDS_ON_SEGMENT
      ? await client<{ id: string; name: string | null; email: string }[]>`
          select distinct on (lower(email)) id, name, email
            from marketingcontacts
           where wantshandson = true
             and email is not null and email <> ''
             and email ~ ${VALID_EMAIL_RE}
             and unsubscribedat is null
           order by lower(email), submittedat desc
        `
      : await client<{ id: string; name: string | null; email: string }[]>`
          select distinct on (lower(email)) id, name, email
            from marketingcontacts
           where signuplist = ${segment}
             and email is not null and email <> ''
             and email ~ ${VALID_EMAIL_RE}
             and unsubscribedat is null
           order by lower(email), submittedat desc
        `;
  // [SCOPE 064] marketingcontacts has no language column → source locale (en-US).
  return rows.map((r) => ({
    kind: "contact",
    id: r.id,
    name: r.name,
    email: r.email,
    language: DEFAULT_LOCALE,
  }));
}

// [SCOPE 064 / T010] BEGIN — Amendment A: registered-user recipients + audience resolution
/**
 * Deduped, valid, opted-in registered users for a category. Excludes disabled
 * accounts and those who've unsubscribed from that category. Same case-insensitive
 * dedupe + invalid-email rules as the marketing path.
 */
export async function getUserRecipients(category: NewsletterCategory): Promise<Recipient[]> {
  // [SCOPE 064] Select the member's profile language so the send path can localize.
  const rows =
    category === "promos"
      ? await client<{ id: string; name: string | null; email: string; language: string | null }[]>`
          select distinct on (lower(emailaddr)) id, fullname as name, emailaddr as email, language
            from userprofiles
           where active = true
             and emailaddr is not null and emailaddr <> ''
             and emailaddr ~ ${VALID_EMAIL_RE}
             and promosunsubscribedat is null
           order by lower(emailaddr)
        `
      : await client<{ id: string; name: string | null; email: string; language: string | null }[]>`
          select distinct on (lower(emailaddr)) id, fullname as name, emailaddr as email, language
            from userprofiles
           where active = true
             and emailaddr is not null and emailaddr <> ''
             and emailaddr ~ ${VALID_EMAIL_RE}
             and updatesunsubscribedat is null
           order by lower(emailaddr)
        `;
  return rows.map((r) => ({
    kind: "user",
    id: r.id,
    name: r.name,
    email: r.email,
    // Normalize to a supported code so the distinct-set and per-recipient lookup agree.
    language: resolveSupportedLocale(r.language) ?? DEFAULT_LOCALE,
  }));
}

/**
 * Resolve the full recipient set for an issue's audience. When the audience is
 * `both`, the user set and the marketing set are merged and deduped by lower(email)
 * so a person on both lists is sent exactly one copy (the user record wins, so a
 * shared address gets the per-category user unsubscribe link).
 */
export async function resolveRecipients(spec: AudienceSpec): Promise<Recipient[]> {
  const out: Recipient[] = [];
  const seen = new Set<string>();
  const add = (list: Recipient[]): void => {
    for (const r of list) {
      const key = r.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  };

  if (spec.audience === "users" || spec.audience === "both") {
    const cat = spec.usercategory ?? "updates";
    add(await getUserRecipients(cat));
  }
  if (spec.audience === "marketing" || spec.audience === "both") {
    add(await getRecipients(spec.segment));
  }
  return out;
}

/** Deduped recipient count for an audience — pre-send preview (no email sent). */
export async function countAudience(spec: AudienceSpec): Promise<number> {
  return (await resolveRecipients(spec)).length;
}
// [SCOPE 064 / T010] END

/** Count of deduped valid recipients for a segment — pre-send preview (no email sent). */
export async function countRecipients(segment: string): Promise<number> {
  // FR-014: mirror getRecipients' virtual-sentinel branch so the preview never
  // diverges from the actual send set.
  const [row] =
    segment === HANDS_ON_SEGMENT
      ? await client<{ count: number }[]>`
          select count(*)::int as count from (
            select 1 from marketingcontacts
             where wantshandson = true
               and email is not null and email <> ''
               and email ~ ${VALID_EMAIL_RE}
               and unsubscribedat is null
             group by lower(email)
          ) t
        `
      : await client<{ count: number }[]>`
          select count(*)::int as count from (
            select 1 from marketingcontacts
             where signuplist = ${segment}
               and email is not null and email <> ''
               and email ~ ${VALID_EMAIL_RE}
               and unsubscribedat is null
             group by lower(email)
          ) t
        `;
  return row?.count ?? 0;
}

// [SCOPE 064] BEGIN — make a plain-text body render with its line breaks intact
/**
 * Render an author's body to email-safe HTML. If it already has block/paragraph
 * structure (<p>/<div>/<h1-6>/<ul>/<ol>/<table>/<blockquote>) it is trusted as-is.
 * Otherwise it is line-broken text (possibly with inline <br>/<a>): blank-line
 * blocks become <p> and single newlines become <br>, so it renders exactly as
 * typed instead of collapsing to one run-on blob. A lone inline <br> does NOT
 * count as "already formatted". Mirrors the composer's "Format as HTML" so a send
 * never silently depends on the author having clicked that button.
 */
function toEmailHtml(body: string): string {
  if (/<(p|div|h[1-6]|ul|ol|table|blockquote)\b/i.test(body)) return body;
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p style="margin:0 0 16px">${block.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
// [SCOPE 064] END

/** Wrap the issue body in a minimal HTML shell with the recipient's unsubscribe footer. */
function renderHtml(body: string, recipient: Recipient, category: NewsletterCategory | null): string {
  // [SCOPE 064 / T010] Amendment A — per-recipient footer + unsubscribe target.
  const isUser = recipient.kind === "user";
  const unsubscribeUrl = isUser
    ? buildUserUnsubscribeUrl(recipient.id, category ?? "updates")
    : buildUnsubscribeUrl(recipient.id);
  const preamble = isUser
    ? category === "promos"
      ? "You received this as a wxKanban user because you're subscribed to offers &amp; promotions."
      : "You received this as a wxKanban user because you're subscribed to product updates."
    : "You received this because you're on the wxperts marketing list.";
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.5">
<div style="max-width:640px;margin:0 auto;padding:16px">
${toEmailHtml(body)}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
<p style="font-size:12px;color:#94a3b8">
${preamble}
<a href="${unsubscribeUrl}" style="color:#94a3b8">Unsubscribe</a>.
</p>
</div></body></html>`;
}

// [SCOPE 064 / T011] BEGIN — "Send to me" review copy (single recipient, no DB writes)
/** Render the body in the same shell as a real send, with a disabled (preview) footer. */
function renderTestHtml(body: string): string {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.5">
<div style="max-width:640px;margin:0 auto;padding:16px">
${toEmailHtml(body)}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
<p style="font-size:12px;color:#94a3b8">
This is a review copy sent to you from the wxKanban newsletter composer.
<span style="color:#cbd5e1">(Unsubscribe is disabled in preview.)</span>
</p>
</div></body></html>`;
}

/**
 * Send a single review copy of an issue to one address (the review inbox).
 * Subject is prefixed with [TEST]; nothing is written to newslettersends and no
 * issue status changes. Throws on SES failure so the caller can surface it.
 *
 * [SCOPE 064] When `locale` names a supported non-English language, the copy is
 * translated first (same path a real send uses) so a reviewer can proof the
 * localized email. Fail-open: a failed translation falls back to the source text.
 * Returns the locale actually used and whether translation succeeded.
 */
export async function sendTestEmail(
  to: string,
  subject: string,
  body: string,
  locale?: string,
): Promise<{ locale: string; translated: boolean }> {
  const target = resolveSupportedLocale(locale) ?? DEFAULT_LOCALE;
  let outSubject = subject;
  let outBody = body;
  let translated = false;
  if (target !== DEFAULT_LOCALE && TRANSLATION_LOCALES.some((t) => t.locale === target)) {
    const [tSubject, tBody] = await Promise.all([
      translateText(subject, target),
      translateText(body, target),
    ]);
    outSubject = tSubject ?? subject;
    outBody = tBody ?? body;
    translated = !!(tSubject && tBody);
  }
  await sendNewsletterEmail({ to, subject: `[TEST] ${outSubject}`, html: renderTestHtml(outBody) });
  return { locale: target, translated };
}
// [SCOPE 064 / T011] END

// [SCOPE 064] BEGIN — per-language localization of an issue for its audience
/** A subject+body pair localized to one target language. */
interface LocalizedContent {
  subject: string;
  body: string;
}

/**
 * The issue is authored in en-US. Translate it once per distinct non-English
 * member language present in the audience (NOT once per recipient), so a run makes
 * at most one pass of model calls per language. Fail-open: if a half fails to
 * translate, that half falls back to the source text — a send is never blocked by
 * the translator.
 */
async function buildIssueTranslations(
  subject: string,
  body: string,
  locales: string[],
): Promise<Map<string, LocalizedContent>> {
  const map = new Map<string, LocalizedContent>();
  for (const locale of locales) {
    const [tSubject, tBody] = await Promise.all([
      translateText(subject, locale),
      translateText(body, locale),
    ]);
    map.set(locale, { subject: tSubject ?? subject, body: tBody ?? body });
    logger.info(
      { locale, subjectOk: !!tSubject, bodyOk: !!tBody },
      "newsletter localization prepared",
    );
  }
  return map;
}

/** Distinct, translatable member languages in the audience (excludes the en-US source). */
function distinctTargetLocales(recipients: Recipient[]): string[] {
  const set = new Set<string>();
  for (const r of recipients) {
    if (
      r.language !== DEFAULT_LOCALE &&
      TRANSLATION_LOCALES.some((t) => t.locale === r.language)
    ) {
      set.add(r.language);
    }
  }
  return [...set];
}
// [SCOPE 064] END

/**
 * Run the send for an issue in the background. Idempotency is enforced by the
 * caller (only a `draft` issue may be sent); this sets `sending` immediately so a
 * concurrent trigger sees a non-draft status. Never throws to the caller.
 */
export async function startSend(issueId: string): Promise<void> {
  if (!newsletterSenderConfigured()) {
    logger.error({ issueId }, "newsletter send aborted — NEWSLETTER_FROM not configured");
    await db
      .update(newsletterissues)
      .set({ status: "failed", updatedat: new Date() })
      .where(eq(newsletterissues.id, issueId));
    return;
  }

  try {
    const [issue] = await db
      .select()
      .from(newsletterissues)
      .where(eq(newsletterissues.id, issueId));
    if (!issue) {
      logger.error({ issueId }, "newsletter send aborted — issue not found");
      return;
    }

    // [SCOPE 064 / T010] Amendment A — resolve recipients from the issue's audience.
    const category = (issue.usercategory as NewsletterCategory | null) ?? null;
    const recipients = await resolveRecipients({
      audience: (issue.audience as Audience) ?? "marketing",
      segment: issue.segment,
      usercategory: category,
    });
    await db
      .update(newsletterissues)
      .set({ status: "sending", recipientcount: recipients.length, updatedat: new Date() })
      .where(eq(newsletterissues.id, issueId));

    // [SCOPE 064] Translate the issue once per distinct member language in the
    // audience; each recipient is then sent the copy in their language (source
    // en-US for contacts, English members, and any language that fails to translate).
    const targetLocales = distinctTargetLocales(recipients);
    const translations = targetLocales.length
      ? await buildIssueTranslations(issue.subject, issue.body, targetLocales)
      : new Map<string, LocalizedContent>();

    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      // Exactly one of contactid / userid is set, identifying the recipient's audience.
      const ref = r.kind === "user" ? { userid: r.id } : { contactid: r.id };
      const localized = translations.get(r.language) ?? { subject: issue.subject, body: issue.body };
      const html = renderHtml(localized.body, r, category);
      try {
        await sendNewsletterEmail({ to: r.email, subject: localized.subject, html });
        sent += 1;
        await db.insert(newslettersends).values({
          issueid: issueId,
          ...ref,
          email: r.email,
          status: "sent",
          sentat: new Date(),
        });
      } catch (err) {
        failed += 1;
        await db.insert(newslettersends).values({
          issueid: issueId,
          ...ref,
          email: r.email,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await sleep(SEND_DELAY_MS);
    }

    await db
      .update(newsletterissues)
      .set({
        status: "sent",
        sentcount: sent,
        failedcount: failed,
        sentat: new Date(),
        updatedat: new Date(),
      })
      .where(eq(newsletterissues.id, issueId));
    logger.info({ issueId, sent, failed }, "newsletter send complete");
  } catch (err) {
    // Unexpected failure (DB, recipient query) — mark the issue failed, don't crash.
    logger.error({ err, issueId }, "newsletter send failed");
    await db
      .update(newsletterissues)
      .set({ status: "failed", updatedat: new Date() })
      .where(eq(newsletterissues.id, issueId))
      .catch(() => undefined);
  }
}
// [SCOPE 064 / T005] END
