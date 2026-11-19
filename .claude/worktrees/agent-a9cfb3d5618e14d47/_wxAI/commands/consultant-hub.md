# consultant-hub — Open the Consultant Work Hub

## Purpose
Open or navigate to the Consultant Work Hub for the authenticated user, optionally filtered to a single project. Surfaces assigned tasks (internal + external PM), workload counters, compliance flags, and the billable preview. Spec 020 FR-001/FR-002.

## Usage
```bash
/consultant-hub [--project <project-id>]
```

## Arguments
- `--project <project-id>` (optional) — UUID of the project to filter the queue. If omitted, defaults to "All Projects".

## HTTP Surface
- `GET /api/consultant-hub/tasks?projectid=<id|all>` — task queue with counters
- `GET /api/consultant-hub/compliance-flags` — open compliance flags
- `GET /api/consultant-hub/invoice-preview?startDate&endDate&projectid` — billable preview

## Steps
1. Resolve the project ID (or "all").
2. Call `GET /api/consultant-hub/tasks?projectid=...` to fetch tasks + counters.
3. If anything is past-due or compliance-flagged, surface a short summary before listing.
4. Optionally fetch compliance flags and invoice preview to give context.
5. Render the result inline (assigned-task table) and link to `/dashboard/work-hub` in the UI.

## Notes
- Team-lead (`--member <user-id>`) is **deferred to scope 021**.
- All endpoints require valid JWT and scope to the authenticated user's company.
