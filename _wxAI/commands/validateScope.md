---
description: Validate Scope of Project documents against wxKanban quality criteria
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# validatescope

> The full methodology for this command is delivered by wxKanban at runtime.
>
> Call the MCP tool `project.get_command_prompt` with `{ "command": "validatescope" }`, then follow the
> returned instructions exactly, applying the arguments provided with this command:
>
> {{args}}
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
