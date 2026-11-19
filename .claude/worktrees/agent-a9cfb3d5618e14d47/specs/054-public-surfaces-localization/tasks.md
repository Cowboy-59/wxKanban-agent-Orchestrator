# Task Breakdown: Public Surfaces Localization

**Feature**: Public Surfaces Localization
**Spec**: 054
**Date Generated**: 2026-06-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Public surfaces resolve active locale from the user's language preference when logged in, browser `Accept-Language` when logged out | high | todo |
| 2 | T002 Reuse/extend the existing marketing locale-keyed string path (`src/server/lib/marketing-i18n.ts`) for landing + marketing copy — no parallel i18n system | high | todo |
| 3 | T003 en-US per-key fallback on all public pages/assets — never 404 a page or asset on a missing translation | medium | todo |
| 4 | T004 Docs pages localization wiring (the public `/docs` surface follows the same locale resolution + fallback) | medium | todo |

## Task Details

### T001 — Public surfaces resolve active locale from the user's language preference when logged in, browser `Accept-Language` when logged out

Resolve the active locale per request for the public surfaces: when the request is authenticated, drive the locale from the user's stored language preference (spec 051); when logged out, derive it from the browser `Accept-Language` header. The resolved locale is then handed to the marketing locale-keyed string path so every public page renders in one consistent locale. This is the single source of "which locale is active" for landing, marketing, and docs.

### T002 — Reuse/extend the existing marketing locale-keyed string path (`src/server/lib/marketing-i18n.ts`) for landing + marketing copy — no parallel i18n system

Wire the landing page and marketing copy through the existing `src/server/lib/marketing-i18n.ts` locale-keyed structure that scope 045 / spec 046 established, extending it where new keys are needed rather than standing up a second public i18n module. This keeps a single keyed-string surface across all public copy so future translations are authored in one place. No parallel system is introduced.

### T003 — en-US per-key fallback on all public pages/assets — never 404 a page or asset on a missing translation

Guarantee that any missing translation key resolves to its en-US value rather than failing, so no public page or asset ever 404s on a locale gap. Because v1 authors only en-US (framework-only), this fallback is what makes the framework safe to ship before non-English content exists. Apply the same per-key fallback uniformly to landing, marketing, and docs.

### T004 — Docs pages localization wiring (the public `/docs` surface follows the same locale resolution + fallback)

Wire the public `/docs` surface into the same locale resolution (T001) and en-US per-key fallback (T003) used by landing and marketing, so docs pages render in the active locale where authored and fall back gracefully otherwise. Docs reuse the marketing locale-keyed path (T002) rather than introducing their own. A missing docs translation must serve en-US, never a 404.
