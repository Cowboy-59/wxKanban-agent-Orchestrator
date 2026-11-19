# track-time — Manual Consultant Timer Control

## Purpose
Start or stop a **manual** consultant time-tracking session on a task. Manual-only — AI execution time uses `/ai-session` instead. Spec 020 FR-004 + FR-012.

## Usage
```bash
/track-time start <task-id>
/track-time stop  <task-id>
```

## Arguments
- `start <task-id>` — Start a manual timer on the specified task. Rejected if a manual timer is already active for this user.
- `stop <task-id>` — Stop the running timer on the specified task. Triggers the `BillablePromptModal` in the UI.

## HTTP Surface
- `POST /api/time-tracking/start` — body `{ projectid, taskid, description?, billable=true }`
- `POST /api/time-tracking/stop/:entryid` — stops the active manual timer
- `GET /api/time-tracking/active` — read the current active timer (manual + AI both visible; UI scopes to source as needed)
- `PATCH /api/time-tracking/entries/:entryid` — applied by `BillablePromptModal` to set final billable + notes

## Behavior
- **start**:
  - Look up task to derive `projectid` (consultant hub task list, or `GET /api/consultant-hub/tasks/:taskid`).
  - POST `/api/time-tracking/start` with `billable: true` (overridable on stop).
  - 409 if user already has a `source='manual'` active timer (FR-012 mutex).
- **stop**:
  - Find the active manual timer for this user (`GET /api/time-tracking/active`).
  - POST `/api/time-tracking/stop/:entryid`.
  - UI opens `BillablePromptModal` for the consultant to confirm billable Y/N + notes.

## Notes
- AI-attributed work should NEVER call this command; use `/ai-session` (FR-005).
- `source='manual'` is the default for entries created here.
