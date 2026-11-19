---
version: alpha
name: Bang & Olufsen Analysis
description: >
  A near-monochrome luxury system painted on white and warm cream, set in the
  proprietary BeoSupreme typeface at airy light weights, with a deep
  Bang & Olufsen forest green as its single restrained accent — depth comes
  from photography and whitespace, never from shadow.

colors:
  primary: "#234923"            # Bang & Olufsen green — links, footer, brand marks
  primary-active: "#2c622c"     # brighter green fill used behind accents/hover
  on-primary: "#fcfaee"         # warm cream text/icon on dark or green
  dark: "#191817"               # warm near-black — dark bands & filled CTA buttons
  canvas: "#ffffff"             # primary page background
  canvas-soft: "#fcfaee"        # signature warm-cream section background
  surface: "#ffffff"            # card / panel surface
  surface-alt: "#f6f6f6"        # sunken grey fill, chips, muted panels
  ink: "#222222"                # dominant headings & body text
  ink-strong: "#191817"         # warm near-black for headings on cream
  ink-secondary: "#555555"      # supporting copy
  ink-faint: "#888888"          # captions, placeholders, strong hairline
  hairline: "#dddddd"           # 1px borders & dividers
  hairline-strong: "#888888"    # bordered/outline controls
  accent-blue: "#060daa"        # rare editorial/promo highlight (used sparingly)

typography:
  display-1:  { fontFamily: BeoSupreme, fontSize: 26px, fontWeight: 400, lineHeight: 1.54, letterSpacing: -0.5px }
  heading-1:  { fontFamily: BeoSupreme, fontSize: 24px, fontWeight: 400, lineHeight: 1.25, letterSpacing: 1px }
  heading-2:  { fontFamily: BeoSupreme, fontSize: 22px, fontWeight: 400, lineHeight: 1.45, letterSpacing: 0px }
  eyebrow:    { fontFamily: BeoSupreme, fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: 2px }
  title:      { fontFamily: BeoSupreme, fontSize: 16px, fontWeight: 500, lineHeight: 1.4, letterSpacing: 0px }
  button:     { fontFamily: BeoSupreme, fontSize: 16px, fontWeight: 500, lineHeight: 1.0, letterSpacing: 0.1px }
  body-lg:    { fontFamily: BeoSupreme, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  body-md:    { fontFamily: BeoSupreme, fontSize: 13.5px, fontWeight: 400, lineHeight: 1.48, letterSpacing: 0px }
  body-bold:  { fontFamily: BeoSupreme, fontSize: 13.5px, fontWeight: 700, lineHeight: 1.48, letterSpacing: 0px }
  caption:    { fontFamily: BeoSupreme, fontSize: 12.15px, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0px }
  body-sm:    { fontFamily: BeoSupreme, fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0px }

rounded:
  xs: 3px
  sm: 5px
  md: 8px
  pill: 40px
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
  level-1: "none"          # B&O uses no drop shadows; separation is by hairline + whitespace
  level-2: "none"

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink-strong}", typography: "{typography.body-lg}", padding: "16px 24px" }
  button-primary: { background: "{colors.dark}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.pill}", padding: "8px 32px", border: "2px solid transparent" }
  button-outline: { background: "transparent", textColor: "#ffffff", typography: "{typography.button}", rounded: "{rounded.pill}", padding: "8px 32px", border: "2px solid #ffffff" }
  button-utility: { background: "{colors.surface-alt}", textColor: "{colors.ink-strong}", typography: "{typography.body-bold}", rounded: "{rounded.xs}", padding: "15px", border: "1px solid {colors.hairline-strong}", textTransform: uppercase }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.md}", shadow: "{elevation.level-0}", border: "none" }
  text-input:     { background: "{colors.canvas}", rounded: "{rounded.xs}", border: "1px solid {colors.hairline}", textColor: "{colors.ink}", padding: "12px 16px", typography: "{typography.body-md}" }
  badge-pill:     { background: "{colors.canvas-soft}", textColor: "{colors.ink-strong}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: "5px 12px" }
  link-brand:     { textColor: "{colors.primary}", typography: "{typography.caption}", textDecoration: none }
---

# Bang & Olufsen — Design Language Analysis

Bang & Olufsen's storefront reads like a gallery wall: enormous product photography carries the emotion, and the interface recedes almost completely. The chrome is a quiet, near-monochrome shell — white and warm cream grounds, a single forest green for brand voice, and one warm near-black that does double duty as text and as the filled button. There are no drop shadows anywhere on the page; hierarchy is built from scale, generous spacing, hairlines, and the imagery itself. The whole effect is restrained Scandinavian luxury: expensive-feeling because of what it leaves out.

## Colour

The palette is deliberately tight. The workhorse ink is a soft `#222222`, with a warmer near-black `#191817` reserved for headings set over cream and for the solid dark CTA. Supporting copy steps down to `#555555`, and the faintest tier `#888888` carries captions, placeholders, and stronger control borders. Grounds alternate between pure white `#ffffff` and the brand's signature warm cream `#fcfaee` — the cream is the single most "Bang & Olufsen" colour on the page, used for inverted text on dark imagery and for soft section bands. A muted `#f6f6f6` provides sunken panels and chips. The lone saturated accent is the deep **Bang & Olufsen green** `#234923` (with a brighter `#2c622c` for fills), which appears almost exclusively on links and brand marks rather than on large surfaces — a confident, sparing use of colour. Borders are a light `#dddddd` hairline, stepping to `#888888` for outlined controls. The only gradient in evidence is a subtle dark-to-transparent scrim laid over hero photography to keep overlaid text legible.

## Typography

Everything is set in **BeoSupreme**, Bang & Olufsen's proprietary corporate typeface; the site declares `"Lexend Deca"` as its first fallback, which is itself a Google font and serves as the showcase's nearest substitute. The most distinctive move is weight: headings are set at regular `400`, not bold, even at display sizes — a hallmark of luxury minimalism that lets the letterforms breathe. Hierarchy is therefore carried by size and tracking rather than weight. Product display headlines sit around 26px with slightly negative tracking (`-0.5px`); section eyebrows are small (14px) but widely letter-spaced (`2px`) and uppercased to read as refined labels. The dominant body tier is an unusually small `13.5px` at `400`, with a `700` variant for inline emphasis and labels. Interactive labels and buttons step up to `16px` at medium `500` weight. The result is calm, editorial, and quietly precise.

## Shape & depth

Rounding is bimodal: controls are either barely rounded (`3px`–`5px` on inputs and utility buttons) or fully pill-shaped (`40px`) for the primary and outline CTAs, with `50%` circles for icon affordances. There is no soft mid-range card radius because cards are essentially flat photographic tiles. Depth is the headline story here — the page uses **no box shadows at all**. Elevation is communicated purely through hairline borders, whitespace, and the inherent depth of full-bleed product imagery. This flat, shadowless treatment is central to the brand's premium, gallery-like feel.

## Layout & responsive

Spacing follows an 8px base unit (button padding of `8px 32px`, control padding of `15px`), scaling through a 4 / 8 / 16 / 24 / 32 / 48 ladder. Content sits within a centred max-width column flanked by wide margins, and the layout leans on large editorial blocks and full-bleed media rather than dense grids. On smaller viewports the multi-column product rows collapse to one or two columns, the wide horizontal navigation condenses to a menu, and the generous vertical rhythm is preserved so the airy, uncluttered character survives down to mobile.
