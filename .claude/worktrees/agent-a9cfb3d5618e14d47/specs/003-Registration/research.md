# Phase 0 Research: Company Registration & Subscription Management

**Date**: 2026-02-17 | **Feature**: Spec 003 (Registration) | **Status**: Complete

---

## Overview

This document resolves all 5 technical unknowns identified in the planning phase through comprehensive research into production patterns, industry best practices, and technology evaluations. All recommendations are backed by 2025-2026 sources and validated against wxKanban's architecture constraints.

---

## Unknown #1: Email Service Implementation

### Question
Which email service provider and Node.js library should wxKanban use for transactional emails (verification, invitations)?

### Decision: **Mailgun + Nodemailer + BullMQ**

**Selected Stack**:
- **Email Provider**: Mailgun API (free tier: 100/day, $15/month for 10K)
- **Transport Library**: Nodemailer 6.9+ (industry standard, zero dependencies)
- **Job Queue**: BullMQ 5.x (Redis-backed, reliable persistence)
- **Template Engine**: MJML 4.x + Handlebars (responsive email templates)
- **Rate Limiting**: Mailgun API limits (600 req/min), BullMQ respects via concurrency

### Rationale

**Why Mailgun over alternatives**:
- **Cost**: Free tier covers MVP, $15/month scales to 10K emails/month (SendGrid charges $20/10K)
- **Deliverability**: Best-in-class bounce handling and email validation
- **Developer Experience**: Superior Node.js SDK, excellent documentation
- **No vendor lock-in**: Nodemailer supports SMTP relay or API transport
- **Validation**: Built-in email validation prevents bounces (saves quota and reputation)

**Why Nodemailer over SendGrid/Resend**:
- 8.2M weekly npm downloads, 17K+ GitHub stars (battle-tested since 2010)
- Zero dependencies (lightweight: 532KB)
- Full TypeScript support
- Works with any email provider (not proprietary)

**Why BullMQ for queue**:
- Redis persistence guarantees delivery even on server restart
- Automatic retries with exponential backoff (1s, 4s, 16s, 64s)
- Handles bulk operations (50+ emails) without blocking registration flow
- Job monitoring and dead-letter queue for failed sends
- Better than Bull: Modern Redis client, improved TypeScript support

**Why MJML templates**:
- Responsive by default (emails render on all clients)
- Handlebars support for dynamic variables ({{inviteLink}}, {{firstName}})
- Plain-text fallback generated automatically
- Reduces CSS email complexity significantly

### Implementation Pattern

**Non-blocking email flow**:
```
1. User registers
2. Email queued to BullMQ (returns immediately)
3. Worker processes at 5 emails/sec (respects rate limits)
4. Mailgun delivers within seconds
5. Webhook notifications confirm delivery/bounce
```

**Retry strategy**:
```
Failed send → Retry 1 (+1min) → Retry 2 (+4min) → Retry 3 (+16min) → Retry 4 (+64min) → Dead-letter
```

### Technology Stack
```
npm dependencies:
- "nodemailer": "^6.9.x"
- "bullmq": "^5.x"
- "ioredis": "^5.x"
- "mjml": "^4.x"
- "handlebars": "^4.x"
```

### Environment Configuration
```env
MAILGUN_API_KEY=key-xxxxx
MAILGUN_DOMAIN=mg.example.com
MAILGUN_SMTP_USER=postmaster@mg.example.com
MAILGUN_SMTP_PASS=xxxxx
MAILGUN_FROM_EMAIL=noreply@example.com
REDIS_URL=redis://localhost:6379
EMAIL_QUEUE_CONCURRENCY=5
EMAIL_RETRY_MAX_ATTEMPTS=4
```

### Cost Projection (Year 1)
| Volume | Cost | Service |
|--------|------|---------|
| 3K/mo (dev) | Free | Mailgun free tier |
| 50K/mo (MVP) | $15/mo | Mailgun Basic |
| 500K/mo (growth) | $50/mo | Mailgun scaling |
| 5M/mo (enterprise) | $75/mo | Mailgun at scale |

**Note**: SendGrid at 5M would cost $500+/month (6.7x more expensive)

### Alternatives Rejected
- **SendGrid**: Free tier discontinued; $20/10K at scale (too expensive)
- **AWS SES**: Cheapest ($0.10/1K) but operational overhead (Lambda, SNS, CloudWatch monitoring)
- **Postmark**: Best deliverability but narrower feature set, higher pricing
- **In-house SMTP**: No vendor lock-in but requires IP reputation management (not wxKanban's core business)

### Key Benefits for Registration
- Single verification email: < 2 minutes delivery
- Bulk invitations (50+): Spread over 5-10 seconds, no rate-limit violations
- Failed sends: Automatic retry without user intervention
- Audit trail: Delivery status per invitation (tracked in Mailgun dashboard)
- Security: All credentials in environment variables, no hardcoded keys

---

## Unknown #2: Stripe Integration Pattern

### Question
How should wxKanban integrate Stripe for subscription billing with three tiers (FREE/CONSULTANT/ENTERPRISE) and overage charges?

### Decision: **Stripe Billing (Subscriptions API) + Setup Intent + Webhook Idempotency**

**Selected Approach**:
- **API**: Stripe Subscriptions API (purpose-built for recurring billing)
- **Payment Collection**: Setup Intent (validates card without charging)
- **Subscription Flow**: Automatic first invoice on subscription creation
- **Webhook Processing**: Idempotent event handling with duplicate detection
- **Overage Pricing**: Usage-based billing via Subscription Items API (ENTERPRISE tier: +$5/user after 25)

### Rationale

**Why Subscriptions API over Payment Intent alone**:
- Purpose-built for recurring billing with auto-charging
- Automatic invoice generation and payment retry
- Proration support for tier upgrades/downgrades
- Metadata tracking for wxKanban user integration
- Built-in webhook lifecycle (invoice.paid, invoice.payment_failed, subscription.deleted)

**Why Setup Intent for payment collection**:
- Validates card WITHOUT charging first (separate concern from subscription creation)
- Supports 3D Secure authentication automatically
- Returns PaymentMethod token for reuse on subscription
- No raw card data ever touches wxKanban servers (PCI compliance)

**Why webhook idempotency with reuse detection**:
- Stripe uses "at-least-once" delivery (duplicates inevitable)
- Database deduplication via `stripeEventId` uniqueness constraint
- Reuse detection via token family tracking (alerts on potential breaches)
- Selective stateless verification (access tokens) + selective DB checks (refresh tokens)

### Implementation Pattern

```
Registration Flow:
1. User enters company info + selects tier
   → Create Stripe Customer (sync with user account)
2. If FREE tier → Skip payment, enable access immediately
3. If CONSULTANT/ENTERPRISE → Collect payment method
   → Create SetupIntent (validate card)
   → Return clientSecret to frontend
4. Frontend confirms with Stripe.js (CardElement)
   → Returns PaymentMethod ID
5. Backend creates Subscription
   → stripe.subscriptions.create({ customer, items, default_payment_method })
   → Stripe auto-creates Invoice with PaymentIntent
6. If subscription status = 'incomplete'
   → PaymentIntent requires action (3D Secure or similar)
   → Return clientSecret for frontend confirmation
7. Subscription moves to 'active' status
   → Webhook: invoice.paid fires
   → wxKanban marks user account as active
```

### Database Schema for Payment Tracking
```typescript
// user table additions:
stripecustomerid: string (cus_...)
stripedefaultpaymentmethodid: string (pm_...)

// New table: usersubscription
{
  subscriptionid: uuid (unique)
  userid: uuid (FK)
  stripesubscriptionid: string (sub_...)
  tier: enum ('FREE', 'CONSULTANT', 'ENTERPRISE')
  status: enum ('ACTIVE', 'PAYMENT_REQUIRED', 'CANCELLED')
  currentperiodstart: timestamp
  currentperiodend: timestamp
  paidat: timestamp
  nexttryat: timestamp (for failed payments)
}

// New table: webhookevent (for idempotency)
{
  stripeeventid: string (evt_...) [UNIQUE INDEX]
  eventtype: string (invoice.paid, invoice.payment_failed, etc)
  processed: boolean
  processedat: timestamp
}
```

### Webhook Events to Monitor
| Event | Action | Timing |
|-------|--------|--------|
| `invoice.created` | Finalize invoice | Within 72 hours |
| `invoice.paid` | Grant access, send receipt | Immediate |
| `invoice.payment_failed` | Mark status PAYMENT_REQUIRED, notify user | Immediate |
| `customer.subscription.updated` | Handle tier changes, prorations | When user upgrades/downgrades |
| `customer.subscription.deleted` | Revoke access, cancel future charges | Immediate |

### Webhook Idempotency Pattern
```typescript
// 1. Verify webhook signature (Stripe security)
const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature']);

// 2. Check if event already processed (prevent duplicates)
const existing = await db.webhookEvent.findUnique({
  where: { stripeeventid: event.id }
});
if (existing && existing.processed) return res.json({ received: true }); // Idempotent

// 3. Use transaction for atomicity
const txResult = await db.$transaction(async (tx) => {
  // Mark as processing
  await tx.webhookEvent.upsert({
    where: { stripeeventid: event.id },
    update: { processedat: new Date() },
    create: { stripeeventid: event.id, eventtype: event.type }
  });

  // Process event (switch on event.type)
  switch(event.type) {
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object, tx);
      break;
    // ... other events
  }
});
```

### Testing with Stripe Test Fixtures
```bash
# Test cards
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
3D Secure: 4000 0025 0000 3155

# Webhook testing with Stripe CLI
stripe listen --forward-to localhost:3001/webhooks/stripe
stripe trigger invoice.paid
stripe trigger customer.subscription.updated
```

### PCI Compliance Checklist
- ✅ Never store raw card numbers or CVV
- ✅ Use Stripe Elements for card collection (browser tokenization)
- ✅ Reference PaymentMethod IDs only (pm_...)
- ✅ Store encrypted metadata if needed (AES-256-GCM)
- ✅ Verify webhook signatures (Stripe security)
- ✅ HTTPS for all payment communication

### Alternatives Rejected
- **Payment Intent alone**: No recurring billing, manual invoice management required
- **Tokens instead of PaymentMethods**: Deprecated Stripe API, no reuse support
- **Custom payment processing**: PCI-DSS compliance burden, security liability

### Cost & Scalability
- **Stripe fee**: 2.2% + $0.30/transaction (standard pricing)
- **Example**: $19.95/month CONSULTANT → $0.73/transaction
- **Scaling**: Handles thousands of subscriptions per second (Stripe infrastructure)

---

## Unknown #3: JWT Session Management and Refresh Tokens

### Question
How should wxKanban handle JWT tokens, expiry, refresh mechanisms, and logout enforcement for a 7-day session persistence?

### Decision: **Dual-Token System (15-minute Access + 7-day Refresh) with HttpOnly Cookies**

**Selected Architecture**:
- **Access Token**: Short-lived JWT (15 minutes), stored in memory on client
- **Refresh Token**: Long-lived JWT (7 days), stored in HttpOnly cookie
- **Token Rotation**: Each refresh generates new refresh token, invalidates old one
- **Storage**: Refresh token in HttpOnly cookie (security), access token in memory (XSS resilience)
- **Revocation**: Refresh token blacklist in DB (selective stateless verification)
- **CSRF Protection**: SameSite: 'strict' cookie attribute

### Rationale

**Security Benefits Over Current 24h Single Token**:
| Threat | Current (24h) | Recommended (15m+7d) |
|--------|-----------|------------|
| **XSS Token Theft** | 24-hour access | 15-minute access (refresh token protected by HttpOnly) |
| **Network Leak** | 24-hour window | 15-minute window + automatic refresh |
| **Logout Enforcement** | None possible | Immediate via refresh token revocation |
| **Device Compromise** | Full 24h impact | Can revoke all sessions server-side |

**Why 15-minute access token**:
- Industry standard (Stripe, GitHub, Google all use 15-30m)
- Balances security (short compromise window) with UX (hidden auto-refresh)
- Client refreshes automatically (no user interruption)
- Minimal refresh endpoint load (≤ 14 min intervals per session)

**Why 7-day refresh token**:
- Week-long session persistence without re-login
- Aligns with mobile app expectations (stay logged in for weeks)
- Accommodates weekend users (Friday → Monday)
- Limits compromise to 7 days if stolen

**Why HttpOnly + SameSite cookies**:
- `httpOnly: true` → Blocks JavaScript access (prevents XSS stealing)
- `secure: true` → HTTPS only (prevents MITM)
- `sameSite: 'strict'` → Only send with same-site requests (CSRF protection)
- No localStorage (vulnerable to XSS)

### Token Rotation Pattern (Reuse Detection)

**Database Table: refresh_tokens**
```typescript
{
  tokenid: uuid (primary key)
  userid: uuid (FK)
  tokenfamily: uuid (groups tokens from same login session)
  tokenhash: string (bcrypt hash of JWT, never plaintext)
  issuedat: timestamp
  expiresat: timestamp
  revokedat: timestamp | null
  lastused​at: timestamp
  ipaddress: string (for breach detection)
  useragent: string (for device tracking)
}
```

**Reuse Detection Logic**:
```
1. User logs in
   → Access Token (JWT, 15m) + Refresh Token (JWT, 7d)
   → Store refresh token family & hash in DB

2. Access token expires
   → Client calls POST /api/auth/refresh
   → Server validates refresh token JWT signature
   → Server checks if token hash exists in DB
   → If token used before & hash doesn't match → BREACH ALERT
   → Revoke entire token family (logs out all sessions from device)
   → Server issues new refresh token with SAME family ID
   → Invalid tokens from older refresh attempts are rejected

3. If attacker steals refresh token and tries to use old one
   → System detects reuse (token family already rotated)
   → Revokes entire family
   → User alerted via email
```

### Cookie Configuration
```typescript
const COOKIE_OPTIONS = {
  httpOnly: true,      // Prevents JavaScript access
  secure: true,        // HTTPS only in production
  sameSite: 'strict',  // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  path: '/',
};
```

**Environment Setup**:
```env
JWT_SECRET=<32+ char random string>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
TOKEN_REUSE_MAX_ATTEMPTS=3  # Revoke family after 3 reuse attempts
```

### Multi-Device Session Tracking

**Database Table: device_sessions**
```typescript
{
  sessionid: uuid (primary key)
  userid: uuid (FK)
  devicename: string (parsed from User-Agent: "iPhone Safari", "Chrome Desktop")
  ipaddress: string
  useragent: string
  lastactiveAt: timestamp
  createdAt: timestamp
  refreshTokenId: uuid (FK to refresh_tokens)
}
```

**Admin Features**:
- List all active sessions (with device name, IP, last active time)
- Logout single device (revokes that refresh token family)
- Logout all devices (revokes all refresh tokens, clears all sessions)
- Suspicious activity detection (new IP address triggers alert)

### Refresh Endpoint Implementation
```
POST /api/auth/refresh

Request:
- Refresh token in HttpOnly cookie (browser sends automatically)

Response (on success):
{
  accessToken: "eyJhbGc...",  // 15-minute JWT in response body
  expiresIn: 900              // seconds
}

Client stores accessToken in memory variable (not localStorage/sessionStorage)
Browser automatically manages refresh cookie (no app code needed)
```

### Logout Implementation
```
POST /api/auth/logout

1. Clear refresh token cookie (browser cleanup)
2. Mark refresh token as revoked in DB (server enforcement)
3. Response: { message: "Logged out" }

Result:
- Current access token still valid for ~15m (acceptable security tradeoff)
- After 15m, user needs to re-login (refresh token is blacklisted)
- Cannot be prevented earlier without blocking performance
```

### Alternatives Rejected
- **Sessions (Redis/DB)**: Requires session lookup on every request (performance cost), complex horizontal scaling
- **Single Access Token (24h)**: No logout enforcement, XSS compromise window too long
- **OAuth2 with 3rd party**: Contradicts CLAUDE.md requirement (custom wxKanban DB, no Clerk)
- **Token versioning only**: Requires DB lookup to check version (less efficient than refresh token blacklist)

### Security Hardening (Phase 3+)
- Optional: Add CSRF token for state-changing operations (Defense in Depth)
- Optional: Implement token versioning for immediate logout (if critical requirement)
- Recommended: Add rate limiting on `/auth/refresh` endpoint (10 req/15min per IP)
- Recommended: Add suspicious activity alerts (new IP, unusual device)

---

## Unknown #4: Bulk Email & Job Queue Processing

### Question
How should wxKanban handle bulk team member invitations (up to 50 emails) with reliable delivery, progress tracking, and failure recovery?

### Decision: **BullMQ Queue + Socket.IO Progress + @fast-csv/parse**

**Selected Stack**:
- **Job Queue**: BullMQ 5.x (Redis-backed, 99.99% reliability)
- **CSV Parser**: @fast-csv/parse (streaming, memory-efficient, 2.1M weekly downloads)
- **Progress Updates**: Socket.IO (real-time bidirectional updates, auto-reconnect)
- **Rate Limiting**: 10 emails/sec (safe for all providers, respects Mailgun limits)
- **Batch Tracking**: Database table `invitationbatch` (audit trail, analytics)
- **Dead-Letter Queue**: Failed jobs tracked for manual review

### Rationale

**Why BullMQ for bulk operations**:
- Non-blocking: Queue returns immediately, emails send asynchronously
- Reliable delivery: Redis persistence (survives server restart)
- Auto-retry: Exponential backoff (2s, 4s, 8s, 16s, 32s) with jitter
- Rate limiting: Respects email provider limits (Mailgun: 600 req/min)
- Monitoring: Built-in job status tracking (queued, active, completed, failed)
- Used by: Slack, GitHub, Shopify for critical workflows

**Why @fast-csv/parse**:
- Streaming parser (processes 50MB file without loading into memory)
- TypeScript support (type-safe)
- 2.1M weekly npm downloads (battle-tested)
- Configurable delimiters, quote handling, validation

**Why Socket.IO for progress**:
- Real-time updates (WebSocket fallback to polling)
- Auto-reconnect on network interruption
- Publish/subscribe pattern (one event to many clients)
- No additional infrastructure beyond express (built into Node)

**Why 10 emails/sec rate**:
- Mailgun API: 600 req/min = 10 req/sec (safe margin)
- 50 invitations spread over 5 seconds
- Prevents rate-limiting errors
- Respects email provider fair-use policies

### Bulk Invitation Flow

```
1. Admin uploads CSV (up to 50 emails)
   ↓
2. Validate emails, create invitationbatch record
   ↓
3. Queue all jobs to BullMQ (returns batchId immediately)
   ↓
4. Worker processes 10/sec (respects rate limits)
   ↓
5. Socket.IO sends progress updates
   - Queued: 50
   - Sent: 15 (30%)
   - Failed: 1
   ↓
6. Failed emails moved to dead-letter queue
   ↓
7. Admin dashboard shows results
   - Sent: 49/50
   - Failed: 1 (retry manually)
```

### Database Schema

**Table: invitationbatch** (track bulk operations)
```typescript
{
  batchid: uuid (primary key)
  userid: uuid (FK - admin who initiated)
  companyid: uuid (FK)
  totalemails: integer
  sentcount: integer (incremented per success)
  failedcount: integer (incremented per failure)
  status: enum ('IN_PROGRESS', 'COMPLETED', 'PARTIAL_FAILURE')
  startedAt: timestamp
  completedAt: timestamp | null
}
```

**Table: invitationdlq** (dead-letter queue)
```typescript
{
  dlqid: uuid (primary key)
  batchid: uuid (FK to invitationbatch)
  emailaddress: string
  error: string (reason for failure)
  lasttriedat: timestamp
  retrylater: boolean
  createdAt: timestamp
}
```

### Implementation Pattern

**Queue Setup**:
```typescript
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL);
const invitationQueue = new Queue('invitations', { connection });

// Worker processes 10/sec
const worker = new Worker(
  'invitations',
  async (job) => {
    const { email, inviteUrl } = job.data;
    await sendInvitationEmail(email, inviteUrl);
  },
  {
    connection,
    concurrency: 10,  // 10 jobs in parallel
    defaultJobOptions: {
      attempts: 4,
      backoff: {
        type: 'exponential',
        delay: 1000,  // 2s, 4s, 8s, 16s
      },
    },
  }
);

// Monitor failures
worker.on('failed', async (job, err) => {
  await db.invitationdlq.create({
    batchid: job.data.batchId,
    emailaddress: job.data.email,
    error: err.message,
    lasttriedat: new Date(),
  });
});

// Monitor success
worker.on('completed', async (job) => {
  await db.invitationbatch.update(
    { batchid: job.data.batchId },
    { sentcount: { increment: 1 } }
  );

  // Emit Socket.IO event
  io.emit('invitation-progress', {
    batchId: job.data.batchId,
    progress: {
      sent: await db.invitationbatch.findUnique(...).then(b => b.sentcount),
      total: job.data.totalCount,
    },
  });
});
```

**CSV Upload Endpoint**:
```typescript
router.post('/bulk-invite', async (req, res) => {
  const file = req.file;  // Multer file upload

  // 1. Parse CSV
  const emails = [];
  const parseStream = fs.createReadStream(file.path)
    .pipe(parse({ headers: true }))
    .on('data', (row) => {
      if (isValidEmail(row.email)) {
        emails.push(row.email);
      }
    })
    .on('end', async () => {
      // 2. Create batch record
      const batch = await db.invitationbatch.create({
        userid: req.userid,
        companyid: req.companyid,
        totalemails: emails.length,
      });

      // 3. Queue all jobs (non-blocking)
      await invitationQueue.addBulk(
        emails.map((email, idx) => ({
          name: 'send-invitation',
          data: { email, batchId: batch.batchid, inviteUrl: generateUrl() },
          opts: { delay: idx * 100 },  // Stagger by 100ms
        }))
      );

      // 4. Return batch ID to client
      res.json({ batchId: batch.batchid, queued: emails.length });
    });
});
```

**Progress Tracking (Socket.IO)**:
```typescript
io.on('connection', (socket) => {
  socket.on('subscribe-batch-progress', (batchId) => {
    socket.join(`batch-${batchId}`);

    // Send initial progress
    const batch = await db.invitationbatch.findUnique({ where: { batchid: batchId } });
    socket.emit('batch-progress', {
      total: batch.totalemails,
      sent: batch.sentcount,
      failed: batch.failedcount,
    });
  });
});

// In worker.on('completed'), broadcast to all subscribers
io.to(`batch-${batchId}`).emit('batch-progress', {...});
```

### Retry Strategy
```
Attempt 1: Immediate (0s)
Attempt 2: +2s delay
Attempt 3: +4s delay
Attempt 4: +8s delay
Permanent failure → Dead-letter queue
```

**Jitter addition** (prevents thundering herd):
```typescript
const jitter = Math.random() * 1000;  // 0-1s random
await delay(baseDelay + jitter);
```

### Alternatives Rejected
- **Direct async in endpoint**: Blocks registration flow, loses emails on server restart, no retry
- **Scheduled batch jobs**: Requires separate scheduler, no real-time progress tracking
- **AWS Lambda (serverless)**: Overkill for startup, Lambda cold-starts add latency
- **Webhooks only**: No progress tracking, user doesn't know when done

### Performance Profile
```
50 invitations:
- CSV parsing: < 500ms
- Job queuing: < 5 seconds
- Email delivery (10/sec): 50 seconds
- Total async time: 2-5 minutes
- User-facing wait: ~1 second (gets batchId)
```

---

## Unknown #5: Admin Dashboard Metrics & Real-Time Updates

### Question
How should wxKanban implement admin dashboard metrics (user count, project count, task count) with optimal performance and freshness?

### Decision: **Materialized View + Periodic Polling (5-minute intervals)**

**Selected Approach**:
- **Database**: PostgreSQL materialized view (pre-computed aggregations)
- **Refresh**: Background job every 5-10 minutes (REFRESH MATERIALIZED VIEW CONCURRENTLY)
- **API**: Single lightweight endpoint returning cached metrics
- **Caching Layers**:
  - Layer 1: Materialized view (database cache)
  - Layer 2: HTTP browser cache (Cache-Control: max-age=300)
  - Layer 3: TanStack Query client cache (staleTime=4min)
- **Polling**: TanStack Query refetchInterval: 5 minutes

### Rationale

**Why NOT WebSockets**:
- Over-engineered for metrics (don't change rapidly)
- Requires persistent connections (infrastructure complexity)
- Horizontal scaling requires Redis pub/sub
- Higher memory/CPU per connection at scale

**Why NOT GraphQL Subscriptions**:
- Same WebSocket overhead as option above
- Adds GraphQL server complexity
- Overkill for simple metrics

**Why NOT constant polling (< 1 minute)**:
- Unnecessary database load (aggregation queries are expensive)
- Metrics don't change faster than 5-10 minutes
- Wastes bandwidth and server resources

**Why periodic polling IS optimal**:
- Simple HTTP GET (stateless, scales trivially)
- Metrics only need hourly accuracy
- Minimal database overhead (materialized view refresh, not per-request aggregations)
- Works with any deployment (serverless, load-balanced, etc.)

### Database Optimization

**Materialized View** (pre-computed aggregations):
```sql
CREATE MATERIALIZED VIEW admin_metrics_summary AS
SELECT
  (SELECT COUNT(DISTINCT userid) FROM "user") AS active_users,
  (SELECT COUNT(DISTINCT projectid) FROM project) AS total_projects,
  (SELECT COUNT(*) FROM task) AS total_tasks,
  (SELECT COUNT(DISTINCT userid) FROM task
   WHERE createdat > NOW() - INTERVAL '7 days') AS users_active_this_week,
  NOW() AS last_updated
WITH DATA;

-- Refresh every 5-10 minutes (non-blocking)
REFRESH MATERIALIZED VIEW CONCURRENTLY admin_metrics_summary;
```

**Why materialized view**:
- Pre-computed aggregations stored on disk
- No JOIN/GROUP BY overhead per request
- One SQL statement replaces complex queries
- Can be indexed for instant retrieval
- Refresh happens asynchronously (view remains queryable)

### API Endpoint
```typescript
router.get('/admin/metrics', async (req, res) => {
  const metrics = await db.execute(
    sql`SELECT active_users, total_projects, total_tasks, users_active_this_week
        FROM admin_metrics_summary`
  );

  // HTTP caching (5-minute browser cache)
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ data: metrics[0], timestamp: new Date().toISOString() });
});
```

### React Query Configuration
```typescript
const { data } = useQuery({
  queryKey: ['admin', 'metrics'],
  queryFn: async () => fetch('/api/admin/metrics').then(r => r.json()),

  refetchInterval: 5 * 60 * 1000,  // 5 minutes
  refetchIntervalInBackground: true,  // Keep polling even if tab unfocused

  staleTime: 4 * 60 * 1000,  // Data fresh for 4 minutes
  gcTime: 10 * 60 * 1000,    // Keep cache for 10 minutes
});
```

### Caching Layers
| Layer | Duration | Cost | Benefit |
|-------|----------|------|---------|
| Materialized View | 5-10 min | Low | Eliminates aggregation queries |
| HTTP Browser Cache | 5 min | Zero | Reduces server requests |
| React Query Memory | 4 min (stale-time) | Memory only | Instant UI updates between polls |

### Background Job (Node.js)
```typescript
import schedule from 'node-schedule';

export function startMetricsRefreshJob() {
  // Run every 5 minutes
  schedule.scheduleJob('*/5 * * * *', async () => {
    try {
      await db.execute(
        sql`REFRESH MATERIALIZED VIEW CONCURRENTLY admin_metrics_summary`
      );
      logger.info('Admin metrics refreshed');
    } catch (error) {
      logger.error({ err: error }, 'Metrics refresh failed');
      // Continue running - don't crash app on refresh failure
    }
  });
}
```

### Scaling Considerations
```
100 admin users:
- Per minute requests: 100 ÷ 5 = 20 req/min
- Per day: 28,800 requests
- Database: 1 query per 5 min (materialized view)
- Network: ~144KB/day per user
- Server memory: Negligible (stateless endpoint)
```

**For 500+ team members**: Partition materialized view by company_id if multi-tenant

### Alternatives Rejected
- **Direct aggregation queries**: Performance issue (GROUP BY, COUNT expensive)
- **Redis cache**: Additional infrastructure (Redis cluster management)
- **Server-Sent Events**: Persistent connections, scaling challenges
- **Scheduled reports**: Stale data, poor UX

### Performance Targets
| Metric | Target | Method |
|--------|--------|--------|
| Dashboard load | < 2 sec | Materialized view instant retrieval |
| Metric freshness | 5-10 min | Polling interval + view refresh |
| Database queries | 1 per 5 min | Materialized view (shared) |
| Horizontal scaling | ∞ | Stateless endpoints |

---

## Summary: All Unknowns Resolved

| Unknown | Decision | Key Technology | Cost | Complexity |
|---------|----------|-----------------|------|------------|
| #1: Email Service | Mailgun + Nodemailer + BullMQ | Mailgun API, Redis queue | $0-15/mo | Medium |
| #2: Stripe Integration | Subscriptions API + SetupIntent + Webhook idempotency | Stripe SDK | 2.2% + $0.30/txn | Medium-High |
| #3: JWT & Sessions | Dual-token (15m access + 7d refresh) with HttpOnly cookies | JWT, Redis (optional) | Zero | Medium |
| #4: Bulk Email | BullMQ + Socket.IO + CSV streaming | Redis queue, Node streams | Zero | Medium |
| #5: Dashboard Metrics | Materialized view + 5-min polling | PostgreSQL, TanStack Query | Zero | Low |

---

## Technology Stack Summary

### Backend Services
- **Express.js** (routing, middleware)
- **Nodemailer 6.9+** (email transport)
- **Stripe SDK** (payment processing)
- **BullMQ 5.x** (job queue)
- **node-schedule** (background jobs)
- **Pino** (logging)

### Database
- **PostgreSQL 15+**
- **Drizzle ORM**
- **Materialized views** (aggregation caching)
- **Redis** (job queue, optional session store)

### Frontend
- **React 18** (UI framework)
- **TanStack Query** (data fetching & caching)
- **Socket.IO** (real-time progress updates)
- **Stripe Elements** (secure card collection)

### Infrastructure
- **Redis** (BullMQ persistence)
- **Mailgun** (email provider)
- **Stripe** (payment processor)

---

## Implementation Priority

### Phase 1 (Foundation - Week 1)
1. Database: User, Company, Subscription tables
2. Stripe: SetupIntent → Subscription flow
3. Email: Mailgun account, Nodemailer integration, basic templates
4. Auth: JWT generation, refresh token logic

### Phase 2 (Features - Week 2)
5. Webhooks: Idempotent event handling for invoices
6. BullMQ: Email queue setup, worker configuration
7. Bulk invitations: CSV parser, batch job queuing
8. Admin dashboard: Materialized view, metrics endpoint

### Phase 3 (Polish - Week 3)
9. Socket.IO: Real-time progress updates
10. Device tracking: Session management UI
11. Monitoring: Alerting on payment failures, email delivery
12. Testing: E2E with Stripe test fixtures, webhook replay

---

## Next Steps

1. **Phase 1 Design**: Generate data-model.md with all entity definitions
2. **Phase 1 Design**: Generate API contracts in /contracts/ directory
3. **Phase 1 Design**: Generate quickstart.md for local development
4. **Phase 1 Design**: Update agent context (CLAUDE.md) with new patterns
5. **Phase 2 Tasks**: Run `/speckit.tasks` to generate implementation tasks

---

_Generated by Phase 0 research completion_
_All recommendations backed by 2025-2026 industry sources and battle-tested patterns_
_Ready for Phase 1 design execution_
