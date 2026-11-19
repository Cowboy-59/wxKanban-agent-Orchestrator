# SCOPE-096: SysAdmin Marketing Feature Snippets Manager

**Scope Number**: SCOPE-096
**Status**: `draft`
**Created**: 2026-07-12
**Last Reviewed**: 2026-07-12 (interactive buildscope — section-by-section, approved through all sections)
**Depends On**: SPEC-048 (`marketingassets` store), SCOPE-064 (sysadmin Marketing hub surfaces), SCOPE-065 (`generateOnce` marketing/Claude override + fail-open pattern), SCOPE-046/051/053 (i18n locale set), the `marketing-feature-set` skill (produces the snippets + billboards this manages), and the landing `FeatureBillboards` carousel.
**Related Scopes**: SCOPE-070 (Banner Studio — banner art), SCOPE-065 (Marketing AI Assist — Translate/Draft).
**Source**: `specs/Project-Scope/096-marketing-feature-snippets.md`

---

## Overview

The marketing feature set — customer-facing snippets derived from the project's scopes and FRs by
the `marketing-feature-set` skill — now exists as `marketingassets` rows (`type=synopsis`, one per
feature, with per-locale variants) and drives the landing-page billboard carousel. What's missing is
a way for a SYSADMIN to **curate** it: today, which snippets are live is decided by a static file,
not managed in the app. This scope adds a **Feature Snippets** surface to the existing sysAdmin
Marketing hub — a list of every feature snippet with a per-row **on/off** toggle that controls whether
it appears on the landing carousel, the snippet's **CTA link** shown inline, and a **language
dropdown** to view each locale's translation. Features still in flux can be **suppressed** (kept off).
New snippets are added by **picking a `Project-Scope` doc and letting AI draft the snippet**, landing
as a `draft` for review before it's toggled on. It reuses `marketingassets` entirely — `status` is
the on/off, locale variants are the translations — so there's no new content store; only a small
sidecar table holds per-snippet config.

## Business Problem

The feature set exists as `marketingassets` rows and drives the landing carousel, but there is **no
in-app way to curate it**. Which snippets are live, how long each shows, whether one is featured, and
what its translations say are all decided by editing `feature-set.json`, regenerating, and
redeploying — a developer task, not a marketing one. In-flux features can't be easily hidden, new
features from real scopes can't be added without the CLI, and there's nowhere to review the
per-language copy before it ships. For a solo/small marketing effort, that file-edit loop is the
bottleneck.

## Actors

- Primary: A SYSADMIN curating the public feature set from the sysAdmin Marketing hub.
- Secondary: The configured LLM provider (Claude via generateOnce) drafting a snippet from a chosen Project-Scope — a non-human generator, never an autonomous publisher.

## Core Design

| Element | SysAdmin Marketing Feature Snippets Manager |
| --- | --- |
| **Primary Actor** | A SYSADMIN curating the public feature set from the sysAdmin Marketing hub |
| **Secondary Actors** | The configured LLM provider (Claude via `generateOnce`) that drafts a snippet from a chosen `Project-Scope` — a non-human generator, never an autonomous publisher |
| **Key Value** | Turn the feature set from a static, developer-edited file into a managed list — toggle on/off, suppress in-flux, set dwell/featured, review translations, and add snippets from scopes — with no JSON edit and no redeploy |
| **Placement** | A new Feature Snippets tab in the existing sysAdmin Marketing hub (alongside Overview, Assets, Posts, Newsletter, Banner Studio) |
| **Boundary — IN** | List snippets; per-row on/off (`status`) governing the landing carousel; inline CTA link; language dropdown; per-snippet dwell + enhanced/featured; add-by-scope; edit/save |
| **Boundary — OUT** | Banner art authoring; in-panel machine translation; static-site deploy; non-feature assets |

## Scope Boundary

### In Scope
- List every feature snippet (`marketingassets`, `type=synopsis`, `assetkey=feature-*`).
- Per-row **on/off** toggle (`status` published/draft) that governs the landing carousel.
- Inline **CTA link** per row.
- Per-row **language dropdown** to view each locale's translation.
- Per-snippet **display duration (dwell)** and **enhanced/featured** flag.
- **Add-by-scope**: pick a `Project-Scope` doc, AI drafts the snippet, lands as a draft.
- **Edit/save** a snippet's copy and CTA.

## Out of Scope
- Authoring/regenerating banner **art** in-panel (marketing-feature-set skill / Banner Studio).
- Machine-translating missing locales in-panel (SCOPE-065 Translate — this panel *views* and may
  *trigger*, but does not reimplement translation).
- Deploying the static marketing sites (`redeploy.ps1`).
- Non-feature marketing assets (posts/pages/videos — already under Assets).
- Drag-reorder polish and A/B testing of snippets (future).

## User Scenarios

### US1 — See and toggle the list
The SYSADMIN opens the Feature Snippets tab and sees every snippet (name, category, rank, on/off, CTA
link, dwell, featured). Toggling one **off** removes it from the landing carousel; **on** brings it
back. **Expected:** the toggle maps to `status` and the change reflects on the landing carousel.

### US2 — Suppress an in-flux feature
A feature still being built is toggled **off** (kept `draft`). **Expected:** off snippets never appear
publicly; nothing is lost — they're just hidden.

### US3 — Review a snippet's translations
The SYSADMIN opens the **language dropdown** and reads that snippet's copy in each locale
(en/fr/de/es/it/pt). **Expected:** every locale variant is shown; any missing translation is flagged.

### US4 — Add a feature from a scope
The SYSADMIN clicks **Add from scope**, picks a `Project-Scope` doc; AI drafts the snippet.
**Expected:** saved as a **draft (off)**, traceable to its source scope, never auto-published.

### US5 — Set dwell + featured
The SYSADMIN sets a snippet's **display duration** and marks it **enhanced/featured**. **Expected:**
the landing carousel honors the longer dwell and the enhanced treatment (zoom + glow).

### US6 — Edit a snippet
The SYSADMIN edits a snippet's copy or CTA and saves. **Expected:** the change persists; nothing
publishes without the explicit save.

### US7 — Non-admin blocked
A non-SYSADMIN cannot reach the tab or its endpoints. **Expected:** 403 on every endpoint; the tab
isn't shown.

### US8 — Zero published snippets (edge)
All snippets are off. **Expected:** the landing carousel renders nothing / hides itself gracefully —
the page never breaks.

## Functional Requirements

### FR-001 — Feature Snippets list
The Marketing hub MUST show a **Feature Snippets** tab listing all snippets (`marketingassets`,
`type=synopsis`, `assetkey=feature-*`) with name, category, rank, on/off, CTA link, dwell, featured.
**Acceptance Criteria:**
- [ ] All snippet rows render; SYSADMIN-only.

### FR-002 — On/off governs the carousel
Each row MUST have a toggle setting `status` (published=on / draft=off); only **published** snippets
appear on the landing carousel.
**Acceptance Criteria:**
- [ ] Toggling off removes it, on restores it, state persists.

### FR-003 — Suppress in-flux
Snippets set **off** MUST stay hidden from all public surfaces until turned on.
**Acceptance Criteria:**
- [ ] An off snippet never renders publicly.

### FR-004 — Inline CTA link
Each row MUST display the snippet's **CTA link**, clickable.
**Acceptance Criteria:**
- [ ] The URL shows and opens in a new tab; an empty CTA shows a clear "none".

### FR-005 — Language dropdown
Each row MUST offer a **language dropdown** to view the snippet's copy in each project locale
(en/fr/de/es/it/pt); missing translations are flagged.
**Acceptance Criteria:**
- [ ] Selecting a locale shows that locale's title/value-prop/benefit; a missing locale is labeled untranslated.

### FR-006 — Per-snippet display duration
Each snippet MUST have an editable **dwell** honored by the landing carousel.
**Acceptance Criteria:**
- [ ] Changing dwell changes how long that billboard shows.

### FR-007 — Enhanced/featured flag
Each snippet MUST have an **enhanced/featured** toggle; featured snippets get the enhanced treatment
(longer dwell + zoom + glow).
**Acceptance Criteria:**
- [ ] Marking featured applies it on the carousel; unmarking reverts.

### FR-008 — Add from scope (AI draft)
The SYSADMIN MUST be able to pick a `Project-Scope` doc and have AI **draft** a new snippet
(name/value-prop/audience/benefit/CTA), saved as a **draft (off)**, traceable to the source scope.
**Acceptance Criteria:**
- [ ] A scope selection yields a reviewable draft, off by default, with source reference; nothing auto-publishes.

### FR-009 — Edit & save
The SYSADMIN MUST be able to edit a snippet's fields (title, value prop, benefit, CTA, audience) and
save.
**Acceptance Criteria:**
- [ ] Edits persist; no publish without explicit save.

### FR-010 — SYSADMIN gating
Every endpoint MUST require `authenticateToken` + `requireSysAdmin`.
**Acceptance Criteria:**
- [ ] Non-SYSADMIN gets 403; the tab is hidden.

### FR-011 — Graceful empty state
With zero published snippets, the landing carousel MUST hide / no-op without breaking the page.
**Acceptance Criteria:**
- [ ] All-off → carousel renders nothing, page intact.

## Data Requirements

- **Reuse `marketingassets`** for copy + on/off: on/off is the `status` of the feature's canonical
  `en-US` synopsis row (`assetkey=feature-<slug>`); locale variants hold the translated copy shown in
  the language dropdown and inherit public visibility from the canonical switch.
- **New sidecar table `marketingfeaturesnippets`** (one row per feature, keyed by `assetkey`):
  `ctaurl` (varchar), `dwellms` (int, default 5000), `enhanced` (bool, default false), `sortorder`
  (int), `sourcescope` (varchar, the `Project-Scope` ref for add-by-scope), `id` (uuid v7),
  `createdat`/`updatedat`.
- Migration via drizzle-kit generate → `pg.Client` transaction apply.

## API Routes

- `GET /api/marketing/feature-snippets` — **public**, published only; per-locale billboard image URLs
  + `dwellMs`, `enhanced`, `ctaUrl`. Replaces the static manifest the carousel reads.
- `GET /api/sysadmin/marketing/feature-snippets` — list (canonical row ⨝ sidecar), SYSADMIN.
- `PATCH /api/sysadmin/marketing/feature-snippets/:assetkey` — toggle `status`, dwell, enhanced, cta,
  sortorder.
- `GET /api/sysadmin/marketing/feature-snippets/:assetkey/translations` — locale variants.
- `POST /api/sysadmin/marketing/feature-snippets/:assetkey` — edit copy.
- `POST /api/sysadmin/marketing/feature-snippets/from-scope` — AI draft from a chosen scope.
- All `/sysadmin/*` behind `authenticateToken` + `requireSysAdmin`; routes via `index.ts → app.ts`.

## Frontend Components

- **New** `src/client/pages/SysAdmin/marketing/FeatureSnippets.tsx` — a tab in the Marketing hub:
  shadcn table with on/off toggle, inline CTA link, language dropdown, dwell input, featured toggle,
  edit modal, and an "Add from scope" scope picker.
- **Modified** landing `FeatureBillboards` component — read the public API instead of the static
  `manifest.json`; honor `dwellMs`/`enhanced`/`ctaUrl` and the graceful empty state.

## Technical Sections

Add-from-scope (`POST /from-scope`) reads `specs/Project-Scope/<scopeId>.md` and calls `generateOnce`
with the marketing (Claude) override — the SCOPE-065 fail-open pattern — to draft the snippet copy,
then inserts a `draft` `en-US` synopsis row + a sidecar row (`sourcescope`). It produces **copy only**;
the billboard art is produced later by the marketing-feature-set skill / Banner Studio. Fail-open: a
model error returns a handled error, saves nothing, is Pino-logged. Conventions: 100% TypeScript (no
`any`/`@ts-ignore`); Pino-only; DB via `src/db/client.ts`; fences by the orchestrator at `implement`.

## Success Criteria

1. **Curate without redeploy** — a SYSADMIN toggles any of the seeded snippets on/off and the landing
   carousel reflects it with no code change or redeploy. *(FR-001–003)*
2. **No silent translation gaps** — for any snippet, all 6 locales are viewable in the dropdown and
   untranslated locales are flagged. *(FR-005)*
3. **Add-from-scope lands as draft** — picking a `Project-Scope` yields a reviewable draft snippet
   (off, source-referenced) in one action; nothing auto-publishes. *(FR-008)*
4. **Locked down** — 100% of endpoints reject non-SYSADMIN with 403. *(FR-010)*

## Open Questions

- Exact public endpoint path and caching strategy for `GET /api/marketing/feature-snippets`.
- Whether on/off cascades to locale rows or governs solely via the canonical `en-US` row.
- Whether billboard image URLs move to S3 for production now, or stay `public/feature-banners/` for now.
- The current Claude model id to pass for `/from-scope`.

## Constraints & Notes

- **Reuse, don't reinvent.** Copy + on/off live in `marketingassets`; the only new persistence is the
  small `marketingfeaturesnippets` sidecar.
- **Human-in-the-loop.** Add-from-scope produces a `draft` (off); nothing auto-publishes.
- **Fail-open AI.** `/from-scope` follows the `BugSuggestionService`/SCOPE-065 fail-open pattern.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`.
- **Prototype already built this session (out-of-band):** the landing `FeatureBillboards` carousel and
  the `display.dwellMs`/`display.enhanced` fields in `feature-set.json` are the working preview; this
  scope formalizes it — API-backed instead of a static manifest, admin-editable instead of JSON.
