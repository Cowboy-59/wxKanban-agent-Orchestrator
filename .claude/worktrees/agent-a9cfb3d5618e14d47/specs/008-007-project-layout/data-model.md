# Data Model: Project Layout & Lifecycle Workspace

**Feature**: 008-007-project-layout
**Date**: 2026-02-21

---

## Schema Changes Summary

| Action | Table | Change |
|---|---|---|
| ALTER | `projectphases` | ADD `assigneduserid` UUID FK |
| ALTER | `tasks` | ADD `phaseid` UUID FK |
| ALTER | `tasks` | ADD `issuetype` VARCHAR(50) |
| ALTER | `specifications` | ADD `phaseid` UUID FK |
| ALTER | `timeentries` | ADD `phaseid` UUID FK |
| ALTER | `projects` | Fix `createProject` to set `companyid` from JWT context |
| CREATE | `projectdocuments` | New table for AI-generated overview and docs |

---

## 1. `projectphases` — ADD `assigneduserid`

```typescript
// src/db/schema/projectphase.ts — add field:
assigneduserid: uuid("assigneduserid")
  .references(() => users.id, { onDelete: "set null" }),
```

**Full updated schema:**
```
id              UUID PK (defaultRandom)
projectid       UUID FK → projects.id ON DELETE CASCADE NOT NULL
phasename       VARCHAR(50) NOT NULL  -- 'Design','Implementation','QA','HumanTesting','Beta','Release'
status          VARCHAR(50) DEFAULT 'pending' NOT NULL  -- 'pending','in_progress','complete','reopened'
assigneduserid  UUID FK → userprofiles.id ON DELETE SET NULL NULLABLE  ← NEW
enteredat       TIMESTAMP NULLABLE
completedat     TIMESTAMP NULLABLE
reason          TEXT NULLABLE  -- reopen reason
createdat       TIMESTAMP NOT NULL defaultNow
```

---

## 2. `tasks` — ADD `phaseid`, `issuetype`

```typescript
// src/db/schema/task.ts — add fields:
phaseid: uuid("phaseid")
  .references(() => projectphases.id, { onDelete: "set null" }),
issuetype: varchar("issuetype", { length: 50 }).default("task"),
```

**Full updated schema:**
```
id              UUID PK
projectid       UUID FK → projects.id ON DELETE CASCADE NOT NULL
phaseid         UUID FK → projectphases.id ON DELETE SET NULL NULLABLE  ← NEW
createdbyid     UUID FK → userprofiles.id ON DELETE SET NULL NULLABLE
assignedtoid    UUID FK → userprofiles.id ON DELETE SET NULL NULLABLE
sourcepmssystem VARCHAR(50) NULLABLE
externalid      VARCHAR(255) NULLABLE
name            VARCHAR(255) NOT NULL
description     TEXT NULLABLE
issuetype       VARCHAR(50) DEFAULT 'task'  ← NEW  -- 'task','bug','feature'
priority        VARCHAR(50) DEFAULT 'medium' NOT NULL
duedate         DATE NULLABLE
status          VARCHAR(50) DEFAULT 'open' NOT NULL  -- 'open','in_progress','completed','orphaned'
effort          VARCHAR(50) NULLABLE
sourceoforigin  VARCHAR(50) DEFAULT 'external' NOT NULL  -- 'external','internal','ai_proposed'
result          VARCHAR(50) NULLABLE  -- 'pass','fail' (QA phase)
createdat       TIMESTAMP NOT NULL
updatedat       TIMESTAMP NOT NULL
```

> Note: `result` field for QA tasks is not currently in schema — add alongside `issuetype`.

---

## 3. `specifications` — ADD `phaseid`

```typescript
// src/db/schema/specification.ts — add field:
phaseid: uuid("phaseid")
  .references(() => projectphases.id, { onDelete: "set null" }),
```

**Full updated schema:**
```
id          UUID PK
projectid   UUID FK → projects.id ON DELETE CASCADE NOT NULL
phaseid     UUID FK → projectphases.id ON DELETE SET NULL NULLABLE  ← NEW
specnumber  VARCHAR(10) NOT NULL  -- '001','002',...
title       VARCHAR(255) NOT NULL
content     TEXT NOT NULL
status      VARCHAR(50) DEFAULT 'draft' NOT NULL  -- 'draft','review','approved'
createdat   TIMESTAMP NOT NULL
approvedat  TIMESTAMP NULLABLE
updatedat   TIMESTAMP NOT NULL
```

---

## 4. `timeentries` — ADD `phaseid`

```typescript
// src/db/schema/timeentry.ts — add field:
phaseid: uuid("phaseid")
  .references(() => projectphases.id, { onDelete: "set null" }),
```

---

## 5. `projectdocuments` — NEW TABLE

```typescript
// src/db/schema/projectdocument.ts — new file:
export const projectdocuments = pgTable("projectdocuments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectid: uuid("projectid")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // 'overview','readme','architecture'
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull().default(""),
  createdat: timestamp("createdat").defaultNow().notNull(),
  updatedat: timestamp("updatedat").defaultNow().notNull(),
  createdbyid: uuid("createdbyid")
    .references(() => users.id, { onDelete: "set null" }),
});
```

---

## 6. Data Hierarchy

```
companies
  └── projects (companyid FK)
        └── projectphases (6 per project, projectid FK)
        │     └── tasks (projectid + phaseid FK)
        │     └── specifications (projectid + phaseid FK, Design phase only)
        │     └── timeentries (projectid + phaseid FK)
        └── projectusers (project roster, separate from phase assignment)
        └── projectdocuments (overview, readme — 1 per type)
        └── companyauditlogs (phase transitions, beta approvals)
```

---

## 7. Entity Relationships

### Project → Phase (1:6)
Each project always has exactly 6 phase records. Created atomically on project insert.

### Phase → User (N:1, nullable)
`projectphases.assigneduserid` — the phase lead. NULL = unassigned. One user per phase per project.

### Phase → Tasks (1:N)
Tasks scoped to exactly one phase. `tasks.phaseid` is the binding field.

### Phase → Specifications (1:N)
Spec stubs scoped to Design phase. `specifications.phaseid` = Design phase id.

### Project → Documents (1:N)
One overview document per project. Type field prevents duplicates (enforce in service, not DB constraint for flexibility).

---

## 8. Visibility Rule (SQL)

**ADMIN** (`usertype = 'ADMIN'`):
```sql
SELECT p.* FROM projects p
WHERE p.companyid = $companyid
ORDER BY p.updatedat DESC
```

**Non-admin** (`TEAM_MEMBER`, `TEAM_MANAGER`):
```sql
SELECT DISTINCT p.* FROM projects p
JOIN projectphases pp ON pp.projectid = p.id
WHERE p.companyid = $companyid
  AND pp.status = 'in_progress'
  AND pp.assigneduserid = $userid
ORDER BY p.updatedat DESC
```

---

## 9. Phase Completion Criteria (Service Logic)

| Phase | SQL Check | Passes When |
|---|---|---|
| Design | `SELECT COUNT(*) FROM specifications WHERE phaseid=$1 AND status='approved'` | count ≥ 1 |
| Implementation | `SELECT COUNT(*) FROM tasks WHERE phaseid=$1 AND status != 'completed'` | count = 0 |
| QA | `SELECT COUNT(*) FROM tasks WHERE phaseid=$1 AND (status != 'completed' OR result != 'pass')` | count = 0 |
| Human Testing | `SELECT COUNT(*) FROM tasks WHERE phaseid=$1 AND status='open'` | count = 0 |
| Beta | `SELECT COUNT(*) FROM tasks WHERE phaseid=$1 AND status='open'` | count = 0 |
| Release | `SELECT COUNT(*) FROM projectphases WHERE projectid=$1 AND status != 'complete' AND phasename != 'Release'` | count = 0 |

---

## 10. Audit Log Events (companyauditlogs)

| Action | Trigger | Fields |
|---|---|---|
| `phase_advanced` | Phase marked complete | `{ projectid, fromphase, tophase, reason }` |
| `phase_reopened` | Phase reopened | `{ projectid, phasename, reason }` |
| `beta_task_approved` | Task created in Beta phase | `{ projectid, taskid, taskname, approvedby }` |
