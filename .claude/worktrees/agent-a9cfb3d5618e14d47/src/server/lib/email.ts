import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger.js";

/**
 * SMTP-based transactional email.
 *
 * Config (env):
 * - SMTP_HOST       e.g. "smtp.resend.com", "sandbox.smtp.mailtrap.io", "smtp.gmail.com"
 * - SMTP_PORT       defaults to 587
 * - SMTP_USER       SMTP username / API key login
 * - SMTP_PASS       SMTP password / API key
 * - SMTP_FROM       "wxKanban <noreply@yourdomain.com>"
 *
 * Dev fallback: if SMTP_HOST is unset, sendEmail logs the full message to Pino
 * and returns a stub result — useful for local testing without creds.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  if (!host) return null;

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });

  logger.info({ host }, "SMTP transport initialized");
  return transporter;
}

export async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string,
  replyTo?: string,
  cc?: string,
): Promise<{ messageId: string; status: string }> {
  const from =
    process.env.SMTP_FROM ?? "wxKanban <noreply@localhost>";
  const tx = getTransporter();

  if (!tx) {
    const textPreview = (textContent ?? htmlContent.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
    logger.warn(
      { to, cc, subject, from, replyTo, textPreview },
      "[dev] SMTP_HOST not set — email NOT sent. Body logged above.",
    );
    return { messageId: `dev-${Date.now()}`, status: "logged-dev" };
  }

  try {
    const info = await tx.sendMail({
      from,
      to,
      cc,
      subject,
      html: htmlContent,
      text: textContent,
      replyTo,
    });
    logger.info({ messageId: info.messageId, to, cc, subject }, "Email sent");
    return { messageId: info.messageId, status: "sent" };
  } catch (error) {
    logger.error({ error, to, subject }, "Failed to send email");
    throw error;
  }
}

/**
 * Mailgun's template-based email is not supported by the generic SMTP swap.
 * Kept as a type-compatible shim so the (already-broken) emailWorker compiles.
 */
export async function sendTemplatedEmail(
  _to: string,
  _template: string,
  _variables: Record<string, string>,
  _replyTo?: string,
): Promise<{ messageId: string; status: string }> {
  throw new Error(
    "sendTemplatedEmail is not available — render the template inline and call sendEmail instead",
  );
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getEmailDomain(email: string): string {
  const parts = email.split("@");
  return parts[parts.length - 1];
}
