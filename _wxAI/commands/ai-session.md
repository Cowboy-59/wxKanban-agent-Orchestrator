# ai-session — Spec-Level AI Engagement Session

## Purpose
Open and manage the **spec-level AI session** that captures all AI-driven dev work for a given spec. The session persists across consultant conversations, attributes time per-task as wxAI moves through the spec's task list, accumulates Q&A as overhead, and auto-closes when every spec task hits `status='completed'`. Spec 020 FR-005.

## Usage
```bash
/ai-session start    <spec-id>
/ai-session task     <spec-id> <task-id>
/ai-session overhead <spec-id> <minutes>
/ai-session close    <spec-id>
/ai-session status   <spec-id>
```

## HTTP Surface
- `POST /api/consultant-hub/ai-session/start` — body `{ specid, projectid }` (idempotent — returns existing active session if one exists for `(specid, userid)`)
- `GET  /api/consultant-hub/ai-session/active?specid=<id>` — pick up an existing session in a new conversation
- `POST /api/consultant-hub/ai-session/:id/task-switch` — body `{ taskid }`
- `POST /api/consultant-hub/ai-session/:id/overhead` — body `{ minutes }`
- `POST /api/consultant-hub/ai-session/:id/close` — body `{ taskSummaries?: {[taskid]: string}, sessionSummary?: string }`
- `GET  /api/consultant-hub/ai-session/:id` — session detail with per-task entries

## Semantics

### Session lifetime
- Opens on first AI dev work for a spec (`start`).
- Persists across conversation boundaries — closing the chat does NOT close the session.
- Auto-closes within 60s of every `projecttasks` row linked to the spec hitting `status='completed'` (background job).
- Hard cap: any session older than 30 days is force-stopped with `status='timeout'`.

### Task attribution
- Only **one task-level AI entry** is open at a time per session.
- `task` switches close the prior open `projecttimeentries` row (writing `endtime` + `duration`) and open a new one for the named task with `source='ai'` and `aispecsessionid` set.
- The first time a task is touched in a session, `aispecsessions.taskcount` increments.

### Overhead
- `overhead <spec-id> <minutes>` increments `aispecsessions.overheadduration` for Q&A or clarification time not tied to a single task.
- wxAI should periodically (e.g., every 5 min of active Q&A) batch up and report overhead minutes.

### Concurrency with manual timers
- AI sessions run as a **separate channel** from `source='manual'` timers (FR-012 governs manual only).
- A consultant manual timer and an AI session can be active concurrently.

### Close behavior
- Writes per-task `completionnotesummary` from `taskSummaries` map (most recently started entry for each taskid is chosen as the target).
- Writes `aispecsessions.summary` from `sessionSummary`.
- Computes `totalduration` = SUM(task entries' duration) + `overheadduration`.

## Steps for wxAI

1. Before performing development on a spec, call `/ai-session start <spec-id>` (idempotent).
2. Before working on each task, call `/ai-session task <spec-id> <task-id>`.
3. While engaged in Q&A or clarification that isn't task-specific, accumulate elapsed minutes and periodically call `/ai-session overhead <spec-id> <minutes>`.
4. On natural end-of-engagement OR confirmation that the spec is complete:
   - Generate per-task summaries from the work performed.
   - Generate a spec-level rollup summary.
   - Call `/ai-session close <spec-id>` with both payloads.
5. If the spec finishes naturally (all tasks `status='completed'`), the background job auto-closes the session — wxAI should still call `close` first if it has summaries to write.

## Notes
- Use `/track-time` for **manual** consultant work; never call it for AI work.
- `summary` text is the source of truth for invoice line-items derived from AI sessions.
