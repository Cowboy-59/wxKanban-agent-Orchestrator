---
version: alpha
name: Rivian Analysis
description: >
  A near-black-on-white outdoor-tech system where almost everything is ink
  (#151515) and surface, restraint held tight until one electric Rivian Yellow
  (#FFAC00) pill earns the click — softened by atmospheric blue-grey gradients
  and a fully pill-rounded geometry that feels engineered, not decorated.

colors:
  primary: "#ffac00"          # Rivian Yellow — CTAs, demo-drive pills, active marks
  primary-active: "#ffaa00"   # slightly warmer pressed variant
  on-primary: "#151515"       # near-black text/icon sitting on the yellow
  dark: "#151515"             # inverted dark bands / dark buttons
  dark-deep: "#000000"        # true-black hero overlays & footer
  canvas: "#ffffff"           # page background
  canvas-soft: "#f2f2f2"      # off-white section bands
  surface: "#ffffff"          # card / panel surface
  surface-alt: "#ececec"      # chips, sunken fills
  surface-mute: "#e5e5e5"     # secondary sunken fill / inset
  ink: "#151515"              # headings & body text (the dominant color)
  ink-secondary: "#636363"    # supporting copy
  ink-muted: "#808080"        # captions / metadata
  ink-faint: "#9b9b9b"        # placeholder / disabled
  hairline: "#d8d8d8"         # 1px borders & dividers
  hairline-strong: "#c1c1c1"  # heavier rules / input borders
  # decorative accents (product/atmosphere imagery, not UI chrome):
  accent-sky: "#8ba8bd"       # blue-grey gradient terminator
  accent-lavender: "#9fa1b8"  # soft glow shadow tint
  accent-azure: "#77afd8"     # sky-blue product accent
  accent-forest: "#629b5c"    # Forest Edge green
  accent-ember: "#e84826"     # warm orange-red product accent
  # signature CTA gradient (atmospheric section wash):
  primary-gradient-from: "#f2f2f2"
  primary-gradient-to: "#8ba8bd"

typography:
  display-1: { fontFamily: Adventure, fontSize: 56px, fontWeight: 600, lineHeight: 1.07, letterSpacing: -2.5px }
  display-2: { fontFamily: Adventure, fontSize: 44px, fontWeight: 600, lineHeight: 1.1, letterSpacing: -1.5px }
  heading-1: { fontFamily: Adventure, fontSize: 44px, fontWeight: 500, lineHeight: 1.1, letterSpacing: -1px }
  heading-2: { fontFamily: Adventure, fontSize: 24px, fontWeight: 500, lineHeight: 1.2, letterSpacing: -0.5px }
  heading-3: { fontFamily: Adventure, fontSize: 20px, fontWeight: 600, lineHeight: 1.25, letterSpacing: -0.3px }
  title:     { fontFamily: Adventure, fontSize: 20px, fontWeight: 500, lineHeight: 1.3, letterSpacing: -0.3px }
  body-lg:   { fontFamily: Adventure, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  body-md:   { fontFamily: Adventure, fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: 0px }
  body-sm:   { fontFamily: Adventure, fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0px }
  button:    { fontFamily: Adventure, fontSize: 14px, fontWeight: 600, lineHeight: 1.14, letterSpacing: -0.14px }
  caption:   { fontFamily: Adventure, fontSize: 11px, fontWeight: 400, lineHeight: 1.3, letterSpacing: 0px }
  eyebrow:   { fontFamily: Adventure, fontSize: 10px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0.2px }

rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 20px
  xl: 40px
  xxl: 80px
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
  level-1: "0 2px 8px rgba(0,0,0,0.15)"
  level-2: "0 0 10px rgba(159,161,184,0.6)"

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 8px 12px }
  button-primary: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 8px 16px }
  button-secondary: { background: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.xl}", padding: 8px 16px }
  button-dark:    { background: "{colors.dark}", textColor: "#ffffff", typography: "{typography.button}", rounded: "{rounded.full}", padding: 8px 16px }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:     { backgroundColor: "{colors.canvas}", border: "1px solid {colors.hairline-strong}", rounded: "{rounded.sm}", textColor: "{colors.ink}", padding: 12px 16px }
  badge-pill:     { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: 4px 10px }
---

# Rivian — Design Language Analysis

Rivian's site reads like the brand's vehicles: clean, durable, and almost monochrome until a single deliberate accent does the work. The page is overwhelmingly ink-on-white — the most-used text color by a wide margin is a near-black `#151515`, not pure black — set in the company's proprietary "Adventure" typeface. Hierarchy is built through scale and tight negative tracking rather than color or decoration, and the only consistently saturated UI color is Rivian Yellow, reserved for the action that matters. The result is a system that feels engineered and outdoorsy at once: lots of restraint, soft atmospheric gradients borrowed from sky and landscape, and fully rounded "pill" geometry throughout.

## Colour

The palette is a disciplined neutral ramp with one electric exception. Text sits on a four-step ink ramp — `#151515` for headings and body, `#636363` for supporting copy, `#808080` for captions and metadata, and a faint `#9b9b9b` for placeholders — over a white `#ffffff` canvas broken up by `#f2f2f2` off-white bands and the occasional true-black (`#000000` / `#151515`) inverted hero or footer. Dividers and borders use a quiet `#d8d8d8` hairline, stepping to `#c1c1c1` for heavier rules and input outlines. Against all that grey, **Rivian Yellow `#ffac00`** (with a warmer `#ffaa00` near-twin) is the single brand-saturated color, appearing only on primary CTAs like the demo-drive pill and on active marks — paired with near-black text rather than white for that high-contrast, safety-equipment look. Beyond the chrome, a set of softer decorative accents drawn from product and atmosphere imagery — blue-grey `#8ba8bd`, lavender-grey `#9fa1b8`, sky `#77afd8`, Forest Edge green `#629b5c`, and a warm ember `#e84826` — surface in gradients and trim. The signature gradient is a vertical wash from off-white `#f2f2f2` up into `#8ba8bd`, evoking horizon and sky.

## Typography

Everything is set in **Adventure**, Rivian's custom-licensed brand sans, falling back to Helvetica Neue / Helvetica / Arial — a neutral, slightly geometric grotesque. *(Adventure is proprietary; the showcase substitutes the nearest Google match, **Inter**, and labels it as a stand-in.)* Hierarchy comes almost entirely from size and tracking: display headlines run 56px at weight 600 with an aggressive `-2.5px` letter-spacing and a tight 1.07 line-height, giving big statements a condensed, confident set. Secondary display and section heads step down to 44px and 24px, still negatively tracked. Body copy is a calm 16px/400 at a comfortable 1.5 line-height, with 14px/400 as the dense secondary tier used across nav and supporting text. Interface labels — nav items and buttons — are 14px at weight 600 with a hair of negative tracking (`-0.14px`). Weight only really spans 400 to 600; the system almost never goes heavier, leaning on size and spacing instead of bold.

## Shape & depth

Rivian's geometry is rounded and soft. The dominant control shape is the full pill (`9999px`) — nav buttons, the yellow demo-drive CTA, and chips are all fully rounded — while larger interactive surfaces and secondary buttons use a generous `40px` radius and cards land around `20px`. Smaller utility radii of `12px`, `8px`, and `4px` appear on inputs and minor elements. Depth is almost absent: the system is overwhelmingly flat, relying on the `#d8d8d8` hairline and tonal section bands for separation. Where shadow does appear it's subtle and atmospheric — a soft `0 2px 8px rgba(0,0,0,0.15)` lift on floating elements, and a diffuse lavender-tinted glow (`0 0 10px rgba(159,161,184,0.6)`) on select product surfaces, more ambient light than drop shadow.

## Layout & responsive

The layout works on an 8px base unit (4 / 8 / 12 / 16 / 24 / 32 / 48), with content held in wide full-bleed media bands stacked vertically — hero, then alternating image-led feature sections. Navigation is a centered pill cluster of text buttons. On smaller viewports the multi-column feature grids collapse to two-up and then single-column, the centered nav condenses to a menu, and the 56px display type scales down so the tight tracking still reads. The overall feel is editorial and image-forward: generous whitespace, few borders, type and photography carrying the page rather than boxes and cards.
