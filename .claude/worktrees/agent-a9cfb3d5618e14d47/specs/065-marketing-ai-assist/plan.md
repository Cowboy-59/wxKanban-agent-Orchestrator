# Implementation Plan: Marketing AI Assist

**Feature**: Marketing AI Assist
**Spec**: 065 — [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)
**Scope**: SCOPE-065 — `specs/Project-Scope/065-marketing-ai-assist.md`
**Date**: 2026-06-21

---

## Strategy

One spec, one uniform pattern repeated across six assist actions. ~90% of this is the same shape — a focused system prompt, a strict expected output, JSON-parsed with fence-stripping, fail-open to a handled error, Pino-logged — copied from `BugSuggestionService` (SCOPE-063). The only shared-code change is making the provider per-call overridable so marketing copy uses Claude. No new tables, no background jobs, no IAM. Server-first (provider override → service → routes), then per-surface UI, then env/docs. Each action is independently testable by a SYSADMIN curl/click; a forced model failure proves fail-open.

## Server

**Provider override (the one shared-code change)** — `src/server/ai/llm-provider.ts`:
- Extend `GenerateOptions` with optional `provider?: LlmProvider` and `model?: string`; `generateOnce` uses them when supplied, else the env default (backward-compatible — no existing caller changes). `getProviderModel` already keys off provider, so an explicit `model` simply overrides its return.

**MarketingAIService** — `src/server/services/MarketingAIService.ts`:
- One function per action: `newsletterDraft`, `newsletterImprove`, `newsletterVariants`, `socialCopy`, `seoGenerate`, `seoAudit`, `translateAll`, `repurpose`, `overviewAnalyze`.
- Each mirrors `BugSuggestionService.suggest`: a focused `SYSTEM_PROMPT`, a strict expected JSON shape, `generateOnce(prompt, { systemPrompt, temperature, maxTokens, provider, model })` with the marketing override (`MARKETING_LLM_PROVIDER` default `anthropic`, `MARKETING_LLM_MODEL`), fence-stripped `JSON.parse`, fail-open to `null`/handled error, never throws (FR-001/002).
- Multi-output actions return arrays: `socialCopy` (per channel), `translateAll` (per locale — each locale generated/parsed independently so one failure degrades only that locale, FR-010), `repurpose` (bundle), `newsletterVariants` (list).
- `translateAll` derives its target locales from the project i18n set (fr-FR, de-DE, es-ES, it-IT, pt-BR; en-US source) rather than a hard-coded literal.
- A small soft-throttle helper (in-process per-user/per-action TTL `Map`) gates calls before the model (FR-004).

**Routes** — `src/server/routes/marketingAi.ts`:
- Mounted at `/api/sysadmin/marketing/ai` via `src/server/index.ts → app.ts`, registered **before** the broader `/api/sysadmin/marketing` router (like the newsletter router), behind `authenticateToken` + `requireSysAdmin` (FR-003).
- `POST /newsletter/draft`, `/newsletter/improve`, `/newsletter/variants`, `/social`, `/seo/generate`, `/seo/audit`, `/translate`, `/repurpose`, `/overview/analyze`. Each validates input (zod), applies the throttle, calls the service, returns draft JSON. None save/send/post/deploy (FR-013).
- `seo/audit` accepts pasted HTML; if it fetches a URL, it rejects any host but `windev.wxperts.com` (FR-009, no SSRF).

## Client

UI on the surface each action serves, using the existing `fetch(..., { credentials: "include" })` + `useState` pattern (no TanStack Query in these pages):
- `Newsletter.tsx` — Generate / Improve / Variants controls feeding the subject/body fields.
- Assets/Posts — a "Draft with AI" control with a channel picker → seeds a draft (FR-007).
- An SEO panel (generate + audit) — a section under the marketing hub (no new top-level tab unless it grows).
- Translate / Repurpose actions on copy fields; the translate result shows all 5 locales as individually editable drafts.
- `Overview.tsx` — an Analyze button rendering the AI read + actions, labeled AI-generated (FR-012).
- Every AI output is shown as an editable draft the user must explicitly keep/save through the existing manual paths.

## Environment / Config

- New env: `MARKETING_LLM_PROVIDER` (default `anthropic`), `MARKETING_LLM_MODEL` (a current Claude model id), `ANTHROPIC_API_KEY` if not already set — documented in `.env.example`, set in the App Runner console for prod (`ConfigurationSource: API`).
- No new IAM, no new tables, no background workers.

## Conventions

Routes via `index.ts → app.ts`; DB (if touched) via `src/db/client.ts`; 100% TypeScript (no `any`/`@ts-ignore`); Pino-only; fences written by the orchestrator at `implement`. Nothing pushed until the user says push.

## Verification

1. Build green (client + server).
2. As SYSADMIN, each endpoint returns a sensible draft; a non-SYSADMIN gets 403; a forced model failure (bad key) returns a handled error with a 200-shaped fail-open body and no 5xx; rapid repeats hit the throttle.
3. `translate` returns all 5 locales; killing one locale's parse degrades only that locale.
4. `seo/audit` with a non-windev URL is rejected.
5. No endpoint sends/posts/deploys — outputs are drafts only.
6. `auditfences` exit 0.
