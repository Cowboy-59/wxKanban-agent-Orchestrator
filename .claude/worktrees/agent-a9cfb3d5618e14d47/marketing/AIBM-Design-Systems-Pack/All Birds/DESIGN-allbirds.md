---
version: alpha
name: Allbirds Analysis
description: >
  A near-monochrome, flat retail system where warm oatmeal beige is the canvas
  and near-black charcoal does all the talking — ink-on-paper typography in the
  humanist Geograph sans, fully-pilled buttons, hairline borders instead of
  shadows, and not a single gradient in sight.

colors:
  primary: "#202223"          # charcoal — CTAs, primary buttons, brand mark, accents
  primary-active: "#000000"   # pure-black pressed state
  on-primary: "#FFFFFF"       # text/icon on the charcoal CTA
  dark: "#202223"             # inverted bands & dark buttons (same charcoal — the brand is monochrome)
  canvas: "#FFFFFF"           # dominant page background
  canvas-soft: "#ECE9E2"      # signature warm oatmeal section band
  surface: "#FFFFFF"          # card / panel surface
  surface-alt: "#EAE7E0"      # sunken beige fill / chips
  ink: "#202223"              # headings & body text (overwhelmingly dominant)
  ink-secondary: "#6D7175"    # secondary copy
  ink-muted: "#808080"        # input borders, muted UI
  ink-faint: "#A4A2A2"        # captions / placeholders
  hairline: "#DDDDDD"         # 1px borders & dividers
  hairline-soft: "rgba(32,34,35,0.15)"  # faint inner dividers
  # No saturated brand accent. An iOS system link blue (#007AFF) appears only on
  # default-styled inline links and is not part of the brand palette.

typography:
  display-1: { fontFamily: Geograph, fontSize: 30px, fontWeight: 500, lineHeight: 1.33, letterSpacing: 0 }
  heading-1: { fontFamily: Geograph, fontSize: 25px, fontWeight: 500, lineHeight: 1.20, letterSpacing: 0 }
  heading-2: { fontFamily: Geograph, fontSize: 20px, fontWeight: 900, lineHeight: 1.60, letterSpacing: 0 }   # heavy "black" caps headings (e.g. NEW ARRIVALS)
  heading-3: { fontFamily: Geograph, fontSize: 17px, fontWeight: 600, lineHeight: 1.40, letterSpacing: 0 }
  title:     { fontFamily: Geograph, fontSize: 16px, fontWeight: 600, lineHeight: 1.50, letterSpacing: 0 }
  body-lg:   { fontFamily: Geograph, fontSize: 16px, fontWeight: 400, lineHeight: 1.50, letterSpacing: 0 }
  body-md:   { fontFamily: Geograph, fontSize: 14px, fontWeight: 400, lineHeight: 1.50, letterSpacing: 0 }   # dominant body tier
  body-sm:   { fontFamily: Geograph, fontSize: 13px, fontWeight: 400, lineHeight: 1.40, letterSpacing: 0 }
  button:    { fontFamily: Geograph, fontSize: 16px, fontWeight: 400, lineHeight: 1.00, letterSpacing: 0 }   # buttons use regular weight, not bold
  caption:   { fontFamily: Geograph, fontSize: 13px, fontWeight: 500, lineHeight: 1.40, letterSpacing: 0 }
  eyebrow:   { fontFamily: Geograph, fontSize: 11px, fontWeight: 500, lineHeight: 1.40, letterSpacing: 0.4px, textTransform: uppercase }

rounded:
  xs: 3px
  sm: 10px
  md: 20px
  lg: 26px
  xl: 30px
  xxl: 80px
  full: 100px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"                                   # the brand default — flat, bordered
  level-1: "0 1px 2px rgba(0,0,0,0.10)"             # tiny lift used only on floating badges
  level-2: "0 8px 24px rgba(0,0,0,0.12)"            # popovers / modals (cart drawer, dialogs)

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", padding: 16px }
  button-primary: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "13px 25px" }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "13px 25px" }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.md}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:     { backgroundColor: "{colors.canvas}", border: "1px solid {colors.ink-muted}", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: "12px 24px" }
  badge-pill:     { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.full}", shadow: "{elevation.level-1}", padding: "5px 10px" }
---

# Allbirds — Design Language Analysis

Allbirds' storefront is an exercise in restraint. The whole interface is built from
two ideas: ink-black text on white, and the same text floating on a warm oatmeal
band. There is no brand-blue, no gradient, no drop-shadow theatre — the personality
comes entirely from the warmth of the beige, the humanist softness of the Geograph
typeface, and the fully-rounded pill geometry. It reads like premium recycled
packaging: natural, quiet, and confident.

## Colour

The palette is overwhelmingly monochrome. A single charcoal — `#202223` — accounts
for essentially all text and every primary call-to-action, with pure black as its
pressed variant. The page background is plain white; the brand's signature move is
dropping in sections of warm oatmeal (`#ECE9E2`) and a slightly deeper sunken beige
(`#EAE7E0`) for chips and inset fills. Secondary copy steps down through a short grey
ramp (`#6D7175` → `#808080` → `#A4A2A2`). Dividers are a quiet `#DDDDDD` hairline,
softened further to a 15%-opacity charcoal for inner rules. There is deliberately no
saturated accent colour: an iOS system link blue (`#007AFF`) shows up only on a
handful of default-styled inline links and should be treated as an un-themed fallback,
not part of the brand.

## Typography

The family is **Geograph**, a proprietary humanist geometric sans by Production Type.
Since it is licensed, the showcase substitutes **Hanken Grotesk** from Google Fonts —
the nearest open match for Geograph's warm, slightly humanist grotesque character.
Hierarchy is built mostly through size and weight rather than tracking (letter-spacing
stays at normal almost everywhere). Body copy is unusually small and consistent: a
14px / 400 tier dominates the entire site, with 16px / 400 for more prominent reading.
Headings sit at a restrained 24–30px in a medium 500 weight, with one distinctive
flourish — heavy **900 "black"** weight reserved for short uppercase labels like
"NEW ARRIVALS." Notably, buttons use the regular 400 weight, not bold, reinforcing the
understated tone.

## Shape & depth

Geometry is soft and fully rounded. Buttons and inputs are true pills (a 28.8px radius
on a ~50px-tall control = fully round), and large media cards use generous 20–80px
corners. The radius scale runs from a tight 3px detail up through 10 / 20 / 26 / 30px
to an 80px card corner and a 100px "full" pill. Depth is essentially absent: the
extraction found **no box-shadows at all** on the homepage. The system relies on
hairline borders and the beige/white background contrast to separate surfaces, giving
it a flat, editorial, print-like feel. Shadows appear only where unavoidable — a faint
lift on floating sale badges and the cart/modal layer.

## Layout & responsive

Spacing follows a 4px base unit (8px effective rhythm), with control padding clustering
around 12–13px vertical and 24–25px horizontal. Content sits in a centred max-width
column with generous gutters. Product and content grids run four-up on desktop,
collapsing to two columns on tablet and one-to-two on mobile, while the pill buttons,
hairlines and beige bands carry through unchanged across breakpoints — the design
degrades gracefully precisely because it leans on so few moving parts.
