# Job Queue Quick Reference Card

**For**: wxKanban Phase 2 developers (T011-T015)
**Keep**: Printed on desk during implementation

---

## Stack at a Glance

```
CSV Upload (form)
    ↓
  Stream Parse (@fast-csv/parse)
    ↓
  Validation + Batching (10 per job)
    ↓
  Queue Job (BullMQ + Redis)
    ↓
  Return batchId → Frontend
    ↓
  Worker processes (5 concurrent)
    ↓
  Send Emails (rate-limited 10/sec)
    ↓
  Retry on fail (exponential backoff)
    ↓
  Socket.IO broadcast progress
```

---

## Key Files to Create/Modify

| File | Purpose | Size |
|------|---------|------|
| `src/lib/queue.ts` | Redis connection | 15 lines |
| `src/server/queues/emailQueue.ts` | Queue + worker | 100 lines |
| `src/server/lib/emailService.ts` | Email sending | 30 lines |
| `src/server/routes/projects.ts` | Upload endpoint | 120 lines |
| `src/server/websocket.ts` | Socket.IO handler | 80 lines |
| `src/client/components/BulkInviteForm.tsx` | Progress UI | 90 lines |
| `src/db/schema/invitationbatch.ts` | DB tracking | 50 lines |
| `src/db/schema/invitationdlq.ts` | DLQ table | 40 lines |

**Total**: ~600 lines of code, heavily commented

---

## Critical Code Patterns

### Queue Setup
```typescript
// Must have maxRetriesPerRequest: null
const redis = new Redis({
  ...config,
  maxRetriesPerRequest: null,
});

const queue = new Queue('name', { connection: redis });
```

### Job Configuration
```typescript
await queue.add('job-name', data, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600 },
});
```

### Worker Concurrency
```typescript
// 5 concurrent jobs = good balance
// Adjust based on email provider limits
const worker = new Worker('name', handler, {
  connection: redis,
  concurrency: 5,
});
```

### Rate Limiting
```typescript
limiter: {
  max: 10, // 10 jobs per duration
  duration: 1000, // per 1000ms = 10/sec
}
```

### Progress Updates
```typescript
job.updateProgress(percent); // Broadcasts to Socket.IO
// Triggers: emailQueue.on('progress', (jobId, progress) => {...})
```

### Error Handling
```typescript
// Don't throw on single email failure
// Continue processing, log, retry whole batch if needed
try {
  await sendEmail(invitation);
} catch (error) {
  failed.push({ email, error: error.message });
  // Continue to next email
}

// Only throw if entire batch should retry
if (failed.length > 0) {
  throw new Error(`${failed.length} failed`);
}
```

---

## Environment Variables Required

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=             # empty for dev

EMAIL_FROM=noreply@wxkanban.local
EMAIL_PROVIDER=             # when ready
EMAIL_API_KEY=              # when ready

FRONTEND_URL=http://localhost:3000
```

---

## Troubleshooting Checklist

```
❌ Jobs not processing?
   → Check: redis-cli ping
   → Check: Worker logs for errors
   → Check: Concurrency not too high

❌ Socket.IO not connecting?
   → Check: CORS origin in websocket.ts
   → Check: Frontend using correct port

❌ Memory growing?
   → Check: removeOnComplete age setting
   → Run: redis-cli DBSIZE to see key count

❌ Emails not sending?
   → Check: Email service credentials
   → Check: Provider rate limit not exceeded
   → Check: Job logs for API errors

❌ Batch taking forever?
   → Check: Rate limiter (10/sec is safe)
   → Check: Provider API response times
   → Check: Network timeouts
```

---

## Testing Commands

```bash
# Start Redis
redis-cli ping

# Monitor in real-time
redis-cli monitor

# Check queue stats
redis-cli HGETALL bullmq:team-invitations:metrics

# List pending jobs
redis-cli ZRANGE bullmq:team-invitations:wait 0 -1

# Clear all jobs (dev only!)
redis-cli FLUSHDB

# Watch logs
tail -f logs/server.log | grep -i email
```

---

## CSV Validation Rules

```typescript
❌ INVALID:
  - Missing email column
  - Invalid email format (no @)
  - Unknown role (not member/manager/admin)
  - Duplicate email in same CSV
  - More than 5000 rows (set limit)

✅ VALID:
  - email,role,name
  - alice@example.com,member,Alice
  - bob@example.com,manager,Bob
  - charlie@example.com,admin  (name optional)
```

---

## Rate Limiting Math

```
Goal: Send 50 invitations safely
Provider limit: 100/sec (SendGrid soft)
Our limiter: 10/sec (safe margin)

50 invitations × (1 job per 10) = 5 jobs queued
5 jobs × 10 seconds = 50 seconds total

With retries (if some fail):
Exponential: 2s, 4s, 8s, 16s, 32s
Max retry time: ~1 minute per batch
```

---

## Socket.IO Message Types

```typescript
// CLIENT → SERVER
socket.emit('subscribe-batch', batchId);
socket.emit('unsubscribe-batch', batchId);

// SERVER → CLIENT
socket.emit('progress', {
  jobId: string,
  progress: number,      // 0-100
  timestamp: string,
});

socket.emit('completed', {
  jobId: string,
  result: object,
  timestamp: string,
});

socket.emit('failed', {
  jobId: string,
  error: string,
  attempt: number,
  timestamp: string,
});
```

---

## Database Queries

```typescript
// Get batch status
const batch = await db
  .select()
  .from(schema.invitationbatch)
  .where(eq(schema.invitationbatch.batchid, batchId));

// Update on completion
await db
  .update(schema.invitationbatch)
  .set({
    successcount: successful,
    failedcount: failed.length,
    status: 'completed',
    completedat: new Date(),
  })
  .where(eq(schema.invitationbatch.batchid, batchId));

// Get recent failures
const dlqEntries = await db
  .select()
  .from(schema.invitationdlq)
  .orderBy(desc(schema.invitationdlq.createdat))
  .limit(10);
```

---

## Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| CSV upload + validate | < 500ms | Streaming parser |
| Queue job creation | < 100ms | Per invitation |
| Job processing start | 1-5s | Queue latency |
| Send email | 100-500ms | Per email, rate-limited |
| Total for 50 | 2-5 min | Async, non-blocking |
| User sees result | ~1sec | Job ID returned |

---

## Code Review Checklist

- [ ] Redis connection has `maxRetriesPerRequest: null`
- [ ] Worker has concurrency set (5 recommended)
- [ ] CSV validation before queueing
- [ ] Errors logged, not silently dropped
- [ ] Progress updated mid-job
- [ ] Socket.IO emits to correct room `batch-${batchId}`
- [ ] Database records created for audit trail
- [ ] Environment variables documented
- [ ] Tests written for queue operation
- [ ] Monitoring in place (metrics, alerts)

---

## Links to Full Docs

- Implementation: `project-documentation/job-queue-setup-guide.md`
- Architecture: `project-documentation/bulk-email-job-queue-analysis.md`
- Research: `project-documentation/RESEARCH-SUMMARY-bulk-email.md`
- BullMQ Docs: https://bullmq.io/
- Socket.IO Docs: https://socket.io/docs/

---

## Common Mistakes (Don't Do These!)

```typescript
❌ await emailQueue.add() in registration endpoint (BLOCKING)
   ✅ Queue async, return immediately

❌ sendEmail inside loop without error handling (CRASHES BATCH)
   ✅ Try/catch around each, continue on error

❌ Single 50-email job (HARD TO RETRY)
   ✅ Queue 5 jobs with 10 emails each

❌ No Socket.IO reconnection (STALE CONNECTIONS)
   ✅ Enable auto-reconnect in client config

❌ No database tracking (NO AUDIT TRAIL)
   ✅ Create invitationbatch records

❌ Linear retry (1s, 2s, 3s) (THUNDERING HERD)
   ✅ Exponential backoff with jitter
```

---

**Last Updated**: 2026-02-17
**Status**: Production Ready
