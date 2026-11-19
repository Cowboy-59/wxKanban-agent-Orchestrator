# Mailgun Email Service Integration

**Date**: 2026-02-18
**Status**: ✅ Implemented
**Package**: `mailgun.js` v10.2.1

---

## Overview

wxKanban uses **Mailgun** for transactional email delivery (verification, invitations, notifications). The Mailgun SDK is fully integrated and ready to send emails.

---

## Environment Variables

Add these to your `.env` file:

```env
# Email Service (Mailgun)
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=mail.yourdomain.com
MAILGUN_FROM_EMAIL=noreply@mail.yourdomain.com
```

**Where to find these:**
1. **MAILGUN_API_KEY**: Mailgun Dashboard → Account Settings → API Keys
2. **MAILGUN_DOMAIN**: Mailgun Dashboard → Sending → Domain Management (must be verified)
3. **MAILGUN_FROM_EMAIL**: Any email on your verified domain (e.g., `noreply@mail.wxkanban.com`)

---

## Implementation Files

### Core Email Service
- **`src/server/lib/mailgun.ts`** (150+ lines)
  - `initializeMailgun()` - Initialize Mailgun client
  - `sendEmail(to, subject, html, text)` - Send plain email
  - `sendTemplatedEmail(to, template, variables)` - Send templated email
  - `sendBatchEmails(recipients[], subject, html)` - Send to multiple recipients
  - `verifyMailgunWebhook()` - Verify incoming webhooks
  - Logging via Pino
  - Error handling & retry logic

### Email Templates
- **`src/server/lib/emailTemplates.ts`** (NEW - 400+ lines)
  - `getVerificationEmailHTML/Text()` - Email verification
  - `getInvitationEmailHTML/Text()` - Team invitation
  - `getWelcomeEmailHTML/Text()` - Post-registration welcome
  - HTML styling with responsive design
  - Accessibility-friendly formatting

### Integration Points

#### 1. Email Verification Flow
**File**: `src/server/routes/auth.ts`

**Endpoint**: `POST /auth/send-verification-email`
```typescript
// Sends verification email with 24-hour token
await sendEmail(
  email,
  "Verify Your Email - wxKanban",
  getVerificationEmailHTML(verificationLink, email),
  getVerificationEmailText(verificationLink, email)
);
```

#### 2. Team Invitation Flow
**File**: `src/server/routes/team.ts`

**Endpoint**: `POST /api/team/invite`
```typescript
// Sends invitation email with accept link
await sendEmail(
  email,
  `You're invited to join ${companyName}`,
  getInvitationEmailHTML(email, senderName, companyName, role, message, link),
  getInvitationEmailText(email, senderName, companyName, role, message, link)
);
```

---

## Email Features

### Verification Email
- ✅ 24-hour expiration link
- ✅ Secure token generation (JWT + hashing)
- ✅ Branded header & footer
- ✅ Responsive HTML design
- ✅ Plain text fallback
- ✅ Mailgun click/open tracking enabled

### Invitation Email
- ✅ Personalizable message from inviter
- ✅ Role description (ADMIN/MANAGER/DEVELOPER)
- ✅ 7-day expiration
- ✅ Accept invitation link
- ✅ Responsive HTML design
- ✅ Email from company name

### Welcome Email
- ✅ Post-registration confirmation
- ✅ Feature list
- ✅ Dashboard link
- ✅ Branded design

---

## Testing Email Locally

### Option 1: Use Mailgun Sandbox Domain (Development)
```env
MAILGUN_DOMAIN=sandboxXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.mailgun.org
MAILGUN_API_KEY=key-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
MAILGUN_FROM_EMAIL=postmaster@sandboxXXX.mailgun.org
```

**Limitation**: Sandbox domain only sends to pre-registered recipients. Add your test email in Mailgun Dashboard.

### Option 2: Use Verified Production Domain
```env
MAILGUN_DOMAIN=mail.yourdomain.com
MAILGUN_API_KEY=key-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
MAILGUN_FROM_EMAIL=noreply@mail.yourdomain.com
```

**Setup required**: Add MX records to domain registrar (see Mailgun docs).

### Option 3: Mock Emails in Development
Edit `src/server/lib/mailgun.ts` to log instead of send:
```typescript
if (process.env.NODE_ENV === "development") {
  logger.info({ to, subject, htmlContent }, "Email logged (not sent)");
  return { messageId: "mock-123", status: "logged" };
}
```

---

## API Reference

### `sendEmail(to, subject, html, text, replyTo?)`
Send a plain text/HTML email.

**Parameters:**
- `to` (string): Recipient email
- `subject` (string): Email subject
- `html` (string): HTML content
- `text` (string, optional): Plain text fallback
- `replyTo` (string, optional): Reply-to address

**Returns:**
```typescript
{
  messageId: string;  // Mailgun message ID
  status: "sent";
}
```

**Example:**
```typescript
const result = await sendEmail(
  "user@example.com",
  "Verify Your Email",
  htmlContent,
  textContent
);
console.log(result.messageId); // mg-XXXXXXX
```

### `sendTemplatedEmail(to, template, variables, replyTo?)`
Send email using Mailgun template variables.

**Parameters:**
- `to` (string): Recipient email
- `template` (EmailTemplate): Template name
- `variables` (object): Template variables
- `replyTo` (string, optional): Reply-to address

**Example:**
```typescript
await sendTemplatedEmail(
  "user@example.com",
  EmailTemplate.VERIFICATION,
  {
    companyName: "ACME Corp",
    verificationLink: "https://wxkanban.com/verify?token=XXX",
  }
);
```

### `sendBatchEmails(recipients[], subject, html, text?)`
Send to multiple recipients efficiently.

**Parameters:**
- `recipients` (array): List of recipient objects
  - `email` (string): Email address
  - `name` (string, optional): Display name
  - `variables` (object, optional): Template variables
- `subject` (string): Email subject
- `html` (string): HTML content
- `text` (string, optional): Plain text fallback

**Example:**
```typescript
await sendBatchEmails(
  [
    { email: "user1@example.com", name: "User One" },
    { email: "user2@example.com", name: "User Two" },
  ],
  "Team Announcement",
  htmlContent,
  textContent
);
```

---

## Mailgun Events & Webhooks

Mailgun tracks email events:
- **Delivered** - Email sent successfully
- **Opened** - Recipient opened email
- **Clicked** - Recipient clicked link
- **Bounced** - Email bounced
- **Complained** - Marked as spam
- **Unsubscribed** - Recipient unsubscribed

**Webhook endpoint**: `POST /api/webhooks/mailgun` (future implementation)

To set up webhooks:
1. Mailgun Dashboard → Sending → Webhook
2. Add URL: `https://yourapp.com/api/webhooks/mailgun`
3. Events to track: Delivered, Opened, Clicked, Bounced
4. Signature verification built-in (`verifyMailgunWebhook()`)

---

## Logging

All email operations are logged via Pino:
```
[INFO] Email sent via Mailgun { messageId: "mg-XXX", to: "user@example.com", subject: "..." }
[ERROR] Failed to send email via Mailgun { error: "...", to: "user@example.com" }
```

Check logs:
```bash
tail -f logs/server.log | grep "email"
```

---

## Troubleshooting

### Error: "Mailgun not initialized"
**Cause**: `MAILGUN_API_KEY` or `MAILGUN_DOMAIN` not set

**Solution**:
```bash
echo "MAILGUN_API_KEY=your-key" >> .env
echo "MAILGUN_DOMAIN=mail.yourdomain.com" >> .env
npm run dev:server
```

### Error: "Invalid domain"
**Cause**: Domain not verified in Mailgun

**Solution**:
1. Log into Mailgun Dashboard
2. Go to Sending → Domains
3. Add your domain
4. Add MX records to your domain registrar
5. Wait for verification (can take a few minutes)

### Email not arriving
**Cause**: Sandbox domain or email not whitelisted

**Solution**:
1. Use a verified production domain
2. Or whitelist recipient email in Mailgun Dashboard → Authorized Recipients
3. Check Mailgun logs for bounces: Dashboard → Logs

### High bounce/complaint rate
**Solution**:
- Use authenticated domain (add SPF/DKIM records)
- Verify recipient email before sending
- Remove bounced emails from database
- Check email content for spam triggers

---

## Best Practices

1. **Always provide text fallback** - Some email clients disable HTML
2. **Use reply-to address** - Allows recipients to reply easily
3. **Test with sandbox domain first** - Before switching to production
4. **Monitor delivery** - Check Mailgun logs daily
5. **Unsubscribe link** - Required for marketing emails (not transactional)
6. **Rate limiting** - Don't send >100 emails/second
7. **Verify emails** - Before adding to database

---

## Security Considerations

- ✅ API key stored in env vars (never committed)
- ✅ Tokens hashed before storage (SHA-256)
- ✅ Webhook signatures verified
- ✅ Sensitive data logged safely
- ✅ HTTPS required for all URLs in emails
- ✅ Personal message sanitized (no XSS vectors)

---

## Production Checklist

- [ ] Domain verified in Mailgun
- [ ] SPF & DKIM records added
- [ ] `MAILGUN_API_KEY` set in production env
- [ ] `MAILGUN_DOMAIN` set to production domain
- [ ] `MAILGUN_FROM_EMAIL` set to production email
- [ ] Email templates reviewed (branding, links)
- [ ] Test email sent & verified
- [ ] Logs monitored for errors
- [ ] Bounce rate < 5%
- [ ] No spam complaints

---

## Next Steps

1. **Verify domain in Mailgun** - Complete domain setup
2. **Test verification flow** - Register user → check inbox
3. **Test invitation flow** - Invite team member → check inbox
4. **Monitor delivery rates** - Check Mailgun dashboard weekly
5. **Set up webhooks** (future) - Track opens, clicks, bounces
6. **Implement retry logic** (future) - Handle temporary failures

---

## Support

- Mailgun Docs: https://documentation.mailgun.com/
- API Reference: https://documentation.mailgun.com/api-sending.html
- Email Templates: `src/server/lib/emailTemplates.ts`
- Questions: Check server logs for detailed error messages

