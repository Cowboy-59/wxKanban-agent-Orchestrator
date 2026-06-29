---
name: vbConversionScope
description: >-
  Generate Scope-of-Project documents from the artifacts produced by vbConversion (a Visual Basic 6
  app converted from its .vbp/.frm/.bas/.cls source). Acting as a Senior Systems & Business Analyst,
  this skill produces one scope per form and per report, plus an overall Program (project-overview)
  scope, a Database scope, and a Backend/API scope (VB6 procedures + event handlers + Recordset CRUD →
  proposed endpoints) — each built BuildScope-style (gated, section-by-section, one question at a
  time). It is RESUMABLE: on a large system this can take days, so it asks before starting, and after
  every scope offers [Yes] (continue) or [Save] (persist progress and stop until restarted). Each
  scope includes a VB6-aware analyst gap-pass (On Error Resume Next silent failures, SQL injection,
  synthesized primary key, Win32/OCX non-portability). Use after /vbConversion is complete.
---

# vbConversionScope — VB6 scope generation (Systems & Business Analyst)

> **The full analyst methodology for this skill is delivered by wxKanban at runtime.**
>
> Call the MCP tool **`project.get_command_prompt`** with `{ "command": "vbconversionscope" }`, then
> follow the returned instructions exactly. They define the persona, the resumable per-scope gated
> method, and the required VB6-aware analyst gap-pass.
>
> Use this **after** `/vbConversion` has produced `pre-convert/` and `rebuild/`. Scopes are written
> under `specs/Project-Scope/` with a `.scope-progress.json` manifest so the run is resumable. They
> are **draft** scopes — finalize them through `/buildscope --edit` or `/createSpecs`; this skill does
> not push to the wxKanban database.
>
> **Sibling skills:** `wxConversionScope` (WinDev/WebDev) and `cwConversionScope` (Clarion).
> `vbConversionScope` speaks VB6 idioms — forms/controls/event handlers, Data-control binding, and the
> Jet/`.mdb` data layer — and its gap-pass checks `On Error Resume Next`, string-concatenated SQL,
> the synthesized primary key, and Win32/OCX non-portability.
>
> If `project.get_command_prompt` is **not available as a tool**, the wxKanban MCP isn't
> connected to your AI client — a setup issue, not billing. Run `/wxAI-project-init` (writes
> `.mcp.json`) or `node scripts/init.mjs`, restart your AI client, approve the `wxkanban` server
> (Claude Code: `/mcp`). Only an explicit **401 / subscription error** is a token/subscription
> problem — re-run `kit-configure` or renew at https://wxperts.com/account/billing.
