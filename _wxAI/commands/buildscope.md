---
description: Interactive agent for building Scope of Project markdown files with proper structure and wxKanban integration. Accepts either a typed feature description or an existing Markdown file (--from-md) to convert into a scope.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
model: opus
---

# buildscope — Build Scope of Project

## Arguments
- `"<feature description>"` (optional): What the scope covers
- `--from-md <path>` (optional): Convert an existing Markdown file into a scope
- `--edit NNN` (optional): Edit an existing scope instead of creating one
- `--amendment <letter>` (optional): The amendment letter an edit is logged under — the one after
  the scope's last lettered entry (`A` when none; after `Z` comes `Z0001`, then `Z0002`, and on)
- `--source-record <value>` (optional): The record this scope's decisions come from — `none`, or a
  repo-relative `.md` path with optional rows, e.g. `docs/brainstorms/2026-11-20-agent-common-room.md#21`.
  A create writes it as the `**Source Record**:` header line; an edit logs it in that edit's
  Amendment Log entry and needs `--amendment`. A brainstorm pointer names the record, never its
  `*.scope-draft.md` sidecar. If the written scope does not carry it, the run stops with
  "server too old: sourceRecord was not applied" (SCOPE-135 Amendment C)
- `--quick` / `--template-only` (optional): Skip the interview / write the bare template

> The full methodology for this command is delivered by wxKanban at runtime.
>
> Call the MCP tool `project.get_command_prompt` with `{ "command": "buildscope" }`, then follow the
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
