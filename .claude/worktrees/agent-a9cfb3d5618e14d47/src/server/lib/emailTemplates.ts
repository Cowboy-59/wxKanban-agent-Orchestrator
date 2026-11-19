/**
 * Email Templates
 * HTML and text content for transactional emails
 */

// [SCOPE 023 / T116] Per-language copy for the signup-invitation email (FR-002a.2).
import {
  inviteStringsFor,
  fillInvite,
} from "./signupInviteEmailStrings.js";

/**
 * Generate email verification email
 */
export function getVerificationEmailHTML(
  verificationLink: string,
  userEmail: string
): string {
  return `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #0ea5e9, #06b6d4); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
      .button { display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
      .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">Verify Your Email</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">Welcome to wxKanban</p>
      </div>
      <div class="content">
        <p>Hi ${userEmail},</p>

        <p>Thank you for signing up for <strong>wxKanban</strong>! To complete your registration and secure your account, please verify your email address.</p>

        <p style="text-align: center;">
          <a href="${verificationLink}" class="button">Verify Email Address</a>
        </p>

        <p style="font-size: 14px; color: #64748b;">Or copy this link:</p>
        <p style="background: white; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px; border: 1px solid #e2e8f0;">
          ${verificationLink}
        </p>

        <div class="warning">
          <strong>⏰ This link expires in 24 hours</strong>
          <p style="margin: 5px 0 0 0;">If you didn't create this account, please ignore this email or contact support.</p>
        </div>

        <p style="margin-top: 30px; font-size: 14px;">
          Best regards,<br>
          The wxKanban Team
        </p>

        <div class="footer">
          <p>wxKanban • Project Management with AI</p>
          <p>© 2026 wxKanban. All rights reserved.</p>
        </div>
      </div>
    </div>
  </body>
</html>
  `;
}

/**
 * Generate plain text version of verification email
 */
export function getVerificationEmailText(
  verificationLink: string,
  userEmail: string
): string {
  return `
Verify Your Email - wxKanban

Hi ${userEmail},

Thank you for signing up for wxKanban! To complete your registration and secure your account, please verify your email address.

Verify Email: ${verificationLink}

This link expires in 24 hours.

If you didn't create this account, please ignore this email or contact support.

Best regards,
The wxKanban Team

wxKanban • Project Management with AI
© 2026 wxKanban. All rights reserved.
  `.trim();
}

/**
 * Generate team invitation email
 */
export function getInvitationEmailHTML(
  invitedUserEmail: string,
  inviterName: string,
  companyName: string,
  role: string,
  personalmessage: string | null,
  acceptLink: string
): string {
  const roleDescriptions: Record<string, string> = {
    ADMIN: "Full access to all features and team management",
    MANAGER: "Manage team members and projects",
    DEVELOPER: "View and manage your assigned tasks",
  };

  const roleDesc = roleDescriptions[role] || role;

  return `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #8b5cf6, #a78bfa); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
      .card { background: white; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0; margin: 20px 0; }
      .role-badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 6px 12px; border-radius: 4px; font-weight: 600; font-size: 14px; }
      .button { display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
      .personal-message { background: #f1f5f9; padding: 15px; border-left: 3px solid #8b5cf6; margin: 20px 0; border-radius: 4px; font-style: italic; }
      .expiry-warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">You're Invited! 🎉</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">Join ${companyName} on wxKanban</p>
      </div>
      <div class="content">
        <p>Hi ${invitedUserEmail},</p>

        <p><strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on wxKanban as a <span class="role-badge">${role}</span>.</p>

        <div class="card">
          <p style="margin-top: 0;"><strong>Role: ${role}</strong></p>
          <p style="margin: 10px 0; color: #64748b; font-size: 14px;">
            ${roleDesc}
          </p>
        </div>

        ${
          personalmessage
            ? `
        <div class="personal-message">
          <strong>${inviterName} wrote:</strong><br>
          "${personalmessage}"
        </div>
        `
            : ""
        }

        <p style="text-align: center;">
          <a href="${acceptLink}" class="button">Accept Invitation</a>
        </p>

        <p style="font-size: 14px; color: #64748b;">Or copy this link:</p>
        <p style="background: white; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px; border: 1px solid #e2e8f0;">
          ${acceptLink}
        </p>

        <div class="expiry-warning">
          <strong>⏰ This invitation expires in 7 days</strong>
        </div>

        <p style="margin-top: 30px; font-size: 14px;">
          See you soon,<br>
          The wxKanban Team
        </p>

        <div class="footer">
          <p>wxKanban • Project Management with AI</p>
          <p>© 2026 wxKanban. All rights reserved.</p>
        </div>
      </div>
    </div>
  </body>
</html>
  `;
}

/**
 * Generate plain text version of invitation email
 */
export function getInvitationEmailText(
  invitedUserEmail: string,
  inviterName: string,
  companyName: string,
  role: string,
  personalmessage: string | null,
  acceptLink: string
): string {
  const roleDescriptions: Record<string, string> = {
    ADMIN: "Full access to all features and team management",
    MANAGER: "Manage team members and projects",
    DEVELOPER: "View and manage your assigned tasks",
  };

  const roleDesc = roleDescriptions[role] || role;

  return `
You're Invited! Join ${companyName} on wxKanban

Hi ${invitedUserEmail},

${inviterName} has invited you to join ${companyName} on wxKanban as a ${role}.

Role: ${role}
${roleDesc}

${personalmessage ? `\n${inviterName} wrote:\n"${personalmessage}"\n` : ""}

Accept Invitation: ${acceptLink}

This invitation expires in 7 days.

Best regards,
The wxKanban Team

wxKanban • Project Management with AI
© 2026 wxKanban. All rights reserved.
  `.trim();
}

// [SCOPE 037 / T016] BEGIN — engagement invitation email (HTML)
export function getEngagementInvitationEmailHTML(
  invitedEmail: string,
  inviterName: string,
  clientCompanyName: string,
  personalMessage: string | null,
  acceptLink: string,
): string {
  return `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #0ea5e9, #06b6d4); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
      .card { background: white; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0; margin: 20px 0; }
      .button { display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
      .personal-message { background: #f1f5f9; padding: 15px; border-left: 3px solid #0ea5e9; margin: 20px 0; border-radius: 4px; font-style: italic; }
      .expiry-warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 14px; }
      .explainer { background: #eff6ff; padding: 15px; border-radius: 4px; font-size: 14px; color: #1e3a8a; margin: 15px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">Consulting Engagement Invitation</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">${clientCompanyName} wants to engage your firm on wxKanban</p>
      </div>
      <div class="content">
        <p>Hi ${invitedEmail},</p>

        <p><strong>${inviterName}</strong> at <strong>${clientCompanyName}</strong> has invited your consulting firm to a scoped engagement on wxKanban.</p>

        <div class="explainer">
          A consulting engagement gives your firm access to specific scopes or tasks inside ${clientCompanyName}'s projects, with time tracking and B2B invoicing inside the platform. Your firm stays its own tenant — you decide which of your members work on what.
        </div>

        ${
          personalMessage
            ? `
        <div class="personal-message">
          <strong>${inviterName} wrote:</strong><br>
          "${personalMessage}"
        </div>
        `
            : ""
        }

        <p style="text-align: center;">
          <a href="${acceptLink}" class="button">Review &amp; Accept Engagement</a>
        </p>

        <p style="font-size: 14px; color: #64748b;">Or copy this link:</p>
        <p style="background: white; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px; border: 1px solid #e2e8f0;">
          ${acceptLink}
        </p>

        <div class="expiry-warning">
          <strong>⏰ This invitation expires in 7 days</strong>
        </div>

        <p style="margin-top: 30px; font-size: 14px;">
          If your firm doesn't yet have a wxKanban tenant, you'll be guided through a quick setup when you accept.
        </p>

        <div class="footer">
          <p>wxKanban • Project Management with AI</p>
          <p>© 2026 wxKanban. All rights reserved.</p>
        </div>
      </div>
    </div>
  </body>
</html>
  `;
}
// [SCOPE 037 / T016] END

// [SCOPE 037 / T016] BEGIN — engagement invitation email (text)
export function getEngagementInvitationEmailText(
  invitedEmail: string,
  inviterName: string,
  clientCompanyName: string,
  personalMessage: string | null,
  acceptLink: string,
): string {
  return `
Consulting Engagement Invitation — ${clientCompanyName} on wxKanban

Hi ${invitedEmail},

${inviterName} at ${clientCompanyName} has invited your consulting firm to a scoped engagement on wxKanban.

A consulting engagement gives your firm access to specific scopes or tasks inside ${clientCompanyName}'s projects, with time tracking and B2B invoicing inside the platform. Your firm stays its own tenant — you decide which of your members work on what.
${personalMessage ? `\n${inviterName} wrote:\n"${personalMessage}"\n` : ""}

Review & Accept: ${acceptLink}

This invitation expires in 7 days.

If your firm doesn't yet have a wxKanban tenant, you'll be guided through a quick setup when you accept.

— The wxKanban Team

wxKanban • Project Management with AI
© 2026 wxKanban. All rights reserved.
  `.trim();
}
// [SCOPE 037 / T016] END

export function getPasswordResetEmailHTML(
  resetLink: string,
  userEmail: string
): string {
  return `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
      .button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
      .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">Reset Your Password</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">wxKanban account security</p>
      </div>
      <div class="content">
        <p>Hi ${userEmail},</p>
        <p>We received a request to reset the password on your <strong>wxKanban</strong> account. Click the button below to choose a new password.</p>
        <p style="text-align: center;">
          <a href="${resetLink}" class="button">Reset Password</a>
        </p>
        <p style="font-size: 14px; color: #64748b;">Or copy this link:</p>
        <p style="background: white; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px; border: 1px solid #e2e8f0;">
          ${resetLink}
        </p>
        <div class="warning">
          <strong>⏰ This link expires in 1 hour</strong>
          <p style="margin: 5px 0 0 0;">If you didn't request a password reset, ignore this email — your password will not change.</p>
        </div>
        <p style="margin-top: 30px; font-size: 14px;">
          Best regards,<br>
          The wxKanban Team
        </p>
        <div class="footer">
          <p>wxKanban • Project Management with AI</p>
          <p>© 2026 wxKanban. All rights reserved.</p>
        </div>
      </div>
    </div>
  </body>
</html>
  `;
}

export function getPasswordResetEmailText(
  resetLink: string,
  userEmail: string
): string {
  return `
Reset Your Password - wxKanban

Hi ${userEmail},

We received a request to reset the password on your wxKanban account. Use the link below to choose a new password.

Reset Password: ${resetLink}

This link expires in 1 hour. If you didn't request a password reset, ignore this email — your password will not change.

Best regards,
The wxKanban Team

wxKanban • Project Management with AI
© 2026 wxKanban. All rights reserved.
  `.trim();
}

/**
 * Generate welcome email after successful registration
 */
export function getWelcomeEmailHTML(userEmail: string): string {
  return `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #10b981, #34d399); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
      .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
      .feature-list { margin: 20px 0; }
      .feature-item { margin: 10px 0; padding-left: 20px; position: relative; }
      .feature-item:before { content: "✓"; position: absolute; left: 0; color: #10b981; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">Welcome to wxKanban! 🚀</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">Your account is ready</p>
      </div>
      <div class="content">
        <p>Hi ${userEmail},</p>

        <p>Welcome to <strong>wxKanban</strong> – your AI-powered project management system!</p>

        <p><strong>What you can do now:</strong></p>
        <div class="feature-list">
          <div class="feature-item">Create and manage projects</div>
          <div class="feature-item">Connect your favorite PM tools (Jira, Monday, Asana, Trello)</div>
          <div class="feature-item">Track time and generate invoices</div>
          <div class="feature-item">Collaborate with your team</div>
          <div class="feature-item">Get AI-powered task suggestions</div>
        </div>

        <p style="text-align: center;">
          <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard" class="button">Go to Dashboard</a>
        </p>

        <p>If you have any questions, feel free to reach out to our support team.</p>

        <p style="margin-top: 30px; font-size: 14px;">
          Best regards,<br>
          The wxKanban Team
        </p>

        <div class="footer">
          <p>wxKanban • Project Management with AI</p>
          <p>© 2026 wxKanban. All rights reserved.</p>
        </div>
      </div>
    </div>
  </body>
</html>
  `;
}

/**
 * Generate plain text version of welcome email
 */
export function getWelcomeEmailText(userEmail: string): string {
  return `
Welcome to wxKanban!

Hi ${userEmail},

Welcome to wxKanban – your AI-powered project management system!

What you can do now:
✓ Create and manage projects
✓ Connect your favorite PM tools (Jira, Monday, Asana, Trello)
✓ Track time and generate invoices
✓ Collaborate with your team
✓ Get AI-powered task suggestions

Go to Dashboard: ${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard

If you have any questions, feel free to reach out to our support team.

Best regards,
The wxKanban Team

wxKanban • Project Management with AI
© 2026 wxKanban. All rights reserved.
  `.trim();
}

/**
 * Subscription restart email (SCOPE-067) — sent when a payment fails so the
 * customer can update their card via the Stripe Customer Portal and restore
 * service. `portalLink` is a Stripe-hosted billing portal session URL.
 */
export function getSubscriptionRestartEmailHTML(
  portalLink: string,
  companyName: string
): string {
  return `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
      .button { display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
      .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">Action needed: update your billing</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">wxKanban subscription</p>
      </div>
      <div class="content">
        <p>Hi ${companyName},</p>

        <p>We were unable to process the payment for your <strong>wxKanban</strong> subscription. Your account is still active, but to avoid an interruption in service, please update your payment method.</p>

        <p style="text-align: center;">
          <a href="${portalLink}" class="button">Update Billing & Restart</a>
        </p>

        <p style="font-size: 14px; color: #64748b;">Or copy this link:</p>
        <p style="background: white; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px; border: 1px solid #e2e8f0;">
          ${portalLink}
        </p>

        <div class="warning">
          <strong>Why am I getting this?</strong>
          <p style="margin: 5px 0 0 0;">A recent charge for your subscription failed (often an expired or declined card). Updating your card restores billing automatically — no other action needed.</p>
        </div>

        <p style="margin-top: 30px; font-size: 14px;">
          Best regards,<br>
          The wxKanban Team
        </p>

        <div class="footer">
          <p>wxKanban • Project Management with AI</p>
          <p>© 2026 wxKanban. All rights reserved.</p>
        </div>
      </div>
    </div>
  </body>
</html>
  `;
}

/**
 * Plain-text version of the subscription restart email.
 */
export function getSubscriptionRestartEmailText(
  portalLink: string,
  companyName: string
): string {
  return `
Action needed: update your billing — wxKanban

Hi ${companyName},

We were unable to process the payment for your wxKanban subscription. Your
account is still active, but to avoid an interruption in service, please
update your payment method.

Update Billing & Restart:
${portalLink}

A recent charge for your subscription failed (often an expired or declined
card). Updating your card restores billing automatically — no other action
needed.

Best regards,
The wxKanban Team

wxKanban • Project Management with AI
© 2026 wxKanban. All rights reserved.
  `.trim();
}

// [SCOPE 023 / T110] BEGIN — signup-invitation (promo) email

// [SCOPE 023 / T116] BEGIN — locale-aware date + price for the invite email
/**
 * FR-002a.2. Both were hardcoded to en-US / "$X.XX", which would have sent a
 * French prospect an otherwise-French email containing "July 15, 2026".
 * Falls back to the en-US rendering if Intl rejects the locale, rather than
 * throwing inside an email render.
 */
function formatInviteDate(d: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }
}

/** Prices are USD everywhere (Stripe charges USD); only the formatting is localized. */
function formatInvitePrice(amount: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}
// [SCOPE 023 / T116] END

// [SCOPE 023 / T114] BEGIN — escape an admin-authored message for HTML email
/**
 * FR-002a.1: the personal message is free text typed by an admin. Escape it
 * rather than interpolating raw (which is what getInvitationEmailHTML does at
 * :155): a stray `<` should not break the email, and an admin should not be able
 * to inject markup into a message that goes to a prospect. Newlines become <br>
 * so the paragraphs the admin typed survive.
 */
function escapeMessageHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r?\n/g, "<br />");
}
// [SCOPE 023 / T114] END

/**
 * Spec 023 FR-002a — invite a prospect to register with a free promotional
 * period on a pinned plan.
 *
 * Separate from getInvitationEmailHTML on purpose: that one is hardcoded to
 * team-invite framing (an inviter, a company the recipient is joining, and a
 * role table) and none of it applies to someone who has no account yet.
 *
 * [SCOPE 023 / T114] `personalMessage` is the admin's own words (FR-002a.1). It
 * is additive only — the link, pricing and expiry below are not editable, so no
 * edit can produce an invitation email without a working link.
 */
export function getSignupInvitationEmailHTML(
  invitedEmail: string,
  planLabel: string,
  promoDays: number,
  monthlyPrice: number,
  expiresAt: Date,
  registerLink: string,
  personalMessage?: string | null,
  locale: string = "en-US", // [SCOPE 023 / T116] FR-002a.2
): string {
  const s = inviteStringsFor(locale);
  const messageBlock =
    personalMessage && personalMessage.trim()
      ? `<div class="card" style="border-left:3px solid #2563eb;">
          <p style="margin:0;">${escapeMessageHtml(personalMessage.trim())}</p>
        </div>`
      : "";

  // [SCOPE 023 / T116] Format for the recipient's language, not the server's.
  // This was hardcoded "en-US", which would have sent a French prospect
  // "July 15, 2026" instead of "15 juillet 2026".
  const dateStr = formatInviteDate(expiresAt, locale);
  const priceStr = formatInvitePrice(monthlyPrice, locale);

  return `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #2563eb, #0ea5e9); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
      .card { background: white; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0; margin: 20px 0; }
      .button { display: inline-block; background: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; }
      .muted { color: #64748b; font-size: 13px; }
      .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin:0;">${s.heading}</h1>
      </div>
      <div class="content">
        <p>${s.greeting}</p>
        ${messageBlock}
        <p>${fillInvite(s.intro, { plan: planLabel, days: promoDays })}</p>

        <div class="card">
          <p style="margin:0 0 8px 0;"><strong>${fillInvite(s.freeFor, { days: promoDays })}</strong></p>
          <p style="margin:0 0 8px 0;">${fillInvite(s.thenPrice, { price: priceStr })}</p>
          <p class="muted" style="margin:0;">${s.cardNote}</p>
        </div>

        <p style="text-align:center;">
          <a class="button" href="${registerLink}">${s.cta}</a>
        </p>

        <p class="muted">
          ${fillInvite(s.boundAndExpires, { email: invitedEmail, date: dateStr })}
        </p>
        <p class="muted">
          ${s.fallbackLink}<br />
          ${registerLink}
        </p>
      </div>
      <div class="footer">
        ${s.footerTagline}<br />
        ${s.footerRights}
      </div>
    </div>
  </body>
</html>
  `.trim();
}

export function getSignupInvitationEmailText(
  invitedEmail: string,
  planLabel: string,
  promoDays: number,
  monthlyPrice: number,
  expiresAt: Date,
  registerLink: string,
  personalMessage?: string | null,
  locale: string = "en-US", // [SCOPE 023 / T116] FR-002a.2
): string {
  const s = inviteStringsFor(locale);

  // [SCOPE 023 / T114] Same message as the HTML part — a plain-text reader must
  // not silently lose what the admin wrote.
  const messageBlock =
    personalMessage && personalMessage.trim()
      ? `${personalMessage.trim()}\n\n`
      : "";

  // The strings carry HTML for the rich part; strip it for plain text rather
  // than maintaining a second set that could drift out of step.
  const plain = (t: string) => t.replace(/<[^>]+>/g, "");
  const dateStr = formatInviteDate(expiresAt, locale);
  const priceStr = formatInvitePrice(monthlyPrice, locale);

  return `
${s.heading}

${messageBlock}${plain(fillInvite(s.intro, { plan: planLabel, days: promoDays }))}

  ${fillInvite(s.freeFor, { days: promoDays })} — ${fillInvite(s.thenPrice, { price: priceStr })}

${s.cardNote}

${s.cta}:
${registerLink}

${plain(fillInvite(s.boundAndExpires, { email: invitedEmail, date: dateStr }))}

${s.footerTagline}
${s.footerRights}
  `.trim();
}

/** Default subject for a locale (T116) — used by the compose step. */
export function getSignupInvitationEmailSubject(
  promoDays: number,
  locale: string = "en-US",
): string {
  return fillInvite(inviteStringsFor(locale).subject, { days: promoDays });
}
// [SCOPE 023 / T110] END
