---
name: help-catalog
description: Regenerate the wxKanban subscription-aware Help — refresh the deep per-area articles from the current app UI, rebuild the standalone public/help.html, run the tier drift + coverage tests, and optionally refresh the stored doctype='help' doc. Use when the app's pages/controls change, a plan's entitlements change, or the Help reads stale.
---

# help-catalog — Subscription-aware Help

## Overview

Keeps wxKanban's in-product Help truthful and current. The Help documents every app area/feature
and shows its per-plan availability across the four public plans (Single User, Small/Medium
Business, Consultant, Enterprise), driven by **one catalog**.

Two halves, like `dev-plan`: **judgment** (re-read the real UI and update the content so it matches
what's actually on screen) and a **deterministic script** (rebuild the standalone page + run the
tests). This skill is descriptive — it never changes entitlement/gating logic.

**Single source of truth (edit these):**
- `src/shared/help/catalog.ts` — features + per-plan availability (`minPlan`). Authoritative
  customer-facing mapping: **Small Business is the baseline; Time Tracking & Billing, Invoices, and
  Reports are Consultant+**.
- `src/shared/help/articles.ts` — the deep per-area help (overview → what you'll see → controls &
  options → common tasks → tips), grounded in the real page components.
- `src/shared/help/guides.ts` — the quick step list for features with no full UI page.

## Workflow

### 1. Refresh the content (judgment)

Only touch what changed:
- **App UI changed?** Re-map the affected page(s): read the actual React components under
  `src/client/pages/**` (and their imported components), and update that area's entry in
  `articles.ts` so every documented control/button/option matches what's really on screen. Only
  document controls that exist — if the code shows a stub or an unwired button, say so in the
  overview/tips rather than pretending it works. For large sweeps, launch parallel read-only
  explorers (one per area) and merge their findings.
- **A feature was added/removed?** Update `catalog.ts` (add the `HelpFeature` with the correct
  `minPlan`) and give it a `guides.ts` entry (and an `articles.ts` article if it has a UI screen).
- **A plan's entitlements changed?** Update the `minPlan`s in `catalog.ts`. The customer-facing
  mapping is the source of record; if it now disagrees with `TierEnforcementService.TIER_CONFIG`,
  reconcile the code or add an accepted divergence in `src/server/services/helpDrift.ts`.

### 2. Rebuild + verify (deterministic)

From the project root:

```bash
npx tsx scripts/build-help-html.mts                 # rebuild public/help.html from the catalog + articles
npx vitest run tests/unit/helpCatalog.test.ts       # coverage, authoritative availability, drift, guides/articles
```

The test fails on **any** tier drift beyond the two accepted divergences and on any feature missing
a guide or any orphan article — so a green run means the Help is internally consistent.

### 3. (Optional) refresh the stored doc

The persisted `doctype='help'` row is refreshed by the admin endpoint (a **production-DB** write —
do it deliberately): `POST /api/admin/help/regenerate` with `{ "projectId": "<id>" }` as an ADMIN,
or call `regenerateHelpDoc(projectId, userId)` from `src/server/services/HelpGenerator.ts`.

### 4. Deliver

Summarize what changed (areas re-mapped, features/plans updated), confirm the tests are green, and
link the surfaces below.

## Where it shows up

- **In-app** — the **Help** nav item (all tiers) → `/help` (plan-aware feature grid) → `/help/:id`
  (the per-feature "how to use it" page). Defaults the tier selector to the viewer's plan.
- **Standalone** — `public/help.html`, the self-contained public/prospect mirror with the same
  drill-down (served at `/help.html`).
- **Stored doc** — a single canonical `doctype='help'` row (see step 3).

## Conventions to respect

- Truthful only: document real controls; flag stubs/unwired UI instead of inventing behavior.
- The four public plans are shown; the internal FREE tier is not. Small Business is the baseline.
- Descriptive only — never edit `TierEnforcementService`/nav gating to make Help "match"; fix drift
  in the catalog or record it as accepted in `helpDrift.ts`.
- `public/help.html` is generated — never hand-edit it; edit the sources and re-run the script.

## Resources

- `scripts/build-help-html.mts` — catalog + articles → standalone `public/help.html`.
- `tests/unit/helpCatalog.test.ts` — the consistency gate.
- Full reference: CLAUDE.md → "Subscription-Aware Help (SCOPE-084)".
