---
description: Translate short "pipeline …" chat commands into canonical /wxAI-pipeline invocations
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

## Context Note

> **Purpose**: This command is a **command normalizer only**. Its sole job is to translate short natural-language pipeline chat commands into the correct `/wxAI-pipeline` invocation. It does NOT execute any pipeline phases, run scripts, or invoke other tools.
>
> For full pipeline orchestration with modes (run, resume, parallel, status, retry), use `/wxAI-pipeline-agent` instead.

---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

Your job is to translate short "pipeline …" chat commands into canonical `/wxAI-pipeline` invocations, and **NEVER** invent other shell commands.

---

## Repository Conventions

- Specs live under `specs/project-scope` or `specs/scopes`.
- Each spec has a numeric id `NNN` (3 digits), and a full key `NNN-xxxxx`.
  - Example: `001-scope-landing-page`
    - `NNN` = `001`
    - `NNN-xxxxx` = `001-scope-landing-page`

---

## Mapping Rules

1. If the user types exactly:
   - `pipeline NNN`

   Then you MUST respond with a single line:
   - `/wxAI-pipeline NNN`

2. If the user types:
   - `pipeline NNN-xxxxx`

   Then you MUST respond with:
   - `/wxAI-pipeline NNN-xxxxx`

3. If the user types a variant that includes "exclude lifecycle" or "skip lifecycle" and a spec id:
   - `pipeline exclude lifecycle NNN`
   - `pipeline skip lifecycle NNN`
   - `pipline exclude lifecycle NNN` (typo)

   Then you MUST normalize to:
   - `/wxAI-pipeline --skip-lifecycle NNN`

4. Treat obvious typos like "pipline" as "pipeline" when they clearly match these patterns.

---

## Behavior Rules

- Do **NOT** execute any other commands (no git, npm, pnpm, docker, etc.).
- Do **NOT** change the semantics of `/wxAI-pipeline`; your only job is to normalize user chat into the correct `/wxAI-pipeline` line.
- If the user does not provide at least `NNN` or `NNN-xxxxx`, ask them which spec id to use instead of guessing.
- If the user asks what will happen, briefly explain that `/wxAI-pipeline` runs the full wxAI pipeline (Specify → Clarify → Plan → Tasks → Lifecycle) according to the project docs, but still return the exact normalized command line.
- Always put the final `/wxAI-pipeline` command on its own line so it is easy to copy into a terminal.

---

## Examples

| User types | Normalized output |
|------------|-------------------|
| `pipeline 042` | `/wxAI-pipeline 042` |
| `pipeline 042-auth-oauth` | `/wxAI-pipeline 042-auth-oauth` |
| `pipeline skip lifecycle 042` | `/wxAI-pipeline --skip-lifecycle 042` |
| `pipeline exclude lifecycle 042` | `/wxAI-pipeline --skip-lifecycle 042` |
| `pipline 042` (typo) | `/wxAI-pipeline 042` |

---

## Related Commands

- `/wxAI-pipeline <description>` — Run the full pipeline for a new feature description
- `/wxAI-pipeline-agent run <description>` — Full orchestrator with state management, retry, and parallel support
- `/wxAI-pipeline-agent resume <NNN>` — Resume a halted pipeline
- `/wxAI-pipeline-agent status` — Check pipeline status across all specs
