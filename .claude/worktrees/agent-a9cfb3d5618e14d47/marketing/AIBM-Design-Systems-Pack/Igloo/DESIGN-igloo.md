---
version: alpha
name: Igloo Inc. Analysis
description: >
  A cold, cinematic monochrome — a single grey-blue canvas (#A0A5B1) lit only by
  white and near-black IBM Plex Mono, where the entire visible interface is a
  terminal-style ASCII loading bar and the brand voice lives in razor-sharp,
  zero-radius, zero-shadow restraint before the WebGL world takes over.

colors:
  primary: "#0E0F12"          # near-black — CTAs, accents, links, indicators
  primary-active: "#000000"   # pressed
  on-primary: "#FFFFFF"       # text/icon on the dark CTA
  dark: "#0E0F12"             # inverted bands / solid buttons
  inverse: "#FFFFFF"          # the signature loader ink — white on grey
  canvas: "#A0A5B1"           # the page background (CSS var --bgColor)
  canvas-soft: "#969BA7"      # darker section band
  surface: "#AEB3BD"          # raised panel tint
  surface-alt: "#9197A3"      # sunken chip / field fill
  ink: "#0E0F12"              # headings & body text
  ink-secondary: "#2C2F36"
  ink-muted: "#4E525C"
  ink-faint: "#676B76"        # captions / placeholder
  hairline: "#7C808B"         # 1px borders & dividers
  hairline-soft: "#8B8F9A"

typography:
  display-1: { fontFamily: "IBM Plex Mono", fontSize: 56px, fontWeight: 500, lineHeight: 1.04, letterSpacing: -0.5px }
  display-2: { fontFamily: "IBM Plex Mono", fontSize: 40px, fontWeight: 500, lineHeight: 1.08, letterSpacing: -0.3px }
  heading-1: { fontFamily: "IBM Plex Mono", fontSize: 28px, fontWeight: 500, lineHeight: 1.15, letterSpacing: 0px }
  heading-2: { fontFamily: "IBM Plex Mono", fontSize: 20px, fontWeight: 500, lineHeight: 1.2, letterSpacing: 0px }
  heading-3: { fontFamily: "IBM Plex Mono", fontSize: 16px, fontWeight: 500, lineHeight: 1.3, letterSpacing: 0px }
  body-lg:   { fontFamily: "IBM Plex Mono", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  body-md:   { fontFamily: "IBM Plex Mono", fontSize: 14px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  body-sm:   { fontFamily: "IBM Plex Mono", fontSize: 13px, fontWeight: 400, lineHeight: 1.45, letterSpacing: 0px }
  button:    { fontFamily: "IBM Plex Mono", fontSize: 13px, fontWeight: 500, lineHeight: 1.2, letterSpacing: 0.5px }
  caption:   { fontFamily: "IBM Plex Mono", fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0.2px }
  eyebrow:   { fontFamily: "IBM Plex Mono", fontSize: 11px, fontWeight: 500, lineHeight: 1.3, letterSpacing: 1.6px }

rounded:
  xs: 0px
  sm: 0px
  md: 0px
  lg: 0px
  xl: 0px
  xxl: 0px
  full: 0px

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
  level-1: "none"
  level-2: "none"

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.eyebrow}", padding: 18px 24px }
  button-primary: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.xs}", padding: 14px 22px }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.ink}", typography: "{typography.button}", rounded: "{rounded.xs}", padding: 13px 21px }
  card:           { backgroundColor: "{colors.surface}", border: "1px solid {colors.hairline}", rounded: "{rounded.xs}", shadow: "{elevation.level-0}" }
  text-input:     { background: "{colors.surface-alt}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.xs}", padding: 12px 16px }
  badge-pill:     { background: "{colors.dark}", textColor: "{colors.inverse}", typography: "{typography.caption}", rounded: "{rounded.xs}", padding: 5px 10px }
  loader-ascii:   { background: "{colors.canvas}", textColor: "{colors.inverse}", typography: "{typography.body-md}", note: "centred monospace progress glyphs ----===++" }
---

# Igloo Inc. — Design Language Analysis

Igloo's site is not a page; it is a threshold. Everything the DOM exposes is a single full-viewport loader on a grey-blue field, with a centred line of monospace ASCII glyphs — `----===++` — ticking toward a WebGL world rendered entirely on `<canvas>`. The design system, in the traditional document sense, is therefore deliberately and almost severely small: one background colour, one typeface, two ink values, no rounding, no shadow. That restraint *is* the brand. Where most sites greet you with a navbar and a hero, Igloo greets you with a cold loading terminal, and the confidence of that choice sets the tone for the cinematic experience behind it.

Because the experiential layer lives in WebGL, the values below are split between **measured** tokens read directly off the rendered DOM and computed styles (the canvas colour, the typeface, the loader ink), and a **system inferred** from that signature — a tight monochrome, monospace scale built so the component patterns can be demonstrated in Igloo's voice rather than guessed in someone else's.

## Colour

The palette is a single chord. The canvas is `#A0A5B1` — confirmed directly from the site's CSS custom property `--bgColor` and the computed body background `rgb(160, 165, 177)` — a desaturated blue-grey that reads like fog, concrete, or a screen at rest. Against it, only two inks ever appear: a luminous white (`#FFFFFF`), used for the ASCII loader text and reserved as the brand's signal colour, and a near-black (`#0E0F12`) for body copy and any solid call-to-action. There is no saturated brand hue at all; the system is resolutely monochromatic, and any sense of hierarchy comes from value (light vs. dark on grey) rather than colour. The supporting greys — `canvas-soft`, `surface`, `surface-alt`, and the `hairline` pair — are all tints stepped off the same blue-grey, kept within a narrow band so the surface stays atmospheric rather than chunky. Borders are a slightly darker grey hairline; there are no gradients in the visible DOM.

## Typography

One family does all the work: **IBM Plex Mono**, loaded directly by the site in Regular (400) and Medium (500) weights (`IBMPlexMono-Regular` and `IBMPlexMono-Medium` woff2 files served from igloo.inc). It is a true, fixed-width monospace — the source of the site's engineered, terminal-readout character — and, conveniently, it is published on Google Fonts, so the showcase renders the **exact** typeface with no substitution. Hierarchy is built the way monospaced systems must build it: through size and the gap between Regular body and Medium headings, plus letter-spacing as a deliberate device — tight negative tracking on display sizes, and wide positive tracking (uppercased) on eyebrows and buttons to evoke a label printed on a machine. The dominant reading tier sits around 14–16px Regular at a 1.5 line-height.

## Shape & depth

There is none, and that is the point. No border-radius appears anywhere in the rendered styles, so every tier collapses to `0px` — corners are hard, brutalist, screen-like. Likewise there are no box-shadows; elevation is flat across all levels, and separation between regions is achieved with 1px hairlines, not lift. The result is an interface with no soft edges and no pretend physicality — a flat plane that lets the eventual 3D content carry all of the depth.

## Layout & responsive

The visible layer is a single centred flex container — the loader is justified and aligned dead-centre of the viewport, the most reductive layout possible. The inferred spacing scale follows a 4/8 base stepped up to a generous 64px for sectioning, giving the monospace content room to breathe. For the demonstration showcase the structure follows a standard 1200px max-width column that collapses from four tracks to two to one as the viewport narrows; in spirit, though, Igloo's own responsive story is the WebGL canvas scaling fluidly to fill whatever screen it lands on, with the monospace UI floating over it at fixed, label-like sizes.
