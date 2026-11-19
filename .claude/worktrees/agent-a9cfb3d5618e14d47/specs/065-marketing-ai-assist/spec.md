# Spec 065: Marketing AI Assist — On-Demand Generation Across the Marketing Dashboard

## Overview

On-demand AI generation assist added throughout the sysadmin Marketing hub. A SYSADMIN clicks a button on a marketing surface, the server calls the project's LLM (overridden to Claude for marketing-copy quality), and a draft comes back to review, edit, and keep. Nothing the AI produces is published or sent without a person approving it through the existing manual paths.

This is the single implementation spec for **SCOPE-065**. It covers six generation actions, all sharing one shape (on-demand, fail-open, human-in-the-loop, no external dependencies): newsletter draft/improve + subject-line/CTA variants; platform-tailored social ad/post copy; SEO generation + page audit; translation into all 5 non-English locales; one-source→all-channels repurposing; and an Overview next-best-action analysis. It builds on SCOPE-064 (Newsletter composer, Overview, Assets/Posts surfaces) and reuses the existing server AI plumbing — `generateOnce` in `src/server/ai/llm-provider.ts`, following the on-demand fail-open pattern of `BugSuggestionService` (SCOPE-063). No new tables, background jobs, or IAM. Full reviewed scope: `specs/Project-Scope/065-marketing-ai-assist.md`.

## Business Problem

The marketing surfaces are built, but every newsletter, post, asset, and page is written from a blank page by one person. For a solo/small marketing effort serving a 1000+ audience across multiple channels and languages, that hand-writing is the bottleneck — not the tooling. Three costs follow: **volume/channels** (the same message rewritten for newsletter, LinkedIn, X, Facebook, Reddit, YouTube, each with different conventions), **language** (the WinDev/PCSoft beachhead needs copy in the project's 5 non-English locales, hand-translated today), and **discoverability/judgment** (the landing site's SEO is hand-maintained and the Overview rollup shows numbers but not "what to do next"). The machinery to close all of this already exists — `generateOnce` plus the `BugSuggestionService` fail-open pattern — so the work is purely surfacing it: generate-and-review buttons on the marketing surfaces, with a human approving everything before it ships.

## Actors

- Primary: the SYSADMIN producing marketing content (newsletters, social copy, SEO, translations) from the Marketing hub.
- Secondary: the configured LLM provider (Claude for marketing copy, via the existing `LLM_PROVIDER` abstraction) — a non-human generator, never an autonomous publisher.

## Success Metrics

1. **Every marketing surface has a generate-and-review button:** newsletter, social copy, SEO, translation/repurpose, and overview analysis each offer an on-demand AI action returning an editable draft. *(FR-005–012)*
2. **Marketing copy uses Claude:** assist actions run through the marketing override without changing the app-wide `LLM_PROVIDER`. *(FR-001)*
3. **Nothing the AI writes ships without a human:** no assist action sends, posts, deploys, or publishes; all output is a draft pending explicit human action. *(FR-013)*
4. **One bad model call never breaks a surface:** a forced failure returns a handled error, saves nothing, logs it, and leaves the dashboard usable. *(FR-002)*
5. **Locked down + cost-guarded:** every endpoint is SYSADMIN-only and soft-throttled. *(FR-003/004)*

## Scope Boundary

IN: an optional per-call `provider`/`model` override on `generateOnce` (backward-compatible) read from `MARKETING_LLM_PROVIDER`/`MARKETING_LLM_MODEL` (default `anthropic`); a new `MarketingAIService` with one fail-open, strict-output function per assist action; a new SYSADMIN-gated, soft-throttled `marketingAi.ts` router mounted at `/api/sysadmin/marketing/ai`; assist UI on the Newsletter, Assets/Posts, Overview surfaces plus an SEO panel and Translate/Repurpose actions; translation into all 5 non-English locales derived from `src/client/i18n/locales/`.

## Out of Scope

Any auto-publishing or auto-sending; actually posting to social platforms; ad buying; video generation; SEO tuning with live ranking data (Search Console); background/scheduled autonomous agents; new persistence beyond reusing existing draft tables (no new tables in this spec). Each deferred item is its own later scope.

## Open Questions

- The exact Claude model id for `MARKETING_LLM_MODEL` — defaulted at implement (a current Claude tier), confirmed by Andy.
- SEO panel as a new tab vs. a section under the marketing hub — sized at implement (default: a section/panel, no new top-level tab unless it grows).
- Whether to add an optional lightweight generation/cost log — deferred (default: no, stateless).

## Functional Requirements

### FR-001 — Marketing AI service with Claude override

All assist actions MUST go through a shared marketing-AI service built on `generateOnce`, with the provider overridable to Claude independently of the global `LLM_PROVIDER`. `GenerateOptions` gains optional `provider?`/`model?`; the service reads `MARKETING_LLM_PROVIDER` (default `anthropic`) + `MARKETING_LLM_MODEL`.

**Acceptance Criteria**:
- [ ] A marketing provider/model override is honored (Claude) without changing the app-wide default
- [ ] Falls back to the configured default if the override's key/model is unavailable
- [ ] No existing `generateOnce` caller changes behavior (backward-compatible options)

### FR-002 — Fail-open generation

Every assist action MUST be fail-open: any model error, missing key, timeout, or unparseable output returns a handled error, saves nothing, and never throws into the surface (the `BugSuggestionService` pattern).

**Acceptance Criteria**:
- [ ] A forced model failure yields a handled "couldn't generate" response, not a 5xx or broken page
- [ ] No partial/garbage content is persisted on failure; the failure is logged (Pino)

### FR-003 — SYSADMIN gating

Every assist endpoint MUST require `authenticateToken` + `requireSysAdmin`.

**Acceptance Criteria**:
- [ ] Non-SYSADMIN receives 403 on every assist endpoint

### FR-004 — Soft throttle

Assist endpoints MUST be soft-throttled (per-user/per-action window) to prevent runaway model spend, mirroring SCOPE-063's guard.

**Acceptance Criteria**:
- [ ] Rapid repeat calls are rejected by a documented window before reaching the model
- [ ] The throttle response is a clear 429-style handled result, not an error page

### FR-005 — Newsletter draft & improve

The Newsletter composer MUST offer Generate (from a prompt) and Improve (on existing subject/body), returning editable subject + body.

**Acceptance Criteria**:
- [ ] Generate produces subject + body into the editable fields; nothing saved or sent automatically
- [ ] Improve refines the current draft without overwriting it until the SYSADMIN accepts

### FR-006 — Subject-line / CTA variants

The composer MUST produce a small set of subject-line and CTA alternatives, selectable into the field.

**Acceptance Criteria**:
- [ ] Multiple variants returned; selecting one populates the field; the rest are discarded

### FR-007 — Platform-tailored social copy

Given a message and selected channels (LinkedIn, X, Facebook, Reddit, YouTube description), the service MUST return per-channel copy with hashtags, seeded into an Asset/Post draft. Copy only — no posting.

**Acceptance Criteria**:
- [ ] Each selected channel returns length/tone-appropriate copy
- [ ] Output lands in an editable draft; nothing is auto-posted

### FR-008 — SEO generation

For a page, the service MUST generate meta title/description, Open Graph tags, JSON-LD structured data, and optional keyword-targeted copy.

**Acceptance Criteria**:
- [ ] Returned metadata and JSON-LD are well-formed/valid
- [ ] Applying to the live site remains a separate manual step

### FR-009 — SEO audit

Given an existing page's HTML, the service MUST return a scored, prioritized list of concrete SEO fixes. Input is pasted HTML, or a fetch restricted to `windev.wxperts.com` (no arbitrary URL fetch — no SSRF).

**Acceptance Criteria**:
- [ ] A findings list with severity/priority is returned; no changes applied automatically
- [ ] URL fetch (if used) rejects any host other than `windev.wxperts.com`

### FR-010 — Translation into all 5 default languages

The service MUST translate marketing copy (newsletter, post, page) into all 5 non-English locales — fr-FR, de-DE, es-ES, it-IT, pt-BR — in a single action, returned together alongside the English source. The target set MUST be derived from the project's i18n locales, not hard-coded ad hoc.

**Acceptance Criteria**:
- [ ] One action returns a faithful, tone-appropriate translation for each of the 5 languages; the source is preserved
- [ ] Each language is an individually editable draft; a failure for one language degrades that language only (per FR-002), not the whole set
- [ ] The language set derives from the project's supported locales (`src/client/i18n/locales/`)

### FR-011 — Repurposing

From one source message, the service MUST produce a coordinated bundle (newsletter blurb, per-channel social posts, short summary) in a single action.

**Acceptance Criteria**:
- [ ] One call returns multiple channel-formatted drafts, each individually editable; none published

### FR-012 — Overview next-best-action

The Overview tab MUST offer Analyze, feeding the existing rollup data to the model and returning a concise written read + suggested actions, labeled as AI guidance.

**Acceptance Criteria**:
- [ ] Analyze returns narrative + actions computed from the rollup; clearly marked AI-generated

### FR-013 — No autonomous publishing

No assist action MUST send, post, deploy, or publish; every output MUST land in an editable draft/field requiring explicit human action through existing paths.

**Acceptance Criteria**:
- [ ] No assist endpoint triggers a send/post/deploy; all outputs are drafts pending human action

---

## Amendment A — Inline assist on Campaigns & Posts (2026-06-21)

Added at Andy's request: AI assist embedded directly on the Campaigns and Posts tabs (not only the AI Studio), plus a layout assist on the Newsletter. Posts previously stored no copy, so this also gives posts a persisted `content` field.

### FR-014 — Persisted post content

`campaignposts` MUST gain a nullable `content` column; the Posts form MUST expose it and the create/update routes MUST persist it.

**Acceptance Criteria**:
- [ ] `campaignposts.content` exists (migration 0038, idempotent) and round-trips through POST/PATCH `/posts`

### FR-015 — Inline campaign-goal assist

The Campaigns editor MUST offer AI generate (from name + segment) and improve for the campaign **Goal** field.

**Acceptance Criteria**:
- [ ] Generate/Improve populate the Goal field; nothing saved until the user saves

### FR-016 — Inline post wording + layout assist

The Posts editor MUST offer AI draft (channel + campaign context), improve, and **layout** for the post content. Layout = reformat the copy for the channel **and** return structure notes (the "Both" choice).

**Acceptance Criteria**:
- [ ] Draft/Improve populate the content field; Layout reformats it and shows structure notes
- [ ] Output is a draft on the post; nothing is auto-posted

### FR-017 — Newsletter layout assist

The Newsletter composer MUST offer a layout action that reformats the body as clean email HTML and returns structure notes.

**Acceptance Criteria**:
- [ ] Layout reformats the body and shows structure notes; the user still saves/sends manually

**Technical note:** new service functions `campaignGoal` / `postContent` / `layoutAssist` (same fail-open + Claude-override shape) behind `POST /api/sysadmin/marketing/ai/{campaign/goal,post/content,layout}`; `layout` is shared (channel `email` for the newsletter, the post channel otherwise). A shared client helper `aiClient.ts` backs the inline buttons.
