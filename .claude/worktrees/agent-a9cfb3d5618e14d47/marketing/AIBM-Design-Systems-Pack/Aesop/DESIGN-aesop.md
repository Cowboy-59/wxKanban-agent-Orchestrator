---
version: alpha
name: Aesop Analysis
description: >
  A quiet, apothecary-grade system painted on an oat-cream canvas (#F6F5E8) with
  near-black charcoal ink (#333), set entirely in the SuisseIntl neo-grotesque at
  a feather-light 400 weight — no rounded corners, almost no shadow, the brand
  voice living in negative space, hairline rules, and rare earthen accents.

colors:
  primary: "#333333"          # charcoal — solid CTA fill, primary buttons, dark bands
  primary-active: "#252525"   # deeper charcoal on press
  on-primary: "#FFFEF2"       # ivory text/icons on charcoal
  dark: "#333333"             # inverted bands / dark surfaces (same charcoal)
  canvas: "#F6F5E8"           # signature oat / parchment page background
  canvas-soft: "#FFFEF2"      # ivory off-tint section / panel background
  surface: "#FFFEF2"          # card / panel surface (ivory, not pure white)
  surface-alt: "#EBEADE"      # sunken chip / quiet fill
  ink: "#333333"              # headings & body text
  ink-secondary: "#666666"    # supporting copy, sub-labels
  ink-muted: "#777777"        # tertiary detail
  ink-faint: "#999999"        # captions / placeholder
  hairline: "rgba(51,51,51,0.2)"  # 1px borders & dividers (≈ #D2D0C4 on canvas)
  hairline-soft: "#EBEADE"    # faintest section divider
  # semantic / decorative accents (used sparingly, never as brand fill):
  accent-link-brown: "#945C26"  # editorial inline links
  accent-link-blue: "#3860BE"   # utility / functional links
  success: "#468254"            # in-stock / confirmation (also bright #32AE88)
  error: "#CA432F"              # sale / error notice

typography:
  display-1: { fontFamily: SuisseIntl, fontSize: 25px, fontWeight: 400, lineHeight: 1.33, letterSpacing: normal }
  heading-1: { fontFamily: SuisseIntl, fontSize: 24px, fontWeight: 400, lineHeight: 1.40, letterSpacing: normal }
  heading-2: { fontFamily: SuisseIntl, fontSize: 24px, fontWeight: 400, lineHeight: 1.33, letterSpacing: normal }
  heading-3: { fontFamily: SuisseIntl, fontSize: 18px, fontWeight: 400, lineHeight: 1.30, letterSpacing: normal }
  title:     { fontFamily: SuisseIntl, fontSize: 16px, fontWeight: 400, lineHeight: 1.40, letterSpacing: normal }
  body-md:   { fontFamily: SuisseIntl, fontSize: 14px, fontWeight: 400, lineHeight: 1.40, letterSpacing: normal }
  body-sm:   { fontFamily: SuisseIntl, fontSize: 12px, fontWeight: 400, lineHeight: 1.20, letterSpacing: normal }
  label:     { fontFamily: SuisseIntl, fontSize: 14px, fontWeight: 700, lineHeight: 1.08, letterSpacing: normal }
  button:    { fontFamily: SuisseIntl, fontSize: 14px, fontWeight: 400, lineHeight: 1.20, letterSpacing: normal }
  caption:   { fontFamily: SuisseIntl, fontSize: 12px, fontWeight: 400, lineHeight: 1.20, letterSpacing: normal }
  eyebrow:   { fontFamily: SuisseIntl, fontSize: 11px, fontWeight: 700, lineHeight: 1.20, letterSpacing: 0.4px }

rounded:
  none: 0px        # the default — every panel, button, image and field is a true rectangle
  xs: 2px          # barely-there softening on a few utility controls
  sm: 3px
  full: 9999px     # circular only — icon hit-areas, swatch dots

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  xxxl: 64px

elevation:
  level-0: "none"                                  # default — flat, hairline-bordered
  level-1: "0 0 4px rgba(51,51,51,0.2)"            # rare, whisper-soft lift on overlays
  level-2: "0 0 18px rgba(0,0,0,0.2)"              # modal / drawer scrim depth

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-sm}", padding: 16px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.none}", padding: "13px 24px", border: "1px solid transparent" }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.none}", padding: "12px 23px", border: "1px solid {colors.ink}" }
  button-text:      { background: "transparent", textColor: "{colors.ink}", typography: "{typography.button}", textDecoration: underline }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.none}", shadow: "{elevation.level-0}", border: "1px solid {colors.hairline-soft}" }
  text-input:       { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.none}", padding: "12px 16px", placeholderColor: "{colors.ink-faint}" }
  badge-pill:       { background: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: "5px 10px" }
---

# Aesop — Design Language Analysis

Aesop's interface is the digital extension of its apothecary: restrained, literary, and almost aggressively quiet. There is no chrome, no gloss, and no decoration competing with the product. The entire system rests on a single warm paper-tone canvas, one near-black ink, one typeface held at a single light weight, and the disciplined absence of rounded corners and shadow. What reads as "premium" here is achieved by subtraction — wide margins, hairline rules, and long unbroken passages of cream.

## Colour

The palette is monochrome with intent. The page sits on an oat / parchment cream — `#F6F5E8` — which is by far the most-painted background on the site, with a lighter ivory `#FFFEF2` used for panels, dark-band text, and surfaces that want to feel a half-step brighter. Text is a soft charcoal `#333333` rather than true black, which keeps long-form copy gentle on the warm ground; supporting copy steps down through `#666666` and `#999999`. The only "dark" surface is the same charcoal `#333333` flipped to a full band, carrying ivory `#FFFEF2` type — this inversion is also the recipe for the primary button. Dividers are never solid lines but a translucent `rgba(51,51,51,0.2)` hairline that dissolves into the cream. Saturated colour is rationed to near-invisibility: an earthen brown `#945C26` and a functional blue `#3860BE` appear only on inline links, a clay red `#CA432F` marks sale or error, and a botanical green (`#468254` / `#32AE88`) signals availability. None of these ever act as a brand fill — the brand colour, effectively, is the paper.

## Typography

Everything is set in **SuisseIntl** (Suisse Int'l, a custom-licensed Swiss neo-grotesque). Because it is proprietary, the showcase substitutes **Inter** — the closest freely available neo-grotesque in proportion and x-height — and labels it as a stand-in. The defining move is weight discipline: headings and body alike default to a light **400**, so hierarchy is built almost entirely from *size and whitespace* rather than boldness. Headings top out around a modest 24–25px; the workhorse body is 14px and the pervasive fine-print / navigation tier is 12px, both at 400 with comfortable ~1.4 line-height. Bold (700) is reserved for small labels, product names in lists, and the occasional CTA — used as punctuation, not emphasis-by-default. Letter-spacing is left at normal almost everywhere; only the tiny 11px eyebrow labels pick up a hair of tracking. The result is editorial and even-toned, closer to a printed catalogue than a typical e-commerce UI.

## Shape & depth

This is a square system. The default border-radius across buttons, cards, inputs, and imagery is **0px** — true rectangles, a core part of the apothecary austerity. The only curves are fully circular (`50%`) icon hit-areas and the rare swatch dot, plus a barely-perceptible 2–3px softening on a couple of utility controls. Depth is treated with the same restraint: the system is essentially flat (`level-0`), separating elements with hairline borders instead of shadow. When elevation does appear it is a whisper — a diffuse `0 0 4px rgba(51,51,51,0.2)` on overlays, deepening only to a `0 0 18px rgba(0,0,0,0.2)` scrim behind modals and the cart drawer.

## Layout & responsive

Spacing follows a 4px base, expressed through generous editorial increments (button padding around 13–14px vertical / 24px horizontal, section rhythm in 32–64px steps). The design leans on large, calm grids — product and content tiles in even multi-column rows — that collapse gracefully: four-up grids fold to two columns on tablet and one on mobile, while the type scale stays nearly fixed because it is already conservative. Navigation is a thin cream bar that recedes into the page, and the overall composition trusts negative space to do the framing, so the breakpoints mostly reflow columns rather than restyle components. The system's identity survives at every width precisely because it depends on so few moving parts: paper, ink, one face, and sharp edges.
