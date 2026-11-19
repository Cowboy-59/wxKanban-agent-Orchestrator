# Research: Multi-Platform Task Management System

**Date**: 2026-01-22
**Feature**: Multi-Platform Task Management System
**Branch**: 001-multi-platform-task

## Overview

This document consolidates research findings for integrating multiple project management systems (Jira, Monday.com, Asana, Trello), implementing bidirectional sync, time tracking, invoicing, and AI-powered task proposals within a React frontend + Express/Fastify backend application.

---

## 1. PM System API Integration Patterns

### Jira REST API v3

**Decision**: Use Jira REST API v3 with OAuth 2.0 (3LO) for authentication

**Rationale**:

- Jira Cloud REST API v3 is the current stable version
- OAuth 2.0 provides secure, delegated access without storing passwords
- API provides comprehensive task (issue) retrieval with JQL queries
- Supports webhooks for real-time sync (optional future enhancement)

**Key Endpoints**:

- Authentication: OAuth 2.0 three-legged flow
- Get user issues: `GET /rest/api/3/search?jql=assignee=currentUser()`
- Update issue: `PUT /rest/api/3/issue/{issueIdOrKey}`
- Get issue details: `GET /rest/api/3/issue/{issueIdOrKey}`

**Rate Limits**: 150 requests/minute per user

**Alternatives Considered**:

- Basic Auth: Rejected - less secure, requires storing passwords
- API tokens: Rejected - requires manual token generation per user
- Jira API v2: Rejected - deprecated in favor of v3

**SDK**: `jira-client` npm package or direct Axios calls with TypeScript types

---

### Monday.com GraphQL API

**Decision**: Use Monday.com GraphQL API v2 with OAuth 2.0

**Rationale**:

- GraphQL allows precise data fetching (no over-fetching)
- OAuth 2.0 for secure authentication
- Flexible querying for complex board structures
- Official SDK available with TypeScript support

**Key Queries**:

```graphql
query {
  me {
    id
    name
  }
  boards {
    items {
      id
      name
      column_values {
        id
        text
      }
    }
  }
}
```

**Rate Limits**: 100 requests/minute (complexity-based)

**Alternatives Considered**:

- REST API: Rejected - Monday.com primarily supports GraphQL
- API tokens: Viable for simple use cases, but OAuth preferred for user delegation

**SDK**: `@mondaydotcomorg/api` or Apollo Client with generated types

---

### Asana REST API

**Decision**: Use Asana REST API v1 with OAuth 2.0

**Rationale**:

- Well-documented REST API with comprehensive task management
- OAuth 2.0 for secure, delegated access
- Supports workspaces, projects, and task hierarchies
- Official Node.js client library available

**Key Endpoints**:

- Authentication: OAuth 2.0 flow
- Get user tasks: `GET /tasks?assignee=me&workspace={workspace_gid}`
- Update task: `PUT /tasks/{task_gid}`
- Get task details: `GET /tasks/{task_gid}`

**Rate Limits**: 1,500 requests/hour (150 req/min burst)

**Alternatives Considered**:

- Personal Access Tokens: Rejected - requires manual token management
- Legacy API: Rejected - v1 is current stable version

**SDK**: `asana` npm package (official)

---

### Trello REST API

**Decision**: Use Trello REST API v1 with OAuth 1.0a

**Rationale**:

- Comprehensive REST API for boards, lists, and cards
- OAuth 1.0a is Trello's standard authentication method
- Supports webhooks for real-time updates
- Mature API with extensive documentation

**Key Endpoints**:

- Authentication: OAuth 1.0a flow
- Get user cards: `GET /1/members/me/cards`
- Update card: `PUT /1/cards/{id}`
- Get card details: `GET /1/cards/{id}`

**Rate Limits**: 300 requests/10 seconds per token, 100 requests/10 seconds per token per member

**Alternatives Considered**:

- API Key + Token: Viable but less secure than OAuth
- Power-Ups: Rejected - unnecessary complexity for our use case

**SDK**: `trello-node-api` or direct Axios calls with OAuth 1.0a signing

---

### Common Integration Patterns

**Decision**: Implement adapter pattern with base interface

**Rationale**:

- Abstracts PM system differences behind common interface
- Enables easy addition of new PM systems
- Centralizes error handling and retry logic
- Simplifies testing with mock adapters

**Base Adapter Interface**:

```typescript
interface PMAdapter {
  authenticate(credentials: AuthCredentials): Promise<void>;
  getTasks(userId: string): Promise<Task[]>;
  updateTask(taskId: string, updates: TaskUpdate): Promise<Task>;
  syncTask(task: Task): Promise<SyncResult>;
}
```

**Error Handling Strategy**:

- Exponential backoff for transient errors
- Circuit breaker pattern for prolonged failures
- Graceful degradation (show cached data on sync failure)
- User notifications for authentication expiration

---

## 2. Bidirectional Sync Architecture

### Conflict Resolution Strategy

**Decision**: Last-write-wins with user notification for conflicts

**Rationale**:

- Simple to implement and understand
- Works well for single-user scenarios
- User maintains control over which system is source of truth
- Minimal sync overhead

**Conflict Detection**:

- Track `lastSyncedAt` timestamp per task
- Compare local and remote `updatedAt` timestamps
- If both changed since last sync → conflict detected
- Store conflict details for user review

**Alternatives Considered**:

- Operational Transformation: Rejected - overkill for task metadata
- CRDTs: Rejected - adds complexity without sufficient benefit
- Always PM system wins: Rejected - defeats purpose of bidirectional sync

---

### Change Detection & Delta Sync

**Decision**: Timestamp-based delta sync with checksum validation

**Rationale**:

- Efficient - only syncs changed tasks
- Reduces API calls and respects rate limits
- Checksum prevents unnecessary updates when data unchanged
- Simple to implement and debug

**Implementation**:

```typescript
interface SyncMetadata {
  taskId: string;
  lastSyncedAt: Date;
  localChecksum: string;
  remoteChecksum: string;
  syncStatus: "synced" | "pending" | "conflict";
}
```

**Sync Flow**:

1. Fetch remote tasks modified since `lastSyncedAt`
2. Compare checksums to detect actual changes
3. For changes: resolve conflicts, update local DB
4. Push local changes to remote
5. Update sync metadata

**Alternatives Considered**:

- Full sync every time: Rejected - inefficient, hits rate limits
- Event-based sync with webhooks: Future enhancement, requires webhook infra

---

### Background Job Scheduling

**Decision**: Use node-cron for scheduled sync jobs with configurable intervals

**Rationale**:

- Simple, reliable scheduling library
- No external dependencies (Redis, etc.)
- Configurable per-user sync intervals
- Easy to test and debug

**Sync Schedule**:

- Default: Every 10 minutes
- User-configurable: 5-60 minutes
- On-demand: User-triggered manual sync
- Adaptive: Increase frequency if high activity detected

**Job Implementation**:

```typescript
cron.schedule("*/10 * * * *", async () => {
  const connections = await getActivePMConnections();
  for (const conn of connections) {
    await syncTasksForConnection(conn);
  }
});
```

**Alternatives Considered**:

- Bull Queue: Rejected - requires Redis, adds infrastructure complexity
- Agenda: Rejected - requires MongoDB, conflicts with PostgreSQL
- Real-time sync: Deferred - requires webhooks from all PM systems

---

### API Rate Limit Management

**Decision**: Token bucket algorithm with per-PM-system limits

**Rationale**:

- Prevents hitting rate limits
- Gracefully handles burst traffic
- Per-system limits respect individual API constraints
- Allows priority for user-initiated actions

**Implementation**:

- Jira: 150 req/min → 2.5 req/sec sustained
- Monday: 100 req/min → 1.67 req/sec sustained
- Asana: 1500 req/hour → 25 req/min sustained
- Trello: 300 req/10sec → 30 req/sec burst

**Rate Limiter**:

```typescript
class RateLimiter {
  private tokens: number;
  private lastRefill: Date;

  async acquire(): Promise<void> {
    // Token bucket implementation
  }
}
```

**Alternatives Considered**:

- No rate limiting: Rejected - will cause API errors
- Fixed delay between requests: Rejected - inefficient
- Sliding window: Viable alternative, token bucket preferred for simplicity

---

## 3. AI Task Proposal Patterns

### AI Provider Selection

**Decision**: Primary: OpenAI GPT-4, Fallback: Google Gemini

**Rationale**:

- OpenAI GPT-4: Best structured output, function calling support
- Gemini: Cost-effective fallback with good quality
- Both support JSON mode for consistent output
- Easy to switch based on availability/cost

**Structured Output Format**:

```typescript
interface TaskProposal {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  estimatedEffort: string;
  rationale: string;
  dependencies: string[];
}
```

**Prompt Engineering**:

```typescript
const systemPrompt = `You are a task planning assistant for software developers.
Analyze the project context and current tasks to suggest additional tasks
that may be necessary but haven't been explicitly created yet.

Consider:
- Technical debt and refactoring needs
- Testing and documentation requirements
- Infrastructure and deployment tasks
- Dependencies and prerequisites

Return 1-5 high-value task suggestions in JSON format.`;
```

**Alternatives Considered**:

- Claude: Excellent but requires separate Anthropic API integration
- Local models (Llama): Rejected - quality/cost tradeoff unfavorable
- Rule-based suggestions: Rejected - too rigid, misses context

---

### Context Window Management

**Decision**: Summarize project context, include recent tasks only

**Rationale**:

- Keeps prompt under token limits (8K for GPT-4, 32K for Gemini)
- Focuses AI on relevant recent context
- Reduces API costs
- Maintains response quality

**Context Strategy**:

- Include: Project description (200 tokens)
- Include: Active tasks (last 20, ~1000 tokens)
- Include: Recent completions (last 5, ~300 tokens)
- Include: User notes (last 500 tokens)
- Total: ~2000 tokens input, 1000 tokens output = 3000 tokens/request

**Cost Estimation**:

- OpenAI GPT-4: $0.03/1K input + $0.06/1K output = ~$0.10/proposal
- Gemini Pro: $0.00025/1K input + $0.0005/1K output = ~$0.002/proposal

**Alternatives Considered**:

- Include full task history: Rejected - exceeds token limits
- Semantic search over embeddings: Future enhancement
- No context: Rejected - produces irrelevant suggestions

---

### Cost Optimization

**Decision**: User-triggered proposals with configurable auto-trigger

**Rationale**:

- Default: User manually requests proposals (no recurring cost)
- Optional: Auto-trigger on project start (user preference)
- Caching: Store proposals for 24 hours, reuse if context unchanged
- Rate limiting: Max 10 proposals per user per day

**Cost Controls**:

- Estimate: 50 active users × 2 proposals/day = 100 proposals/day
- OpenAI cost: 100 × $0.10 = $10/day = $300/month
- Gemini fallback: 100 × $0.002 = $0.20/day = $6/month
- Budget alert: Notify if exceeds threshold

**Alternatives Considered**:

- Unlimited proposals: Rejected - cost unpredictable
- Always-on background proposals: Rejected - high cost, low value
- No AI features: Rejected - key differentiator

---

## 4. Time Tracking & Billing

### Multi-Timer Concurrent Tracking

**Decision**: Support multiple active timers with per-task granularity

**Rationale**:

- Developers often switch between tasks rapidly
- Accurate time allocation to multiple projects
- Simple pause/resume for each timer
- Real-time duration calculation

**Data Model**:

```typescript
interface ActiveTimer {
  timeentryid: string;
  taskid: string;
  starttime: Date;
  pausedAt: Date | null;
  totalPausedDuration: number; // milliseconds
  status: "running" | "paused";
}
```

**Timer Logic**:

- Multiple timers can run simultaneously
- Each timer tracks its own pause/resume state
- Duration = (current time - start time) - total paused duration
- Client-side: Update every second for UI
- Server-side: Store start/end times only

**Alternatives Considered**:

- Single active timer: Rejected - doesn't match developer workflow
- Automatic task switching: Rejected - too error-prone
- Manual time entry only: Viable, but timers reduce friction

---

### Preventing Duplicate Billing

**Decision**: Mark time entries with `invoicedAt` timestamp on invoice generation

**Rationale**:

- Simple, immutable audit trail
- Prevents accidental double-billing
- Easy to query un-invoiced time entries
- Supports invoice corrections (unmark entries if invoice void)

**Implementation**:

```typescript
interface TimeEntry {
  timeentryid: string;
  invoiceid: string | null;
  invoicedAt: Date | null;
  // ...other fields
}

// Query un-invoiced billable hours
SELECT * FROM timeentry
WHERE isbillable = true
  AND invoicedAt IS NULL
  AND userid = $1
  AND projectid = $2;
```

**Invoice Validation**:

- Before generating invoice: Verify no entries already invoiced
- On invoice generation: Atomically update all entries with invoice ID
- On invoice void/delete: Set `invoicedAt` to NULL, clear `invoiceid`

**Alternatives Considered**:

- Separate invoice line items table: Adds complexity without benefit
- Copy time entries to invoice: Rejected - data duplication
- No tracking: Rejected - risk of duplicate billing

---

### Timestamp Precision & Timezone Handling

**Decision**: Store all timestamps in UTC, convert to user timezone for display

**Rationale**:

- UTC eliminates timezone conversion bugs
- PostgreSQL `timestamptz` type handles storage
- User timezone stored in user profile
- Consistent timestamps across PM systems

**Implementation**:

```typescript
// Store in database (UTC)
const startTime = new Date(); // JS Date is UTC

// Display to user (convert to local timezone)
const userTz = user.timezone || "America/New_York";
const localTime = startTime.toLocaleString("en-US", { timeZone: userTz });
```

**Precision**: Millisecond precision for duration calculations

**Alternatives Considered**:

- Store in user's timezone: Rejected - breaks when user travels
- Store both UTC and local: Rejected - data duplication
- Server's local timezone: Rejected - inconsistent across deployments

---

### Invoice Generation

**Decision**: Use PDFKit for server-side PDF generation

**Rationale**:

- Server-side generation ensures consistent formatting
- No client-side dependencies
- Supports custom branding and templates
- Can generate complex layouts programmatically

**Invoice Template**:

- Company branding (user-configurable logo)
- Client details (from client table)
- Itemized time entries with task descriptions
- Subtotal (billable hours × rate)
- Total amount due
- Payment terms and instructions

**Email Delivery**:

- Use Resend API for transactional emails
- Attach generated PDF
- Track delivery status
- Support custom email templates

**Alternatives Considered**:

- React-PDF: Viable, but server-side preferred for consistency
- Third-party services (Invoice Ninja): Rejected - want full control
- HTML invoices: Rejected - clients prefer PDF for records

---

## 5. React + Express/Fastify Best Practices

### RESTful API Design Patterns

**Decision**: Use RESTful API endpoints with Express/Fastify router, consistent response patterns

**Rationale**:

- Clear, predictable URL structure follows REST conventions
- Standard HTTP methods (GET, POST, PUT, DELETE) for CRUD operations
- Centralized error handling middleware
- Type-safe request/response with Zod validation
- Easy to document with OpenAPI/Swagger

**Usage Pattern**:

```typescript
// Backend API route (Express)
import { Router } from "express";
import { z } from "zod";

const taskRouter = Router();

// POST /api/tasks - Create task
taskRouter.post("/tasks", async (req, res) => {
  const schema = z.object({
    title: z.string(),
    priority: z.enum(["low", "medium", "high"]),
  });

  const data = schema.parse(req.body);
  const task = await db.insert(taskTable).values(data).returning();

  res.json({ success: true, data: task[0] });
});

// GET /api/tasks - List tasks
taskRouter.get("/tasks", async (req, res) => {
  const tasks = await db.select().from(taskTable);
  res.json({ success: true, data: tasks });
});

// Webhook endpoint for PM systems
taskRouter.post("/webhooks/jira", async (req, res) => {
  const webhook = req.body;
  await handleJiraWebhook(webhook);
  res.json({ success: true });
});
```

**Alternatives Considered**:

- GraphQL: Rejected - REST is simpler for this use case, better caching
- tRPC/ORPC: Considered - would provide better type safety, but adds complexity
- gRPC: Rejected - overkill for web application

---

### Optimistic Updates with TanStack Query

**Decision**: Implement optimistic UI updates for all mutations

**Rationale**:

- Instant feedback improves perceived performance
- TanStack Query handles rollback automatically on error
- Reduces user frustration with loading states
- Critical for time tracking (start/stop timer feels instant)

**Implementation Pattern**:

```typescript
const mutation = useMutation({
  mutationFn: updateTask,
  onMutate: async (newTask) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ["tasks"] });

    // Snapshot previous value
    const previousTasks = queryClient.getQueryData(["tasks"]);

    // Optimistically update
    queryClient.setQueryData(["tasks"], (old) =>
      old.map((t) => (t.id === newTask.id ? newTask : t)),
    );

    return { previousTasks };
  },
  onError: (err, newTask, context) => {
    // Rollback on error
    queryClient.setQueryData(["tasks"], context.previousTasks);
  },
  onSettled: () => {
    // Refetch to ensure consistency
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  },
});
```

**Alternatives Considered**:

- No optimistic updates: Rejected - poor UX for frequent mutations
- Manual state management: Rejected - TanStack Query handles this well

---

### React Router Patterns

**Decision**: Feature-based route organization with React Router v6+

**Rationale**:

- Clear component hierarchy matches URL structure
- React Router v6 supports nested routes and layouts
- Protected routes via Clerk's authentication wrappers
- Easy to add loading states and error boundaries per route

**Route Structure**:

```typescript
// App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut } from '@clerk/clerk-react';

function App() {
  return (
    <ClerkProvider publishableKey={process.env.VITE_CLERK_KEY}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/auth/sign-in" element={<SignIn />} />
          <Route path="/auth/sign-up" element={<SignUp />} />

          {/* Protected routes */}
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<TasksList />} />
            <Route path="/tasks/:taskid" element={<TaskDetail />} />
            <Route path="/tasks/internal/:boardid" element={<InternalTaskBoard />} />
            <Route path="/time" element={<TimeTracker />} />
            <Route path="/invoices" element={<InvoicesList />} />
            <Route path="/invoices/:invoiceid" element={<InvoiceDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ClerkProvider>
  );
}
```

**Alternatives Considered**:

- Flat route list: Rejected - harder to maintain for large apps
- Next.js file-based routing: Not applicable - using separate backend

---

### CORS and Authentication Flow

**Decision**: Configure CORS for frontend-backend communication, use Clerk JWT tokens

**Rationale**:

- Frontend and backend run on separate ports in development
- CORS middleware required for cross-origin requests
- Clerk provides JWT tokens for API authentication
- Backend validates JWT on every protected endpoint

**Implementation Pattern**:

```typescript
// Backend: Express CORS configuration
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);

app.use(clerkMiddleware());

// Protected route
app.get("/api/tasks", requireAuth(), async (req, res) => {
  const userId = req.auth.userId; // From Clerk
  const tasks = await db
    .select()
    .from(taskTable)
    .where(eq(taskTable.userid, userId));
  res.json({ success: true, data: tasks });
});

// Frontend: Axios with auth token
import { useAuth } from "@clerk/clerk-react";
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Add auth token to every request
api.interceptors.request.use(async (config) => {
  const { getToken } = useAuth();
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

**Alternatives Considered**:

- Session cookies: Rejected - JWT tokens are more flexible for mobile apps
- API keys: Rejected - not suitable for user-based authentication

---

### Type Sharing Strategy

**Decision**: Shared types package with TypeScript for frontend/backend consistency

**Rationale**:

- Single source of truth for data models
- Prevents type drift between frontend and backend
- Compile-time type safety across the stack
- Simple monorepo structure with shared/ directory

**Structure**:

```typescript
// shared/types/task.ts
export interface Task {
  taskid: string;
  userid: string;
  title: string;
  source: "jira" | "monday" | "asana" | "trello" | "internal";
  priority: "low" | "medium" | "high";
  status: string;
  duedate?: Date;
  createdat: Date;
  updatedat: Date;
}

// Backend uses types
import { Task } from "@wxkanban/shared/types/task";

// Frontend uses same types
import { Task } from "@wxkanban/shared/types/task";
```

**Alternatives Considered**:

- Duplicate types: Rejected - leads to inconsistencies
- OpenAPI code generation: Considered - adds build complexity
- tRPC/ORPC: Future consideration for full end-to-end type safety

---

## Summary of Key Decisions

1. **PM Integrations**: OAuth 2.0 for all systems, adapter pattern for abstraction
2. **Sync Strategy**: Delta sync with last-write-wins conflict resolution
3. **Background Jobs**: node-cron with configurable intervals (5-15 min)
4. **Rate Limiting**: Token bucket per PM system
5. **AI Provider**: OpenAI GPT-4 primary, Gemini fallback, user-triggered
6. **Time Tracking**: Multi-timer support with millisecond precision
7. **Billing**: `invoicedAt` timestamp to prevent duplicates
8. **Invoicing**: PDFKit for PDF generation, Resend for email delivery
9. **Architecture**: RESTful API with Express/Fastify backend, React frontend with TanStack Query
10. **Authentication**: Clerk JWT tokens for frontend-backend communication
11. **Type Safety**: Shared types package for frontend/backend consistency
12. **Data Fetching**: Client-side with TanStack Query, optimistic updates for mutations

All decisions align with React + Express/Fastify best practices and project constitution requirements (v1.2.0).

---

**Status**: ✅ Phase 0 Research Complete
**Next**: Phase 1 - Design & Contracts
