---
description: Generate Scope-of-Project documents from a Clarion app already converted by /cwConversion — acting as a Systems & Business Analyst, one scope per window/report plus overall Program, Database, and Backend/API scopes, BuildScope-style and RESUMABLE (after each scope, [Yes] to continue or [Save] to stop and restart later), with a Clarion-aware gap-analysis pass.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# cwConversionScope — Clarion scope generation (Systems & Business Analyst)

## Purpose

Turn the artifacts produced by `/cwConversion` (a SoftVelocity / PCSoft Clarion app converted from its
TXA/TXD/.clw source) into **Scope-of-Project documents**, acting as a Senior Systems & Business Analyst
and running the **BuildScope** gated method. Produces one scope per window (page) and per report, plus
overall **Program**, **Database**, and **Backend/API** scopes (Clarion procedures + embeds +
dictionary referential-integrity → proposed endpoints).

This command **loads and runs the `cwConversionScope` skill**. It runs after /cwConversion on the
converted artifacts, and is the Clarion counterpart to `/wxConversionScope`.

## Usage

```bash
/cwConversionScope            # resume or start scope generation over the converted artifacts
/cwConversionScope --restart  # discard saved progress and rebuild the scope queue
```

## Behavior

1. **Preflight:** confirm `pre-convert/` and `rebuild/` exist (run `/cwConversion` first if not) and
   that the skill is installed.
2. **Load the skill** (`project.get_command_prompt { command: "cwconversionscope" }`).
3. **Resumability:** read `specs/Project-Scope/.scope-progress.json`. If incomplete, summarize where
   work stopped and offer to **resume** or **restart**. Otherwise build the scope queue and confirm
   it with the developer.
4. **Label & picture resolution:** confirm humanized-label TODOs and carry picture tokens (`@s30`,
   `@n9.2`, `@d6`) into field acceptance criteria; ask for any ABC Translator language file.
5. **Readiness gate:** *"Conversion is in place. Ready to begin Scope Generation? [Yes] / [Save]."*
6. **Per item** (Program → Database → Backend/API → each window → each report): run the BuildScope
   section-by-section method, perform the **analyst gap-pass** (surface issues/holes/missing things —
   incl. picture-token validation, `AddRelation` RI actions, `_discarded.md`, threaded file access —
   and ask the developer KEEP/FIX/DEFER/DROP), write the scope to
   `specs/Project-Scope/<NNNN>-<name>.md`, persist progress, then ask
   *"`<item>` saved. Ready for the next? [Yes] / [Save]."* `Save` stops and persists for later restart.
   VIEWs already documented in `rebuild/scopes/VIEW-queries-scope.md` are referenced, not re-scoped.
7. **Surface, don't decide.** One question at a time; explicit `[A]pprove` to advance each section.

## Exit conditions

Draft scope documents written under `specs/Project-Scope/` for every queued item, with a
`.scope-progress.json` manifest reflecting completion — or a clean Save point the developer can resume
from. Finalize via `/buildscope --edit` or `/createSpecs`.

## Context

{{args}}
