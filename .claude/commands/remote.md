---
description: remote — hand off the current session to a phone-drivable Remote Session Bridge (GO REMOTE).
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# remote — Remote Session Bridge (SCOPE-102)

Launch the **Remote Session Bridge** so you can leave the desk and drive this project's
Claude session **from your phone**, through the project's private YappChatt room. Saying
`GO REMOTE` (or `/remote`) is the entrance; the bridge is what actually runs.

The bridge starts a headless `bypassPermissions` session and relays it into one private,
per-project chat room: its output streams into the room, and your messages there drive,
steer, and stop it. The room **is** the interface — there is no other API.

## What this command does

1. **Preflight the `.env`** (repo root). The bridge needs, per project:
   - `WXKANBAN_REMOTE_ROOM_ID` — the private YappChatt room `conversationId`.
   - `WXKANBAN_CHAT_EMAIL` — the operator identity the broker reads your control messages as (e.g. `you@example.com`).
   - `WXKANBAN_YAPPCHAT_TOKEN` — the per-room agent token (`yca_…`) the bridge **posts** as "Claude". Get it in the YappChatt web app: open the room → **Connect Claude** → copy.
   If any are missing, stop and tell the operator exactly which — do **not** launch a half-configured bridge.
2. **Launch it in the background:** `cd wxkanban-agent && npm run remote`.
   Run it as a background process — it is a long-lived relay, not a one-shot. It connects,
   posts `Claude on project <name> is connected`, and sits **idle** until a room message arrives.
3. **Seed policy — default to a MINIMAL/empty seed.** Do **not** dump the current conversation
   into `WXKANBAN_REMOTE_SEED`. A directive seed makes the headless session auto-investigate and
   edit files on its own — a second Claude on the same working tree. Only set a seed when the
   operator explicitly asks to hand off the current task; otherwise leave it empty so the bridge
   waits for the phone.

## Driving it from the room

Any normal message is a task or steering instruction. These exact words (case-insensitive) are
control signals instead:

| Word | Effect |
|------|--------|
| `STOP` / `CONTINUE` | interrupt the current turn / resume after a stop |
| `STATUS` | report project · session · working/idle · verbosity |
| `VERBOSE` / `CONCISE` | output detail |
| `PUSH` → `CONFIRMED` / `NO` | run a pre-push review; push **only** on `CONFIRMED` |
| `CANCEL REMOTE` | end remote mode, tear the bridge down |

## Safety model

- Runs in **`bypassPermissions`** so it never freezes on prompts — the private room is the
  security boundary. Keep the room strictly private and single-operator.
- The session **cannot `git push` on its own** (blocked at the SDK level). The only path to a
  push is operator-initiated `PUSH` → clean review → explicit `CONFIRMED`. `CONFIRMED` on `main`
  deploys production, so the branch/remote are named in the confirm prompt.
- Stop it any time: `CANCEL REMOTE` from the room, or `Ctrl-C` where it runs (posts the
  disconnect notice and tears down).

## See also

Full reference: `wxkanban-agent/apps/remote-bridge/README.md`. Spec: SCOPE-102
(`specs/Project-Scope/102-remote-session-bridge.md`).
