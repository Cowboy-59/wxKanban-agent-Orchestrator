# Task Breakdown: Stack/Style Generation Injection

**Feature**: Stack/Style Generation Injection
**Spec**: 056
**Date Generated**: 2026-06-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

> **Tasks revised 2026-06-14 (Amendment A):** there is no `{{stack}}` template engine to inject into. The corrected work is (a) the effective-stack resolution chain *inside `project.get_stack`* and (b) a read-`stack.md` instruction block in the three command templates.

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Effective-stack resolution chain inside `project.get_stack` | high | done |
| 2 | T002 Stack-injection instruction block in the buildscope template | high | done |
| 3 | T003 Stack-injection instruction block in the createspecs template | high | done |
| 4 | T004 Stack-injection instruction block in the implement template | high | done |
| 5 | T005 No-regression fallback (no doc/profile → no stack.md → unchanged) | high | done |
| 6 | T006 Tests — resolved stack vs. fallback + `get_stack` resolution order | medium | done |

## Task Details

### T001 — Effective-stack resolution chain inside `project.get_stack`

Make `project.get_stack` return the project's **effective** stack/style by walking project `ProjectStack` doc → company-wide profile (by application type) → null, evaluated live. The project-level tier (the `ProjectStack` document from SPEC-055) is wired now and `materialize-stack` already consumes `get_stack`; the company-wide tier (SPEC-057) slots into the same function when it lands without changing `materialize-stack` or the templates. A null result means "no stack" → the kit built-in default = today's behavior. Resolution is a cheap document read; the kit makes no AI call.

### T002 — Stack-injection instruction block in the buildscope command template

Add an instruction block to `buildscope.md` telling the editor AI: if `stack.md` exists at the repo root, read it and generate scopes that target the project's real stack/style (backend/frontend/db/styling/testing/hosting + design tokens); if absent, proceed exactly as today. Static markdown, no kit substitution — the editor AI reads the local file SPEC-055 materialized.

### T003 — Stack-injection instruction block in the createspecs command template

Add the same read-`stack.md` instruction block to `createSpecs.md` so generated specs' technical sections name the project's real stack rather than wxKanban's defaults. No-op when `stack.md` is absent.

### T004 — Stack-injection instruction block in the implement command template

Add the same read-`stack.md` instruction block to `implement.md` so generated code uses the chosen framework, component library, and design tokens. No-op when `stack.md` is absent.

### T005 — No-regression fallback

Guarantee that when nothing resolves (no `ProjectStack` doc, no company-wide profile), `get_stack` returns null, `materialize-stack` writes no `stack.md`, and the command templates' instruction block is a strict no-op — output is byte-for-byte today's behavior. This is the safety floor that makes adopting the capability risk-free.

### T006 — Tests — resolved stack vs. fallback + resolution order

Cover both paths: with a `ProjectStack` doc present, `get_stack` returns it and `materialize-stack` writes `stack.md` (so the editor sees it); with nothing present, `get_stack` returns null and no file is written. Assert the `get_stack` resolution order (project → company → built-in) at each tier, and the workflow-engine invariant (zero AI calls, no template substitution).
