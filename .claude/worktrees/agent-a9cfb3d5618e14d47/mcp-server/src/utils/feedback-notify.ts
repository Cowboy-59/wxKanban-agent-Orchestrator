// [SCOPE 043 / T020] BEGIN — notify the vendor when feedback arrives.
//
// WHY THIS EXISTS: submit_feedback had two fan-out legs — render the lifecycle
// artifact, and run AI triage — and neither told a human anything. A customer
// filed a report, it landed in the sink, and it sat there until somebody happened
// to open the web app. Measured 2026-08-03: 53 untriaged reports across 9 customer
// companies, the oldest from May. That is not a triage backlog, it is an absence
// of any signal that there was something to triage.
//
// Design constraints, all learned from the two legs that came before:
//   * BEST-EFFORT. A notification failure must never fail a submit. The row is
//     already the source of truth; losing an email is an inconvenience, losing a
//     customer's bug report is not.
//   * OFF UNLESS CONFIGURED. With no FEEDBACK_NOTIFY_EMAIL this is a no-op, so it
//     ships dark and is switched on deliberately.
//   * SEVERITY-GATED. 53 open rows would have been 53 emails on day one, and an
//     alert channel that floods gets muted, which returns you to no signal at all.
//   * NO NEW DEPENDENCY. Mailgun over plain HTTPS with fetch. The MCP server has
//     no mail library and does not need one for a single POST.
import logger from './logger.js';

export const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

export interface NotifiableFeedback {
  id: string;
  type: string;
  title: string;
  severity: string | null;
  classification: string | null;
  companyId: string | null;
  context: unknown;
}

export interface NotifyConfig {
  to: string | null;
  from: string;
  minSeverity: Severity;
  mailgunBase: string | null;
  mailgunKey: string | null;
}

export function readNotifyConfig(env: NodeJS.ProcessEnv = process.env): NotifyConfig {
  const raw = (env.FEEDBACK_NOTIFY_MIN_SEVERITY ?? 'high').toLowerCase();
  const minSeverity = (SEVERITY_ORDER as readonly string[]).includes(raw)
    ? (raw as Severity)
    : 'high';
  return {
    to: env.FEEDBACK_NOTIFY_EMAIL?.trim() || null,
    from: env.FEEDBACK_NOTIFY_FROM?.trim() || 'wxKanban Feedback <noreply@mg.wxperts.com>',
    minSeverity,
    mailgunBase: normalizeMailgunBase(env.MAILGUN_DOMAIN),
    mailgunKey: env.MAILGUN_API_KEY?.trim() || null,
  };
}

/**
 * MAILGUN_DOMAIN holds a FULL URL in this deployment
 * (`https://api.mailgun.net/v3/mg.wxperts.com/`), not a bare domain — a known
 * trap that has broken stricter consumers before. Accept either shape.
 */
export function normalizeMailgunBase(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  const base = v.startsWith('http') ? v : `https://api.mailgun.net/v3/${v}`;
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Gate decision, pure so it is testable without a network or a DB.
 *
 * A null severity means triage did not classify the row — it failed, timed out,
 * or no LLM key is configured. Those NOTIFY rather than stay silent: an
 * unclassified report is unknown risk, and a triage pipeline that has stopped
 * working is itself something you want to hear about. Silence on the failure path
 * is the exact defect this leg exists to fix.
 */
export function shouldNotify(row: NotifiableFeedback, minSeverity: Severity): boolean {
  if (row.severity == null) return true;
  const idx = (SEVERITY_ORDER as readonly string[]).indexOf(row.severity.toLowerCase());
  if (idx === -1) return true; // unrecognised value — treat as unclassified
  return idx >= SEVERITY_ORDER.indexOf(minSeverity);
}

function originProjectIdOf(context: unknown): string | undefined {
  if (context && typeof context === 'object') {
    const v = (context as Record<string, unknown>)['originProjectId'];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

export function buildNotification(
  row: NotifiableFeedback,
  companyName: string | null,
): { subject: string; text: string } {
  const sev = row.severity ?? 'untriaged';
  const who = companyName ?? row.companyId ?? 'unknown company';
  const subject = `[wxKanban ${sev}] ${row.type}: ${row.title}`.slice(0, 200);
  const text = [
    `A new ${row.type} was filed in wxKanban.`,
    '',
    `From company : ${who}`,
    `Origin project: ${originProjectIdOf(row.context) ?? 'unknown'}`,
    `Severity      : ${sev}${row.severity == null ? ' (triage did not classify this — worth a look)' : ''}`,
    `Classification: ${row.classification ?? 'n/a'}`,
    `Reference     : ${row.id}`,
    '',
    row.title,
    '',
    'Triage it on the SysAdmin Feedback screen, or in the Cockpit under',
    '"Incoming from customers".',
  ].join('\n');
  return { subject, text };
}

/**
 * Fire the notification. Never throws — returns why it did or did not send so the
 * caller can log a reason rather than guess at silence.
 */
export async function notifyVendorOfFeedback(
  row: NotifiableFeedback,
  companyName: string | null,
  cfg: NotifyConfig = readNotifyConfig(),
): Promise<{ sent: boolean; reason: string }> {
  try {
    if (!cfg.to) return { sent: false, reason: 'disabled: FEEDBACK_NOTIFY_EMAIL unset' };
    if (!cfg.mailgunBase || !cfg.mailgunKey) {
      return { sent: false, reason: 'disabled: MAILGUN_DOMAIN/MAILGUN_API_KEY unset' };
    }
    if (!shouldNotify(row, cfg.minSeverity)) {
      return { sent: false, reason: `below gate (${row.severity} < ${cfg.minSeverity})` };
    }

    const { subject, text } = buildNotification(row, companyName);
    const body = new URLSearchParams({ from: cfg.from, to: cfg.to, subject, text });
    const auth = Buffer.from(`api:${cfg.mailgunKey}`).toString('base64');

    const res = await fetch(`${cfg.mailgunBase}messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { sent: false, reason: `mailgun ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { sent: true, reason: 'ok' };
  } catch (err) {
    // Includes the 5s AbortSignal timeout. App Runner can throttle a container
    // after the response is sent, so an unbounded call here would hang the submit.
    return { sent: false, reason: `error: ${(err as Error).message}` };
  }
}

/** Log-and-forget wrapper for the submit path. Awaited, bounded, never throws. */
export async function notifyVendorSafely(
  row: NotifiableFeedback,
  companyName: string | null,
): Promise<void> {
  const result = await notifyVendorOfFeedback(row, companyName);
  if (result.sent) {
    logger.info('Feedback notification sent', { feedbackId: row.id, severity: row.severity });
  } else {
    logger.info('Feedback notification not sent', { feedbackId: row.id, reason: result.reason });
  }
}
// [SCOPE 043 / T020] END
