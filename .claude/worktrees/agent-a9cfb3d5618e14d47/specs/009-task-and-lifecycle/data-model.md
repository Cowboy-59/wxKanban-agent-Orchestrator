# Data Model: Task and Lifecycle Management

**Branch**: `009-task-and-lifecycle`
**Date**: 2026-02-21

---

## Schema Changes to Existing Tables

### `specifications` — updated

Current columns: `id`, `projectid`, `phaseid`, `specnumber`, `title`, `content`, `status` (draft/review/approved), `createdat`, `approvedat`, `updatedat`

**Changes**:

| Column | Type | Change | Notes |
|---|---|---|---|
| `status` | VARCHAR(50) | WIDEN values | New values: `draft`, `in_review`, `pending_clarification`, `clarified`, `planned`, `tasks_generated`, `implemented`, `qa_passed`, `human_tested`, `beta_cleared`, `released`, `deferred` |
| `specorder` | INTEGER | ADD | DEFAULT 0 — display order within project |
| `isoptional` | BOOLEAN | ADD | DEFAULT false — if true, scope never blocks phase advancement |
| `createdbyid` | UUID | ADD | FK → `users.id` ON DELETE SET NULL — scope creator/owner |

**Drizzle additions** (to `src/db/schema/specification.ts`):
```typescript
specorder: integer("specorder").default(0).notNull(),
isoptional: boolean("isoptional").default(false).notNull(),
createdbyid: uuid("createdbyid").references(() => users.id, { onDelete: "set null" }),
```

**Note**: `phaseid` on `specifications` is legacy (scopes are not per-phase; they span all phases). Keep for backward compat; do not use in new queries.

---

### `tasks` — updated

Current columns: `id`, `projectid`, `phaseid`, `createdbyid`, `assignedtoid`, `sourcepmssystem`, `externalid`, `name`, `description`, `assignedduty`, `nextduty`, `issuetype`, `priority`, `duedate`, `status`, `result`, `effort`, `sourceoforigin`, `createdat`, `updatedat`

**Changes**:

| Column | Type | Change | Notes |
|---|---|---|---|
| `specid` | UUID | ADD | FK → `specifications.id` ON DELETE SET NULL NULLABLE — scope link |

**Drizzle addition** (to `src/db/schema/task.ts`):
```typescript
specid: uuid("specid").references(() => specifications.id, { onDelete: "set null" }),
```

---

## New Tables

### `taskdependencies`

Records directional blocking relationships between tasks. A task can depend on (be blocked by) multiple other tasks.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | `.defaultRandom()` |
| `taskid` | UUID | FK → `tasks.id` ON DELETE CASCADE NOT NULL | The blocked task |
| `blockedbyid` | UUID | FK → `tasks.id` ON DELETE CASCADE NOT NULL | The blocking task |
| `createdat` | TIMESTAMP | NOT NULL DEFAULT NOW | |

**Unique constraint**: `(taskid, blockedbyid)` — prevent duplicate dependency pairs.

**Drizzle schema** (`src/db/schema/taskdependency.ts`):
```typescript
import { pgTable, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { tasks } from "./task";

export const taskdependencies = pgTable("taskdependencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskid: uuid("taskid").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  blockedbyid: uuid("blockedbyid").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  createdat: timestamp("createdat").defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.taskid, t.blockedbyid),
}));

export type TaskDependency = typeof taskdependencies.$inferSelect;
export type NewTaskDependency = typeof taskdependencies.$inferInsert;
```

---

### `scopeconversations`

Stores individual turns in a Scope Chat conversation. Also stores system events (split proposals, declined splits) as `role = 'system'` entries with JSON payloads.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | `.defaultRandom()` |
| `scopeid` | UUID | FK → `specifications.id` ON DELETE CASCADE NOT NULL | Parent scope |
| `role` | VARCHAR(10) | NOT NULL | `'user'`, `'assistant'`, `'system'` |
| `content` | TEXT | NOT NULL | Message text or JSON payload for system events |
| `createdat` | TIMESTAMP | NOT NULL DEFAULT NOW | |

**Drizzle schema** (`src/db/schema/scopeconversation.ts`):
```typescript
import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { specifications } from "./specification";

export const scopeconversations = pgTable("scopeconversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  scopeid: uuid("scopeid").notNull().references(() => specifications.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(),
  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type ScopeConversation = typeof scopeconversations.$inferSelect;
export type NewScopeConversation = typeof scopeconversations.$inferInsert;
```

---

### `notifications`

In-app notification records. Polled by the client every 30 seconds.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | `.defaultRandom()` |
| `userid` | UUID | FK → `users.id` ON DELETE CASCADE NOT NULL | Recipient |
| `type` | VARCHAR(50) | NOT NULL | See notification types below |
| `entityid` | UUID | NULLABLE | ID of the related entity (task, scope, phase) |
| `entitytype` | VARCHAR(50) | NULLABLE | `'task'`, `'scope'`, `'phase'` |
| `message` | TEXT | NOT NULL | Human-readable notification text |
| `read` | BOOLEAN | NOT NULL DEFAULT false | |
| `createdat` | TIMESTAMP | NOT NULL DEFAULT NOW | |

**Notification `type` values**:

| Type | Trigger |
|---|---|
| `task_assigned` | Task assigned to user |
| `task_due_tomorrow` | Task due date is tomorrow (daily check) |
| `phase_assigned` | Phase assigned to user |
| `phase_tasks_complete` | All tasks complete in a phase |
| `phase_advanced` | Project phase advanced |
| `scope_submitted` | Scope submitted for review |
| `scope_approved` | Scope approved (notifies creator) |
| `qa_fail_bug_created` | QA task failed, bug auto-created (notifies Phase 2 assignee) |
| `task_approval_required` | New task requires ADMIN approval (Phase 5) |

**Drizzle schema** (`src/db/schema/notification.ts`):
```typescript
import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { users } from "./user";

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userid: uuid("userid").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  entityid: uuid("entityid"),
  entitytype: varchar("entitytype", { length: 50 }),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  createdat: timestamp("createdat").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
```

---

## Scope Lifecycle State Machine

```
draft
  └─(Submit for Review)──► in_review
                              ├─(Approve)──────────────────► clarified
                              ├─(Request changes)──────────► draft
                              └─(Request clarification)───► pending_clarification
                                                               └─(ADMIN resolves)──► in_review or draft

clarified
  └─(edit content by any user)──► draft  [auto-revert]
  └─(AI tasks generated)─────────► tasks_generated (after task approval)
  └─(planning complete)──────────► planned

tasks_generated
  └─(all Phase 2 tasks complete)──► implemented

implemented
  └─(all Phase 3 QA pass)─────────► qa_passed

qa_passed
  └─(Phase 4 complete)────────────► human_tested

human_tested
  └─(Phase 5 complete)────────────► beta_cleared

beta_cleared
  └─(included in Release)─────────► released

[any state]
  └─(ADMIN marks deferred)────────► deferred
  └─(ADMIN sets isoptional=true)──► [no status change; flag applied]
```

---

## Task Status State Machine by Phase

### Phase 2 — Implementation

```
open → in_progress → completed
          ↑               |
          └──(re-open)────┘
```

### Phase 3 — QA Testing

```
open → in_progress → pass
                   → fail  ──[auto-creates bug task in Phase 2 for same scope]
```

QA task stays `fail` until linked bug is `completed` and QA task is re-run.

### Phase 4 — Human Testing

```
open → resolved
     → deferred
     → escalated  ──[auto-creates draft scope stub for next release cycle]
```

### Phase 5 — Beta

Same as Phase 4. New task creation requires ADMIN confirmation modal (logged to `companyauditlogs`).

---

## Entity Relationships (ERD summary)

```
projects (1) ──────────────────── (N) specifications
projects (1) ──────────────────── (N) tasks
projects (1) ──────────────────── (6) projectphases

specifications (1) ─────────────── (N) tasks          [via tasks.specid]
specifications (1) ─────────────── (N) scopeconversations

tasks (1) ──────────────────────── (N) taskdependencies [as blocked task]
tasks (1) ──────────────────────── (N) taskdependencies [as blocking task]

users (1) ───────────────────────── (N) notifications
users (1) ───────────────────────── (N) specifications  [via createdbyid]
```

---

## Migration Steps (Human Runs)

```bash
npm run db:generate   # generates SQL migration from Drizzle schema changes
npm run db:migrate    # applies migration to dev DB
```

**Schema changes requiring migration**:
1. `specifications`: ADD `specorder INTEGER DEFAULT 0`, `isoptional BOOLEAN DEFAULT false`, `createdbyid UUID`; ALTER `status` column (values are VARCHAR, no enum — no ALTER needed, just app-level enforcement)
2. `tasks`: ADD `specid UUID REFERENCES specifications(id) ON DELETE SET NULL`
3. CREATE `taskdependencies` table
4. CREATE `scopeconversations` table
5. CREATE `notifications` table
