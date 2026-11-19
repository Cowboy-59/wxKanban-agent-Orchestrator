---
name: wxConversionScope
description: >-
  Generate Scope-of-Project documents from the artifacts produced by wxConversion (a PCSoft
  WinDev/WebDev app converted from its technical-doc PDF). Acting as a Senior Systems & Business
  Analyst, this skill produces one scope per page/window and per report, plus an overall Program
  (project-overview) scope, a Database scope, and a Backend/API scope (legacy server procedures →
  proposed endpoints) — each built BuildScope-style (gated, section-by-section, one question at a
  time). It is RESUMABLE: on a large system this can take days, so it asks before starting, and
  after every scope offers [Yes] (continue) or [Save] (persist progress and stop until restarted).
  Each scope includes an analyst gap-pass that surfaces issues/holes/missing behavior and asks the
  developer what they want. This skill should be used after conversion is complete and the developer
  is ready to turn the converted Markdown into scopes.
---

# wxConversionScope — Scope generation (Systems & Business Analyst)

> **The full analyst methodology for this skill is delivered by wxKanban at runtime.**
>
> Call the MCP tool **`project.get_command_prompt`** with `{ "command": "wxconversionscope" }`, then
> follow the returned instructions exactly. They define the persona, the resumable per-scope gated
> method, and the required analyst gap-pass.
>
> Use this **after** `/wxConversion` has produced `pre-convert/` and `rebuild/`. Scopes are written
> under `specs/Project-Scope/` with a `.scope-progress.json` manifest so the run is resumable.
>
> If `project.get_command_prompt` is **not available as a tool**, the wxKanban MCP isn't
> connected to your AI client — a setup issue, not billing. Register it and restart: run
> `/wxAI-project-init` (writes `.mcp.json`) or `node scripts/init.mjs`, then restart your AI
> client and approve the `wxkanban` server (Claude Code: `/mcp`). Only an explicit **401 /
> subscription error** from the fetch is a token/subscription problem — re-run `kit-configure`
> or renew at https://wxperts.com/account/billing.
