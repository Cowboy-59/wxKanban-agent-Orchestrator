# Task Breakdown: Localization Framework & Preference

**Feature**: Localization Framework & Preference
**Spec**: 051
**Date Generated**: 2026-06-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 i18n framework init + provider + en-US locale-bundle loader | high | todo |
| 2 | T002 `users.language` column + Drizzle migration + browser-seed on first login | high | todo |
| 3 | T003 Language selector in profile settings | high | todo |
| 4 | T004 Per-key en-US fallback guarantee | high | todo |
| 5 | T005 Locale-aware date/number formatting helper (Intl) | medium | todo |
| 6 | T006 Hardcoded-string guardrail lint/check | medium | todo |
| 7 | T007 Extend profile/me read to expose `language` | medium | todo |

## Task Details

### T001 — i18n framework init + provider + en-US locale-bundle loader
Wire a real i18n framework into the React app and mount its provider at the app root so every component can resolve strings through the locale layer. Author the `en-US` locale bundle as static client assets and implement the bundle loader that the framework consumes. Convert the login screen, navigation, buttons, and labels to resolve from locale keys so a demo language switch is observable. This establishes the base machinery that FR-002, FR-011, and all downstream specs depend on.

### T002 — `users.language` column + Drizzle migration + browser-seed on first login
Add a `language` column to the `users` table (lowercase, concatenated, default `en-US`) following DB conventions, and generate the Drizzle migration as the next number after the current head `0030`. On first login, seed the preference from the request's `Accept-Language` header so a fresh user lands in their browser locale. Apply via the project's `pg.Client` + transaction migration pattern. This is the persistence backbone for FR-004.

### T003 — Language selector in profile settings
Add a language selector to profile settings that lets a user pick their preferred locale and persists it through the **existing** profile/user-update endpoint — no new preference endpoint is introduced. The selected value writes to `users.language` and immediately drives the active locale on next load. The preference must survive logout/login on another device, satisfying the persistence half of FR-004.

### T004 — Per-key en-US fallback guarantee
Configure the framework's resolution so any missing locale or missing key falls back to `en-US` **per key** — never blanking a label or failing the whole view. Selecting a language with zero authored strings must render a complete English UI, and a single missing key must fall back only for that key. Guarantee no console error or 404 is emitted on a missing translation. This delivers FR-002, the safety net that makes the framework-only half-state acceptable.

### T005 — Locale-aware date/number formatting helper (Intl)
Provide a small formatting helper built on `Intl` that formats dates and numbers per the active locale, for display only. No currency conversion or business-logic change occurs — only presentation. Wire it so that changing language re-renders dates/numbers in the new locale format. This delivers FR-011.

### T006 — Hardcoded-string guardrail lint/check
Build a check (lint/script) that flags new user-facing strings bypassing the locale layer, consistent with the project's audit-fence discipline. It must run locally, return a clear pass/fail, flag a deliberately planted bare string, and pass clean keyed code. Document how to run it. This delivers FR-012 and keeps the platform from regressing as the app grows.

### T007 — Extend profile/me read to expose `language`
Extend the existing profile/me read endpoint to include the user's `language` value so the VS Code extension (spec 053) can fetch the preference via the project API token. No new endpoint is added; only the response shape gains the field. This is the server-side hook downstream generation-language plumbing relies on.
