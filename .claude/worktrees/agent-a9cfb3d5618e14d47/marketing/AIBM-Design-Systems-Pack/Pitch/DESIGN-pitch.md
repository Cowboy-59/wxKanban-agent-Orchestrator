---
version: alpha
name: Pitch Analysis
description: >
  A crisp white canvas governed by near-black plum ink, electrified by a single
  high-voltage violet that carries every CTA and brand mark, softened by lavender
  surfaces, a candy-lime pop, and signature coloured glow shadows under big,
  tightly-tracked geometric display type.

colors:
  primary: "#5318eb"          # electric violet — CTAs ("Generate"), links, brand marks
  primary-active: "#4413c9"   # derived darker press state (not directly observed)
  on-primary: "#ffffff"       # text/icon on primary
  # signature CTA / hero glow is a coloured shadow, not a fill gradient
  dark: "#0c021c"             # near-black plum — inverted hero band & footer
  deep: "#280f62"             # deep indigo — secondary dark band / chip text
  canvas: "#ffffff"           # page background
  canvas-soft: "#f6f6f6"      # off-white section background
  surface: "#ffffff"          # card / panel surface
  surface-alt: "#ebe3fe"      # lavender chip / pill fill
  ink: "#0c021c"              # headings & body text (near-black plum)
  ink-secondary: "#363636"
  ink-muted: "#666666"
  ink-faint: "#9a93a6"        # captions / placeholder (derived)
  hairline: "#ebebeb"         # 1px borders & dividers (derived; site leans on shadow over borders)
  hairline-soft: "#f2f0f7"
  # decorative accents
  accent-lavender: "#c6a5ff"  # glow, soft highlights, coloured shadow tint
  accent-lime: "#c4ee87"      # high-energy pop on dark bands

typography:
  display-hero: { fontFamily: "Mark Pro Bold (→ Manrope)", fontSize: 180px, fontWeight: 700, lineHeight: 0.8, letterSpacing: -7.2px }
  display-1:    { fontFamily: "Mark Pro Bold (→ Manrope)", fontSize: 60px, fontWeight: 700, lineHeight: 1.0, letterSpacing: -1.8px }
  heading-1:    { fontFamily: "Mark Pro Bold (→ Manrope)", fontSize: 48px, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1px }
  heading-2:    { fontFamily: "Mark Pro Bold (→ Manrope)", fontSize: 32px, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.5px }
  heading-3:    { fontFamily: "Mark Pro Bold (→ Manrope)", fontSize: 28px, fontWeight: 700, lineHeight: 1.15, letterSpacing: -0.3px }
  title:        { fontFamily: "Eina 03 Bold (→ Inter)", fontSize: 20px, fontWeight: 700, lineHeight: 1.3, letterSpacing: 0 }
  body-lg:      { fontFamily: "Eina 03 Regular (→ Inter)", fontSize: 20px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0 }
  body-md:      { fontFamily: "Eina 03 Regular (→ Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  body-sm:      { fontFamily: "Eina 03 Regular (→ Inter)", fontSize: 14px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  button:       { fontFamily: "Eina 03 (→ Inter)", fontSize: 14px, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0 }
  caption:      { fontFamily: "Eina 03 Regular (→ Inter)", fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0 }
  eyebrow:      { fontFamily: "Eina 03 (→ Inter)", fontSize: 12px, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0.4px }

rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 20px
  xl: 24px
  xxl: 40px
  full: 100px

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
  level-1: "0 8px 24px -12px rgba(198,165,255,0.30)"
  level-2: "0 20px 60px -20px rgba(198,165,255,0.35)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-sm}", padding: 16px 24px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.xs}", padding: "8px 16px" }
  button-pill:      { background: "{colors.surface-alt}", textColor: "{colors.deep}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "11px 18px" }
  button-ghost:     { background: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: "4px 12px" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.xl}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-2}" }
  text-input:       { backgroundColor: "{colors.canvas}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", padding: "12px 16px", typography: "{typography.body-sm}" }
  badge-pill:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.deep}", rounded: "{rounded.full}", typography: "{typography.caption}" }
---

# Pitch — Design Language Analysis

Pitch presents the calm, product-forward aesthetic of a modern presentation workspace: a bright white stage, near-black plum text, and one decisive electric violet that does all the persuading. Where most SaaS marketing leans on borders and grey, Pitch leans on light, generous rounding, and soft coloured glows — the brand feels confident and a little playful, never busy. Big geometric display type set at punishing negative tracking carries the headline moments (a 180px "Create slides that win." sits white on a near-black band), while a clean humanist sans handles everything you actually read.

## Colour

The system is built on a tight plum-and-violet logic. Text is almost never pure black in spirit — the working ink is `#0c021c`, a near-black plum that also serves as the inverted hero/footer band. Secondary text steps down through `#363636` and `#666666`. The single saturated brand colour is `#5318eb`, an electric violet that appears as link text, brand marks, and the fill of the primary "Generate" CTA; a derived `#4413c9` covers the pressed state. Around that core sit a family of purples used structurally: a deep indigo `#280f62` for darker bands and chip text, and a pale lavender `#ebe3fe` for soft pill and chip surfaces. Off-white `#f6f6f6` quietly separates sections on the otherwise pure-white canvas. Two decorative accents inject energy without taking over — a lavender `#c6a5ff` (which also tints the signature shadow) and a candy-lime `#c4ee87` used sparingly as a pop on dark bands. Borders are nearly absent; the brand prefers a coloured glow to a hairline, so the `#ebebeb` divider here is a conservative derived value. The only real gradient is a soft radial lavender glow (`rgba(198,165,255,0.35) → transparent`) used as ambient lighting behind hero art.

## Typography

Pitch ships two proprietary families: **Mark Pro** (geometric, used Bold for all display and headings) and **Eina 03** (a warm humanist geometric sans for body and UI). In this showcase they are substituted with the nearest Google equivalents — **Manrope** for the bold display register and **Inter** for body and interface text — and labelled as substitutes. Hierarchy is driven primarily by size and weight rather than colour: headings are uniformly 700 Mark Pro with progressively tighter negative letter-spacing as they scale up (from roughly -0.3px at 28px to a dramatic -7.2px at the 180px hero), giving large type a dense, sculpted feel. Body text lives almost entirely in Eina 03 Regular at 16px / 1.5 for prose and 14px for dense UI, with a 12px caption tier doing the heavy lifting across the app chrome. Buttons use a 14px semibold cut.

## Shape & depth

Rounding is generous and used as a brand signal. The radius ladder runs 4px (inputs, the primary button), 8px (small controls), 12px, then jumps to a soft 20–24px for cards and panels, 40px for large feature containers, and a full 100px pill for tag and filter buttons. Depth is deliberately understated and *coloured*: the site's signature elevation is a single lavender-tinted shadow — `0 20px 60px -20px rgba(198,165,255,0.35)` — that lifts hero art and cards off the white canvas with a soft violet halo rather than a neutral grey drop. Most surfaces sit flat (level-0) until hover, when they bloom into that coloured glow.

## Layout & responsive

The base spacing unit is 4px, expanding through an 8 / 12 / 16 / 24 / 32 / 48px scale, with sections generously padded vertically to let the white breathe. Content is centred in a wide max-width column and built on a clean multi-column grid for feature cards and logo walls. On narrower viewports the grids collapse from four columns to two and then to one, the mega display type steps down aggressively (the hero scale is desktop-only), and the horizontal nav condenses — the layout favours air and large tap targets over information density throughout.
