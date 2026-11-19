# Plan: Stack/Style Generation Injection

**Spec Number**: 056
**Date**: 2026-06-13 (rev. 2026-06-14, Amendment A)

## Approach (corrected — see spec Amendment A)

There is **no kit-side `{{…}}` template engine** and we are not building one. SPEC-055 already does the heavy lifting: `project.get_stack` returns the project's `ProjectStack` doc and `materialize-stack` writes it to a local `stack.md`. This spec adds two things:

1. **Server-side resolution chain in `project.get_stack`** — make `get_stack` return the *effective* stack: project `ProjectStack` doc → (SPEC-057) company-wide profile by app type → null (→ kit built-in default, which is "today's behavior"). `materialize-stack` already consumes `get_stack`, so the editor only ever sees one winning `stack.md`. The company tier is a no-op until SPEC-057 adds the lookup; project-level resolution works now.
2. **A stack-injection instruction block** in `buildscope.md`, `createSpecs.md`, and `implement.md` telling the editor AI: *if `stack.md` exists at repo root, read it and target that stack/style; otherwise proceed exactly as today.* The block must be a strict no-op when the file is absent (no placeholder leakage).

## Key Decisions

- **Editor reads the file; kit resolves the doc.** Honors "kit is a workflow engine, not an AI client." No AI calls, no template substitution.
- **Single resolution point.** The priority chain lives only in `get_stack`, so SPEC-057's company tier slots in without touching the command templates or the editor.
- **No-regression is structural.** No doc + no profile ⇒ no `stack.md` ⇒ the instruction block does nothing ⇒ byte-for-byte today's output.
- **Code fencing.** The `get_stack` resolution change is fenced `[SCOPE 047 / …]` (inline, per 042/043/046 precedent since the orchestrator `implement` path is unavailable). Command markdown is exempt (static/legacy-baseline like other `_wxAI/commands/*.md`).

## Known Issues

Depends on SPEC-055 (per-project stack document + `get_stack` + `materialize-stack`) — **delivered**. Company-tier resolution wires into `get_stack` with SPEC-057.
