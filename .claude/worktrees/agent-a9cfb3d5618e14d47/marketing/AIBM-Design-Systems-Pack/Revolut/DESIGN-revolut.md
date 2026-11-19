---
version: alpha
name: Revolut Analysis
description: >
  A high-contrast, two-mode marketing canvas — true-black storytelling bands
  slammed against white catalogue bands — where oversized Aeonik Pro headlines
  and pill-shaped buttons carry the editorial confidence, depth comes from
  colour-blocking rather than shadow, and a single cobalt-violet (#494fdf) is
  rationed as the only brand stamp.

colors:
  primary: "#494fdf"            # cobalt violet — featured plan card, wordmark, secondary CTAs (used scarcely)
  primary-bright: "#4f55f1"     # hover / inline accent
  primary-active: "#3a40c4"     # pressed
  on-primary: "#ffffff"         # label on primary surfaces
  dark: "#000000"               # storytelling canvas, dark pill CTAs, nav, footer (true black, not near-black)
  canvas: "#ffffff"             # white catalogue mode — page background (confirmed: meta theme-color)
  canvas-soft: "#f4f4f4"        # soft buttons, download tiles, inset groups
  surface: "#ffffff"            # white card surface on light bands
  surface-deep: "#0a0a0a"       # inset cards inside dark bands
  surface-elevated: "#16181a"   # plan / feature cards lifted off true black
  ink: "#191c1f"                # primary text — warm near-black (confirmed: meta tile color)
  ink-secondary: "#3a3d40"      # charcoal — captions, secondary nav
  ink-muted: "#505a63"          # supporting text
  ink-faint: "#8d969e"          # metadata, subtle captions
  ink-disabled: "#c9c9cd"       # disabled foreground / hairline replacement
  on-dark: "#ffffff"            # text on dark canvas
  on-dark-muted: "rgba(255,255,255,0.72)"  # secondary text in dark regions
  hairline: "#e2e2e7"           # 1px dividers on light bands
  hairline-dark: "rgba(255,255,255,0.12)"  # dividers in dark regions
  hairline-strong: "#191c1f"    # full-strength structural dividers / light-card outline
  link: "#376cd5"               # default inline link on white
  # Decorative accents — live INSIDE product illustrations & iconography only, never as button surfaces:
  accent-teal: "#00a87e"
  accent-light-blue: "#007bc2"
  accent-light-green: "#428619"
  accent-yellow: "#b09000"
  accent-warning: "#ec7e00"
  accent-pink: "#e61e49"
  accent-danger: "#e23b4a"
  accent-brown: "#936d62"       # metals-tier card chrome

typography:
  # Display family: Aeonik Pro (proprietary) at weight 500. Body family: Inter (open-source).
  display-1: { fontFamily: "Aeonik Pro", fontSize: 136px, fontWeight: 500, lineHeight: 1.0, letterSpacing: -2.72px }   # flagship hero, one per page
  display-2: { fontFamily: "Aeonik Pro", fontSize: 80px,  fontWeight: 500, lineHeight: 1.0,  letterSpacing: -0.8px }   # section openers
  heading-1: { fontFamily: "Aeonik Pro", fontSize: 48px,  fontWeight: 500, lineHeight: 1.21, letterSpacing: -0.48px }
  heading-2: { fontFamily: "Aeonik Pro", fontSize: 40px,  fontWeight: 500, lineHeight: 1.2,  letterSpacing: -0.4px }
  heading-3: { fontFamily: "Aeonik Pro", fontSize: 32px,  fontWeight: 500, lineHeight: 1.19, letterSpacing: -0.32px }  # plan-card titles
  title:     { fontFamily: "Aeonik Pro", fontSize: 24px,  fontWeight: 500, lineHeight: 1.33, letterSpacing: 0 }
  subtitle:  { fontFamily: "Aeonik Pro", fontSize: 20px,  fontWeight: 500, lineHeight: 1.4,  letterSpacing: 0 }
  body-lg:   { fontFamily: "Inter", fontSize: 18px, fontWeight: 400, lineHeight: 1.56, letterSpacing: -0.09px }
  body-md:   { fontFamily: "Inter", fontSize: 16px, fontWeight: 400, lineHeight: 1.5,  letterSpacing: 0.24px }         # default body
  body-md-bold: { fontFamily: "Inter", fontSize: 16px, fontWeight: 600, lineHeight: 1.5, letterSpacing: 0.16px }
  body-sm:   { fontFamily: "Inter", fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: 0 }
  button:    { fontFamily: "Inter", fontSize: 16px, fontWeight: 600, lineHeight: 1.5, letterSpacing: 0.24px }          # default button (hero CTAs step up to Aeonik 20/500)
  caption:   { fontFamily: "Inter", fontSize: 13px, fontWeight: 400, lineHeight: 1.4,  letterSpacing: 0 }
  eyebrow:   { fontFamily: "Inter", fontSize: 12px, fontWeight: 600, lineHeight: 1.4,  letterSpacing: 0.4px }          # uppercase kicker

rounded:
  none: 0px
  sm: 8px      # inline tags, small chips
  md: 12px     # form inputs, download tiles
  lg: 20px     # feature & plan cards
  xl: 28px     # product-mockup containers
  full: 9999px # every button, pill, badge, tab

spacing:
  xxs: 4px
  xs: 6px
  sm: 8px
  md: 14px
  lg: 16px
  xl: 24px
  xxl: 32px    # standard card internal padding
  xxxl: 48px
  block: 80px
  section: 88px   # vertical band-to-band rhythm
  band: 120px     # hero & closing planning band

elevation:
  # No traditional drop-shadow language. Depth = canvas colour-blocking + surface-luminance shifts.
  level-0: "none — flat colour band (default, light or dark)"
  level-1: "white surface (#ffffff) card on a #f4f4f4 band, defined by a 1px #e2e2e7 hairline — not a shadow"
  level-2: "#16181a elevated surface lifted off the #000000 canvas by luminance alone"
  level-3: "#494fdf cobalt block on #000000 — the featured-plan inversion"

components:
  nav-bar:          { backgroundColor: "{colors.dark}", textColor: "{colors.on-dark}", typography: "{typography.button}", rounded: "{rounded.none}", height: 64px }
  button-primary:   { background: "{colors.canvas}", textColor: "{colors.dark}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 14px 28px, height: 48px }   # white pill on dark — the loudest action
  button-dark:      { background: "{colors.dark}", textColor: "{colors.on-dark}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 14px 28px, height: 48px }  # black pill on white catalogue bands
  button-soft:      { background: "{colors.canvas-soft}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 14px 28px, height: 48px }
  button-outline:   { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.hairline-strong}", rounded: "{rounded.full}", padding: 13px 27px, height: 48px }
  button-pill-sm:   { background: "{colors.canvas-soft}", textColor: "{colors.ink}", typography: "{typography.button} (14/600)", rounded: "{rounded.full}", padding: 8px 16px, height: 36px }
  feature-card:     { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", padding: 32px }
  plan-card:        { backgroundColor: "{colors.surface-elevated}", textColor: "{colors.on-dark}", rounded: "{rounded.lg}", padding: 32px }
  plan-card-featured: { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", rounded: "{rounded.lg}", padding: 32px }
  text-input:       { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", typography: "{typography.body-md}", rounded: "{rounded.md}", padding: 14px 16px, height: 56px }
  badge-pill:       { backgroundColor: "{colors.canvas-soft}", textColor: "{colors.ink}", typography: "{typography.caption}", rounded: "{rounded.full}", padding: 4px 12px }
  badge-feature:    { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.caption}", rounded: "{rounded.full}", padding: 4px 12px }
  download-tile:    { backgroundColor: "{colors.canvas-soft}", textColor: "{colors.ink}", typography: "{typography.body-sm}", rounded: "{rounded.md}", padding: 12px 20px, height: 56px }
  footer:           { backgroundColor: "{colors.dark}", textColor: "{colors.on-dark-muted}", typography: "{typography.body-sm}", rounded: "{rounded.none}", padding: 80px 24px }
---

# Revolut — Design Language Analysis

Revolut's public marketing site behaves less like a website and more like a magazine spread for a bank. It runs a **two-mode canvas**: true-black storytelling bands that host hero copy, product mockups and the plan grid, alternating with white catalogue bands that host comparison tables, savings rows and download tiles. The modes do not fade into one another — full-bleed sections slam edge to edge, and that hard cut is the rhythm the brand is known for. Every surface is built from an in-house token system (the site themes itself through `--rui-color-*` CSS custom properties applied by styled-components), and the personality lives in the restraint: enormous type, generous whitespace, pill buttons, no shadows, and exactly one accent colour used as a stamp rather than a theme.

## Colour

The palette is deliberately bimodal. The two canvases are absolute — pure white `#ffffff` and true black `#000000` — and almost everything else is a neutral. Text is never pure black on white; it sits on a warm near-black `ink #191c1f`, stepping down through a five-rung grey ramp (`charcoal #3a3d40 → mute #505a63 → faint #8d969e → disabled #c9c9cd`) for secondary, supporting and metadata copy. On dark bands, text inverts to `#ffffff` and a 72%-opacity white for the secondary tier. Dividers are hairlines, not fills: `#e2e2e7` on light, a 12%-white on dark.

The one brand colour is **cobalt violet `#494fdf`** — a saturated, slightly electric blue-purple. Its discipline is the whole story: it is *not* a button colour and *not* a theme. It appears only on the featured plan card (a single saturated block inside an otherwise dark, neutral grid), on the brand glyph, and occasionally as a secondary link accent in white regions, with `#4f55f1` for hover and `#3a40c4` for pressed. Beyond that sits a wide secondary palette — teal `#00a87e`, deep pink `#e61e49`, warning orange `#ec7e00`, light green `#428619`, yellow `#b09000`, danger red `#e23b4a`, a metals brown `#936d62` — but these live *inside* product illustrations and iconography only. You will never see them on a button or a band. The primary call to action is therefore the highest-contrast object available: a **white pill on black** in dark bands, and its inverse, a **black pill on white**, in catalogue bands.

## Typography

Two families do all the work. Display type is **Aeonik Pro** — Revolut's proprietary humanist grotesk — always set at weight **500**, used from 20px all the way up to a 136px flagship hero. The hierarchy is built almost entirely by *size and tracking* rather than by weight: as the type grows, the negative letter-spacing deepens (from roughly `-0.32px` at 32px to `-2.72px` at 136px) and the line-height clamps to `1.0`, so the giant headlines stack into tight, structural blocks. Body type is **Inter** at weight 400 (or 600 for emphasis), and — unusually — it runs *positive* tracking of about `0.24px` on UI labels, a small mechanical nudge that reads as fintech precision against the editorial display face. Hero buttons step up to an Aeonik Pro 20/500 label; everything below the hero uses Inter 16/600.

Aeonik Pro is licensed, so it cannot be embedded in this showcase. The closest free substitutes that preserve its warm geometric character are Inter Display, General Sans or Söhne; this style guide renders display type in **Manrope** (the nearest Google Font), with a `-1%` letter-spacing nudge to recover Aeonik's tightness, and body type in **Inter**, which is itself open-source and used directly.

## Shape & depth

Roundness is tiered by component class, not by whim. Every button, pill, badge and tab is fully rounded (`9999px`); feature and plan cards use a generous `20px`; form inputs and download tiles use `12px`; small inline tags use `8px`; and product-mockup device chrome uses `28px`. Hero bands, the footer and full-bleed sections carry no radius at all.

Depth is the most distinctive part of the system: **there is no drop-shadow language at all.** Elevation is communicated two ways — by switching the canvas colour (a white card on a soft-grey band, defined only by its `#e2e2e7` hairline) and by nudging surface luminance (a `#16181a` card lifted a single step off the `#000000` canvas). The featured plan card is the most "elevated" object on the page, and it earns that purely by being cobalt in a field of dark neutrals. Inputs are tall (56px) and buttons are a minimum 48px, comfortably exceeding accessible touch-target sizes.

## Layout & responsive

The spacing scale sits on a 4px base and runs in 4 / 8 / 16 multiples up to large editorial steps — `88px` between bands and `120px` on the hero and closing plan section — which is what gives the 80–136px headlines room to breathe. Body content is capped around a 1200px container while hero and mockup bands run full-bleed. The plan grid is 4-up on large desktop, collapsing to 2-up at tablet and 1-up on mobile; the feature grid steps 3 → 2 → 1. The flagship hero clamps down the ladder (136 → 80 → 64 → 48px), the top nav folds into a hamburger below ~1024px while the wordmark and primary CTA stay anchored, and sub-nav pills convert from a wrap row into a horizontal scroll-rail on small screens. Product mockups never letterbox — they stay full-bleed and crop inward.

## Methodology & confidence

Revolut is a regulated bank, so the live-DOM route this skill normally uses (injecting a computed-style harvester into the rendered page) was blocked by the browser tool's safety restriction on financial sites. The token values here were therefore triangulated from three independent sources rather than a single in-page read: (1) **direct measurements** I pulled from the live page's own metadata — `theme-color #ffffff` and `msapplication-TileColor #191c1f`; (2) the **rendered token architecture** observed in the page markup, which confirmed an in-house `--rui-color-*` design-token system applied via styled-components, plus the real page structure (the "Banking & Beyond" hero, the Standard/Plus/Premium/Metal/Ultra plan tiers, the 5% AER savings band, RevPoints and the AIR assistant); and (3) a **corroborating published token reference** for revolut.com. The two values I measured myself — `#ffffff` and `#191c1f` — match the reference's `canvas` and `ink` tokens exactly, which is what gives confidence in the rest of the palette and the type scale. Confidence is highest on colour and shape, and slightly lower on the precise letter-spacing and line-height figures of the display scale, which are best treated as faithful-to-1px rather than pixel-certain.

*Sources: live page metadata via revolut.com; the VoltAgent `awesome-design-md` Revolut DESIGN.md and designmd.co/d/revolut token references; Fonts In Use (Revolut) for the Aeonik Pro / Inter pairing.*
