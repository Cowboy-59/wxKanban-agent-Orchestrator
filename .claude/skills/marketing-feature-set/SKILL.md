---
name: marketing-feature-set
description: Turn the project's own scopes and specs into a ranked, customer-facing marketing feature set AND the assets to sell it. Reads specs/Project-Scope/*.md and specs/main/spec.md (the 82 FRs), clusters them into user-facing features (name, value prop, audience, benefit), scores each for "biggest bang" so the strongest lead, then emits: a catalog (marketing/feature-set.md + PDF); marketingassets DB records the in-app Marketing AI Assist (SCOPE-065) consumes; a billboard-sized banner per feature (brand overlay via resvg, optional uploaded/AI background) plus a flipping landing-page carousel; and per-channel, multi-language social post drafts. Use when asked to build a feature set / feature catalog / benefit sheet, prioritize features by impact, generate landing-page banners or a rotating hero, or prep features for social/multi-language marketing — all derived from the scopes/specs.
---

# Marketing Feature Set

## Overview

One pipeline from "what the specs say we built" to "the assets that sell it." It reads the project's
own scopes and FRs, distills them into the ~15–25 capabilities a *buyer* cares about, ranks them so
the strongest lead, and produces every downstream asset:

1. **Derive** — read scopes + FRs, cluster into user-facing features (judgment).
2. **Rank** — score each feature for "biggest bang"; let the user reprioritize (judgment + rubric).
3. **Catalog** — `marketing/feature-set.md` + a print-ready PDF (deterministic render).
4. **Seed the marketing engine** — upsert each feature into `marketingassets` (drafts) so SCOPE-065's
   Draft-with-AI / Translate / Repurpose actions work *from* them (deterministic, gated).
5. **Banners** — a billboard-sized banner per feature (brand overlay over an optional uploaded/AI
   image), plus a **flipping** landing-page carousel that rotates through them (deterministic render).
6. **Social + languages** — per-channel post drafts and language variants, ready to translate and push.

The `marketing/feature-set.md` + `.json` pair is the **source of truth**; the PDF, DB rows, banners,
and carousel are all *renders* of it — re-run a script after editing to refresh any of them.

What it does **not** do: write final marketing copy (SCOPE-065 generates that on demand), auto-post to
social platforms (out of scope in SCOPE-065 — it prepares copy + images you push, or hand to the
platform automation skills), edit specs, or change product code. Every DB row it writes is `status='draft'`.

## Workflow

### 1. Read the sources (judgment)

Derived from **scopes + specs only** (fast, authoritative — reflects intent):

- `specs/main/spec.md` — Overview, Core Value, and the numbered **FR-###** requirements (ground truth).
- `specs/Project-Scope/*.md` — each scope's **Overview**, **Key Value** / Business Problem, and
  **User Scenarios**. The `Key Value` line and US titles are the richest raw material for a value prop.

For a large set, launch parallel read-only Explore agents (one over the FRs, a few partitioning the
~70 scope files); collect just the conclusions. **Exclude internal-only scopes** (kit tooling, token
efficiency, numbering fixes, orchestrator plumbing) — the exclusion list is in
`references/marketingassets-mapping.md`. Keep anything a user or buyer would see or benefit from.

### 2. Cluster into user-facing features (judgment)

Collapse many FRs/scopes into one feature per customer-visible capability (all the PM-connector FRs →
**one** "Unified Task Aggregation," not one per connector). Aim for **15–25** features. Every feature
must trace to ≥1 scope or FR (record it in `sourceRefs`) — do not invent capabilities the specs don't
support. Write the four marketing fields per feature (vocabulary in `references/marketingassets-mapping.md`):
`name` (benefit-flavored, customer-facing), `valueProp` (one present-tense sentence), `audience`
(`windev` · `careerchanger` · `broad`), `benefit` (outcome/pain removed).

### 3. Rank for "biggest bang" (judgment + rubric)

Score every feature with the four-axis rubric in **`references/ranking-rubric.md`** (reach ×
differentiation × pain-urgency × proof-now, 1–5 each). Sort by score to set `rank`. Then **surface the
top of the ranking to the user and let them reprioritize** — the score is a starting point, not a
verdict; the user may know a feature lands better with the target segment than the rubric predicts.
Record any manual bump in `priorityOverride` with a one-line reason. The rank drives which features
lead the catalog and which billboards appear first in the flipping carousel.

### 4. Write the catalog + JSON

Write **two files**, following the skeleton + the full JSON schema in
**`references/catalog-template.md`** exactly:

- `marketing/feature-set.md` — human-readable catalog, ordered by rank, grouped by product area, one
  block per feature, provenance footnoted. The editable source of truth.
- `marketing/feature-set.json` — the structured mirror every script consumes (features, impact scores,
  banner text, per-locale variants, social channels). Keep the two in sync.

Slugs must be stable kebab-case — they become the `assetkey` (`feature-<slug>`) and the banner
filenames, so a changed slug orphans the old asset/banner instead of updating it.

### 5. Render the catalog PDF (deterministic)

```bash
node .claude/skills/marketing-feature-set/scripts/build-catalog-pdf.mjs
```

Writes `marketing/feature-set.pdf` (offline; resolves `marked` + `puppeteer` from the project). Optional
args override in/out paths.

### 6. Generate banners + the flipping carousel (deterministic)

```bash
node .claude/skills/marketing-feature-set/scripts/generate-banners.mjs           # all features + locales
node .claude/skills/marketing-feature-set/scripts/generate-banners.mjs --slug X  # one feature
```

For each feature × locale × preset it renders a PNG under `marketing/site/banners/` and writes
`banners/manifest.json`. Presets default to **`billboard`** (1456×416 — the wide landing hero that
"flips") and **`og`** (1200×630 — social share); a feature's `banner.presets` can add IAB sizes. The
brand overlay (eyebrow + accent headline + subhead + CTA pill + logo) is composited over the feature's
`banner.background` when given (a local upload path or URL → data-URI) or the brand **navy gradient**
fallback when not — so it runs with **no AI-image dependency**, and drops in an uploaded/AI background
when you have one. Renderer: `@resvg/resvg-js` + the shipped Inter fonts + brand tokens mirrored from
`src/server/lib/banner-brand.ts` (SCOPE-070). See `references/banners.md`.

The **flipping billboard** is `assets/feature-billboards.html` — a self-contained carousel that fetches
`banners/manifest.json`, auto-rotates the top-ranked billboards with a fade, and has a **language
toggle** that swaps the whole set to another locale's images. Copy its markup into
`marketing/site/index.html` (placement + the one-line redeploy note are in `references/banners.md`),
then `pwsh marketing/site/deploy/redeploy.ps1` to publish the banners + page.

### 7. Seed the marketing engine — social + languages (deterministic, gated)

**Only after the user confirms** — this writes to the app DB.

```bash
node .claude/skills/marketing-feature-set/scripts/import-feature-set.mjs --dry-run  # preview
node .claude/skills/marketing-feature-set/scripts/import-feature-set.mjs            # apply
```

Reads `marketing/feature-set.json`, needs `DATABASE_URL` in `.env`, reuses `pg` + `uuid`. Per feature
it upserts (idempotent on `(assetkey, locale)`, all `status='draft'`):

- a **synopsis** asset — the feature definition (`assetkey=feature-<slug>`);
- a **post** draft per requested channel with the feature's og banner referenced as its image
  (`assetkey=feature-<slug>-post`), seeded per `social.channels`;
- a **row per locale** present in the feature's `locales` map (locale variants share the `assetkey`).

Field mapping is in `references/marketingassets-mapping.md`. Afterward the features live in the sysadmin
Marketing hub's Assets/Posts library, where SCOPE-065 **Translate** fills any missing languages and
**Draft-with-AI / Repurpose** turn each into finished channel copy.

**Pushing to social is a handoff, stated honestly:** SCOPE-065 does not auto-post (posting APIs are
out of scope; the Facebook Groups API is gone). The features arrive as channel-ready drafts **with
images and language variants**; a human sends them from the hub, or the platform automation skills
(`twitter-automation`, `windev-facebook-outreach`, `mailgun-automation`, etc.) do the actual posting.
Do not claim this skill posts by itself.

### 8. Optionally stamp the watermark

The catalog is a generated customer-facing artifact — per SCOPE-082 it may carry the wxKanban
attribution mark. If wanted, run the [watermark](../../commands/watermark.md) command on
`marketing/feature-set.md`, then re-render the PDF (step 5).

### 9. Deliver

Short read in chat: feature count, how they cluster, the **top 3 by "biggest bang"** and why, the
audience split, and the single next action (review the MD → run the PDF / banner / import loops). Link
`marketing/feature-set.md`, the PDF, and the banners folder.

## Conventions to respect

- **Derived, not invented.** Every feature traces to a scope or FR (`sourceRefs`) — the project's
  "search before suggest" discipline.
- **Marketing language, not spec language.** Lead with the benefit; strip FR numbers and table names
  from names/props (keep them only in the provenance footnote).
- **One source, many renders.** The MD/JSON are authoritative; PDF, DB rows, banners, and carousel are
  regenerated — never hand-edit them.
- **DB writes are gated drafts.** Never import without explicit user confirmation; every row is
  `status='draft'` (SCOPE-065's human-in-the-loop rule).
- **Rank is a proposal.** Always let the user reprioritize before the catalog/carousel lock in.
- **Honest about posting.** Prepares social assets; does not auto-post. Not a copy generator
  (that's SCOPE-065), not `analyzescope` (audit), not `scope-flow-map` (dependency graph).

## Resources

- `references/catalog-template.md` — catalog MD skeleton + the full `feature-set.json` schema/example. Load before steps 2–4.
- `references/ranking-rubric.md` — the four-axis "biggest bang" scoring rubric + worked example. Load before step 3.
- `references/marketingassets-mapping.md` — `targetsegment` vocabulary, the internal-scope exclusion list, and the feature→marketingassets field mapping (synopsis + per-channel posts + per-locale rows). Load before steps 2 and 7.
- `references/banners.md` — banner presets/sizes, background (upload/AI vs navy fallback), the manifest schema, and how to drop the flipping carousel into the landing page. Load before step 6.
- `scripts/build-catalog-pdf.mjs` — Markdown → PDF (step 5).
- `scripts/generate-banners.mjs` — feature JSON → per-feature/locale banner PNGs + `manifest.json` (step 6).
- `scripts/import-feature-set.mjs` — idempotent upsert of the JSON into `marketingassets` (step 7).
- `assets/feature-billboards.html` — the self-contained flipping billboard carousel with language toggle (step 6).

## Dependencies

`marked` + `puppeteer` (PDF), `@resvg/resvg-js` + the Inter fonts in `src/server/assets/fonts/`
(banners), `pg` + `uuid` + `dotenv` (import) — all already in the project. `DATABASE_URL` in `.env`
for the import step. Optional per-feature background images (local uploads or URLs) enhance the
banners but are not required — the navy brand fallback renders without them.
