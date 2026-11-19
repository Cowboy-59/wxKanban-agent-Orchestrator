# Spec 054: Public Surfaces Localization

## Overview

The public-facing surfaces — the landing page, marketing copy, and the public `/docs` surface — become **locale-aware**. When a user is logged in, these pages render in the user's **language preference**; when a visitor is logged out, they render in the **browser locale** (`Accept-Language`); in both cases missing translations fall back to **en-US**. This capability **reuses the locale-keyed string structure already established by scope 045 / spec 046 marketing** (`src/server/lib/marketing-i18n.ts`) — it does **not** fork a parallel public i18n system. In v1 only en-US is authored (framework-only); non-English public copy lands later as content, with the fallback guaranteeing that a missing translation never 404s a page or asset. Full reviewed scope: `specs/Project-Scope/046-language.md`.

## Business Problem

The public funnel that the French WinDev beachhead first touches — the landing page, marketing copy, and the public docs — is English-only today. The marketing scope (045/046) already built a locale-keyed string structure for marketing copy, but the broader public surfaces and the docs pages aren't yet wired to resolve a user's preference (logged in) or browser locale (logged out), nor to fall back to en-US per key. As the marketing push goes wider, a French prospect lands on English pages with no path to localized content even where copy could be authored — and any future translation gap risks broken pages instead of graceful fallback. wxKanban needs the public surfaces to follow the same locale resolution the rest of the product uses, reusing the marketing i18n path rather than standing up a second one.

## Actors

- Primary: a logged-out prospect or logged-in user viewing the public pages (landing, marketing, docs) — sees those pages in the active locale (their preference when logged in, browser locale when logged out), with en-US fallback.
- Secondary: the wxKanban server (resolves the active locale per request and selects the right keyed strings); the marketing i18n module (`src/server/lib/marketing-i18n.ts`, the reused locale-keyed string path that this spec extends rather than forks).

## Success Metrics

1. A logged-in French user sees the landing page and docs rendered in French where authored, falling back to en-US per key for anything not yet translated.
2. A logged-out visitor sending `Accept-Language: fr` sees French where authored, else en-US — with no parallel i18n system introduced (the marketing locale-keyed structure is reused).
3. No missing translation ever 404s a public page or asset — the en-US per-key fallback always resolves a string.

## Scope Boundary

IN: FR-005 — locale resolution for the public surfaces (landing, marketing) and the public `/docs` surface, following the user's language preference when logged in and the browser `Accept-Language` when logged out, with per-key en-US fallback. Reuses the scope 045 / spec 046 marketing locale-keyed structure (`src/server/lib/marketing-i18n.ts`) rather than forking a parallel public i18n system. v1 authors en-US only (framework-only); the fallback guarantees no page or asset 404s on a missing translation.

## Out of Scope

Authoring the actual non-English public copy (v1 is framework-only; content lands later); the in-app application UI localization framework (→ spec 051); UI string extraction (→ spec 052); AI-generated localized content (→ spec 053); and standing up any **parallel** public i18n system separate from the reused marketing locale-keyed structure.

## Open Questions

None — resolved at buildscope on 2026-06-13 and recorded in `specs/Project-Scope/046-language.md`.

## Functional Requirements

### FR-005 — Public surfaces follow preference

Public surfaces follow preference: landing/marketing/docs render in the user's preference when logged in, browser locale when logged out, with en-US fallback. The locale resolution reuses the scope 045 / spec 046 marketing locale-keyed structure (`src/server/lib/marketing-i18n.ts`) — no parallel public i18n system — and per-key fallback to en-US MUST guarantee that a missing translation never 404s a page or asset.

**Acceptance Criteria**:
- [ ] A logged-in French user sees localized landing/docs (their language preference drives the active locale).
- [ ] A logged-out visitor with `Accept-Language: fr` sees French where authored, else en-US.
- [ ] Locale resolution reuses the scope 045/046 locale-keyed structure (no parallel system).
- [ ] Locale fallback never 404s a page or asset — a missing translation resolves to en-US per key.

## Phase

**Current Phase**: design
**Priority**: medium

## Status

- **Date**: 2026-06-13
- **Phase**: design
