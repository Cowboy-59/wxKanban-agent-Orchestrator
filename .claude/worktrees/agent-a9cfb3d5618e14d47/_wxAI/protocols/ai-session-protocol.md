# AI Session Protocol (Spec 020 FR-005)

This is the protocol every wxAI / AI agent MUST follow when performing development work on a wxKanban spec. The protocol exists so AI-driven time, attribution, and completion summaries are captured for billing and audit (FR-005, FR-013).

## When the protocol applies

The protocol applies whenever wxAI does any of the following on behalf of an authenticated consultant:

- Reads, writes, or refactors code for a spec
- Generates / updates spec artifacts (spec.md, tasks.md, plan.md, data-model.md, OpenAPI)
- Runs migrations, tests, or builds tied to a spec
- Answers consultant questions about the spec mid-engagement

The protocol does NOT apply for:

- Casual conversation unrelated to any spec
- Initial scoping conversations before a spec exists
- Read-only inspection that doesn't change state

## The four lifecycle hooks

### Hook 1 — Open the session (T040)

Before doing **any** development work on a spec, call:

```bash
/ai-session start <spec-id>
```

- Idempotent: returns the existing active session for `(specid, userid)` if one exists.
- Once a session is open, the consultant can leave and return in a new conversation; the session keeps accumulating.
- Implementation: `POST /api/consultant-hub/ai-session/start` with `{ specid, projectid }`.

### Hook 2 — Switch attribution as you change tasks (T041)

When wxAI begins work on a different task within the spec, call:

```bash
/ai-session task <spec-id> <task-id>
```

- Closes the prior open task entry (writes `endtime` + `duration`).
- Opens a new `projecttimeentries` row with `source='ai'` and `aispecsessionid=<session>`.
- Only one task entry is open at a time per session.
- Implementation: `POST /api/consultant-hub/ai-session/:id/task-switch` with `{ taskid }`.

### Hook 3 — Account for Q&A and clarification overhead (T042)

When wxAI engages in conversation that isn't tied to a specific task — clarifying requirements, answering consultant questions, discussing trade-offs — accumulate the elapsed minutes and periodically call:

```bash
/ai-session overhead <spec-id> <minutes>
```

- Increments `aispecsessions.overheadduration` by `minutes`.
- Recommended cadence: every ~5 minutes of active Q&A, or whenever the conversation transitions back to task work.
- Implementation: `POST /api/consultant-hub/ai-session/:id/overhead` with `{ minutes }`.

### Hook 4 — Close with summaries when the work is done (T043)

When wxAI finishes the engagement OR confirms all spec tasks are completed, generate:

1. **Per-task summary** — short paragraph of what was changed/accomplished for each task touched (keyed by `taskid`).
2. **Spec-level rollup summary** — one paragraph that captures the overall outcome of the AI engagement on this spec.

Then call:

```bash
/ai-session close <spec-id>
```

with payload `{ taskSummaries: { ... }, sessionSummary: "..." }`.

- Closes any open task entry, writes summaries, computes `totalduration`, marks `status='completed'`.
- Implementation: `POST /api/consultant-hub/ai-session/:id/close`.

## Auto-close (background)

A background job runs every 60s and closes any active session whose linked spec tasks are **all** `status='completed'`. wxAI should still call `close` explicitly before the auto-close fires when it has summary text to persist — auto-close runs without summary content.

## Concurrent manual timers

The AI session runs as a separate channel from `source='manual'` consultant timers. FR-012's single-active-timer rule applies to manual only. A consultant may have:

- A manual `/track-time` timer active on task X, AND
- An AI session with an open AI entry on task Y,

simultaneously. Both produce independent `projecttimeentries` rows.

## Hard cap (T018 timeout sweep)

Any session older than 30 days is force-stopped with `status='timeout'` by a background sweep. AI agents should not rely on sessions remaining open indefinitely.

## Failure modes — what to do

| Situation | Action |
|---|---|
| `/ai-session start` returns 404 (project not found) | Halt. Spec is not associated with a valid project. Surface to consultant. |
| `/ai-session task` returns "Session is timeout/completed" | Start a new session with `/ai-session start` and retry. |
| Network error mid-session | Continue work; retry on next hook. Time is still captured in the open entry on next successful call. |
| Consultant explicitly says "stop tracking" | Call `/ai-session close` immediately with whatever summaries exist. |

## Why this matters

The educational mission ([memory/project_educational_mission.md]) is teaching consultants the rhythm of accountable AI-augmented work. Per-task attribution, written summaries, and overhead accounting are how the kit demonstrates that AI work is auditable just like manual work — not magic.

## Reference

- Spec 020 FR-005 — full requirement
- `_wxAI/commands/ai-session.md` — command surface
- `src/server/services/AISpecSessionService.ts` — server implementation
- `src/server/jobs/aiSpecSessionJobs.ts` — background workers
