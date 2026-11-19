# Task Breakdown: Marketing AI Assist

**Feature**: Marketing AI Assist
**Spec**: 065
**Date Generated**: 2026-06-21
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Per-call provider/model override on `generateOnce` (`GenerateOptions.provider`/`model`, backward-compatible) | high | done |
| 2 | T002 `MarketingAIService` — all 9 assist functions (fail-open strict-JSON, Claude override) + soft-throttle helper | high | done |
| 3 | T003 `routes/marketingAi.ts` — endpoints, zod validation, throttle, SYSADMIN gating, mount in `app.ts` | high | done |
| 4 | T004 Newsletter UI — Generate / Improve / Variants in `Newsletter.tsx` | high | done |
| 5 | T005 Social copy UI — channel picker (in new AI Studio tab, copy-out) | medium | done |
| 6 | T006 SEO panel UI — generate + audit (in AI Studio tab) | medium | done |
| 7 | T007 Translate (5-locale) + Repurpose UI (AI Studio tab); Overview Analyze button | medium | done |
| 8 | T008 Env vars (`MARKETING_LLM_PROVIDER`/`MARKETING_LLM_MODEL`) in `.env.example` + docs | low | done |
| 9 | T009 (Amendment A) `campaignposts.content` column — schema + migration 0038 + posts route persists content | high | done |
| 10 | T010 (Amendment A) AI service: `campaignGoal` / `postContent` / `layoutAssist` + `/campaign/goal`, `/post/content`, `/layout` endpoints | high | done |
| 11 | T011 (Amendment A) Inline assist UI — Campaigns goal, Posts content (draft/improve/layout), Newsletter layout; shared `aiClient.ts` | high | done |

> **Implementation note:** T005–T007's social/SEO/translate/repurpose tools were built as one new **AI Studio** tab (`AIStudio.tsx`) with copy-to-clipboard output, rather than wedged into the Assets/Posts CRUD pages — simpler, all generators in one place, still human-in-the-loop. Saving directly into an Asset/Post draft is a possible fast-follow.

---

## Task Details

### T001 — Provider/model override on generateOnce
Extend `GenerateOptions` in `src/server/ai/llm-provider.ts` with optional `provider?: LlmProvider` and `model?: string`. `generateOnce` uses the explicit values when present, else the env default (`getProvider()`/`getProviderModel()`). Backward-compatible — no existing caller (BugSuggestionService, overview.ts) changes behavior. *(FR-001)*

### T002 — MarketingAIService
Create `src/server/services/MarketingAIService.ts` with one function per action: `newsletterDraft`, `newsletterImprove`, `newsletterVariants`, `socialCopy`, `seoGenerate`, `seoAudit`, `translateAll`, `repurpose`, `overviewAnalyze`. Each follows the `BugSuggestionService` shape: focused system prompt, strict expected JSON, `generateOnce(..., { provider, model })` with the marketing override (`MARKETING_LLM_PROVIDER` default `anthropic`, `MARKETING_LLM_MODEL`), fence-stripped `JSON.parse`, fail-open to null/handled error, Pino-logged, never throws. Multi-output actions return arrays; `translateAll` iterates the project i18n locales (fr-FR/de-DE/es-ES/it-IT/pt-BR) generating each independently (one locale failing degrades only that locale). Add a small in-process per-user/per-action TTL-`Map` soft-throttle helper. *(FR-001/002/004/005–012)*

### T003 — Newsletter AI routes
Create `src/server/routes/marketingAi.ts` mounted at `/api/sysadmin/marketing/ai` via `src/server/index.ts → app.ts`, registered before the broader `/api/sysadmin/marketing` router, behind `authenticateToken` + `requireSysAdmin`. Endpoints: `POST /newsletter/draft`, `/newsletter/improve`, `/newsletter/variants`, `/social`, `/seo/generate`, `/seo/audit`, `/translate`, `/repurpose`, `/overview/analyze`. Each: zod-validate body, apply the throttle, call the service, return draft JSON. None save/send/post/deploy. `seo/audit` accepts pasted HTML or a `windev.wxperts.com`-restricted fetch (no SSRF). *(FR-003/004/009/013)*

### T004 — Newsletter UI
Add Generate / Improve / Variants controls to `src/client/pages/SysAdmin/marketing/Newsletter.tsx` calling the new endpoints, populating the editable subject/body fields and offering selectable variants. Nothing saved/sent until the SYSADMIN saves the draft. *(FR-005/006/013)*

### T005 — Social copy UI
Add a "Draft with AI" control with a channel picker (LinkedIn/X/Facebook/Reddit/YouTube) to the Assets/Posts surfaces, seeding a draft from the per-channel copy returned by `/social`. *(FR-007/013)*

### T006 — SEO panel UI
Add an SEO panel (a section under the marketing hub) with Generate (meta/OG/JSON-LD/page copy) and Audit (paste HTML or windev URL → scored fixes) calling `/seo/generate` + `/seo/audit`. Output is review-only. *(FR-008/009/013)*

### T007 — Translate / Repurpose / Analyze UI
Add Translate (renders all 5 locales as individually editable drafts) and Repurpose actions on copy fields, and an Analyze button on `src/client/pages/SysAdmin/marketing/Overview.tsx` rendering the AI read + actions labeled AI-generated. *(FR-010/011/012/013)*

### T008 — Env + docs
Add `MARKETING_LLM_PROVIDER` (default `anthropic`), `MARKETING_LLM_MODEL`, and `ANTHROPIC_API_KEY` (if absent) to `.env.example` with comments; document the App Runner console requirement for prod. *(FR-001)*

---

## Notes

- Server-first (T001→T003) is independently verifiable by curl before any UI.
- ~90% of T002 is the repeated `BugSuggestionService` fail-open pattern; the per-action difference is only the prompt + expected shape.
- No new tables, background jobs, or IAM. Saving generated drafts uses the existing SCOPE-064/048 paths.
- Implementation routes through `implement <scope>/<task>`; fences written by the orchestrator only.
