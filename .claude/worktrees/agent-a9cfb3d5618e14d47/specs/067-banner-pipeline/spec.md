# Specification: Banner Studio — Pipeline & Data Foundation

**Spec**: 067
**Feature**: Banner Studio — Pipeline & Data Foundation
**Status**: planned
**Phase**: design → implementation
**Created**: 2026-06-24
**Scope**: [`specs/Project-Scope/070-banner-studio.md`](../Project-Scope/070-banner-studio.md)
**Depends on**: SCOPE-046/048 (`marketingassets` + `src/server/lib/marketing-assets-s3.ts`), SCOPE-065 (`src/server/ai/llm-provider.ts`, `MarketingAIService` throttle/fail-open), Puppeteer (`src/server/services/MarkdownPdfRenderer.ts`)
**Part of**: SCOPE-070 fan-out — **SPEC-067 (this — pipeline & data)** → SPEC-068 (tracking & redirect) → SPEC-069 (export, embed & UI)

> **Numbering note:** this is **SPEC-067** (implementation spec, next free spec-folder number after 066). It is a different artifact from **SCOPE-067** (the subscription-lifecycle *scope* doc) — they collide only as integers, per the documented SCOPE/SPEC namespace detachment.

---

## Summary

The data + server foundation for Banner Studio: the three tables, the AI image-generation provider, the composite render service, the S3 storage helper, and the SysAdmin admin routes that create a banner, generate its background, and render it to a PNG. This spec gets a banner from *prompt + copy* to a *stored, on-brand PNG with a linked tracked-link row* — but the redirect/click behaviour of that link (SPEC-068) and the export/embed/UI surfaces (SPEC-069) are separate specs that build on this one.

Reuse-heavy: Puppeteer is already used for PDF rendering (swap `.pdf()`→`.screenshot()`); the S3/CloudFront presign lib already stores marketing binaries (add a direct server-side put); the SCOPE-065 provider/throttle pattern is the template for the image provider. The genuinely new pieces are the image provider, the render service, and three tables — one of which (`marketinglinks`) is the foundation the tracking spec builds on.

This spec ships the backend pipeline only — **no UI** (that's SPEC-069). It is exercised/verified via direct API calls.

## Requirements (from SCOPE-070)

- **FR-001** — Create a banner draft (title, size preset, prompt, headline, sub-line, CTA, destination URL, optional colour overrides); a tracked `marketinglinks` row is created/linked; width/height frozen from the preset.
- **FR-002** — List banners (filter status/campaign/segment/preset) and open one to edit any field.
- **FR-003** — Delete/archive a banner; a deleted banner leaves its tracked link intact.
- **FR-004** — Choosing a preset freezes width/height at create from a preset map.
- **FR-005** — Optional campaign link + segment + slot tags.
- **FR-006** — Generate a background from the prompt via the configured image provider (default Gemini Imagen); store it.
- **FR-007** — Auto-wrap the prompt with a fixed brand-style instruction (palette, "no text", reserve negative space).
- **FR-008** — Generation is throttled and fail-open (provider error / content-filter refusal → handled result, logged, no partial save, tab stays usable).
- **FR-009** — Re-roll the background without touching overlay copy.
- **FR-010** — Render: composite overlay (headline/sub/logo/CTA) over the background into a PNG at the preset size.
- **FR-011** — Render is a separate action from generation (no provider call on render).
- **FR-012** — Store the PNG and update `renderedurl` with a new **versioned** key each render (no stale cache).
- **FR-013** — Layout chosen from fixed archetypes (hero/horizontal/vertical) matched to the preset shape; legible at size.
- **FR-014** — Each banner has a tracked link with a short, opaque, non-enumerable `code` and a stored destination (the link **row + code** are created here; the redirect that consumes them is SPEC-068).

## Acceptance

The SCOPE-070 Success Criteria #1 and #2 are the bar for this spec, plus the data foundation for the rest:

1. A banner goes **create → generate → render** and yields an on-brand, legible PNG at the chosen preset, stored in S3/CloudFront with `renderedurl` set. *(FR-001, FR-006, FR-010, FR-013)*
2. Generate and render are decoupled — re-rendering text makes **no** image-model call; a forced generation failure is fail-open and logged, saving nothing partial. *(FR-008, FR-009, FR-011)*
3. The three tables exist with the SCOPE-070 columns/indexes and are exported from `src/db/schema/index.ts`; a banner-create writes a linked `marketinglinks` row with a unique non-enumerable `code`. *(FR-001, FR-014)*
4. A second render of the same banner produces a **distinct** `renderedurl` (versioned key). *(FR-012)*

## Out of Scope (other specs)

- `/r/:code` redirect, click recording/counting, bot exclusion, links CRUD, Overview rollup → **SPEC-068**.
- Export endpoints, public on-site read, Banner Studio UI/tab → **SPEC-069**.
- Transitions / animated GIF / multi-frame → **Phase 2** (the `frames` jsonb column is created here, empty).

## Open Items to confirm at implement

- **`GEMINI_API_KEY` provisioned in the App Runner console** — wired in code, but env lives in AWS; confirm before the generate path is exercised against prod.
- **Puppeteer/Chromium launches in the deployed container** — proven locally via `MarkdownPdfRenderer`; verify in the App Runner image (headless fonts + logo network-load).
- Destination **host allowlist** validator is introduced with links CRUD in SPEC-068, but banner-create here also writes a destination — this spec adds the shared validator helper so both call sites use it.
