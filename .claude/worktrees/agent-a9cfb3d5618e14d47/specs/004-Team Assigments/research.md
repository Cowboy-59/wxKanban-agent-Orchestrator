# Phase 0 Research: Team Assignments & Duties Management

**Feature**: 004-team-assignments | **Date**: 2026-02-15 | **Status**: Complete

---

## RT-001: Compliance Rule Engine Patterns

### Decision
**Implementation Approach**: Combination of rule matrix (lookup tables) + validation logic with early-exit optimization.

**Structure**:
```typescript
// Compliance rules stored as prohibited combinations per security standard
type ComplianceRules = {
  'SOC2': ProhibitedCombinations[];
  'HITRUST': ProhibitedCombinations[];
}

// Each rule is a set of duties that cannot coexist
type ProhibitedCombination = {
  duties: string[];     // e.g., ['Developer', 'QA']
  reason: string;       // e.g., 'Separation of duties'
  standard: string;     // 'SOC2' or 'HITRUST'
}

// Validation: Check if proposed assignment violates any rule
function validateDuties(duties: string[], standard: 'SOC2'|'HITRUST'): ValidationResult {
  for (const rule of complianceRules[standard]) {
    if (duties.every(d => rule.duties.includes(d))) {
      return { valid: false, violatedRule: rule };
    }
  }
  return { valid: true };
}
```

### Rationale
- **Simplicity**: Rules are declarative, not procedural — easy to audit and update
- **Performance**: O(n) lookup where n = number of rules (~10-15 per standard) — sub-millisecond
- **Maintainability**: Rules live in constants file, not scattered in service logic
- **Flexibility**: New rules can be added without changing validation logic
- **Auditability**: Each violation is explicitly traceable to a named rule

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Graph-based rules (conflicts as graph edges) | Overkill for fixed rule set; adds complexity without benefit |
| Machine learning/heuristic classification | Impossible to audit for compliance; not suitable for regulated features |
| Hard-coded if/then chains | Unmaintainable; difficult to audit; error-prone |
| Rule engine library (Drools, etc.) | Over-engineered for 10-15 fixed rules; adds dependency bloat |

### Implementation Notes
- Store rules in `src/lib/compliance-rules.ts` as constants
- Rules imported into compliance engine service
- Each API duty assignment request validated before persistence
- Validation failures return structured error with specific rule ID

---

## RT-002: Audit Logging for Compliance Overrides

### Decision
**Implementation Approach**: Dedicated database table (ComplianceOverride) + structured logging to match existing Pino logger pattern.

**Structure**:
```typescript
// Database audit table for all compliance overrides
table("complianceoverride", {
  complianceoverrideid: uuid("complianceoverrideid").defaultRandom().primaryKey(),
  projectid: uuid("projectid").references(() => projects.projectid),
  userid: uuid("userid").references(() => users.userid),  // Duty being assigned to
  dutyname: text("dutyname"),  // Name of duty assigned
  violatedrules: text("violatedrules"),  // Comma-separated rule IDs
  overriddenby: uuid("overriddenby").references(() => users.userid),  // Team Manager who approved
  reason: text("reason").notNull(),  // Documented justification
  createdat: timestamp("createdat").defaultNow(),
})

// Structured logging (Pino)
logger.info({
  event: 'COMPLIANCE_OVERRIDE',
  projectId,
  userId,
  dutyName,
  violatedRules: ['SOC2_DEV_QA_CONFLICT'],
  overriddenBy,
  reason
}, 'Compliance override approved');
```

### Rationale
- **Dual audit trail**: Database for queries + Pino logs for forensics
- **Immutable record**: Override entries never modified, only created
- **Queryable**: Can pull audit reports per project, user, or override date range
- **Compliance-ready**: Satisfies audit requirements (who, when, what, why)
- **Consistent**: Follows wxKanban logging patterns (Pino structured JSON)

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Log file only (no database) | Cannot query audit history; difficult to generate compliance reports |
| Event streaming (Kafka/RabbitMQ) | Over-engineered for internal audit trail; adds operational complexity |
| In-memory audit trail | Lost on server restart; no historical data for compliance |
| Separate audit service | Adds microservice complexity; wxKanban is monolithic |

### Implementation Notes
- ComplianceOverride table indexed on `projectid` and `overriddenby` for query performance
- Audit entries created atomically with DutyAssignment (transaction)
- Reason field validated for minimum length (50 chars recommended)
- Retention policy: Keep all override records (no deletion)

---

## RT-003: Task Routing Integration with Existing System

### Decision
**Integration Approach**: Extend existing task completion flow with duty-aware assignment logic; leverage existing `TaskAssignment` or create thin wrapper.

**Implementation**:
```typescript
// When task marked complete in existing system:
// 1. Get current duty from task context
// 2. Find next duty in sequence (Developer → Design → ... → Publish)
// 3. Query for team members with that duty on the project
// 4. If exactly one: auto-assign and continue
// 5. If multiple: return prompt list to UI
// 6. If none: return error (must assign first)

async function routeTaskToNextDuty(taskId: string): Promise<TaskRoutingResult> {
  const task = await getTask(taskId);
  const currentDuty = task.assignedduty;  // Existing field
  const sequence = DUTY_SEQUENCE;  // [Developer, Design, SystemReview, QA, FinalReview, Publisher]

  const currentIndex = sequence.indexOf(currentDuty);
  const nextDutyName = sequence[currentIndex + 1];  // Could be undefined if at end

  if (!nextDutyName) {
    return { status: 'complete', message: 'Task completed all duty stages' };
  }

  const availableUsers = await getUsersWithDuty(task.projectid, nextDutyName);

  if (availableUsers.length === 0) {
    return { status: 'error', message: 'No team members assigned to next duty' };
  }

  if (availableUsers.length === 1) {
    await assignTaskToDuty(taskId, nextDutyName, availableUsers[0].userid);
    return { status: 'autoAssigned', userId: availableUsers[0].userid };
  }

  return { status: 'prompt', options: availableUsers };
}
```

### Rationale
- **Non-invasive**: Doesn't require redesign of existing task system
- **Gradual adoption**: Can be added to task completion endpoint incrementally
- **Fallback safe**: If duty system not fully set up, tasks still complete normally
- **Reuses existing data**: No new task tables needed; uses existing assignment

### Assumptions
- Existing task system has `assignedduty` field (or can be extended)
- Task completion is API endpoint that can trigger duty routing
- Team members with no duties assigned should not appear in routing options

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| State machine library (xstate) | Overkill for linear 6-step sequence; adds complexity |
| Rules engine for routing (Drools) | Unnecessary; sequence is fixed per spec |
| Event-driven routing (publish task.completed) | Good pattern but requires event infrastructure upgrade |

### Implementation Notes
- Add `assignedduty` field to existing task model if not present
- New route: `POST /api/tasks/{taskId}/complete` or extend existing completion endpoint
- Routing logic in `src/server/services/task-routing.ts`
- Integration tests in `tests/integration/task-routing.test.ts`

---

## RT-004: Duty Sequence Storage Design

### Decision
**Storage Approach**: Fixed constant sequence (no database storage needed); stored as TypeScript enum for type safety.

**Implementation**:
```typescript
// src/lib/duty-sequence.ts

export enum DutySequence {
  DEVELOPER = 'Developer',
  DESIGN_COORDINATOR = 'Design Coordinator',
  SYSTEM_REVIEW = 'System Review',
  QA = 'QA',
  FINAL_ACCEPTANCE_REVIEW = 'Final Acceptance Review',
  PUBLISHER = 'Publisher',
  ALL = 'ALL',
}

// Ordered sequence array
export const DUTY_SEQUENCE_ORDER: DutySequence[] = [
  DutySequence.DEVELOPER,
  DutySequence.DESIGN_COORDINATOR,
  DutySequence.SYSTEM_REVIEW,
  DutySequence.QA,
  DutySequence.FINAL_ACCEPTANCE_REVIEW,
  DutySequence.PUBLISHER,
];

// Lookup functions
export function getNextDuty(currentDuty: DutySequence): DutySequence | undefined {
  const index = DUTY_SEQUENCE_ORDER.indexOf(currentDuty);
  return index >= 0 ? DUTY_SEQUENCE_ORDER[index + 1] : undefined;
}

export function isDutyInSequence(duty: DutySequence): boolean {
  return DUTY_SEQUENCE_ORDER.includes(duty);
}
```

### Rationale
- **Per spec requirement**: "Fixed global assignment sequence... not configurable per project" (Assumption #2)
- **Type safety**: TypeScript enum prevents invalid duty names
- **Zero overhead**: No database queries needed for sequence lookup
- **Immutable**: Sequence cannot be accidentally changed at runtime
- **Simplicity**: Sequence is defined once in code, not through admin UI

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Database table (duties table with sequence field) | Adds complexity; spec requires fixed sequence |
| Configuration file (JSON/YAML) | Less type-safe; requires parsing and validation |
| Admin-configurable sequence | Violates spec (Assumption #2: "not configurable per project") |

### Implementation Notes
- `DUTY_SEQUENCE_ORDER` is immutable (const array)
- Special handling for `ALL` duty (not in main sequence)
- Never modify sequence in code — create new release if sequence changes
- Tests verify sequence correctness (can't accidentally reorder)

---

## RT-005: Permission/Authorization Checks for Duty Assignment

### Decision
**Authorization Model**: Role-based access control (RBAC) using existing Clerk authentication; only users with Team Manager role (or project owner) can assign duties.

**Implementation**:
```typescript
// Middleware for duty assignment routes
export async function requireTeamManagerRole(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = req.user;  // From Clerk middleware

  // Check if user is Team Manager on the project
  const projectId = req.params.projectId;
  const userRole = await getUserProjectRole(user.id, projectId);

  if (!['TeamManager', 'ProjectOwner', 'Admin'].includes(userRole)) {
    return res.status(403).json({
      error: 'INSUFFICIENT_PERMISSIONS',
      message: 'Only Team Managers can assign duties'
    });
  }

  next();
}

// Apply middleware to duty assignment routes
router.post('/api/projects/:projectId/duties/assign',
  requireTeamManagerRole,
  validateDutyAssignmentRequest,
  handleDutyAssignment
);
```

### Rationale
- **Existing auth**: Clerk already handles user authentication in wxKanban
- **Role-based**: Simple role check (Team Manager, Admin, Owner) sufficient per spec
- **Scalable**: As feature expands, can extend with more granular permissions
- **Auditability**: Clerk logs show who made the assignment
- **Spec alignment**: "Only Team Managers (and above) can override compliance warnings" (Assumption #4)

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Attribute-based access control (ABAC) | Over-engineered for simple "Team Manager or not" check |
| Custom permission matrix | Adds complexity; Clerk RBAC sufficient |
| No authorization (trust client) | Violates security principles; open to abuse |
| Fine-grained capability tokens | Overkill for internal system; team is small |

### Implementation Notes
- Leverage existing Clerk user and role system (no new auth provider)
- Create `Team Manager` role in Clerk if not exists
- Validate user role on every duty assignment request
- Log authorization failures for security audit
- Override approval (compliance) also requires Team Manager role

---

## Summary of Decisions

| Research Task | Decision | Impact | Status |
|---------------|----------|--------|--------|
| **RT-001** | Rule matrix + validation logic | Sub-millisecond compliance checks | ✅ Ready |
| **RT-002** | Database audit table + Pino logging | Compliance-auditable override trail | ✅ Ready |
| **RT-003** | Extend existing task completion flow | Non-invasive integration | ✅ Ready |
| **RT-004** | Fixed TypeScript enum (no DB table) | Type-safe, zero-overhead sequence | ✅ Ready |
| **RT-005** | Clerk RBAC (Team Manager role required) | Leverages existing auth, simple checks | ✅ Ready |

**All NEEDS CLARIFICATION items resolved.** ✅ Ready to proceed to Phase 1 design.

---

## Technology Stack Decisions

From research, confirmed technology choices:

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **Rules Engine** | TypeScript + procedural validation | Simple, auditable, performant |
| **Audit Logging** | Pino (structured JSON) + PostgreSQL table | Follows wxKanban patterns; compliance-ready |
| **Task Integration** | Extend existing task completion endpoint | Non-invasive; leverages existing system |
| **Sequence Management** | TypeScript enum constants | Type-safe; immutable; zero overhead |
| **Authorization** | Clerk RBAC | Already integrated; no new dependencies |

---

*Phase 0 complete. Ready for Phase 1: Design & Contracts.*
