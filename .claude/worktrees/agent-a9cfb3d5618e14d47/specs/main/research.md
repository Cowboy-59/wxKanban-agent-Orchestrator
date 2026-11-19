# Research & Technical Decisions: wxKanban

**Phase 0 Research** — Consolidation of design decisions and best practices for implementation

**Date**: 2026-02-12 | **Status**: ✅ Consolidated

---

## 1. PM System Integration Architecture

### Decision: OAuth2 Token Exchange + Periodic Polling

**Rationale**:

- OAuth2 avoids storing plaintext credentials; users grant permission directly to PM systems
- Periodic polling (5-15 min intervals) respects API rate limits without risk of hitting limits with real-time syncing
- Refresh tokens enable long-lived connections without user re-authentication

**Alternatives Considered**:

- ❌ Real-time webhooks: Difficult to implement across 4 different PM systems; requires different endpoint architectures
- ❌ Direct credential storage: Security risk (plaintext or weak encryption); violates compliance best practices

**Architecture**:

```
User → wxKanban OAuth Flow → PM System → Access Token (1-2 hrs) + Refresh Token
wxKanban Background Job → Poll PM API every 5-15 min → Update local task cache
Task sync failures → Logged but don't block; retry on next polling cycle
```

**Implementation Notes**:

- Use `node-oauth2` or PM SDK libraries (e.g., `jira-client`, `asana`)
- Store encrypted access tokens in DB (AES-256-GCM)
- Implement exponential backoff for failed syncs
- Track last successful sync timestamp per PM connection

---

## 2. Real-Time Sync vs Polling Trade-offs

### Decision: Async Queue + Periodic Polling (5-15 min)

**Rationale**:

- Polling is simpler to implement and debug across heterogeneous PM systems
- 5-15 minute intervals are acceptable for most developer workflows (not real-time chat)
- Avoids webhook endpoint management and reduces operational complexity

**Polling Interval Strategy**:

- User can configure: 5 min (aggressive), 10 min (default), 15 min (relaxed)
- Server background job uses Bull queue (Node.js) for task distribution
- Failed syncs logged but don't block task management

**Error Handling**:

- API rate limit exceeded → exponential backoff, user notified
- Auth failure → mark connection as "expired", prompt user to re-authenticate
- Network failure → retry next cycle, no data loss

**Alternatives Considered**:

- ❌ Real-time websockets: Would require persistent connections; overkill for 1-3 projects
- ❌ Webhook events from PM systems: Complex setup per system; not all PM systems support equally

---

## 3. AI Task Proposal Implementation

### Decision: Gemini API (fallback to OpenAI)

**Rationale**:

- Gemini API cheaper than OpenAI for text-only tasks (no vision needed)
- Better context window for analyzing project specifications
- Fallback to OpenAI if Gemini unavailable

**Trigger Strategy**:

- User starts work on a task → system analyzes project context
- Calls AI API with: project description, existing tasks, phase context
- Generates 3-5 task suggestions with reasoning
- User reviews and accepts/rejects individually

**Cost Control**:

- Cache suggestions for 1 hour (avoid duplicate API calls)
- User can disable auto-proposals in settings
- Batch proposal generation (run every 5 min, not per-task)

**Fallback Behavior**:

- If Gemini unavailable → use OpenAI
- If both unavailable → show cached suggestions or disable feature gracefully

---

## 4. Multi-Phase Workflow State Machine

### Decision: Server-Side State Machine with Transaction Logging

**Rationale**:

- Phase transitions are business logic that must be validated server-side
- Prevents concurrent modifications (race condition protection)
- Full audit trail required for compliance

**Phase Lifecycle**:

```
pending → in_progress → complete → [optionally reopened] → in_progress → complete
```

**Transition Rules** (enforced in backend):

1. Design (Phase 1) → Implementation (Phase 2): All specs must be approved
2. Implementation → QA: All implementation tasks complete
3. QA → Human Testing: All QA tests pass
4. Human Testing → Beta: No open critical feedback
5. Beta → Release: All beta feedback resolved
6. Any phase → prior phase (reopened): Logs reason and timestamp

**State Machine Definition** (in backend):

```typescript
type PhaseStatus = "pending" | "in_progress" | "complete" | "reopened";

interface PhaseTransition {
  fromPhase: PhaseName;
  toPhase: PhaseName;
  requiredConditions: string[]; // What must be true before transition
  timestamp: Date;
  reason: string;
  userId: string;
}
```

**Concurrent Phase Handling**:

- While Phase 1 reopens, Phases 2+ can continue (no blocking)
- But project cannot advance to next phase until reopened phase re-completes

---

## 5. Time Tracking & Inactivity Detection

### Decision: Client-Side Timer with Server Validation

**Rationale**:

- Client-side timer (browser timer) provides responsive UI
- Server stores only final start/end times and duration
- Server validates duration matches calculated time (client + server sync check)

**Inactivity Threshold**:

- Default: 8 hours (configurable by user: 2-16 hours)
- When exceeded: Show confirmation dialog
  - Option 1: Confirm full 8 hours (auto-round)
  - Option 2: Trim to specific end time
  - Option 3: Cancel and discard time

**Implementation**:

```
Client: localStorage stores timer state (task ID, start time, paused)
Server: Stores only start/end timestamps + duration (minutes)
Validation: Ensure |duration - (endTime - startTime)| < 60 seconds
```

**Accuracy**:

- Client timer accuracy: ~1 second (browser timer)
- Server clock sync: Tolerance of ±60 seconds
- No sub-minute precision needed for billing

---

## 6. Invoicing & Invoice Generation

### Decision: Server-Side PDF Generation (Puppeteer/Playwright) + CSV Export

**Rationale**:

- Server-side generation ensures consistent formatting across users
- Puppeteer can generate PDFs from HTML templates (reusable)
- CSV export for accounting software compatibility (QuickBooks, FreshBooks, etc.)

**Invoice Generation Pipeline**:

1. User selects project + date range
2. Backend aggregates time entries for selected range
3. Calculates: total hours × hourly rate = total due
4. Separates billable vs non-billable hours
5. Generates PDF from template (client name, due date, itemized tasks, total)
6. Stores invoice record with downloadUrl and timestamp
7. Marks selected time entries as "invoiced" to prevent duplicate billing

**Export Formats**:

- PDF (for sending to client)
- CSV (for accounting software)
- JSON (for API consumers)

**Email Integration**:

- Optional: Send PDF via Sendgrid
- Tracks: email sent timestamp, delivery status
- Prevents duplicate sends (check for prior email in same invoice)

---

## 7. Secure Credential Storage

### Decision: AES-256-GCM Encryption at Rest + Secure Key Management

**Rationale**:

- AES-256 is standard for encrypting sensitive data at rest
- GCM mode provides both encryption and authentication
- Keys should NOT be stored with encrypted data

**Key Management Strategy**:

- Production: Use AWS KMS or HashiCorp Vault (recommended)
- Development: Use environment variable with base64-encoded key (DEV ONLY)
- Rotation: Support periodic key rotation with decryption of old data

**Implementation**:

```typescript
// Encrypt PM access token before storage
const encrypted = crypto.encrypt(accessToken, kmsKey);
await db.insert(pmConnection).values({
  pmSystem: 'jira',
  accessToken: encrypted, // Stored as encrypted blob
  refreshToken: encrypted,
});

// Decrypt on retrieval
const connection = await db.query(pmConnection).where(...);
const decryptedToken = crypto.decrypt(connection.accessToken, kmsKey);
```

**Secrets NOT to encrypt** (use env vars instead):

- OpenAI API key
- Gemini API key
- Sendgrid API key
- Database credentials
- Clerk secret keys

---

## 8. Database Schema Design

### Decision: PostgreSQL + Drizzle ORM with UUID v7 Primary Keys

**Rationale**:

- PostgreSQL: Mature, ACID-compliant, excellent JSON support
- Drizzle ORM: Type-safe, zero-runtime overhead, migrations built-in
- UUID v7: Time-ordered for better performance on writes (not random shuffling)

**Naming Conventions** (per Constitution):

- Tables: singular (`user`, `project`, `task` not `users`, `projects`, `tasks`)
- Primary keys: `{table}id` with UUID v7 (e.g., `userid`, `projectid`)
- Foreign keys: Match parent PK name (e.g., `task.projectid` references `project.projectid`)
- Fields: lowercase (e.g., `accesstoken`, `lastrunattat`)
- Indexes: On foreign keys, status, timestamps

**Schema Highlights**:

```typescript
// Example: user table
export const user = pgTable("user", {
  userid: uuid("userid").primaryKey().defaultRandom(), // UUID v7 via pg_uuidv7()
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("passwordhash").notNull(),
  createdAt: timestamp("createdat").defaultNow(),
  updatedAt: timestamp("updatedat").defaultNow(),
});

// Example: task table
export const task = pgTable("task", {
  taskid: uuid("taskid").primaryKey().defaultRandom(),
  projectid: uuid("projectid").references(() => project.projectid),
  externalId: varchar("externalid"), // From PM system
  pmSystem: varchar("pmsystem"), // 'jira', 'monday', 'asana', 'trello'
  // ...
});
```

---

## 9. Phase Lifecycle Enforcement

### Decision: Database Triggers + Application-Level Validation

**Rationale**:

- Database constraints ensure data integrity (enforce single source of truth)
- Application validation provides user-friendly error messages

**Enforcement Points**:

1. Phase transition endpoint validates completion criteria
2. Database trigger prevents invalid state transitions
3. Audit table logs all transitions with reason and timestamp

**Completion Criteria Logic**:

```typescript
const canTransition = async (projectId, fromPhase, toPhase) => {
  switch (toPhase) {
    case "Implementation":
      // All specs must be approved
      return !(await hasUnapprovedSpecs(projectId));
    case "QA":
      // All implementation tasks complete
      return !(await hasIncompleteImplementationTasks(projectId));
    case "HumanTesting":
      // All QA tests pass
      return await allQATestsPass(projectId);
    // ... etc
  }
};
```

---

## 10. Authentication & Session Management

### Decision: wxKanban Database Authentication + JWT Tokens (No Third-Party Auth)

**Rationale**:

- Implement authentication directly in wxKanban database (no external dependencies)
- JWT tokens enable stateless API authentication
- Password hashing with bcrypt for security
- Session management via httpOnly cookies + JWT

**Database Schema**:

```typescript
export const user = pgTable("user", {
  userid: uuid("userid").primaryKey().defaultRandom(),
  email: varchar("email").unique().notNull(),
  passwordhash: varchar("passwordhash").notNull(), // bcrypt hash
  createdAt: timestamp("createdat").defaultNow(),
  updatedAt: timestamp("updatedat").defaultNow(),
});

export const session = pgTable("session", {
  sessionid: uuid("sessionid").primaryKey().defaultRandom(),
  userid: uuid("userid").references(() => user.userid),
  token: varchar("token").notNull(), // JWT
  expiresAt: timestamp("expiresat").notNull(),
  createdAt: timestamp("createdat").defaultNow(),
});
```

**Authentication Flow**:

1. User registers: email + password → bcrypt hash stored in DB
2. User logs in: email + password → compare against bcrypt hash
3. On successful login: Generate JWT token (exp: 24 hours)
4. Store JWT in httpOnly cookie + session table
5. Frontend validates JWT on each API request
6. Backend validates JWT signature + expiry

**Password Requirements**:

- Minimum 8 characters
- Must contain uppercase, lowercase, number, special character
- Hashed with bcrypt (12 salt rounds)

**Session Management**:

- JWT expires in 24 hours
- Optional refresh token rotation (15-day refresh tokens)
- Session table tracks active sessions (allows multi-device logout)
- Logout removes session from table

**Security**:

- Password never logged or displayed
- JWT stored in httpOnly cookie (CSRF protected)
- Implement CORS properly (restrict to wxKanban domain)
- Rate limit login attempts (max 5 per minute per IP)

**Authorization Levels**:

- Public: `/auth/register`, `/auth/signin`, `/auth/forgot-password`
- Authenticated: All other endpoints (require valid JWT)
- Admin: Internal only (future feature, not MVP)

---

## Technology Stack Summary

| Layer         | Technology                 | Version  | Justification                          |
| ------------- | -------------------------- | -------- | -------------------------------------- |
| Framework     | TanStack Start             | Latest   | Required by Constitution               |
| Frontend      | React                      | 18+      | Required by Constitution               |
| Backend       | Fastify/Express            | Latest   | Required by Constitution               |
| Database      | PostgreSQL                 | 15+      | Required by Constitution               |
| ORM           | Drizzle                    | Latest   | Type-safe, zero-runtime overhead       |
| Auth          | bcrypt + JWT (custom)      | Latest   | No external dependencies, full control |
| Session       | httpOnly cookies + JWT     | Latest   | Secure, stateless auth                 |
| State Mgmt    | TanStack Query             | Latest   | Required by Constitution               |
| API Contracts | OpenAPI 3.0                | Latest   | Industry standard                      |
| Testing       | Vitest + Playwright        | Latest   | Fast unit + E2E testing                |
| PM APIs       | Jira SDK, Monday SDK, etc. | Latest   | Official SDKs                          |
| AI            | Gemini API                 | Latest   | Cost-effective, good context window    |
| PDF           | Puppeteer                  | Latest   | Headless browser-based generation      |
| Encryption    | `crypto` (Node.js)         | Built-in | AES-256-GCM                            |
| Hashing       | bcrypt                     | Latest   | OWASP recommended password hashing     |

---

## Open Questions (for Phase 1 Design Review)

1. **Vault Strategy**: Use AWS KMS, Hashicorp Vault, or encrypted env vars for dev?
   - Recommendation: AWS KMS for production, env var for dev

2. **Batch Processing**: Run PM sync as scheduled job or on-demand?
   - Recommendation: Scheduled job (Bull queue) every 5-15 min + on-demand via user action

3. **Feedback Loop**: Can Phase 1 spec be generated automatically from Phase 4 feedback?
   - Recommendation: Auto-generate spec template, require user approval before creating

4. **Concurrent Editing**: What if user edits task while sync is in progress?
   - Recommendation: Last-write-wins (wxKanban overwrites PM system)

5. **Mobile Responsiveness**: Priority for MVP?
   - Recommendation: Desktop/tablet focus; basic mobile support via responsive design

---

**Status**: ✅ Research Consolidated
**Next Step**: Phase 1 Design & Contracts (data-model.md, contracts/, quickstart.md)
