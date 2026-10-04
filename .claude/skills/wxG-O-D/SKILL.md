---
name: wxG-O-D
description: G.O.D. (Guru of Development) — read the directories a user names (--dir=<dir>,<dir>...), or with none named the whole project tree minus gitignored and wxKanban kit files, plus ProjectOverview.md, stack.md, and any WinDev/WebDev, VB6, or Clarion conversion output and conversion scopes as evidence, pull every business rule out of existing code (read in full, never sampled) and propose best-practice rules beside them, go over the findings with the user section by section at their level (--level=amateur|junior|senior: amateur explains every idea in plain terms and teaches the practice behind it), as plain text with no menus (changes, or a brainstorm that writes nothing until the user approves its summary for the plan or for the scope and specs), interview the user on what is still open, then write a customer-facing final development plan into docs/ (AI-agent time to completion for the quickest team size and for the most agents the machine can run, a database recommendation across internal office, cloud, and distributed hosting, an ERD with referential-integrity suggestions, a roadmap, risks, and decisions), plus the working documents behind it: a full management plan, a build roadmap, and process and design flow diagrams, all rendered to PDF. Use when asked to plan a customer project, assess a codebase or document set before building or converting it, estimate AI delivery time, recommend a database or hosting model, or run G.O.D. / wxG-O-D. Given a ProjectOverview.md for a NEW project, it reviews the overview, offers to brainstorm the idea first (--brainstorm declares it up front; "brainstorm more or continue" after each topic), opening with whether the app is commercial and whether it is web-based or installed — a web-based app gets a projected SaaS cost document (docs/GOD-SaaS-Cost.md: the five lowest-cost providers or mixes, plus AWS, researched at run time), expands it into the full design and documents, pauses for review and a brainstorming discussion, and then, only on the user's approval, drives /buildscope, /validateScope, /createSpecs, and /implement (which runs /wxCreateTestPlan) under each command's own rules, with resumable checkpoints (--resume). With --create it pauses once for the design review, then executes the development plan phase by phase to a built app and on through review, tests, QA, user acceptance, help, beta, and release (the project owner advances each stage in the web app), implementing independent scopes in parallel up to the machine's limit (--cap=<n>; --cap=1 is serial), and can continue unattended under the Remote Session Bridge with each question relayed to the developer's phone. --roadmap writes only the build roadmap (the /dev-plan alias). It never writes scopes, specs, or code itself, and never pushes.
---

# wxG-O-D — Guru of Development

> **The full methodology for this skill is delivered by wxKanban at runtime.**
>
> To run G.O.D., call the MCP tool **`project.get_command_prompt`** with
> `{ "command": "wxgod" }`, then follow the returned instructions exactly, applying the arguments
> the user gave (`--dir`, `--customer`, `--overview` / a `ProjectOverview.md` path, `--brainstorm`,
> `--level`, `--resume`, `--create`, `--cap`, `--roadmap`).
>
> The methodology names **reference documents** (`references/<name>.md`). They are served the same
> way, not kept on disk: fetch each one when the step that needs it is reached, with
> `project.get_command_prompt` and `{ "command": "wxgod/references/<name>" }`
> (`god-persona`, `new-project`, `review-and-brainstorm`, `document-templates`, `interview`,
> `database-options`, `data-integrity`, `flow-diagrams`, `business-rules`).
>
> The deterministic **scripts** are bundled locally in this skill's **`scripts/`** directory and are
> run as the methodology shows, from the project root:
>
> - `scripts/inventory.mjs` — decides which files are evidence; honors `.gitignore`, skips kit files.
> - `scripts/machine-capacity.mjs` — how many AI agents this machine can run at once.
> - `scripts/estimate-ai-time.mjs` — the deterministic schedule for every team size.
> - `scripts/build-devplan-pdf.mjs` — renders each G.O.D. document, Mermaid included, to PDF.
>
> **Boundaries that hold before the prompt is fetched:** G.O.D. reads evidence and writes only to
> `docs/` (plus the user's own `~/.wxai/god-learnings.md`). It never opens `.env` files, keys, or
> certificates, never puts a secret value in a document or in chat, never writes a scope, spec,
> task, or code itself, and never pushes. In new-project mode and under `--create` it only runs the
> real commands (`/buildscope`, `/validateScope`, `/createSpecs`, `/implement`) under their own
> rules and gates, after the user approves the plan. If a script fails or the methodology
> contradicts itself, it stops at that step and asks you to report it through the Cockpit feedback.
>
> If `project.get_command_prompt` is **not available as a tool**, the wxKanban MCP isn't
> connected to your AI client — a setup issue, not billing. Register it and restart: run
> `/wxAI-project-init` (writes `.mcp.json`) or `node scripts/init.mjs`, then restart your AI
> client and approve the `wxkanban` server (Claude Code: `/mcp`). Only an explicit **401 /
> subscription error** from the fetch is a token/subscription problem — re-run `kit-configure`
> or renew at https://wxperts.com/account/billing.
