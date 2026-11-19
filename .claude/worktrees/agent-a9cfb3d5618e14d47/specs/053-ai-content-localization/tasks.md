# Task Breakdown: AI Content Localization & Cross-Language Review

**Feature**: AI Content Localization & Cross-Language Review
**Spec**: 053
**Date Generated**: 2026-06-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Protected methodology-term list — one shared source consumed by UI layer + kit command prompts | high | todo |
| 2 | T002 `authoredlanguage` column on `projectdocuments` and the feedback table (spec 043) + Drizzle migration | high | todo |
| 3 | T003 Inject `{{language}}` + "methodology terms stay English" instruction into command prompt templates (buildscope, createspecs, feedback) | high | todo |
| 4 | T004 AI generates content in the user's language — web editor path | high | todo |
| 5 | T005 VS Code extension resolves generation language and injects into command templates | high | todo |
| 6 | T006 On-demand translation endpoint (non-destructive, protected terms preserved) | high | todo |
| 7 | T007 "View in your language" affordance on documents whose `authoredlanguage` differs | medium | todo |
| 8 | T008 Supported-language set config + graceful unsupported-language fallback | medium | todo |

## Task Details

### T001 — Protected methodology-term list — one shared source consumed by UI layer + kit command prompts

Define the protected methodology/lifecycle term set (Scope, Stage Gate, Lifecycle Phase, the six phase names, Spec) in **one shared source** so both the UI layer and the kit's command prompt templates consume the same list. Divergence between surfaces would break FR-003 in one of them, so this single source is the foundation T003 and T006 both build on. Implements FR-003.

### T002 — `authoredlanguage` column on `projectdocuments` and the feedback table (spec 043) + Drizzle migration

Add an `authoredlanguage` column to the content-bearing tables that hold generated prose — `projectdocuments` and the feedback table (`feedbacksubmissions`, spec 043) — recording the source-of-truth language each document was authored in. Follow DB conventions (lowercase, concatenated, no underscores; UUID v7 PKs already in place) and auto-generate the Drizzle migration as the **next number after the current head `0030`**. The stored original is never overwritten by a translation; this column is what FR-007 and FR-008 read to detect a cross-language mismatch. Implements FR-007.

### T003 — Inject `{{language}}` + "methodology terms stay English" instruction into command prompt templates (buildscope, createspecs, feedback)

Add `{{language}}` injection plus the "methodology terms stay English" instruction to the kit's command prompt templates (`buildscope`, `createspecs`, feedback). The instruction references the single protected-term source from T001 so the editor/web AI generates in-language prose while keeping the protected terms English. The kit stays a workflow engine — it only injects language into the templates the editor agent follows, it never calls AI itself. Implements FR-003/FR-006.

### T004 — AI generates content in the user's language — web editor path

Wire the web editor generation path so `buildscope`/`createspecs`/feedback produce prose in the user's resolved language preference, methodology terms English, and tag the result with `authoredlanguage` (T002). Generation must work even when UI chrome for that language is not yet authored — content generation is independent of chrome authoring status. The result must be identical to the VS Code path (T005) so the cross-editor parity success metric holds. Implements FR-006/FR-007.

### T005 — VS Code extension resolves generation language and injects into command templates

In the Dev Cockpit extension, resolve the generation language in order: **server preference (via the project token) → `wxkanban.language` setting override → editor locale**, and inject the resolved language into the command templates (T003) the editor agent follows. Add the new `wxkanban.language` setting. The kit stays a workflow engine, not an AI client — it never calls AI for this; it only injects language into the templates. Cockpit chrome localization is deferred. Implements FR-010/FR-006.

### T006 — On-demand translation endpoint (non-destructive, protected terms preserved)

Add a new on-demand translate endpoint — `POST` a document id + target locale, returning an LLM translation with protected terms (T001) preserved in English. The operation is **non-destructive**: it reads the stored original (tagged via `authoredlanguage`) and never mutates it, and it has **no cache in v1** (each reopen re-bills LLM tokens, accepted for simplicity). This is the carve-out from the no-MT-engine rule and must not become a UI-string MT pipeline. Implements FR-008.

### T007 — "View in your language" affordance on documents whose `authoredlanguage` differs

Add a "View in your language" affordance on documents whose `authoredlanguage` differs from the reader's preference, calling the T006 endpoint to render an on-demand translation alongside the preserved original. The stored document must be byte-for-byte unchanged after review, and methodology terms must stay English in both the original and translated views. Implements FR-008.

### T008 — Supported-language set config + graceful unsupported-language fallback

Document and configure the supported AI-language set (French, Spanish, Italian, German, Portuguese) in one place consumed by generation (T004/T005) and translation (T006). Requesting generation or translation in an unsupported language degrades gracefully — falling back to English or warning — rather than silently producing low-quality output. Implements FR-009.
