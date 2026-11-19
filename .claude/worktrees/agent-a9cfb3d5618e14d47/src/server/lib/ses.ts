import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// [SCOPE 064 / T005] BEGIN — SES send wrapper for the newsletter
// Server-side transactional/marketing send via Amazon SES, mirroring the config
// style of marketing-assets-s3.ts. The sender identity must be SES-verified and
// the account out of the SES sandbox; the App Runner instance role needs
// ses:SendEmail (today it only grants S3 presign). Region + From come from env.

const REGION =
  process.env.MARKETING_ASSETS_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const FROM = process.env.NEWSLETTER_FROM; // SES-verified sender, e.g. andy@wxperts.com

let _client: SESClient | null = null;
function sesClient(): SESClient {
  if (!_client) _client = new SESClient({ region: REGION });
  return _client;
}

/** Whether the newsletter sender is configured (a verified From address is set). */
export function newsletterSenderConfigured(): boolean {
  return Boolean(FROM);
}

export function newsletterFrom(): string | undefined {
  return FROM;
}

/**
 * Send one HTML email via SES. Resolves true on success, false on failure — the
 * caller (NewsletterSendService) records the per-recipient outcome and never lets
 * one failure abort the run.
 */
export async function sendNewsletterEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  if (!FROM) throw new Error("NEWSLETTER_FROM not configured");
  const command = new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [opts.to] },
    ReplyToAddresses: opts.replyTo ? [opts.replyTo] : undefined,
    Message: {
      Subject: { Data: opts.subject, Charset: "UTF-8" },
      Body: { Html: { Data: opts.html, Charset: "UTF-8" } },
    },
  });
  await sesClient().send(command);
  return true;
}
// [SCOPE 064 / T005] END
