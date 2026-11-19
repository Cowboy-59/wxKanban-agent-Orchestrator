# Bio Translation & AI Provider Choice — Design

**Date:** 2026-07-18
**Area:** SysAdmin → Marketing → Bio (SCOPE-100 founder bio)
**Extends:** SCOPE-100 FR-007 (bio translation fan-out); builds on SCOPE-099 LLM provider portability
**Status:** Design — approved shape, pending written-spec review

## Problem

The founder bio is translated into 5 non-English locales by the **Translate** button in the
Bio editor, and revised by the **Ask the assistant** panel. Both currently route to whatever
provider the server env dictates (`MARKETING_LLM_PROVIDER`, default `anthropic`/Claude; a
groq-only model swap in `translationOpts()`). There is no per-area choice.

Observed: Claude's bio translations read worse than Gemini's for this marketing copy. The
founder wants to **choose the provider** for bio translation/revision, from the providers he
actually has configured, and have that choice **stick** as the default going forward.

## Non-goals

- No change to the global app-wide `LLM_PROVIDER` (that governs all other AI paths).
- No per-press ephemeral override — the choice is a remembered default (one value).
- No change to chunking, `maxTokens`, or the translation prompt. Every provider keeps the
  existing `chunkMarkdown` → `translateMarkdownChunk` path (decision below).
- No `openai-compatible` BYO-endpoint surfacing unless it happens to be fully configured.

## Size check (why chunking is unchanged)

Chunking is a **rate-limit** workaround, not a size one. Each translate call sends one
locale's worth of bio (~5.3K chars ≈ ~1,500–2,000 tokens). Every candidate provider's input
context dwarfs that (Gemini 2.5 Flash ≈ 1M input tokens). The chunker exists only to keep
each call's **output** under the 2048-token cap so Groq's per-minute token budget (12–30K TPM
free tier) isn't burst-exceeded.

Decision: **keep chunk-and-stitch for all providers.** Gemini *could* translate the whole bio
in one call (its 65K output ceiling allows it), which would give marginally better
cross-paragraph coherence — but the proven chunked path already works for every provider with
zero truncation risk, and the founder chose simplicity. Gemini simply does ~2 chunks per
locale. No chunker/`maxTokens` code changes.

## Decision: how the choice reaches the server

**Server-read setting (single source of truth).** The picker's value *is* a persisted
`systemsettings` row. Changing the dropdown writes it immediately (mirrors the existing
Draft/Published control's `setBioStatus`). The `/translate` and `/ai/bio` routes read that row
server-side and resolve routing from it. No provider ever travels in a request body.

Rejected alternative — client sends `{ provider }` in every POST: "remembered default" forces
a storage location anyway, so this only adds payload plumbing on top of the same storage.

## Components

### Storage
One `systemsettings` row:
- `key = "marketing.translationProvider"`
- `value = { provider: LlmProvider }` (jsonb)
- `category = "integrations"`
- **Absent → fall back to the current env default** (`MARKETING_LLM_PROVIDER` via
  `marketingOpts()`), so behavior is unchanged until the founder ever sets it.

Reuses the existing `systemSettings` / `systemSettingsHistory` schema and the write+history
pattern already in `sysadmin.ts` PUT `/settings/:key`.

### Server — `src/server/routes/bioAdmin.ts` (SysAdmin-guarded)
- **`GET /bio/providers`** → `{ available: LlmProvider[], selected: LlmProvider }`.
  - `available` = named providers whose key env is set: `groq` (`GROQ_API_KEY`), `gemini`
    (`GEMINI_API_KEY`), `anthropic` (`ANTHROPIC_API_KEY`); plus `openai-compatible` **only if
    both** `LLM_API_KEY` and `LLM_BASE_URL` are set. No dead options.
  - `selected` = saved setting value, else the env default.
- **`PUT /bio/provider`** — body `{ provider }`. Validate `provider ∈ available` (else 400).
  Upsert the `systemsettings` row + history row (same as the generic settings route). Returns
  `{ ok: true, provider }`.
- **`POST /translate`** — signature unchanged. Internally reads the setting, resolves routing,
  passes it to `translateBioToAllLocales`.

### Routing resolution — `src/server/services/MarketingAIService.ts`
New `translationOptsFor(provider)` generalizing today's `translationOpts()`:
- `groq` → `{ provider, model: TRANSLATION_MODEL }` (keeps the high-TPM llama-4-scout).
- `anthropic` → `{ provider, model: MARKETING_LLM_MODEL || "claude-sonnet-4-6" }`.
- `gemini` / `openai-compatible` → `{ provider }` (preset default model).
- Guard: if the resolved provider has no key configured, fall back to `marketingOpts()`
  (never throw the translate action into a 5xx — the area is fail-open).

Thread an **optional routing override** through the existing functions; omitted preserves
current behavior:
- `translateBioToAllLocales(source, routing?)`
- `translateMarkdown(md, locale, language, routing?)`
- `translateMarkdownChunk(chunk, locale, language, routing?)`
- `translateTitle(title, locale, language, routing?)`
- `bioRevise(current, instruction, routing?)`

### Revise route — `src/server/routes/marketingAi.ts` `POST /ai/bio`
Reads the same `marketing.translationProvider` setting and passes routing to `bioRevise`, so
the assistant honors the same choice as Translate.

### Client — `src/client/pages/SysAdmin/marketing/Bio.tsx`
- On load, `GET /bio/providers` → hold `{ available, selected }` in state.
- A **"Translation & AI provider"** `<select>` next to the Translate button, options =
  `available`, value = `selected`.
- `onChange` → optimistic state update + `PUT /bio/provider` (mirrors `setBioStatus`'s
  immediate single-field write; same 401/403/429 handling). On failure, revert + alert.
- `translate()` and `ask()` are otherwise unchanged — the server reads the choice, so no body
  changes. (Their existing no-body / current-body shapes stay.)

## Data flow

```
Founder picks "Gemini" in the <select>
  → PUT /bio/provider { provider: "gemini" }
      → validate ∈ available → upsert systemsettings[marketing.translationProvider] + history
Founder presses Translate
  → POST /bio/translate
      → read systemsettings[marketing.translationProvider] → "gemini"
      → translationOptsFor("gemini") = { provider: "gemini" }
      → translateBioToAllLocales(source, routing)  [chunked, one locale at a time — unchanged]
Founder presses Ask the assistant
  → POST /ai/bio
      → read same setting → bioRevise(current, instruction, routing)
```

## Error handling
- Unknown/unkeyed provider in `PUT /bio/provider` → 400, setting unchanged.
- Setting present but its provider later loses its key → `translationOptsFor` falls back to
  `marketingOpts()`; translate still runs (fail-open), logged.
- Setting absent → env default. No migration/backfill needed.
- `GET /bio/providers` transient failure → client keeps the Translate button working against
  the server default (picker just doesn't render until it loads), same resilience as `load()`.

## Testing
- Unit: `translationOptsFor` returns the right `{ provider, model }` per provider, and falls
  back when the key is missing.
- Unit: availability helper reflects exactly the env keys present (incl. the
  `openai-compatible` both-vars rule).
- Route: `PUT /bio/provider` rejects an unavailable provider (400) and persists an available
  one (+ history row); `GET /bio/providers` returns available+selected.
- Route: `POST /translate` and `POST /ai/bio` resolve routing from the stored setting (mock
  `generateOnce`, assert the provider it was called with).
- Existing SCOPE-100 bio tests (chunking, locale staleness, 429 backoff) must stay green —
  the chunk path is untouched.

## Governance (wxKanban)
- **Spec-first:** add an FR to SCOPE-100 (`specs/Project-Scope/100-founder-bio-page.md` and/or
  the SPEC folder) capturing "founder-selectable, persisted translation/AI provider" before
  code lands.
- **Fencing:** new/modified top-level units get their `[SCOPE 100 / Tnn]` fences authored
  through `wxkanban-agent implement` — not hand-written. Run `auditfences` before any push.
- **No push** without explicit instruction; commits accrue locally.
```
