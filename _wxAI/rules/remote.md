# Rule: "GO REMOTE" — launch the Remote Session Bridge (SCOPE-102)

**Trigger:** the operator says **"GO REMOTE"** (any casing) in conversation, or invokes
`/remote`. Both mean the same thing: hand this session off to the phone-drivable Remote
Session Bridge for this project.

This is a **recognized command, not a literal instruction to relay.** When you see "GO REMOTE",
do **not** treat it as a task to work on — run the handoff below.

## What to do

1. **Preflight the repo-root `.env`.** The bridge requires, per project:
   - `YAPPCHATT_ROOM` — private YappChatt room `conversationId`.
   - `YAPPCHATT_EMAIL` — operator identity (broker read session).
   - `YAPPCHATT_TOKEN` — per-room agent token (`yca_…`), from the YappChatt web app:
     room → **Connect Claude** → copy.
   If any are missing, **stop and tell the operator which one(s)** — never launch a
   half-configured bridge.

2. **Launch in the background:** `cd wxkanban-agent && npm run remote`. It is a long-lived
   relay — run it as a background process, not a blocking one. It connects, announces
   `Claude on project <name> is connected`, and stays **idle** until a room message arrives.

3. **Default to a MINIMAL / empty seed.** Do **not** stuff the current conversation into
   `WXKANBAN_REMOTE_SEED`. A directive seed spawns a second autonomous Claude that edits files
   on the shared working tree. Only set a seed when the operator explicitly asks to hand off the
   current task; otherwise leave it empty so the bridge waits for the phone.

4. **Confirm the entrance is live** — tell the operator the bridge is connected to their room
   and list the control words (`STOP`, `CONTINUE`, `STATUS`, `VERBOSE`/`CONCISE`,
   `PUSH`→`CONFIRMED`/`NO`, `CANCEL REMOTE`).

## Safety (non-negotiable)

- The bridge runs in `bypassPermissions`; the **private room is the security boundary**.
- The remote session **cannot `git push` on its own** — the only push path is operator
  `PUSH` → clean review → explicit `CONFIRMED`. This upholds the never-push-without-approval rule.
- To end: `CANCEL REMOTE` from the room, or `Ctrl-C` where the bridge runs.

Full reference: `wxkanban-agent/apps/remote-bridge/README.md`. Spec: SCOPE-102.
