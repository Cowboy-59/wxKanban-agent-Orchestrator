// Welcome / "glad to have you" email sent to each new signup via SES.
// Kept in its own module so index.mjs stays lean. The HTML mirrors
// marketing/site/email/welcome-signup.html — if you edit one, edit both.
//
// SENDING REQUIREMENTS:
//   - From address (WELCOME_FROM, falls back to NOTIFY_EMAIL) must be an SES-verified
//     identity (address or domain).
//   - To send to arbitrary new signups, the SES account must be OUT of the sandbox
//     (production access). In sandbox, SES only delivers to verified addresses.
//   - Set WELCOME_ENABLED=false to turn this off without redeploying code logic.
import { SendEmailCommand } from "@aws-sdk/client-ses";

const SUBJECT = "You're in — welcome aboard 🐎";

function firstNameOf(name) {
  const n = String(name || "").trim();
  if (!n) return "there";
  return n.split(/\s+/)[0];
}

// Plain-text fallback (deliverability + non-HTML clients).
function buildText(firstName, unsubscribeUrl) {
  return [
    `You're on the list. Glad to have you, ${firstName}.`,
    ``,
    `Thank you for signing up — it genuinely means a lot. You've put your hand up for`,
    `a safe, guided way for seasoned developers to cross from a proprietary platform to`,
    `AI-built, full-stack software they actually own.`,
    ``,
    `There's nothing you need to do right now — I'll come to you. If you'd like to see`,
    `the whole picture while you wait, the page lays out exactly how the crossing works`,
    `and the product you land in on the other side:`,
    `  https://windev.wxperts.com/`,
    ``,
    `Between now and July 5:`,
    `  - How-To videos as they drop — every stage of the conversion and the lifecycle.`,
    `  - The launch, the moment it's ready. You'll be first across — no spot caps.`,
    `  - Want to go first? If you ticked the hands-on box I'll be in touch about`,
    `    converting your actual app together. If not and you'd like to — just reply.`,
    ``,
    `I've made every platform crossing there is over 40 years — mainframe to web to`,
    `cloud. The developers who thrived carried their judgment from one platform to the`,
    `next. You already have that. Let's make this crossing together.`,
    ``,
    `— Andy "Cowboy" Stapleton, founder, wxperts`,
    ``,
    `Questions? Just reply, or email andy@wxperts.com.`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");
}

function buildHtml(firstName, unsubscribeUrl) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>You're on the list — welcome to the crossing</title>
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
    You're on the list — glad to have you. Here's the page, the How-To videos, and what happens before launch on July 5.
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
              <h1 class="h1" style="margin:0 0 14px; color:#ffffff; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:28px; line-height:34px; font-weight:700; letter-spacing:-0.4px;">
                You&rsquo;re on the list. Glad to have you.
              </h1>
              <p style="margin:0; color:#c3cad6; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:17px; line-height:25px;">
                The crossing starts here &mdash; and you&rsquo;ll be among the first across.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 0;">
                <tr><td style="background-color:rgba(200,118,27,0.16); border:1px solid rgba(200,118,27,0.45); border-radius:999px; padding:8px 16px; color:#f0b878; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:16px;">
                  🐎 wxKanban launches July 5 &mdash; you&rsquo;ll be first to know.
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:34px 40px 8px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#2b313b;">
              <p style="margin:0 0 16px; font-size:16px; line-height:25px;">
                Thank you for signing up, ${firstName} &mdash; it genuinely means a lot. You&rsquo;ve put your hand up for something I&rsquo;ve spent years building toward: a safe, guided way for seasoned developers to cross from a proprietary platform to AI-built, full-stack software <em>they actually own</em>.
              </p>
              <p style="margin:0 0 16px; font-size:16px; line-height:25px;">
                There&rsquo;s nothing you need to do right now &mdash; I&rsquo;ll come to you. But if you&rsquo;d like to see the whole picture while you wait, the page below lays out exactly how the crossing works &mdash; and the product you land in on the other side.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" class="px" style="padding:12px 40px 6px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td align="center" bgcolor="#c8761b" style="border-radius:10px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://windev.wxperts.com/" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="20%" stroke="f" fillcolor="#c8761b">
                    <w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:17px;font-weight:bold;">See how the crossing works</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a href="https://windev.wxperts.com/" style="display:inline-block; padding:15px 30px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:17px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:10px; background-color:#c8761b;">See how the crossing works</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0; font-size:13px; line-height:19px; color:#8a93a1;">
                Or open <a href="https://windev.wxperts.com/" style="color:#a45f12;">windev.wxperts.com</a> any time.
              </p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:26px 40px 4px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px; color:#a45f12; font-size:12px; line-height:16px; letter-spacing:1.4px; text-transform:uppercase; font-weight:700;">What happens next</p>
              <h2 style="margin:0 0 14px; color:#14171c; font-size:20px; line-height:26px; font-weight:700;">Between now and July 5</h2>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 40px 6px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#2b313b;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="top" style="padding:0 0 14px; font-size:15px; line-height:22px;">
                    <strong style="color:#14171c;">🎬 How-To videos as they drop.</strong> I&rsquo;m walking through every stage of the conversion and the wxKanban lifecycle, in the open. You&rsquo;ll get each one the moment it&rsquo;s live.
                  </td>
                </tr>
                <tr>
                  <td valign="top" style="padding:0 0 14px; font-size:15px; line-height:22px;">
                    <strong style="color:#14171c;">🚀 The launch, the moment it&rsquo;s ready.</strong> On July 5 you&rsquo;ll be first through the door &mdash; no spot caps, no waiting in line.
                  </td>
                </tr>
                <tr>
                  <td valign="top" style="padding:0 0 4px; font-size:15px; line-height:22px;">
                    <strong style="color:#14171c;">🤝 Want to go first?</strong> If you ticked the hands-on box, I&rsquo;ll be in touch about converting <em>your</em> actual application together. If you didn&rsquo;t and you&rsquo;d like to &mdash; just reply to this email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 40px 4px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#2b313b; font-size:15px; line-height:23px;">
              <p style="margin:0;">I&rsquo;ve made every platform crossing there is over 40 years &mdash; mainframe to web to cloud. The developers who thrived carried their judgment from one platform to the next. You already have that. I&rsquo;m glad you&rsquo;re here &mdash; let&rsquo;s make this crossing together.</p>
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
                You&rsquo;re receiving this because you signed up to hear about wxKanban&rsquo;s launch.
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

// Sends the welcome email. Best-effort: returns true on success, false on any failure
// (caller should NOT fail the signup request if this returns false).
export async function sendWelcomeEmail(ses, { to, name }) {
  if (process.env.WELCOME_ENABLED === "false") return false;
  const from = process.env.WELCOME_FROM || process.env.NOTIFY_EMAIL;
  if (!from || !to) return false;

  const firstName = firstNameOf(name);
  const unsubscribeUrl =
    process.env.UNSUBSCRIBE_URL ||
    `mailto:andy@wxperts.com?subject=${encodeURIComponent("Unsubscribe me from wxKanban launch list")}`;

  try {
    await ses.send(new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: [from],
      Message: {
        Subject: { Data: SUBJECT },
        Body: {
          Html: { Data: buildHtml(firstName, unsubscribeUrl) },
          Text: { Data: buildText(firstName, unsubscribeUrl) },
        },
      },
    }));
    return true;
  } catch (e) {
    console.error("Welcome email send failed:", e.message);
    return false;
  }
}
