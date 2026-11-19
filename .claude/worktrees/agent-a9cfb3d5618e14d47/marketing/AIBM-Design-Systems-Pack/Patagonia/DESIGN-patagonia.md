---
version: alpha
name: Patagonia Analysis
description: >
  A near-monochrome editorial system — white canvas, true-black ink set in airy
  300-weight type — where the brand voice lives in pill-shaped black/white
  buttons and deep slate-blue and earthy-green section bands borrowed from the
  outdoors.

colors:
  primary: "#27455c"          # deep slate-blue band / accent (most-frequent saturated bg)
  on-primary: "#ffffff"       # text on dark bands & black pills
  dark: "#000000"             # the iconic solid-black pill button + inverted bands
  canvas: "#ffffff"           # dominant page background
  canvas-soft: "#f5f5f5"      # off-tint section background
  surface: "#ffffff"          # card / panel surface
  surface-alt: "#f4f4f4"      # chip / sunken fill
  ink: "#000000"              # headings & body text (true black, ~3600 hits)
  ink-secondary: "#555555"
  ink-muted: "#656565"
  ink-faint: "#cccccc"        # captions / placeholder / disabled
  hairline: "#d1d1d1"         # 1px borders & dividers
  hairline-soft: "#e8e8e8"    # lightest rule
  # decorative accents (outdoor palette, used on bands & illustrations):
  accent-green: "#468054"     # earthy field green
  accent-teal: "#32ae88"      # spring teal (borders/highlights)
  accent-sky: "#65b0e2"       # light sky blue
  accent-cobalt: "#3860be"    # link/info blue
  # semantic:
  error: "#e10000"            # sale price / error red

typography:
  display-1: { fontFamily: "Ridgeway Sans (→ Work Sans)", fontSize: 32px, fontWeight: 500, lineHeight: 1.1, letterSpacing: -0.64px }
  heading-1: { fontFamily: "Ridgeway Sans (→ Work Sans)", fontSize: 28px, fontWeight: 500, lineHeight: 1.1, letterSpacing: -0.56px }
  heading-2: { fontFamily: "Ridgeway Sans (→ Work Sans)", fontSize: 24px, fontWeight: 500, lineHeight: 1.15, letterSpacing: -0.48px }
  title:     { fontFamily: "Ridgeway Sans (→ Work Sans)", fontSize: 20px, fontWeight: 300, lineHeight: 1.2, letterSpacing: normal }
  body-lg:   { fontFamily: "Ridgeway Sans (→ Work Sans)", fontSize: 16px, fontWeight: 300, lineHeight: 1.5, letterSpacing: normal }
  body-md:   { fontFamily: "Ridgeway Sans (→ Work Sans)", fontSize: 14px, fontWeight: 300, lineHeight: 1.5, letterSpacing: normal }   # the dominant tier (~2900 hits)
  body-sm:   { fontFamily: "Ridgeway Sans (→ Work Sans)", fontSize: 12px, fontWeight: 300, lineHeight: 1.5, letterSpacing: normal }
  button:    { fontFamily: "Ridgeway Sans (→ Work Sans)", fontSize: 15px, fontWeight: 500, lineHeight: 1.2, letterSpacing: normal }
  caption:   { fontFamily: "Ridgeway Sans (→ Work Sans)", fontSize: 12px, fontWeight: 500, lineHeight: 1.2, letterSpacing: normal }
  eyebrow:   { fontFamily: "Ridgeway Sans (→ Work Sans)", fontSize: 12px, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0.4px }

rounded:
  xs: 2px
  sm: 4px
  md: 8px
  lg: 16px
  xl: 20px
  pill: 30px
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
  level-1: "0 4px 5px rgba(0,0,0,0.14), 0 1px 10px rgba(0,0,0,0.12), 0 2px 4px -1px rgba(0,0,0,0.20)"
  level-2: "0 20px 50px rgba(0,0,0,0.18)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", padding: 16px }
  button-primary:   { background: "{colors.dark}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.pill}", padding: "9px 28px" }
  button-outline:   { background: "{colors.canvas}", textColor: "{colors.ink}", border: "2px solid {colors.ink}", typography: "{typography.button}", rounded: "{rounded.pill}", padding: "9px 28px" }
  pill-filter:      { background: "{colors.canvas}", textColor: "{colors.ink}", border: "2px solid transparent", hoverBorder: "2px solid {colors.ink}", rounded: "{rounded.pill}", padding: "9px 28px", typography: "{typography.button}" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.md}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:       { background: "{colors.canvas}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", padding: "12px 16px", typography: "{typography.body-md}" }
  badge-pill:       { background: "{colors.canvas}", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: "5px 10px", typography: "{typography.caption}" }
---

# Patagonia — Design Language Analysis

Patagonia's storefront reads like a printed field journal: a clean white page,
true-black text set surprisingly light, and photography doing the heavy lifting.
There is almost no chrome. Interface decoration is deliberately suppressed so the
imagery and the environmental message stay front and center, and the few branded
moments — pill buttons, slate and green bands — feel like punctuation rather than
ornament.

## Colour

The palette is functionally monochrome. Black (`#000000`) carries essentially all
text and the solid button fills, white (`#ffffff`) is the canvas, and a short
grey ramp (`#555555` → `#656565` → `#cccccc`) handles secondary text and
placeholders. Dividers are a soft `#d1d1d1` hairline. Saturation is rationed: the
only recurring non-grey surfaces are a deep slate-blue (`#27455c`) and an earthy
green (`#468054`) used as full-bleed section bands, with supporting outdoor tints
of teal (`#32ae88`), sky (`#65b0e2`) and cobalt (`#3860be`) appearing on
illustrations and links. A single red (`#e10000`) is reserved for sale pricing.
The one gradient on the page is a barely-there black 5%→10% overlay used to keep
text legible over photography — not a decorative gradient. The result is a system
where colour signals meaning (sale, eco-band, link) rather than personality.

## Typography

The brand face is **Ridgeway Sans**, a proprietary humanist sans; the showcase
substitutes **Work Sans** from Google, the closest open match for its friendly,
slightly squared humanist forms and — crucially — its support for the 300 weight.
That light weight is the signature: the overwhelmingly dominant body tier is
14px/300, with a larger 20px/300 lede also set light. Hierarchy is built almost
entirely through *size plus negative tracking* rather than heavy weight —
headings step 32 → 28 → 24px at weight 500 with letter-spacing tightening to
about -0.02em, which gives titles a quiet, editorial confidence. Buttons and tiny
labels are the exception, jumping to weight 500–700 at 12–15px for legibility.

## Shape & depth

Two radius languages coexist. Content surfaces use restrained corners — 2px, 4px
and 8px (cards and inputs) — while interactive controls are fully rounded
**30px pills**, the most recognizable shape in the system, applied to category
filters and CTAs alike. Depth is mostly flat: cards sit at level-0 with only a
1px hairline, and lift to a soft multi-layer Material-style shadow
(`0 4px 5px / 0 1px 10px / 0 2px 4px`) on hover. A deeper `0 20px 50px` shadow is
reserved for overlays and floating panels. Elevation is an interaction cue, not a
resting state.

## Layout & responsive

Spacing follows a 4px base unit on a familiar 4/8/12/16/24/32/48 scale, with
generous 72px vertical rhythm between sections. Content is centered in a
~1200px column with 40px gutters. The grid is image-led: product and story cards
sit in a 4-up grid on desktop that collapses to 2-up on tablet and 1–2-up on
mobile, while the pill filter row wraps fluidly. Type scales down modestly rather
than dramatically — the system was designed light and roomy, so it stays readable
as the column narrows without needing aggressive breakpoint jumps.
