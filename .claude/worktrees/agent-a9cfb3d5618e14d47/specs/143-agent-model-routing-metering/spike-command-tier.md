# SPEC-143 T002 Spike — Per-command model tier (FR-016 / US10)

**Date**: 2026-10-23 · **Claude Code tested**: 2.1.309 (VS Code extension native binary) · **Session model**: `claude-opus-5-5`
**Sandbox**: `E:\Temp\claude\e--AI-Development-wxperts-wxKanban\dd77484b-3464-4f4a-ac4d-ec0431535997\scratchpad\spike143-cmdtier\`

## Verdict

**COMMAND TIER = frontmatter works** for a slash command the user types (command file and skill alike). The subagent hand-off also works but costs far more, so keep it only as the fallback for heavy or forked work.

## What the docs say (code.claude.com/docs/en/slash-commands, frontmatter reference)

> `model` — "Model to use when this skill is active. The override applies for the rest of the current turn and isn't saved to settings. The session model resumes when you send your next prompt. Accepts the same values as `/model`, or `inherit` to keep the active model."

- Command files: "a Markdown file in `.claude/commands/` ... supports the same frontmatter except `name` and `paths`."
- Values (model-config): aliases `haiku`, `sonnet`, `opus`, `best`, `fable`, `opusplan`, `sonnet[1m]`, `opus[1m]`, a full ID such as `claude-haiku-5-5`, or `inherit`. A value outside the org `availableModels` allowlist is ignored and the session keeps its model.
- With `context: fork`, `model` sets the forked subagent's model instead.

## Evidence (served model = transcript `api-request.params.model`, plus `modelUsage`)

| Test | Command turn served by | Next turn | Cost of command turn |
|---|---|---|---|
| `.claude/commands/tiercmd.md`, `model: haiku`, typed `/tiercmd` | claude-haiku-5-5 | claude-opus-5-5 | $0.0025 |
| `.claude/skills/tierskill/SKILL.md`, `model: haiku`, typed `/tierskill` | claude-haiku-5-5 | claude-opus-5-5 | $0.0022 |
| command `model: claude-haiku-5-5` (full ID) | claude-haiku-5-5 | see hazard 2 | $0.0050 |
| Two turns in ONE live process (stream-json input, like an interactive session) | claude-haiku-5-5 | claude-opus-5-5 | $0.010 |
| Skill reached by the MODEL through the Skill tool ("please run the tierauto check") | **claude-opus-5-5** (override NOT applied) | — | $0.33 |
| Subagent hand-off (`/tiersub` tells main agent: Agent tool, `model: "haiku"`) | main: opus (2 calls); subagent: claude-haiku-5-5 (meta.json `"model":"haiku"`) | claude-opus-5-5 | $0.098 (Opus $0.094 + Haiku $0.004) |

Your `~/.claude/settings.json` was not modified, and no project settings file was created.

## Hazards found

1. **Typed only.** The tier applies only when the user types the slash command. When the model calls the same skill through the Skill tool, the turn stays on the session model.
2. **`--resume` without `--model` keeps the cheap model.** In headless `claude -p --resume <id>` without `--model`, the resumed turn ran on Haiku (the last model in the transcript), while a fresh run defaults to Opus. Live and interactive sessions return to the session model correctly. Kit or bridge code that resumes headless sessions must always pass `--model`.
3. **Self-report lies.** The model's own claim about which model it is cannot be trusted. On one Haiku-served turn it said "claude-opus-5-5", and on one Opus-served turn the system reminder said "Haiku 5.5". Record the model from the transcript (`message.model` / `api-request.params.model`) or from `modelUsage`, never from the model's text.
4. **Cumulative usage.** `modelUsage` in a resumed run's result JSON adds up the whole session. Per-turn metering must take the difference between runs, or read it from the transcript.
5. **Outdated CLI on PATH.** `claude` on PATH is 2.1.98, which refuses 5.5 models (400 `claude_code_version_too_old`). Version 2.1.280 or later is needed.
6. **Git Bash path rewrite.** Under Git Bash, `/cmd` arguments get rewritten into Windows paths. Set `MSYS_NO_PATHCONV=1`.

## Recommended syntax for kit command files

```markdown
---
description: Push validated scope/spec/task data to the database
model: haiku
---
```

Use the aliases `haiku` / `sonnet` / `opus` so files survive model bumps, or `inherit` for commands with no tier. For heavy work that must run cheaply, use the fallback: `context: fork` + `agent: general-purpose` + `model: haiku` (the docs say this sets the forked subagent's model; this spike did not test it), or command text that delegates through the Agent tool with `model: "haiku"`.
