---
version: alpha
name: Off-White™ Analysis
description: >
  A stark gallery-white canvas wired with monospaced IBM Plex type and crisp
  black hairlines, punctuated by a single electric cobalt blue — an industrial,
  uppercase, almost-zero-radius system where a literary "Bookish" serif carries
  the prices like museum wall text.

colors:
  primary: "#0019e9"          # electric cobalt — links, section headers, the JOIN CTA, brand accents
  primary-active: "#0a20e8"   # hover/pressed blue
  on-primary: "#ffffff"       # text/icons on blue or black
  dark: "#000000"             # solid black buttons (ADD TO BAG) & inverted bands
  canvas: "#ffffff"           # page background (gallery white)
  canvas-soft: "#f5f5f5"      # off-tint section / module background
  surface: "#ffffff"          # card / panel surface (flat, borderless imagery)
  surface-alt: "#f4f2f2"      # warm-grey input fill / sunken chip
  ink: "#000000"              # headings & body — the workhorse
  ink-secondary: "#2d2d2d"    # strong secondary text
  ink-muted: "#6f6f6f"        # captions, meta, inactive nav
  ink-faint: "#a5a5a5"        # placeholder / disabled
  hairline: "#000000"         # 1px black rules & borders — a signature device
  hairline-soft: "#e6e6e6"    # quiet grey dividers between modules
  accent-sale: "#ff0000"      # SALE label & markdown pricing only

typography:
  display-1: { fontFamily: "IBM Plex Mono", fontSize: 40px, fontWeight: 500, lineHeight: 1.4, letterSpacing: -2px, textTransform: uppercase }
  heading-1: { fontFamily: "IBM Plex Mono", fontSize: 24px, fontWeight: 500, lineHeight: 1.17, letterSpacing: 0 }
  title:     { fontFamily: "IBM Plex Mono", fontSize: 16px, fontWeight: 500, lineHeight: 1.38, letterSpacing: 0 }
  body-lg:   { fontFamily: "IBM Plex Mono", fontSize: 16px, fontWeight: 400, lineHeight: 1.38, letterSpacing: 0 }
  body-md:   { fontFamily: "IBM Plex Mono", fontSize: 14px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }   # dominant tier
  button:    { fontFamily: "IBM Plex Mono", fontSize: 14px, fontWeight: 500, lineHeight: 1.5, letterSpacing: 0, textTransform: uppercase }
  body-sm:   { fontFamily: "IBM Plex Mono", fontSize: 12px, fontWeight: 400, lineHeight: 1.33, letterSpacing: 0 }
  caption:   { fontFamily: "IBM Plex Mono", fontSize: 11px, fontWeight: 400, lineHeight: 1.45, letterSpacing: 0 }
  eyebrow:   { fontFamily: "IBM Plex Mono", fontSize: 11px, fontWeight: 600, lineHeight: 1.45, letterSpacing: 0.3px, textTransform: uppercase }
  # editorial accent — proprietary "Bookish-Off-White" serif (substitute: Spectral)
  price:     { fontFamily: "Spectral", fontSize: 16px, fontWeight: 400, lineHeight: 1.38, letterSpacing: 0.48px }
  tag:       { fontFamily: "Spectral", fontSize: 14px, fontWeight: 400, lineHeight: 1.29, letterSpacing: 0.42px, textTransform: uppercase }

rounded:
  xs: 2px        # dominant — effectively square (buttons, chips, blue CTA)
  sm: 8px
  md: 10px
  lg: 20px       # the largest radius the site reaches (rare, pill toggles)
  full: 9999px   # circular icon hit-areas only

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px       # input padding, list-item rhythm
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"                                      # default — a 1px black/grey hairline does the work
  level-1: "0 0 2px 1px rgba(0,0,0,0.39)"             # tight contact glow on hovered media / floating UI
  level-2: "1px 2px 8px 0 rgba(0,0,0,0.35)"           # detached overlays (mini-cart, dropdowns)

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", textTransform: uppercase, divider: "1px solid {colors.hairline}", padding: 16px }
  button-primary: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.xs}", padding: "12px 16px" }
  button-dark:    { background: "{colors.dark}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.xs}", padding: "12px 16px" }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.ink}", typography: "{typography.button}", rounded: "{rounded.xs}", padding: "11px 16px" }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.xs}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}", titleType: "{typography.body-md}", priceType: "{typography.price}" }
  text-input:     { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink}", border: "none", focusBorder: "1px solid {colors.ink}", rounded: "0px", typography: "{typography.body-md}", padding: "12px" }
  badge-tag:      { background: "transparent", textColor: "{colors.ink}", typography: "{typography.tag}", note: "overlaid status label — NEW IN / EXCLUSIVE, set in the serif accent" }
  badge-solid:    { background: "{colors.dark}", textColor: "{colors.on-primary}", typography: "{typography.eyebrow}", rounded: "{rounded.xs}", padding: "0 9px", note: "discount / system chip, e.g. -25%" }
---

# Off-White™ — Design Language Analysis

Off-White's storefront is built like a piece of industrial signage rather than a typical luxury boutique. The page is a near-pure white gallery wall on which almost everything is set in **IBM Plex Mono** — a monospaced typeface — in **uppercase**, separated by **1px black hairlines**. There is essentially no rounding (the dominant radius is 2px, which reads as square) and almost no shadow; depth is implied by rules and whitespace, not elevation. Into this deliberately utilitarian grayscale the brand injects exactly one saturated color — an **electric cobalt blue (#0019e9)** — for links, section headers, and the primary community CTA. The result is the on-screen translation of Virgil Abloh's design vocabulary: engineering drawings, quotation marks, caution-tape pragmatism, and a literary serif used like a museum caption.

## Colour

The system is overwhelmingly monochrome. Black (`#000000`) is the single most common value on the page by a wide margin — it is simultaneously the body ink, the heading ink, the border color, and the dark button fill. Off it hang three greys forming a tight ramp: a strong secondary `#2d2d2d`, a workhorse muted grey `#6f6f6f` for meta and inactive navigation, and a faint `#a5a5a5` for placeholders. Surfaces are barely tinted — the page canvas is `#ffffff`, modules occasionally drop to `#f5f5f5`, and form fields sit on a warm `#f4f2f2`. Borders are not soft: the signature move is a crisp **black** hairline (`#000000`), with a quiet `#e6e6e6` reserved for low-priority dividers. Against all of this, **one** brand color does the emotional work — the cobalt `#0019e9` (with a near-identical `#0a20e8` for the pressed state) appears on links, the "JOIN THE OFF-WHITE™ COMMUNITY" header, and the blue sign-up button. A second accent, pure **red `#ff0000`**, is rationed strictly to SALE labelling and markdown prices. No gradients appear anywhere — every fill is flat.

## Typography

Two families carry the entire identity. The dominant one is **IBM Plex Mono** (loaded as `IBMPlexMono-Regular` and `-Medium`) — a monospaced grotesque used for navigation, headings, body copy, buttons and micro-labels alike. Because it is on Google Fonts, the showcase renders it natively with no substitution. Hierarchy is built less through dramatic size jumps than through **case, weight and tracking**: the masthead "OFF-WHITE" is 40px / 500 with an aggressive −2px letter-spacing, section headers are 24px / 500 (often in blue), and the overwhelming majority of the page is a single calm tier of **14px / 400 at 1.5 line-height**. Weight 500 plus uppercase is the entire button language. The second family is the proprietary **"Bookish-Off-White"** — a high-contrast literary serif — used sparingly and pointedly for **prices** (16px, +0.48px tracking) and product status tags like *NEW IN* / *EXCLUSIVE*. That serif is the one warm, editorial gesture in an otherwise mechanical type system; since it is licensed, the showcase substitutes the nearest Google serif, **Spectral**, and labels it as a stand-in.

## Shape & depth

This is a deliberately hard-edged system. The radius histogram is dominated by **2px** — present on roughly ten times more elements than any other value — which at a glance reads as fully squared. Larger radii barely exist: 8px and 10px appear on a handful of controls, 20px shows up only on the rare pill toggle, and true circles are reserved for icon hit-areas. Elevation is just as restrained. The default state is **flat with a hairline** — no shadow at all — and the brand leans on borders and negative space to separate content. Where shadow does appear it is purposeful and tight: a `0 0 2px 1px rgba(0,0,0,0.39)` contact glow on hovered media, and a slightly softer `1px 2px 8px rgba(0,0,0,0.35)` for genuinely detached overlays like the mini-cart. Nothing floats decoratively.

## Layout & responsive

Spacing follows a tight, roughly **4px-based** rhythm — 12px is the canonical input padding and list-item gap, scaling up through 16 / 24 / 32 / 48 for module separation. The home page is organized as full-bleed editorial media stacked above a dense product grid, with the catalog typically running a four-up grid of square, borderless product images, each captioned by a monospace title and a serif price beneath. The shell is a centered max-width container with generous side gutters. On narrower viewports the four-up grid collapses to two-up and then toward a single column, the uppercase mega-navigation condenses into a drawer, and type sizes hold largely constant — the design keeps its industrial 14px monospace body across breakpoints rather than fluidly scaling, preserving the catalog-like, utilitarian feel on mobile.
