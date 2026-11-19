# Spec 052: App UI String Extraction

## Overview

This spec is the **bulk mechanical refactor** that realizes scope 046's FR-001 across the authenticated app. Spec 051 introduces the i18n framework — the provider, the translation hook, the en-US bundle loader, the per-key en-US fallback, and the hardcoded-string guardrail. **Spec 052 consumes it.** It sweeps the 65+ React components in `src/client/` that today render hardcoded English, moving every user-facing string onto spec 051's translation hook and authoring the corresponding en-US bundle keys.

This is intentionally a **large mechanical effort kept separate** from spec 051 so that the high-value plumbing (the framework, hook, fallback, and guardrail) can ship and verify against a small surface first. Once 051 is proven, 052 applies it everywhere at scale, area by area, without re-litigating the framework design. The split keeps each spec independently shippable and reviewable: 051 is "does the locale layer work?", 052 is "is every string now going through it?".

Methodology and lifecycle terms (Scope, Stage Gate, Lifecycle Phase, the six phase names, Spec) stay English by design — they are excluded from extraction per scope 046's shared protected-term list (046 FR-003). Extracting a protected term to a translatable key is a defect. Reference: `specs/Project-Scope/046-language.md`.

## Business Problem

Spec 051 delivers a working locale layer, but on day one it resolves nothing real: every user-facing string in the authenticated app — across roughly 65+ components covering the app shell, auth, dashboards, projects/tasks/Kanban, time tracking, invoices, consultant surfaces, audit, SysAdmin, settings, and help — is still hardcoded English embedded directly in JSX. Without this sweep, a French user who sets their preference sees an English interface everywhere because there are no locale keys for the framework to look up. The framework is plumbing with nothing flowing through it. This spec does the unglamorous-but-essential work of connecting every existing string to the hook and authoring the en-US bundle, so that switching a demo locale actually changes what the user sees app-wide — turning 051's capability into a real, observable, end-to-end localized interface.

## Actors

- Primary: **Developer performing the sweep** — refactors each app area's hardcoded strings onto spec 051's translation hook, authors the matching en-US bundle keys, and verifies the guardrail passes clean across the swept area.
- Secondary: the **French / non-English end user** who benefits — once swept, their Language Preference resolves real strings across the whole app instead of bottoming out on hardcoded English; the **i18n framework** (spec 051) that provides the hook, the en-US bundle, the per-key fallback, and the guardrail this sweep depends on.

## Success Metrics

1. Every targeted component's user-facing strings resolve from locale keys via spec 051's hook — no user-facing string remains hardcoded in changed code.
2. The hardcoded-string guardrail (spec 051 FR-012) passes clean across every swept area; a deliberately planted bare string in a swept component is flagged.
3. Switching a demo locale visibly changes resolved strings app-wide, not just on the small surface spec 051 verified.
4. Protected methodology terms remain English in every swept component (none extracted to translatable keys).

## Scope Boundary

IN: refactoring the existing hardcoded user-facing strings across the authenticated app's 65+ React components (`src/client/`) onto spec 051's translation hook, organized by app area; and authoring the corresponding **en-US bundle keys** for every extracted string so the framework resolves real values. The sweep covers app shell/layout/navigation, auth, dashboards, projects/tasks/Kanban, time tracking/invoices, consultant/engagement/work-hub, audit/compliance, SysAdmin, and settings/integrations/help/notes — with SysAdmin deliberately lowest priority. Verifying the guardrail passes clean across each swept area is part of the work.

## Out of Scope

- The i18n **framework itself** — the provider, hook, bundle loader, per-key fallback, and the guardrail check → **spec 051** (this spec consumes them).
- Authoring **non-English translations** (French/Spanish/etc. bundles) — v1 authors en-US keys only; non-English bundles are a later phase of scope 046.
- **AI-generated content** localization (in-language `buildscope`/`createspecs`/feedback, authoring-language tagging, on-demand review translation) → **spec 053**.
- **Public / marketing / docs** surfaces (logged-out localization, browser-locale resolution) → **spec 054**.
- Per-user Language Preference plumbing, VS Code generation-language injection, locale-aware date/number formatting, and methodology-term-list authoring (owned by 051 / other 046 splits).
- Dev Cockpit chrome localization; PDF/email localization (deferred in scope 046).

## Open Questions

None — buildscope 2026-06-13. The sweep consumes spec 051's already-decided framework; there are no open framework questions for 052 to resolve. Area ordering, priorities, and the protected-term exclusion are all settled in scope 046 and this spec's task breakdown.

## Functional Requirements

### FR-001 — App UI resolves through a locale layer

All user-facing strings render through the i18n framework keyed by locale; no user-facing string is hardcoded in changed code. This spec realizes FR-001 in bulk across the authenticated app by sweeping all 65+ components onto spec 051's translation hook and authoring the en-US bundle keys.

**Acceptance Criteria**:
- [ ] Every targeted component's strings resolve from locale keys (no hardcoded user-facing string remains in changed code).
- [ ] The hardcoded-string guardrail (spec 051 FR-012) passes clean across the swept areas.
- [ ] Switching a demo locale visibly changes resolved strings app-wide.

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-06-13
- **Phase**: design
- **Blocked by**: spec 051 (the i18n framework — provider, translation hook, en-US bundle loader, per-key fallback, and hardcoded-string guardrail — must land first). This spec is intentionally a large mechanical sweep split out from scope 046 so the high-value plumbing (051) can ship and verify before the bulk extraction runs.
