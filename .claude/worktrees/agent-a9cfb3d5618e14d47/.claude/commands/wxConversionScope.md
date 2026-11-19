---
description: Generate Scope-of-Project documents from a PCSoft app already converted by /wxConversion — acting as a Systems & Business Analyst, one scope per page/report plus overall Program, Database, and Backend/API scopes, BuildScope-style and RESUMABLE (after each scope, [Yes] to continue or [Save] to stop and restart later), with a gap-analysis pass.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxConversionScope — Scope generation (Systems & Business Analyst)

## Purpose

Turn the artifacts produced by `/wxConversion` (a PCSoft WinDev/WebDev app converted from its
technical-doc PDF) into **Scope-of-Project documents**, acting as a Senior Systems & Business Analyst
and running the **BuildScope** gated method. Produces one scope per page/window and per report, plus
overall **Program**, **Database**, and **Backend/API** scopes (legacy server procedures → proposed
endpoints).

This command **loads and runs the `wxConversionScope` skill**
(`.claude/skills/wxConversionScope/SKILL.md`). It runs after /wxConversion on the converted artifacts.

## Usage

```bash
/wxConversionScope            # resume or start scope generation over the converted artifacts
/wxConversionScope --restart  # discard saved progress and rebuild the scope queue
```

## Behavior

1. **Preflight:** confirm `pre-convert/` and `rebuild/` exist (run `/wxConversion` first if
   not) and that the skill is installed.
2. **Resumability:** read `specs/Project-Scope/.scope-progress.json`. If incomplete, summarize where
   work stopped and offer to **resume** or **restart**. Otherwise build the scope queue and confirm
   it with the developer.
3. **Caption resolution:** ask for the project's string/translation export to resolve `GB` captions;
   if unavailable, confirm inferred labels during each page scope.
4. **Readiness gate:** *"Conversion is converted. Ready to begin Scope Generation? [Yes] / [Save]."*
5. **Per item** (Program → Database → Backend/API → each page → each report): run the BuildScope
   section-by-section method, perform the **analyst gap-pass** (surface issues/holes/missing things
   and ask the developer KEEP/FIX/DEFER/DROP), write the scope to
   `specs/Project-Scope/<NNNN>-<name>.md`, persist progress, then ask
   *"`<item>` saved. Ready for the next? [Yes] / [Save]."* `Save` stops and persists for later
   restart. Queries already documented in `rebuild/scopes/QRY-queries-scope.md` are referenced, not
   re-scoped.
6. **Surface, don't decide.** One question at a time; explicit `[A]pprove` to advance each section.

## Exit conditions

Scope documents written under `specs/Project-Scope/` for every queued item (Program, Database,
Backend/API, each page, each report), with a `.scope-progress.json` manifest reflecting completion —
or a clean Save point the developer can resume from.

## Context

{{args}}
