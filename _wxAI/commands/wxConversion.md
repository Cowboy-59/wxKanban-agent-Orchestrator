---
description: Reverse-engineer a PCSoft WinDev / WLanguage application into Markdown — readable source, scope docs, and (optionally) an HFSQL → target-DB mapping document.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxConversion — WinDev Conversion Analyst

## Purpose

Invoke the **wxConversion** skill (WinDev Conversion Analyst) on a legacy PCSoft **WinDev / WLanguage** application. The skill ships with the kit and lives at `_wxAI/skills/wxConversion-analyst.md`.

**The only output is Markdown files.** In the senior-analyst persona it:

1. **Converts the source to Markdown** — switch WinDev to text-format saves, process `.wdw/.wdg/.wdc` into readable Markdown, capture per-window screenshots.
2. **Scopes** the legacy app — translate its *behavior* (not its implementation) into a business-language Scope-of-Project document.
3. **Optionally documents the database conversion** — the skill **asks first**; if you say yes, it writes a Markdown HFSQL → target-DB mapping (`pre-convert/schema-mapping.md`) with the proposed DDL and migration notes. It **never** builds a database, runs DDL, exports, or loads data — that is implementation work for later. If you say no, it skips the database entirely.

Use this when:

- A WinDev application is being rewritten in a new stack and you need a spec built from the existing code.
- You want the legacy windows captured as readable Markdown + named screenshots before scoping.
- You want a documented plan for migrating an HFSQL database to PostgreSQL (or another target) — as Markdown, not an executed migration.

## Usage

```bash
/wxConversion <file-or-dir>        # source → Markdown + scope drafting; asks before documenting the DB
/wxConversion --source-only        # Part A only — text-save, .wdw/.wdg/.wdc → Markdown, screenshots
/wxConversion --target <db>        # preset the target DB for the optional mapping doc (postgres | sqlserver | mysql | sqlite)
```

`<file-or-dir>` is the WinDev source element(s) or a directory of them.

## Arguments

- `--source-only` — Run **Part A** of Step 2 only (A1 text-save → A2 Markdown → A3 screenshots), then continue with the scoping steps. Skips the optional database documentation without asking.
- `--target <db>` — Preset the target database used in the optional DB mapping document (default recommendation: `postgres`, the wxKanban stack). The wxKanban naming/key conventions apply **only** when the target is `postgres`; any other target follows that DB's own idioms and preserves legacy names by default.

## Behavior

1. **Preflight**: confirm the skill exists at `_wxAI/skills/wxConversion-analyst.md`. If missing, tell the user the skill isn't installed and stop.
2. **Load the skill** and follow it literally — persona, Operating Principles, and the Analysis Workflow (Steps 0–6). Honor the BuildScope question discipline: one gate at a time, explicit `[A]pprove` before advancing, never run two steps ahead of the developer.
3. **The only output is Markdown files.** No code porting, no refactoring, and no live database work.
4. **The database conversion is optional and documentation-only.** At Step 2 Part B the skill asks "do you also want me to document the database conversion?" — on **no**, it skips the DB entirely; on **yes**, it writes only `pre-convert/schema-mapping.md`. It never creates a connection, runs DDL, exports, or loads data.
5. **Working files** land under `pre-convert/` (Markdown source, `pre-convert/screens/` images, and — only if opted in — `pre-convert/schema-mapping.md`). Scope artifacts land under `specs/Project-Scope/<NNN>-<short-name>/`.

## Operating Constraints

- **WinDev only.** Source elements are `.wdw` (windows), `.wdg` (global procedures), `.wdc` (classes/procedures); database source is HFSQL. Only text-saved elements can be processed.
- **Markdown output only.** The skill documents the legacy system; it does not port application code or build/load any database.
- **wxKanban DB rules are Postgres-only.** In the mapping doc, never impose plural/lowercase/no-underscore naming or UUID-v7 PKs on a non-Postgres target.
- **Surface, don't decide.** Flag dead code, hardcoded values, and KEEP/MODERNIZE/DROP calls; let the developer choose.

## Exit conditions

- `--source-only` → Markdown + screenshots produced, then scope drafting; database documentation skipped.
- Default flow, DB declined → Markdown source + screenshots + scope doc(s) under `specs/Project-Scope/`; no database artifacts.
- Default flow, DB accepted → as above, plus `pre-convert/schema-mapping.md` (and `schema-mapping.md` folded into the scope) documenting the HFSQL → target mapping with proposed DDL and migration notes. No database is built or loaded.

## Context

{{args}}
