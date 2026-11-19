# Spec 051: Localization Framework & Preference

**Parent Scope**: `specs/Project-Scope/046-language.md`

---

## Overview

This is the **platform-core** spec of scope 046 — the base layer that everything else in the localization platform depends on. It wires a real i18n framework into the React app, introduces a locale layer through which every user-facing string resolves, authors the `en-US` bundle, and stores a per-user Language Preference on the User record. It also delivers the guarantees that keep the platform safe: a per-key `en-US` fallback so a missing translation never blanks/errors/404s, locale-aware date/number formatting via `Intl`, and a guardrail that flags new hardcoded user-facing strings.

This spec ships the **framework only** in a deliberate half-state: `en-US` is the **only authored language** in v1. The machinery to switch languages, persist a preference, and fall back per key is fully real, but until non-English bundles are authored (a later phase of scope 046), every locale resolves to English text. That is an accepted design point, not a gap — it lets the platform be built once, correctly, while the string-extraction sweep and authored bundles follow in downstream specs.

## Business Problem

Today the entire authenticated app is hardcoded English: there is no i18n framework, no per-user language, and no locale layer. The beachhead market — WinDev/PCSoft converts — is heavily French, and the broader audience spans Spanish, Italian, German, and Portuguese speakers. Without a localization platform, the product cannot meet its primary market in its own language, and the educational mission of teaching software vocabulary to career-changers stays gated behind an English-only wall. The right move is to build the platform once: introduce the framework and the locale layer, make language a per-user preference rather than a code change, and guarantee a clean per-key fallback so the app never breaks while bundles are authored over time.

## Actors

- **Primary** — **A user setting their language**: seeds a preference from browser locale on first login, later confirms/edits it in profile settings, and expects every app surface to resolve through the locale layer in that preference, persisting across sessions and devices.
- **Secondary** — **Developer** (must keep new user-facing strings locale-keyed, caught by the guardrail when they don't); **wxKanban server** (persists the preference on the User record via the existing profile/user-update endpoint and exposes it on profile/me).

## Success Metrics

1. **Language switch is observable end-to-end.** A user sets a non-English preference and, on reload, the login screen, app navigation, buttons, and labels all resolve through the locale layer — verifiable by toggling a test locale bundle and seeing resolved strings change. *(scope 046 success criterion 1)*
2. **Fallback never breaks the UI.** Selecting any language with zero authored strings renders a 100% complete English interface with no blank labels, console errors, or 404s. *(scope 046 success criterion 2)*
3. **Preference persists across sessions and devices.** A preference set on one device is in effect after logging in on another. *(scope 046 success criterion 6)*
4. **No new hardcoded user-facing strings pass the guardrail.** The check flags a deliberately planted bare string in new code and passes clean code. *(scope 046 success criterion 7)*

## Scope Boundary

**IN**:
- i18n framework wired into the React app + provider
- The locale layer through which all user-facing strings resolve
- The authored `en-US` locale bundle + bundle loader
- `users.language` per-user Language Preference (column + migration) and the profile-settings selector
- Per-key `en-US` fallback guarantee
- Locale-aware date/number formatting helper (`Intl`, display-only)
- Hardcoded-string guardrail check
- Extending profile/me read to expose `language` for the VS Code extension (spec 053)

## Out of Scope

- **Non-English authored UI bundles** (French-first when undertaken later in scope 046)
- The **string-extraction sweep** across the app's 65+ components → **spec 052**
- **AI-generated in-language content** + authoring-language tagging + on-demand review translation → **spec 053**
- **Public-surface / marketing / docs** localization → **spec 054**
- Server-generated **PDF (invoice) and transactional/notification email** localization
- **Dev Cockpit chrome** localization
- **Translation caching**
- RTL-script support, currency conversion, locale-specific business logic, translating user-authored data

## Open Questions

None — resolved in buildscope 2026-06-13.

## Functional Requirements

### FR-001 — App UI resolves through a locale layer
All user-facing strings in the authenticated app render through an i18n framework keyed by locale; no user-facing string is hardcoded in new/changed code.

**Acceptance Criteria**:
- [ ] An i18n framework is wired into the React app
- [ ] Login screen, navigation, buttons, and labels resolve from locale keys
- [ ] A demo language can be switched and observed changing resolved strings

### FR-002 — Per-key en-US fallback (never breaks)
Any missing locale or missing key falls back to `en-US` per key; the UI is never blank or errored.

**Acceptance Criteria**:
- [ ] Selecting a language with zero authored strings renders a complete English UI
- [ ] A locale missing a single key falls back only for that key, not the whole view
- [ ] No console error or 404 occurs on a missing translation

### FR-004 — Per-user Language Preference
Each user has a Language Preference stored on their User record, seeded from browser locale on first login, editable in profile settings, persisting across sessions and devices.

**Acceptance Criteria**:
- [ ] First login with `Accept-Language: fr` seeds preference to French
- [ ] Changing preference in settings persists after logout/login on another device
- [ ] Preference drives all four surfaces (app, public, AI content, VS Code)

### FR-011 — Locale-aware date/number formatting (display only)
Dates and numbers in the UI format per the active locale; no currency conversion or business-logic change.

**Acceptance Criteria**:
- [ ] Dates/numbers render in locale format when language changes
- [ ] No monetary value is converted — only display formatting changes

### FR-012 — Hardcoded-string guardrail
A check flags new user-facing strings that bypass the locale layer, keeping the platform from regressing (consistent with the project's audit-fence discipline).

**Acceptance Criteria**:
- [ ] A lint/check identifies hardcoded user-facing strings in new code
- [ ] It can run locally and is documented

## Phase

**Current Phase**: design
**Priority**: high

## Status

**Date**: 2026-06-13
**Phase**: design
