# Project Agent (remote bridge — SCOPE-102, SCOPE-134)

Drive a Claude Code session running on this machine **from your phone**, through the project's
company-owned YappChatt room. The bridge runs only as the project's **Project Agent**: output
streams into the room, your messages drive the session, and you can start/answer/steer/stop
remotely. To hand the work you are doing in the editor over to it, say **HANDOFF REMOTE**
(or `/remote`) — see `_wxAI/rules/remote.md`.

## Setup

Nothing to paste. The agent fetches everything with the project's kit token
(`WXKANBAN_API_TOKEN`): the room (derived server-side), a room token minted once and kept in
the gitignored `.wxai/agent-room.json`, the read identity, and a bound MCP token. The project
must have **Allow remote** switched on in wxKanban.

Auth is **hybrid** (YappChatt spec 091): the bridge **posts** as the Claude agent using the
per-room token, and **reads** your control messages over the WebSocket using a broker session.

Optional settings in the project's `.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `WXKANBAN_REMOTE_MODEL` | SDK default | Model override for the session. |
| `YAPPCHATT_DISPLAY_NAME` | the project name | Display name of the read session and the post prefix. |
| `YAPPCHATT_URL` / `YAPPCHATT_WS_URL` / `WXKANBAN_APP_BASE_URL` | hosted defaults | Override broker / YappChatt / websocket endpoints. |

The room keys the plain mode once read (`YAPPCHATT_ROOM`, `YAPPCHATT_TOKEN`,
`YAPPCHATT_EMAIL`, their `WXKANBAN_*` aliases, `WXKANBAN_REMOTE_SEED` and
`WXKANBAN_REMOTE_RESUME`) are no longer read (SPEC-150). The kit prints one notice when it
finds them and never edits `.env`; you can delete them.

The YappChatt **consumer secret is never used here** — it stays server-side in the broker
(`/api/community/session`) for the read session. The agent token is the only credential the
bridge holds for **posting**; it can only post to the room it was minted for.

## Run

Start it from the Dev Cockpit (**wxKanban: Start Project Agent**), or:

```
cd wxkanban-agent
npm run remote
```

Both run the project-agent path. It binds the room, posts `on project <name> is connected`
(rendered as **🤖 Claude** on the left) and starts an **idle** session (it does nothing until
you message it). `Ctrl-C` posts the disconnect notice and tears down.

## From the room

Any normal message is a task / steering instruction. These exact words (case-insensitive) are
control signals instead:

| Word | Effect |
|------|--------|
| `STOP` | Interrupt the current turn (session stays live). |
| `CONTINUE` | Resume after a stop. |
| `STATUS` | Report project · session · working/idle · verbosity. |
| `VERBOSE` / `CONCISE` | Output detail (concise = summaries + one line per tool call). |
| `PUSH` | Run a pre-push review; if clean, ask to confirm the push. |
| `CONFIRMED` / `NO` | Approve / decline a pending push (only meaningful after `PUSH`). |
| `CANCEL REMOTE` | End remote mode: disconnect and exit. |

## Safety model

- Runs in **`bypassPermissions`** so it never freezes on prompts — it *will* edit files and run
  commands when you ask. The private room is the security boundary: keep it strictly private.
- The session **cannot `git push`** on its own (blocked at the SDK level). The only way to push is
  the operator-initiated `PUSH` → clean **wxUIUXCodeReview** → explicit `CONFIRMED`. Nothing ships
  without your word. `CONFIRMED` on `main` deploys, so the branch/remote are named in the prompt.
- Claude posts as a distinct **agent** user (`isagent`), so its lines render on the left as
  "🤖 Claude" automatically — no content prefix. The bridge drops its own echoes by that flag
  (translation-proof), so your messages always get through. YappChatt auto-translates Claude's
  **prose** into members' languages; code/command output is left as-is.
