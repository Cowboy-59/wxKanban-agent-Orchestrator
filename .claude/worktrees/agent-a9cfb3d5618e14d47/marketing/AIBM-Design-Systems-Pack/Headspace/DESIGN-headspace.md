---
version: alpha
name: Headspace Analysis
description: >
  A warm, calming system built on a sand-toned canvas and soft charcoal ink,
  where a single confident cobalt blue carries every action and a sunny
  marigold yellow plays the brand's friendly accent — rounded, generous, and
  unhurried, like the app it sells.

colors:
  primary: "#0061ef"           # cobalt CTAs, links, brand actions
  primary-active: "#004fc4"    # pressed/hover (derived darker step)
  on-primary: "#ffffff"        # text/icon on primary & dark
  accent-yellow: "#ffce00"     # signature marigold — highlights, illustration fills
  accent-slate: "#27455c"      # deep teal-slate band background
  accent-green: "#468254"      # secondary illustration green
  dark: "#2d2c2b"              # near-black for inverted bands & dark buttons
  canvas: "#f9f4f2"            # warm sand page background
  canvas-soft: "#f4eeeb"       # slightly deeper warm section tint
  surface: "#ffffff"           # cards / panels
  surface-alt: "#f9f4f2"       # chip / sunken warm fill
  ink: "#2d2c2b"               # headings
  ink-secondary: "#44423f"     # body copy (most frequent text)
  ink-muted: "#4b4c4d"         # supporting text
  ink-faint: "#757575"         # captions / placeholder
  hairline: "#e2ded9"          # 1px borders, button outlines, dividers

typography:
  display-1: { fontFamily: "Hanken Grotesk", fontSize: 72px, fontWeight: 700, lineHeight: 1.0, letterSpacing: -2.16px }
  display-2: { fontFamily: "Hanken Grotesk", fontSize: 64px, fontWeight: 700, lineHeight: 1.0, letterSpacing: -1.92px }
  heading-1: { fontFamily: "Hanken Grotesk", fontSize: 52px, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.56px }
  heading-2: { fontFamily: "Hanken Grotesk", fontSize: 40px, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.2px }
  heading-3: { fontFamily: "Hanken Grotesk", fontSize: 32px, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.96px }
  title:     { fontFamily: "Hanken Grotesk", fontSize: 24px, fontWeight: 700, lineHeight: 1.25, letterSpacing: -0.5px }
  body-lg:   { fontFamily: "Hanken Grotesk", fontSize: 20px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  body-md:   { fontFamily: "Hanken Grotesk", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  body-sm:   { fontFamily: "Hanken Grotesk", fontSize: 14px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  button:    { fontFamily: "Hanken Grotesk", fontSize: 16px, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0 }
  caption:   { fontFamily: "Hanken Grotesk", fontSize: 12px, fontWeight: 500, lineHeight: 1.4, letterSpacing: 0 }
  eyebrow:   { fontFamily: "Hanken Grotesk", fontSize: 12px, fontWeight: 500, lineHeight: 1.4, letterSpacing: 0.4px }

rounded:
  xs: 2px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 112px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 64px

elevation:
  level-0: "none"
  level-1: "0 1px 8px rgba(20,19,19,0.2)"
  level-2: "0 0 18px rgba(0,0,0,0.2)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", padding: 16px 24px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.xl}", padding: 14px 24px }
  button-dark:      { background: "{colors.dark}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.xl}", padding: 14px 24px }
  button-secondary: { background: "{colors.surface}", textColor: "{colors.ink-secondary}", border: "2px solid {colors.hairline}", typography: "{typography.body-md}", rounded: "{rounded.sm}", padding: 8px 24px }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.md}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:       { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", padding: 12px 16px }
  badge-pill:       { backgroundColor: "{colors.surface}", textColor: "{colors.ink-secondary}", rounded: "{rounded.full}", padding: 8px 16px }
---

# Headspace — Design Language Analysis

Headspace's website is the visual equivalent of a slow exhale. Nothing is sharp, nothing is cold, and nothing shouts. The system rests on a warm sand-colored canvas, sets type in a soft charcoal rather than true black, rounds nearly every corner, and reserves saturated color for two jobs only: a single cobalt blue that means "do this," and a marigold yellow that means "this is us." The result reads as approachable and unclinical — a deliberate counterpoint to the medical seriousness of the mental-health category it competes in.

## Colour

The palette is split cleanly into a warm neutral foundation and a tiny set of bright signals. The page background is a sand off-white (`#f9f4f2`) — not the usual stark `#ffffff`, which is held back for cards and panels so surfaces feel like they sit *on* the page rather than disappear into it. Text never goes to pure black: an ink ramp runs from `#2d2c2b` for headings, through `#44423f` for the bulk of body copy (by far the most frequently painted text color), down to `#4b4c4d` and `#757575` for supporting and faint text. One saturated color does the heavy lifting — a confident cobalt `#0061ef` that appears on every primary button, link, and brand action, almost always as a fully-rounded pill. The brand's emotional accent is a sunny marigold `#ffce00`, used in illustration fills and highlights rather than UI chrome, with a deep teal-slate (`#27455c`) and a muted green (`#468254`) appearing in occasional full-bleed bands. Borders are a single warm hairline (`#e2ded9`) — the same family as the canvas, so dividers whisper instead of cut. No CSS gradients were detected; depth and warmth come from color and illustration, not from gradient washes.

## Typography

The site is set in **Headspace Apercu**, a proprietary humanist grotesque commissioned for the brand; the showcase substitutes **Hanken Grotesk** from Google Fonts, the closest open match for its warm, slightly geometric character. Hierarchy is built almost entirely on *size and weight*, not color or style — body text and headings share the same ink family, and the system runs on just two weights: regular (400) for reading and bold (700) for everything that needs presence. The dominant body tier is 16px/400 at a relaxed 1.5 line-height, which accounts for the overwhelming majority of rendered type. Display sizes are large and tightly tracked: hero headlines climb to 52–72px at 700 weight with negative letter-spacing as steep as -2px, pulling big words into compact, confident blocks. A small 12px/500 caption tier handles eyebrows and metadata.

## Shape & depth

Roundness is the system's signature. Radii cluster into a clear ladder — 2px for the smallest chrome, 8px for compact controls and inputs, 16px and 24px for cards, and a 32px pill for standard buttons that pushes all the way to 112px (and effectively full-round) on the largest hero CTAs. Depth is used sparingly and softly: most cards sit flat with only a hairline border (level 0), lifting to a gentle, low-contrast shadow on hover (`0 1px 8px rgba(20,19,19,0.2)`), with a slightly more diffuse glow (`0 0 18px rgba(0,0,0,0.2)`) reserved for floating or modal surfaces. The overall effect is tactile but quiet — rounded and cushioned, never glassy or heavily layered.

## Layout & responsive

Spacing follows an 8px base unit (with a 4px sub-step), visible in the repeated 8 / 16 / 24px paddings on buttons and sections, scaling up to generous 64px+ rhythm between major bands. Content sits in a centered column with wide, calm margins; sections are stacked full-width and often alternate between the sand canvas and white or colored bands to segment the long marketing page. On smaller viewports the multi-column grids of cards and listings collapse to two-up and then single-column, hero display sizes step down, and the generous side margins tighten — preserving the same airy, unhurried feel at every width.
