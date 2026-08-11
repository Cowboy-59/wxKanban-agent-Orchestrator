---
description: Audit a BUILT conversion against the original legacy app — what did the rebuild lose? Classifies every difference as Regression / Deliberate (per the recorded KEEP-MODERNIZE-DROP decisions) / Improvement, across three levels: whole functions missing, behaviors and rules changed, and dropped default values. RESUMABLE (after each element, [Yes] to continue or [Save] to stop and restart later). Advisory; never edits code.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxConversionParity — post-rebuild parity audit

## Purpose

`/wxUIUXCodeReview` asks *"is this code correct?"*. This command asks the different question:
**"what did the rebuild lose relative to the original?"**

It runs **after** a conversion has been scoped *and built*, comparing the converted original
(`pre-convert/`) against what was actually built, and classifying every difference as:

- **Regression** — the original did it, the rebuild does not, and no recorded decision authorizes the loss
- **Deliberate** — matches a recorded KEEP / MODERNIZE / DROP decision in the scope docs; not a defect
- **Improvement** — the rebuild is better; recorded explicitly so it is not "fixed" back

Three detection levels, hardest and most impactful last: whole functions missing → behaviors and rules
changed → **dropped default values**. The third is mandatory and gets its own table: nothing is missing
and no test fails, but the program no longer opens ready to work.

This is **not** the `wxConversionScope` gap-pass. That runs *forward* while scopes are written, so the
developer can choose KEEP / MODERNIZE / DROP. This runs *backward*, after the build, and **reads those
decisions as evidence**.

## Usage

```bash
/wxConversionParity            # resume or start the parity audit over the built conversion
/wxConversionParity --restart  # discard saved progress and rebuild the element queue
```

Works for any conversion family: `/wxConversion` (WinDev/WebDev), `/vbConversion` (VB6),
`/cwConversion` (Clarion).

## Behavior

> The full methodology for this command is delivered by wxKanban at runtime.
>
> Call the MCP tool `project.get_command_prompt` with `{ "command": "wxconversionparity" }`, then follow
> the returned instructions exactly, applying the arguments provided with this command:
>
> {{args}}
>
> Requires `pre-convert/` plus built source to compare. If `pre-convert/` is missing, stop and tell the
> developer to run the relevant conversion command first; if it exists but nothing has been built yet,
> say so — `/wxConversionScope` is the right next step instead.
>
> **Read `stack.md` at the repo root first if it exists** so the built side's constructs are named
> correctly; if it is absent, proceed exactly as today without blocking.
>
> Before comparing anything, run the **foundations check** and report it: does the original's element
> inventory match what was actually documented, are there unclosed `REVIEW`/`recover by hand`
> admissions in the generated artifacts, which values were inferred from observed data rather than the
> declared model, and which assumptions (duration units, time zone, decimal precision) were never
> declared. A parity audit against incomplete source material produces confident nonsense.
>
> Work **one element at a time** and offer `[Yes]` to continue / `[Save]` to stop after each, persisting
> to `specs/Project-Scope/.parity-progress.json`. Never present a partial audit as complete. Cite
> **both sides** of every difference — the original artifact line and the built construct. Where no
> recorded decision covers a difference, report it as a candidate and **ask**; never resolve it
> silently. The audit is **advisory**: report findings, never edit code, restore behavior, or merge
> unless separately asked.
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
>   `kit-configure` or renew at <https://wxperts.com/account/billing>.
