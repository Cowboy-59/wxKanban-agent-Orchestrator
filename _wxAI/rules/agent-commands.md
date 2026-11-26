# Rule: agent commands — the local session sends listed commands to the Project Agent (SCOPE-159 / SPEC-159 FR-095)

**Trigger:** the operator, in this local session, types a word that is on the Project Agent's
command list while the Project Agent is running — for example **status**, **autopilot** or
**go**.

This is a **recognized command, not a literal instruction to relay or answer.** When the
operator types one, do **not** answer it yourself and do not treat it as work to do — send it
to the agent below.

## The one command list

There is one list, and both the room and this session read it
(`wxkanban-agent/apps/remote-bridge/src/command-set.ts`). It is **not** copied into this rule,
so it cannot drift. `status`, `autopilot` and `go` are anchors only; the full list is whatever
the writer prints:

`node wxkanban-agent/apps/remote-bridge/bin/agent-command.mjs --list`

Fetch it **once per session**, the first time a command might apply, and keep it. Each line is
one command: its usage, any other spellings (`also:`), and what it does.

## What to do

1. **Check the word against the list.** Only a word on the list is sent. Anything else is
   ordinary conversation — handle it as usual.

2. **Relay go / no / skip only when both hold:** the operator typed the word themselves, AND a
   list or a question from the Project Agent is waiting for that answer. Never send one on your
   own reading of what the operator probably wants.

3. **Run the writer from the repo root** with the operator's command:

   `node wxkanban-agent/apps/remote-bridge/bin/agent-command.mjs <command>`

   Equivalent: `cd wxkanban-agent && npm run command -- <command>`.

4. **Report the writer's output back to the operator verbatim.** For every command but
   `status` and `autopilot` it is ONE line, one of:
   - `Sent to the Project Agent: <command>.` — the agent answers in the room.
   - `The Project Agent is not running. Start it from the Dev Cockpit (Project Agent), or run `npm run project-agent` in wxkanban-agent/.`
   - `Not a command. Run with --list for the commands. Nothing was written.`
   - a line saying nothing is waiting for that answer (go, no or skip with no list or question
     waiting) — nothing was written.
   - a pointer line for a command that keeps its own rule (below).

   On anything but `Sent`, do nothing else: do not start the agent and do not retry in a loop.

5. **`status` is answered by the writer itself** (FR-096). It writes no command file, works
   with the agent down, and exits 0 either way. It may print several lines — the same summary
   the room's STATUS posts, built by the same builder. Report **every line verbatim**, in order,
   and add nothing.

6. **`autopilot` waits for the agent's answer** (FR-097). The writer sends it, then waits up to
   about 30 seconds. It prints either the devplan list the agent posted to the room (several
   lines, ending with a line telling the operator to type go), the room's line when there is no
   devplan or nothing to run, or the one line
   `Sent to the Project Agent: autopilot. The list will appear in the room.` Report **every line
   verbatim**, in order, and add nothing. Then **stop and wait for the operator to type go** (or
   no, or `skip <num>`). Never type go yourself.

## Commands that keep their own rule

- **push** keeps the local git rule (`_wxAI/rules/git.md`): never push unless the operator
  explicitly asks in the current message. The writer refuses to send it. In the room, push asks
  a person for `CONFIRMED`.
- **transfer to agent** keeps `_wxAI/rules/transfer.md`. The writer only prints a pointer to it.

## Safety / what it never does

- The session **never invents a command** and **never answers one itself** — not a go, not a
  CONFIRMED. The agent's answer appears in the room. The exceptions are `status`, which the
  writer (not the session) answers from disk, and `autopilot`, whose list the writer reads back
  from disk once the agent has saved it; the session only reports their lines.
- A command from this session never settles a pending push or a pending approval, and never
  starts the push gate. The agent posts one line saying push and CONFIRMED are answered by a
  person in the room.
- The writer starts no process, opens no network connection and mints no token. It writes one
  small file into `.wxai/command/` (git-ignored) only when the agent is running, and never for
  `status`.
- A command file not run within 2 minutes is deleted unrun. Each file runs once.
- The session never posts to the room itself. Only the Project Agent posts.
- It never reads or edits `.env`.

## References

Spec SCOPE-159 / SPEC-159 (`specs/159-agent-common-room-r1/spec.md`, FR-095, FR-096, FR-097). The handoff it
sits beside is `_wxAI/rules/transfer.md`.
