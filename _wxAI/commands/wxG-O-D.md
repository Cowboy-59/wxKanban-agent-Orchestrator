---
description: wxG-O-D — Guru of Development: reads your project tree or named folders (plus ProjectOverview.md, stack.md, and any WinDev/VB6/Clarion conversion output), goes over the findings with you section by section at your level (--level=amateur|junior|senior, plain text, no menus), interviews you on what is still open, and writes a customer-facing development plan into docs/ with AI time to completion for the quickest team and for the most agents your machine can run, a database pick (office/cloud/distributed), an ERD with referential-integrity suggestions, the management plan, dev-plan and flow diagrams, all as PDF. Pass a ProjectOverview.md for a new project and, after your review and a brainstorm, it drives buildscope, validateScope, createSpecs and implement under their own rules, resumable with --resume.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxG-O-D — Guru of Development

> The full methodology for this command is delivered by wxKanban at runtime.
>
> Call the MCP tool `project.get_command_prompt` with `{ "command": "wxgod" }`, then follow the
> returned instructions exactly, applying the arguments provided with this command:
>
> {{args}}
>
> The methodology names reference documents (`references/<name>.md`). They are served the same way:
> fetch each one when the step that needs it is reached, with `project.get_command_prompt` and
> `{ "command": "wxgod/references/<name>" }`. The scripts it runs (`inventory.mjs`,
> `machine-capacity.mjs`, `estimate-ai-time.mjs`) are on disk in `.claude/skills/wxG-O-D/scripts/`,
> and the `dev-plan` skill it uses is in `.claude/skills/dev-plan/`.
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

## Usage

```bash
/wxG-O-D                                                   # whole project tree
/wxG-O-D --customer="Acme Freight"
/wxG-O-D --dir=legacy/src,legacy/docs,db/scripts           # only these folders
/wxG-O-D --dir="customer files/specs","customer files/screens"
/wxG-O-D --level=amateur                                   # explain every idea in plain terms
/wxG-O-D ProjectOverview.md                                # review it; new project → design, then build
/wxG-O-D --overview=docs/ProjectOverview.md --customer="Acme Freight"
/wxG-O-D ProjectOverview.md --brainstorm                   # brainstorm the idea before any design
/wxG-O-D --resume                                          # continue a paused run
```

- `--dir=<dir>,<dir>...` — Only these folders: comma-separated or repeated, relative to the project root or absolute. Default: the whole project tree, minus gitignored and kit files.
- `--customer="<name>"` — Customer name for titles. Default: from ProjectOverview.md, else package.json, else the folder name.
- `<file>` or `--overview=<file>` — A ProjectOverview.md to start from. Opens the new-project question.
- `--brainstorm` — With an overview: brainstorm the idea right after the review, before any design. Without it, you are asked.
- `--level=amateur|junior|senior` — How much G.O.D. explains during the review and brainstorm. Without it, you are asked at the start of the review.
- `--resume` — Continue a run from `docs/GOD-State.json`: a new-project run, or a paused plan-mode review.

Everything it writes lands in `docs/`. The Markdown is the editable source; re-render a PDF with
`node .claude/skills/dev-plan/scripts/build-devplan-pdf.mjs docs/<file>.md docs/<file>.pdf`.
