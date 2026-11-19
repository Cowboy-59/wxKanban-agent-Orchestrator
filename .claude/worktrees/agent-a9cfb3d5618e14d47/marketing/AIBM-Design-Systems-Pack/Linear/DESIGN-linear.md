---
version: alpha
name: Linear Analysis
description: >
  A confident near-black canvas where crisp off-white Inter and a single electric
  indigo do all the talking — Linear's identity lives in restraint: hairline-thin
  white-alpha borders, tight 6px controls, razor-negative display tracking, and a
  quiet spray of pastel gradient accents held back for moments of delight.

colors:
  primary: "#5e6ad2"            # brand indigo — links, focus rings, primary actions, accents
  primary-active: "#6d78d5"     # lighter indigo for hover/press on dark
  on-primary: "#ffffff"         # text/icon on indigo
  contrast: "#e5e5e6"           # high-emphasis light "pill" CTA background
  on-contrast: "#08090a"        # text on the light pill
  canvas: "#08090a"             # page background (near-black)
  canvas-soft: "#0f1011"        # lifted section / panel background
  surface: "#101113"            # card / popover surface
  surface-alt: "rgba(255,255,255,0.05)"  # chip / sunken fill (white-alpha)
  ink: "#f7f8f8"                # headings & primary text
  ink-secondary: "#d0d6e0"      # supporting copy
  ink-muted: "#8a8f98"          # nav links / muted labels
  ink-faint: "#62666d"          # captions / placeholder / resting nav
  hairline: "rgba(255,255,255,0.08)"      # 1px borders
  hairline-soft: "rgba(255,255,255,0.05)" # faint dividers
  success: "#27a644"            # positive status
  error: "#f34f52"              # destructive / error
  accent-pink: "#f79ce0"        # decorative gradient-text accent
  accent-peach: "#f7bf8b"       # decorative gradient-text accent
  accent-blue: "#8fa6ff"        # decorative gradient-text accent
  accent-yellow: "#ffdf9f"      # decorative gradient-text accent
  accent-teal: "#83dcdc"        # decorative gradient-text accent

typography:
  display-1: { fontFamily: Inter, fontSize: 64px, fontWeight: 510, lineHeight: 1.0, letterSpacing: -1.41px }
  heading-1: { fontFamily: Inter, fontSize: 48px, fontWeight: 510, lineHeight: 1.0, letterSpacing: -1.06px }
  heading-2: { fontFamily: Inter, fontSize: 20px, fontWeight: 590, lineHeight: 1.33, letterSpacing: -0.24px }
  heading-3: { fontFamily: Inter, fontSize: 16px, fontWeight: 590, lineHeight: 1.5, letterSpacing: normal }
  body-lg:   { fontFamily: Inter, fontSize: 18px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-md:   { fontFamily: Inter, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-sm:   { fontFamily: Inter, fontSize: 14px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  button:    { fontFamily: Inter, fontSize: 13px, fontWeight: 510, lineHeight: 1.0, letterSpacing: normal }
  caption:   { fontFamily: Inter, fontSize: 13px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  eyebrow:   { fontFamily: Inter, fontSize: 12px, fontWeight: 510, lineHeight: 1.2, letterSpacing: 0.4px }

rounded:
  xs: 2px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 22px
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
  level-1: "0 2px 4px rgba(0,0,0,0.4)"
  level-2: "0 4px 32px rgba(8,9,10,0.6)"
  # signature: raised controls add an inset top highlight —
  # "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 0 0 1px rgba(255,255,255,0.03)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink-muted}", typography: "{typography.caption}", padding: 0 12px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 0 14px, height: 32px }
  button-contrast:  { background: "{colors.contrast}", textColor: "{colors.on-contrast}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 0 12px, height: 32px }
  button-secondary: { background: transparent, textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.full}", padding: 0 12px, height: 32px }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", border: "1px solid {colors.hairline}", shadow: "{elevation.level-1}" }
  text-input:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink-secondary}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", padding: 12px 14px }
  badge-pill:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink-secondary}", rounded: "{rounded.full}", typography: "{typography.eyebrow}" }
---

# Linear — Design Language Analysis

Linear's marketing site is a master class in dark-mode restraint. Nearly everything is built from three ingredients — a near-black canvas, a four-step off-white ink ramp, and one electric indigo — assembled with surgical precision. The personality comes not from colour but from discipline: razor-tight negative tracking on the big display type, hairline borders that are barely-there white at 5–8% opacity, and controls that round to a quiet 6px. Saturated colour is rationed; when it appears it is either the indigo doing a single job (a link, a focus ring, a primary action) or a pastel gradient accent reserved for a moment of delight.

## Colour

The system is fundamentally an ink-on-dark palette. The canvas sits at `#08090a` — not pure black, a hair warmer — with a lifted `#0f1011` for sections and `#101113` for card surfaces. Text is a tight four-step ramp from `#f7f8f8` (used overwhelmingly — it is by far the most frequent colour on the page) down through `#d0d6e0` for supporting copy, `#8a8f98` for nav and muted labels, and `#62666d` for captions and resting states. Separation between surfaces is done almost entirely with white-alpha hairlines — `rgba(255,255,255,0.08)` for borders and `0.05` for faint dividers — rather than hard lines, which keeps the dark UI feeling soft and layered. The one saturated brand colour is indigo `#5e6ad2`, surfaced on the live "Skip to content" control and used for links, focus, and primary actions; a lighter `#6d78d5` reads as its hover on dark. A separate high-contrast light pill (`#e5e5e6` with `#08090a` text) carries the very top-emphasis marketing CTA. Beyond that, Linear keeps a small bank of decorative gradient-text accents — pink `#f79ce0`, peach `#f7bf8b`, periwinkle `#8fa6ff`, yellow `#ffdf9f`, teal `#83dcdc` — plus functional green `#27a644` and red `#f34f52` for status.

## Typography

The family is Inter (shipped as "Inter Variable", with an `SF Pro Display` / system fallback). Because it is variable, Linear leans on unusual interpolated weights — 510 for headings and 590 for sub-headings — that sit a notch heavier than a normal medium without becoming bold. Hierarchy is built primarily through size and tracking rather than weight: the 64px hero and 48px section heads share the same 510 weight but pull letter-spacing hard negative (−1.41px and −1.06px) and run line-height at a flat 1.0 for a dense, engineered look. Body text is unambiguously 16px / 400 at a 1.5 ratio — it is the single most common type pairing on the page — with 14px and 13px stepping down for secondary and nav text. Controls use a compact 13px / 510. Inter is available on Google Fonts, so the showcase renders the real typeface (no substitute needed).

## Shape & depth

Radii are small and consistent. The workhorses are a 6px control radius (buttons, inputs) and an 8–12px card radius, with a 2px micro-radius on the smallest chips and full `9999px` pills on nav buttons and avatars. Depth is deliberately shallow: most "elevation" is just a 1px hairline. Where shadow is used it is soft and dark — a `0 2px 4px rgba(0,0,0,0.4)` lift for raised cards and a deep `0 4px 32px rgba(8,9,10,0.6)` for popovers and modals. Linear's signature trick is the raised-control treatment that pairs a faint inset top highlight (`inset 0 1px 0 rgba(255,255,255,0.04)`) with a dark outer ring, giving buttons a subtly extruded, tactile edge against the dark canvas.

## Layout & responsive

Spacing follows a 4px base unit, stepping 4 / 8 / 12 / 16 / 24 / 32 / 48 with generous 64–72px vertical rhythm between marketing sections. Content is centred in a ~1200px max-width column with comfortable 40px gutters. The composition is grid-driven — four-up feature and card rows that collapse to two columns on tablet and a single column on mobile — while the hero display type ramps down from 64px to roughly 48px on smaller viewports so the headline never overruns. The overall feel is precise and editorial: lots of negative space, strong left alignment, and restrained use of full-bleed dark bands punctuated by the occasional gradient glow.
