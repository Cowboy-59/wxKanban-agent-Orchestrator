# Spec 053: AI Content Localization & Cross-Language Review

## Overview

This spec delivers the **AI-native content** slice of the localization platform: the methodology guidance the kit generates — scopes, specs, feedback, and AI output — is produced **natively in the user's language**, with **methodology vocabulary kept in English** for teaching, in **both the web editor and VS Code**. The user's language preference drives generation in both surfaces; in VS Code the resolved language is injected into the kit's command prompt templates so the editor agent generates in-language (the same small generation-language piece is folded in here because it shares the command-template-injection mechanism). Every generated document is **tagged with its authoring language as the source of truth**, and that stored original is never overwritten by a translation.

When a reviewer whose preference differs from a document's authoring language opens it, an **on-demand, non-destructive LLM translation** into the reviewer's language is rendered for review — the stored original stays byte-for-byte unchanged, and methodology terms stay English in both views. This is the carve-out from scope 046's no-MT-engine rule: UI chrome remains **human-authored** (no general-purpose machine-translation engine for the interface), and the ONLY LLM translation permitted is (a) AI-native content generation and (b) on-demand cross-language review translation. These must never become a UI-string MT pipeline. On-demand translation has **no cache in v1** — each reopen re-bills LLM tokens, accepted for simplicity. Full reviewed scope: `specs/Project-Scope/046-language.md`.

## Business Problem

The beachhead market — WinDev/PCSoft converts — is heavily French, and the broader target audience spans Spanish, Italian, German, and Portuguese speakers. Learners need the methodology guidance the kit generates delivered in their own language to follow the lifecycle from zero to release, but the educational mission also requires that they acquire the English software vocabulary the industry uses — so methodology terms must stay English even inside otherwise-localized prose. Separately, cross-language teams must be able to review each other's specs: an English-preference reviewer needs to read a French-authored scope without altering the source of truth. Without AI-native in-language generation and non-destructive cross-language review, the methodology guidance is gated behind an English-only wall and cross-language collaboration is impossible.

## Actors

- Primary: A wxKanban user generating or reading content in their language — the French WinDev/PCSoft convert is the motivating case — who runs `buildscope`/`createspecs`/feedback (web or VS Code) and gets in-language prose with English methodology terms.
- Secondary: the **cross-language reviewer** (reads a document authored in another language and triggers on-demand translation); the **editor AI agent** (generates content in-language following the injected command template); the **wxKanban server** (persists `authoredlanguage`, serves on-demand translations, resolves the generation language); and **the kit** (injects `{{language}}` into command prompt templates — a workflow engine, never an AI client for this).

## Success Metrics

3. **Methodology terms stay English everywhere.** Across UI and AI content, every protected term (Scope, Stage Gate, Lifecycle Phase, the six phase names, Spec) appears in English regardless of selected language — verifiable by generating content in French and grep-checking the protected-term set.
4. **AI generates in-language in both editors.** A French user's `buildscope`/`createspecs` output has French prose with English methodology terms, identical between the web editor and VS Code.
5. **Cross-language review is non-destructive.** An English reviewer opens a French-authored document, sees an English rendering, and the stored original is **byte-for-byte unchanged** afterward.

## Scope Boundary

IN: the six FRs below — FR-003 (methodology vocabulary stays English via one shared protected-term source consumed by UI + kit prompts); FR-006 (AI generates content in the user's language in web editor AND VS Code, methodology terms English, even when UI chrome for that language isn't authored); FR-007 (generated content tagged with `authoredlanguage` as source of truth, never overwritten by a translation); FR-008 (on-demand non-destructive translation for cross-language review); FR-009 (defined supported-language set — French, Spanish, Italian, German, Portuguese — with graceful unsupported handling); FR-010 (VS Code resolves generation language from server preference via project token, with a `wxkanban.language` override, injected into the kit's command prompt templates). The kit stays a workflow engine, not an AI client.

## Out of Scope

A general-purpose UI machine-translation engine (preserves scope 045/046's no-MT-engine rule — the interface is human-authored); translation caching (each reopen re-bills LLM tokens in v1); authored non-English UI string bundles and the i18n framework / locale layer (the app-UI surface, owned by specs 051/052); the per-user Language Preference itself and the locale layer it rides on (spec 051 — this spec is BLOCKED BY it); server-generated PDF (invoice) and transactional/notification email localization; Dev Cockpit chrome localization; locale-aware date/number formatting (display-only, owned elsewhere); the hardcoded-string guardrail (UI surface); an in-app SysAdmin translation-management UI; RTL-script support; translating user-authored data (task names, notes).

## Open Questions

None — buildscope 2026-06-13. The no-cache decision and the methodology-terms-stay-English decision are locked, as is the carve-out that the only LLM translation is AI-native generation + on-demand review (never a UI-string MT pipeline).

## Functional Requirements

### FR-003 — Methodology vocabulary stays English

A defined set of methodology/lifecycle terms (Scope, Stage Gate, Lifecycle Phase, the six phase names, Spec) is excluded from translation everywhere (UI + AI content).

**Acceptance Criteria**:
- [ ] The protected-term set is documented in one shared source
- [ ] These terms appear in English regardless of selected language
- [ ] AI-generated content keeps these terms English

### FR-006 — AI generates content in the user's language

`buildscope`, `createspecs`, feedback, and AI output produce prose in the user's language (methodology terms English), in both the web editor and VS Code.

**Acceptance Criteria**:
- [ ] A French user's generated scope has French prose, English methodology terms
- [ ] Same result in web editor and VS Code
- [ ] Generation works even when UI chrome for that language isn't authored yet

### FR-007 — Generated content tagged with authoring language (source of truth)

Generated documents record the language they were authored in; the stored original is never overwritten by a translation.

**Acceptance Criteria**:
- [ ] Each generated spec/scope/feedback records its authoring language (`authoredlanguage`)
- [ ] No translation action mutates the stored original

### FR-008 — On-demand translation for cross-language review

When a reviewer whose preference differs from a document's authoring language opens it, an on-demand translation into the reviewer's language is rendered; the original is preserved.

**Acceptance Criteria**:
- [ ] English reviewer opening a French doc sees an English rendering
- [ ] The stored document is unchanged after review
- [ ] Methodology terms stay English in both original and translated views

### FR-009 — Defined supported-language set + graceful unsupported handling

The supported AI languages are documented (French, Spanish, Italian, German, Portuguese). An unsupported language degrades gracefully.

**Acceptance Criteria**:
- [ ] Supported set is documented in the scope/config
- [ ] Requesting generation in an unsupported language falls back to English (or warns) rather than producing low-quality output silently

### FR-010 — VS Code resolves generation language from server preference

The extension reads the user's server-side Language Preference via the project token, allows a `wxkanban.language` setting override, and injects the resolved language into the kit's command prompt templates.

**Acceptance Criteria**:
- [ ] With no override, the extension uses the server preference
- [ ] A `wxkanban.language` setting overrides it per machine
- [ ] The resolved language reaches the command prompt template the editor agent follows

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-06-13
- **Phase**: design
