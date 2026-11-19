# Spec 062: Project Theme (pick / build / execute)

## Overview

A per-project, per-application-type **Theme** capability that elevates the visual decision out of the Stack screen into its own first-class surface — a Theme step in project creation and a Theme tab on the project, parallel to Stack. Stack keeps the technical dimensions (backend/database/testing/hosting); Theme owns visual identity (formerly SCOPE-047's buried "Look & Feel" sub-step). The customer reaches a look three ways, all filtered to the project's app type(s): pick a curated **preset**, draw **inspiration** from galleries (Mobbin et al.) and let AI derive a palette, or **build their own** (from the company logo, from a text prompt, or by hand). Whatever the path, a **live preview** renders real components in the working theme with an independent light/dark toggle, **WCAG contrast** is surfaced as a first-class check, and the customer can **execute** — render genuine styling artifacts (`theme.css` light+dark / Tailwind tokens / shadcn theme) for *their generated product*, downloadable and materialized beside the stack artifacts so the generation pipeline (SPEC-056) consumes them.

This is the single implementation spec for **SCOPE-062**, organized into three phases: **A** (model + storage + execute artifacts), **B** (Theme Studio UI), **C** (AI derivation + company theme profiles). It builds directly on SCOPE-047/SPEC-055/057 (galleries, the AI derive-route + safe-fallback, the company promote/clear pattern) and on the shadcn/Tailwind variable set already in `src/client/styles/index.css`. Full reviewed scope: `specs/Project-Scope/062-project-theme.md`.

## Business Problem

A customer's first reaction to a generated product is visual, but the kit gives the visual decision the least support: today it's a small sub-step inside the Stack editor expressed as prose ("16px base, 1.25 modular scale", five hex colors) — no preview, no accessibility check, and no usable output. The kit already owns the adjacent machinery (app-type-filtered galleries, an AI token-derivation route with a safe fallback, a company promote/clear pattern, a stack-artifact materialization path). The gap is purely elevation and execution: lift visual identity into its own surface, give it real sources, let the customer *see* and *check* the result, and emit genuine theme artifacts that flow into generation the way stack.md does. Closing the gap turns a decorative prose note into a previewable, accessible, executable theme — and teaches design tokens, light/dark, and contrast as concrete artifacts, serving the kit's educational mission.

## Actors

- Primary: the project creator (member or admin) choosing a visual identity at project creation or from the Theme tab.
- Secondary: the company admin (promotes/clears company-wide theme defaults); the generation pipeline (non-human consumer reading executed theme artifacts); the AI derive service (gallery/prompt/logo); the team building from the executed theme.

## Success Metrics

1. **Fast path produces a complete, accessible theme:** picking "web" and applying a preset yields a full light+dark theme, a `projectthemes` row, and a `theme.css` artifact — zero manual decisions — and the preset passes WCAG AA. *(FR-001/003/008/009/010)*
2. **All three sources work and AI never blocks:** presets, gallery-derive, and build-your-own each yield a complete editable theme; every derive path returns safe defaults on AI failure with no 5xx. *(FR-003/004/005/006)*
3. **Execute is real and consumable:** the execute endpoint returns a `theme.css` whose variables match the saved theme and that renders as previewed; artifacts are materialized beside the stack artifacts. *(FR-010)*
4. **Never-empty resolution + company reuse:** a themeless project resolves to the company default, then to the wxKanban built-in default; admin promote/clear works and non-admins cannot promote. *(FR-011)*

## Scope Boundary

IN: the Theme creation step + Theme tab (look-and-feel controls removed from the Stack editor); app-type-filtered sources; curated presets (web-first); inspiration galleries + AI-derive; build-your-own (logo / prompt / manual); a live preview of real components with a scoped light/dark toggle; first-class WCAG contrast badges; structured per-(project, app type) storage (`projectthemes`); execute to real artifacts (`theme.css` light+dark / Tailwind / shadcn) downloadable + materialized beside stack artifacts; company promote/clear (`companythemeprofiles`) with an admin page; three-tier resolution (project → company → wxKanban default); and back-compat seeding of the Stack doc's coarse design-tokens line.

## Out of Scope

Re-skinning the wxKanban app itself / per-company wxKanban branding (themes the customer's product only; the wxKanban look is reused only as the *content* of the fallback theme). Curated preset *libraries* for desktop/mobile (token-level theming + AI-derive + build-your-own only there in v1; preset galleries for those types are a later scope). Hot-patching a deployed customer app (execute emits artifacts for generation; it does not live-theme a running product). Choosing the styling *framework* (that stays a Stack dimension). Multi-instance concerns, external theme marketplaces, and conformance enforcement of generated code against the theme.

## Open Questions

- Exact source to seed `THEME_PRESETS` (shadcn registry subset vs a tweakcn export) — sized in Phase A.
- Whether `theme.css` should also auto-update the customer's Tailwind font imports — Phase A vs follow-up.

## Functional Requirements

### FR-001 — Theme surface (split out of Stack)

A dedicated Theme step MUST appear in project creation alongside Stack, and a Theme tab MUST appear on the project sibling to the Stack tab; the look-and-feel controls MUST be removed from the Stack editor.

**Acceptance Criteria**:
- [ ] Theme is its own creation step and its own project tab
- [ ] The Stack editor no longer contains look-and-feel controls
- [ ] A creator can apply a preset and finish with a complete, accessible theme with no manual decision

### FR-002 — App-type-keyed sources

Sources (presets, galleries) MUST be filtered to the project's selected app type(s), reusing the existing app-type filtering pattern.

**Acceptance Criteria**:
- [ ] Presets and galleries shown are filtered to the project's app type(s)
- [ ] A multi-type project surfaces sources for each type

### FR-003 — Curated presets

The customer MUST be able to browse a gallery of ready-made themes (swatched cards) and apply one in a single action; presets are web-first in v1.

**Acceptance Criteria**:
- [ ] Applying a preset yields a full, editable light+dark theme
- [ ] Every shipped preset passes WCAG AA
- [ ] Presets surface for web; desktop/mobile fall back to galleries + build-your-own

### FR-004 — Inspiration galleries + AI-derive

The existing galleries (Mobbin, Dribbble, Land-book, Awwwards) MUST remain as cited references; selecting one and citing a specific app/page MUST let AI derive a full, editable theme.

**Acceptance Criteria**:
- [ ] A cited gallery reference produces a complete light+dark theme
- [ ] The result is fully editable afterward

### FR-005 — Build-your-own (logo / prompt / manual)

The customer MUST be able to derive a starting palette from the company logo (when present), generate a complete theme from a plain-language prompt, and set every semantic token by hand; any preset/AI/logo result MUST be fully editable.

**Acceptance Criteria**:
- [ ] Derive-from-logo produces a palette when `company.logourl` exists; absent a logo the option is unavailable, not broken
- [ ] AI-from-prompt yields a complete light+dark theme
- [ ] Manual editing covers all semantic tokens, radius, and typography and never yields a partial/invalid theme

### FR-006 — AI fail-open

Every derive path (gallery, logo, prompt) MUST fall back to safe default tokens on AI failure and MUST never block the customer or return 5xx — mirroring the existing `derive-tokens` route.

**Acceptance Criteria**:
- [ ] With the LLM provider unset/erroring, each derive path returns default tokens
- [ ] No derive failure returns 5xx or blocks the flow

### FR-007 — Live preview

A live preview MUST render real sample components in the working theme and update immediately on any change, with an independent light/dark toggle scoped to the preview (not the surrounding app).

**Acceptance Criteria**:
- [ ] The preview reflects token changes immediately
- [ ] The preview's light/dark toggle is independent of the app's theme
- [ ] The preview renders real shadcn components (buttons, card, input, tabs, badge, typography ramp)

### FR-008 — Accessibility (contrast, first-class)

The Theme UI MUST surface WCAG contrast results for the critical pairs (foreground-on-background, primary-foreground-on-primary) with a pass/fail badge; shipped presets and the built-in default MUST pass AA.

**Acceptance Criteria**:
- [ ] Contrast badges appear for the critical pairs and update live
- [ ] Every preset and the built-in default pass WCAG AA
- [ ] A failing manual choice is flagged (warned), not silently accepted

### FR-009 — Structured storage (per app type)

A theme MUST be stored as structured data per (project, app type) — one active theme per app type — not as round-tripped prose.

**Acceptance Criteria**:
- [ ] A project can hold distinct themes for web and mobile; each persists and reloads independently
- [ ] Storage is structured JSON (no lossy markdown round-trip)

### FR-010 — Execute to artifacts

Execute MUST produce real artifacts — CSS variables (light + dark), Tailwind tokens, and a shadcn-compatible theme — available to download and persisted for generation; artifacts MUST be materialized alongside the project's stack artifacts.

**Acceptance Criteria**:
- [ ] Execute yields a downloadable `theme.css` whose variables match the saved theme
- [ ] Pasted into a shadcn page, the artifact renders as previewed
- [ ] Artifacts are materialized beside the stack artifacts for the generation pipeline

### FR-011 — Company reuse & three-tier resolution

An admin MUST be able to promote a project's theme to a company-wide default for an app type (at most one per type) and clear it (tenant-isolated, admin-gated); a project's effective theme MUST resolve project (app type) → company default (app type) → wxKanban built-in default — never empty.

**Acceptance Criteria**:
- [ ] Admin promote writes one company default per (company, app type); non-admins cannot promote
- [ ] A themeless project resolves to the company default; with neither, to the wxKanban built-in default
- [ ] Clearing a company default takes effect immediately (falls through to the wxKanban default)

### FR-012 — Backward compatibility

The Stack document's coarse "Design Tokens" line MUST continue to render, seeded from the chosen theme's values, so existing stack consumers are unaffected.

**Acceptance Criteria**:
- [ ] The Stack doc still renders a design-tokens line, seeded from the theme
- [ ] Existing stack consumers see no regression

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-06-20
- **Phase**: design
