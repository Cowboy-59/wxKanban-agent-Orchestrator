---
version: alpha
name: Discord Analysis
description: >
  A deep-indigo canvas lit by electric blurple and a fresh mint-green CTA, where
  ultra-tight uppercase display type slams against pure-white rounded surfaces with
  black ink — a playful, high-energy gaming voice built on 16px corners and zero shadows.

colors:
  primary: "#5865f2"            # blurple — brand mark, links, accent fills
  primary-active: "#4752c4"     # pressed blurple (derived from brand ramp)
  on-primary: "#ffffff"         # text/icon on blurple
  primary-gradient-from: "#5865f200"   # transparent blurple (glow start)
  primary-gradient-to: "#5865f2"       # solid blurple (glow end)
  accent-green: "#35ed7e"       # high-contrast "fresh" CTA / highlight
  on-accent-green: "#000000"    # black ink on green
  dark: "#23272a"               # classic Discord near-black (inverted bands, footer)
  canvas: "#161cbb"             # deep indigo/blurple page background
  canvas-soft: "#19175c"        # darker indigo section band
  canvas-deep: "#20269a"        # mid indigo gradient stop
  surface: "#ffffff"            # white card / pill / panel
  surface-alt: "#dddddd"        # sunken chip / muted fill
  ink: "#000000"                # body & headings on white surfaces
  ink-secondary: "#333333"      # secondary text on white
  ink-on-dark: "#ffffff"        # text on indigo/dark canvas
  ink-faint: "rgba(255,255,255,0.7)"   # muted captions on dark
  hairline: "rgba(255,255,255,0.1)"    # 1px dividers on dark
  # semantic: green doubles as success; no dedicated warning/error on marketing site

typography:
  display-1: { fontFamily: "Ggsans (→ Archivo)", fontSize: 47px, fontWeight: 700, lineHeight: 1.0, letterSpacing: -0.5px }
  display-2: { fontFamily: "Ggsans (→ Archivo)", fontSize: 35px, fontWeight: 700, lineHeight: 0.86, letterSpacing: -0.35px }
  heading-1: { fontFamily: "Ggsans (→ Inter)", fontSize: 32px, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.3px }
  heading-2: { fontFamily: "Ggsans (→ Inter)", fontSize: 27px, fontWeight: 800, lineHeight: 0.93, letterSpacing: -0.27px }
  heading-3: { fontFamily: "Ggsans (→ Inter)", fontSize: 22px, fontWeight: 700, lineHeight: 0.8, letterSpacing: -0.66px }
  title:     { fontFamily: "Ggsans (→ Inter)", fontSize: 18px, fontWeight: 500, lineHeight: 1.2, letterSpacing: normal }
  body-lg:   { fontFamily: "Ggsans (→ Inter)", fontSize: 18px, fontWeight: 400, lineHeight: 1.33, letterSpacing: normal }
  body-md:   { fontFamily: "Ggsans (→ Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-sm:   { fontFamily: "Ggsans (→ Inter)", fontSize: 14.4px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  button:    { fontFamily: "Ggsans (→ Inter)", fontSize: 16px, fontWeight: 500, lineHeight: 1.0, letterSpacing: normal }
  caption:   { fontFamily: "Ggsans (→ Inter)", fontSize: 14px, fontWeight: 500, lineHeight: 1.2, letterSpacing: normal }

rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 30px
  xxl: 56px
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
  level-1: "0 1px 2px rgba(0,0,0,0.10)"
  level-2: "0 8px 24px rgba(0,0,0,0.24)"

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink-on-dark}", typography: "{typography.button}", padding: 16px }
  button-primary: { background: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.lg}", padding: "10px 16px" }
  button-green:   { background: "{colors.accent-green}", textColor: "{colors.on-accent-green}", typography: "{typography.button}", rounded: "{rounded.md}", padding: "13px 24px" }
  button-blurple: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.lg}", padding: "12px 24px" }
  button-pill:    { background: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "10px 16px" }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:     { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.sm}", border: "1px solid {colors.hairline}", padding: "12px 16px" }
  badge-pill:     { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: "5px 10px" }
---

# Discord — Design Language Analysis

Discord's marketing surface is loud, friendly, and unapologetically game-native. It abandons the safe white-page convention entirely: the whole canvas is a saturated indigo-blurple, and content arrives as pure-white rounded cards punched onto that color field. The voice is set by enormous, tightly-tracked uppercase headlines and the contrast of black ink on bright white against electric blue — a system that feels more like a console UI than a SaaS landing page.

## Colour

The palette runs on a two-pole logic. On one side is the **dark world**: a deep indigo canvas (`#161cbb`) deepening into `#19175c` and `#20269a` for layered gradient bands, with the classic Discord near-black `#23272a` reserved for footers and inverted sections. All type here is white, dropping to `rgba(255,255,255,0.7)` for muted captions and `rgba(255,255,255,0.1)` for whisper-thin dividers. On the other side is the **light world**: pure-white surfaces (`#ffffff`) carrying black headings (`#000000`) and `#333333` secondary text. The brand's signature **blurple `#5865f2`** is the connective accent — it appears on the logo, links, fills, and a radial glow gradient (`linear-gradient(#5865f200 → #5865f2)`) used to light hero scenes. A second, newer note is the **fresh mint-green `#35ed7e`**, used as a high-energy accent/CTA with black ink on top. There is no muted grey ramp on the dark side — depth comes from indigo value shifts, not greys.

## Typography

The family is **Ggsans**, Discord's proprietary humanist sans (substituted here with **Inter** for the body and a heavier display face like **Archivo** for the big uppercase headlines, both labeled as substitutes). Hierarchy is built almost entirely through **size and weight with aggressively tight line-height**, not tracking alone: display headlines hit 47px/700 and 35px/700 with line-heights *below* the font size (ratios of 1.0 and 0.86) so caps stack into dense blocks, and negative letter-spacing pulls them tighter still. Sub-heads climb to weight 800 at 27px. Everything narrative settles into a comfortable **16px/400 body** at 1.5 line-height, with 18px for ledes and 14.4px for fine print. Interactive labels are 16px/500. The signature move is the uppercase, sub-1.0 line-height display lockup — it reads as packaging copy, not prose.

## Shape & depth

Roundness is the dominant texture and it is **strong**: a 16px radius (`rounded.lg`) shows up everywhere — on cards, white buttons, and pills — far more than any other value, with 12px for tighter chips and fully-rounded `9999px` pills for nav and tags. Larger decorative radii (30px, 56px, 64px) shape oversized hero panels and image masks. Depth is the opposite of a typical shadow-driven SaaS system: the live site uses **almost no box-shadows at all**. Separation comes from raw color contrast — white card on indigo canvas — rather than elevation. The elevation tokens here (a faint 1px shadow, a deeper modal shadow) are minimal scaffolding for the showcase; on the real site, flat-on-color is the strategy.

## Layout & responsive

Spacing follows a loose **8px base** with generous 40px and 64px steps that give the marketing sections their airy, full-bleed rhythm. The layout is built from big edge-to-edge colored bands, each holding a centered or split white panel, and image masks with exaggerated corner radii. On narrower viewports the multi-column card grids collapse to two-up and then single-column, the display type steps down hard (47px → ~32px), and the full-width colored bands stack vertically while keeping their rounded white panels intact. It is a content-light, image-and-headline-heavy system that prioritizes energy and brand color over information density.
