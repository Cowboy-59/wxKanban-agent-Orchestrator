---
description: Combined code + UI/UX review of a diff, PR, branch, or the current changes — findings ordered by severity (must-fix / should-fix / nit) across correctness, security, data integrity, performance, maintainability, tests (code) and accessibility, responsive layout, visual consistency, interaction, states, theming, i18n (UI/UX). Advisory; never edits, redesigns, or merges.
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
> Run the track(s) that match the change: code/backend files → the code-review track; frontend
> (`.tsx`/`.jsx`/`.css`/Tailwind/shadcn) files → the UI/UX track; both → both, merged into one
> severity-ordered list. The review is **advisory**: report findings, never edit, redesign, merge, or
> deploy unless separately asked. If no target is given, review the current working-tree / staged changes.
> For the UI/UX track, default to a static review of the source; do a live browser walkthrough only when
> asked or when the app is already running.
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
> `.claude/skills/wxUIUXCodeReview/` carries the same methodology — invoke it and proceed.
