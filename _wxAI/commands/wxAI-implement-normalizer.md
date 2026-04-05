---
description: Translate short "implement …" chat commands into canonical /wxAI-implement invocations
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

## Context Note

> **Purpose**: This command is a **command normalizer only**. Its sole job is to translate short natural-language implementation chat commands into the correct `/wxAI-implement` invocation. It does NOT execute any implementation phases, run scripts, or invoke other tools.
>
> For full implementation orchestration with state management, use `/wxAI-implement` directly instead.

---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

Your job is to translate short "implement …" chat commands into canonical `/wxAI-implement` invocations, and **NEVER** invent other shell commands.

---

## Repository Conventions

- Specs live under `specs/` with numeric IDs `NNN` (3 digits).
- Each spec has a full key `NNN-xxxxx` (e.g., `003-Registration`).
- Implementation tasks are defined in `specs/NNN-xxxxx/tasks.md`.
- The normalizer extracts `<NNN>` from user input and maps to the correct spec directory.

---

## Mapping Rules

1. If the user types exactly:
   - `implement NNN`
   - `implement spec NNN`
   - `implement scope NNN`

   Then you MUST respond with a single line:
   - `/wxAI-implement NNN`

2. If the user types:
   - `implement NNN-xxxxx`
   - `implement spec NNN-xxxxx`

   Then you MUST respond with:
   - `/wxAI-implement NNN-xxxxx`

3. If the user types a variant that includes "force" or "override":
   - `implement NNN force`
   - `implement NNN --force`
   - `implement NNN override`

   Then you MUST normalize to:
   - `/wxAI-implement --force NNN`

4. If the user types a variant that includes "resume" or "continue":
   - `implement resume NNN`
   - `implement continue NNN`
   - `resume implement NNN`

   Then you MUST normalize to:
   - `/wxAI-implement --resume NNN`

5. If the user types a variant that includes "dry run" or "preview":
   - `implement NNN dry run`
   - `implement NNN --dry-run`
   - `preview implement NNN`

   Then you MUST normalize to:
   - `/wxAI-implement --dry-run NNN`

6. Treat obvious typos like "implment" or "implemnt" as "implement" when they clearly match these patterns.

---

## Behavior Rules

- Do **NOT** execute any other commands (no git, npm, pnpm, docker, etc.).
- Do **NOT** change the semantics of `/wxAI-implement`; your only job is to normalize user chat into the correct `/wxAI-implement` line.
- If the user does not provide at least `NNN` or `NNN-xxxxx`, ask them which spec id to use instead of guessing.
- If the user asks what will happen, briefly explain that `/wxAI-implement` executes the implementation plan from tasks.md (Setup → Tests → Core → Integration → Polish), but still return the exact normalized command line.
- Always put the final `/wxAI-implement` command on its own line so it is easy to copy into a terminal.

---

## Examples

| User types | Normalized output |
|------------|-------------------|
| `implement 003` | `/wxAI-implement 003` |
| `implement spec 003` | `/wxAI-implement 003` |
| `implement 003-Registration` | `/wxAI-implement 003-Registration` |
| `implement 003 force` | `/wxAI-implement --force 003` |
| `implement --force 003` | `/wxAI-implement --force 003` |
| `resume implement 003` | `/wxAI-implement --resume 003` |
| `implement 003 dry run` | `/wxAI-implement --dry-run 003` |
| `implment 003` (typo) | `/wxAI-implement 003` |
| `implemnt spec 003-Registration` (typo) | `/wxAI-implement 003-Registration` |

---

## Related Commands

- `/wxAI-implement <NNN>` — Execute implementation plan from tasks.md for spec NNN
- `/wxAI-implement --force <NNN>` — Force implementation even if checklists incomplete
- `/wxAI-implement --resume <NNN>` — Resume a halted implementation
- `/wxAI-implement --dry-run <NNN>` — Preview implementation steps without executing
- `/wxAI-tasks <NNN>` — Generate or regenerate tasks.md for spec NNN
