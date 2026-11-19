# Spec 046: Language — Localization Platform (App UI, Public Surfaces, AI Content, VS Code)

**Spec Number**: 046
**Status**: `draft`
**Created**: 2026-06-13
**Last Reviewed**: 2026-06-13 (interactive buildscope — section-by-section, approved through Section 6)
**Depends On**: spec 045 (Marketing — established the locale-keyed public-string pattern this scope reuses; see `src/server/lib/marketing-i18n.ts`), spec 042 (VS Code Dev Cockpit — the extension surface whose generation language this scope wires), spec 043 (User Feedback — content table gains an `authoredlanguage` tag), spec 019 (Agent Orchestrator Kit — command prompt templates gain `{{language}}` injection), spec 025/019 (LLM provider contract — `LLM_PROVIDER` drives AI generation/translation)
**Related Scopes**: ties to the WinDev→AI-dev beachhead (heavily French) — French is the motivating first non-English language.
**Source**: `specs/Project-Scope/046-language.md`

> **Numbering note:** This is the scope-track number `046`. The `specs/046–049` marketing *implementation* specs are a separate track; `createSpecs` from this scope produces specs from the next available number.

---

## Overview

wxKanban becomes **language-aware**. This scope delivers the **localization platform** — the machinery that makes every user-facing surface translatable, with `en-US` authored as the only language in v1 and a guaranteed per-key fallback so a missing translation never blanks, errors, or 404s. It spans four surfaces under one platform:

1. **Authenticated app UI** — a real i18n framework is introduced; all hardcoded user-facing strings are extracted to locale keys. Login and all app text follow the user's preference.
2. **Public landing / marketing / docs** — localizes to the user's preference when logged in, and to browser locale when logged out; builds on the locale-keyed structure already established in scope 045/046 (no parallel system).
3. **AI-generated content** (specs, scopes, feedback, AI output) — produced **natively in the user's language** by the editor/web AI, with **methodology vocabulary kept in English** for teaching. Stored in the **author's language as source of truth (never overwritten)**, and **translated on-demand** when a reviewer with a different preference opens it.
4. **VS Code extension** — the user's server-side Language Preference (read via the project API token, with a VS Code setting override) is **injected into the kit's command prompt templates**, so the editor agent generates in-language. Cockpit chrome localization is deferred.

**Framework-only v1 (accepted half-state):** AI-generated *content* is multilingual immediately, but UI *chrome* stays English under any locale until bundles are authored later. A French user gets French *specs* and an English *interface*. This is a deliberate design point, not a gap.

## Business Problem

The beachhead market — WinDev/PCSoft converts — is heavily French, and the broader target audience spans Spanish, Italian, German, and Portuguese speakers. Today the entire authenticated app is hardcoded English: there is no i18n framework, no per-user language, and no way to deliver the methodology guidance the kit generates in a learner's own language. The only localization that exists is a tiny hand-rolled resolver for ~4 public marketing strings (`src/server/lib/marketing-i18n.ts`). Without a localization platform, the product cannot meet its primary market in its own language, and the educational mission — teaching software vocabulary to career-changers — is gated behind an English-only wall. This scope builds the platform once, correctly, so language becomes a per-user preference rather than a code change.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | A wxKanban user who prefers a non-English language — the French WinDev/PCSoft convert is the motivating case. |
| **Secondary Actors** | **Translator / content author** (supplies authored UI string bundles — a developer/content task in the repo, no in-app SysAdmin tool in v1); **developer** (must keep new user-facing strings locale-keyed); **cross-language reviewer** (reads a document authored in another language); **wxKanban server** (persists preference, serves on-demand translations); **editor AI agent** (generates content in-language). |
| **Key Value** | The app, its public sites, and the methodology guidance it generates can all be delivered in a user's chosen language with no code changes — French-first for the beachhead — while learners still acquire the English software vocabulary the kit teaches. |
| **Selection Model** | **Per-user Language Preference** stored on the User record, seeded from browser locale on first login, editable in profile settings, persisting across sessions and devices. |
| **Translation Policy** | UI chrome = **human-authored** (preserves scope-045/046's no-MT-engine rule). AI content = **AI-native generation** + **on-demand LLM translation for cross-language review** — explicitly *not* the banned general-purpose MT engine. |
| **Supported Languages** | French, Spanish, Italian, German, Portuguese (well-resourced). Lower-resource languages are outside v1 quality guarantees and degrade gracefully. |
| **Scope Boundary** | **IN**: i18n framework + locale layer for the app UI; per-user Language Preference; public-surface localization (reusing 045/046); AI content generated in-language (web + VS Code) with English methodology terms; authoring-language tagging + non-destructive on-demand review translation; VS Code generation-language plumbing; locale-aware date/number formatting; hardcoded-string guardrail. **OUT / later phase**: server-generated **PDF (invoice) + transactional/notification email** localization; **Dev Cockpit chrome** localization; **non-English authored UI bundles**; **translation caching**; an **in-app SysAdmin translation-management UI**; RTL-script support; currency conversion / locale-specific business logic; translating user-authored data (task names, notes). |

---

## User Scenarios

### US1 — A French user switches the app to French (framework demo / happy path)
Élise, a PCSoft convert, opens wxKanban for the first time. Her browser locale (`fr-FR`) seeds her Language Preference; she later confirms it in profile settings. From then on, the login screen, app navigation, buttons, labels, and the public landing/docs all render through the locale layer in her preference. Because v1 ships `en-US` authored only, untranslated strings fall back to English seamlessly — nothing breaks. Protected methodology terms remain English by design.
**Expected:** preference persists across sessions/devices; every user-facing surface resolves through the locale layer; missing keys fall back to en-US silently.

### US2 — AI generates a spec in the user's language (web + VS Code)
Élise runs `buildscope` in VS Code with her preference set to French. The extension reads her server-side Language Preference via the project token, injects it into the command prompt template, and her editor agent produces a scope whose prose is French while methodology terms stay English. The kit validates, fences, and writes it as normal. She gets the same result in the web editor.
**Expected:** generated content is in-language with English methodology terms; the document is stored tagged with its authoring language as the source of truth.

### US3 — A cross-language reviewer reads a French-authored spec
Andy (preference: English) opens the scope Élise authored in French. The system detects the mismatch and renders an on-demand English translation. The stored French original is never altered; Andy's view is a translation convenience. His own contributions follow normal authoring rules (his prose in his language, terms English).
**Expected:** reviewer sees content in their own language; source document unchanged byte-for-byte; methodology terms consistent in both views.

### US4 — Untranslated-language / fallback edge case
A user sets a preference for a language with no authored UI strings yet (e.g. Italian in v1). The app resolves every key, finds no Italian authored string, and falls back to en-US per key — no blank labels, no errors. AI-generated *content* can still be produced in Italian (AI-native), even though the UI *chrome* is not yet authored — demonstrating the clean split between authored chrome and AI content.
**Expected:** per-key fallback guarantees a complete UI; content generation is independent of chrome authoring status.

---

## Functional Requirements

### FR-001 — App UI resolves through a locale layer
All user-facing strings in the authenticated app render through an i18n framework keyed by locale; no user-facing string is hardcoded in new/changed code.
- [ ] An i18n framework is wired into the React app
- [ ] Login screen, navigation, buttons, and labels resolve from locale keys
- [ ] A demo language can be switched and observed changing resolved strings

### FR-002 — Per-key en-US fallback (never breaks)
Any missing locale or missing key falls back to `en-US` per key; the UI is never blank or errored.
- [ ] Selecting a language with zero authored strings renders a complete English UI
- [ ] A locale missing a single key falls back only for that key, not the whole view
- [ ] No console error or 404 occurs on a missing translation

### FR-003 — Methodology vocabulary stays English
A defined set of methodology/lifecycle terms (Scope, Stage Gate, Lifecycle Phase, the six phase names, Spec) is excluded from translation everywhere (UI + AI content).
- [ ] The protected-term set is documented in one shared source
- [ ] These terms appear in English regardless of selected language
- [ ] AI-generated content keeps these terms English

### FR-004 — Per-user Language Preference
Each user has a Language Preference stored on their User record, seeded from browser locale on first login, editable in profile settings, persisting across sessions and devices.
- [ ] First login with `Accept-Language: fr` seeds preference to French
- [ ] Changing preference in settings persists after logout/login on another device
- [ ] Preference drives all four surfaces (app, public, AI content, VS Code)

### FR-005 — Public surfaces follow preference
Landing / marketing / docs render in the user's preference when logged in, and in browser locale when logged out, with en-US fallback.
- [ ] Logged-in French user sees localized landing/docs
- [ ] Logged-out visitor with `Accept-Language: fr` sees French (where authored), else en-US
- [ ] Reuses scope 045/046 locale-keyed structure (no parallel system)

### FR-006 — AI generates content in the user's language
`buildscope`, `createspecs`, feedback, and AI output produce prose in the user's language (methodology terms English), in both the web editor and VS Code.
- [ ] A French user's generated scope has French prose, English methodology terms
- [ ] Same result in web editor and VS Code
- [ ] Generation works even when UI chrome for that language isn't authored yet

### FR-007 — Generated content tagged with authoring language (source of truth)
Generated documents record the language they were authored in; the stored original is never overwritten by a translation.
- [ ] Each generated spec/scope/feedback records its authoring language (`authoredlanguage`)
- [ ] No translation action mutates the stored original

### FR-008 — On-demand translation for cross-language review
When a reviewer whose preference differs from a document's authoring language opens it, an on-demand translation into the reviewer's language is rendered; the original is preserved.
- [ ] English reviewer opening a French doc sees an English rendering
- [ ] The stored document is unchanged after review
- [ ] Methodology terms stay English in both original and translated views

### FR-009 — Defined supported-language set + graceful unsupported handling
The supported AI languages are documented (French, Spanish, Italian, German, Portuguese). An unsupported language degrades gracefully.
- [ ] Supported set is documented in the scope/config
- [ ] Requesting generation in an unsupported language falls back to English (or warns) rather than producing low-quality output silently

### FR-010 — VS Code resolves generation language from server preference
The extension reads the user's server-side Language Preference via the project token, allows a VS Code setting override, and injects the resolved language into the kit's command prompt templates.
- [ ] With no override, extension uses the server preference
- [ ] A `wxkanban.language` setting overrides it per machine
- [ ] The resolved language reaches the command prompt template the editor agent follows

### FR-011 — Locale-aware date/number formatting (display only)
Dates and numbers in the UI format per the active locale; no currency conversion or business-logic change.
- [ ] Dates/numbers render in locale format when language changes
- [ ] No monetary value is converted — only display formatting changes

### FR-012 — Hardcoded-string guardrail
A check flags new user-facing strings that bypass the locale layer, keeping the platform from regressing (consistent with the project's audit-fence discipline).
- [ ] A lint/check identifies hardcoded user-facing strings in new code
- [ ] It can run locally and is documented

---

## Technical Sections

### Data / Schema
- `users.language` — the per-user preferred locale (e.g. `en-US`, `fr-FR`), default `en-US`, browser-seeded on first login. *(FR-004)*
- `authoredlanguage` column on content-bearing tables that hold generated prose — `projectdocuments` and the feedback table (spec 043) — recording the source-of-truth language. *(FR-007)*
- **No translation-cache table in v1** — cross-language review translates on-demand and is not persisted (KISS; revisit later). Schema additions land in the **next migration after the current head (`0030`)**, following DB conventions (lowercase, concatenated, no underscores; UUID v7 PKs).

### API Routes
- Extend the existing **profile/user-update** endpoint to accept/persist `language` (no new preference endpoint). *(FR-004)*
- Extend the existing **profile/me** read so the VS Code extension can fetch the preference via the project token. *(FR-010)*
- New **on-demand translate** endpoint — `POST` a document id + target locale, returns an LLM translation (protected terms preserved), **non-destructive**. *(FR-008)*
- App UI locale bundles are **static client assets** (the i18n framework loads JSON) — no API. Public strings reuse scope 045/046's existing path.

### Frontend Components
- i18n framework **init/provider** + locale-bundle loader (en-US authored). *(FR-001/002)*
- **Language selector** in profile settings. *(FR-004)*
- **"View in your language" affordance** on documents whose `authoredlanguage` differs from the reader's preference. *(FR-008)*
- Locale-aware **date/number formatting** helper (via `Intl`). *(FR-011)*
- The bulk mechanical work: **refactor user-facing strings across the app (65+ components) to the translation hook** — the largest single effort in this scope.

### wxAI Commands / Kit
- Command prompt templates (`buildscope`, `createspecs`, feedback, etc.) gain **`{{language}}` injection + the "methodology terms stay English" instruction**, sharing one **protected-term list** with the UI layer. *(FR-003/006)*

### VS Code Extension
- Resolve generation language = **server preference (via token) → `wxkanban.language` override → editor locale**, injected into command templates. *(FR-010)*
- New `wxkanban.language` setting. Cockpit chrome localization **deferred**. The kit stays a **workflow engine, not an AI client** — it never calls AI for this; it only injects language into the templates the editor agent follows.

---

## Success Criteria

1. **Language switch is observable end-to-end.** A user sets a non-English preference and, on reload, the login screen, app navigation, and public landing/docs all resolve through the locale layer — verifiable by toggling a test locale bundle and seeing strings change. *(FR-001/004/005)*
2. **Fallback never breaks the UI.** Selecting any language with zero authored strings renders a 100% complete English interface with **no blank labels, console errors, or 404s**. *(FR-002)*
3. **Methodology terms stay English everywhere.** Across UI and AI content, every protected term appears in English regardless of selected language — verifiable by generating content in French and grep-checking. *(FR-003)*
4. **AI generates in-language in both editors.** A French user's `buildscope`/`createspecs` output has French prose with English methodology terms, identical between web editor and VS Code. *(FR-006/010)*
5. **Cross-language review is non-destructive.** An English reviewer opens a French-authored document, sees an English rendering, and the stored original is **byte-for-byte unchanged** afterward. *(FR-007/008)*
6. **Preference persists across sessions and devices.** A preference set on one device is in effect after logging in on another. *(FR-004)*
7. **No new hardcoded user-facing strings pass the guardrail.** The check flags a deliberately planted bare string in new code and passes clean code. *(FR-012)*

---

## Constraints & Notes

### Constraints
- **Framework-only v1 (accepted half-state):** only `en-US` UI strings are authored. AI-generated *content* is multilingual immediately, but UI *chrome* stays English under any locale until bundles are authored later. Deliberate design point.
- **No general-purpose machine-translation engine for UI** — preserves scope 045/046's rule. The only LLM translation is (a) AI-native content generation and (b) on-demand cross-language *review* translation. These must not become a UI-string MT pipeline.
- **Supported AI language set:** French, Spanish, Italian, German, Portuguese. Lower-resource languages are outside v1 quality guarantees and degrade gracefully (FR-009).
- **Protected methodology-term set must live in one shared source** consumed by both the UI layer and the kit's command prompts — divergence breaks FR-003 in one surface.
- **Reuse, don't fork:** public surfaces extend scope 045/046's locale-keyed path; no parallel public i18n system.
- **Kit stays a workflow engine, not an AI client:** VS Code generation language works by **injecting `{{language}}` into command prompt templates** — the kit never calls AI itself for this.
- **On-demand translation has no cache (v1):** each reopen re-bills LLM tokens. Accepted for simplicity; revisit if cost/latency warrants.

### Deferred to a later phase of this scope
- Server-generated **PDF (invoice) and transactional/notification email** localization
- **Dev Cockpit chrome** localization
- **Non-English authored UI bundles** (French-first when undertaken)
- **Translation caching**
- **In-app SysAdmin translation-management UI**

### Dependencies
- Existing **profile/me + user-update** endpoints (extended, not replaced)
- **LLM provider contract** (`LLM_PROVIDER`) for AI generation/translation
- Schema additions land in the **next migration after the current head (`0030`)**

### Notes
- **Educational rationale:** English methodology terms are a feature, not a limitation — learners acquire the industry vocabulary the kit teaches while reading guidance in their own language.
- **No SysAdmin/translator actor in v1:** authored translations are a developer/content task in the repo's locale files, not an in-app workflow.
