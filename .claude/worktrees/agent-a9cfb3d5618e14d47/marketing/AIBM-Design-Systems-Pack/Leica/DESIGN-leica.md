---
version: alpha
name: Leica Camera Analysis
description: >
  A near-monochrome system of warm-black ink on white and pale-grey bands,
  built almost entirely with one geometric sans in light and regular weights —
  hierarchy comes from size, never boldness — with the single saturated note,
  Leica's signature red, held in reserve for the brand mark.

colors:
  primary: "#e20612"          # Leica red — the iconic red dot / brand mark & accents
  on-primary: "#ffffff"       # text/icon on dark CTAs
  dark: "#222222"             # the actual primary CTA button & inverted bands
  dark-hover: "#333333"       # pressed/hover on dark surfaces
  canvas: "#ffffff"           # page background
  canvas-soft: "#f5f5f5"      # off-white section bands (most frequent surface)
  surface: "#ffffff"          # card/panel surface
  surface-alt: "#e7e7e7"      # sunken fill / chip
  ink: "#222222"              # headings & body text (warm near-black)
  ink-secondary: "#6c6c6c"    # secondary / supporting text
  ink-muted: "#9a9999"        # input underlines, low-emphasis labels
  ink-faint: "#b5b4b4"        # placeholders / faint captions
  hairline: "#d1d1d1"         # 1px borders & dividers
  # No semantic status palette surfaced on the homepage; red doubles as the only accent.

typography:
  display-1: { fontFamily: Outfit, fontSize: 68px, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0 }
  display-2: { fontFamily: Outfit, fontSize: 48px, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0 }
  heading-1: { fontFamily: Outfit, fontSize: 40px, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0 }
  heading-2: { fontFamily: Outfit, fontSize: 24px, fontWeight: 400, lineHeight: 1.33, letterSpacing: 0 }
  heading-3: { fontFamily: Outfit, fontSize: 20px, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0 }
  title:     { fontFamily: Outfit, fontSize: 20px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0 }
  body-lg:   { fontFamily: Outfit, fontSize: 18px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  body-lg-light: { fontFamily: Outfit, fontSize: 18px, fontWeight: 300, lineHeight: 1.5, letterSpacing: 0 }
  body-md:   { fontFamily: Outfit, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  body-md-light: { fontFamily: Outfit, fontSize: 16px, fontWeight: 300, lineHeight: 1.4, letterSpacing: 0 }
  body-sm:   { fontFamily: Outfit, fontSize: 14px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  button:    { fontFamily: Outfit, fontSize: 16px, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0 }
  caption:   { fontFamily: Outfit, fontSize: 12px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  eyebrow:   { fontFamily: Outfit, fontSize: 12px, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0.4px, textTransform: uppercase }

rounded:
  xs: 1px      # input edges — effectively square
  sm: 4px      # small controls
  md: 8px      # standard panels
  lg: 24px     # large media cards / feature tiles
  full: 9999px # pills & circular avatars

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"                                                   # default — 1px hairline only
  level-1: "4px 4px 8px 0 rgba(34,34,34,0.2)"                       # card / media hover lift
  level-2: "0 8px 24px rgba(34,34,34,0.12)"                         # popovers / overlays (extrapolated)
  underline: "0 2px 0 -1px #9a9999"                                 # text-input baseline rule

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", overHeroTextColor: "{colors.on-primary}", typography: "{typography.body-md}", padding: 16px 40px }
  button-primary: { background: "{colors.dark}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 14px 24px }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.ink}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 13px 23px }
  button-pill:    { background: "{colors.surface-alt}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 11px 18px }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:     { background: "transparent", textColor: "{colors.ink}", underline: "{elevation.underline}", rounded: "{rounded.xs}", padding: "12px 8px", typography: "{typography.title}" }
  badge-pill:     { background: "{colors.canvas}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", shadow: "0 1px 2px rgba(0,0,0,0.1)" }
---

# Leica Camera — Design Language Analysis

Leica's site is a study in restraint. It reads like the cameras it sells: precise, quiet, and confident enough to let the product photography carry the page. There is no decoration competing for attention — the entire interface is warm-black text on white, broken by pale grey bands, with the famous red dot as the only spot of colour anywhere on the screen. The personality is "premium German optics": engineered, minimal, and unhurried.

## Colour

The palette is essentially greyscale. Body text is a warm near-black `#222222` (the single most common value on the page by a wide margin), supported by a tight ink ramp — `#6c6c6c` for secondary copy, `#9a9999` for input rules and low-emphasis labels, `#b5b4b4` for placeholders. Backgrounds alternate between pure white (`#ffffff`) and a soft `#f5f5f5` used to separate full-width sections without drawing a single hard line; where lines are needed, a `#d1d1d1` hairline does the job. The one saturated colour in the whole system is Leica red, `#e20612`, and the brand uses it with discipline: it appears in the logo's red dot and the occasional accent, never as a button fill or a background wash. Primary calls-to-action are instead a solid dark `#222222` rectangle — the colour does the talking by staying out of the way.

## Typography

The site runs almost entirely on **Outfit**, a geometric sans (available on Google Fonts, so it renders natively here with no substitution). What's distinctive is the weight discipline: the dominant text pairs are 18px/400 and 18px/300 — light and regular — and even the 68px hero headlines and 48px section titles are set at weight 400, not bold. Hierarchy is built from size and whitespace rather than heaviness, which is exactly what gives the pages their calm, editorial feel. A short scale carries everything: 68 → 48 → 40 → 24 → 20 for display and headings, an 18px large body as the workhorse paragraph, 16px and 14px supporting tiers, and a 12px uppercase eyebrow. Letter-spacing stays at normal across the board — no tightened display tracking.

## Shape & depth

Geometry is sharp. Inputs sit at a 1px radius (effectively square) and rely on a single grey baseline rule rather than a boxed border. Small controls use a modest 4–8px radius, while large media and feature cards round to 24px, and pills/avatars go fully round at 9999px. Depth is almost absent by default — cards live flat on the page bordered only by a hairline (level 0). On hover, media tiles lift with a soft directional shadow (`4px 4px 8px rgba(34,34,34,0.2)`), and overlays would extend that to a deeper, centred shadow. The result is a flat, paper-like surface that animates only on interaction.

## Layout & responsive

Spacing follows an 8px base (with a 4px half-step), stepping 8 / 12 / 16 / 24 / 32 / 48 for component padding and section rhythm; content is centred in a wide max-width container with generous 40px gutters on desktop. Full-bleed hero imagery anchors the top of the page with white overlaid type, followed by alternating white and `#f5f5f5` content bands. The grid is multi-column for product and blog tiles on desktop and collapses progressively — four columns to two on tablet, toward a single stacked column on mobile — while the hero type scales down and the navigation folds into a menu trigger.
