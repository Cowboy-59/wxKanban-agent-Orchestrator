# Quickstart: Registration Feature Development

**Feature**: Spec 003 (Registration) | **Target**: Local development and testing | **Duration**: ~30 minutes setup

---

## Prerequisites

Ensure you have these installed and running:

```bash
# Backend
- Node.js 20 LTS
- npm 9+
- PostgreSQL 15+
- Redis (for job queue)

# Frontend (React)
- All of the above

# External Services
- Stripe test account (free at stripe.com)
- Mailgun account (free tier available at mailgun.com)
```

---

## Part 1: Environment Setup

### 1.1 Create `.env` file

Copy the template and fill in your test credentials:

```bash
cp .env.example .env
```

**Required variables for registration**:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/wxkanban_dev

# Authentication (JWT)
JWT_SECRET=your-32-character-random-string-here-12345678
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_your_test_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_test_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_test_your_webhook_secret_here

# Mailgun (Email Service)
MAILGUN_API_KEY=your_mailgun_api_key_here
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_SMTP_USER=postmaster@mg.yourdomain.com
MAILGUN_SMTP_PASS=your_mailgun_smtp_password
MAILGUN_FROM_EMAIL=noreply@yourdomain.com

# Redis (Job Queue)
REDIS_URL=redis://localhost:6379

# Email Settings
EMAIL_QUEUE_CONCURRENCY=5
EMAIL_RETRY_MAX_ATTEMPTS=4

# Frontend
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_test_publishable_key_here

# Environment
NODE_ENV=development
```

**Test credentials for Stripe**:

Get these from [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys):

1. Log in to Stripe
2. Go to Developers → API Keys
3. Copy `Restricted API key` to `STRIPE_SECRET_KEY`
4. Copy `Publishable key` to both `STRIPE_PUBLISHABLE_KEY`
5. Go to Developers → Webhooks
6. Create endpoint: `http://localhost:3001/api/webhooks/stripe`
7. Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

**Test credentials for Mailgun**:

Get these from [Mailgun Dashboard](https://app.mailgun.com/app/account/security/api_keys):

1. Log in to Mailgun
2. Go to Account Settings → API & SMTP Credentials
3. Copy API Key to `MAILGUN_API_KEY`
4. Copy Domain to `MAILGUN_DOMAIN` (usually mg.xxxx.mailgun.org)
5. Copy SMTP credentials

---

### 1.2 Verify Services Running

```bash
# Check PostgreSQL
psql -U postgres -c "\l"  # Should list databases

# Check Redis
redis-cli ping  # Should return "PONG"

# Start if not running:
# macOS:
#   brew services start postgresql
#   brew services start redis

# Linux:
#   sudo systemctl start postgresql
#   sudo systemctl start redis-server

# Windows (WSL):
#   sudo service postgresql start
#   sudo service redis-server start
```

---

## Part 2: Database Setup

### 2.1 Run Migrations

```bash
cd /path/to/wxKanban

# Generate migrations (if new schema files added)
npm run db:generate

# Apply migrations to development database
npm run db:migrate
```

**Expected output**:
```
✓ Applying 0002_migrate_userprofile_to_uuid_simple.sql
✓ Applying 0003_standardize_primary_keys_to_id.sql
✓ Applying 0004_fix_schema_mismatches.sql
✓ Applying 0005_add_missing_columns.sql
✓ Applying 0006_comprehensive_schema_sync.sql
✓ Applying 0007_final_schema_fixes.sql
✓ Database migration complete
```

### 2.2 Verify Database Schema

```bash
# Connect to database
psql $DATABASE_URL

# List tables
\dt

# Expected tables: company, user, userinvitation, session, companyauditlog

# Quit psql
\q
```

---

## Part 3: Start Development Servers

### 3.1 Start Backend (Express)

```bash
# Terminal 1: Backend
cd /path/to/wxKanban
npm run dev:server

# Expected output:
# ✓ Express server listening on port 3001
# ✓ Database connected
# ✓ Email queue initialized
# ✓ Stripe webhooks ready
```

### 3.2 Start Frontend (React)

```bash
# Terminal 2: Frontend
cd /path/to/wxKanban
npm run dev:client

# Expected output:
# ✓ Vite server ready at http://localhost:3000
# ✓ HMR ready
```

### 3.3 Start Stripe CLI (Webhooks)

```bash
# Terminal 3: Stripe webhooks
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# Expected output:
# > Ready! Your webhook signing secret is: whsec_...
# > Forwarding events to http://localhost:3001/api/webhooks/stripe
```

---

## Part 4: Test Registration Flow

### 4.1 Register Company (All Tiers)

**URL**: http://localhost:3000/register

#### Test Case 1: FREE Tier Registration

1. **Company Info**:
   - Company Name: "Test Corp Free"
   - Billing Email: "billing@test-free.com"
   - Address: "123 Test St, San Francisco, CA 94105"
   - Country: "US"
   - Phone: "4155551234"

2. **Tier Selection**: Select "FREE"

3. **Admin Account**:
   - Email: "admin@test-free.com"
   - Password: "TestPass123!@#"
   - First Name: "Admin"

4. **Expected Result**:
   - ✅ Company created (no Stripe charge)
   - ✅ Admin account created with ADMIN role
   - ✅ Redirect to dashboard
   - ✅ Verification email sent (check Mailgun dashboard)

#### Test Case 2: CONSULTANT Tier Registration

1. **Company Info**:
   - Company Name: "Test Corp Consultant"
   - Other fields: Same as Test Case 1

2. **Tier Selection**: Select "CONSULTANT" ($19.95/month)

3. **Payment**:
   - Card Number: 4242 4242 4242 4242
   - Expiry: 12/26
   - CVC: 123

4. **Expected Result**:
   - ✅ SetupIntent created
   - ✅ Card validated
   - ✅ Subscription created in Stripe
   - ✅ First charge processed
   - ✅ Company subscription marked ACTIVE
   - ✅ Redirect to dashboard

#### Test Case 3: Payment Failure (Test)

1. **Company Info**: Same setup
2. **Tier Selection**: CONSULTANT
3. **Payment**:
   - Card Number: 4000 0000 0000 0002 (decline)
   - Expiry: 12/26
   - CVC: 123

4. **Expected Result**:
   - ✅ Payment declined error displayed
   - ✅ User can retry or select different tier
   - ✅ Company info retained

### 4.2 Verify Registration in Database

```bash
psql $DATABASE_URL

# List registered companies
SELECT companyid, companyname, subscriptiontier, subscriptionstatus
FROM company;

# List admin users
SELECT userid, email, role, status
FROM "user"
WHERE role = 'ADMIN';

# Check audit log
SELECT userid, action, resourcetype, status, createdat
FROM companyauditlog
ORDER BY createdat DESC
LIMIT 10;
```

---

## Part 5: Test Admin Dashboard & Invitations

### 5.1 Login as Admin

1. **URL**: http://localhost:3000/login
2. **Email**: admin@test-free.com
3. **Password**: TestPass123!@#

### 5.2 Access Admin Dashboard

**URL**: http://localhost:3000/admin/dashboard

**Expected Elements**:
- ✅ Company name & subscription tier
- ✅ Active users count (initially: 1)
- ✅ Projects count (initially: 0)
- ✅ Tasks count (initially: 0)
- ✅ Onboarding checklist
- ✅ "Invite Team Members" button

### 5.3 Send Single Invitation

1. Click "Invite Team Members"
2. **Email**: "john@example.com"
3. **Role**: DEVELOPER
4. **Message**: "Welcome to our team!"

**Expected Result**:
- ✅ Invitation created (status: PENDING)
- ✅ Invitation queued in BullMQ
- ✅ Email sent to john@example.com (within 1 minute)

**Verify in Database**:
```bash
psql $DATABASE_URL

SELECT invitationid, invitedemail, role, status, expiresat
FROM userinvitation
WHERE invitedemail = 'john@example.com';
```

### 5.4 Send Bulk Invitations

1. Click "Invite Team Members" → "Bulk Upload"
2. **CSV File**:
   ```csv
   email,role
   alice@example.com,MANAGER
   bob@example.com,DEVELOPER
   charlie@example.com,DEVELOPER
   ```
3. Click "Upload & Send"

**Expected Result**:
- ✅ All 3 invitations queued
- ✅ Batch ID returned (for tracking)
- ✅ Progress updates visible (if Socket.IO connected)
- ✅ Emails sent over 30 seconds (rate limited)

### 5.5 Accept Invitation (Test Acceptance)

1. **Check inbox** for email from "noreply@yourdomain.com"
2. **Click invitation link**: Contains unique `invitationToken`
3. **Create Account**:
   - Password: "JohnPass123!@#"
   - First Name: "John"

**Expected Result**:
- ✅ User account created
- ✅ Role set to DEVELOPER (from invitation)
- ✅ Invitation status: ACCEPTED
- ✅ Redirect to login
4. **Login with new account**
   - Email: john@example.com
   - Password: JohnPass123!@#

---

## Part 6: Debugging Checklist

### 6.1 Email Not Sending?

**Check Backend Logs**:
```bash
# Terminal 1 output
# Look for: "Email job queued" or error messages

# Or check BullMQ job status
npm run debug:queue  # Custom script to inspect queue
```

**Check Mailgun**:
1. Log in to Mailgun dashboard
2. Go to Logs → Events
3. Should see "delivered" or "failed" events
4. If failed: Check bounce reason

### 6.2 Payment Not Processing?

**Check Stripe Test Data**:
```bash
stripe listen --trigger invoice.created  # Manually trigger webhook
stripe listen --trigger invoice.paid     # Test payment flow

# Check webhook logs in Stripe Dashboard
# Dashboard → Developers → Webhooks → Events
```

**Verify in Logs**:
- Look for `stripe.subscriptions.create` call
- Check `subscription.status` (should be 'active' for successful payment)

### 6.3 Database Issues?

**Reset Database** (dev only):
```bash
# WARNING: Destructive - use dev database only!
npm run db:reset

# This will:
# 1. Drop all tables
# 2. Re-create schema from migrations
# 3. Re-seed test data (if configured)
```

### 6.4 JWT Issues?

**Verify Token in Browser**:
1. Open DevTools → Application → Cookies
2. Should see `refreshToken` (HttpOnly, Secure in production)
3. Access token in memory (check console logs during development)

**Decode JWT** (debugging):
```bash
# Online tool: jwt.io
# Paste access token to see claims
```

---

## Part 7: Test Scenarios

### Test Scenario 1: Complete Registration → Invitation → Acceptance

```
Time: ~5 minutes

1. Register FREE company (admin: alice@company.com)
2. Login as admin
3. Invite bob@example.com as MANAGER
4. Accept invitation, create bob's account
5. Login as bob
6. Verify roles in dashboard (alice = ADMIN, bob = MANAGER)
```

**Success Criteria**:
- ✅ Both users can login
- ✅ Role permissions respected (bob can't access company settings)
- ✅ Audit log shows both registrations + invitations

### Test Scenario 2: Payment Processing

```
Time: ~3 minutes

1. Register CONSULTANT tier company
2. Stripe processes $19.95 payment
3. Check subscription status in Stripe Dashboard
4. Verify webhook received (invoice.paid)
5. Check company.subscriptionstatus = 'ACTIVE' in DB
```

**Success Criteria**:
- ✅ Stripe dashboard shows successful charge
- ✅ Invoice records created
- ✅ No 3D Secure required (test card 4242...)

### Test Scenario 3: Invitation Expiry

```
Time: ~7 days (simulated)

1. Send invitation to test@example.com
2. Skip clicking link for 7+ days
3. System marks invitation as EXPIRED (background job)
4. User can't accept after expiry
```

**Success Criteria** (in dev, use timestamp manipulation):
- ✅ Expired invitations blocked from acceptance
- ✅ Status updated to EXPIRED
- ✅ User directed to request new invitation

---

## Part 8: Performance Testing

### 8.1 Bulk Invitation Performance

```bash
# Generate 50-email CSV
npm run test:generate-csv

# Time the bulk operation
time npm run test:send-bulk-invitations

# Expected: < 5 seconds for queueing, emails sent over 50 seconds
```

### 8.2 Dashboard Load Time

```bash
# Lighthouse audit
npm run test:lighthouse-dashboard

# Target: < 2 seconds load time
```

### 8.3 Database Query Performance

```bash
# Check query times in PostgreSQL logs
npm run debug:query-performance

# Verify indexes are being used
EXPLAIN ANALYZE SELECT * FROM company WHERE subscriptiontier = 'CONSULTANT';
```

---

## Part 9: Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Email sent but not delivered" | Mailgun sandbox mode | Verify email in Mailgun sandbox recipients |
| "Stripe API key invalid" | Wrong key or mode | Verify using test keys (sk_test_, pk_test_) |
| "Payment processed but webhook didn't fire" | Stripe CLI not running | Terminal 3: `stripe listen ...` |
| "User can't login after acceptance" | Token not stored | Check browser cookies (refreshToken present?) |
| "Invitation token invalid" | Token hash mismatch | Ensure token sent matches DB hash |
| "Database migration failed" | Schema already exists | Run `npm run db:reset` in dev |

---

## Part 10: Ready for Implementation?

**Checklist**:
- [ ] All 3 services running (PostgreSQL, Redis, Stripe CLI)
- [ ] `.env` file filled with test credentials
- [ ] Database migrations applied successfully
- [ ] Backend server started (port 3001)
- [ ] Frontend server started (port 3000)
- [ ] Successfully registered company and admin account
- [ ] Successfully invited team member
- [ ] Successfully accepted invitation with new user
- [ ] Email received from Mailgun
- [ ] Payment processed through Stripe (if CONSULTANT/ENTERPRISE)

**If all checkboxes pass**: Ready to start Phase 2 (Implementation)

---

## Useful Commands

```bash
# Backend
npm run dev:server           # Start Express API
npm run check-types         # TypeScript validation
npm run lint                # Code linting
npm run test                # Run tests

# Frontend
npm run dev:client          # Start React dev server
npm run build               # Build for production

# Database
npm run db:generate         # Generate migrations
npm run db:migrate          # Apply migrations
npm run db:reset            # Reset database (dev only!)
npm run db:push             # Sync schema to database

# Debugging
npm run debug:queue         # Inspect BullMQ job queue
npm run debug:logs          # Tail server logs
npm run test:send-test-email # Send test email via Mailgun
```

---

## Resources

- **Stripe Docs**: https://docs.stripe.com/billing/subscriptions
- **Mailgun Docs**: https://documentation.mailgun.com/
- **BullMQ Docs**: https://docs.bullmq.io/
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Express Docs**: https://expressjs.com/
- **React Docs**: https://react.dev/

---

**Next Steps**: After successful quickstart, proceed to Phase 2 task generation via `/speckit.tasks`

