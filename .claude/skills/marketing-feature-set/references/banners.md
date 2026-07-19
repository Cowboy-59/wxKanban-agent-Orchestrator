# Banners + the flipping landing-page carousel

## Presets (sizes)

`generate-banners.mjs` knows these presets. Default set per feature is `["billboard", "og"]`; add
others via a feature's `banner.presets`.

| key | px (w×h) | layout | use |
|-----|----------|--------|-----|
| `billboard` | 1456 × 416 | hero | **the flipping landing-page hero** (wide, short) |
| `og` | 1200 × 630 | hero | social share / Open Graph, `fileurl` on the post draft |
| `leaderboard` | 728 × 90 | horizontal | display ad |
| `mrec` | 300 × 250 | hero | display ad |
| `skyscraper` | 160 × 600 | vertical | display ad |
| `halfpage` | 300 × 600 | vertical | display ad |

`og`/`leaderboard`/`mrec`/`skyscraper`/`halfpage` sizes match `src/server/lib/banner-brand.ts`
(SCOPE-070). `billboard` is added by this skill for the landing hero. PNGs render at **2×** for crisp
text, output named `<slug>.<preset>.<locale>.png` under `marketing/site/banners/`.

## Background: uploaded / AI image vs navy fallback

Each feature's `banner.background`:
- **`null`** → the brand **navy radial gradient** fallback. Fully offline, no AI cost — the default.
- **a local path** (e.g. `marketing/uploads/board.png`) → read and embedded as a data-URI.
- **an `http(s)` URL** (e.g. a Gemini/Imagen output or a CDN image) → fetched at render.

A dark left→right scrim is always laid over the background so the overlay text stays legible on any
image. To use AI backgrounds, generate them separately (SCOPE-070 Banner Studio, or any image model),
drop the file in and point `background` at it — this skill does not call an image model itself.

## Overlay

Composited by `@resvg/resvg-js` using the shipped Inter fonts (`src/server/assets/fonts/Inter-*.ttf`)
and brand tokens mirrored from `banner-brand.ts` (navy `#0f1722`, amber accent `#c8761b`, teal→cyan
accent gradient, logo `marketing/site/wxKanbanLight.png`). Elements: eyebrow (category), accent
headline, subhead, CTA pill, logo. Text comes from the feature's `banner` block (locale-overridden
when a `locales.<xx>.banner` exists).

## Manifest

`generate-banners.mjs` writes `marketing/site/banners/manifest.json`:

```json
{
  "generatedAt": null,
  "locales": ["en-US", "fr-FR"],
  "features": [
    {
      "slug": "unified-task-aggregation",
      "rank": 1,
      "name": "One Board for Every PM Tool",
      "category": "Task Management",
      "link": "#features",
      "billboards": { "en-US": "banners/unified-task-aggregation.billboard.en-US.png",
                      "fr-FR": "banners/unified-task-aggregation.billboard.fr-FR.png" },
      "og": { "en-US": "banners/unified-task-aggregation.og.en-US.png" }
    }
  ]
}
```

Features are listed **rank-ascending** so the carousel flips best-first. Paths are relative to
`marketing/site/` (the deploy root), so they resolve on `windev.wxperts.com`.

## The flipping carousel

`assets/feature-billboards.html` is a self-contained block (scoped CSS + vanilla JS, no build step). It:

- `fetch`es `banners/manifest.json`, renders each feature's `billboards[<locale>]` as a slide;
- auto-advances with a cross-fade (~5s), with prev/next dots and hover-to-pause;
- shows a **language toggle** built from `manifest.locales` that swaps every slide to that locale's
  image (falling back to `en-US` where a locale's billboard is missing);
- links each slide to its `link`.

### Drop it into the landing page

1. Run `generate-banners.mjs` (writes the PNGs + manifest under `marketing/site/banners/`).
2. Open `marketing/site/index.html`; paste the contents of `assets/feature-billboards.html`
   immediately **after** the `.hero` section's closing `</section>` (so the billboard sits right under
   the hero). It is self-scoped — its CSS is prefixed `.fbb-` and will not collide with the page.
3. Publish: `pwsh marketing/site/deploy/redeploy.ps1` (uploads the site + `banners/` to S3/CloudFront).

Re-run step 1 after editing `feature-set.json` to refresh the images; the carousel picks up the new
manifest automatically.
