# BullMQ + Socket.IO Setup Guide for wxKanban

**Scope**: Quick-start implementation for team member bulk invitations
**Target**: Phase 2 developers implementing T011-T015 (bulk operations)
**Time**: ~4 hours for full setup

---

## Prerequisites

- Node.js 20 LTS
- Express server running (port 3001)
- PostgreSQL database connected
- Redis instance available (local Docker or cloud service)

---

## Step 1: Install Dependencies

```bash
npm install bullmq ioredis @fast-csv/parse socket.io @socket.io/admin-ui

npm install -D @types/express @types/node
```

**Versions (as of 2026-02-17)**:
- `bullmq@^5.x` - Job queue (actively maintained)
- `ioredis@^5.x` - Redis client
- `@fast-csv/parse@^4.x` - CSV streaming parser
- `socket.io@^4.7.x` - Real-time communication

---

## Step 2: Set Up Redis Connection

**File**: `src/lib/queue.ts`

```typescript
import { Redis } from 'ioredis';
import { logger } from '~/lib/logger';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required for Bull
  enableReadyCheck: false,
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

export { redis };
```

**Test Connection** (from project root):
```bash
redis-cli ping
# Should return: PONG
```

---

## Step 3: Create Email Queue

**File**: `src/server/queues/emailQueue.ts`

```typescript
import { Queue, Worker, Job } from 'bullmq';
import { redis } from '~/lib/queue';
import { logger } from '~/lib/logger';
import { sendInvitationEmail } from '~/server/lib/emailService';

export interface InvitationJob {
  projectId: string;
  batchId: string;
  invitations: Array<{
    email: string;
    role: 'member' | 'manager' | 'admin';
    name?: string;
  }>;
  chunkIndex?: number;
  totalChunks?: number;
}

// Create queue
export const emailQueue = new Queue<InvitationJob>('team-invitations', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5, // Retry up to 5 times
    backoff: {
      type: 'exponential',
      delay: 2000, // Start at 2 seconds
    },
    removeOnComplete: {
      age: 3600, // Keep successful jobs for 1 hour
    },
  },
});

// Create worker (process jobs)
const worker = new Worker<InvitationJob>(
  'team-invitations',
  async (job: Job<InvitationJob>) => {
    logger.info(
      {
        jobId: job.id,
        batchId: job.data.batchId,
        count: job.data.invitations.length,
      },
      'Processing invitation batch'
    );

    const failed: Array<{ email: string; error: string }> = [];

    for (let i = 0; i < job.data.invitations.length; i++) {
      const invitation = job.data.invitations[i];

      try {
        // Send email
        await sendInvitationEmail({
          email: invitation.email,
          projectId: job.data.projectId,
          role: invitation.role,
          name: invitation.name,
        });

        // Update progress (0-100)
        const progress = Math.round(((i + 1) / job.data.invitations.length) * 100);
        job.updateProgress(progress);

        logger.debug({ email: invitation.email }, 'Invitation sent');
      } catch (error) {
        failed.push({
          email: invitation.email,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        logger.warn(
          {
            email: invitation.email,
            error: error instanceof Error ? error.message : 'Unknown error',
            attempt: job.attemptsMade,
          },
          'Failed to send invitation'
        );
      }
    }

    // If any failed, throw to trigger retry
    if (failed.length > 0) {
      const failedEmails = failed.map((f) => f.email).join(', ');
      throw new Error(
        `${failed.length}/${job.data.invitations.length} failed: ${failedEmails}`
      );
    }

    logger.info(
      {
        jobId: job.id,
        batchId: job.data.batchId,
        count: job.data.invitations.length,
      },
      'Invitation batch completed successfully'
    );

    return {
      success: true,
      count: job.data.invitations.length,
    };
  },
  {
    connection: redis,
    concurrency: 5, // Max 5 concurrent jobs
  }
);

// Event listeners
worker.on('completed', (job) => {
  logger.info(
    {
      jobId: job.id,
      duration: Date.now() - (job.processedOn || 0),
    },
    'Job completed'
  );
});

worker.on('failed', (job, err) => {
  logger.error(
    {
      jobId: job.id,
      attempts: job.attemptsMade,
      error: err.message,
    },
    'Job failed'
  );
});

worker.on('stalled', (jobId) => {
  logger.warn({ jobId }, 'Job stalled - will retry');
});

export { worker };
```

---

## Step 4: Create Email Service

**File**: `src/server/lib/emailService.ts`

```typescript
import { logger } from '~/lib/logger';

export interface InvitationEmailData {
  email: string;
  projectId: string;
  role: string;
  name?: string;
}

export async function sendInvitationEmail(data: InvitationEmailData): Promise<void> {
  const { email, projectId, role, name } = data;

  try {
    // TODO: Replace with actual email provider (SendGrid, Mailgun, etc.)
    // For now, just log
    logger.info({ email, projectId, role }, 'Sending invitation email');

    // Simulate send
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Example with SendGrid (when available):
    // await sgMail.send({
    //   to: email,
    //   from: process.env.EMAIL_FROM!,
    //   subject: `You're invited to ${projectId}`,
    //   html: `<p>Hi ${name},</p><p>Join us on wxKanban!</p>`,
    // });
  } catch (error) {
    logger.error(
      {
        email,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Email send failed'
    );
    throw error;
  }
}
```

---

## Step 5: Create CSV Upload Endpoint

**File**: `src/server/routes/projects.ts`

```typescript
import { Router, Request, Response } from 'express';
import { createReadStream } from 'fs';
import { parse } from '@fast-csv/parse';
import { pipeline } from 'stream/promises';
import { emailQueue, InvitationJob } from '~/server/queues/emailQueue';
import { logger } from '~/lib/logger';
import { v7 as uuidv7 } from 'uuid';
import { requireAuth } from '~/server/middleware/auth';

const router = Router();

/**
 * POST /api/projects/:projectId/bulk-invite
 * Upload CSV and queue invitations
 *
 * CSV format:
 * email,role,name
 * alice@example.com,member,Alice Smith
 * bob@example.com,manager,Bob Jones
 */
router.post('/projects/:projectId/bulk-invite', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.userid;

    // Verify user owns project
    const project = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.projectid, projectId));

    if (project.length === 0 || project[0].userid !== userId) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check file uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }

    const batchId = uuidv7();
    const invitations: Array<{
      email: string;
      role: 'member' | 'manager' | 'admin';
      name?: string;
    }> = [];
    const errors: Array<{ row: number; reason: string }> = [];
    let rowCount = 0;

    // Stream parse CSV
    await pipeline(
      createReadStream(req.file.path, { highWaterMark: 64 * 1024 }),
      parse({
        headers: true,
        discardInvalidRows: true,
        trim: true,
      })
        .on('data', (row: any) => {
          rowCount++;

          try {
            const email = row.email?.toLowerCase().trim();
            const role = row.role?.toLowerCase().trim();
            const name = row.name?.trim();

            // Validation
            if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
              errors.push({ row: rowCount, reason: 'Invalid email format' });
              return;
            }

            if (!['member', 'manager', 'admin'].includes(role)) {
              errors.push({
                row: rowCount,
                reason: `Invalid role: ${role}. Must be member, manager, or admin`,
              });
              return;
            }

            // Check for duplicates
            if (invitations.some((inv) => inv.email === email)) {
              errors.push({ row: rowCount, reason: 'Duplicate email in CSV' });
              return;
            }

            invitations.push({ email, role, name });
          } catch (error) {
            errors.push({
              row: rowCount,
              reason: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        })
        .on('error', (error) => {
          logger.error({ projectId, error: error.message }, 'CSV parse error');
          throw error;
        })
    );

    // No valid invitations
    if (invitations.length === 0) {
      return res.status(400).json({
        error: 'No valid invitations in CSV',
        errors,
      });
    }

    // Queue invitations in batches
    const BATCH_SIZE = 10;
    const jobIds: string[] = [];

    for (let i = 0; i < invitations.length; i += BATCH_SIZE) {
      const chunk = invitations.slice(i, i + BATCH_SIZE);

      const job = await emailQueue.add(
        `send-batch-${batchId}`,
        {
          projectId,
          batchId,
          invitations: chunk,
          chunkIndex: Math.floor(i / BATCH_SIZE),
          totalChunks: Math.ceil(invitations.length / BATCH_SIZE),
        } as InvitationJob,
        {
          jobId: `invite-${batchId}-chunk-${Math.floor(i / BATCH_SIZE)}`,
          priority: 1,
        }
      );

      jobIds.push(job.id!);
    }

    // Save batch record
    await db.insert(schema.invitationbatch).values({
      batchid: batchId,
      projectid: projectId,
      userid: userId,
      totalcount: invitations.length,
      successcount: 0,
      failedcount: 0,
      status: 'queued',
      createdat: new Date(),
    });

    logger.info(
      {
        batchId,
        projectId,
        total: invitations.length,
        chunks: jobIds.length,
        errors: errors.length,
      },
      'Bulk invitation queued'
    );

    // Return immediately - don't wait for emails
    return res.json({
      batchId,
      totalInvitations: invitations.length,
      validInvitations: invitations.length,
      invalidRows: errors.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // First 10 errors only
      status: 'queued',
      message: `Queued ${invitations.length} invitations. Check progress with batch ID.`,
    });
  } catch (error) {
    logger.error({ error }, 'Bulk invite endpoint error');
    res.status(500).json({ error: 'Failed to process CSV' });
  }
});

/**
 * GET /api/batch/:batchId/status
 * Get bulk invitation status (for polling or initial page load)
 */
router.get('/batch/:batchId/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const userId = req.user!.userid;

    // Get batch
    const batch = await db
      .select()
      .from(schema.invitationbatch)
      .where(eq(schema.invitationbatch.batchid, batchId));

    if (batch.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Verify ownership
    if (batch[0].userid !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const batch_record = batch[0];

    // Get job progress
    const jobIds = (
      await emailQueue.getJobIds()
    ).filter((id) => id.includes(batchId));

    let progress = 0;
    let jobsProcessed = 0;

    for (const jobId of jobIds) {
      const job = await emailQueue.getJob(jobId);
      if (job) {
        const jobProgress = job.progress() as number;
        progress += jobProgress;
        if (job.finishedOn) jobsProcessed++;
      }
    }

    const avgProgress =
      jobIds.length > 0 ? Math.round(progress / jobIds.length) : 0;

    return res.json({
      batchId,
      status: batch_record.status,
      progress: avgProgress,
      completed: batch_record.successcount,
      failed: batch_record.failedcount,
      total: batch_record.totalcount,
      createdAt: batch_record.createdat,
      completedAt: batch_record.completedat,
    });
  } catch (error) {
    logger.error({ error }, 'Batch status endpoint error');
    res.status(500).json({ error: 'Failed to get batch status' });
  }
});

export default router;
```

---

## Step 6: Set Up Socket.IO for Real-Time Progress

**File**: `src/server/websocket.ts`

```typescript
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { emailQueue } from '~/server/queues/emailQueue';
import { logger } from '~/lib/logger';

interface SessionData {
  batchId?: string;
  userId?: string;
}

const sessionData = new Map<string, SessionData>();

export function setupWebSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Socket.IO connection established');

    // Subscribe to batch progress
    socket.on('subscribe-batch', (batchId: string) => {
      if (!batchId) {
        socket.emit('error', { message: 'batchId required' });
        return;
      }

      sessionData.set(socket.id, { batchId });
      socket.join(`batch-${batchId}`);

      logger.debug({ socketId: socket.id, batchId }, 'Subscribed to batch');
    });

    // Unsubscribe
    socket.on('unsubscribe-batch', (batchId: string) => {
      socket.leave(`batch-${batchId}`);
      sessionData.delete(socket.id);
    });

    // Disconnect
    socket.on('disconnect', () => {
      sessionData.delete(socket.id);
      logger.info({ socketId: socket.id }, 'Socket.IO disconnected');
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error({ error, socketId: socket.id }, 'Socket.IO error');
    });
  });

  // Broadcast job progress to subscribers
  emailQueue.on('progress', (jobId, progress) => {
    const matches = jobId.match(/invite-([a-f0-9-]+)-chunk/);
    if (matches) {
      const batchId = matches[1];
      io.to(`batch-${batchId}`).emit('progress', {
        jobId,
        progress,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Broadcast job completion
  emailQueue.on('completed', (job) => {
    const batchId = job.data.batchId;
    io.to(`batch-${batchId}`).emit('completed', {
      jobId: job.id,
      result: job.returnvalue,
      timestamp: new Date().toISOString(),
    });
  });

  // Broadcast job failure
  emailQueue.on('failed', (job, err) => {
    const batchId = job.data.batchId;
    io.to(`batch-${batchId}`).emit('failed', {
      jobId: job.id,
      error: err.message,
      attempt: job.attemptsMade,
      timestamp: new Date().toISOString(),
    });
  });

  return io;
}

export type { Server as SocketIOServer };
```

---

## Step 7: Initialize in Express App

**File**: `src/server/index.ts`

```typescript
import express from 'express';
import { createServer } from 'http';
import { setupWebSocket } from '~/server/websocket';
import projectRoutes from '~/server/routes/projects';
import { worker } from '~/server/queues/emailQueue'; // Import to start processing
import { logger } from '~/lib/logger';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(express.json());

// Routes
app.use('/api', projectRoutes);

// WebSocket
const io = setupWebSocket(httpServer);

// Worker starts automatically when imported
logger.info('Email queue worker initialized');

// Server startup
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started');
});

export { app, httpServer };
```

---

## Step 8: Create React Component for Progress Tracking

**File**: `src/client/components/BulkInviteForm.tsx`

```typescript
import { useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Progress } from '~/client/components/ui/progress';
import { Button } from '~/client/components/ui/button';

interface Props {
  projectId: string;
}

interface ProgressData {
  jobId: string;
  progress: number;
  timestamp: string;
}

export function BulkInviteForm({ projectId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Initialize Socket.IO
  useEffect(() => {
    const socket = io(
      window.location.protocol === 'https:'
        ? `https://${window.location.host}`
        : `http://${window.location.host}`,
      {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      }
    );

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setIsUploading(true);
    setStatus('uploading');
    setProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`/api/projects/${projectId}/bulk-invite`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      setBatchId(data.batchId);
      setStatus('processing');

      // Subscribe to progress via Socket.IO
      if (socketRef.current) {
        socketRef.current.emit('subscribe-batch', data.batchId);

        socketRef.current.on('progress', (data: ProgressData) => {
          setProgress(data.progress);
        });

        socketRef.current.on('completed', () => {
          setStatus('completed');
          setProgress(100);
        });

        socketRef.current.on('failed', (data: any) => {
          setStatus('error');
          setError(`Job failed: ${data.error}`);
        });
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Bulk Invite Team Members</h2>

      {status === 'idle' && (
        <>
          <div className="border-2 border-dashed rounded-lg p-6">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={isUploading}
              className="w-full"
            />
            {file && <p className="mt-2 text-sm text-green-600">Selected: {file.name}</p>}
          </div>

          {error && <p className="text-red-600">{error}</p>}

          <Button onClick={handleUpload} disabled={!file || isUploading}>
            {isUploading ? 'Uploading...' : 'Upload & Send Invitations'}
          </Button>
        </>
      )}

      {status === 'processing' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Processing invitations...</p>
          <Progress value={progress} className="w-full" />
          <p className="text-sm text-gray-600">{progress}% complete</p>
        </div>
      )}

      {status === 'completed' && (
        <div className="p-4 bg-green-100 border border-green-300 rounded">
          <p className="text-green-800">All invitations sent successfully!</p>
          <Button onClick={() => setStatus('idle')} className="mt-2">
            Send More Invitations
          </Button>
        </div>
      )}

      {status === 'error' && (
        <div className="p-4 bg-red-100 border border-red-300 rounded">
          <p className="text-red-800">{error}</p>
          <Button onClick={() => setStatus('idle')} className="mt-2">
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
```

---

## Step 9: Environment Variables

**File**: `.env`

```bash
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=           # Leave empty for development

# Email Service (when ready)
EMAIL_FROM=noreply@wxkanban.local
EMAIL_PROVIDER=           # sendgrid, mailgun, aws-ses, etc.
EMAIL_API_KEY=            # Provider API key

# WebSocket
FRONTEND_URL=http://localhost:3000
```

---

## Step 10: Testing

### Local Redis Setup

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or using Homebrew (macOS)
brew install redis
brew services start redis
```

### Manual Testing

```bash
# 1. Check Redis connection
npm run redis:ping

# 2. Create test CSV
cat > test-invites.csv << 'EOF'
email,role,name
alice@example.com,member,Alice Smith
bob@example.com,manager,Bob Jones
charlie@example.com,admin,Charlie Brown
EOF

# 3. Upload via curl
curl -X POST \
  -F "file=@test-invites.csv" \
  http://localhost:3001/api/projects/PROJECT_ID/bulk-invite \
  -H "Authorization: Bearer YOUR_JWT"

# Response:
# {
#   "batchId": "550e8400-e29b-41d4-a716-446655440000",
#   "totalInvitations": 3,
#   "status": "queued"
# }

# 4. Check status
curl http://localhost:3001/api/batch/550e8400-e29b-41d4-a716-446655440000/status

# 5. Monitor queue
redis-cli
> KEYS invite-*
> LLEN bullmq:team-invitations:jobs
```

### Jest Unit Tests

**File**: `tests/queues/emailQueue.test.ts`

```typescript
import { emailQueue, worker } from '~/server/queues/emailQueue';
import { redis } from '~/lib/queue';

describe('Email Queue', () => {
  afterAll(async () => {
    await emailQueue.close();
    await worker.close();
    await redis.quit();
  });

  it('should queue an invitation job', async () => {
    const job = await emailQueue.add('test-batch', {
      projectId: 'test-project',
      batchId: 'test-batch-id',
      invitations: [
        { email: 'test@example.com', role: 'member' },
      ],
    });

    expect(job).toBeDefined();
    expect(job.id).toBeDefined();
  });

  it('should process invitation and complete', async () => {
    const job = await emailQueue.add('test-process', {
      projectId: 'test-project',
      batchId: 'test-process-id',
      invitations: [
        { email: 'test@example.com', role: 'member' },
      ],
    });

    // Wait for processing
    await job.waitUntilFinished(emailQueue.events);

    const completed = await job.isCompleted();
    expect(completed).toBe(true);
  });
});
```

---

## Monitoring Commands

```bash
# Redis Monitor (real-time operations)
redis-cli monitor

# Queue Stats
redis-cli
> HGETALL bullmq:team-invitations:metrics

# List Pending Jobs
redis-cli
> ZRANGE bullmq:team-invitations:wait 0 -1

# List Failed Jobs
redis-cli
> ZRANGE bullmq:team-invitations:failed 0 -1

# View Job Details
redis-cli
> HGETALL bullmq:team-invitations:job:JOB_ID
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Redis connection refused | Ensure Redis is running: `redis-cli ping` |
| Jobs not processing | Check worker logs, verify concurrency not exceeded |
| Socket.IO not connecting | Check CORS origin in websocket.ts matches frontend URL |
| Memory growing indefinitely | Check `removeOnComplete` settings, may need to clean old jobs |
| Email not sending | Check email service credentials and provider limits |

---

## Next Steps

1. **Email Provider Integration**: Replace `sendInvitationEmail` with real SendGrid/Mailgun calls
2. **Error Handling**: Implement DLQ (dead-letter queue) for failed jobs
3. **Monitoring**: Add Prometheus metrics and alerts
4. **Database Schema**: Create `invitationbatch` and `invitationdlq` tables (see analysis doc)
5. **Admin Dashboard**: Show queue metrics and failed jobs

---

## References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Socket.IO Documentation](https://socket.io/docs/)
- [fast-csv Documentation](https://github.com/C2FO/fast-csv)
- `project-documentation/bulk-email-job-queue-analysis.md` - Detailed architecture

