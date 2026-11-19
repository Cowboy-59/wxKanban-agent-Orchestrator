---
version: alpha
name: Cohere Analysis
description: >
  A security-first enterprise-AI system that sets a warm near-black ink
  (#212121) on white, draws crisp 1px black outlines on buttons and inputs,
  warms its sections with soft pastel tints (lilac, cream, mint), and saves
  its one saturated flourish for a coral-to-periwinkle-to-blue brand gradient —
  all rendered in the light, tightly-tracked Unica77 grotesque.

colors:
  primary: "#ff7759"             # coral — signature brand color, gradient anchor, accent fills
  primary-gradient-from: "#ff7759"   # coral
  primary-gradient-mid: "#7670c5"    # periwinkle (gradient midpoint)
  primary-gradient-to: "#4c6ee6"     # blue (gradient end)
  on-primary: "#ffffff"          # text/icon on the gradient and dark pill
  dark: "#17171c"                # near-black — the real CTA pill bg & inverted bands
  canvas: "#ffffff"              # page background
  canvas-soft: "#f0eee9"         # warm cream section band
  surface: "#ffffff"             # card / panel surface
  surface-alt: "#f2f2f2"         # neutral grey chip / sunken fill / frosted nav
  ink: "#212121"                 # headings & body (warm near-black, dominant)
  ink-secondary: "#75758a"       # cool grey-purple — lede & secondary text
  ink-muted: "#93939f"           # muted captions
  ink-faint: "#a4a4a4"           # placeholder / fine print
  hairline: "#d9d9dd"            # 1px dividers & soft borders
  hairline-strong: "#000000"     # crisp black 1px outline on buttons & inputs
  # decorative accents — soft full-bleed section tints
  accent-lilac: "#f0dff3"        # signature soft lavender section background
  accent-mint: "#e5f4ef"         # soft mint section background
  accent-cream: "#f0eee9"        # warm off-white band
  accent-orchid: "#d18ee2"       # gradient mid / illustration accent
  accent-blue: "#4c6ee6"         # gradient end / illustration accent
  # semantic
  success: "#00754e"             # green — positive / confirmation text (used sparingly)

typography:
  display-1: { fontFamily: Inter, fontSize: 96px, fontWeight: 400, lineHeight: 1.0, letterSpacing: -1.92px }
  display-2: { fontFamily: Inter, fontSize: 60px, fontWeight: 400, lineHeight: 1.05, letterSpacing: -1.2px }
  heading-1: { fontFamily: Inter, fontSize: 48px, fontWeight: 400, lineHeight: 1.2, letterSpacing: -0.48px }
  heading-2: { fontFamily: Inter, fontSize: 36px, fontWeight: 400, lineHeight: 1.2, letterSpacing: -0.36px }
  heading-3: { fontFamily: Inter, fontSize: 32px, fontWeight: 400, lineHeight: 1.2, letterSpacing: -0.32px }
  title:     { fontFamily: Inter, fontSize: 24px, fontWeight: 400, lineHeight: 1.3, letterSpacing: normal }
  body-lg:   { fontFamily: Inter, fontSize: 18px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-md:   { fontFamily: Inter, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-sm:   { fontFamily: Inter, fontSize: 14px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  button:    { fontFamily: Inter, fontSize: 14px, fontWeight: 500, lineHeight: 1.71, letterSpacing: normal }
  caption:   { fontFamily: Inter, fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  eyebrow:   { fontFamily: Inter, fontSize: 12px, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0.4px, textTransform: uppercase }

rounded:
  xs: 2px        # inputs, segmented controls (crisp)
  sm: 4px        # most common — small cards, chips, tags
  md: 8px        # buttons, medium cards
  lg: 16px       # larger panels
  xl: 22px       # signature radius — feature cards & dropdown panels
  xxl: 32px      # large pill buttons
  full: 9999px   # pills, avatars, toggles

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 36px
  xxl: 48px

elevation:
  level-0: "none"
  level-1: "0 4px 12px rgba(0,0,0,0.20)"
  level-2: "0 32px 68px rgba(0,0,0,0.30)"

components:
  nav-bar:         { backgroundColor: "{colors.surface-alt}", backdropFilter: "blur(12px)", textColor: "{colors.ink}", typography: "{typography.body-md}", padding: "16px 24px" }
  button-primary:  { background: "{colors.dark}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "8px 24px 12px" }
  button-gradient: { background: "linear-gradient(78deg, #ff7759 0%, #7670c5 60%, #4c6ee6 90%)", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "8px 24px 12px" }
  button-secondary:{ background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline-strong}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "7px 23px 11px" }
  button-pill:     { background: "{colors.surface-alt}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "8px 18px" }
  card:            { backgroundColor: "{colors.surface}", rounded: "{rounded.xl}", border: "1px solid {colors.hairline}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:      { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline-strong}", rounded: "{rounded.xs}", typography: "{typography.body-md}", padding: "10px 14px" }
  badge-pill:      { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: "5px 12px" }
---

# Cohere — Design Language Analysis

Cohere's marketing system reads as deliberately *enterprise-serious*: a high-contrast, near-black-on-white canvas with almost no decorative chrome, where hierarchy is carried by scale and tracking rather than colour or weight. The brand's personality is held in reserve and released in two specific places — a vibrant coral→periwinkle→blue gradient used for hero moments, and a rotating set of soft pastel section tints (lavender, cream, mint) that keep long pages from feeling clinical. The result is a system that signals trust and restraint first, creativity second.

## Colour

The palette is fundamentally a neutral one. A single warm near-black, `#212121`, does the overwhelming majority of the work — it is the ink for virtually all headings and body copy (over 3,000 sampled instances). A cooler near-black, `#17171c`, is reserved for solid CTA pills and dark inverted bands, giving the buttons a subtly different temperature from the text. Secondary and muted text steps down through a cool grey-purple ramp (`#75758a` → `#93939f` → `#a4a4a4`) that leans very slightly violet, echoing the brand accents rather than going flat-grey.

Surfaces are white (`#ffffff`) with three recurring soft tints layered behind alternating sections: a signature lavender (`#f0dff3`), a warm cream (`#f0eee9`), and an occasional mint (`#e5f4ef`). These are wide, full-bleed background washes, never small fills. The one genuinely saturated colour, coral `#ff7759`, almost always appears as the anchor of a gradient — `linear-gradient(78deg, #ff7759, #7670c5, #4c6ee6)` — running warm-to-cool from coral through periwinkle to blue. Orchid (`#d18ee2`) and blue (`#4c6ee6`) recur as the gradient's companions and in illustration. Notably, links are *not* coloured — they stay ink-dark — so the saturated palette is purely expressive, never functional. A muted green (`#00754e`) shows up only for the rare confirmation/positive state. Borders split into two roles: soft `#d9d9dd` hairlines for dividers, and crisp pure-black `#000000` 1px outlines on interactive controls.

## Typography

The family is **Unica77 Cohere Web**, a custom-licensed neo-grotesque in the Haas Unica lineage; because it is proprietary the showcase substitutes **Inter** (Cohere's own declared fallback and the nearest free Google match), labelled as a substitute. The defining characteristic is that *weight is barely used to build hierarchy* — even the 96px hero headline ("Own your AI") is set at regular 400, not bold. Instead, hierarchy comes from dramatic size jumps (96 → 60 → 48 → 36 → 32 → 24px) paired with progressively tighter negative letter-spacing at the top end (−1.92px on the display, easing to normal by body sizes). The dominant body tier is 16px/400 at a 1.5 line-height — it accounts for nearly 4,000 sampled nodes — with 18px used for ledes and 14px for UI and buttons. Bold (700) appears only inline within body copy for emphasis. Buttons are the one place weight ticks up, to 500, and they carry a quietly distinctive *asymmetric* vertical padding (more below than above) that optically centres the grotesque's cap height.

## Shape & depth

Cohere is a flat system. Elevation level-0 — a 1px border, no shadow — is the default for cards and panels; shadows are reserved almost entirely for transient overlays (a soft `0 4px 12px rgba(0,0,0,.2)` on dropdowns, a deep `0 32px 68px rgba(0,0,0,.3)` on modals/large hovers). The radius scale is broad and a little idiosyncratic: a very common 4px on small elements, a crisp 2px on inputs and segmented controls, and a signature **22px** on feature cards and dropdown panels (often applied to only the bottom two corners, `0 0 22px 22px`, where a menu drops from a control). Primary and secondary buttons are full pills (`9999px`/32px). The combination — pill buttons, sharp 2px inputs, and soft 22px cards — is a recognisable part of the brand's fingerprint.

## Layout & responsive

The system sits on an 8px spacing rhythm (with a 4px half-step), composing into generously padded full-width sections separated by tint changes rather than rules. Content is centred in a roomy max-width container with large left/right gutters. The top navigation is a frosted, translucent `rgba(242,242,242,0.9)` bar with a blur, keeping the dark wordmark and nav links legible over whatever section scrolls beneath it. Headings scale down hard on smaller viewports (the 96px display collapses toward ~48px), multi-column card grids reflow from four to two to one, and the pill-button + outlined-input vocabulary stays constant across breakpoints so the interface reads identically on mobile and desktop.
