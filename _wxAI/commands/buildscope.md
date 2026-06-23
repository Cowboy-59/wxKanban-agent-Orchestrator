---
description: Interactive agent for building Scope of Project markdown files with proper structure and wxKanban integration. Accepts either a typed feature description or an existing Markdown file (--from-md) to convert into a scope.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# buildscope — Build Scope of Project

> The full methodology for this command is delivered by wxKanban at runtime.
>
> Call the MCP tool `project.get_command_prompt` with `{ "command": "buildscope" }`, then follow the
> returned instructions exactly, applying the arguments provided with this command:
>
> {{args}}
>
> This requires an active wxKanban subscription. If the fetch returns a subscription error,
> renew at https://wxperts.com/account/billing and retry.
