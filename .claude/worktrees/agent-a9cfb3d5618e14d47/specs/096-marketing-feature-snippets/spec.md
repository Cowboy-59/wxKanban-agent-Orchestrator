# Spec 096: SysAdmin Marketing Feature Snippets Manager

**Spec Number**: 096
**Status**: `draft`
**Source Scope**: `specs/Project-Scope/096-marketing-feature-snippets.md`

---

## Overview

The marketing feature set — customer-facing snippets derived from the project's scopes and FRs by the
marketing-feature-set skill — now exists as `marketingassets` rows (`type=synopsis`, one per feature,
with per-locale variants) and drives the landing-page billboard carousel. This spec adds a Feature
Snippets surface to the existing sysAdmin Marketing hub so a SYSADMIN can curate that set in-app:
per-row on/off (controls the landing carousel), inline CTA link, a language dropdown per row to view
each locale's translation, per-snippet dwell + enhanced/featured, and add-by-scope (AI drafts a snippet
from a chosen Project-Scope, landing as a draft). It reuses `marketingassets` entirely (`status` =
on/off, locale variants = translations); only a small sidecar table holds per-snippet config.

## Actors

- Primary: A SYSADMIN curating the public feature set from the sysAdmin Marketing hub.
- Secondary: The configured LLM provider (Claude via generateOnce) drafting a snippet from a chosen Project-Scope — a non-human generator, never an autonomous publisher.

## Functional Requirements

- FR-001 — Feature Snippets list (SYSADMIN tab listing all snippets with name, category, rank, on/off, CTA, dwell, featured).
- FR-002 — On/off governs the carousel (`status` published/draft; only published show).
- FR-003 — Suppress in-flux (off snippets never render publicly).
- FR-004 — Inline CTA link (clickable; empty shows "none").
- FR-005 — Language dropdown (each locale's copy; missing flagged).
- FR-006 — Per-snippet display duration (dwell, honored by the carousel).
- FR-007 — Enhanced/featured flag (longer dwell + zoom + glow).
- FR-008 — Add from scope (AI drafts a snippet as a draft, off, source-referenced).
- FR-009 — Edit & save (persist snippet fields; no implicit publish).
- FR-010 — SYSADMIN gating (authenticateToken + requireSysAdmin; 403 otherwise).
- FR-011 — Graceful empty state (all-off → carousel no-ops, page intact).

## Data Requirements

- Reuse `marketingassets` for copy + on/off (`status` on the canonical en-US synopsis row `assetkey=feature-<slug>`).
- New sidecar table `marketingfeaturesnippets` (per feature, keyed by `assetkey`): ctaurl, dwellms (int, default 5000), enhanced (bool, default false), sortorder, sourcescope, uuid v7 id, createdat/updatedat.
- Migration via drizzle-kit generate then pg.Client transaction apply.

## API Routes

- `GET /api/marketing/feature-snippets` — public, published only.
- `GET /api/sysadmin/marketing/feature-snippets` — list (SYSADMIN).
- `PATCH /api/sysadmin/marketing/feature-snippets/:assetkey` — toggle status, dwell, enhanced, cta, sortorder.
- `GET /api/sysadmin/marketing/feature-snippets/:assetkey/translations` — locale variants.
- `POST /api/sysadmin/marketing/feature-snippets/:assetkey` — edit copy.
- `POST /api/sysadmin/marketing/feature-snippets/from-scope` — AI draft from a chosen scope.

## Frontend Components

- New `src/client/pages/SysAdmin/marketing/FeatureSnippets.tsx` — Marketing hub tab.
- Modified landing `FeatureBillboards` — read the public API instead of the static manifest.

## Success Criteria

1. Curate without redeploy — a SYSADMIN toggles a snippet on/off and the carousel reflects it in under 5 seconds, no redeploy. (FR-001–003)
2. No silent translation gaps — 100% of the 6 locales viewable per snippet; untranslated flagged. (FR-005)
3. Add-from-scope lands as draft in 1 action; nothing auto-publishes. (FR-008)
4. 100% of endpoints reject non-SYSADMIN with 403. (FR-010)

## Open Questions

- Public endpoint path + caching; on/off cascade vs canonical-only; image URLs S3 vs local; Claude model id for /from-scope.
