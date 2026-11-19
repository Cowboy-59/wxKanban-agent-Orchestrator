# Research: Retire Plain Remote Mode

**Spec Number**: 150

## T001 — the five SCOPE-102 dependents (2026-10-28)

Searched each scope doc, its implementing spec folder and the code for: the plain `.env` launch
(`npm run remote` without `--project-agent`), `YAPPCHATT_ROOM` / `YAPPCHATT_TOKEN` / `YAPPCHATT_EMAIL` read
from the environment, the `WXKANBAN_YAPPCHATT_*` / `WXKANBAN_YAPPCHAT_*` / `WXKANBAN_REMOTE_ROOM_ID` /
`WXKANBAN_CHAT_*` aliases, `WXKANBAN_REMOTE_SEED` / `WXKANBAN_REMOTE_RESUME`, and the `GO REMOTE` phrase.
Note: `specs/132-cancelled-company-archival` is SPEC-132, unrelated to SCOPE-132.

| Dependent | Finding | Evidence |
|---|---|---|
| SCOPE-109 (customer welcome message) | no reliance | no match in `specs/Project-Scope/109-customer-welcome-message.md` or `specs/109-customer-welcome-message/` |
| SCOPE-132 (KAIN autonomous driver) | doc mention only | `specs/Project-Scope/132-kain-autonomous-driver.md:301` (bridge holds `YAPPCHATT_TOKEN`), `:452` and `:516` (plain GO REMOTE named as out of scope). Its runtime is the project agent (SPEC-134, SPEC-148), which stays |
| SCOPE-136 (wxG-O-D development manager) | **relies** | `mcp-server/src/prompts/wxgod/references/new-project.md:1134-1160` (N12): the unattended offer checks `.env` for `YAPPCHATT_ROOM` / `YAPPCHATT_EMAIL` / `YAPPCHATT_TOKEN` and a `remote` script, then launches `cd wxkanban-agent && npm run remote` with `WXKANBAN_REMOTE_SEED=/wxG-O-D --resume`, "the GO REMOTE procedure". Also `:20`, `:43`, `:413` (R7, the `--create` readiness check). Spec: `specs/136-wxgod-development-manager/tasks.md:92-93` (T022, FR-019, marked `[~]`) |
| SCOPE-142 (decision memory) | no reliance | `specs/142-decision-memory/evidence/us3-live.ts:11` imports `outbox` from the bridge, which stays; `us3-resume.ts` uses none of the removed variables or options |
| SCOPE-143 (agent model routing) | no reliance | no match in the scope doc or `specs/143-agent-model-routing-metering/` |

### Other references found (outside the five dependents)

- `WXKANBAN_YAPPCHAT_BASE_URL` is read as a real setting by the app server
  (`src/server/lib/yappchattBroker.ts:35`, `src/server/routes/community.ts:48`) and the Cockpit
  (`vscode-extension/src/services/chatSocket.ts:348`). SPEC-150's scope is the kit client only, so these
  stay; T003 removes the name only as a kit-client alias (`wxkanban-agent/core/yappchatt/client.ts:498`).
- `YAPPCHATT_DISPLAY_NAME`, `YAPPCHATT_URL` and `YAPPCHATT_WS_URL` are not in FR-011's removal list; the
  project agent's refusal line tells users to set `YAPPCHATT_DISPLAY_NAME`
  (`wxkanban-agent/apps/remote-bridge/src/agent-mode.ts:207`). They stay.
- `src/db/migrations/0068_scope134_projectrooms_table.sql:65` and `agent-mode.ts:74` mention
  `YAPPCHATT_TOKEN` in comments only (T007 comment sweep; migrations are not edited).

### Outcome

SCOPE-136 relies on the plain mode and the seed hook that FR-010 and FR-012 remove. Per T001, T002 does not
start until the owner decides how G.O.D.'s unattended offer works without them.

**Owner decision 2026-10-28:** G.O.D. goes unattended through HANDOFF REMOTE. Recorded as SCOPE-149 FR-018 and
SPEC-150 FR-018 / T010, with an amendment note on SCOPE-136 FR-019. T010 runs before T002, so G.O.D. never
points at the launch and seed T002 and T004 delete. SCOPE-132 and the comment-only mentions fold into T007.
