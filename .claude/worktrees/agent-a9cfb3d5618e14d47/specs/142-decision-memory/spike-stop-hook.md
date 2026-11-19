# Spike: Stop hook for plain-text questions (T001, FR-006)

**Verdict: WORKS.** Run 2026-10-22 by the spike agent on Claude Code 2.1.98, `claude -p --output-format json`, model claude-sonnet-4-6. Recorded by the managing agent; the spike's raw outputs are in the session scratchpad (`spike-stop-hook/`), not in the repo.

A Stop hook can read the agent's final message, detect that it ends in a question, block the stop, and feed back a stored answer. The agent then continues and uses it. Seen in both `bypassPermissions` and default mode.

| Run | Hook saw final message | Blocked and resumed | Used the injected answer | Wall time |
|---|---|---|---|---|
| bypass, no tools | yes | yes, 2 turns | yes | 10 s |
| default, no tools | yes | yes, 2 turns | yes (cited the decision id) | 11 s |
| bypass, Read, ask, Write | yes | yes | yes | 29 s |
| default, Read, ask, Write | yes | yes | yes (the Write was refused by the headless permission system, not the hook) | 19 s |

## Contract relied on
- **Input (stdin JSON):** `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `stop_hook_active`, `last_assistant_message`. `last_assistant_message` was present in every run and matched the transcript's last text.
- **Output:** `{"decision":"block","reason":"<answer text>"}` on stdout, exit 0. The agent receives `reason` and continues. Exit 0 with no JSON lets it stop.
- **Loop guard:** `stop_hook_active` is true on the resumed stop. The docs say at most 8 consecutive stop-hook continuations are allowed (resets when a tool is called), adjustable with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`.

## Limits that change the build
1. A blanket `stop_hook_active` guard lets a *second, different* question through to the developer. Guard on the question text instead (remember the questions already answered this turn).
2. Stop fires only when the turn ends in text. A question asked through the `AskUserQuestion` tool is invisible to it; that is the PreToolUse path (FR-005).
3. Cost is one extra model turn, about 2 to 10 seconds. The hook itself is near-instant.
4. A request phrased without a trailing "?" (for example "Please approve...") is missed by an "ends in a question" test. Treat a trailing request for a decision the same way, or accept the miss and log it as an observe-mode statistic.

## Decision
FR-006 is **met** by the Stop hook. The fallback rule ("search before asking") is still shipped as a belt-and-braces instruction, because limits 1 and 4 mean some questions will reach the developer anyway.
