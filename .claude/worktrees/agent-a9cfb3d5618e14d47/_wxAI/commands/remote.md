---
description: remote — hand where the work stands to this repo's Project Agent so you can carry on from your phone (HANDOFF REMOTE).
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# remote — Handoff to the Project Agent (SCOPE-149)

Saying `HANDOFF REMOTE` (or `/remote`) is a **command, not a task to relay.** It hands where
the work stands to this repo's Project Agent, which is already connected to the project's room.
The agent posts it as `[HANDOFF]` under its own tag, then posts one reading of where the work
stands and one question for you. You carry on from your phone.

## What this command does

1. **Compose the summary fields** from the current session as JSON. All keys are optional;
   empty means `none`.

   | Key | Content |
   | --- | --- |
   | `repo` | repository name |
   | `branch` | current branch |
   | `workingOn` | scope and task |
   | `done` | what is finished (string or array of strings) |
   | `inFlight` | what is under way (string or array of strings) |
   | `blocked` | blocked, or waiting on a decision (string or array of strings) |
   | `uncommitted` | `{ "count": <n>, "files": ["path", ...] }` — counts and file NAMES only |
   | `nextStep` | the next step |
   | `resume` | where to resume |

   **Never** include file contents, diffs, or secrets. The writer also strips diffs and file
   bodies and masks secrets, but do not rely on that.

2. **Write the JSON to a temp file** (the OS temp folder or the session scratchpad, NOT inside
   the repo) and run the writer from the repo root:

   `node wxkanban-agent/apps/remote-bridge/bin/handoff-remote.mjs --input <that temp file>`

   Equivalent: `cd wxkanban-agent && npm run handoff -- --input <file>`.

3. **Report the writer's ONE output line back verbatim.** It is either:
   - `Handoff written: .wxai/handoff/<timestamp>.md (N items masked). The Project Agent will post it to the room.`
   - or `Handoff stopped: <cause>. Fix: <fix>` — the cause is one of: Allow remote is off, no
     company YappChatt account, Project Agent not running, another session holds the tree, no
     kit token, settings unreachable.

   On a stop, do nothing else: do not launch the agent and do not retry in a loop.

## Safety / what it never does

- It launches no process. No bridge, no agent. You start the Project Agent from the Dev
  Cockpit, or with `npm run project-agent` in `wxkanban-agent/`.
- The session NEVER posts to the room itself. Only the Project Agent posts.
- It never reads or edits `.env`.
- Summaries are capped at 2,000 characters.
- Secret-looking text is masked as `[redacted]`; the handoff still goes through.
- An unposted handoff older than 4 hours is deleted by the agent, with a short removal note in
  the room. A newer handoff replaces an unposted one.
- The agent treats a `[HANDOFF]` as context only. It does not carry out the next step, edit
  files, or run commands because of it.

## Driving it from the room

The Project Agent still honors these control words (case-insensitive):

| Word | Effect |
| --- | --- |
| `STOP` / `CONTINUE` | interrupt the current turn / resume after a stop |
| `STATUS` | report project, session, working or idle, verbosity |
| `VERBOSE` / `CONCISE` | output detail |
| `PUSH` → `CONFIRMED` / `NO` | run a pre-push review; push only on `CONFIRMED` |
| `CANCEL REMOTE` | end remote mode |
| `TRIAGE` | run feedback triage (feedback-sink project only) |

## References

Spec SCOPE-149 / SPEC-149 (`specs/149-handoff-remote/spec.md`). The Project Agent is
SCOPE-134 / SCOPE-145.
