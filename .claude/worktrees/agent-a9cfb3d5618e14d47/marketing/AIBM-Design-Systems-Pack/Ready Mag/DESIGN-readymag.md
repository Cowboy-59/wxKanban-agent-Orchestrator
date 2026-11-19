---
version: alpha
name: Readymag Analysis
description: >
  A confident, image-forward editorial system: a clean white canvas, a near-black
  ink ramp, neutral Graphik type set tight, and one hot orange that does all the
  shouting from full-pill CTAs — depth comes from flat colour blocking and hairlines,
  never shadow.

colors:
  primary: "#ec520b"            # the "Sign up" CTA fill — hot orange
  primary-active: "#c7430a"     # darker pressed variant (inferred)
  primary-bright: "#ff5000"     # brighter orange-red accent used on fills
  on-primary: "#ffffff"         # text/icon on the orange CTA
  dark: "#141414"               # inverted bands / dark buttons / strongest ink
  canvas: "#ffffff"             # page background and the dominant white text on imagery
  canvas-soft: "#f4f4f4"        # off-white section / secondary-button fill
  surface: "#ffffff"            # card / panel surface
  surface-alt: "#e7e7e7"        # chip / sunken fill
  ink: "#282828"                # headings & body text
  ink-secondary: "#444444"      # secondary labels
  ink-muted: "#808080"          # supporting / meta text
  ink-faint: "#afafaf"          # captions / placeholder
  hairline: "#d6d6d6"           # 1px borders & dividers
  hairline-soft: "rgba(0,0,0,0.05)"  # the most common subtle sunken fill
  # decorative accents — pulled from the colourful project-showcase tiles, used as
  # full-bleed brand blocks rather than UI semantics:
  accent-violet: "#8800ff"      # showcase tile
  accent-amber: "#ffa200"       # showcase tile
  accent-green: "#003628"       # showcase tile
  accent-lime: "#b2cc00"        # showcase tile

typography:
  display-1: { fontFamily: "Graphik (substitute: Inter)", fontSize: 80px, fontWeight: 400, lineHeight: 1.0, letterSpacing: -2px }
  display-2: { fontFamily: "Graphik (substitute: Inter)", fontSize: 40px, fontWeight: 400, lineHeight: 1.05, letterSpacing: -2px }
  heading-1: { fontFamily: "Graphik (substitute: Inter)", fontSize: 30px, fontWeight: 400, lineHeight: 1.2, letterSpacing: -0.5px }
  heading-2: { fontFamily: "Graphik (substitute: Inter)", fontSize: 24px, fontWeight: 400, lineHeight: 1.3, letterSpacing: -0.3px }
  heading-3: { fontFamily: "Graphik (substitute: Inter)", fontSize: 18px, fontWeight: 400, lineHeight: 1.4, letterSpacing: -0.04px }
  body-lg:   { fontFamily: "Graphik (substitute: Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: -0.04px }
  body-md:   { fontFamily: "Graphik (substitute: Inter)", fontSize: 14px, fontWeight: 400, lineHeight: 1.45, letterSpacing: 0 }
  body-sm:   { fontFamily: "Graphik (substitute: Inter)", fontSize: 12px, fontWeight: 500, lineHeight: 1.33, letterSpacing: -0.08px }
  button:    { fontFamily: "Graphik (substitute: Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.0, letterSpacing: 0 }
  caption:   { fontFamily: "Graphik (substitute: Inter)", fontSize: 12px, fontWeight: 400, lineHeight: 1.33, letterSpacing: 0 }
  eyebrow:   { fontFamily: "Graphik (substitute: Inter)", fontSize: 12px, fontWeight: 700, lineHeight: 1.33, letterSpacing: 0 }

rounded:
  xs: 6px
  sm: 10px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 32px
  full: 200px

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
  level-1: "0 1px 2px rgba(0,0,0,0.10)"
  level-2: "0 8px 24px rgba(0,0,0,0.10)"

components:
  nav-bar:        { backgroundColor: "transparent over hero imagery", textColor: "{colors.canvas}", typography: "{typography.body-lg}", padding: 16px }
  button-primary: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "0 24px (h~48px)" }
  button-secondary: { background: "{colors.canvas-soft}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "0 40px (h~48px)" }
  button-pill-utility: { background: "{colors.surface}", textColor: "{colors.ink-secondary}", typography: "{typography.body-sm}", rounded: "{rounded.full}", padding: "8px 16px" }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.md}", shadow: "{elevation.level-0}", separation: "hairline + colour block" }
  text-input:     { background: "{colors.canvas}", border: "1px {colors.hairline}", rounded: "{rounded.sm}", typography: "{typography.body-md}", padding: "12px 16px" }
  badge-pill:     { background: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.body-sm}", padding: "5px 10px" }
---

# Readymag — Design Language Analysis

Readymag is a website builder, and its own homepage is the loudest possible proof
of the product: full-bleed imagery, oversized type set tight, and colourful member
projects tiled edge to edge. The system underneath is deliberately quiet so the
content can be loud — a white canvas, a tight neutral typeface, generous radii, and
exactly one saturated brand colour. Everything that feels "designed" on the page is
the work being shown off; the chrome gets out of the way.

## Colour

The palette is built on a near-monochrome ink ramp over white. The dominant text
colour is pure white (`#ffffff`) — unsurprising, since most headline type sits over
photographic or coloured backgrounds — while the working ink for UI and body copy is
`#282828`, deepening to `#141414` for the strongest marks and inverted dark bands.
Secondary and meta text step down through `#444444` and `#808080`. Separation is
handled with a single hairline grey (`#d6d6d6`) and a very common 5%-black sunken
fill rather than borders everywhere.

One saturated colour carries the brand: a hot orange. The primary CTA ("Sign up")
fills with `#ec520b`, and a brighter `#ff5000` sibling appears on accent fills. It is
used sparingly and only where action is intended — against so much neutral, a single
pill of orange reads instantly as "click here." Beyond that, the only other colour on
the page comes from the project-showcase tiles (violets, amb, deep greens, limes),
which function as full-bleed brand blocks, not as semantic UI tokens. Gradients are
limited to soft white-to-transparent edge fades over imagery, not decorative colour
ramps.

## Typography

The brand face is **Graphik**, a neutral neo-grotesque (a licensed typeface from
Commercial Type); the showcase substitutes the nearest Google equivalent, **Inter**,
and labels it as a stand-in. Hierarchy is driven almost entirely by *size and
tracking*, not weight — display type runs at 40–80px in a regular 400 weight with an
aggressive `-2px` letter-spacing that tightens the big lines into solid blocks. The
workhorse body tier is 16px / 400 with a 1.5 line-height and a hair of negative
tracking (`-0.04px`). Small UI labels lean on 12px in 500 and 700 weights — the one
place weight does real hierarchy work, giving captions and eyebrows their punch.

## Shape & depth

Corners are soft and consistent: a 12px radius dominates card and surface work, with
a tighter 6–10px tier for inputs and small chips, and large pill radii (up to ~200px)
for the rounded CTAs and utility buttons. The defining trait is **flatness** — the
extraction found essentially no box-shadows in use. Depth is created by colour
blocking, full-bleed imagery, and hairline dividers rather than elevation. Where the
showcase shows a subtle level-1/level-2 shadow, treat it as an optional hover affordance,
not part of the resting visual language.

## Layout & responsive

Spacing follows a roughly 8px base (4 / 8 / 12 / 16 / 24 / 32 / 48), though as a
canvas-style builder Readymag also uses fine absolute positioning in its own hero. The
content rhythm is wide and editorial: full-width image bands, multi-column project
grids, and generous vertical breathing room between sections. On smaller viewports the
multi-column showcase grids collapse to two columns and then one, the oversized display
type scales down, and the pill CTAs stack — but the core recipe (white canvas, tight
neutral type, one orange accent, no shadows) holds at every width.
