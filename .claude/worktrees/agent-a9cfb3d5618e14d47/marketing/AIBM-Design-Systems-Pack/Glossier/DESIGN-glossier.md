---
version: alpha
name: Glossier Analysis
description: >
  A near-monochrome editorial beauty system — clinical white canvas, pure black
  ink and Apercu type set small and light, where the only real colour is a single
  electric Glossier blue and a whisper of millennial pink, on shapes kept almost
  perfectly square and flat.

colors:
  primary: "#0600ff"          # the signature Glossier electric blue — links, accents, brand marks
  primary-active: "#0500cc"   # assumed pressed variant (not separately sampled)
  on-primary: "#ffffff"       # text/icon on the blue
  dark: "#000000"             # dark buttons, inverted bands, the "Pause Slideshow" control
  on-dark: "#ffffff"
  canvas: "#ffffff"           # page background
  canvas-soft: "#f7f7f7"      # off-white section background
  surface: "#ffffff"          # card / panel surface (cards are borderless white)
  surface-alt: "#e8e8e8"      # chip / sunken fill, secondary "Shop" button background
  surface-muted: "#f0f0f0"    # alternate sunken tint
  ink: "#000000"              # headings & body text (overwhelmingly dominant)
  ink-secondary: "#333333"
  ink-muted: "#666666"        # captions, meta
  ink-faint: "#b3b3b3"        # placeholders / disabled
  hairline: "#000000"         # crisp 1px borders on buttons & inputs
  hairline-soft: "rgba(0,0,0,0.06)"  # faint dividers
  accent-pink: "#f6e3e6"      # decorative — soft "Glossier pink" section tint
  # decorative shade swatches sampled from product chips (not a UI palette):
  accent-green: "#468254"
  accent-maroon: "#9d2235"
  accent-red: "#c8102e"
  accent-rose: "#ef426f"
  accent-coral: "#e3785e"
  accent-salmon: "#f09491"

typography:
  display-1: { fontFamily: "Apercu (substitute: Hanken Grotesk)", fontSize: 28px, fontWeight: 500, lineHeight: 1.25, letterSpacing: 0 }
  title:     { fontFamily: "Apercu", fontSize: 20px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0 }
  heading-1: { fontFamily: "Apercu", fontSize: 18px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0 }
  body-lg:   { fontFamily: "Apercu", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  body-md:   { fontFamily: "Apercu", fontSize: 14px, fontWeight: 400, lineHeight: 1.46, letterSpacing: 0.03px }
  button:    { fontFamily: "Apercu", fontSize: 14px, fontWeight: 400, lineHeight: 1.29, letterSpacing: 0.03px }
  caption:   { fontFamily: "Apercu", fontSize: 12px, fontWeight: 400, lineHeight: 1.7, letterSpacing: 0.04px }
  eyebrow:   { fontFamily: "Apercu", fontSize: 12px, fontWeight: 400, lineHeight: 1.7, letterSpacing: 0.04px, textTransform: uppercase }

rounded:
  none: 0px
  xs: 2px
  sm: 3px
  lg: 20px
  full: 50px

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
  level-1: "rgba(0,0,0,0) 0px 2px 4px 0px, rgba(50,50,93,0.10) 0px 7px 14px 0px"
  level-2: "rgb(199,197,199) 0px 0px 12px 2px"

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.eyebrow}", padding: 16px, borderBottom: "1px solid {colors.hairline-soft}" }
  button-primary: { background: "{colors.dark}", textColor: "{colors.on-dark}", typography: "{typography.button}", rounded: "{rounded.none}", padding: 6px 12px 8px }
  button-secondary: { background: "{colors.surface-alt}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.none}", padding: 6px 12px 8px }
  button-outline: { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", typography: "{typography.button}", rounded: "{rounded.none}", padding: 5px 11px 7px }
  button-blue:    { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.none}", padding: 6px 12px 8px }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.none}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:     { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.xs}", padding: 12px 16px, typography: "{typography.body-md}" }
  badge-pill:     { background: "{colors.canvas}", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: 5px 10px, typography: "{typography.caption}" }
---

# Glossier — Design Language Analysis

Glossier's site reads like a beauty editorial printed on bright white paper: almost everything is black Apercu type on white, set small and unhurried, with enormous breathing room between elements. The system gets its entire personality from restraint — there is no decorative chrome, no rounded "friendly" softness, no drop-shadow depth. Where most e-commerce shouts, Glossier whispers, and the one moment it raises its voice is a single saturated blue. The result feels clinical, confident, and a little cult-like, which is exactly the brand.

## Colour

The palette is effectively monochrome. Black (`#000000`) is the runaway dominant value — it appeared as a text colour roughly 2,400 times against a few dozen instances of anything else — and it does double duty as both ink and the crispest border colour. The surface story is a tight stack of near-whites: a pure `#ffffff` canvas, a `#f7f7f7` off-white for alternating sections, and `#e8e8e8` / `#f0f0f0` for sunken chips and secondary buttons. Secondary text steps down through `#333333` and `#666666`, with `#b3b3b3` reserved for placeholders.

Colour, when it finally arrives, is deliberate. The signature is an electric, almost ultramarine **Glossier blue (`#0600ff`)** — used sparingly on links and brand accents so it lands hard. The only other brand hue is the famous soft **Glossier pink (`#f6e3e6`)**, deployed as a faint section tint rather than as UI. Everything else with saturation — greens, maroons, corals, roses — comes from product shade swatches, not from the interface; those are catalogued here as `accent-*` for completeness but should be treated as content, not system tokens. Dividers are mostly a 6%-black hairline so faint they barely register, reinforcing the airy feel.

## Typography

The family is **Apercu**, Glossier's proprietary neo-grotesque, with `Gill Sans` as the named fallback. Since Apercu is licensed, the showcase substitutes **Hanken Grotesk** from Google Fonts — a humanist grotesque with similar warmth and proportions — and labels it as a stand-in. Hierarchy here is built almost entirely through *size*, not weight or colour: the type lives in a narrow band from 12px to 28px, and weight rarely climbs above 400 (regular) — the heaviest recurring step is a 500 medium on the 28px display line "GLOSSIER YOU LOOK GOOD". Body copy splits between a 14px and a 16px regular tier (the two most common pairings on the page by a wide margin), captions and eyebrows drop to 12px with a hair of positive letter-spacing and occasional uppercasing. There is no dramatic display scale and no bold — restraint is the type system.

## Shape & depth

Glossier is square and flat. Radii cluster at a barely-there 2–3px, and the primary buttons and many cards carry *zero* radius — corners stay genuinely sharp. The only rounding tiers that exist are a 20px on a few soft containers and a 50px full-pill for small badges. Depth is treated the same way: the dominant elevation is none. Cards and sections separate through whitespace and faint hairlines, not shadows. A couple of very soft, low-opacity shadows exist for hover and dropdown states, but nothing reads as "lifted." The aesthetic is print-flat by design.

## Layout & responsive

Spacing follows a roughly 8px base with generous large steps (40px, 64px) that create the signature open, gallery-like rhythm — content is given room to sit alone. Layouts are wide and grid-driven, with product and editorial cards arranged in clean 3–4-up rows that collapse to 2-up on tablet and a single column on mobile. The top navigation is a slim, uppercase, hairline-bottomed bar that stays minimal at every width. Because the type is already small and the chrome already sparse, the mobile collapse is gentle: the grid narrows and the hero stacks, but the visual language — black-on-white, flat, square — is identical from desktop to phone.
