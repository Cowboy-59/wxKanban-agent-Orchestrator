---
version: alpha
name: Coinbase Analysis
description: >
  A crisp, near-monochrome fintech system painted on white with near-black
  #0A0B0D ink, anchored by the unmistakable Coinbase electric blue #0052FF on
  every CTA and link, with market green and coral reserved for up/down signal —
  flat, fully-rounded pill buttons and almost no shadow.

colors:
  primary: "#0052ff"            # brand blue — CTAs, links, focus
  primary-active: "#0667d0"     # deeper blue for pressed/visited link states
  primary-soft: "#578bfa"       # lighter blue accent / illustration tint
  on-primary: "#ffffff"         # text/icon on primary blue
  dark: "#0a0b0d"               # dark buttons, inverted bands, headings
  dark-soft: "#282b31"          # raised dark surface variant
  canvas: "#ffffff"             # page background
  canvas-soft: "#eef0f3"        # off-tint section background / sunken fills
  surface: "#ffffff"            # card / panel surface
  surface-alt: "#eef0f3"        # chip, secondary pill, table header fill
  ink: "#0a0b0d"                # headings & primary body text
  ink-secondary: "#5b616e"      # supporting copy, labels, captions
  ink-muted: "#5b616e"          # same grey at lower emphasis
  ink-faint: "rgba(91,97,110,0.66)"  # placeholder / disabled
  hairline: "rgba(91,97,110,0.2)"    # 1px borders & dividers
  # semantic / market signal
  success: "#27ad75"            # price up / positive (also #098551 deep)
  error: "#f0616d"              # price down / negative (coral red)
  # decorative
  accent-gradient: "#3860be"    # blue gradient stop used in hero art

typography:
  display-1: { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 80px, fontWeight: 400, lineHeight: 1.0, letterSpacing: -1px }
  display-2: { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 64px, fontWeight: 400, lineHeight: 1.0, letterSpacing: -1px }
  heading-1: { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 44px, fontWeight: 400, lineHeight: 1.1, letterSpacing: -0.5px }
  heading-2: { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 36px, fontWeight: 400, lineHeight: 1.12, letterSpacing: -0.5px }
  heading-3: { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 28px, fontWeight: 400, lineHeight: 1.2, letterSpacing: normal }
  title:     { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 20px, fontWeight: 600, lineHeight: 1.3, letterSpacing: normal }
  body-lg:   { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 18px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-md:   { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-sm:   { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: normal }
  button:    { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 16px, fontWeight: 600, lineHeight: 1.15, letterSpacing: normal }
  caption:   { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 13px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  eyebrow:   { fontFamily: "CoinbaseSans (substitute: Inter)", fontSize: 12px, fontWeight: 600, lineHeight: 1.3, letterSpacing: 0.4px, textTransform: uppercase }

rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 40px
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
  level-1: "0 8px 12px rgba(0,0,0,0.12)"
  level-2: "0 0 18px rgba(0,0,0,0.20)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", padding: 16px 24px }
  nav-pill:         { backgroundColor: "transparent", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: 12px 24px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 16px 32px }
  button-secondary: { background: "{colors.surface-alt}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 16px 24px }
  button-dark:      { background: "{colors.dark}", textColor: "#ffffff", typography: "{typography.button}", rounded: "{rounded.full}", padding: 16px 32px }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}", border: "1px solid {colors.hairline}" }
  text-input:       { background: "{colors.canvas}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", padding: 12px 16px, typography: "{typography.body-sm}" }
  badge-pill:       { background: "{colors.surface-alt}", textColor: "{colors.primary}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: 5px 10px }
---

# Coinbase — Design Language Analysis

Coinbase paints a deliberately quiet, trust-first surface and lets one electric blue do all the talking. The page is overwhelmingly white and near-black with a single grey for support; saturated colour is rationed and meaningful. The result reads as institutional and calm — the visual equivalent of a regulated exchange — while the rounded geometry and oversized display type keep it modern and consumer-friendly rather than stiff.

## Colour

The palette is essentially monochrome with one hero hue. Ink is a near-black `#0A0B0D` (Coinbase's signature off-black, slightly warmer and softer than pure `#000`), carried for both headings and body. A single neutral grey `#5B616E` covers all secondary copy, labels and captions, and at 20% opacity becomes the only hairline `rgba(91,97,110,0.2)`. Backgrounds are just two: white `#FFFFFF` for canvas and cards, and a faint cool grey `#EEF0F3` for sunken sections, secondary pills and table headers. The brand's electric blue `#0052FF` is the one saturated colour you see everywhere it matters — primary CTAs, links, focus — with a deeper `#0667D0` for pressed/visited states and a lighter `#578BFA` for illustration tints. Beyond brand, colour is reserved for market signal: a confident green `#27AD75` (deepening to `#098551`) for price-up, and a coral red `#F0616D` for price-down. Dark inverted bands lean on the same `#0A0B0D` ink as a fill.

## Typography

The site ships in **CoinbaseSans**, the brand's proprietary geometric-humanist sans; the showcase substitutes **Inter** (nearest Google match) and labels it as such. Hierarchy is built far more by *size* than by weight — display headlines run enormous (80px, 64px, 44px) at a regular 400 weight, relying on the custom display face and tight negative tracking (`-1px`) to feel authoritative rather than heavy. Weight only steps up to 600 for buttons, titles, and small emphasis. The workhorse body tier is 16px/400 at a 1.5 ratio (by far the most common pairing on the page), with 18px for ledes and 14px for dense UI. Eyebrows are tiny 12px uppercase at 600 with positive tracking.

## Shape & depth

Rounding is generous and consistent: a 4 → 8 → 12 → 16 → 24 → 40px ladder, topped by a true pill (`9999px`) that Coinbase uses constantly — every primary and secondary button, nav tab, and badge is a full pill (observed at 56px on standard buttons). Cards favour the 16px large radius. Depth is almost entirely flat: the dominant treatment is a 1px hairline with *no* shadow (level-0). Shadows appear only sparingly — a soft `0 8px 12px rgba(0,0,0,0.12)` for the rare lifted card and a diffuse `0 0 18px rgba(0,0,0,0.2)` glow for overlays — so elevation is the exception, not the rule.

## Layout & responsive

Spacing follows a 4px base unit on an 8-step rhythm (4 / 8 / 12 / 16 / 24 / 32 / 48), with 16px the default component padding and 24/32px the common gaps. Layout is a centered max-width container with multi-column marketing grids that collapse predictably: four-up product/feature grids drop to two columns on tablet and stack to one on mobile, while the oversized hero display scales down sharply (80px → ~48px) so it never overflows small screens. Navigation pills and CTAs keep their full-pill shape at every breakpoint.
