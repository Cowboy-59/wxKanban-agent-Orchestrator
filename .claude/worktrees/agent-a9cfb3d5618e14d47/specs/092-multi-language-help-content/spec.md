# Spec 092: Multi-language help content

**Spec Number**: 092
**Status**: `planned`
**Phase**: design
**Created**: 2026-07-09
**Source Scope**: `specs/Project-Scope/092-multi-language-help-content-help.md`

## Overview

A content-localization layer for all admin-authored help stored in the `wxkanbanhelp` table (training videos `category='docs'`, plus `cli`/`reference`/`guide` articles and `faq`). Each item's `title`, `summary`, and `content` can exist in the 6 supported locales (en-US, fr-FR, es-ES, it-IT, de-DE, pt-BR) via a new `helptranslations` table keyed by (`helpid`, `locale`); the base `wxkanbanhelp` row stays the canonical en-US copy. Admins author in English and AI-seed the other 5 locales as editable drafts, review, and publish. The public `/api/help/*` content reads serve the viewer's active locale with per-field English fallback, and a one-shot script seeds the existing back-catalog.

## Business Problem

Admins author help and training-video content once, in a single language (English), in the `wxkanbanhelp` table. The `/docs` and other help pages already localize all UI chrome via the app i18n bundle (SCOPE-052), but the stored content itself renders in whatever language the admin typed. A French or Italian visitor therefore sees a fully-translated page frame wrapped around English content — which reads as broken and undercuts the multilingual, beginner-friendly promise for the career-changer audience the content targets. The gap is content localization, distinct from UI-string localization, and no translation system touches admin-authored database content today.

## Actors

- Primary: SysAdmin — authors English content, triggers AI-seed, reviews and publishes per-locale translations.
- Secondary: End users and public visitors — read help content in their selected language on `/docs`, `/docs/:slug`, and other `/api/help/*` surfaces.

## Success Metrics

1. For each of the 6 supported locales, an item translated into that locale renders its `title`/`summary`/`content` in that locale on `/docs` and `/docs/:slug`, with any untranslated field falling back to English — 0 blank fields across all 6 locales.
2. Locale precedence is correct in 100% of reads: an explicit `?locale=` overrides the auth user's saved language (verified by a user whose default is English viewing the UI in Italian and receiving Italian content).
3. A single `seed-help-translations.ts` run drafts translations for all 26 existing untranslated items (or logs a per-item failure), and a second run performs 0 duplicate translations without `--force`.
4. Editing an item's English source never blocks the save (0 blocking errors) and never changes what end users currently see until the admin republishes.
5. With 0 `helptranslations` rows present, every `/api/help/*` read returns byte-identical English output to the pre-change behavior (no regression).

## Scope Boundary

Every content row in `wxkanbanhelp` across all categories. A new `helptranslations` table storing per-(`helpid`, `locale`) `title`/`summary`/`content` plus `ispublished` and `isstale` flags. AI-seed of the 5 non-English locales as editable drafts via the configured `LLM_PROVIDER` (fail-open). The SysAdmin → Docs/Help editor (`SysAdmin/Docs.tsx`) gains locale tabs, a Generate-translations action, and draft/published/stale indicators. Locale-aware reads on `/api/help/*` with resolution order explicit `?locale=` (active view) → auth user language → `Accept-Language` → en-US, with per-field English fallback. A one-shot bulk-seed script (`scripts/seed-help-translations.ts`, `--force` to re-seed) for the existing back-catalog.

## Out of Scope

The `/help` subscription-aware Help catalog (SCOPE-084) — a code-based `catalog.ts` already localized via `getLocalizedHelp`. The marketing FAQ (SCOPE-066) which lives in the `marketingassets` table, not `wxkanbanhelp`. UI-string localization (SCOPE-052), already delivered. Auto-publishing machine translations without a human review gate (except an explicit force seed). Adding a 7th locale (a separate change to the shared supported-locale list). Progress-bar, rate-limit, or queue machinery for the bulk seed (unnecessary at the current 26-item scale).

## Open Questions

None outstanding. All discovery decisions (authoring model, storage model, content boundary, locale precedence, staleness behavior, bulk-seed shape) were resolved during the 2026-07-09 scoping session and are recorded in the source scope's Clarifications table.

## Functional Requirements

### FR-001 — `helptranslations` table (English base stays source of truth)

New table keyed by (`helpid` → `wxkanbanhelp.id`, `locale`) holding `title`, `summary`, `content`, plus `ispublished` and `isstale` flags and `updatedat`; unique on (`helpid`, `locale`); cascade-deletes with its parent row. The `wxkanbanhelp` row remains the canonical en-US copy; en-US is never stored here.

Acceptance:
- Migration creates the table with a UUID v7 PK and a unique (`helpid`, `locale`) constraint.
- Deleting a `wxkanbanhelp` row removes its `helptranslations` rows.

### FR-002 — Locale-aware reads with per-field English fallback

`/api/help/docs`, `/api/help/docs/:slug`, and the other `/api/help/*` content reads resolve the viewer's locale in order: explicit `?locale=` → auth user's saved `language` → `Accept-Language` → en-US, returning `title`/`summary`/`content` in that locale with per-field fallback to the English base when a translation field is empty.

Acceptance:
- `?locale=it` returns Italian where present and English for any missing field.
- An explicit `?locale=` overrides the auth user's saved preference; unknown locale → full English, no error.

### FR-003 — AI-seed translations for one item

An editor action translates the English `title`/`summary`/`content` into the other 5 locales via the configured `LLM_PROVIDER`, saved as editable drafts (not auto-published). Fail-open: on AI error the admin can still author manually and the English item is never blocked.

Acceptance:
- Triggering seed populates all 5 locales' three fields as drafts with markdown preserved.
- An AI failure surfaces an error but leaves English and manual editing intact.

### FR-004 — SysAdmin per-locale authoring and publish

Extend the `SysAdmin/Docs.tsx` editor with a locale selector/tabs to view and edit each locale's three fields; save persists to `helptranslations`; publish makes them live to reads, with draft vs published state visible per locale.

Acceptance:
- The admin can edit any locale and see it served after publish.
- Draft vs published state is visible per locale.

### FR-005 — Staleness flag and re-seed

When an English source field changes on an already-translated item, mark the affected locales `isstale`; the editor shows the flag per locale with one-click re-seed (field or whole item). The last-published translation stays live to end users until republished; the English edit is never blocked.

Acceptance:
- Editing English raises the stale flag on translated locales without blocking the save.
- Re-seed clears the flag and produces fresh drafts; end users keep seeing the last-published version until republish.

### FR-006 — Bulk-seed the back-catalog

A one-shot admin script (`scripts/seed-help-translations.ts`) seeds drafts for all existing `wxkanbanhelp` items lacking translations, across every category, reporting per-item success/failure; idempotent (skips already-translated items unless `--force`).

Acceptance:
- One run drafts the 5 locales for each untranslated item, or logs a failure for it.
- Re-running skips already-translated items unless `--force`.
