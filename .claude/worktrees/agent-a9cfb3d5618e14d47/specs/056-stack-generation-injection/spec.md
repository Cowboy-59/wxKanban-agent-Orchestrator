# Spec 056: Stack/Style Generation Injection

> **Amendment A (2026-06-14):** The original draft said this spec would "reuse spec 046's `{{language}}` template-injection mechanism." Investigation during implementation found **no such mechanism exists** — command templates in `_wxAI/commands/` are delivered **verbatim** to the editor AI (which expands `{{args}}` itself); there is no kit/server-side `{{…}}` substitution layer, and the `{{language}}` injection of spec 046/051 was never built (SPEC-051 is design/0%). Building one would also violate the **"kit is a workflow engine, not an AI client"** rule. The mechanism below is corrected to the architecturally-honest approach already supported by SPEC-055: the editor AI **reads the local `stack.md`** the kit materializes, and the resolution chain lives **server-side in `project.get_stack`** — not in a template engine. Approved by Andy 2026-06-14. See [[reference_scope_vs_spec_namespaces]] for the SCOPE-047 ↔ SPEC-055/056/057 mapping.

## Overview

This spec makes the kit's generation actually target the project's chosen technology stack and design/CSS style — **without** the kit calling any AI or rewriting templates. SPEC-055 already materializes the project's effective stack/style to a local **`stack.md`** at the repo root (captured → `ProjectStack` DB doc → `project.get_stack` → `materialize-stack` writes the file on project open). This spec makes the `buildscope`, `createspecs`, and `implement` command templates **instruct the editor AI to read that local `stack.md` and target the project's real stack and look** instead of silently assuming wxKanban's own Express/React/Postgres/Tailwind defaults.

Resolution is **project `ProjectStack` doc → company-wide profile (by application type) → kit built-in default**, evaluated **live at generation time inside `project.get_stack`** (the single resolution point `materialize-stack` consumes). The editor AI never sees the tiers — it only ever reads the one winning `stack.md`. The kit stays a **workflow engine**: it resolves and materializes a document; the editor AI does the reading and generating. No kit-side template substitution and no kit AI calls.

The capability ships with a strict **no-regression fallback**: when no `ProjectStack` doc and no company-wide profile resolve, `get_stack` returns nothing, no `stack.md` is written, and the command templates' stack block is a no-op — so generation behaves **byte-for-byte exactly as today**. Capturing a stack/style is useless unless generation targets it; this spec is the consumer of the capture work in SPEC-055. The project-level resolution works on its own; the company-wide tier slots into `get_stack`'s fallback when SPEC-057 lands.

Source scope: `specs/Project-Scope/047-stack-style.md` (FR-006).

## Business Problem

The kit is used by consumer projects on many different stacks, but capturing a project's stack and style is wasted effort unless generation actually targets it. Without injection, the kit's generated specs and code silently assume wxKanban's own Express/React/Postgres/Tailwind stack, which is wrong for most consumer projects and forces rework. This spec closes that gap: it feeds the project's resolved stack + style into everything the kit generates, so output matches the project's real target — while a project with nothing captured keeps today's behavior exactly, so adopting the capability is risk-free.

## Actors

- Primary: Developer running `buildscope` / `createspecs` / `implement` — wants the generated scope, spec, and code to target the project's real stack and style, not wxKanban's defaults.
- Secondary: the editor AI agent (consumes the injected `{{stack}}` context when generating output); the kit (resolves the effective stack/style and injects it into the command templates — calling no AI itself, workflow engine).

## Success Metrics

1. With a resolved stack/style present, all three commands (`buildscope`, `createspecs`, `implement`) emit the `{{stack}}` context into their templates, and generated output reflects the project's stack + style — verifiable across all three. *(FR-006)*
2. With no `stack.md` and no company-wide profile, generation is **byte-for-byte today's behavior** — a forced diff against current output shows zero change across all three commands (no regression). *(FR-006)*
3. The effective-stack resolver returns the correct source in priority order — project `stack.md` → company-wide profile (by app type) → kit built-in default — evaluated live at generation time, verifiable at each tier with and without the higher tiers present. *(FR-006)*
4. Injection is template-level only: the kit makes zero AI calls during resolution or injection (workflow-engine invariant holds). *(FR-006)*
5. Resolution and injection add no measurable latency floor to generation beyond a single document lookup (live resolve is a cheap read, not a build step).

## Scope Boundary

IN: the effective-stack resolution chain (project `ProjectStack` doc → company-wide profile by app type → kit built-in default) made **live at generation time inside `project.get_stack`**, which `materialize-stack` (SPEC-055) consumes to write the winning `stack.md`; a **stack-injection instruction block** added to the `buildscope`, `createspecs`, and `implement` command templates telling the editor AI to read `stack.md` (if present) and target it; the no-regression fallback (no doc + no profile → no `stack.md` → templates render byte-for-byte today's behavior); tests covering resolved-stack vs. fallback across the three commands and the `get_stack` resolution order.

## Out of Scope

The `/buildstack` capture/interview and per-project `stack.md` / `ProjectStack` document + `materialize-stack` writer (spec 055 — this spec consumes them). The company-wide stack/style profiles, the `companystackprofiles` table, the ADMIN promote action, and the web ADMIN screen (spec 057 — its tier slots into `get_stack`'s fallback when it lands; project-level resolution works without it). Any kit-side `{{…}}` template-substitution engine (explicitly NOT built — see Amendment A; templates are served verbatim and the editor AI reads the local file). Emitting build artifacts (`tailwind.config`, theme CSS, scaffolds). Conformance enforcement / linting that generated code obeys the stack/style. Any kit-internal AI call (the editor AI generates).

## Open Questions

None — buildscope 2026-06-13. The injection target (the three generation command templates), the resolution order (project → company → built-in, live at generation time), the no-regression fallback, the reuse of spec 046's `{{…}}` mechanism, and the workflow-engine (no kit AI) invariant were all resolved in interactive buildscope and recorded in `specs/Project-Scope/047-stack-style.md`.

## Functional Requirements

### FR-006 — Make generation target the resolved stack; fallback when absent

The `buildscope`, `createspecs`, and `implement` command templates MUST instruct the editor AI to read the project's local `stack.md` (materialized by SPEC-055) and target the resolved stack + style. The resolution chain — project `ProjectStack` doc → company-wide profile → kit built-in default — MUST be evaluated live, server-side, inside `project.get_stack` (the single point `materialize-stack` consumes). When no `ProjectStack` doc and no company profile exist, `get_stack` returns nothing, no `stack.md` is written, and generation MUST behave exactly as today (no regression). The kit MUST NOT call AI and MUST NOT substitute template placeholders itself.

**Acceptance Criteria**:
- [ ] With a resolved stack/style present (a `stack.md` on disk), generated specs/code reflect the project's stack + style
- [ ] With no `ProjectStack` doc and no company profile, no `stack.md` is written and generation is unchanged from current behavior
- [ ] The kit calls no AI and runs no template-substitution engine — it resolves a document and the editor AI reads it (workflow engine)
- [ ] `get_stack` returns the correct tier in priority order (project → company → built-in) at each tier with/without the higher tiers present

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-06-13
- **Phase**: design
