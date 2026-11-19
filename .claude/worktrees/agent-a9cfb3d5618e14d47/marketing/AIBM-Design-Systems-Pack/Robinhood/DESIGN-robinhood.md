---
version: alpha
name: Robinhood Analysis
description: >
  A confident, flat, dark-first system where acid-lime #ccff00 detonates against
  warm near-black #110e08 and parchment neutrals — a single proprietary grotesque
  (Capsule Sans) held almost entirely at weight 400, set with aggressive negative
  tracking, on full-pill buttons and shadowless surfaces.

colors:
  primary: "#ccff00"          # signature acid-lime — CTAs, accents, highlights
  primary-active: "#bce800"   # derived pressed/hover lime (not observed; plausible)
  on-primary: "#110e08"       # near-black text/icon sitting on the lime
  dark: "#110e08"             # warm near-black — dark buttons, inverted bands
  black: "#000000"            # true black — dark-first page background
  canvas: "#000000"           # live page background is black (dark-first)
  canvas-soft: "#d4d0c9"      # warm parchment / taupe section band
  surface: "#ffffff"          # white panels
  surface-alt: "#1c180d"      # warm near-black sunken fill / chip on dark
  ink: "#110e08"              # headings & body text on light surfaces
  ink-secondary: "#35322d"
  ink-muted: "#4d4a46"
  ink-faint: "#808080"        # captions / placeholders / muted UI
  on-dark: "#ffffff"          # text on black / inverted bands
  hairline: "#cbc7bf"         # 1px borders & dividers on light
  hairline-soft: "#ddd9d2"

typography:
  display-1: { fontFamily: "Capsule Sans Text", fontSize: 74px, fontWeight: 400, lineHeight: 1.05, letterSpacing: -1px }
  display-2: { fontFamily: "Capsule Sans Text", fontSize: 58px, fontWeight: 400, lineHeight: 0.95, letterSpacing: -1.5px }
  heading-1: { fontFamily: "Capsule Sans Text", fontSize: 48px, fontWeight: 400, lineHeight: 1.2, letterSpacing: -1px }
  heading-2: { fontFamily: "Capsule Sans Text", fontSize: 34px, fontWeight: 400, lineHeight: 1.18, letterSpacing: -0.5px }
  heading-3: { fontFamily: "Capsule Sans Text", fontSize: 32px, fontWeight: 400, lineHeight: 1.31, letterSpacing: -1.4px }
  title:     { fontFamily: "Capsule Sans Text", fontSize: 22px, fontWeight: 400, lineHeight: 1.45, letterSpacing: -0.25px }
  body-lg:   { fontFamily: "Capsule Sans Text", fontSize: 17px, fontWeight: 400, lineHeight: 1.59, letterSpacing: -0.1px }
  body-md:   { fontFamily: "Capsule Sans Text", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: -0.25px }
  body-sm:   { fontFamily: "Capsule Sans Text", fontSize: 13px, fontWeight: 400, lineHeight: 1.4, letterSpacing: -1px }
  button:    { fontFamily: "Capsule Sans Text", fontSize: 16px, fontWeight: 400, lineHeight: 1.0, letterSpacing: normal }
  caption:   { fontFamily: "Capsule Sans Text", fontSize: 12px, fontWeight: 400, lineHeight: 1.58, letterSpacing: -0.1px }
  eyebrow:   { fontFamily: "Capsule Sans Text", fontSize: 13px, fontWeight: 400, lineHeight: 1.4, letterSpacing: -1.4px }

rounded:
  xs: 3px
  sm: 5px
  md: 12px
  lg: 20px
  xl: 36px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"
  level-1: "0 1px 2px rgba(17,14,8,0.10)"
  level-2: "0 8px 24px rgba(17,14,8,0.12)"

components:
  nav-bar:          { backgroundColor: "{colors.black}", textColor: "{colors.on-dark}", typography: "{typography.body-md}", padding: 16px 24px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.xl}", padding: 16px 32px, border: "1px solid {colors.primary}" }
  button-dark:      { background: "{colors.dark}", textColor: "{colors.on-dark}", typography: "{typography.button}", rounded: "{rounded.xl}", padding: 16px 32px }
  button-secondary: { background: "transparent", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.xl}", padding: 15px 31px, border: "1px solid {colors.ink}" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", border: "none" }
  text-input:       { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.sm}", padding: 12px 16px, border: "1px solid {colors.hairline}" }
  badge-pill:       { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.body-sm}", rounded: "{rounded.full}", padding: 6px 14px }
---

# Robinhood — Design Language Analysis

Robinhood's site reads as a flat, high-contrast, dark-first brand built on a single move: take a warm near-black canvas and detonate one acid-lime accent across it. There is no decorative chrome, no soft shadows, no gradient depth to speak of — the system gets its energy from color blocking, scale, and a custom grotesque that is set, surprisingly, almost entirely at regular weight. The result is confident and editorial: the brand trusts size, tracking, and a single saturated hue to do the work that most fintech sites do with illustration and elevation.

## Colour

The palette is disciplined to three families. The first is a warm-neutral ramp anchored by `#110e08` — a near-black with a faint brown cast that serves as both the primary ink on light surfaces and the fill of dark buttons and inverted bands; true `#000000` carries the full-page background. Above it sit `#35322d` and `#4d4a46` as secondary and muted text, and `#808080` for faint UI and placeholders. The second family is the warm light surface set: parchment `#d4d0c9` for tonal section bands and white `#ffffff` for clean panels, giving the page a tactile, paper-like alternation between black and cream rather than the usual cool grey. The third — and the entire brand signature — is a single acid-lime, `#ccff00`, reserved almost exclusively for primary CTAs, key highlights, and brand marks. It is never diluted into tints; it appears at full saturation or not at all, and its rarity is what makes it read as a brand asset rather than a UI color. Borders echo the same logic: a 1px lime outline rings the primary button, and warm greys (`#35322d`, neutral `#808080`) draw the few hairlines the layout needs.

## Typography

The family is **Capsule Sans Text**, Robinhood's proprietary grotesque. Because it is custom-licensed, this token set substitutes the nearest free match — **Hanken Grotesk** (with Inter as the system fallback) — for the showcase, and labels it as a substitute. The most distinctive trait of the type system is that hierarchy is built almost entirely from **size and tracking, not weight**: nearly every tier, from a 74px display headline down to 16px body, renders at weight 400. Display and heading tiers carry heavy negative letter-spacing (-1px to -1.5px) that tightens large type into a dense, modern wordmark-like block, while small label text (13px) is tracked even tighter (-1px to -1.4px) for a compact, technical feel. Line-height compresses as size grows — display sits near 0.95–1.05 while the dominant 16px body relaxes to 1.5. Bold (700) appears only as a rare emphasis inside body copy, never as the structural backbone of the hierarchy.

## Shape & depth

Shape is dominated by the pill. The most frequent radius on the page by a wide margin is **36px**, applied to every primary and secondary button so they read as full capsules at their height; truly circular pills (`9999px`) handle badges and chips. Smaller radii (3–5px) appear on minor inset elements, and a mid 20px tier rounds the occasional larger card. Depth is essentially **absent** — the extraction surfaced no meaningful box-shadows. Robinhood separates surfaces with flat color blocks (black vs. parchment vs. white) and 1px hairlines instead of elevation, which is why the page feels graphic and poster-like rather than layered. The tokens here keep `level-0` as the default and provide only minimal `level-1`/`level-2` shadows for cases where a UI absolutely needs lift.

## Layout & responsive

Spacing follows a familiar 4/8 base, with 16px and 32px doing most of the heavy lifting (note the 0 32px padding on pill buttons and 16px on body rhythm); a 4 → 8 → 12 → 16 → 24 → 32 → 48 scale captures the observed steps. The layout is a wide centered column of full-bleed alternating color bands — black hero sections with white text and lime CTAs, then warm-parchment or white editorial sections with near-black ink — stacked vertically and switching tone to pace the scroll. On smaller viewports the multi-column band content collapses to a single stack, display type steps down sharply (the 74px hero would reduce toward ~48px), and the pill CTAs stretch toward full width while preserving their 36px capsule radius and lime fill.
