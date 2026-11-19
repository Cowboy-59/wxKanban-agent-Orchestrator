# Spec 092: Multi-language help content (help-content-i18n)

**Spec Number**: 092
**Status**: `draft`
**Created**: 2026-07-09
**Depends On**: None
**Source**: `specs/Project-Scope/092-multi-language-help-content-help.md`

## Overview

A content-localization layer for **all** admin-authored help stored in the `wxkanbanhelp` table (training videos with `category='docs'`, `cli`/`reference`/`guide` articles, and `faq`). Each item's `title`, `summary`, and `content` can exist in the 6 supported locales (en-US, fr-FR, es-ES, it-IT, de-DE, pt-BR) via a new `helptranslations` table keyed by (`helpid`, `locale`); the base `wxkanbanhelp` row stays the canonical **en-US** copy. Admins author in English and AI-seed the other 5 locales as **editable drafts**, review, and publish. The public `/api/help/*` content reads (including `/api/help/docs` and `/api/help/docs/:slug`) serve the viewer's **active** locale with **per-field English fallback**. A one-shot script seeds the existing back-catalog.

**Why:** Admins author help/training-video content once, in a single language (English). The `/docs` and other help pages now localize all UI chrome via the app i18n bundle (SCOPE-052), but the stored content itself renders in whatever language the admin typed. So a French or Italian visitor sees a fully-translated page frame wrapped around English content — which looks broken and undercuts the multilingual, beginner-friendly promise for the career-changer audience the content targets.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | SysAdmin (authors English, AI-seeds, reviews and publishes translations) |
| **Secondary Actors** | End users and public visitors reading help in their selected language |
| **Key Value** | The whole in-app and public help experience reads in the viewer's language, with a human-reviewed quality gate on machine translation. |
| **Scope Boundary** | Every content row in `wxkanbanhelp` across all categories; a new `helptranslations` table; AI-seed + human-edit authoring loop; locale-aware `/api/help/*` reads with per-field English fallback; a one-shot back-catalog seed script. |

## User Scenarios & Testing

### US1 — Author + AI-seed + review (happy path)

**Actor**: SysAdmin

**Scenario**:
1. The admin creates or opens a help item in the SysAdmin → Docs/Help editor and writes its English `title`/`summary`/`content`.
2. The admin clicks **Generate translations**; the system AI-translates the three fields into the other 5 locales and saves them as editable drafts.
3. The admin switches between locale tabs, corrects wording where needed, and publishes.

**Expected outcome**: All 6 locales are stored in `helptranslations`; the item is publishable; edited locales reflect the admin's corrections, not the raw machine output. No field is ever auto-published without the admin publishing it (except an explicit force seed).

### US2 — Visitor reads in their language, with fallback

**Actor**: End user / public visitor

**Scenario**:
1. A visitor with locale set to Italian opens `/docs` and a `/docs/:slug` detail page.
2. Items with an Italian translation render Italian; items (or individual fields) lacking a translation render English.

**Expected outcome**: No blank fields, no error; only deliberate **per-field** English fallback. The same behavior applies to the other `/api/help/*` content reads.

### US3 — English source changes after translation (staleness)

**Actor**: SysAdmin

**Scenario**:
1. The admin edits the **English** `content` of an item already translated into all 6 locales.
2. The affected locales are now out of date.

**Expected outcome**: The item is flagged **"translations may be out of date"** per locale in the editor; the admin can one-click **re-seed** the changed field(s) or the whole item. End users keep seeing the last-published translation until the admin re-publishes. The English edit is never blocked.

### US4 — Bulk-seed the back-catalog

**Actor**: SysAdmin

**Scenario**:
1. The admin runs the one-shot seed script against the existing help catalog.
2. The script AI-seeds drafts for every item that lacks translations, across all categories.

**Expected outcome**: A single run drafts the 5 non-English locales for each untranslated item (or logs a per-item failure); a second run is idempotent (skips already-translated items unless `--force`).

## Functional Requirements

### FR-001 — `helptranslations` table (English base stays source of truth)

New table keyed by (`helpid` → `wxkanbanhelp.id`, `locale`) holding `title`, `summary`, `content`, plus `ispublished` and `isstale` flags and `updatedat`; unique on (`helpid`, `locale`); cascade-deletes with its parent row. The `wxkanbanhelp` row itself remains the canonical en-US copy.

**Acceptance Criteria**:
- [ ] Migration creates the table with a UUID v7 PK and a unique (`helpid`, `locale`) constraint.
- [ ] Deleting a `wxkanbanhelp` row removes its `helptranslations` rows.
- [ ] No `helptranslations` row is ever required for en-US (the base row is en-US).

### FR-002 — Locale-aware reads with per-field English fallback

`/api/help/docs`, `/api/help/docs/:slug`, and the other `/api/help/*` content reads resolve the viewer's locale in order: explicit `?locale=` (the app's active view) → auth user's saved `language` → `Accept-Language` → en-US. They return `title`/`summary`/`content` in that locale, falling back to the English base **per individual field** when a translation field is empty.

**Acceptance Criteria**:
- [ ] `?locale=it` returns Italian where present and English for any missing field.
- [ ] An explicit `?locale=` overrides the auth user's saved preference.
- [ ] Unknown/unsupported locale → full English, no error; no served field is ever null when the English base has a value.

### FR-003 — AI-seed translations for one item

An editor action translates the English `title`/`summary`/`content` into the other 5 locales via the configured `LLM_PROVIDER`, saved as editable drafts (not auto-published). Fail-open: on AI error the admin can still author manually and the English item is never blocked.

**Acceptance Criteria**:
- [ ] Triggering seed populates all 5 locales' three fields as drafts; markdown structure is preserved.
- [ ] An AI failure surfaces an error but leaves English and manual editing intact.

### FR-004 — SysAdmin per-locale authoring + publish

Extend the SysAdmin → Docs/Help editor (`SysAdmin/Docs.tsx`) with a locale selector/tabs to view and edit each locale's three fields; save persists to `helptranslations`; publish makes them live to reads.

**Acceptance Criteria**:
- [ ] The admin can edit any locale and see it served after publish.
- [ ] Draft vs published state is visible per locale.

### FR-005 — Staleness flag + re-seed

When an English source field changes on an already-translated item, mark the affected locales `isstale`; the editor shows the flag per locale with one-click re-seed (field or whole item). Last-published translation stays live to end users until republished; the English edit is never blocked.

**Acceptance Criteria**:
- [ ] Editing English raises the stale flag on translated locales.
- [ ] Re-seed clears the flag and produces fresh drafts; end users keep seeing the last-published version until republish.

### FR-006 — Bulk-seed the back-catalog

A one-shot admin script (`scripts/seed-help-translations.ts`) seeds drafts for all existing `wxkanbanhelp` items lacking translations, across every category, and reports per-item success/failure; idempotent (skips already-translated items unless `--force`). No progress/rate-limit/queue machinery — unnecessary at current scale (~26 items).

**Acceptance Criteria**:
- [ ] One run drafts the 5 locales for each untranslated item, or logs a failure for it.
- [ ] Re-running skips already-translated items (no duplicate cost) unless `--force`.

## Data Requirements

- **New table `helptranslations`** (naming per project conventions: lowercase, no underscores):
  - `id` — UUID v7, primary key
  - `helpid` — UUID, FK → `wxkanbanhelp.id`, ON DELETE CASCADE
  - `locale` — varchar (one of the 5 non-en-US supported locales)
  - `title` — text (nullable)
  - `summary` — text (nullable)
  - `content` — text (nullable, markdown)
  - `ispublished` — boolean, default false
  - `isstale` — boolean, default false
  - `createdat`, `updatedat` — timestamps
  - Unique constraint: (`helpid`, `locale`)
- **No change** to `wxkanbanhelp` columns; the base row remains the canonical en-US copy. en-US is never stored in `helptranslations`.

## API Routes

- `GET /api/help/docs` — **modified**: locale-aware, per-field English fallback (FR-002).
- `GET /api/help/docs/:slug` — **modified**: locale-aware, per-field English fallback.
- Other `/api/help/*` content reads — **modified**: same locale resolution + fallback.
- `POST /api/sysadmin/help/:id/translations/seed` — **new**: AI-seed the 5 locales as drafts.
- `PUT /api/sysadmin/help/:id/translations/:locale` — **new**: save one locale's fields (draft).
- `POST /api/sysadmin/help/:id/translations/:locale/publish` — **new**: publish a locale (and clear `isstale`).
- Mounted in the existing `routes/help.ts` (reads) and `routes/sysadmin.ts` (admin) routers.

## Frontend Components

- `src/client/pages/SysAdmin/Docs.tsx` — **modified**: locale tab strip (en source + 5 locales), a **Generate translations** button, per-locale draft/published + stale indicators, save/publish per locale.
- `src/client/pages/DocsIndexPage.tsx` — **modified**: append `?locale=<current app locale>` to the `/api/help/docs` fetch.
- `src/client/pages/DocsDetailPage.tsx` — **modified**: append `?locale=` to the `/api/help/docs/:slug` fetch.
- Any other client `/api/help` content fetch — **modified**: append `?locale=`.

## Success Criteria

1. For each of the 6 locales, an item translated into that locale renders its `title`/`summary`/`content` in that locale on `/docs` and `/docs/:slug`, with any untranslated field falling back to English — **zero blank fields** across all locales.
2. Active-locale-wins: a logged-in user whose saved default is English, viewing the UI in Italian, gets Italian help content; explicit `?locale=` overrides the stored preference in 100% of reads.
3. One-click seed: an admin seeds a new item into all 5 non-English locales as editable drafts in a single action; drafts are editable and only go live on publish.
4. A single `seed-help-translations.ts` run drafts translations for all existing untranslated items (26 today) or logs a per-item failure; a second run is idempotent with zero duplicate work without `--force`.
5. Editing English never blocks the save and never changes what end users currently see; affected locales show the stale flag until re-seeded/republished.
6. With no `helptranslations` rows present, every `/api/help/*` read returns the same English result it does today (no regression).

## Key Entities

- **Help item** (`wxkanbanhelp` row) — the canonical en-US content unit (title/summary/content) for a category (`docs`, `cli`, `reference`, `guide`, `faq`). Unchanged by this scope.
- **Help translation** (`helptranslations` row) — a locale-specific version of a help item's title/summary/content, with draft/published and stale state. New in this scope.

## Constraints

- MUST deliver only the behavior within the scope boundary above; the only new persistent objects are the `helptranslations` table and one seed script.
- MUST keep out of scope: the `/help` subscription-aware Help catalog (SCOPE-084, code-based `catalog.ts`, already localized via `getLocalizedHelp`); the marketing FAQ (SCOPE-066, `marketingassets` table); UI-string localization (SCOPE-052, already delivered); auto-publishing machine translations without a human review gate (except explicit force seed); adding a 7th locale (a separate change to the shared supported-locale list); progress/rate-limit/queue machinery for the bulk seed.
- Machine translation is drafts-only; a human gate protects user-facing quality.
- Fail-open everywhere: AI/translation failures never block English authoring or content reads; missing translations degrade to English per field, never to errors.
- Depends on the configured `LLM_PROVIDER`; adds no new external service. Staleness uses a simple `isstale` flag set on English edits (not a per-field source hash).

## Notes

- **Integration context**: Extends the existing `wxkanbanhelp` table, the `/api/help/*` read routes (`routes/help.ts`), the `/api/sysadmin` help/docs admin routes (`routes/sysadmin.ts`), and the `SysAdmin/Docs.tsx` editor. Public read pages `DocsIndexPage.tsx` and `DocsDetailPage.tsx` append `?locale=<current app locale>`. Reuses the app-wide i18n locale set and the configured `LLM_PROVIDER`.
- **Reuse note**: `validatescope` flagged a possible overlap with SCOPE-084 (`help`). Reviewed and confirmed distinct — SCOPE-084 is the code-based subscription-aware Help catalog (already localized); this scope localizes the DB-stored `wxkanbanhelp` content. No conflict.
- **Cost/latency**: trivial at current scale (26 items, ~24K chars ≈ 30K in + 30K out tokens for a full seed); revisit batching only if the catalog grows by an order of magnitude.

## Clarifications

### Session 2026-07-09

| # | Question | Decision |
|---|----------|----------|
| 1 | Authoring model for the 6 languages? | AI-seed then human-edit: admin authors English, AI drafts the other 5 locales as editable drafts, human reviews before publishing. |
| 2 | Storage model? | Separate `helptranslations` table keyed by (`helpid`, `locale`); base `wxkanbanhelp` row stays canonical en-US. |
| 3 | Content boundary? | All `wxkanbanhelp` content across every category, not just `docs` training videos. |
| 4 | Locale resolution order? | Explicit `?locale=` (active view) wins, then auth user's saved language, then `Accept-Language`, then en-US; per-field English fallback. |
| 5 | Staleness behavior? | Editing English flags translated locales stale (non-blocking) and keeps last-published live; admin re-seeds/republishes. |
| 6 | Bulk seed? | Kept as a simple on-demand one-shot script (`--force` to re-seed); no progress/queue machinery given ~26 items. |
