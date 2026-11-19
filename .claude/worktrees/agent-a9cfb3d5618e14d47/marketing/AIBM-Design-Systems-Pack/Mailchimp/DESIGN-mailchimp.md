---
version: alpha
name: Mailchimp Analysis
description: >
  A warm, off-black canvas system where a single jolt of Cavendish Yellow
  carries every CTA, large headlines run unexpectedly light, and the whole
  palette leans into sandy neutrals and a deep teal rather than cold greys.

colors:
  primary: "#ffe01b"            # Cavendish Yellow — every CTA / sign-up button
  primary-active: "#f5d400"     # slightly deeper yellow on press
  on-primary: "#231e15"         # warm near-black text sitting on yellow
  dark: "#241c15"               # inverted dark bands / dark buttons
  dark-alt: "#27455c"           # slate-navy promo band
  accent-teal: "#004e56"        # deep teal — links, brand text accents
  accent-green: "#468254"       # success / positive accent
  accent-blue: "#3860be"        # occasional informational link
  canvas: "#ffffff"             # page background
  canvas-soft: "#f0f4f6"        # cool off-tint section background
  surface: "#f8f8f8"            # card / panel surface
  surface-alt: "#dbd9d2"        # warm sand chip / sunken fill (also hairline)
  surface-warm: "#efeeea"       # softer warm panel
  ink: "#231e15"                # headings & body — warm coconut black
  ink-pure: "#000000"           # secondary near-pure black text
  ink-secondary: "#403b3b"      # muted body
  ink-muted: "#6f6a63"          # 65% ink — supporting copy
  ink-faint: "#575757"          # captions / fine print
  hairline: "#dbd9d2"           # 1px borders & dividers (warm sand)
  hairline-soft: "#efeeea"      # faintest divider
  # semantic: success #468254

typography:
  display-1: { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 48px, fontWeight: 400, lineHeight: 1.05, letterSpacing: -1px }
  display-2: { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 40px, fontWeight: 400, lineHeight: 1.1, letterSpacing: -0.5px }
  heading-1: { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 32px, fontWeight: 400, lineHeight: 1.15, letterSpacing: -0.25px }
  heading-2: { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 24px, fontWeight: 400, lineHeight: 1.33, letterSpacing: normal }
  heading-3: { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 20px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  title:     { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 18px, fontWeight: 500, lineHeight: 1.4, letterSpacing: normal }
  body-lg:   { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 18px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-md:   { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-sm:   { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 13px, fontWeight: 400, lineHeight: 1.45, letterSpacing: normal }
  button:    { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 15px, fontWeight: 600, lineHeight: 1.2, letterSpacing: normal }
  nav:       { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 13px, fontWeight: 500, lineHeight: 1.2, letterSpacing: normal }
  caption:   { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 12px, fontWeight: 400, lineHeight: 1.45, letterSpacing: normal }
  eyebrow:   { fontFamily: "Graphik Web (→ Inter substitute)", fontSize: 11px, fontWeight: 500, lineHeight: 1.25, letterSpacing: 0.3px }

rounded:
  xs: 2px
  sm: 4px
  md: 8px
  lg: 16px
  xl: 26px
  xxl: 32px
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
  level-1: "0 4px 12px rgba(36, 28, 21, 0.12)"
  level-2: "0 15.5px 44px rgba(0, 0, 0, 0.086)"
  focus-ring: "0 0 0 1px #231e15"

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.nav}", padding: "8px" }
  button-primary: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "12px 24px" }
  button-secondary: { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.ink}", rounded: "{rounded.full}", padding: "12px 24px" }
  button-dark:    { background: "{colors.dark}", textColor: "#ffffff", typography: "{typography.button}", rounded: "{rounded.full}", padding: "12px 24px" }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.sm}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:     { background: "{colors.canvas}", border: "1px solid rgba(35,30,21,0.65)", rounded: "{rounded.sm}", padding: "10px 16px", typography: "{typography.body-md}" }
  badge-pill:     { background: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: "5px 10px", typography: "{typography.caption}" }
---

# Mailchimp — Design Language Analysis

Mailchimp's site is built on a deliberately *warm* foundation — not the cool blue-grey of most SaaS, but a coconut-black ink (`#231e15`) on white, accented by sandy neutrals and a single, unmistakable shot of Cavendish Yellow. The personality is confident and editorial: oversized headlines set in a light regular weight, generous whitespace, fully-rounded pill buttons, and shadows tinted brown rather than black. It reads like a brand that trusts its one color to do all the heavy lifting.

## Colour

The palette is anchored by a warm ink ramp rather than a grey one: headings and body sit on `#231e15` (with near-pure `#000000` doing a lot of the running text), softening to `#403b3b`, a 65%-opacity `#6f6a63` for supporting copy, and `#575757` for fine print. Surfaces stay warm too — a cool `#f0f4f6` for alternating section bands, a near-white `#f8f8f8` card fill, and a distinctive sandy `#dbd9d2` that pulls double duty as both the chip/sunken fill and the dominant 1px hairline. The saturated energy is rationed: **Cavendish Yellow `#ffe01b`** owns every primary CTA and sign-up button, paired always with dark text on top (never white). A deep teal `#004e56` carries brand text accents and links, while inverted bands lean on a brown-black `#241c15` or a slate-navy `#27455c`. Supporting semantics — a forest green `#468254` and an occasional blue `#3860be` — appear sparingly. The discipline is the point: one loud color, everything else warm and quiet.

## Typography

The family is **Graphik Web**, a proprietary neo-grotesque; the showcase substitutes **Inter** (nearest Google match) and labels it as such. Hierarchy here is unusual and worth calling out: large headings run at *weight 400*, not bold — 24px, 32px, 40px and 48px all render in regular, with size and tight letter-spacing (rather than weight) doing the differentiating. The result is the airy, magazine-like feel of the brand. Body copy is overwhelmingly 16px/400 (by far the most common pair on the page) with a comfortable 1.5 line-height; navigation, captions and eyebrows drop to a tidy 13px and 11px at weight 500. Buttons are the exception to the light-heading rule, set at 15px/600 for emphasis.

## Shape & depth

Radius is layered: a tight `4px` (with a `3px`/`2px` undertone) is the workhorse for inputs, images and small surfaces, stepping up to `8px` and `16px` for larger cards, and then jumping fully round for interactive controls — CTAs and pills land at `26px`–`40px` and effectively read as `9999px`. Depth is restrained and warm: most cards rest flat with only a hairline, lifting on hover to a soft `0 4px 12px rgba(36,28,21,0.12)` (note the brown tint, not black), with a deeper `0 15.5px 44px rgba(0,0,0,0.086)` reserved for floating/overlay elements. Focus is communicated with a crisp 1px ink ring rather than a glow.

## Layout & responsive

Spacing follows a 4px base unit on a familiar 4 / 8 / 12 / 16 / 24 / 32 / 48 progression, with sections separated by tall vertical padding and faint warm dividers. Content sits in a centered max-width container with comfortable side gutters, and multi-column card and feature grids collapse from four columns to two on tablet and to one on mobile, while the oversized display headline scales down from 48px toward the high-30s/40s so it never overwhelms a small screen. The overall layout language is roomy and editorial, letting the warm neutrals and single yellow accent breathe.
