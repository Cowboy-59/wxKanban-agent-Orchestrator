---
version: alpha
name: Lusion Analysis
description: >
  A stark, gallery-white canvas carrying near-pure black ink in the Aeonik
  grotesque, where restraint is the whole point — one electric ultramarine
  blue for links and live moments, a single radioactive lime as a punctuation
  accent, and full-pill controls floating over a 3D stage that supplies all
  the colour and depth the flat UI deliberately withholds.

colors:
  primary: "#1a2ffb"            # electric ultramarine — links, live/active states, brand mark
  primary-active: "#0016ec"     # deeper blue used on filled surfaces / pressed
  on-primary: "#ffffff"
  dark: "#2b2e3a"               # charcoal pill buttons ("LET'S TALK"), inverted chips
  accent-lime: "#c1ff00"        # radioactive lime — single highlight / hover punctuation
  canvas: "#ffffff"             # dominant page background (gallery white)
  canvas-soft: "#f0f1fa"        # faint cool off-white section tint
  canvas-dark: "#0b0b12"        # near-black preloader / inverted full-bleed bands
  surface: "#ffffff"            # card / panel surface
  surface-alt: "#e4e6ef"        # cool grey chip / sunken fill
  ink: "#000000"                # headings & body text — pure black, overwhelmingly dominant
  ink-secondary: "#2b2e3a"      # secondary text / charcoal
  ink-muted: "#34393f"          # tertiary labels
  ink-faint: "#6e7178"          # captions / placeholders (inferred)
  hairline: "rgba(0,0,0,0.1)"   # the rare 1px divider — site is near-borderless
  on-dark: "rgba(255,255,255,0.7)"   # text on dark bands
  hairline-on-dark: "rgba(255,255,255,0.2)"

typography:
  display-1: { fontFamily: Aeonik, fontSize: 112px, fontWeight: 400, lineHeight: 1.0, letterSpacing: -2.24px }
  display-2: { fontFamily: Aeonik, fontSize: 96px, fontWeight: 400, lineHeight: 1.0, letterSpacing: -1.92px }
  heading-1: { fontFamily: Aeonik, fontSize: 77px, fontWeight: 400, lineHeight: 0.9, letterSpacing: -1.53px }
  heading-2: { fontFamily: Aeonik, fontSize: 57px, fontWeight: 400, lineHeight: 1.0, letterSpacing: -1.0px }
  heading-3: { fontFamily: Aeonik, fontSize: 38px, fontWeight: 400, lineHeight: 1.15, letterSpacing: normal }
  title:     { fontFamily: Aeonik, fontSize: 26px, fontWeight: 400, lineHeight: 1.2, letterSpacing: normal }
  body-lg:   { fontFamily: Aeonik, fontSize: 20px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  body-md:   { fontFamily: Aeonik, fontSize: 16px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  body-sm:   { fontFamily: Aeonik, fontSize: 14px, fontWeight: 400, lineHeight: 1.15, letterSpacing: normal }
  button:    { fontFamily: Aeonik, fontSize: 14px, fontWeight: 500, lineHeight: 1.15, letterSpacing: 0.5px, textTransform: uppercase }
  caption:   { fontFamily: Aeonik, fontSize: 12px, fontWeight: 400, lineHeight: 1.3, letterSpacing: normal }
  eyebrow:   { fontFamily: Aeonik, fontSize: 14px, fontWeight: 500, lineHeight: 1.15, letterSpacing: 0.5px, textTransform: uppercase }

rounded:
  xs: 3px
  sm: 10px
  md: 15px
  lg: 18px
  xl: 24px
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
  level-1: "0 2px 4px rgba(0,0,0,0.04), 0 6px 10px rgba(0,0,0,0.04)"
  level-2: "0 8px 24px rgba(0,0,0,0.10)"

components:
  nav-bar:        { backgroundColor: "transparent", textColor: "{colors.ink}", typography: "{typography.eyebrow}", padding: 16px, note: "Floating uppercase links + pill controls over the 3D canvas" }
  button-primary: { background: "{colors.dark}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "13px 23px", note: "The charcoal LET'S TALK pill" }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "13px 21px", note: "White BACK pill" }
  button-accent:  { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "13px 23px" }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.md}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:     { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", padding: "12px 16px", note: "Newsletter subscribe is a minimal underlined field" }
  badge-pill:     { background: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.caption}", rounded: "{rounded.full}", padding: "5px 10px" }
---

# Lusion — Design Language Analysis

Lusion is an award-winning 3D and interactive web studio, and the design system is built around a deliberate paradox: the chrome is almost aggressively plain so that the WebGL stage can do all the talking. The interface layer is monochrome — black type on white, set in the Aeonik grotesque — with colour and depth withheld from the flat UI and supplied instead by motion, 3D, and a single electric-blue spark. It reads as a confident gallery: lots of negative space, very few lines, big quiet headings, and controls reduced to floating pills.

## Colour

The palette is ruthlessly tight. Pure black (`#000000`) dominates text by an order of magnitude over every other colour, sitting on a gallery-white `#ffffff` canvas that is the page's default surface. Section tints stay almost imperceptible — a cool off-white `#f0f1fa` and a slightly heavier grey chip fill `#e4e6ef` are as far as the greys travel. The one saturated voice is an electric ultramarine, appearing as `#1a2ffb` on links and live/active text and deepening to `#0016ec` when it fills a surface; this is the brand spark and it is used sparingly enough that it always reads as intentional. A radioactive lime `#c1ff00` shows up as a rare punctuation accent — a hover or a highlight rather than a structural colour. Dark moments invert to a near-black `#0b0b12` (the preloader and full-bleed bands), where a translucent white at 70% carries text and a 20% white draws the only hairlines. Charcoal `#2b2e3a` is reserved for the primary pill button. Borders barely exist — the extractor found essentially no solid border colours — so separation comes from space, not rules.

## Typography

Everything is set in **Aeonik**, a proprietary geometric grotesque. The showcase substitutes **Space Grotesk** from Google Fonts as the nearest free match (same low-contrast geometric-grotesque character and tight, slightly mechanical rhythm); treat it as a stand-in, not the real face. Hierarchy is built almost entirely from **size and negative tracking, not weight** — the vast majority of text, including the giant display headings, sits at a regular 400, with weight only nudging up to 500 for the small uppercase button and eyebrow labels. The display tier is enormous and tightly set: hero lines run ~96–112px with negative letter-spacing around -0.02em and line-heights collapsed to 0.9–1.0, so the type packs into dense, sculptural blocks. Below that, a 38px subhead, a 26px title, and a workhorse 16px body (line-height ~1.4) handle reading text, while 14px regular covers UI text and 14px medium uppercase covers labels and buttons.

## Shape & depth

Two shape stories run in parallel. Interactive controls are **fully rounded pills and circles** (`rounded.full` — the 87.5px/100px radii resolve to capsules at their height), which is the dominant motif: every nav control and CTA is a lozenge or a circular icon button. Content containers, where they appear, use a gentle small-to-medium radius (10–15px). Depth is almost entirely flat: the site leans on `level-0` (no shadow), and the only shadow found anywhere is a whisper-soft double-layer at ~4% black used on the odd floating card. There is no heavy elevation language — perceived depth comes from the live 3D scene and parallax motion, not from box-shadows.

## Layout & responsive

Spacing follows a roughly 8px base, expanding through a generous 12 / 16 / 24 / 32 / 48 rhythm, with section padding that errs large to protect the negative space the design depends on. Layouts are wide and airy, content held in a centered column with full-bleed 3D moments breaking out edge to edge. On smaller screens the giant display sizes step down hard (the hero drops from ~96px toward ~48px), multi-column galleries collapse from four up toward two and then one, and the floating pill nav condenses into a menu toggle — but the core monochrome-on-white, pill-control, big-quiet-heading identity holds at every breakpoint.
