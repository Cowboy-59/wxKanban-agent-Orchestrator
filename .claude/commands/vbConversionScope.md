---
description: Generate Scope-of-Project documents from a VB6 app already converted by /vbConversion — acting as a Systems & Business Analyst, one scope per form/report plus overall Program, Database, and Backend/API scopes, BuildScope-style and RESUMABLE (after each scope, [Yes] to continue or [Save] to stop and restart later), with a VB6-aware gap-analysis pass (On Error Resume Next, SQL injection, synthesized key, Win32/OCX).
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# vbConversionScope — VB6 scope generation (Systems & Business Analyst)

## Purpose

Turn the artifacts produced by `/vbConversion` (a VB6 app converted from its `.vbp`/`.frm`/`.bas`/`.cls`
source) into **Scope-of-Project documents**, acting as a Senior Systems & Business Analyst and running
the **BuildScope** gated method. Produces one scope per form and per report, plus overall **Program**,
**Database**, and **Backend/API** scopes. The Clarion/WinDev counterparts are `/cwConversionScope` and
`/wxConversionScope`.

## Usage

```bash
/vbConversionScope            # resume or start scope generation over the converted artifacts
/vbConversionScope --restart  # discard saved progress and rebuild the scope queue
```

## Behavior

1. **Preflight:** confirm `pre-convert/` and `rebuild/` exist (run `/vbConversion` first if not).
2. **Load the skill** (`project.get_command_prompt { command: "vbconversionscope" }`).
3. **Resumability:** read `specs/Project-Scope/.scope-progress.json`; offer **resume** or **restart**,
   else build and confirm the scope queue.
4. **Control resolution:** confirm VB6 field↔label pairings; decide a React library for each OCX gap
   (`references/vb6-gaps.md`).
5. **Readiness gate:** *"Ready to begin Scope Generation? [Yes] / [Save]."*
6. **Per item** (Program → Database → Backend/API → each form → each report): run the BuildScope
   section-by-section method, perform the **VB6-aware analyst gap-pass** (`On Error Resume Next` silent
   failures, missing validation, string-concatenated SQL injection, the synthesized vs real primary
   key, Win32/OCX non-portability, PII), write to `specs/Project-Scope/<NNNN>-<name>.md`, persist, then
   *"`<item>` saved. Ready for the next? [Yes] / [Save]."* `Save` stops and persists for restart.
   Queries already in `rebuild/scopes/QRY-queries-scope.md` are referenced, not re-scoped.
7. **Surface, don't decide.** One question at a time; explicit `[A]pprove` to advance each section.

## Exit conditions

Draft scope documents under `specs/Project-Scope/` for every queued item, with a `.scope-progress.json`
manifest reflecting completion — or a clean Save point to resume from. Finalize via `/buildscope --edit`
or `/createSpecs`.

## Context

{{args}}
