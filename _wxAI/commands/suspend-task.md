# suspend-task — Mark Task Blocked or Suspended

## Purpose
Mark a task as `blocked` or `suspended` with a required reason. Writes an audit row to `taskstateoverrides` and queues an outbound PM sync if the task originates from an external system. Spec 020 FR-007 + FR-006.

## Usage
```bash
/suspend-task <task-id> --status <blocked|suspended> --reason "<text>"
```

## Arguments
- `<task-id>` — UUID of the assigned task to update.
- `--status <blocked|suspended>` (required) — new state to set.
- `--reason "<text>"` (required) — non-empty explanation. Stored in `taskstateoverrides.reason` for audit.

## HTTP Surface
- `PATCH /api/consultant-hub/tasks/:taskid/state` — body `{ status, reason }`

## Behavior
1. Validate `--status` is `blocked` or `suspended` and `--reason` is non-empty (≥1 char after trim).
2. PATCH the route with the payload.
3. Server:
   - Updates `projecttasks.status` (mapping `blocked`/`suspended` directly).
   - Inserts row into `taskstateoverrides` (userid, status, reason, createdat).
   - If `sourcepmssystem` is set on the task AND the user has a matching `pmsystemconnections` row, inserts a pending `tasksyncrecords` row for the outbound sync cycle (FR-006).
   - 403 if task is not assigned to the calling user.
4. Display the resolved status + audit confirmation back to the user.

## Reverting to active
Use `PATCH /api/consultant-hub/tasks/:taskid/state` with `status: "active"` (reason optional) — resolves any open blocked/suspended overrides by stamping `resolvedat`.

## Notes
- Reason is no longer appended to `projecttasks.description` (legacy behavior superseded by `taskstateoverrides`).
- Compliance rule re-evaluation happens out-of-band per the compliance rules engine.
