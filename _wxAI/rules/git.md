## CRITICAL: Never Initiate Git/wxAIGit Operations Without Explicit Request

**ABSOLUTE RULE**: NEVER proactively invoke wxAIGit (or any git operation) without the user explicitly asking for it in the current message.

This applies to:

- The `wxAIGit` skill (branch + merge only — see the section below)
- Direct git commands: `git commit`, `git push`, `git merge`, and every other write

**Forbidden Behaviors**:

- Invoking wxAIGit after completing work unless asked
- Suggesting "let me commit/checkpoint this"
- Auto-committing after finishing a task
- Any wxAIGit invocation triggered by your own judgment about "good stopping points"

**Why This Rule Exists**: The user controls the git timeline. Even after multiple user-initiated commits/checkpoints in a session, you do NOT have blanket permission to continue. Each wxAIGit invocation requires fresh explicit instruction.

**What Counts as Explicit Request**:

- User says "commit", "checkpoint", "push", etc.
- User asks you to save/preserve work via git/wxAIGit
- User explicitly delegates git timing to you (rare)

**What Does NOT Count**:

- Completing a task (does not imply commit)
- User saying "done" or "looks good" (does not imply commit)
- Previous commits/checkpoints in the session (does not grant ongoing permission)
- Your assessment that work should be saved

---

## CRITICAL: Git Reset/Checkout/Revert Forbidden

**ABSOLUTE RULE**: You are FORBIDDEN from running ANY of these commands without EXPLICIT user instruction:

- `git checkout <file>` - Reverts file changes
- `git reset` - Resets commits or staging
- `git revert` - Reverts commits
- `git restore` - Restores working tree files
- `git clean` - Removes untracked files

**Why This Rule Exists**: These commands DESTROY WORK. You have repeatedly used `git checkout` to "fix" mistakes, which instead deleted hours of completed work.

**What To Do Instead**:

- If you make a mistake in a file: Use Read/Edit/Write tools to fix it
- If you're unsure about changes: Ask the user what they want
- If the user says "stop": STOP. Do not touch anything
- NEVER assume reverting code is the solution

**ONLY Exception**: User explicitly says "revert the file" or "checkout the file" or "reset the changes"

**Enforcement**: a PreToolUse git guard MAY be installed — check `.claude/settings.json` for this project before relying on it, and only mention `SKIP_GIT_GUARD=1` if a guard is actually there to skip. Where no hook exists, this rule holds because you follow it.

**Violation Consequences**: Using these commands without explicit instruction is a CRITICAL ERROR equivalent to data loss.

## Proactive Use of Subagents and Skills

**Use subagents and skills proactively** to improve efficiency, preserve context, and leverage specialized capabilities:

### When to Use Subagents:

- **Codebase exploration**: Use `Explore` agent for understanding structure, finding patterns, or answering architectural questions
- **Isolated investigations**: Launch agents for self-contained tasks to preserve main conversation context
- **Parallel work**: Use `dispatching-parallel-agents` skill when multiple independent tasks can run concurrently
- **Planning**: Use `Plan` agent for breaking down complex features
- **Code review**: Use `requesting-code-review` skill after completing major work

### When to Use Skills:

- **Debugging workflows**: Use `systematic-debugging` or `root-cause-tracing` for structured investigation
- **Development workflows**: Use `subagent-driven-development` for spec-kit task execution
- **Documentation**: Use `feature-documentation-cleanup` after completing features
- **Git operations**: only on explicit request; `wxAIGit` covers branch + merge, commits and pushes are plain `git` (see the section below)

**Principle**: Skills and agents handle their own orchestration. Trust them to dispatch subagents when beneficial. Use them proactively to save context, enable parallelism, and leverage specialized workflows.

## ABSOLUTE RULE: Git Only on Explicit Request — and wxAIGit is branch + merge ONLY

**What `wxAIGit` actually is.** SPEC-058 Amendment B (FR-009) reduced it to a scope-branch lifecycle
helper with exactly two subcommands:

- `wxAIGit branch --create <name>` — create (if absent) and switch to a branch
- `wxAIGit merge --source-branch <branch>` — merge a `scope/*` branch into integration, locally

Both launchers reject anything else with *"unsupported subcommand (only 'branch' and 'merge')"*, and
`scripts/wxaigit/` contains only `gitbranch.sh` and `gitmerge.sh`. **There is no `wxAIGit commit`,
no `checkpoint`, no `push`.** It does not write changelog entries, bump versions, or push for you —
nothing does those automatically.

**So commits and pushes are plain `git`, and that is the intended path, not a bypass.** An earlier
version of this file mandated `wxAIGit` for commit / add / push and credited it with all of the
above; following it stalled real sessions on a command that does not exist (field report
`e699f326`). Use `git commit` / `git push` directly when — and only when — the user asks.

**The permission rule is unchanged, and it is the part that matters:**

- **NEVER initiate any git operation without the user asking in the current message.** Not after
  finishing a task, not at a "good stopping point", not because previous commits happened this
  session. Each one needs fresh, explicit instruction.
- **NEVER suggest "let me commit this"** as a way of obtaining that instruction.
- **A push deploys to production.** Never push unless the user says to push, in this message.
- Write the commit message as several plain `-m` flags rather than an inline here-string, which
  leaks a stray `@` into the subject.

**What counts as an explicit request**: the user says commit / push / merge / create a branch, or
asks you to save or preserve the work in git. **What does not**: completing a task, "done", "looks
good", or your own judgement that the work is worth saving.

**Enforcement, stated honestly.** Whether a PreToolUse git guard is installed is per-project — check
`.claude/settings.json` before relying on one, and do not tell a user to set `SKIP_GIT_GUARD=1`
unless a guard is actually present to skip. Absent a hook, this rule is enforced by you following
it.
