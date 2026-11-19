// "Don't miss this" launch announcement to EXISTING wxperts customers
// (signuplist='customer-import') — people we have a business relationship with,
// NOT landing-page opt-ins. Copy is written for that: a direct note from Andy,
// honest about why they're hearing from us, with a clear unsubscribe.
// Mirror of the marketing record; sent via SES. Subject is intentionally urgent.
import { SendEmailCommand } from "@aws-sdk/client-ses";

const SUBJECT = "Don't miss this — your business depends on it";

function firstNameOf(name) {
  const n = String(name || "").trim();
  if (!n) return "there";
  return n.split(/\s+/)[0];
}

function buildText(firstName, unsubscribeUrl, ctaUrl) {
  return [
    `Don't miss this, ${firstName} — your business may depend on it.`,
    ``,
    `You're a wxperts customer, so I'm writing to you directly.`,
    ``,
    `The ground under proprietary development platforms is shifting. AI is rewriting`,
    `how software gets built, and if your applications live on a proprietary system,`,
    `your livelihood — and every app your clients depend on — rides on one vendor's`,
    `decisions. Perpetual licenses became subscriptions; now the source code itself`,
    `is something you rent. That's not a risk anymore — that's the terms.`,
    ``,
    `Here's the part that matters: you're not starting over. The hard part of building`,
    `software was never the syntax — it was the judgment to take an app from messy`,
    `reality to clean, tested, shipped. You already have it. That judgment is exactly`,
    `what AI-assisted development still demands.`,
    ``,
    `I built a guided bridge across — and I proved it works by crossing first:`,
    `wxKanban itself was a WINDEV application. We converted it — data, procedures,`,
    `screens and all — into a modern, AI-built full-stack app on open foundations`,
    `we own. The product is the proof.`,
    ``,
    `See exactly how the crossing works:  ${ctaUrl}`,
    `wxKanban launches July 5 — get on the list and you'll be first across.`,
    ``,
    `I've made every platform crossing there is over 40 years — mainframe to web to`,
    `cloud. I won't stand by and watch good developers get trapped by a platform that`,
    `can change its terms or close its doors. If that's a risk you feel, let's talk.`,
    ``,
    `— Andy "Cowboy" Stapleton, founder, wxperts`,
    ``,
    `You're receiving this because you're a wxperts customer.`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");
}

function buildHtml(firstName, unsubscribeUrl, ctaUrl) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Don't miss this — your business depends on it</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    table { border-collapse:collapse !important; }
    body { margin:0 !important; padding:0 !important; width:100% !important; height:100% !important; }
    a { color:#a45f12; }
    @media screen and (max-width:600px) {
      .container { width:100% !important; }
      .px { padding-left:24px !important; padding-right:24px !important; }
      .h1 { font-size:24px !important; line-height:30px !important; }
      .logo { width:230px !important; height:auto !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#eceff3;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#eceff3;">
    You're a wxperts customer. AI is changing how software is built — here's a guided way across, on foundations you own. Launching July 5.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eceff3;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 10px rgba(15,23,34,0.08);">
          <tr>
            <td align="center" bgcolor="#0f1722" style="background-color:#0f1722; padding:32px 24px 28px;">
              <img src="https://windev.wxperts.com/wxKanbanLight.png" alt="wxKanban — AI Project Management System" width="280" class="logo" style="display:block; width:280px; max-width:280px; height:auto;" />
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="#0f1722" class="px" style="background-color:#0f1722; padding:8px 40px 36px;">
              <h1 class="h1" style="margin:0 0 14px; color:#ffffff; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:27px; line-height:34px; font-weight:700; letter-spacing:-0.4px;">
                Don&rsquo;t miss this. Your business may depend on it.
              </h1>
              <p style="margin:0; color:#c3cad6; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:17px; line-height:25px;">
                You&rsquo;re a wxperts customer &mdash; so I&rsquo;m writing to you directly.
              </p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:34px 40px 8px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#2b313b;">
              <p style="margin:0 0 16px; font-size:16px; line-height:25px;">
                ${firstName}, the ground under proprietary development platforms is shifting. AI is rewriting how software gets built &mdash; and if your applications live on a proprietary system, your livelihood and every app your clients depend on rides on <strong style="color:#14171c;">one vendor&rsquo;s decisions</strong>. Perpetual licenses became subscriptions; now the source code itself is something you rent. That&rsquo;s not a risk anymore &mdash; that&rsquo;s the terms.
              </p>
              <p style="margin:0 0 16px; font-size:16px; line-height:25px;">
                Here&rsquo;s the part that matters: <strong style="color:#14171c;">you&rsquo;re not starting over.</strong> The hard part of building software was never the syntax &mdash; it was the <em>judgment</em> to take an app from messy reality to clean, tested, shipped. You already have it, and it&rsquo;s exactly what AI-assisted development still demands.
              </p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:8px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f7f9; border-left:4px solid #c8761b; border-radius:8px;">
                <tr>
                  <td style="padding:18px 22px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#2b313b; font-size:15px; line-height:23px;">
                    I built a guided bridge across &mdash; and proved it by crossing first. <strong style="color:#14171c;">wxKanban itself was a WINDEV application.</strong> We converted it &mdash; data, procedures, screens and all &mdash; into a modern, AI-built full-stack app on open foundations we own. The product is the proof.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" class="px" style="padding:28px 40px 6px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <h2 style="margin:0 0 6px; color:#14171c; font-size:20px; line-height:26px; font-weight:700;">wxKanban launches July 5.</h2>
              <p style="margin:0 0 22px; color:#5b6472; font-size:15px; line-height:22px;">See exactly how the crossing works &mdash; and get on the list to be first across.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td align="center" bgcolor="#c8761b" style="border-radius:10px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ctaUrl}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="20%" stroke="f" fillcolor="#c8761b">
                    <w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:17px;font-weight:bold;">See how the crossing works</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a href="${ctaUrl}" style="display:inline-block; padding:15px 30px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:17px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:10px; background-color:#c8761b;">See how the crossing works</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0; font-size:13px; line-height:19px; color:#8a93a1;">
                Or open <a href="${ctaUrl}" style="color:#a45f12;">windev.wxperts.com</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 40px 4px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#2b313b; font-size:15px; line-height:23px;">
              <p style="margin:0;">I&rsquo;ve made every platform crossing there is over 40 years &mdash; mainframe to web to cloud. I won&rsquo;t stand by and watch good developers get trapped by a platform that can change its terms or close its doors. If that&rsquo;s a risk you feel, let&rsquo;s talk.</p>
              <p style="margin:14px 0 0; font-weight:700; color:#14171c;">&mdash; Andy &ldquo;Cowboy&rdquo; Stapleton, founder, wxperts</p>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 40px 30px;">
              <hr style="border:none; border-top:1px solid #e3e6eb; margin:0 0 18px;" />
              <p style="margin:0 0 6px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#8a93a1; font-size:12px; line-height:18px;">
                wxKanban &mdash; by wxPerts LLC &middot; Cross from WINDEV to AI-built software you own.<br />
                Questions? Just reply, or email <a href="mailto:andy@wxperts.com" style="color:#a45f12;">andy@wxperts.com</a>.
              </p>
              <p style="margin:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#a7aeb9; font-size:12px; line-height:18px;">
                You&rsquo;re receiving this because you&rsquo;re a wxperts customer.
                <a href="${unsubscribeUrl}" style="color:#a7aeb9; text-decoration:underline;">Unsubscribe</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Campaign tag used in the CTA link + reply sub-address, so engagement is attributable.
const CAMPAIGN = "cust844";

export async function sendCustomerAnnounce(ses, { to, name, token }) {
  if (process.env.ANNOUNCE_ENABLED === "false") return false;
  const from = process.env.ANNOUNCE_FROM || process.env.WELCOME_FROM || "andy@wxperts.com";
  if (!from || !to) return false;

  // Replies land on a sub-address so they auto-filter into one inbox label.
  const replyTo = process.env.ANNOUNCE_REPLYTO || `andy+${CAMPAIGN}@wxperts.com`;

  // Per-recipient tagged CTA: the site's pageview beacon captures c + u, which maps
  // back to marketingcontacts.id (the token) — that's the "who clicked" list.
  const base = "https://windev.wxperts.com/";
  const ctaUrl = token
    ? `${base}?c=${CAMPAIGN}&u=${encodeURIComponent(token)}`
    : base;

  const firstName = firstNameOf(name);
  const unsubscribeUrl =
    process.env.UNSUBSCRIBE_URL ||
    `mailto:andy@wxperts.com?subject=${encodeURIComponent("Unsubscribe me from wxKanban emails")}`;
  try {
    await ses.send(new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: [replyTo],
      Message: {
        Subject: { Data: SUBJECT },
        Body: {
          Html: { Data: buildHtml(firstName, unsubscribeUrl, ctaUrl) },
          Text: { Data: buildText(firstName, unsubscribeUrl, ctaUrl) },
        },
      },
    }));
    return true;
  } catch (e) {
    console.error("Customer announce send failed:", e.message);
    return false;
  }
}

export { SUBJECT, buildHtml, buildText };
