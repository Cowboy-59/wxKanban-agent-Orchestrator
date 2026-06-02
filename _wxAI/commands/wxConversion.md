---
description: Reverse-engineer a PCSoft WinDev / WLanguage application into a Scope-of-Project document and drive the HFSQL → target-DB conversion.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxConversion — WinDev Conversion Analyst

## Purpose

Invoke the **wxConversion** skill (WinDev Conversion Analyst) on a legacy PCSoft **WinDev / WLanguage** application. The skill ships with the kit and lives at `_wxAI/skills/wxConversion-analyst.md`.

It does two things, in the senior-analyst persona:

1. **Scope** the legacy app — read its windows, global procedures, and classes and translate their *behavior* (not their implementation) into a business-language Scope-of-Project document.
2. **Convert** the database and source (the one active, hands-on part) — guide the developer through the eight-step Step 2 procedure: switch WinDev to text-format saves, process `.wdw/.wdg/.wdc` to Markdown, capture per-window screenshots, then extract the HFSQL schema + data, pick a target DB, convert the SQL to that dialect, build the schema, and load the data.

Use this when:

- A WinDev application is being rewritten in a new stack and you need a spec built from the existing code.
- You need to migrate an HFSQL database to PostgreSQL (or another target) as part of that rewrite.
- You want the legacy windows captured as readable Markdown + named screenshots before scoping.

## Usage

```bash
/wxConversion <file-or-dir>        # full flow: source conversion + DB migrate + scope drafting
/wxConversion --source-only        # Part A only — text-save, .wdw/.wdg/.wdc → Markdown, screenshots
/wxConversion --db-only            # Part B only — HFSQL extract → convert SQL → create schema → load data
/wxConversion --target <db>        # preset the target DB for Part B (postgres | sqlserver | mysql | sqlite)
```

`<file-or-dir>` is the WinDev source element(s) or a directory of them. Part B's HFSQL exports do not require Part A, so the two parts can run independently.

## Arguments

- `--source-only` — Run **Part A** of Step 2 only (A1 text-save → A2 Markdown → A3 screenshots), then continue with the read-only scoping steps. Skips the database migration.
- `--db-only` — Run **Part B** of Step 2 only (B1–B5: HFSQL schema + data → target DB). Skips source-to-Markdown and scope drafting.
- `--target <db>` — Preset the Part B target database (default recommendation: `postgres`, the wxKanban stack). The wxKanban naming/key conventions apply **only** when the target is `postgres`; any other target follows that DB's own idioms and preserves legacy names by default.

## Behavior

1. **Preflight**: confirm the skill exists at `_wxAI/skills/wxConversion-analyst.md`. If missing, tell the user the skill isn't installed and stop.
2. **Load the skill** and follow it literally — persona, Operating Principles, and the Analysis Workflow (Steps 0–6). Honor the BuildScope question discipline: one gate at a time, explicit `[A]pprove` before advancing, never run two steps ahead of the developer.
3. **Step 2 is the only hands-on part.** Everything else stays in the read-only analyst lane (no code porting, no refactoring).
4. **Working files** land under `pre-convert/` (Markdown source, `pre-convert/screens/` images, `pre-convert/schema.<dialect>.sql`). Scope artifacts land under `specs/Project-Scope/<NNN>-<short-name>/`.

## Operating Constraints

- **WinDev only.** Source elements are `.wdw` (windows), `.wdg` (global procedures), `.wdc` (classes/procedures); database source is HFSQL. Only text-saved elements can be processed.
- **Read-only everywhere except Step 2.** The DB & source conversion in Step 2 is the single active exception; do not port application code.
- **wxKanban DB rules are Postgres-only.** Never impose plural/lowercase/no-underscore naming or UUID-v7 PKs on a non-Postgres target.
- **Surface, don't decide.** Flag dead code, hardcoded values, and KEEP/MODERNIZE/DROP calls; let the developer choose.

## Exit conditions

- `--source-only` → Markdown + screenshots produced, then scope drafting; HFSQL migration skipped.
- `--db-only` → schema created and data loaded into the target DB; per-table rows-loaded report; no scope doc.
- Full flow → scope doc(s) under `specs/Project-Scope/` plus the converted database, with `schema-mapping.md` recording the HFSQL → target mapping.

## Context

{{args}}
