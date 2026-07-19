# Remote Session Bridge (SCOPE-102)

Drive a Claude Code session running on this machine **from your phone**, through a private
YappChatt room. You launch it at your desk; from then on your room is the terminal — output
streams in, your messages drive the session, and you can start/answer/steer/stop remotely.

## Setup

Set these in the project's `.env` (each repo has its own, so the room is per-project):

Auth is **hybrid** (YappChat spec 091): the bridge **posts** as the Claude agent using a
per-room token, and **reads** your control messages over the WebSocket using a broker session.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `WXKANBAN_REMOTE_ROOM_ID` | **yes** | — | The private YappChatt room's `conversationId`. Provision the room in YappChat first. |
| `WXKANBAN_YAPPCHAT_TOKEN` | **yes** | — | **Write** identity — the per-room agent token (`yca_…`). In the YappChat web app, open the room → **Connect Claude** → copy. Posts are authored as "Claude". Per-room + revocable. |
| `WXKANBAN_CHAT_EMAIL` | **yes** | — | **Read** identity — the operator email the broker mints the session from (e.g. `you@example.com`). Needed so you can steer / approve pushes from the phone (the agent token can't read). |
| `WXKANBAN_CHAT_DISPLAY_NAME` | no | the email | Display name of the read session. |
| `WXKANBAN_REMOTE_MODEL` | no | SDK default | Model override for the session. |
| `WXKANBAN_REMOTE_SEED` | no | — | Text seeded as the first turn (GO REMOTE context handoff). |
| `WXKANBAN_REMOTE_RESUME` | no | — | Resume a prior session id instead of starting fresh. |
| `WXKANBAN_APP_BASE_URL` / `WXKANBAN_YAPPCHAT_BASE_URL` / `WXKANBAN_WS_URL` | no | hosted defaults | Override broker / YappChat / websocket endpoints. |

The YappChat **consumer secret is never used here** — it stays server-side in the broker
(`/api/community/session`) for the read session. The agent token is the only credential the
bridge holds for **posting**; it can only post to the room it was minted for.

## Run

```
cd wxkanban-agent
npm run remote
```

It connects, posts `on project <name> is connected` (rendered as **🤖 Claude** on the left),
and starts an **idle** session
(it does nothing until you message it). `Ctrl-C` posts the disconnect notice and tears down.

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
  (translation-proof), so your messages always get through. YappChat auto-translates Claude's
  **prose** into members' languages; code/command output is left as-is.
