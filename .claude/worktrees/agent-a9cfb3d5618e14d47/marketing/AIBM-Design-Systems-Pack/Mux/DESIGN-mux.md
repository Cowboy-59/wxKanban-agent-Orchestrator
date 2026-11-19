---
version: alpha
name: Mux Analysis
description: >
  A flat, high-contrast developer brand built on a near-white paper canvas and
  charcoal ink bands, where a hot orange-to-amber CTA and a confetti of pink,
  green and blue accents inject play into an otherwise engineering-precise
  system that leans on a rounded display face, a neo-grotesk body, and a mono
  for labels.

colors:
  primary: "#ff6100"            # hot orange — hero CTA fill
  primary-active: "#bd8209"     # amber-bronze pressed/border variant
  on-primary: "#000000"         # black text on the orange/amber CTAs
  primary-gradient-from: "#ff6100"
  primary-gradient-to: "#ffb200"
  brand-amber: "#ffb200"        # signal-yellow brand band / accent fills
  accent-pink: "#fa50b5"        # decorative — code highlights, illustration
  accent-green: "#1be349"       # decorative — status, illustration
  accent-green-deep: "#00be43"  # decorative — darker green
  accent-blue: "#0091ff"        # decorative — links/illustration accent
  dark: "#242628"               # charcoal — inverted bands, dark panels
  canvas: "#ffffff"             # default page background
  canvas-soft: "#f4f6f4"        # faint off-white section tint
  surface: "#ffffff"            # card / panel surface
  surface-alt: "#e2e4dd"        # warm paper chip / sunken fill
  surface-sunken: "#d0d2c8"     # deeper sand fill / inactive control
  ink: "#000000"                # headings & body text on light
  ink-on-dark: "#ffffff"        # text on charcoal bands
  ink-secondary: "#adb9c6"      # cool grey — secondary text on dark
  ink-muted: "#828c97"          # muted grey — hairlines & quiet labels
  ink-faint: "#565e67"          # faint slate — captions / placeholder
  hairline: "#828c97"           # 1px borders & dividers
  hairline-amber: "#bd8209"     # amber outline on yellow surfaces

typography:
  display-1: { fontFamily: Rotonto, fontSize: 50px, fontWeight: 400, lineHeight: 1.15, letterSpacing: 1px }
  heading-1: { fontFamily: Aeonik, fontSize: 32px, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.5px }
  heading-2: { fontFamily: Aeonik, fontSize: 24px, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.3px }
  heading-3: { fontFamily: Aeonik, fontSize: 21px, fontWeight: 700, lineHeight: 1.25, letterSpacing: normal }
  title:     { fontFamily: Aeonik, fontSize: 18px, fontWeight: 700, lineHeight: 1.33, letterSpacing: normal }
  body-lg:   { fontFamily: Aeonik, fontSize: 18px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-md:   { fontFamily: Aeonik, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-sm:   { fontFamily: Aeonik, fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: normal }
  button:    { fontFamily: Aeonik, fontSize: 16px, fontWeight: 400, lineHeight: 1.0, letterSpacing: 0.5px }
  caption:   { fontFamily: Aeonik, fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  eyebrow:   { fontFamily: JetBrains Mono, fontSize: 14px, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0.4px }

rounded:
  xs: 2px
  sm: 7px
  md: 14px
  lg: 28px
  pill: 112px
  full: 9999px

spacing:
  xxs: 7px
  xs: 14px
  sm: 21px
  md: 28px
  lg: 42px
  xl: 56px
  xxl: 112px

elevation:
  level-0: "none"
  level-1: "none — depth comes from a 1px hairline border"
  level-2: "none — emphasis comes from a charcoal (#242628) fill band, not shadow"

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-sm}", padding: 16px 28px }
  button-primary: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.pill}", padding: "14px 56px", textTransform: uppercase }
  button-secondary: { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.full}", padding: "7px 28px" }
  button-dark:    { background: "{colors.dark}", textColor: "{colors.ink-on-dark}", rounded: "{rounded.pill}", padding: "14px 56px" }
  card:           { backgroundColor: "{colors.surface}", border: "1px solid {colors.hairline}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}" }
  chip:           { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: "7px 28px" }
  text-input:     { backgroundColor: "{colors.canvas}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", padding: "12px 16px", typography: "{typography.body-sm}" }
  badge-pill:     { backgroundColor: "{colors.brand-amber}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.eyebrow}" }
---

# Mux — Design Language Analysis

Mux dresses a deeply technical product — a video API for developers — in a brand that is anything but dry. The system is built on a paper-white canvas interrupted by hard charcoal bands, with type doing most of the structural work: a rounded, almost toy-like display face for headlines, a clean neo-grotesk for everything you read, and a monospace for the eyebrow labels that nod to the terminal. Colour is used sparingly but loudly — one hot orange CTA, a signal-yellow brand band, and a scattering of pink/green/blue accents that show up in illustration and code. There are essentially no drop shadows; the whole thing is flat, edged with 1px hairlines and held together by generous rounded geometry.

## Colour

The palette is a two-pole contrast system. The light pole is a true-white canvas (`#ffffff`) with two warm, papery off-tints — `#f4f6f4` and the sand-toned `#e2e4dd` / `#d0d2c8` used for chips and sunken fills — that keep large light areas from feeling sterile. The dark pole is a single charcoal, `#242628`, deployed as full-bleed bands and panels; on it, text steps down through a cool-grey ramp (`#adb9c6` secondary, `#828c97` muted, `#565e67` faint) rather than through opacity. Ink on light is pure black.

The one job-doing saturated colour is the CTA orange, `#ff6100`, which pairs with the signal-yellow `#ffb200` to form the brand's hero gradient and its bronze-amber pressed/border state (`#bd8209`). Beyond that, Mux keeps a small confetti box of decorative accents — pink `#fa50b5`, greens `#1be349`/`#00be43`, blue `#0091ff` — that never carry UI meaning on their own but bring energy to code snippets, diagrams, and illustration. Borders are the muted grey `#828c97` at 1px; on yellow surfaces the hairline shifts to amber.

## Typography

Three families, each with a clear job. **Rotonto** (a proprietary rounded display face; substituted here with **Fredoka** from Google Fonts as the nearest rounded match) carries the big uppercase headlines at ~50px with a hair of positive tracking — its softness is the single most recognisable thing about the brand. **Aeonik** (proprietary neo-grotesk; substituted with **Inter**) does all the real reading work and every interface label, anchored on a dominant 16px/400 body tier with a 14px small tier close behind. **JetBrains Mono** — which is genuinely on Google Fonts, so no substitution needed — handles eyebrows and meta labels in uppercase, a deliberate engineering wink. Hierarchy is built mostly by switching family and weight (400 body vs. 700 headings) rather than by a deep size ramp; the heading sizes cluster tightly at 18/21/24/32px.

## Shape & depth

Geometry is round and confident. Radii run from a barely-there 2px through 7px, 14px and 28px up to a 112px "pill" used on the primary buttons and a true `9999px` full-round on chips and icon controls. The signature button shape is a tall pill (112px radius, 14×56px padding) in hot orange. Depth is almost entirely flat: the extraction surfaced **no box-shadows at all**. Separation and emphasis come from two devices instead — 1px grey hairline borders around cards and inputs, and solid charcoal fill bands that the page cuts to when a section wants weight. This is a border-and-colour system, not a shadow-and-elevation one.

## Layout & responsive

Spacing follows a 7px-derived rhythm — padding and gaps land on 7 / 14 / 28 / 56 / 112px, a doubling scale that mirrors the radius tiers and gives the layout its blocky, modular feel. Content sits in a centred column with comfortable gutters, and component grids (cards, listings, pricing) run four-up on desktop. On the way down, multi-column grids collapse to two columns at the tablet breakpoint and to a single stacked column on phones, while the oversized display headline steps down so it never overruns the viewport. The charcoal/white banding remains the primary organising structure at every width.
