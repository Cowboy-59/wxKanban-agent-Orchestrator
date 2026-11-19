---
version: alpha
name: Clay Analysis
description: >
  A warm-paper canvas and crisp black ink anchor a confident, editorial
  product brand, punctuated by a signature acid-lime pop and a playful set
  of pastel accent fills — blue, peach, pink, purple — that turn an
  otherwise minimal, hairline-and-flat interface into something distinctly
  Clay.

colors:
  primary: "#cbd810"          # signature acid-lime — brand pop, accent CTA fills
  primary-active: "#b6c20e"   # pressed lime (derived darkening)
  on-primary: "#000000"       # black text/icon on lime
  dark: "#1b1a18"             # dark buttons & inverted hero band
  on-dark: "#fefdfb"          # warm off-white text on dark band
  canvas: "#f4f3f0"           # dominant page background — warm paper
  canvas-soft: "#fefdfb"      # softer off-white section background
  surface: "#ffffff"          # cards / panels / inputs
  surface-alt: "#f3f2ed"      # chip / secondary button fill
  ink: "#000000"              # headings & body (dominant)
  ink-secondary: "#55534e"
  ink-muted: "#7b7974"
  ink-faint: "#d1cdc7"        # placeholder / faint dividers
  hairline: "#d1cdc7"         # 1px borders & dividers (often at 50% alpha)
  # decorative accent fills — pastel "highlighter" set used on tiles, rings, illustrations
  accent-blue: "#bedffe"      # light fill / focus ring  (saturated link blue #429eff)
  accent-peach: "#fcc9ab"
  accent-lime: "#eef773"      # lighter lime fill (vs. saturated #cbd810)
  accent-pink: "#f8b9e4"      # saturated pink #ff70d2
  accent-purple: "#a17bf9"
  accent-orange: "#ff7714"

typography:
  display-1:  { fontFamily: "Hanken Grotesk", fontSize: 64px, fontWeight: 575, lineHeight: 1.0, letterSpacing: -2.56px }
  display-2:  { fontFamily: "Hanken Grotesk", fontSize: 56px, fontWeight: 500, lineHeight: 1.0, letterSpacing: -1.68px }
  heading-1:  { fontFamily: "Hanken Grotesk", fontSize: 36px, fontWeight: 500, lineHeight: 1.0, letterSpacing: -1.44px }
  heading-2:  { fontFamily: "Hanken Grotesk", fontSize: 24px, fontWeight: 500, lineHeight: 1.1, letterSpacing: -0.5px }
  title:      { fontFamily: "Hanken Grotesk", fontSize: 20px, fontWeight: 500, lineHeight: 1.2, letterSpacing: -0.3px }
  body-lg:    { fontFamily: "Hanken Grotesk", fontSize: 18px, fontWeight: 400, lineHeight: 1.45, letterSpacing: -0.1px }
  body-md:    { fontFamily: "Hanken Grotesk", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-sm:    { fontFamily: "Hanken Grotesk", fontSize: 14px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  button:     { fontFamily: "Hanken Grotesk", fontSize: 14px, fontWeight: 500, lineHeight: 1.5, letterSpacing: -0.14px }
  caption:    { fontFamily: "Hanken Grotesk", fontSize: 12.8px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  eyebrow:    { fontFamily: "Hanken Grotesk", fontSize: 10px, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0.4px }

rounded:
  xs: 8px
  sm: 12px
  md: 14px
  lg: 16px
  xl: 18px
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
  level-0: "none"                                    # the default — hairline borders carry the structure
  level-1: "0 4px 8px rgba(0,0,0,0.15)"              # the one observed drop shadow (overlays/menus)
  level-2: "0 12px 32px rgba(0,0,0,0.12)"            # deeper modal/popover (derived)
  ring-accent: "0 0 0 2px {colors.accent-blue} inset" # signature pastel inset focus ring

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", padding: 8px 16px }
  button-primary:   { background: "{colors.dark}", textColor: "{colors.on-dark}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 8px 16px }
  button-accent:    { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.lg}", padding: 9px 18px }
  button-secondary: { background: "{colors.surface-alt}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 8px 16px }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.xl}", border: "1px solid {colors.hairline}", shadow: "{elevation.level-0}" }
  text-input:       { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.xxl}", padding: 11px 16px, placeholder: "{colors.ink-faint}" }
  badge-pill:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: 5px 10px }
---

# Clay — Design Language Analysis

Clay reads like a well-set editorial product page rather than a typical SaaS template. The whole interface sits on a warm, paper-toned off-white (`#f4f3f0`) instead of pure white, which immediately softens the screen and makes the black type feel printed rather than rendered. Structure is carried almost entirely by 1px hairlines and generous rounding; drop shadows are rare. Personality comes from two places: a confident, tightly-tracked display type, and a small kit of saturated "highlighter" accents — acid-lime, sky blue, peach, pink, and purple — that appear as tile fills, illustration washes, and focus rings.

## Colour

The palette is built on a warm neutral ramp: a paper `canvas` (`#f4f3f0`), softer `canvas-soft` (`#fefdfb`), white `surface` for cards and inputs, and a near-stone `surface-alt` (`#f3f2ed`) for chips and secondary buttons. Ink is essentially black (`#000000` dominates by a wide margin), stepping down through `#55534e` and `#7b7974` to a faint `#d1cdc7` used for placeholders and half-alpha dividers. The signature saturated colour is an acid-lime (`#cbd810`, with a lighter `#eef773` fill variant) — it is the brand pop and shows up on accent CTAs and marks. Around it sits a pastel accent set — blue (`#bedffe` / link `#429eff`), peach (`#fcc9ab`), pink (`#f8b9e4` / `#ff70d2`), purple (`#a17bf9`), orange (`#ff7714`) — used decoratively on tiles and as colored inset rings rather than as semantic status colors. Primary action buttons are not lime; they are near-black (`#1b1a18`) with warm off-white text, with the lime reserved as a brand accent. Inverted hero bands flip to a dark ground with `#fefdfb` text.

## Typography

The site renders in **Roobertvf** — Roobert, a proprietary geometric grotesque — which the showcase substitutes with the closest Google match, **Hanken Grotesk**, labeled as a stand-in. Hierarchy is driven primarily by size and tight negative tracking rather than heavy weight contrast: the hero display is 64px at a 575 weight with -2.56px letter-spacing and a 1.0 line-height, and section heads step down through 56px and 36px, each holding line-height near 1.0 with progressively less negative tracking. Body weights stay restrained — the overwhelmingly dominant body style is 16px / 400 — with 500 used for emphasis, labels, and buttons. Buttons run small (≈14px / 500) with a hair of negative tracking, and eyebrows are ~10px, 600 weight, uppercase, lightly spaced. The effect is editorial and assured: big tracked headlines over calm, plain body text.

## Shape & depth

Rounding is everywhere and fairly large. The most frequent radius is 18px, with a full tier from 8px (small controls) through 12–16px (buttons, chips) up to 18px (cards), 40px (large containers/inputs), and effectively-pill values for tags. Depth, by contrast, is deliberately shallow: Clay is a flat, hairline-structured interface. Only a single soft drop shadow (`0 4px 8px rgba(0,0,0,0.15)`) appears, on overlay-type elements. The more characteristic "elevation" is a colored 2px inset ring in one of the pastel accents (`#bedffe`, `#fcc9ab`, `#eef773`, `#f8b9e4`), used to highlight cards and inputs — a brand device standing in for conventional shadow.

## Layout & responsive

Spacing follows an 8px base (8 / 16 padding pairs are pervasive), extending to a 4 / 8 / 12 / 16 / 24 / 32 / 48 scale. Content is centered in a wide column with comfortable horizontal gutters, and component grids (feature tiles, logo walls, cards) sit at three to four columns on desktop. The brand's warm canvas and hairline dividers mean sections are separated by tone and rule rather than by heavy cards. On smaller viewports the multi-column grids collapse toward two columns and then one, and the display sizes drop substantially so the tightly-tracked headlines stay on a few lines without overflowing.
