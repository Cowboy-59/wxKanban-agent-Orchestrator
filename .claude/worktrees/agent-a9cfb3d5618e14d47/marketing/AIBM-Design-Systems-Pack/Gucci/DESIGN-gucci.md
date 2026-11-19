---
version: alpha
name: Gucci Analysis
description: >
  A near-monochrome editorial system where pure black ink sits on white canvas,
  hierarchy is built almost entirely from an ultra-thin display weight and tight
  negative letter-spacing, corners stay razor-sharp, and shadows all but vanish —
  the only colour is the discipline of black, white, and a quiet grey ramp.

colors:
  primary: "#000000"          # CTAs, links, brand marks — black IS the brand colour
  primary-active: "#333333"   # hover/pressed fill (derived; black eases up slightly)
  on-primary: "#ffffff"       # text/icons on black fills
  dark: "#000000"             # dark buttons, inverted bands, footer
  canvas: "#ffffff"           # page background
  canvas-soft: "#f4f4f4"      # off-tint section / sunken band
  surface: "#ffffff"          # card / panel surface
  surface-alt: "#f4f4f4"      # chip / pill / sunken fill
  ink: "#000000"              # headings & body text
  ink-secondary: "#555555"    # secondary copy
  ink-muted: "#767676"        # tertiary / meta text
  ink-faint: "#999999"        # placeholder / disabled (derived)
  hairline: "#dddddd"         # 1px borders, dividers, input rules
  hairline-soft: "#ebebeb"    # faint section dividers (derived)
  success: "#32ae88"          # validation accent (observed on field borders)
  success-surface: "#f9fffa"  # success field background tint
  # Excluded as noise: rgb(0,0,238) default-link blue (unstyled <a> wrappers,
  # visible link text is black) and rgb(39,69,92) navy (0×0 hidden spans only).

typography:
  display-1: { fontFamily: Archivo, fontSize: 32px, fontWeight: 100, lineHeight: 1.5, letterSpacing: -0.96px }
  heading-1: { fontFamily: Archivo, fontSize: 24px, fontWeight: 400, lineHeight: 1.33, letterSpacing: -0.5px }
  heading-2: { fontFamily: Archivo, fontSize: 20px, fontWeight: 500, lineHeight: 1.4, letterSpacing: -0.6px }
  heading-3: { fontFamily: Archivo, fontSize: 16px, fontWeight: 700, lineHeight: 1.5, letterSpacing: -0.48px }
  title:     { fontFamily: Archivo, fontSize: 16px, fontWeight: 500, lineHeight: 1.5, letterSpacing: -0.64px }
  body-lg:   { fontFamily: Archivo, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: -0.2px }
  body-md:   { fontFamily: Archivo, fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: normal }
  body-sm:   { fontFamily: Archivo, fontSize: 13px, fontWeight: 400, lineHeight: 1.38, letterSpacing: normal }
  button:    { fontFamily: Archivo, fontSize: 12px, fontWeight: 600, lineHeight: 1.33, letterSpacing: 0.5px, textTransform: uppercase }
  caption:   { fontFamily: Archivo, fontSize: 12px, fontWeight: 500, lineHeight: 1.33, letterSpacing: -0.36px }
  eyebrow:   { fontFamily: Archivo, fontSize: 12px, fontWeight: 700, lineHeight: 1.33, letterSpacing: -0.6px, textTransform: uppercase }
  # Proprietary face is "Gucci Sans Pro"; Archivo is the nearest-Google substitute.

rounded:
  xs: 1px
  sm: 2px
  md: 4px
  lg: 5px
  xl: 20px
  xxl: 50px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px

elevation:
  level-0: "none"
  level-1: "0 4px 8px rgba(0,0,0,0.08)"
  level-2: "0 0 18px rgba(0,0,0,0.20)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.caption}", borderBottom: "1px solid {colors.hairline}", padding: "16px 40px" }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "0", padding: "10px 30px" }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.ink}", typography: "{typography.button}", rounded: "0", padding: "9px 29px" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.xs}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:       { background: "transparent", borderBottom: "1px solid {colors.hairline}", rounded: "0", typography: "{typography.body-lg}", padding: "16px 0 8px" }
  badge-pill:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink}", typography: "{typography.caption}", rounded: "{rounded.full}", padding: "5px 12px" }
---

# Gucci — Design Language Analysis

Gucci's storefront is an exercise in restraint dressed as luxury. Strip away the photography and what remains is almost aggressively plain: black type on white, a centred wordmark, hairline rules, and an enormous amount of negative space carrying the brand instead of colour or ornament. The system makes one bet — that confidence reads as quiet — and commits to it on every surface. There is essentially no palette to speak of, no shadow language to learn, and no rounded softness to lean on. Hierarchy is carried by one device the brand uses with unusual conviction: weight and tracking, not hue.

## Colour

The palette is monochrome by design, not by omission. Pure black (`#000000`) dominates everything — it appears on the overwhelming majority of text and is also the fill for every functional surface that needs emphasis: filled buttons, inverted bands, the footer. White (`#ffffff`) is the canvas and the colour that black type and imagery sit on; it is also the text colour the instant the ground flips to black. Between those two poles sits a tight, disciplined grey ramp — `#555555` for secondary copy, `#767676` for meta, and a faint `#999999` for placeholders — used sparingly so the page never feels busy. Structure is drawn with hairlines rather than fills: a 1px `#dddddd` rule separates the nav, underlines inputs, and divides list rows, with an even softer `#ebebeb` for quiet section breaks. The only chromatic note in the entire system is a functional one — a success green (`#32ae88`) on validated field borders over a barely-there `#f9fffa` tint — reserved strictly for form feedback. Two colours that the raw extraction surfaced were deliberately excluded: a high-frequency default-link blue (`rgb(0,0,238)`) that belongs to unstyled anchor wrappers whose visible text is actually black, and a navy (`#27455c`) that only ever appeared on zero-size hidden spans. Neither paints a visible pixel, so neither earns a token.

## Typography

The face is **Gucci Sans Pro**, a proprietary clean grotesque; this system substitutes **Archivo** from Google Fonts as the nearest match and labels it as such. The brand builds its entire hierarchy from two levers — weight and letter-spacing — rather than dramatic size jumps. The signature move is an **ultra-thin display weight (100)**: the largest editorial headlines render at a feathery hairline weight with markedly tight tracking (the captured display is 32px / weight 100 / line-height 1.5 / `-0.96px`), and on wide viewports that same thin treatment scales up substantially while keeping its airy, drawn-out feel. The workhorse of the interface is not a body size at all but a **12px / weight 500 label** with `-0.36px` tracking — it carries the navigation, menus, and microcopy, and is the single most-used type pairing on the page. Body copy settles at 16px / 400, and section headings climb through 16px and 20px in medium-to-bold weights. The defining detail throughout is **negative letter-spacing**: even uppercase eyebrows like the "MADE IN ITALY" tag pull their letters tighter (`-0.6px`), which is counterintuitive for caps and gives the brand its compact, deliberate voice. The one place tracking flips positive is the functional filled button, where uppercase labels open up to roughly `+0.5px` for legibility — a small, telling exception to an otherwise tight system.

## Shape & depth

Gucci is sharp. Corner radii cluster at 1–2px — effectively square — and the larger values that exist (5px, 20px, 50px) are rare and reserved for the odd circular icon button or pill chip rather than any general softening of the UI. Filled and outline buttons render with no perceptible radius at all. Depth is treated with the same minimalism: the system is overwhelmingly flat, relying on hairline borders and whitespace to separate elements. When a shadow does appear it is faint and singular — a soft `0 4px 8px rgba(0,0,0,0.08)` lift on the occasional hovered card (level 1), with a deeper `0 0 18px rgba(0,0,0,0.20)` halo reserved for floating overlays and dialogs (level 2). Most of the interface lives at level 0, bordered or borderless, with nothing floating.

## Layout & responsive

Spacing follows an 8px base with a 4px half-step, but the storefront's real signature is its generosity: page gutters and module padding run to 40px and beyond, and vertical rhythm is loose, letting full-bleed photography and centred type breathe. The top navigation is a white bar with the GUCCI wordmark centred and utilities flanking it, separated from the content by a single hairline. Content is organised as edge-to-edge image modules and multi-column product grids that collapse predictably toward mobile — four-up product rows step down to two-up, then to a single column, while the centred display type reduces in size but never abandons its thin weight or tight tracking. Inputs are drawn as underlined fields rather than boxed ones, reinforcing the hairline-over-fill philosophy that runs through the whole system. The net effect on any breakpoint is the same: lots of white, a little black, and almost nothing else competing for attention.
