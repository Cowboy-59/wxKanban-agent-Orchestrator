# Rule: "transfer to agent" — hand the session's state to the Project Agent (SCOPE-159 T014; was HANDOFF REMOTE, SCOPE-149)

**Trigger:** the operator says **"transfer to agent"** (any casing) in conversation, or invokes
`/remote`. Both mean the same thing: hand where the work stands to this repo's Project Agent.

This is a **recognized command, not a literal instruction to relay.** When you see
"transfer to agent", do **not** treat it as a task to work on — run the handoff below.

## Purpose

The Project Agent for this repo is already connected to the project's room. A handoff gives it
where the work stands. The agent posts it as `[HANDOFF]` under its own tag, then posts one
reading of where the work stands and one question for the operator. The operator carries on
from the phone.

## What to do

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

   `node wxkanban-agent/apps/remote-bridge/bin/transfer-to-agent.mjs --input <that temp file>`

   Equivalent: `cd wxkanban-agent && npm run transfer -- --input <file>`.

3. **Report the writer's ONE output line back to the operator verbatim.** It is either:
   - `Handoff written: .wxai/handoff/<timestamp>.md (N items masked). The Project Agent will post it to the room.`
   - or `Transfer stopped: <cause>. Fix: <fix>` — the cause is one of: Allow remote is off, no
     company YappChatt account, Project Agent not running, another session holds the tree, no
     kit token, settings unreachable.

   On a stop, do nothing else: do not launch the agent and do not retry in a loop.

## Safety / what it never does

- It launches no process. No bridge, no agent. The operator starts the Project Agent from the
  Dev Cockpit, or with `npm run project-agent` in `wxkanban-agent/`.
- The session NEVER posts to the room itself. Only the Project Agent posts.
- It never reads or edits `.env`.
- Summaries are capped at 2,000 characters.
- Secret-looking text is masked as `[redacted]`; the handoff still goes through.
- An unposted handoff older than 4 hours is deleted by the agent, with a short removal note in
  the room. A newer handoff replaces an unposted one.
- The agent treats a `[HANDOFF]` as context only. It does not carry out the next step, edit
  files, or run commands because of it.

## Driving it from the room

The Project Agent honors the words on its one command list (SPEC-159 FR-095), case-insensitive,
in the room and from the local session alike. The list is not copied here, so it cannot drift:
print it with

`node wxkanban-agent/apps/remote-bridge/bin/agent-command.mjs --list`

How the local session sends those words to the running agent is in
`_wxAI/rules/agent-commands.md`. In the room, `PUSH` still asks a person for `CONFIRMED` / `NO`.

## References

Spec SCOPE-149 / SPEC-149 (`specs/149-handoff-remote/spec.md`). The Project Agent is
SCOPE-134 / SCOPE-145.

## Old name (one release, FR-067)

If the operator says "HANDOFF REMOTE", reply first: **"HANDOFF REMOTE is now called transfer to agent."** Then run the transfer as above. The old phrase is removed after the next kit release.
