---
description: Combined code + UI/UX review of a diff, PR, branch, the current changes, or a whole codebase (--audit) — targeted at the stack declared in stack.md, not wxKanban's defaults. Findings ordered by severity (must-fix / should-fix / nit), de-duplicated into cross-cutting causes and tagged with provenance, across correctness, security, data integrity, performance, maintainability, wiring/reachability, tests and test validity, claim-vs-code (code) and accessibility, layout/sizing, visual consistency, interaction, states, first-run defaults, theming, i18n (UI/UX). Advisory; never edits, redesigns, or merges.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxUIUXCodeReview

> The full methodology for this command is delivered by wxKanban at runtime.
>
> Call the MCP tool `project.get_command_prompt` with `{ "command": "wxuiuxcodereview" }`, then follow the
> returned instructions exactly, applying the arguments provided with this command:
>
> {{args}}
>
> **Arguments** — a diff, PR number, branch/base comparison, spec number, or intent summary. Pass
> `--audit` to sweep a whole codebase or surface list instead of a change; audit mode works one surface
> at a time with a `[Yes]` / `[Save]` gate and resumes from `.review-progress.json`.
>
> Run the track(s) that match the surface: code/backend files → the code-review track; user-interface
> files → the UI/UX track; both → both, merged into one severity-ordered list. **Read `stack.md` at the
> repo root first if it exists** and review against the stack it declares — not wxKanban's own
> Express/React/Postgres/Tailwind defaults; if it is absent, proceed exactly as today without blocking.
> The review is **advisory**: report findings, never edit, redesign, merge, or deploy unless separately
> asked. If no target is given, review the current working-tree / staged changes. For the UI/UX track,
> default to a static review of the source; do a live walkthrough only when asked or when the app is
> already running.
>
> If `project.get_command_prompt` is **not available as a tool**, first check whether OTHER
> `project.*` tools (e.g. `project.create_specs`, `project.help`) ARE present — the two cases have
> different fixes:
>
> - **Other `project.*` tools present, only `get_command_prompt` missing** → the wxKanban MCP is
>   connected; the server's advertised tool list is stale/incomplete. This is a **server-side**
>   issue, not your setup — do NOT re-register or restart. Report it (or ask an admin to redeploy
>   the hosted MCP so `get_command_prompt` is re-advertised).
> - **No `project.*` tools at all** → the wxKanban MCP isn't connected to your AI client (a setup
>   issue, not billing). Register it and restart: run `/wxAI-project-init` (writes `.mcp.json`) or
>   `node scripts/init.mjs`, then restart your AI client and approve the `wxkanban` server
>   (Claude Code: `/mcp`).
> - **Explicit 401 / subscription error** from the fetch → a token/subscription problem; re-run
>   `kit-configure` or renew at https://wxperts.com/account/billing.
>
> As a local fallback when the server prompt cannot be fetched, the `wxUIUXCodeReview` skill under
> `.claude/skills/wxUIUXCodeReview/` ships with the kit and carries the same methodology — invoke it
> and proceed. If neither the server prompt nor the skill is available, say so and skip the review;
> do not improvise one from memory or report it as if the full methodology had been applied.
