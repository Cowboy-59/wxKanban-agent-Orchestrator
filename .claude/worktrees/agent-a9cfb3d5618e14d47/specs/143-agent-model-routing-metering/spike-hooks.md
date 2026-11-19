# SPEC-143 T001 Spike: hooks, tokens and window usage (FR-001)

Run 2026-10-23 in a throwaway project (scratchpad `spike143-hooks/`, own `.claude/settings.json`, `--setting-sources project`). Headless `claude -p ... --max-turns 8`, main model Sonnet, one subagent on Haiku through the Agent tool's `model` parameter, plus one run with two parallel subagents (Haiku and Sonnet). Both bypassPermissions and default mode were run. Two CLI builds were tested: **2.1.98** (the `claude` on PATH) and **2.1.309** (the binary bundled in the VS Code extension, which the interactive sessions use).

**Verdict: CAPTURE FEASIBLE = yes.** Hooks give the trigger, ids and paths. Transcripts give exact per-model tokens. The model id and timing come from the transcripts or hooks.

## Hook events (same results in bypass and default mode)

| Event | Session | Subagent | Model | Tokens | Timing |
|---|---|---|---|---|---|
| SessionStart | yes | no | no (docs say optional; absent in both builds) | no | hook time only |
| UserPromptSubmit | yes | no | no | no | hook time |
| PreToolUse (Agent) | yes (parent) | n/a | requested alias only, `tool_input.model` ("haiku") | no | hook time = spawn |
| SubagentStart | no | yes (`agent_id`, `agent_type`) | no | no | hook time = start |
| Pre/PostToolUse inside subagent | n/a | yes (carries `agent_id`) | no | no | `duration_ms` (2.1.309 only) |
| SubagentStop | no | yes, plus **`agent_transcript_path`** | no | no | hook time = end |
| PostToolUse (Agent) | yes (parent) | n/a | `tool_response.resolvedModel` ("claude-haiku-5-5", 2.1.309 only) | `tool_response.usage` and `totalTokens`, **final request only** | `totalDurationMs`, `duration_ms` |
| PostToolBatch | yes | yes | no | no | no (2.1.309 only; **invalid in 2.1.98**) |
| Stop | yes | no | no | no | hook time |
| SessionEnd | yes (`reason`) | no | no | no | hook time (1.5 s timeout) |
| statusLine | **never runs under `-p`** | | | | |
| TaskCreated/TaskCompleted, Notification, PreCompact, StopFailure | did not fire (no task, compact or error) | | | | |

`PostToolUse(Agent).usage` undercounts. In one run it reported cr=50429, while the subagent transcript shows 2 requests with cr=100445. Do not use it for totals.

## Proven token source: transcript files

- **Subagent:** `SubagentStop.agent_transcript_path` = `~/.claude/projects/<proj>/<session>/subagents/agent-<agent_id>.jsonl`. A sidecar file, `agent-<id>.meta.json`, holds `agentType`, `model` (the requested alias), `spawnDepth` and `toolUseId`.
- **Main session:** `transcript_path` (from any hook). It excludes the subagents' messages.
- **Per request:** lines where `type == "assistant"`. Read `message.model` (the resolved id), `message.usage.input_tokens`, `.output_tokens`, `.cache_read_input_tokens` and `.cache_creation_input_tokens`. **Dedupe by `message.id`**, because one response is written as several lines that repeat the same usage. Skip `model == "<synthetic>"`.
- **Start and end:** the first and last line `timestamp`. These matched the SubagentStart and SubagentStop hook times to within about 0.7 s.

Check against `--output-format json` `modelUsage` (main transcript + subagent transcripts, per model):
- 2.1.98: **exact match** for all 4 fields, both modes, and for the parallel run. A Sonnet subagent merges into the Sonnet main total.
- 2.1.309: Sonnet is exact. Haiku shows about +1220 input and +18 output tokens per session. OTel names this as `query_source: "auxiliary"`, a side call that no transcript holds. It is small, but the report should label "transcript totals exclude auxiliary calls".
- Note: the json top-level `usage` covers the main model only. Use `modelUsage`.

Secondary source: OpenTelemetry (`CLAUDE_CODE_ENABLE_TELEMETRY=1`). It emits `claude_code.token.usage` with `model`, `type` (input/output/cacheRead/cacheCreation), `query_source` (main/subagent/auxiliary), `agent.name` and `session.id`. It has **no agent_id**, so it cannot split one subagent from another. It also carries `user.email` and org ids, so it must never leave the machine raw.

## Plan window usage

- Hooks: **not available.**
- `claude -p "/usage"`: returns no result. It cannot be scripted.
- statusLine `rate_limits.five_hour/seven_day.used_percentage`: interactive sessions only.
- **Headless, 2.1.309:** `--output-format stream-json --verbose` emits `rate_limit_event.rate_limit_info.unifiedWindows.{five_hour,seven_day}.{utilization,resetsAt}` (seen: 0.03 and 0.09). In 2.1.98 only `status`, `resetsAt` and `rateLimitType` are present, with no percentage.
- So window burn is readable for kit-launched headless runs on 2.1.309+, and for interactive sessions through a statusLine script. Otherwise the report marks it unavailable.

## Overhead and limits

- A node hook costs about 250 ms per event on this Windows box (10 cold spawns = 2.5 s). Register only `SubagentStop`, `PostToolUse` (matcher `Agent`) and `Stop`. Parse transcripts in `Stop`, or in a detached child, not in `SessionEnd` (1.5 s timeout).
- **Trap:** one unknown event name (`PostToolBatch`, `PreModelSwitch` on 2.1.98) **silently disables every hook in the file**. Ship only events valid on the oldest supported CLI.
- Version skew: PATH 2.1.98 differs from VS Code 2.1.309 (`resolvedModel`, `duration_ms` and window utilization are missing on the old one).
- The transcript format is undocumented, so parse defensively and store `null` for unknown values (C1).
- Not tested: background subagents (`run_in_background`), nested subagents, compaction.

## Key code

Logger hook (`hooks/log-hook.mjs`): reads stdin JSON, cuts strings to 300 characters, redacts keys matching `/(token|secret|key|password|authorization|cookie)$/i`, and appends `{at, event, input}` to `hook-log.jsonl`.

Transcript summer (the proven token source):

```js
export function sumTranscript(path) {
  const byMsg = new Map(); let first = null, last = null;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue; let r; try { r = JSON.parse(line); } catch { continue; }
    if (r.timestamp) { first ??= r.timestamp; last = r.timestamp; }
    if (r.type !== 'assistant' || !r.message?.usage || r.message.model === '<synthetic>') continue;
    byMsg.set(r.message.id ?? r.uuid, { model: r.message.model, u: r.message.usage });
  }
  const models = {};
  for (const { model, u } of byMsg.values()) {
    const m = (models[model] ??= { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    m.requests++; m.input += u.input_tokens ?? 0; m.output += u.output_tokens ?? 0;
    m.cacheRead += u.cache_read_input_tokens ?? 0; m.cacheWrite += u.cache_creation_input_tokens ?? 0;
  }
  return { start: first, end: last, models };
}
```
