# SPEC-106: Borrow-a-Look Business Template

Implements SCOPE-106. Extends the already-shipped SCOPE-062 Project Theme with a faithful URL-based look source, business header/footer chrome, and a named reusable template gallery.

## Overview

Add three capabilities to the shipped SCOPE-062 Theme Studio so a customer can turn a website they admire into a branded, reusable look for their generated product. First, a URL source: point at a live site, capture its real rendered styling in a headless browser, and use the LLM to map it onto SCOPE-062's 19 semantic theme tokens plus fonts and radius, clamped to WCAG AA and failing open to the wxKanban default on any error. Second, business chrome: the user authors their own header (logo plus business/app name) and footer line, laid on top of the borrowed look and never derived from the site. Third, a named template gallery: the bundle of borrowed look plus chrome is saved as a named, company-wide template that any project can pick and inherit. Everything is shown WYSIWYG in an expanded control gallery before commit and executes to real artifacts beside the existing stack artifacts. This themes the customer's generated product only; it never re-skins wxKanban.

## Business Problem

A customer's first reaction to a generated product is visual, and they often have a specific site whose look they want to emulate. Today the Theme Studio only lets them cite a gallery screen and have the AI guess a palette, which is lossy and does nothing about their own branding. There is no way to faithfully borrow a real site's colors and control styling, wrap that look in the customer's own header and footer, or save the branded result and reuse it across projects. The result is that the most emotionally important early decision stays weak, and the customer re-does branding work on every new project instead of picking a saved house style.

## Actors

- Primary: The project creator (a member or admin) who wants a branded look drawn from a website they like.
- Secondary: The company admin who curates the shared template gallery (save, rename, delete); the generation pipeline that consumes executed theme and chrome artifacts; the AI extraction service that maps captured styles into semantic tokens.

## Success Metrics

1. Faithful borrow: extracting from 3 real public sites yields, in each case, a complete WCAG-AA-passing light and dark 19-token theme plus fonts and radius whose palette visibly matches the source on spot-check.
2. Never breaks: a forced failure on each path (unreachable URL, Chromium unavailable, AI provider unset) returns a complete default theme with HTTP 2xx and 0 five-hundred responses, and preserves any chrome the user already entered.
3. Own branding: the header renders the user's own logo and business name and the footer renders the user's line, with 0 chrome fields ever populated from the extracted site.
4. Save and reuse: a saved template appears in the company gallery, which holds many entries; a new project that picks it inherits both tokens and chrome in under 2 clicks, and only an admin can rename or delete entries.
5. Never empty: with no project theme and no template selected, resolution falls through to the wxKanban built-in default in 100% of cases.

## Scope Boundary

In scope: a From-a-website source that records provenance on the ProjectTheme; headless capture plus AI mapping to the 19-token set with AA-guard and fail-open; an expanded WYSIWYG control gallery that renders the header and footer in place; business chrome authoring limited to a logo, business/app name, and a footer line; execute that emits header and footer artifacts beside theme.css; a named, multi-entry, company-scoped template gallery with member-save and admin-curate; pick-and-inherit resolution that terminates at the wxKanban default.

## Out of Scope

Reconstructing the admired site's own layout, header, or footer (only color and controls are borrowed); rich chrome such as nav links, multi-column footers, or social icons; per-app-type templates; re-skinning the wxKanban app itself; hot-patching a deployed customer app; and choosing the styling framework, which remains a Stack decision. These are deferred so v1 stays a bounded extension of SCOPE-062 rather than a layout-reconstruction engine.

## Open Questions

1. Does the lightweight static fetch-and-parse fallback tier ship in v1, or is headless-capture-then-default sufficient? To be settled by a short Chromium reliability spike during implementation.
2. If server-side Chromium proves unusable on the App Runner web service, does the capture service move to a separate worker in v1 or later? The capture service is built as an isolated seam so this can be decided after a production spike without changing its interface.

## Functional Requirements

### FR-001 — From-a-website source

The Theme Studio must offer a new source that accepts a website URL and records it as the theme's provenance (source url, sourceRef the URL) on the SCOPE-062 ProjectTheme.

Acceptance Criteria:
- A From-a-website option appears alongside the existing sources (presets, inspiration, build-your-own).
- Submitting a URL starts extraction and, on success, populates a full editable theme.
- The saved theme records source url and the URL as sourceRef.

### FR-002 — Faithful extraction (headless capture plus AI map)

The system must load the URL in a headless browser, capture the page's real rendered styling (computed styles, CSS custom properties, and relevant DOM), and use the LLM via the LLM_PROVIDER dispatch to map it into a complete 19-token set for light and dark plus body and heading fonts and radius.

Acceptance Criteria:
- Extraction of a normal public site yields a complete light and dark 19-token set, fonts, and radius.
- The extracted colors visibly resemble the source site's palette, spot-checked on 2 to 3 real sites.
- Output validates against the existing projectThemeSchema, with no partial or invalid theme.

### FR-003 — AA-guard and fail-open

Every extraction must be clamped to pass WCAG AA on the critical pairs, and any failure (unreachable URL, bot-blocked, Chromium crash, AI error or timeout) must fail open to a safe complete starting theme with no 5xx and without blocking the flow. Business chrome already entered must be preserved across a failed retry.

Acceptance Criteria:
- The returned theme passes the themePassesAA check on the critical pairs.
- A forced failure on each path returns a complete default theme, HTTP 2xx, and a plain could-not-read-that-site message.
- Chrome fields the user entered survive an extraction retry.

### FR-004 — WYSIWYG control gallery

The Studio preview must render a full gallery of real components in the working theme with the header and footer shown in place, updating live on any token change, with a light/dark toggle scoped to the preview.

Acceptance Criteria:
- The gallery shows the full component set plus the header and footer, all in the working theme.
- Any token or chrome edit updates the preview immediately.
- The preview's light/dark toggle is independent of the surrounding app.

### FR-005 — Business chrome authoring

The user must be able to author their own header (a logo and the business/app name) and footer (a footer line), stored as structured data on the theme bundle and never populated from the extracted site.

Acceptance Criteria:
- Header accepts a logo (uploaded or from company.logourl) and an editable business/app name.
- Footer accepts an editable line; both render in the preview styled by the current tokens.
- Chrome is stored structured (no markdown round-trip) and reloads intact.

### FR-006 — Execute chrome to artifacts

Execute must emit real header and footer artifacts styled to the theme, alongside the existing SCOPE-062 theme.css, Tailwind, and shadcn artifacts, materialized beside the stack artifacts for the generation pipeline.

Acceptance Criteria:
- Execute produces downloadable header and footer component artifacts plus the existing theme.css.
- The artifacts are materialized beside the stack artifacts.
- The rendered chrome matches what the preview showed.

### FR-007 — Named, reusable template gallery

A saved template must bundle the look (a ProjectTheme) and the business chrome under a user-given name, stored company-wide with many entries. Any project member may save; an admin may rename and delete; all access is tenant-isolated.

Acceptance Criteria:
- Saving writes one named company template capturing both tokens and chrome.
- The gallery lists multiple named templates; a member can save, only an admin can rename or delete.
- Templates are visible only within the owning company.

### FR-008 — Pick a template and inherit

A project must be able to pick a template from the gallery and inherit both its tokens and its chrome, with resolution that never returns empty: project theme, then company template or default, then wxKanban built-in default.

Acceptance Criteria:
- Picking a template applies its tokens and chrome to the project.
- A project that has picked a template reloads with that look and chrome.
- With no project theme and no template, resolution falls through to the wxKanban default.
