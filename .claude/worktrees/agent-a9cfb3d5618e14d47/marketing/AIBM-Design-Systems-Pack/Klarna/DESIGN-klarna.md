---
version: alpha
name: Klarna Analysis
description: >
  A warm, near-flat fintech system painted on white and off-white: a single
  deep blue-black ink does almost all the talking, candy-pink CTAs carry the
  brand with dark (never white) text, and soft mint and lavender panels plus
  extreme pill rounding keep a serious money app feeling friendly.

colors:
  primary: "#ffa8cd"          # Klarna Pink — primary CTAs ("Get the app"), brand mark
  primary-active: "#f58fbc"   # derived ~8% darker pink for pressed/hover (not separately observed)
  on-primary: "#0b051d"       # ink text/icons sit ON the pink — Klarna never uses white on pink
  dark: "#0b051d"             # "Klarna Black" — inverted bands & dark buttons
  on-dark: "#f9f8f5"          # warm off-white text on the dark band
  canvas: "#ffffff"           # page background
  canvas-soft: "#f9f8f5"      # warm off-white section background
  surface: "#ffffff"          # card / panel surface
  surface-alt: "#f5f5f7"      # cool-grey chip / sunken fill
  accent-mint: "#c1f4d1"      # signature soft-mint feature panels (decorative)
  accent-lavender: "#efecff"  # pale lavender feature panels (decorative)
  ink: "#0b051d"              # headings & body text
  ink-secondary: "#504f5f"
  ink-muted: "#615f6d"
  ink-faint: "#96959f"        # captions / placeholder
  hairline: "#e2e2e7"         # 1px borders, dividers, outline buttons
  # No explicit success/warning/error system observed; mint reads as a decorative
  # accent rather than a semantic status colour.

typography:
  display-1: { fontFamily: "Klarna Title", fontSize: 147px, fontWeight: 700, lineHeight: 0.9, letterSpacing: 0 }   # fluid hero, scales down sharply on smaller viewports
  display-2: { fontFamily: "Klarna Title", fontSize: 64px, fontWeight: 700, lineHeight: 1.0, letterSpacing: 0 }
  heading-1: { fontFamily: "Klarna Title", fontSize: 52px, fontWeight: 700, lineHeight: 1.05, letterSpacing: 0 }
  heading-2: { fontFamily: "Klarna Title", fontSize: 44px, fontWeight: 700, lineHeight: 1.1, letterSpacing: 0 }
  heading-3: { fontFamily: "Klarna Title", fontSize: 24px, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0 }
  body-lg:   { fontFamily: "Klarna Text", fontSize: 20px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0 }
  body-md:   { fontFamily: "Klarna Text", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }   # dominant body tier
  body-sm:   { fontFamily: "Klarna Text", fontSize: 14px, fontWeight: 400, lineHeight: 1.45, letterSpacing: 0 }
  button:    { fontFamily: "Klarna Text", fontSize: 16px, fontWeight: 500, lineHeight: 1.2, letterSpacing: 0 }
  caption:   { fontFamily: "Klarna Text", fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0 }
  eyebrow:   { fontFamily: "Klarna Text", fontSize: 12px, fontWeight: 500, lineHeight: 1.3, letterSpacing: 0.4px }
  # Proprietary "Klarna Title" (display) and "Klarna Text" (body) are loaded as
  # @font-face. Showcase substitutes Hanken Grotesk (nearest Google) and labels it.

rounded:
  xs: 2px
  sm: 16px
  md: 20px      # CTA buttons
  lg: 24px
  xl: 32px
  xxl: 48px
  full: 9999px  # pills, avatars, outline buttons — the dominant radius on the page

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"                                   # the default — Klarna is overwhelmingly flat
  level-1: "0 2px 4px rgba(0,0,0,0.10)"             # the one card/raise shadow actually used
  level-2: "0 0 18px rgba(0,0,0,0.20)"             # rare ambient glow for floating/popover elements

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", borderBottom: "1px solid {colors.hairline}", padding: 16px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.md}", padding: "12px 20px" }
  button-dark:      { background: "{colors.dark}", textColor: "#ffffff", typography: "{typography.button}", rounded: "{rounded.full}", padding: "12px 20px" }
  button-outline:   { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.full}", padding: "10px 16px" }
  button-ghost-nav: { background: "transparent", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 11px }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.xl}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  feature-panel:    { backgroundColor: "{colors.accent-mint}", rounded: "{rounded.xxl}", textColor: "{colors.ink}" }
  text-input:       { backgroundColor: "{colors.canvas}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", textColor: "{colors.ink}", padding: "12px 16px" }
  badge-pill:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: "5px 10px" }
---

# Klarna — Design Language Analysis

Klarna's marketing site is a study in making a money product feel approachable without making it feel unserious. The page is almost entirely white and warm off-white, structured by enormous rounded panels, set in a proprietary type family, and punctuated by exactly one loud colour — a candy pink — used sparingly enough that it always means "act here." The result reads calm and editorial up close, but the oversized display type and extreme pill rounding give it a distinctly playful, consumer-friendly personality.

## Colour

The palette is disciplined to the point of austerity on the neutral side and deliberately sweet on the accent side. A single deep blue-black, `#0b051d` ("Klarna Black"), carries essentially all text — it appeared on the page roughly thirty times more often than any other text colour — and it doubles as the fill for inverted dark bands and dark buttons. Supporting text steps down through a tight cool-grey ink ramp (`#504f5f` → `#615f6d` → `#96959f`) rather than by fading the black, which keeps secondary copy legible on white. Surfaces are just two whites: pure `#ffffff` for cards and a warm `#f9f8f5` for alternating sections, with a cool `#f5f5f7` reserved for sunken chips. Hairlines and outline-button borders are a consistent `#e2e2e7`.

Against that restraint, brand colour does a lot of work from very little surface area. Klarna Pink `#ffa8cd` is the primary call-to-action — and notably it carries dark `#0b051d` text, never white, which is a signature of the brand and the single most important rule to copy. Two soft pastels, mint `#c1f4d1` and lavender `#efecff`, appear as large decorative feature-panel backgrounds rather than as semantic colours; there is no conventional success/warning/error system in evidence. The only gradients found were white-to-transparent image fades, so CTAs are flat solid pink, not gradient.

## Typography

Klarna ships a proprietary family: **Klarna Title** for display and headings and **Klarna Text** for body, both loaded via `@font-face` over a system-sans fallback. Because they are licensed, the showcase substitutes **Hanken Grotesk** (the nearest Google match — a friendly geometric grotesque) and labels it as a stand-in. Hierarchy is built almost purely through size and weight, not tracking: weights collapse to just 400 (body), 500 (buttons and emphasis), and 700 (every heading), with letter-spacing left at the default throughout. The body workhorse is 16px/400 at a 1.5 ratio, by far the most common pairing on the page. The drama lives at the top of the scale: hero headlines render around a colossal 147px/700 with a tight sub-one line-height (~0.9), stepping down through 64, 52, and 44px as the layout narrows. That jump — neutral 16px body beneath near-billboard display — is the core of the typographic voice.

## Shape & depth

This is where Klarna's friendliness is encoded. The radius scale skips the usual 4–12px niceties almost entirely and jumps from a hairline 2px straight to 16, 20, 24, 32, and 48px, with a true pill (`9999px`) as the single most frequent rounding on the page — used on outline buttons, chips, avatars, and tags. CTA buttons sit at a generous 20–24px. Depth, by contrast, is nearly absent: the page is overwhelmingly flat, with only two shadows in use — a soft `0 2px 4px rgba(0,0,0,0.10)` lift for the occasional raised card and a rare ambient `0 0 18px rgba(0,0,0,0.20)` glow for floating elements. Separation is achieved through the warm off-white section fills and big rounded panels, not through elevation.

## Layout & responsive

Spacing follows a conventional 4px base on an 8px rhythm (4 / 8 / 12 / 16 / 24 / 32 / 48), visible in the 12×20px button padding and 24px heading padding. Content sits in a centered column with generous vertical breathing room between full-width sections, many of which are oversized rounded cards in mint, lavender, or off-white. The display type is fluid: the hero scales sharply with viewport width, dropping from ~147px toward ~48–64px on smaller screens, while multi-column feature grids collapse to single-column stacks. The combination — a tight neutral system, one decisive accent, billboard type, and pill-everything rounding — is what makes Klarna instantly recognizable as a serious app that still wants to feel like fun.
