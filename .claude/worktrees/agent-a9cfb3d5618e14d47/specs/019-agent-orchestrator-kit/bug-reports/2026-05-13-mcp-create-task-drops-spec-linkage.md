# Bug report: MCP `project.create_task` drops spec linkage

**Date filed**: 2026-05-13
**Filed against**: spec 019 (Agent Orchestrator Kit)
**Surfaced during**: Investigation of empty "tasks outstanding" counts on the wxKanban Scope Kanban cards
**Severity**: medium — every task the kit creates via MCP lands orphaned from its parent spec, breaking per-scope progress reporting throughout the app

---

## Summary

The MCP tool `project.create_task` accepts no `specId` parameter and never writes one to `projecttasks.specid`. The orchestrator kit knows which spec it is generating tasks for (e.g., during `createtesttasks`, `implement`, `task-push`), but that linkage is silently dropped at the MCP boundary. Result: tasks land in the DB with `specid = NULL`, invisible to every scope-scoped query (Scope Kanban cards, scope drill-downs, lifecycle progress rollups, etc.).

## Evidence

Snapshot of `projecttasks` (wxKanban DB, taken 2026-05-13):

| sourceoforigin | sourcepmssystem | status | count |
| -------------- | --------------- | ------ | ----- |
| external       | NULL            | todo   | 12    |
| external       | NULL            | done   | 7     |

- Total tasks: 45 → 26 linked to a spec, **19 orphaned** (`specid = NULL`).
- Every orphan has `sourcepmssystem = NULL`, so they did **not** come from PM sync.
- Names of orphans are unambiguous kit output: `Spec011 status/link base 1774137776393`, `Spec011 implicit 1774137610490`, `T001 Define initial implementation tasks`, plus two duplicate batches of six websocket tasks (`Define websocket protocol contract`, `Implement authenticated connection lifecycle`, etc.) created seconds apart on 2026-04-04 — the fingerprint of a kit run.

Spec 024 ("Pending Projects") is the only scope with any visible task progress in the Kanban UI; every other spec shows zero because tasks created via the kit never got linked back.

## Root cause

### Location 1 — schema is missing `specId`

[`mcp-server/src/utils/schemas.ts:77-87`](../../../mcp-server/src/utils/schemas.ts)

```ts
export const CreateTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(255),
  descriptionMarkdown: z.string().min(1),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  dueDate: z.string().datetime().optional(),
  sourceEventId: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).optional(),
  assignee: z.string().max(255).optional(),
});
```

There is no `specId` field, so callers cannot supply one even if they know it.

### Location 2 — handler ignores `specid` on insert

[`mcp-server/src/server.ts:618-631`](../../../mcp-server/src/server.ts)

```ts
case 'project.create_task': {
  const input = CreateTaskInputSchema.parse(args);

  const [task] = await db.insert(projecttasks).values({
    projectId: input.projectId,
    name: input.title,
    description: input.descriptionMarkdown,
    status: input.status || 'todo',
    priority: input.priority || 'medium',
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    sourceEventId: input.sourceEventId || null,
    documentIds: input.documentIds || [],
    assignee: input.assignee || null,
  }).returning();
  ...
}
```

`projecttasks.specid` has a foreign key to `projectspecifications.id` (with `onDelete: set null`) and accepts NULL, so the insert succeeds silently — there is no error, no log, no warning. The linkage is just gone.

### Location 3 — kit callers have nothing to pass

The kit's task-creation paths (`createtesttasks`, `implement`, the `task-push` flow referenced in [`KitGenerationService.ts:623`](../../../src/server/services/KitGenerationService.ts#L623)) call `project.create_task` knowing which spec they are inside, but with no `specId` parameter to populate, they cannot forward that context.

## Downstream impact

- **Scope Kanban cards** ([`ScopeKanbanCard.tsx`](../../../src/client/components/Projects/ScopeKanbanCard.tsx)) show `0 tasks outstanding` for every spec that ever had tasks created via the kit.
- **Per-scope task lists** ([`taskService.ts:128`](../../../src/server/services/taskService.ts#L128) `getScopeTaskGroups`) return empty.
- **Lifecycle phase rollups** that join `projecttasks → projectspecifications` undercount work.
- **Audit reports** ([`AuditReportService.ts:134-135`](../../../src/server/services/AuditReportService.ts#L134-L135)) similarly miss kit-created work when grouping by spec.

Compounding issue (separate, but worth noting in the same fix pass): the kit writes `status: 'todo' | 'done'`, but the [`projecttask.ts` schema comment](../../../src/db/schema/projecttask.ts#L39) declares the canonical vocabulary as `'open' | 'in_progress' | 'completed' | 'orphaned'`. [`ScopeService.ts:68-71, 175-178`](../../../src/server/services/ScopeService.ts) was patched on the same investigation to accept both conventions, but the underlying drift between the kit's `'todo'`/`'done'` writes and the schema's documented `'open'`/`'completed'` vocabulary should be resolved (either codify both as legal, or have the kit emit the canonical values).

## Suggested fix

### Forward fix — MCP boundary

1. Extend `CreateTaskInputSchema`:
   ```ts
   specId: z.string().uuid().optional(),
   ```
2. Forward it in the insert at [`server.ts:621`](../../../mcp-server/src/server.ts#L621):
   ```ts
   specid: input.specId ?? null,
   ```
3. Update kit callers (`createtesttasks`, `implement`, `task-push`) to pass the spec ID they already have in scope. Audit each call site to confirm it has access to the spec UUID — if not, surface the gap as a follow-up bug.
4. Decide on the `'todo'`/`'done'` vs `'open'`/`'completed'` vocabulary and codify it in **one** place (schema comment or a Zod enum), then make the kit and the rest of the codebase honor that choice.

### Backfill the 19 existing orphans

Task names already encode the parent spec for 18 of 19:

| Orphan signature                                                              | Target spec        |
| ----------------------------------------------------------------------------- | ------------------ |
| 12 tasks named `Define websocket…`, `Implement authenticated connection…`, … | spec `001 websocket` |
| 6 tasks named `Spec011 …`                                                     | spec `011`         |
| 1 task `T001 Define initial implementation tasks`                              | needs review       |

Backfill as a one-shot SQL migration or admin maintenance script — not as a feature path. The remaining ambiguous task should be triaged manually.

## Acceptance criteria

- `project.create_task` accepts and persists `specId`.
- Every kit-driven task-creation path forwards the spec UUID.
- A new task created via the kit for spec N appears in spec N's Kanban card "outstanding" count.
- The 19 existing orphans are either linked to their parent spec or explicitly marked `'orphaned'` after manual review.
- `projecttasks.status` vocabulary is documented in exactly one place and respected by every writer (kit, PM sync, UI).

## Out of scope

- Per-spec progress UI changes (already shipped on 2026-05-13: spec number prefix + outstanding count in [`ScopeKanbanCard.tsx`](../../../src/client/components/Projects/ScopeKanbanCard.tsx)).
- Migrating the `ScopeService.ts` query to a stricter status vocabulary — the lenient `IN ('open','todo')` / `IN ('completed','done')` patch is acceptable until the vocabulary is unified.
