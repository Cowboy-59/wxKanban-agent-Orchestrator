---
description: Convert a legacy PCSoft WinDev / WLanguage application into readable Markdown — switch the project to text saves, process .wdw/.wdg/.wdc into Markdown, and capture per-window screenshots. Scoping is a separate stage (/wxConversionScope).
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxConversion — WinDev Source → Markdown

## Purpose

Run the **source-conversion stage** of a PCSoft **WinDev / WLanguage** rebuild: turn the legacy app's binary elements into readable Markdown so they can be analyzed and scoped. The skill ships with the kit and lives at `_wxAI/skills/wxConversion-analyst.md`.

**The only output is Markdown files (and screenshots).** This command performs **Part A** of the skill's workflow:

1. **Switch WinDev to text-format saves** — binary `.wdw/.wdg/.wdc` can't be read or diffed; the developer re-saves the project as text.
2. **Process the source to Markdown** — one `.md` per WinDev element under `pre-convert/`, **keeping the element extension** (`<name>.wdw.md` / `.wdg.md` / `.wdc.md`) so the scoping stage can tell windows from procedures/classes.
3. **Capture per-window screenshots** — one image per `.wdw`, named to match, under `pre-convert/screens/`.

**Scoping is a separate stage.** Once the Markdown exists, run **`/wxConversionScope <entry-file.md>`** to read the code, follow its calls into the procedures/classes it reaches, and build the Scope-of-Project document. This keeps the mechanical one-shot conversion apart from the slow, gated, judgment-heavy scoping pass.

The **optional HFSQL → target-DB mapping** is also produced during scoping (`/wxConversionScope --db`), not here.

Use this when:

- A WinDev application is being rewritten in a new stack and you need its source as readable Markdown before any scoping.
- You want the legacy windows captured as named screenshots paired with their converted source.

## Usage

```bash
/wxConversion <file-or-dir>        # switch to text saves, process .wdw/.wdg/.wdc → Markdown, capture screenshots
```

`<file-or-dir>` is the WinDev source element(s) or a directory of them. (`--source-only` is the default and only behavior now; the scoping and DB stages have moved to `/wxConversionScope`.)

## Behavior

1. **Preflight**: confirm the skill exists at `_wxAI/skills/wxConversion-analyst.md`. If missing, tell the user the skill isn't installed and stop. **Create the working directories** if they don't already exist: `pre-convert/` (for the converted `.md`) and `pre-convert/screens/` (for the per-window images).
2. **Load the skill** and follow **Step 2 / Part A only** (A1 text-save → A2 source→Markdown → A3 screenshots) literally — persona, Operating Principles, one gate at a time, explicit `[A]pprove` before advancing, never run two steps ahead of the developer.
3. **The only output is Markdown files and screenshots.** No code porting, no refactoring, no scoping, no database work.
4. **Working files** land under `pre-convert/` (one `.md` per source element with the extension kept — `<name>.wdw.md` / `.wdg.md` / `.wdc.md` — plus `pre-convert/screens/` images named with each window's stem, e.g. `WIN_Invoice.png`). **Write each `.md` to disk the moment its element is processed — one at a time, never batched** — so an interrupted run keeps every file already converted and a re-run can skip the ones that already exist.
5. **Hand off to scoping.** When Part A is complete, point the developer at `/wxConversionScope <entry-file.md>` to begin scoping from a chosen entry point.

## Operating Constraints

- **WinDev only.** Source elements are `.wdw` (windows), `.wdg` (global procedures), `.wdc` (classes/procedures). Only text-saved elements can be processed — flag any element still in binary and send the developer back to A1.
- **Markdown output only.** This command documents the legacy source; it does not port application code, scope the app, or build/load any database.
- **Surface, don't decide.** Note dead code, hardcoded values, and anything odd in the converted Markdown; the KEEP/MODERNIZE/DROP decisions happen later, during `/wxConversionScope`.
- **Known non-issue — ignore.** If conversion encounters an element like:

  ```yaml
  
       code : |1-
  ```

  treat it as expected noise — a benign empty logging stub. Do **not** flag it as a conversion error, dead code, or a defect, and do not stop the run for it. No action required.

## Exit conditions

- Markdown source produced under `pre-convert/` (one `.md` per WinDev element, extension kept — `<name>.wdw.md` / `.wdg.md` / `.wdc.md`) plus matching per-window screenshots under `pre-convert/screens/`, every window paired to an image by stem. Ready for `/wxConversionScope <window.wdw.md>` (or `--all`).

## Context

{{args}}
