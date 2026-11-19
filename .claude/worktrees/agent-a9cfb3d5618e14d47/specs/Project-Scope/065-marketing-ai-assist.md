# SCOPE-065: Marketing AI Assist — On-Demand Generation Across the Marketing Dashboard

**Scope Number**: SCOPE-065
**Status**: `draft`
**Created**: 2026-06-21
**Last Reviewed**: 2026-06-21 (interactive buildscope — section-by-section, approved through all six sections)
**Depends On**: SCOPE-064 (marketing hub surfaces — Newsletter composer, Overview rollup, Assets/Posts) and SPEC-048 (`marketingassets` / `campaignposts` draft paths); `src/server/ai/llm-provider.ts` (`generateOnce`, provider-agnostic over `LLM_PROVIDER`); the on-demand fail-open AI-service pattern of `src/server/services/BugSuggestionService.ts` (SCOPE-063); `ANTHROPIC_API_KEY` provisioned (env + App Runner console).
**Related Scopes**: SCOPE-064 built the marketing surfaces; this scope makes each one a generate-and-review workflow instead of a blank page. Posting, ad-buying, video generation (how-to and onboarding videos are now SCOPE-139 (Onboarding Videos); marketing video generation remains deferred), SEO ranking-data, and autonomous/scheduled agents are deferred to their own later scopes.
**Source**: `specs/Project-Scope/065-marketing-ai-assist.md`

---

## Overview

The sysadmin Marketing hub has real surfaces (SCOPE-064: Overview rollup, Leads, Campaigns, Assets, Posts, Newsletter), but all the words in them are still written by hand. This scope adds on-demand AI generation assist throughout those surfaces: a SYSADMIN clicks a button, the server calls the project's LLM (overridden to Claude for marketing-copy quality), and a draft comes back to review, edit, and keep. Nothing the AI produces is published or sent without a person approving it.

The assist actions, all sharing one shape (on-demand, fail-open, human-in-the-loop, no new external dependencies):

- **Newsletter** — draft/improve subject + body, plus subject-line and CTA A/B variants, in the composer.
- **Social copy** — platform-tailored ad and post copy (LinkedIn, X, Facebook, Reddit, YouTube descriptions) with hashtags, seeded into Assets/Posts drafts. Copy only — you paste it; actual posting is out of scope.
- **SEO** — generate meta titles/descriptions, Open Graph tags, and JSON-LD structured data plus keyword-targeted page copy for windev.wxperts.com; and an AI audit of an existing page (fed its HTML) returning scored, concrete fixes.
- **Translation, repurposing & insights** — translate marketing copy into all 5 of the project's non-English locales (French, German, Spanish, Italian, Brazilian Portuguese) in one action; repurpose one source message into all channel formats in one click; and turn the Overview rollup numbers into a written next-best-action analysis.

Explicitly out of this scope, each deferred to its own later scope: actually **posting** to social platforms (external APIs + policy limits), **buying ads** (Ads APIs + real spend), **video generation** (heavy async pipeline; how-to and onboarding videos are now SCOPE-139 (Onboarding Videos); marketing video generation remains deferred), and **SEO tuning with live ranking data** (Search Console integration). SCOPE-065 stays "generation assist."

It reuses the existing server AI plumbing entirely — `generateOnce` in the provider-agnostic `llm-provider.ts`, following the proven on-demand, fail-open, strict-output pattern of `BugSuggestionService` (SCOPE-063). No new AI infrastructure and no background jobs required.

## Business Problem

The marketing surfaces are built, but every newsletter, post, asset, and page is written from a blank page by one person. For a solo/small marketing effort serving a 1000+ audience across multiple channels and languages, that hand-writing is the bottleneck — not the tooling. Three concrete costs follow.

First, **volume and channels**: the same message has to be rewritten for a newsletter, LinkedIn, X, Facebook, Reddit, a YouTube description — each with different length, tone, and hashtag conventions. Doing that by hand for every campaign doesn't scale.

Second, **language**: the beachhead is the WinDev/PCSoft world, much of which is French-speaking. Reaching it well means French copy, and hand-translating every asset is slow and inconsistent.

Third, **discoverability and judgment**: the landing site's SEO (titles, descriptions, structured data) is hand-maintained and easy to neglect, and the Overview rollup shows numbers but not "so what do I do next." Both are exactly the kind of pattern work an LLM does cheaply and well.

The machinery to close all of this already exists in the app — a provider-agnostic LLM helper (`generateOnce`) and a proven on-demand, fail-open AI-service pattern (`BugSuggestionService`). The gap is purely surfacing it: a set of generate-and-review buttons on the marketing surfaces, with a human approving everything before it ships.

### Core Design

| Element | Marketing AI Assist |
| --- | --- |
| **Primary Actor** | A SYSADMIN producing marketing content (newsletters, social copy, SEO, translations) from the Marketing hub |
| **Secondary Actor** | The configured LLM provider (Claude for marketing copy, via the existing `LLM_PROVIDER` abstraction) — a non-human generator, never an autonomous publisher |
| **Key Value** | Turn each marketing surface from a blank page into a draft-and-refine workflow — one click yields a reviewable draft tailored to the channel and language, cutting per-asset authoring cost without ever auto-publishing |
| **Placement** | Assist actions live on the surface they serve — Generate/Improve + variants in the Newsletter composer; Draft-with-AI on Assets/Posts; an SEO panel (generate + audit); a Translate/Repurpose action on copy fields; and Analyze on the Overview tab |
| **Boundary — IN** | AI text generation for newsletter, social copy, SEO meta/structured-data/page copy, page audit, translation, repurposing, and overview analysis; all on-demand, fail-open, human-reviewed; Claude-override for copy; SYSADMIN-gated endpoints reusing `generateOnce` |
| **Boundary — OUT** | Any auto-publishing or auto-sending; social posting; ad buying; video generation (onboarding videos: SCOPE-139); SEO ranking-data integration; background/scheduled autonomous agents; new persistence beyond reusing existing draft tables where one already fits |

---

## User Scenarios

### US1 — Draft or improve a newsletter

In the Newsletter composer, the SYSADMIN clicks Generate (from a short prompt) or Improve (on existing text). A subject + body draft appears in the editable fields.

**Expected:** the draft populates the editable fields; nothing is saved or sent until the SYSADMIN saves the draft as they would manually.

### US2 — Subject-line / CTA variants

From a drafted newsletter, the SYSADMIN asks for alternatives and gets several subject-line and call-to-action options.

**Expected:** a small set of variants is shown; picking one drops it into the field; the rest are discarded (no A/B send machinery — that's a later scope).

### US3 — Platform-tailored social copy

The SYSADMIN enters a message and selects target channels (LinkedIn, X, Facebook, Reddit, YouTube description). Each comes back as channel-appropriate copy with hashtags, seeded into an Asset/Post draft.

**Expected:** one generation yields per-channel copy respecting each channel's length/tone; output is a draft to copy or save, never auto-posted.

### US4 — SEO generation for a page

For a landing page, the SYSADMIN generates meta title/description, Open Graph tags, JSON-LD structured data, and optional keyword-targeted copy.

**Expected:** valid, well-formed metadata and structured data are returned for review; applying them to the live site remains a manual deploy step (out of scope here).

### US5 — SEO audit of an existing page

The SYSADMIN points the audit at a page (its HTML is fetched/pasted); the model returns a scored list of concrete fixes (missing tags, weak titles, thin content, structured-data gaps).

**Expected:** a prioritized findings list; no changes applied automatically.

### US6 — Translate marketing copy into all 5 languages

The SYSADMIN translates a newsletter, post, or page copy; one action returns the copy in all 5 non-English locales (fr-FR, de-DE, es-ES, it-IT, pt-BR).

**Expected:** a faithful, tone-appropriate translation for each of the 5 languages is returned as reviewable drafts alongside the English source; each is individually editable.

### US7 — Repurpose one message into many

From a single source message, the SYSADMIN gets a coordinated set of outputs — newsletter blurb, social posts per channel, a short summary — in one action.

**Expected:** a bundle of channel-formatted drafts, each individually editable, none published.

### US8 — Next-best-action from the rollup

On the Overview tab, the SYSADMIN clicks Analyze; the model receives the rollup numbers and returns a short written read — where things stand and what to do next.

**Expected:** a concise narrative + suggested actions, clearly labeled as AI guidance, computed from the existing Overview data.

### US9 — The model is unavailable or errors

The configured provider key is missing, rate-limited, or returns garbage.

**Expected:** the assist action fails open — a clear "couldn't generate, try again" message, the surface stays fully usable, no half-written content is saved, and the failure is logged (the `BugSuggestionService` pattern). The rest of the dashboard is unaffected.

### US10 — Human approval is always required

No assist action in this scope sends, posts, deploys, or publishes anything.

**Expected:** every AI output lands in an editable draft/field that the SYSADMIN must explicitly save/send/deploy through the existing (SCOPE-064 and site) paths; there is no autonomous publish.

---

## Functional Requirements

### FR-001 — Marketing AI service with Claude override

All assist actions MUST go through a shared marketing-AI service built on the existing `generateOnce`, with the provider overridable to Claude for marketing copy independently of the global `LLM_PROVIDER` default.

**Acceptance Criteria**:

- [ ] A marketing-specific provider/model override is honored (Claude) without changing the app-wide default
- [ ] Falls back gracefully to the configured default if the override isn't available

### FR-002 — Fail-open generation

Every assist action MUST be fail-open: any model error, missing key, timeout, or unparseable output returns a clear error to the caller, saves nothing, and never throws into the surface (the `BugSuggestionService` pattern).

**Acceptance Criteria**:

- [ ] A forced model failure yields a handled "couldn't generate" response, not a 5xx or a broken page
- [ ] No partial/garbage content is persisted on failure; the failure is logged (Pino)

### FR-003 — SYSADMIN gating

Every assist endpoint MUST require `authenticateToken` + `requireSysAdmin`.

**Acceptance Criteria**:

- [ ] Non-SYSADMIN receives 403 on every assist endpoint

### FR-004 — Soft throttle

Assist endpoints MUST be soft-throttled to prevent runaway model spend (per-user/per-surface window, mirroring SCOPE-063's `suggestedat`-style guard).

**Acceptance Criteria**:

- [ ] Rapid repeat calls are rejected/queued by a documented window, not sent straight to the model

### FR-005 — Newsletter draft & improve

The Newsletter composer MUST offer Generate (from a prompt) and Improve (on existing subject/body), returning editable subject + body.

**Acceptance Criteria**:

- [ ] Generate produces a subject + body into the editable fields; nothing is saved or sent automatically
- [ ] Improve refines the current draft without overwriting it until the SYSADMIN accepts

### FR-006 — Subject-line / CTA variants

The composer MUST produce a small set of subject-line and CTA alternatives, selectable into the field.

**Acceptance Criteria**:

- [ ] Multiple variants are returned; selecting one populates the field; unselected variants are discarded

### FR-007 — Platform-tailored social copy

Given a message and selected channels (LinkedIn, X, Facebook, Reddit, YouTube description), the service MUST return per-channel copy with hashtags, seeded into an Asset/Post draft. Copy only — no posting.

**Acceptance Criteria**:

- [ ] Each selected channel returns length/tone-appropriate copy
- [ ] Output lands in an editable draft; nothing is auto-posted

### FR-008 — SEO generation

For a page, the service MUST generate meta title/description, Open Graph tags, JSON-LD structured data, and optional keyword-targeted copy.

**Acceptance Criteria**:

- [ ] Returned metadata and JSON-LD are well-formed and valid
- [ ] Applying to the live site remains a separate manual step

### FR-009 — SEO audit

Given an existing page's HTML, the service MUST return a scored, prioritized list of concrete SEO fixes.

**Acceptance Criteria**:

- [ ] A findings list with severity/priority is returned; no changes are applied automatically

### FR-010 — Translation into all 5 default languages

The service MUST translate marketing copy (newsletter, post, page) into all 5 of the project's non-English locales — fr-FR, de-DE, es-ES, it-IT, pt-BR — in a single action, returned together alongside the English source. The target-language set MUST track the project's i18n locales rather than being hard-coded ad hoc.

**Acceptance Criteria**:

- [ ] One action returns a faithful, tone-appropriate translation for each of the 5 languages; the English source is preserved
- [ ] Each language output is an individually editable draft; a failure for one language degrades that language only (fail-open per FR-002), not the whole set
- [ ] The language set is derived from the project's supported locales (fr-FR, de-DE, es-ES, it-IT, pt-BR)

### FR-011 — Repurposing

From one source message, the service MUST produce a coordinated bundle (newsletter blurb, per-channel social posts, short summary) in a single action.

**Acceptance Criteria**:

- [ ] One call returns multiple channel-formatted drafts, each individually editable; none published

### FR-012 — Overview next-best-action

The Overview tab MUST offer Analyze, feeding the existing rollup data to the model and returning a concise written read + suggested actions, labeled as AI guidance.

**Acceptance Criteria**:

- [ ] Analyze returns narrative + actions computed from the rollup; clearly marked AI-generated

### FR-013 — No autonomous publishing

No assist action in this scope MUST send, post, deploy, or publish; every output MUST land in an editable draft/field requiring explicit human action through existing paths.

**Acceptance Criteria**:

- [ ] No assist endpoint triggers a send/post/deploy; all outputs are drafts pending human action

---

## Technical Sections

### Provider override (the one change to shared AI code)

`generateOnce` today reads the global `LLM_PROVIDER`. Extend `GenerateOptions` with optional `provider?: LlmProvider` and `model?: string`, and have `generateOnce` use those when supplied, falling back to the env default otherwise (backward-compatible — no existing caller changes). The marketing service reads `MARKETING_LLM_PROVIDER` (default `anthropic`) + `MARKETING_LLM_MODEL` and passes them per call, so marketing copy uses Claude without touching the app-wide default. If the override's key is missing, it falls back to the configured default (FR-001).

### Marketing AI service

New `src/server/services/MarketingAIService.ts` — one service, one function per assist action (newsletter draft/improve/variants, social copy, SEO generate/audit, translate, repurpose, overview analysis). Each mirrors `BugSuggestionService`: a focused system prompt, a strict expected output shape, JSON-parsed with fence-stripping, fail-open to `null`/handled-error, Pino-logged, never throws (FR-002). Multi-output actions (social per-channel, repurpose, variants) return arrays.

### Routes

New `src/server/routes/marketingAi.ts` mounted at `/api/sysadmin/marketing/ai` via `index.ts → app.ts` (registered before the broader `/api/sysadmin/marketing` router, like the newsletter router), behind `authenticateToken` + `requireSysAdmin` (FR-003). Endpoints: `POST /newsletter/draft`, `/newsletter/improve`, `/newsletter/variants`, `/social`, `/seo/generate`, `/seo/audit`, `/translate`, `/repurpose`, `/overview/analyze`. All return draft JSON; none save, send, post, or deploy (FR-013).

### SEO audit input

To avoid SSRF, the audit accepts pasted HTML by default; if it fetches a URL server-side, it MUST be restricted to the known marketing domain (`windev.wxperts.com`) — no arbitrary URL fetching.

### Soft throttle

An in-process per-user/per-action window (a small TTL `Map`) rejects rapid repeats before calling the model (FR-004). Note: per-instance only — fine as a cost guard for a single-SYSADMIN, low-volume surface; a shared store is unnecessary at this scale.

### Persistence

Phase 1 needs **no new tables**. Generations return to the client as editable drafts; saving uses the existing SCOPE-064/048 paths (newsletter draft, asset/post create). An optional lightweight generation/cost log is noted as a possible follow-up, not built here.

### Client

Assist UI added to the surfaces it serves, using the existing `fetch(..., { credentials: "include" })` + `useState` pattern (no TanStack Query in these pages): Generate/Improve/Variants in `Newsletter.tsx`; Draft-with-AI (channel picker) in Assets/Posts; an SEO panel (generate + audit) — likely a small section/tab under marketing; Translate/Repurpose actions on copy fields; Analyze on `Overview.tsx`. AI output is always shown as an editable draft the user must explicitly keep.

### Environment / Infra

New env: `MARKETING_LLM_PROVIDER` (default `anthropic`), `MARKETING_LLM_MODEL` (a current Claude model id), and `ANTHROPIC_API_KEY` if not already set — documented in `.env.example`, set in the App Runner console for prod (`ConfigurationSource: API`). No new IAM, no background workers, no new tables.

### Conventions

Routes via `index.ts → app.ts`; DB (if touched) via `src/db/client.ts`; 100% TypeScript (no `any`/`@ts-ignore`); Pino-only; fences written by the orchestrator at `implement`. Nothing pushed until the user says push.

---

## Success Criteria

1. **Every marketing surface has a generate-and-review button.** Newsletter, social copy, SEO, translation/repurpose, and overview analysis each offer an on-demand AI action that returns an editable draft. *(FR-004–012)*
2. **Marketing copy uses Claude.** Assist actions run through the marketing override (`MARKETING_LLM_PROVIDER=anthropic`) without changing the app-wide `LLM_PROVIDER`. *(FR-001)*
3. **Nothing the AI writes ships without a human.** No assist action sends, posts, deploys, or publishes; all output is a draft pending explicit human action. *(FR-013)*
4. **One bad model call never breaks a surface.** A forced failure returns a handled error, saves nothing, logs it, and leaves the dashboard fully usable. *(FR-002)*
5. **Locked down and cost-guarded.** Every endpoint is SYSADMIN-only and soft-throttled against runaway spend. *(FR-003, FR-004)*
6. **No new infrastructure.** Ships on the existing `generateOnce` plumbing — no new tables, background jobs, or IAM. *(Technical Sections)*

---

## Constraints & Notes

### Constraints

- **Reuse, don't reinvent.** Built on `generateOnce` + the `BugSuggestionService` fail-open pattern; the only shared-code change is the optional per-call provider/model override on `GenerateOptions`.
- **Human-in-the-loop, always.** Generation only; publishing/sending stays on the existing manual paths.
- **No arbitrary URL fetching.** SEO audit takes pasted HTML or a fetch restricted to `windev.wxperts.com` (no SSRF surface).
- **Correct plumbing.** Routes via `index.ts → app.ts`; 100% TypeScript; Pino-only; fences by the orchestrator.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`.

### Out of Scope (own later scopes)

- Actually **posting** to social platforms (external APIs + policy limits — the Facebook Groups posting API is gone).
- **Ad buying** (Meta/Google/LinkedIn Ads APIs + real spend).
- **Video generation** (heavy async pipeline, large storage, variable quality). Amendment A (2026-10-18): how-to and onboarding videos are now SCOPE-139 (Onboarding Videos); marketing video generation remains deferred.
- **SEO tuning with live ranking data** (Google Search Console integration).
- **Autonomous/scheduled agents** (compose-and-queue, funnel-watching) — build on these Phase-1 primitives + a mandatory approval gate.

### Dependencies

- SCOPE-064 (Marketing hub surfaces: Newsletter composer, Overview, Assets/Posts) and SCOPE-048 (`marketingassets`/`campaignposts` draft paths); `src/server/ai/llm-provider.ts` (`generateOnce`); `ANTHROPIC_API_KEY` provisioned (env + App Runner console).
- The project's i18n locale set (SCOPE-051/053) — `src/client/i18n/locales/` ships `en-US` (source) + the 5 translation targets `fr-FR`, `de-DE`, `es-ES`, `it-IT`, `pt-BR`. FR-010 derives its target languages from this set.

### Notes

- **Likely fan-out (decided at createSpecs):** probably a single implementation spec — one shared service + one router + per-surface UI — given how uniform the actions are. Confirm at createSpecs.
- **Open items for spec sizing:** the exact current Claude model id for `MARKETING_LLM_MODEL`; whether the SEO panel is a new tab vs. a section; whether to add an optional generation/cost log.
- **Process note:** authored in-conversation via interactive buildscope (the standing workaround while the `buildscope` CLI is broken); implementation routes through `createSpecs` → `implement` per orchestrator-first.
